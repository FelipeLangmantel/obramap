
-- 1. Adicionar capacidade em casas/mês nas fábricas
ALTER TABLE public.ind_factories
  ADD COLUMN IF NOT EXISTS capacity_houses_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_per_house NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ind_factories.capacity_houses_month IS
  'Capacidade máxima de casas completas por mês que esta fábrica consegue entregar';
COMMENT ON COLUMN public.ind_factories.price_per_house IS
  'Preço por casa completa praticado por esta fábrica (R$)';

-- 2. Tabela de grade de planejamento quinzenal
CREATE TABLE IF NOT EXISTS public.ind_planning_grid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  fortnight INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  planned_houses INTEGER NOT NULL DEFAULT 0,
  actual_houses INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(context_id, factory_id, year, month, fortnight)
);

CREATE OR REPLACE FUNCTION public.validate_ind_planning_grid()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.month < 1 OR NEW.month > 12 THEN
    RAISE EXCEPTION 'month must be between 1 and 12';
  END IF;
  IF NEW.fortnight NOT IN (1, 2) THEN
    RAISE EXCEPTION 'fortnight must be 1 or 2';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_ind_planning_grid
  BEFORE INSERT OR UPDATE ON public.ind_planning_grid
  FOR EACH ROW EXECUTE FUNCTION public.validate_ind_planning_grid();

ALTER TABLE public.ind_planning_grid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ind_planning_grid_company" ON public.ind_planning_grid
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_planning_grid_context
  ON public.ind_planning_grid(context_id, year, month, fortnight);

CREATE INDEX IF NOT EXISTS idx_planning_grid_factory
  ON public.ind_planning_grid(factory_id, year, month);

GRANT ALL ON public.ind_planning_grid TO authenticated;

-- 3. RPC: buscar a grade de planejamento de uma obra
CREATE OR REPLACE FUNCTION public.get_ind_planning_grid(p_context_id UUID)
RETURNS TABLE (
  factory_id UUID,
  factory_name TEXT,
  capacity_month INTEGER,
  price_per_house NUMERIC,
  advance_pct NUMERIC,
  year INTEGER,
  month INTEGER,
  fortnight INTEGER,
  start_date DATE,
  end_date DATE,
  planned_houses INTEGER,
  actual_houses INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.capacity_houses_month,
    f.price_per_house,
    f.advance_payment_pct,
    g.year,
    g.month,
    g.fortnight,
    g.start_date,
    g.end_date,
    g.planned_houses,
    g.actual_houses
  FROM public.ind_planning_grid g
  JOIN public.ind_factories f ON f.id = g.factory_id
  WHERE g.context_id = p_context_id
  ORDER BY g.year, g.month, g.fortnight, f.name;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_ind_planning_grid(UUID) TO authenticated;
