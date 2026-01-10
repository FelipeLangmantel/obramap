-- =============================================
-- FASE 7A: SIMULADOR DE PLANEJAMENTO DE LONGO PRAZO
-- =============================================

-- 1) Ajustar planning_versions (adicionar company_id se não existir)
ALTER TABLE public.planning_versions
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Atualizar company_id baseado no projeto
UPDATE public.planning_versions pv
SET company_id = p.company_id
FROM public.projects p
WHERE pv.project_id = p.id
  AND pv.company_id IS NULL;

-- Tornar company_id NOT NULL após população
ALTER TABLE public.planning_versions
ALTER COLUMN company_id SET NOT NULL;

-- 2) Criar tabela planning_periods (períodos de medição simulados)
CREATE TABLE IF NOT EXISTS public.planning_periods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  planning_version_id uuid NOT NULL REFERENCES public.planning_versions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  period_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  
  -- Financeiro
  contract_percent numeric NOT NULL DEFAULT 0,
  revenue_expected numeric NOT NULL DEFAULT 0,
  revenue_target numeric NOT NULL DEFAULT 0,
  planned_cost_estimate numeric NOT NULL DEFAULT 0,
  financial_balance_estimate numeric NOT NULL DEFAULT 0,
  
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT planning_periods_unique_version_number UNIQUE (planning_version_id, period_number)
);

