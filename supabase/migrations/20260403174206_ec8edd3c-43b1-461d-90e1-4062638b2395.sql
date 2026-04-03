
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void AS $$
BEGIN
  UPDATE public.user_sessions
  SET is_active = false,
      logout_at = now(),
      termination_reason = 'timeout'
  WHERE is_active = true
    AND last_active_at < now() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
