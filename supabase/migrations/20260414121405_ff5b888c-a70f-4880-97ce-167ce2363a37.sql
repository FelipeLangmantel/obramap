CREATE OR REPLACE FUNCTION public.transition_supply_status(p_request_id uuid, p_new_status text, p_user_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status supply_request_status;
  v_new_status supply_request_status;
  v_valid_transitions jsonb;
BEGIN
  v_valid_transitions := '{
    "alert": ["quoted", "cancelled"],
    "quoted": ["ordered", "cancelled"],
    "ordered": ["delivered"],
    "delivered": [],
    "cancelled": []
  }'::jsonb;
  
  -- Validate enum value
  BEGIN
    v_new_status := p_new_status::supply_request_status;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status inválido: ' || p_new_status
    );
  END;
  
  SELECT status INTO v_current_status
  FROM supply_requests
  WHERE id = p_request_id;
  
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requisição não encontrada'
    );
  END IF;
  
  IF NOT (v_valid_transitions->v_current_status::text) ? p_new_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transição inválida: %s → %s. Transições permitidas: %s', 
        v_current_status, 
        p_new_status,
        v_valid_transitions->v_current_status::text
      )
    );
  END IF;
  
  UPDATE supply_requests
  SET status = v_new_status
  WHERE id = p_request_id;
  
  INSERT INTO supply_status_logs (
    supply_request_id,
    old_status,
    new_status,
    user_id,
    notes
  ) VALUES (
    p_request_id,
    v_current_status,
    v_new_status,
    p_user_id,
    p_notes
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_current_status,
    'new_status', v_new_status,
    'request_id', p_request_id
  );
END;
$function$;