-- =====================================================
-- FASE 8A: GOVERNANÇA E VALIDAÇÕES DE PRODUÇÃO
-- =====================================================

-- =====================================================
-- 1) TABELA production_exceptions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.production_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_log_id uuid NOT NULL REFERENCES public.production_logs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reason text NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_production_exceptions_log 
ON public.production_exceptions(production_log_id);

CREATE INDEX IF NOT EXISTS idx_production_exceptions_company_project 
ON public.production_exceptions(company_id, project_id);

-- Habilitar RLS
ALTER TABLE public.production_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "System admin full access on production_exceptions"
ON public.production_exceptions
FOR ALL
USING (is_system_admin(auth.uid()));

CREATE POLICY "Company admins manage production_exceptions"
ON public.production_exceptions
FOR ALL
USING (is_company_admin(auth.uid(), company_id))
WITH CHECK (is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company users view production_exceptions"
ON public.production_exceptions
FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- =====================================================
-- 2) FUNÇÃO validate_production_business_rules()
-- =====================================================
CREATE OR REPLACE FUNCTION public.validate_production_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement record;
  v_service record;
  v_total_executed numeric;
  v_unit_cost numeric;
  v_max_unit_cost numeric;
BEGIN
  -- Regra A: Se não é banco inicial, service_id é obrigatório
  IF NEW.is_initial_database = false AND NEW.service_id IS NULL THEN
    RAISE EXCEPTION 'Lançamento de produção requer um serviço vinculado (service_id). Use banco inicial apenas para migração de dados.';
  END IF;
  
  -- Regra D: cost_realized deve ser >= 0
  IF NEW.cost_realized < 0 THEN
    RAISE EXCEPTION 'Custo realizado não pode ser negativo. Valor informado: %', NEW.cost_realized;
  END IF;
  
  -- Regra B: Validar datas dentro do período da medição
  IF NEW.measurement_id IS NOT NULL AND NEW.is_unplanned = false THEN
    SELECT start_date, end_date, measurement_number
    INTO v_measurement
    FROM public.measurements
    WHERE id = NEW.measurement_id;
    
    IF FOUND THEN
      IF NEW.execution_date < v_measurement.start_date OR NEW.execution_date > v_measurement.end_date THEN
        RAISE EXCEPTION 'Data de execução (%) fora do período da medição #% (% a %). Para lançamentos fora do período, marque como não planejado.',
          NEW.execution_date, v_measurement.measurement_number, v_measurement.start_date, v_measurement.end_date;
      END IF;
    END IF;
  END IF;
  
  -- Regras que dependem de service_id
  IF NEW.service_id IS NOT NULL THEN
    -- Buscar dados do serviço
    SELECT planned_houses, planned_cost, scope_name, macro_name
    INTO v_service
    FROM public.measurement_services
    WHERE id = NEW.service_id;
    
    IF FOUND THEN
      -- Regra C: Validar quantidade não excede planejado
      IF NEW.is_unplanned = false THEN
        -- Calcular total já executado (excluindo o registro atual se for UPDATE)
        SELECT COALESCE(SUM(quantity_executed), 0)
        INTO v_total_executed
        FROM public.production_logs
        WHERE service_id = NEW.service_id
          AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
        
        IF (v_total_executed + NEW.quantity_executed) > v_service.planned_houses THEN
          RAISE EXCEPTION 'Quantidade excede o planejado para o serviço % - %. Planejado: %, Já executado: %, Tentando adicionar: %. Para exceder, marque como não planejado.',
            v_service.scope_name, v_service.macro_name, v_service.planned_houses, v_total_executed, NEW.quantity_executed;
        END IF;
      END IF;
      
      -- Regra E: Validar custo unitário não é excessivo
      IF NEW.is_unplanned = false AND NEW.quantity_executed > 0 AND NEW.cost_realized > 0 THEN
        v_unit_cost := NEW.cost_realized / NEW.quantity_executed;
        
        IF v_service.planned_houses > 0 AND v_service.planned_cost > 0 THEN
          v_max_unit_cost := (v_service.planned_cost / v_service.planned_houses) * 3;
          
          IF v_unit_cost > v_max_unit_cost THEN
            RAISE EXCEPTION 'Custo unitário (R$ %) excede 3x o custo planejado (R$ %) para o serviço % - %. Para custos extraordinários, marque como não planejado.',
              ROUND(v_unit_cost::numeric, 2), 
              ROUND((v_service.planned_cost / v_service.planned_houses)::numeric, 2),
              v_service.scope_name, v_service.macro_name;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- 3) TRIGGER DE VALIDAÇÃO
-- =====================================================
-- Remover trigger anterior se existir
DROP TRIGGER IF EXISTS trg_validate_production_rules ON public.production_logs;
DROP TRIGGER IF EXISTS trigger_sync_production_logs ON public.production_logs;

-- Criar novo trigger
CREATE TRIGGER trg_validate_production_rules
BEFORE INSERT OR UPDATE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.validate_production_business_rules();

