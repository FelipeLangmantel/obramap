-- Allow users to register and close their own login sessions

-- user_sessions: allow authenticated users to insert their own session rows
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create own sessions' AND tablename = 'user_sessions') THEN
        EXECUTE 'CREATE POLICY "Users can create own sessions" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    END IF;
END
$$;

-- user_sessions: allow authenticated users to update their own session rows (e.g., set logout_at / is_active)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own sessions' AND tablename = 'user_sessions') THEN
        EXECUTE 'CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    END IF;
END
$$;

-- Helpful index for admin session list performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id_login_at
ON public.user_sessions (user_id, login_at DESC);