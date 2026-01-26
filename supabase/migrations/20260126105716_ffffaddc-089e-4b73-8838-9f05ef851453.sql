-- Add CHECK constraint for planning_periods.status
-- Valid values: draft, approved, released_to_weekly, closed

-- First, ensure status column has a proper default and normalize existing values
UPDATE public.planning_periods 
SET status = 'draft' 
WHERE status IS NULL OR status NOT IN ('draft', 'approved', 'released_to_weekly', 'closed', 'executing', 'planned');

-- Map 'executing' to 'released_to_weekly' for the new terminology
UPDATE public.planning_periods 
SET status = 'released_to_weekly' 
WHERE status = 'executing';

-- Map 'planned' to 'draft' 
UPDATE public.planning_periods 
SET status = 'draft' 
WHERE status = 'planned';

-- Add CHECK constraint for valid status values
ALTER TABLE public.planning_periods 
DROP CONSTRAINT IF EXISTS planning_periods_status_check;

ALTER TABLE public.planning_periods 
ADD CONSTRAINT planning_periods_status_check 
CHECK (status IN ('draft', 'approved', 'released_to_weekly', 'closed'));

-- Set default value for status column
ALTER TABLE public.planning_periods 
ALTER COLUMN status SET DEFAULT 'draft';

-- Ensure status is not null
ALTER TABLE public.planning_periods 
ALTER COLUMN status SET NOT NULL;

-- Create function to change period status with governance rules
CREATE OR REPLACE FUNCTION public.update_planning_period_status(
  p_period_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
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

  -- Status transition rules:
  -- draft -> approved (only forward)
  -- approved -> released_to_weekly (only forward) 
  -- released_to_weekly -> closed (only forward)
  -- Going backwards is NOT allowed (governance)
  
  IF v_current_status = 'draft' AND p_new_status NOT IN ('approved', 'draft') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Draft can only be approved');
  END IF;

  IF v_current_status = 'approved' AND p_new_status NOT IN ('released_to_weekly', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Approved can only be released to weekly');
  END IF;

  IF v_current_status = 'released_to_weekly' AND p_new_status NOT IN ('closed', 'released_to_weekly') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition', 'message', 'Released can only be closed');
  END IF;

  -- Update status
  UPDATE planning_periods
  SET 
    status = p_new_status,
    is_closed = CASE WHEN p_new_status = 'closed' THEN true ELSE is_closed END,
    closed_at = CASE WHEN p_new_status = 'closed' THEN now() ELSE closed_at END,
    closed_by = CASE WHEN p_new_status = 'closed' THEN auth.uid() ELSE closed_by END
  WHERE id = p_period_id;

  RETURN jsonb_build_object(
    'success', true, 
    'previous_status', v_current_status,
    'new_status', p_new_status
  );
END;
$$;

-- Comment on the function
COMMENT ON FUNCTION public.update_planning_period_status IS 'Updates planning period status with governance rules. Only forward transitions allowed: draft -> approved -> released_to_weekly -> closed';