-- =====================================================
-- 4) RPC create_production_log_with_exception()
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_production_log_with_exception(
  p_company_id uuid,
  p_project_id uuid,
  p_house_id uuid,
  p_service_id uuid,
  p_measurement_id uuid,
  p_execution_date date,
  p_quantity_executed numeric,
  p_cost_realized numeric,
  p_notes text,
  p_exception_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
  v_exception_id uuid;
BEGIN
  -- Validar campos obrigatórios
  IF p_exception_reason IS NULL OR trim(p_exception_reason) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Motivo da exceção é obrigatório para lançamentos não planejados'
    );
  END IF;
  
  -- Inserir production_log com is_unplanned = true
  INSERT INTO public.production_logs (
    company_id,
    project_id,
    house_id,
    service_id,
    measurement_id,
    execution_date,
    quantity_executed,
    cost_realized,
    notes,
    is_unplanned,
    is_initial_database
  ) VALUES (
    p_company_id,
    p_project_id,
    p_house_id,
    p_service_id,
    p_measurement_id,
    COALESCE(p_execution_date, CURRENT_DATE),
    COALESCE(p_quantity_executed, 1),
    COALESCE(p_cost_realized, 0),
    p_notes,
    true,  -- Marcado como não planejado
    false
  )
  RETURNING id INTO v_log_id;
  
  -- Inserir exceção
  INSERT INTO public.production_exceptions (
    production_log_id,
    company_id,
    project_id,
    reason,
    approved_by
  ) VALUES (
    v_log_id,
    p_company_id,
    p_project_id,
    p_exception_reason,
    auth.uid()
  )
  RETURNING id INTO v_exception_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'production_log_id', v_log_id,
    'exception_id', v_exception_id,
    'message', 'Produção não planejada registrada com exceção'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- =====================================================
-- 5) BLOQUEAR DELETE DIRETO EM production_logs
-- =====================================================
CREATE OR REPLACE FUNCTION public.block_production_log_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permitir apenas para system_admin
  IF NOT is_system_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Exclusão de produção não permitida. Use correção com registro. Apenas administradores do sistema podem excluir registros.';
  END IF;
  
  RETURN OLD;
END;
$$;

-- Criar trigger de bloqueio
DROP TRIGGER IF EXISTS trg_block_production_delete ON public.production_logs;
CREATE TRIGGER trg_block_production_delete
BEFORE DELETE ON public.production_logs
FOR EACH ROW
EXECUTE FUNCTION public.block_production_log_delete();

-- =====================================================
-- 6) FUNÇÃO HELPER: Corrigir produção (em vez de deletar)
-- =====================================================
CREATE OR REPLACE FUNCTION public.correct_production_log(
  p_production_log_id uuid,
  p_correction_reason text,
  p_new_quantity numeric DEFAULT NULL,
  p_new_cost numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log record;
  v_old_quantity numeric;
  v_old_cost numeric;
BEGIN
  -- Buscar log atual
  SELECT * INTO v_log
  FROM public.production_logs
  WHERE id = p_production_log_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Registro de produção não encontrado'
    );
  END IF;
  
  -- Verificar permissão (company_admin)
  IF NOT is_company_admin(auth.uid(), v_log.company_id) AND NOT is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas administradores podem corrigir registros de produção'
    );
  END IF;
  
  -- Guardar valores antigos
  v_old_quantity := v_log.quantity_executed;
  v_old_cost := v_log.cost_realized;
  
  -- Atualizar registro
  UPDATE public.production_logs
  SET 
    quantity_executed = COALESCE(p_new_quantity, quantity_executed),
    cost_realized = COALESCE(p_new_cost, cost_realized),
    is_unplanned = true,  -- Marcar como não planejado após correção
    notes = COALESCE(notes, '') || E'\n[CORREÇÃO ' || now()::date || ']: ' || p_correction_reason,
    updated_at = now()
  WHERE id = p_production_log_id;
  
  -- Registrar exceção
  INSERT INTO public.production_exceptions (
    production_log_id,
    company_id,
    project_id,
    reason,
    approved_by
  ) VALUES (
    p_production_log_id,
    v_log.company_id,
    v_log.project_id,
    format('CORREÇÃO: %s | Valores anteriores: qtd=%s, custo=%s | Novos valores: qtd=%s, custo=%s',
           p_correction_reason, v_old_quantity, v_old_cost,
           COALESCE(p_new_quantity, v_old_quantity), COALESCE(p_new_cost, v_old_cost)),
    auth.uid()
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'production_log_id', p_production_log_id,
    'message', 'Produção corrigida com registro de exceção',
    'old_values', jsonb_build_object('quantity', v_old_quantity, 'cost', v_old_cost),
    'new_values', jsonb_build_object('quantity', COALESCE(p_new_quantity, v_old_quantity), 'cost', COALESCE(p_new_cost, v_old_cost))
  );
END;
$$;

-- Comentários
COMMENT ON TABLE public.production_exceptions IS 'Registra exceções e justificativas para lançamentos fora do planejamento';
COMMENT ON FUNCTION public.validate_production_business_rules IS 'Valida regras de negócio antes de inserir/atualizar produção';
COMMENT ON FUNCTION public.create_production_log_with_exception IS 'Cria lançamento não planejado com registro obrigatório de exceção';
COMMENT ON FUNCTION public.block_production_log_delete IS 'Impede exclusão direta de registros de produção';
COMMENT ON FUNCTION public.correct_production_log IS 'Corrige produção mantendo histórico e registrando exceção';