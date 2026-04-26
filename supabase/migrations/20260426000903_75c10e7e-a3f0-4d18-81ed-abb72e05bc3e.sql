
-- 1) Tabela: capacidade padrão por serviço (1 valor que vale para todas casas)
CREATE TABLE IF NOT EXISTS public.service_default_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_id text NOT NULL,
  scope_name text,
  unit_label text NOT NULL,
  unit_symbol text NOT NULL,
  capacity_value numeric NOT NULL CHECK (capacity_value > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_sdc_project ON public.service_default_capacities(project_id);
CREATE INDEX IF NOT EXISTS idx_sdc_scope ON public.service_default_capacities(project_id, scope_id);

ALTER TABLE public.service_default_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdc_company_select" ON public.service_default_capacities
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "sdc_company_insert" ON public.service_default_capacities
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "sdc_company_update" ON public.service_default_capacities
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "sdc_company_delete" ON public.service_default_capacities
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_sdc_updated_at
  BEFORE UPDATE ON public.service_default_capacities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Tabela: capacidade fina por serviço × casa (ajuste opcional)
CREATE TABLE IF NOT EXISTS public.service_house_capacities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_id text NOT NULL,
  house_number integer NOT NULL,
  unit_label text NOT NULL,
  unit_symbol text NOT NULL,
  capacity_value numeric NOT NULL CHECK (capacity_value > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scope_id, house_number)
);

CREATE INDEX IF NOT EXISTS idx_shc_project ON public.service_house_capacities(project_id);
CREATE INDEX IF NOT EXISTS idx_shc_scope ON public.service_house_capacities(project_id, scope_id);
CREATE INDEX IF NOT EXISTS idx_shc_lookup ON public.service_house_capacities(project_id, scope_id, house_number);

ALTER TABLE public.service_house_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shc_company_select" ON public.service_house_capacities
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "shc_company_insert" ON public.service_house_capacities
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "shc_company_update" ON public.service_house_capacities
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "shc_company_delete" ON public.service_house_capacities
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE TRIGGER trg_shc_updated_at
  BEFORE UPDATE ON public.service_house_capacities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Atualiza trigger de validação para usar a nova matriz por serviço×casa
CREATE OR REPLACE FUNCTION public.validate_production_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house_count int;
  v_qty_per_house numeric;
  v_house_num int;
  v_capacity numeric;
  v_already numeric;
  v_total numeric;
  v_unit_symbol text;
  v_unit_label text;
BEGIN
  -- Só valida quando há quantidade física informada
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_unit_symbol := COALESCE(NEW.unit_symbol, '');
  v_unit_label := COALESCE(NEW.unit_label, '');

  -- Apenas unidades físicas precisam de validação de capacidade
  IF v_unit_symbol NOT IN ('m²','m2','m³','m3','m','ml') THEN
    RETURN NEW;
  END IF;

  v_house_count := COALESCE(array_length(NEW.house_ids, 1), 0);
  IF v_house_count = 0 THEN
    RETURN NEW;
  END IF;

  v_qty_per_house := NEW.quantity / v_house_count;

  FOREACH v_house_num IN ARRAY NEW.house_ids LOOP
    -- Busca capacidade específica da casa, se não houver usa o default do serviço
    SELECT capacity_value INTO v_capacity
    FROM public.service_house_capacities
    WHERE project_id = NEW.project_id
      AND scope_id = NEW.scope_id
      AND house_number = v_house_num
      AND unit_symbol = v_unit_symbol
    LIMIT 1;

    IF v_capacity IS NULL THEN
      SELECT capacity_value INTO v_capacity
      FROM public.service_default_capacities
      WHERE project_id = NEW.project_id
        AND scope_id = NEW.scope_id
        AND unit_symbol = v_unit_symbol
      LIMIT 1;
    END IF;

    -- Sem capacidade configurada: não bloqueia (compatibilidade)
    IF v_capacity IS NULL THEN
      CONTINUE;
    END IF;

    -- Soma o que já foi lançado para essa casa nesse serviço/unidade
    SELECT COALESCE(SUM(
      wp.quantity / NULLIF(array_length(wp.house_ids, 1), 0)
    ), 0)
      INTO v_already
    FROM public.weekly_productions wp
    WHERE wp.project_id = NEW.project_id
      AND wp.scope_id = NEW.scope_id
      AND wp.unit_symbol = v_unit_symbol
      AND wp.deleted_at IS NULL
      AND v_house_num = ANY(wp.house_ids)
      AND (TG_OP = 'INSERT' OR wp.id <> NEW.id);

    v_total := v_already + v_qty_per_house;

    IF v_total > v_capacity + 0.001 THEN
      RAISE EXCEPTION
        'Capacidade excedida na Casa %: % % já lançado + % % novo = % % (limite: % %)',
        v_house_num,
        round(v_already::numeric, 2), v_unit_symbol,
        round(v_qty_per_house::numeric, 2), v_unit_symbol,
        round(v_total::numeric, 2), v_unit_symbol,
        v_capacity, v_unit_symbol;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
