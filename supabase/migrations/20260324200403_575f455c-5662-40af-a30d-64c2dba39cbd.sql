
-- 1. Link PLE to obras_portfolio
ALTER TABLE public.ple_projects
  ADD COLUMN IF NOT EXISTS obras_portfolio_id UUID
    REFERENCES public.obras_portfolio(id) ON DELETE SET NULL;

-- 2. Link obras_portfolio to ObraMap projects
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS obramap_project_id UUID
    REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_houses INTEGER NOT NULL DEFAULT 0;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_ple_projects_obras_portfolio
  ON public.ple_projects(obras_portfolio_id)
  WHERE obras_portfolio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_obras_portfolio_obramap_project
  ON public.obras_portfolio(obramap_project_id)
  WHERE obramap_project_id IS NOT NULL;

-- 4. RPC to fetch Holding data for PLE pre-fill
CREATE OR REPLACE FUNCTION public.get_ple_from_holding(p_obras_portfolio_id UUID)
RETURNS TABLE (
  nome TEXT,
  num_contrato TEXT,
  empresa TEXT,
  valor_contrato NUMERIC,
  total_houses INTEGER,
  data_inicio DATE,
  obramap_project_id UUID,
  obramap_project_name TEXT,
  obramap_total_houses INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.nome,
    op.num_contrato,
    op.empresa,
    op.valor_contrato,
    op.total_houses,
    op.data_inicio,
    op.obramap_project_id,
    p.name,
    p.total_houses
  FROM obras_portfolio op
  LEFT JOIN projects p ON p.id = op.obramap_project_id
  WHERE op.id = p_obras_portfolio_id
    AND op.company_id = get_my_company_id();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ple_from_holding(UUID) TO authenticated;
