-- Atualização da RPC approve_planning_period para NÃO criar measurements
-- Módulos estratégicos devem operar apenas em planning_periods e service_planning_by_period

CREATE OR REPLACE FUNCTION approve_planning_period(
  p_period_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period record;
BEGIN
  -- Fetch period data
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_period_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;
  
  -- Check if already approved
  IF v_period.status IN ('approved', 'executing', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_already_approved');
  END IF;
  
  -- Update period status to approved (APENAS atualiza o status, não cria measurement)
  UPDATE planning_periods
  SET status = 'approved',
      updated_at = now()
  WHERE id = p_period_id;
  
  -- Retorna sucesso sem criar measurement
  -- A criação de measurement será feita em outro momento pelo módulo operacional
  RETURN jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'message', 'Período aprovado. Medição será criada pelo módulo operacional.'
  );
END;
$$;