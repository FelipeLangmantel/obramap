-- ============================================================
-- FASE 13.7 — FECHAMENTO DE PERÍODO DE PLANEJAMENTO
-- ============================================================

ALTER TABLE public.planning_periods
ADD COLUMN IF NOT EXISTS is_closed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS closed_at timestamptz,
ADD COLUMN IF NOT EXISTS closed_by uuid;

-- ============================================================
-- FUNÇÃO: FECHAR PERÍODO
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_planning_period(
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  IF v_period.is_closed = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_already_closed');
  END IF;

  -- Fechar período
  UPDATE planning_periods
  SET
    is_closed = true,
    status = 'closed',
    closed_at = now(),
    closed_by = auth.uid()
  WHERE id = p_period_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- FUNÇÃO: REABRIR PERÍODO (apenas system_admin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reopen_planning_period(
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_user_role text;
BEGIN
  -- Verificar se o usuário é system_admin
  SELECT system_role INTO v_user_role
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_user_role != 'system_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO v_period
  FROM planning_periods
  WHERE id = p_period_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_found');
  END IF;

  IF v_period.is_closed = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'period_not_closed');
  END IF;

  -- Reabrir período
  UPDATE planning_periods
  SET
    is_closed = false,
    status = 'in_progress',
    closed_at = NULL,
    closed_by = NULL
  WHERE id = p_period_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================
-- BLOQUEAR ALTERAÇÃO DE PLANEJAMENTO EM PERÍODO FECHADO
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_update_on_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed boolean;
BEGIN
  SELECT is_closed INTO v_closed
  FROM planning_periods
  WHERE id = COALESCE(NEW.planning_period_id, OLD.planning_period_id);

  IF v_closed = true THEN
    RAISE EXCEPTION 'Planning period is closed and cannot be modified';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closed_period ON public.service_planning_by_period;
CREATE TRIGGER trg_block_closed_period
BEFORE UPDATE OR DELETE
ON public.service_planning_by_period
FOR EACH ROW
EXECUTE FUNCTION public.block_update_on_closed_period();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.close_planning_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_planning_period(uuid) TO authenticated;