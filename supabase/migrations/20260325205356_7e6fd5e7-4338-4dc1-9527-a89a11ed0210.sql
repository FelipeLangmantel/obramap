
-- Campos extras em user_sessions
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'desktop',
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS inactivity_timeout_min INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS terminated_by UUID,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- Tabela de regras de segurança de sessão
CREATE TABLE IF NOT EXISTS public.session_security_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inactivity_timeout_min INTEGER NOT NULL DEFAULT 60,
  max_concurrent_sessions INTEGER NOT NULL DEFAULT 3,
  force_logout_on_new_login BOOLEAN NOT NULL DEFAULT false,
  session_duration_hours INTEGER NOT NULL DEFAULT 24,
  allow_multiple_devices BOOLEAN NOT NULL DEFAULT true,
  alert_on_new_ip BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.session_security_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_session_rules" ON public.session_security_rules
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

GRANT ALL ON public.session_security_rules TO authenticated;

-- Inserir regras padrão para empresas existentes
INSERT INTO public.session_security_rules (company_id)
SELECT id FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- Índice para queries de sessões ativas
CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON public.user_sessions(user_id, is_active, last_active_at);
