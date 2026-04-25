-- ============================================================
-- 1) Tipologias por obra
-- ============================================================
CREATE TABLE public.project_unit_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE INDEX idx_unit_types_project ON public.project_unit_types(project_id);
CREATE INDEX idx_unit_types_company ON public.project_unit_types(company_id);

ALTER TABLE public.project_unit_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view unit types"
ON public.project_unit_types FOR SELECT TO authenticated
USING (company_id = public.get_my_company_id());

CREATE POLICY "Company members can insert unit types"
ON public.project_unit_types FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Company members can update unit types"
ON public.project_unit_types FOR UPDATE TO authenticated
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Company members can delete unit types"
ON public.project_unit_types FOR DELETE TO authenticated
USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_unit_types_updated_at
BEFORE UPDATE ON public.project_unit_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) Capacidades por tipologia (uma linha por unidade física)
-- ============================================================
CREATE TABLE public.project_unit_capacities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_type_id UUID NOT NULL REFERENCES public.project_unit_types(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  project_id UUID NOT NULL,
  unit_label TEXT NOT NULL,    -- ex: "Metro Quadrado"
  unit_symbol TEXT NOT NULL,   -- ex: "m²"
  capacity_value NUMERIC(14,4) NOT NULL CHECK (capacity_value > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(unit_type_id, unit_symbol)
);

CREATE INDEX idx_unit_capacities_type ON public.project_unit_capacities(unit_type_id);
CREATE INDEX idx_unit_capacities_project ON public.project_unit_capacities(project_id);

ALTER TABLE public.project_unit_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view capacities"
ON public.project_unit_capacities FOR SELECT TO authenticated
USING (company_id = public.get_my_company_id());

CREATE POLICY "Company members can insert capacities"
ON public.project_unit_capacities FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Company members can update capacities"
ON public.project_unit_capacities FOR UPDATE TO authenticated
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Company members can delete capacities"
ON public.project_unit_capacities FOR DELETE TO authenticated
USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_unit_capacities_updated_at
BEFORE UPDATE ON public.project_unit_capacities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) Vincular cada casa a uma tipologia
-- ============================================================
ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS unit_type_id UUID REFERENCES public.project_unit_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_houses_unit_type ON public.houses(unit_type_id);

-- ============================================================
-- 4) Função para retornar capacidade da casa em uma unidade
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_house_capacity(
  p_house_id UUID,
  p_unit_symbol TEXT
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.capacity_value
  FROM houses h
  JOIN project_unit_capacities pc ON pc.unit_type_id = h.unit_type_id
  WHERE h.id = p_house_id
    AND lower(pc.unit_symbol) = lower(p_unit_symbol)
  LIMIT 1;
$$;

-- ============================================================
-- 5) Validador de capacidade — bloqueia se exceder
-- Recebe arrays paralelos de house_id e quantidade já distribuída por casa.
-- Para o caso atual (qty total dividida igualmente entre casas), usamos qty_per_house = qty/N.
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_production_capacity(
  p_project_id UUID,
  p_house_numbers INTEGER[],
  p_scope_id TEXT,
  p_macro_id TEXT,
  p_quantity NUMERIC,
  p_unit_symbol TEXT,
  p_exclude_weekly_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house_count INTEGER;
  v_qty_per_house NUMERIC;
  v_house_num INTEGER;
  v_house_id UUID;
  v_capacity NUMERIC;
  v_already_executed NUMERIC;
  v_total NUMERIC;
  v_unit_type_id UUID;
BEGIN
  -- Sem casas, nada a validar
  IF p_house_numbers IS NULL OR array_length(p_house_numbers, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Sem unidade física conhecida, não validamos (verba/%/un não fazem sentido)
  IF p_unit_symbol IS NULL OR lower(p_unit_symbol) NOT IN ('m²','m2','m³','m3','m','ml') THEN
    RETURN;
  END IF;

  v_house_count := array_length(p_house_numbers, 1);
  v_qty_per_house := COALESCE(p_quantity, 0) / NULLIF(v_house_count, 0);

  IF v_qty_per_house <= 0 THEN
    RETURN;
  END IF;

  FOREACH v_house_num IN ARRAY p_house_numbers LOOP
    -- Resolve UUID da casa
    SELECT id, unit_type_id INTO v_house_id, v_unit_type_id
    FROM houses
    WHERE project_id = p_project_id AND house_number = v_house_num
    LIMIT 1;

    -- Casa sem tipologia → ignora (não bloqueia legacy)
    IF v_house_id IS NULL OR v_unit_type_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Capacidade configurada para esta unidade?
    v_capacity := public.get_house_capacity(v_house_id, p_unit_symbol);
    IF v_capacity IS NULL THEN
      CONTINUE; -- unidade não cadastrada para a tipologia
    END IF;

    -- Soma já lançada para esta casa NESTE escopo nesta unidade (excluindo o registro em edição)
    SELECT COALESCE(SUM(
      COALESCE(wp.quantity, 0) /
      NULLIF(array_length(wp.house_ids, 1), 0)
    ), 0) INTO v_already_executed
    FROM weekly_productions wp
    WHERE wp.project_id = p_project_id
      AND wp.scope_id = p_scope_id
      AND wp.macro_id = p_macro_id
      AND v_house_num = ANY(wp.house_ids)
      AND lower(COALESCE(wp.unit_symbol,'')) = lower(p_unit_symbol)
      AND wp.deleted_at IS NULL
      AND (p_exclude_weekly_id IS NULL OR wp.id <> p_exclude_weekly_id);

    v_total := v_already_executed + v_qty_per_house;

    IF v_total > v_capacity + 0.0001 THEN
      RAISE EXCEPTION
        'Capacidade excedida na Casa %: % % lançado + % % novo = % % (capacidade da tipologia: % %).',
        v_house_num,
        v_already_executed, p_unit_symbol,
        v_qty_per_house, p_unit_symbol,
        v_total, p_unit_symbol,
        v_capacity, p_unit_symbol
      USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 6) Trigger no weekly_productions chamando o validador
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_validate_capacity_weekly()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft delete não valida
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.validate_production_capacity(
    NEW.project_id,
    NEW.house_ids,
    NEW.scope_id,
    NEW.macro_id,
    NEW.quantity,
    NEW.unit_symbol,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_productions_capacity ON public.weekly_productions;
CREATE TRIGGER trg_weekly_productions_capacity
BEFORE INSERT OR UPDATE ON public.weekly_productions
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_capacity_weekly();