-- 3) Criar tabela planning_services (serviços simulados por período)
CREATE TABLE IF NOT EXISTS public.planning_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  planning_period_id uuid NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  scope_id text NOT NULL,
  scope_name text NOT NULL,
  macro_id text NOT NULL,
  macro_name text NOT NULL,
  macro_color text NOT NULL DEFAULT '#6b7280',
  
  planned_houses integer NOT NULL DEFAULT 0,
  planned_house_ids integer[] NOT NULL DEFAULT '{}',
  estimated_cost numeric NOT NULL DEFAULT 0,
  productivity_expected numeric NOT NULL DEFAULT 0,
  teams_expected integer NOT NULL DEFAULT 1,
  professionals_per_team integer NOT NULL DEFAULT 1,
  helpers_per_team integer NOT NULL DEFAULT 0,
  
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Índices de performance
CREATE INDEX IF NOT EXISTS idx_planning_periods_version ON public.planning_periods(planning_version_id);
CREATE INDEX IF NOT EXISTS idx_planning_periods_company_project ON public.planning_periods(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_planning_periods_dates ON public.planning_periods(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_planning_services_period ON public.planning_services(planning_period_id);
CREATE INDEX IF NOT EXISTS idx_planning_services_company_project ON public.planning_services(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_planning_services_scope ON public.planning_services(scope_id, macro_id);

-- 5) Função para calcular valores financeiros do período
CREATE OR REPLACE FUNCTION public.recalculate_planning_period_financials(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project_id uuid;
  v_contract_value numeric;
  v_cost_target_percent numeric;
  v_contract_percent numeric;
  v_total_cost numeric;
  v_revenue_expected numeric;
  v_revenue_target numeric;
BEGIN
  -- Buscar dados do período
  SELECT project_id, contract_percent
  INTO v_project_id, v_contract_percent
  FROM planning_periods
  WHERE id = p_period_id;

  -- Buscar dados do contrato
  SELECT 
    COALESCE(contract_value_total, 0),
    COALESCE(cost_target_percent, 0.68)
  INTO v_contract_value, v_cost_target_percent
  FROM project_contracts
  WHERE project_id = v_project_id;

  -- Somar custos estimados dos serviços
  SELECT COALESCE(SUM(estimated_cost), 0)
  INTO v_total_cost
  FROM planning_services
  WHERE planning_period_id = p_period_id;

  -- Calcular valores financeiros
  v_revenue_expected := v_contract_value * (v_contract_percent / 100);
  v_revenue_target := v_revenue_expected * v_cost_target_percent;

  -- Atualizar período
  UPDATE planning_periods
  SET 
    revenue_expected = v_revenue_expected,
    revenue_target = v_revenue_target,
    planned_cost_estimate = v_total_cost,
    financial_balance_estimate = v_revenue_target - v_total_cost,
    updated_at = now()
  WHERE id = p_period_id;
END;
$$;

-- 6) Trigger para recalcular período quando serviços mudarem
CREATE OR REPLACE FUNCTION public.trigger_sync_planning_period_from_services()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_period_id := OLD.planning_period_id;
  ELSE
    v_period_id := NEW.planning_period_id;
  END IF;

  IF v_period_id IS NOT NULL THEN
    PERFORM public.recalculate_planning_period_financials(v_period_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_planning_period_from_services ON public.planning_services;

CREATE TRIGGER trigger_sync_planning_period_from_services
AFTER INSERT OR UPDATE OF estimated_cost OR DELETE ON public.planning_services
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_planning_period_from_services();

-- 7) Trigger para recalcular quando contract_percent mudar
CREATE OR REPLACE FUNCTION public.trigger_recalc_period_on_contract_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contract_percent IS DISTINCT FROM OLD.contract_percent THEN
    PERFORM public.recalculate_planning_period_financials(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalc_period_on_contract_change ON public.planning_periods;

CREATE TRIGGER trigger_recalc_period_on_contract_change
AFTER UPDATE OF contract_percent ON public.planning_periods
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_period_on_contract_change();

-- 8) Função para clonar versão de planejamento
CREATE OR REPLACE FUNCTION public.clone_planning_version(
  p_source_version_id uuid,
  p_new_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_version_id uuid;
  v_project_id uuid;
  v_company_id uuid;
  v_new_version_number integer;
BEGIN
  -- Buscar dados da versão origem
  SELECT project_id, company_id INTO v_project_id, v_company_id
  FROM planning_versions
  WHERE id = p_source_version_id;

  -- Próximo número de versão
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_new_version_number
  FROM planning_versions
  WHERE project_id = v_project_id;

  -- Criar nova versão
  INSERT INTO planning_versions (project_id, company_id, name, version_number, is_active)
  VALUES (v_project_id, v_company_id, p_new_name, v_new_version_number, false)
  RETURNING id INTO v_new_version_id;

  -- Clonar períodos
  INSERT INTO planning_periods (
    planning_version_id, company_id, project_id, period_number, 
    start_date, end_date, contract_percent, revenue_expected, 
    revenue_target, planned_cost_estimate, financial_balance_estimate, notes
  )
  SELECT 
    v_new_version_id, company_id, project_id, period_number,
    start_date, end_date, contract_percent, revenue_expected,
    revenue_target, planned_cost_estimate, financial_balance_estimate, notes
  FROM planning_periods
  WHERE planning_version_id = p_source_version_id;

  -- Clonar serviços (vinculando aos novos períodos)
  INSERT INTO planning_services (
    planning_period_id, company_id, project_id, scope_id, scope_name,
    macro_id, macro_name, macro_color, planned_houses, planned_house_ids,
    estimated_cost, productivity_expected, teams_expected, 
    professionals_per_team, helpers_per_team, notes
  )
  SELECT 
    np.id, ps.company_id, ps.project_id, ps.scope_id, ps.scope_name,
    ps.macro_id, ps.macro_name, ps.macro_color, ps.planned_houses, ps.planned_house_ids,
    ps.estimated_cost, ps.productivity_expected, ps.teams_expected,
    ps.professionals_per_team, ps.helpers_per_team, ps.notes
  FROM planning_services ps
  JOIN planning_periods op ON op.id = ps.planning_period_id
  JOIN planning_periods np ON np.planning_version_id = v_new_version_id 
                           AND np.period_number = op.period_number
  WHERE op.planning_version_id = p_source_version_id;

  RETURN v_new_version_id;
END;
$$;

-- 9) Função para obter resumo financeiro da versão
CREATE OR REPLACE FUNCTION public.get_planning_version_summary(p_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'version_id', pv.id,
    'version_name', pv.name,
    'version_number', pv.version_number,
    'is_active', pv.is_active,
    'project_id', pv.project_id,
    'totals', (
      SELECT jsonb_build_object(
        'total_periods', COUNT(*),
        'total_contract_percent', COALESCE(SUM(contract_percent), 0),
        'total_revenue_expected', COALESCE(SUM(revenue_expected), 0),
        'total_revenue_target', COALESCE(SUM(revenue_target), 0),
        'total_planned_cost', COALESCE(SUM(planned_cost_estimate), 0),
        'total_financial_balance', COALESCE(SUM(financial_balance_estimate), 0),
        'first_period_date', MIN(start_date),
        'last_period_date', MAX(end_date)
      )
      FROM planning_periods
      WHERE planning_version_id = pv.id
    ),
    'periods', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'period_id', pp.id,
          'period_number', pp.period_number,
          'start_date', pp.start_date,
          'end_date', pp.end_date,
          'contract_percent', pp.contract_percent,
          'revenue_expected', pp.revenue_expected,
          'revenue_target', pp.revenue_target,
          'planned_cost', pp.planned_cost_estimate,
          'financial_balance', pp.financial_balance_estimate,
          'services_count', (SELECT COUNT(*) FROM planning_services WHERE planning_period_id = pp.id),
          'total_houses', (SELECT COALESCE(SUM(planned_houses), 0) FROM planning_services WHERE planning_period_id = pp.id)
        ) ORDER BY pp.period_number
      )
      FROM planning_periods pp
      WHERE pp.planning_version_id = pv.id
    )
  )
  INTO v_result
  FROM planning_versions pv
  WHERE pv.id = p_version_id;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'Versão não encontrada'));
END;
$$;

-- 10) RLS — multiempresa

-- planning_versions (ajustar políticas existentes)
DROP POLICY IF EXISTS "Authenticated users can view planning_versions" ON public.planning_versions;
DROP POLICY IF EXISTS "Editors can manage planning_versions" ON public.planning_versions;

CREATE POLICY "System admin full access on planning_versions"
  ON public.planning_versions
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Company users view planning_versions"
  ON public.planning_versions
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company admins manage planning_versions"
  ON public.planning_versions
  FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- planning_periods
ALTER TABLE public.planning_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access on planning_periods"
  ON public.planning_periods
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Company users view planning_periods"
  ON public.planning_periods
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company admins manage planning_periods"
  ON public.planning_periods
  FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- planning_services
ALTER TABLE public.planning_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admin full access on planning_services"
  ON public.planning_services
  FOR ALL
  USING (public.is_system_admin(auth.uid()));

CREATE POLICY "Company users view planning_services"
  ON public.planning_services
  FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Company admins manage planning_services"
  ON public.planning_services
  FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));