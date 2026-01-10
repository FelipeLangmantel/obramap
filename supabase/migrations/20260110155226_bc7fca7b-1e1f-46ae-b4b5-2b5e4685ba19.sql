-- ============================================================
-- FASE 13.2 — ATUALIZAÇÃO DA TABELA planning_periods
-- Adiciona colunas: name, global_target_percent, status
-- ============================================================

-- Adicionar novas colunas se não existirem
ALTER TABLE public.planning_periods 
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS global_target_percent numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS target_revenue_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS planned_cost_total numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS projected_result numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'planned';

-- Índices (se não existirem)
CREATE INDEX IF NOT EXISTS idx_planning_periods_company
  ON public.planning_periods(company_id);

CREATE INDEX IF NOT EXISTS idx_planning_periods_project
  ON public.planning_periods(project_id);

CREATE INDEX IF NOT EXISTS idx_planning_periods_status
  ON public.planning_periods(status);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_planning_periods_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planning_periods_updated_at ON public.planning_periods;
CREATE TRIGGER trg_planning_periods_updated_at
BEFORE UPDATE ON public.planning_periods
FOR EACH ROW
EXECUTE FUNCTION public.set_planning_periods_updated_at();

-- RLS já habilitado, adicionar políticas
DROP POLICY IF EXISTS "Users can view planning periods of their company" ON public.planning_periods;
CREATE POLICY "Users can view planning periods of their company"
ON public.planning_periods FOR SELECT
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can manage planning periods of their company" ON public.planning_periods;
CREATE POLICY "Users can manage planning periods of their company"
ON public.planning_periods FOR ALL
USING (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.user_id = auth.uid()
  )
);