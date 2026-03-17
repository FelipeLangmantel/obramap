
CREATE OR REPLACE FUNCTION public.update_planning_period_status(p_period_id UUID, p_new_status TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_is_closed BOOLEAN;
BEGIN
  -- Validate new status
  IF p_new_status NOT IN ('draft', 'approved', 'released_to_weekly', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  -- Get current status
  SELECT status, COALESCE(is_closed, false)
  INTO v_current_status, v_is_closed
  FROM planning_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  -- Cannot modify closed periods
  IF v_is_closed OR v_current_status = 'closed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_is_closed');
  END IF;

  -- Status transition rules (forward and backward):
  -- draft -> approved
  -- approved -> released_to_weekly OR approved -> draft (revert)
  -- released_to_weekly -> closed OR released_to_weekly -> draft (revert)
  
  IF v_current_status = 'draft' AND p_new_status NOT IN ('approved', 'draft') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Rascunho só pode ser aprovado');
  END IF;

  IF v_current_status = 'approved' AND p_new_status NOT IN ('released_to_weekly', 'approved', 'draft') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Aprovado só pode ser liberado ou revertido para rascunho');
  END IF;

  IF v_current_status = 'released_to_weekly' AND p_new_status NOT IN ('closed', 'released_to_weekly', 'draft') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Liberado só pode ser fechado ou revertido para rascunho');
  END IF;

  -- Update status
  UPDATE planning_periods
  SET 
    status = p_new_status,
    is_closed = CASE WHEN p_new_status = 'closed' THEN true ELSE is_closed END,
    closed_at = CASE WHEN p_new_status = 'closed' THEN now() ELSE closed_at END,
    closed_by = CASE WHEN p_new_status = 'closed' THEN auth.uid() ELSE closed_by END,
    updated_at = now()
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true, 
    'previous_status', v_current_status,
    'new_status', p_new_status
  );
END;
$$;
