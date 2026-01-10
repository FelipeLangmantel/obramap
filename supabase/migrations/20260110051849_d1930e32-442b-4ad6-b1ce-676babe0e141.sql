-- =====================================================
-- MELHORIA 7A.1: VÍNCULO 1:1 E STATUS DE EXECUÇÃO
-- =====================================================

-- 1) Garantir vínculo 1:1 entre período e medição
-- Remove o índice anterior não-único se existir
DROP INDEX IF EXISTS idx_measurements_planning_period;

-- Criar índice único para garantir 1 medição por período
CREATE UNIQUE INDEX IF NOT EXISTS ux_measurements_planning_period
ON public.measurements(planning_period_id)
WHERE planning_period_id IS NOT NULL;

-- 2) Adicionar campo is_executed em planning_periods
ALTER TABLE public.planning_periods
ADD COLUMN IF NOT EXISTS is_executed boolean NOT NULL DEFAULT false;

-- Índice para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_planning_periods_executed
ON public.planning_periods(is_executed)
WHERE is_executed = true;

-- 3) Atualizar função de vínculo para também atualizar is_executed
CREATE OR REPLACE FUNCTION public.link_measurement_to_planning_period(
  p_measurement_id uuid,
  p_planning_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement record;
  v_planning_period record;
  v_old_period_id uuid;
  v_result jsonb;
BEGIN
  -- Buscar medição
  SELECT id, company_id, project_id, status, measurement_number, planning_period_id
  INTO v_measurement
  FROM public.measurements
  WHERE id = p_measurement_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Medição não encontrada'
    );
  END IF;
  
  -- Verificar se medição está fechada
  IF v_measurement.status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é possível vincular medição fechada. Reabra primeiro se necessário.'
    );
  END IF;
  
  -- Guardar período antigo para atualizar status
  v_old_period_id := v_measurement.planning_period_id;
  
  -- Se for para desvincular (null)
  IF p_planning_period_id IS NULL THEN
    UPDATE public.measurements
    SET planning_period_id = NULL,
        updated_at = now()
    WHERE id = p_measurement_id;
    
    -- Atualizar status do período antigo
    IF v_old_period_id IS NOT NULL THEN
      UPDATE public.planning_periods
      SET is_executed = false
      WHERE id = v_old_period_id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Medição desvinculada do período de planejamento',
      'measurement_id', p_measurement_id
    );
  END IF;
  
  -- Buscar período de planejamento
  SELECT pp.id, pp.company_id, pp.project_id, pp.period_number, pp.is_executed,
         pv.name as version_name
  INTO v_planning_period
  FROM public.planning_periods pp
  JOIN public.planning_versions pv ON pp.planning_version_id = pv.id
  WHERE pp.id = p_planning_period_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Período de planejamento não encontrado'
    );
  END IF;
  
  -- Verificar se já tem outra medição vinculada (constraint 1:1)
  IF EXISTS (
    SELECT 1 FROM public.measurements 
    WHERE planning_period_id = p_planning_period_id 
    AND id != p_measurement_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este período já possui uma medição vinculada. Cada período pode ter apenas uma medição.'
    );
  END IF;
  
  -- Verificar se company_id e project_id são iguais
  IF v_measurement.company_id != v_planning_period.company_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Empresa da medição não corresponde ao período de planejamento'
    );
  END IF;
  
  IF v_measurement.project_id != v_planning_period.project_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Projeto da medição não corresponde ao período de planejamento'
    );
  END IF;
  
  -- Vincular medição ao novo período
  UPDATE public.measurements
  SET planning_period_id = p_planning_period_id,
      updated_at = now()
  WHERE id = p_measurement_id;
  
  -- Atualizar status do período antigo (se havia)
  IF v_old_period_id IS NOT NULL AND v_old_period_id != p_planning_period_id THEN
    UPDATE public.planning_periods
    SET is_executed = false
    WHERE id = v_old_period_id;
  END IF;
  
  -- Marcar novo período como executado
  UPDATE public.planning_periods
  SET is_executed = true
  WHERE id = p_planning_period_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Medição #%s vinculada ao período %s (%s)',
                      v_measurement.measurement_number,
                      v_planning_period.period_number,
                      v_planning_period.version_name),
    'measurement_id', p_measurement_id,
    'planning_period_id', p_planning_period_id
  );
END;
$$;

-- 4) Trigger para manter is_executed sincronizado
CREATE OR REPLACE FUNCTION public.trigger_sync_period_executed_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quando planning_period_id muda em measurements
  IF TG_OP = 'UPDATE' THEN
    -- Se desvinculou de um período
    IF OLD.planning_period_id IS NOT NULL AND 
       (NEW.planning_period_id IS NULL OR NEW.planning_period_id != OLD.planning_period_id) THEN
      UPDATE public.planning_periods
      SET is_executed = false
      WHERE id = OLD.planning_period_id;
    END IF;
    
    -- Se vinculou a um novo período
    IF NEW.planning_period_id IS NOT NULL THEN
      UPDATE public.planning_periods
      SET is_executed = true
      WHERE id = NEW.planning_period_id;
    END IF;
  END IF;
  
  -- Quando deleta medição
  IF TG_OP = 'DELETE' THEN
    IF OLD.planning_period_id IS NOT NULL THEN
      UPDATE public.planning_periods
      SET is_executed = false
      WHERE id = OLD.planning_period_id;
    END IF;
    RETURN OLD;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_sync_period_executed ON public.measurements;
CREATE TRIGGER trg_sync_period_executed
AFTER UPDATE OF planning_period_id OR DELETE
ON public.measurements
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sync_period_executed_status();

-- 5) Atualizar is_executed para períodos existentes (se houver vínculos)
UPDATE public.planning_periods pp
SET is_executed = true
WHERE EXISTS (
  SELECT 1 FROM public.measurements m
  WHERE m.planning_period_id = pp.id
);

-- Comentários
COMMENT ON COLUMN public.planning_periods.is_executed IS 'Indica se o período tem uma medição real vinculada';
COMMENT ON FUNCTION public.trigger_sync_period_executed_status IS 'Mantém is_executed sincronizado quando vínculos mudam';