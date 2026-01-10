-- =============================================
-- FASE 2: MEASUREMENTS FÍSICO-FINANCEIRO
-- =============================================

-- 1. Adicionar company_id em measurements (multi-tenant obrigatório)
ALTER TABLE public.measurements 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Preencher company_id existente a partir de projects
UPDATE public.measurements m
SET company_id = p.company_id
FROM public.projects p
WHERE m.project_id = p.id AND m.company_id IS NULL;

-- 3. Tornar company_id NOT NULL após migração de dados
ALTER TABLE public.measurements 
ALTER COLUMN company_id SET NOT NULL;

-- 4. Adicionar campos financeiros
ALTER TABLE public.measurements
ADD COLUMN IF NOT EXISTS contract_percent_planned numeric NOT NULL DEFAULT 0
  CHECK (contract_percent_planned >= 0 AND contract_percent_planned <= 100),
ADD COLUMN IF NOT EXISTS revenue_expected numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue_target numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS planned_cost numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS realized_cost numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS financial_result numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'positive'
  CHECK (financial_status IN ('positive', 'warning', 'negative'));

-- 5. Atualizar type para incluir INITIAL
-- (Primeiro dropar constraint se existir, depois recriar)
DO $$
BEGIN
  -- Adicionar coluna type se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'measurements' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.measurements 
    ADD COLUMN type text NOT NULL DEFAULT 'PLANNED'
      CHECK (type IN ('INITIAL', 'PLANNED', 'IN_PROGRESS', 'CLOSED'));
  END IF;
END $$;

-- 6. Índices para performance multi-tenant
CREATE INDEX IF NOT EXISTS idx_measurements_company ON public.measurements(company_id);
CREATE INDEX IF NOT EXISTS idx_measurements_company_project ON public.measurements(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_measurements_status ON public.measurements(status);

-- 7. Função para calcular campos financeiros automaticamente
CREATE OR REPLACE FUNCTION public.calculate_measurement_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract_value numeric;
  v_cost_target_percent numeric;
BEGIN
  -- Buscar valores do contrato
  SELECT 
    COALESCE(contract_value_total, 0),
    COALESCE(cost_target_percent, 0.68)
  INTO v_contract_value, v_cost_target_percent
  FROM project_contracts
  WHERE project_id = NEW.project_id
    AND company_id = NEW.company_id;

  -- Se não encontrou contrato, usar zeros
  IF v_contract_value IS NULL THEN
    v_contract_value := 0;
    v_cost_target_percent := 0.68;
  END IF;

  -- Calcular revenue_expected = valor_contrato × (contract_percent_planned / 100)
  NEW.revenue_expected := v_contract_value * (COALESCE(NEW.contract_percent_planned, 0) / 100);

  -- Calcular revenue_target = revenue_expected × cost_target_percent
  NEW.revenue_target := NEW.revenue_expected * v_cost_target_percent;

  -- Calcular financial_result = revenue_target - realized_cost
  NEW.financial_result := NEW.revenue_target - COALESCE(NEW.realized_cost, 0);

  -- Determinar financial_status
  IF COALESCE(NEW.realized_cost, 0) <= NEW.revenue_target THEN
    NEW.financial_status := 'positive';
  ELSIF COALESCE(NEW.realized_cost, 0) <= NEW.revenue_expected THEN
    NEW.financial_status := 'warning';
  ELSE
    NEW.financial_status := 'negative';
  END IF;

  RETURN NEW;
END;
$$;

-- 8. Trigger para cálculo automático
DROP TRIGGER IF EXISTS trigger_calculate_measurement_financials ON public.measurements;
CREATE TRIGGER trigger_calculate_measurement_financials
  BEFORE INSERT OR UPDATE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_measurement_financials();

-- 9. Função para proteger medições fechadas
CREATE OR REPLACE FUNCTION public.protect_closed_measurement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se a medição estava fechada (status = 'closed')
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'closed' THEN
      -- Bloquear alterações em campos críticos
      IF NEW.contract_percent_planned != OLD.contract_percent_planned OR
         NEW.planned_cost != OLD.planned_cost OR
         NEW.start_date != OLD.start_date OR
         NEW.end_date != OLD.end_date OR
         NEW.measurement_number != OLD.measurement_number THEN
        RAISE EXCEPTION 'Medição % está fechada. Não é permitido alterar campos críticos.', OLD.measurement_number;
      END IF;
      
      -- Permitir apenas atualização de realized_cost e campos calculados
      -- (que são recalculados pelo trigger anterior)
    END IF;
  END IF;

  -- Bloquear DELETE de medição fechada
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'Medição % está fechada. Não é permitido excluir.', OLD.measurement_number;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 10. Trigger para proteção de medições fechadas
DROP TRIGGER IF EXISTS trigger_protect_closed_measurement ON public.measurements;
CREATE TRIGGER trigger_protect_closed_measurement
  BEFORE UPDATE OR DELETE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_closed_measurement();

-- 11. Função para proteger measurement_services de medições fechadas
CREATE OR REPLACE FUNCTION public.protect_closed_measurement_services()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_status text;
BEGIN
  -- Para INSERT e UPDATE, verificar via NEW
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = NEW.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido alterar serviços de medição fechada.';
    END IF;
  END IF;

  -- Para DELETE, verificar via OLD
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = OLD.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido excluir serviços de medição fechada.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 12. Trigger para proteger measurement_services
DROP TRIGGER IF EXISTS trigger_protect_closed_measurement_services ON public.measurement_services;
CREATE TRIGGER trigger_protect_closed_measurement_services
  BEFORE INSERT OR UPDATE OR DELETE ON public.measurement_services
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_closed_measurement_services();

-- 13. Adicionar company_id em measurement_services para multi-tenant
ALTER TABLE public.measurement_services 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Preencher company_id existente
UPDATE public.measurement_services ms
SET company_id = m.company_id
FROM public.measurements m
WHERE ms.measurement_id = m.id AND ms.company_id IS NULL;

-- Adicionar project_id em measurement_services
ALTER TABLE public.measurement_services 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- Preencher project_id existente
UPDATE public.measurement_services ms
SET project_id = m.project_id
FROM public.measurements m
WHERE ms.measurement_id = m.id AND ms.project_id IS NULL;

-- 14. Função helper para obter receita esperada da medição
CREATE OR REPLACE FUNCTION public.get_measurement_revenue_expected(p_measurement_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(revenue_expected, 0)
  FROM measurements
  WHERE id = p_measurement_id;
$$;

-- 15. Comentários explicativos
COMMENT ON COLUMN public.measurements.company_id IS 'Empresa (multi-tenant obrigatório)';
COMMENT ON COLUMN public.measurements.contract_percent_planned IS 'Percentual planejado do contrato (0-100)';
COMMENT ON COLUMN public.measurements.revenue_expected IS 'Receita esperada = valor_contrato × percentual';
COMMENT ON COLUMN public.measurements.revenue_target IS 'Meta de receita considerando custo target';
COMMENT ON COLUMN public.measurements.planned_cost IS 'Custo planejado para esta medição';
COMMENT ON COLUMN public.measurements.realized_cost IS 'Custo realizado (soma de production_logs)';
COMMENT ON COLUMN public.measurements.financial_result IS 'Resultado financeiro = revenue_target - realized_cost';
COMMENT ON COLUMN public.measurements.financial_status IS 'Status: positive, warning, negative';