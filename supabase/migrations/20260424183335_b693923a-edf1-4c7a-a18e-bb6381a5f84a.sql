-- 1) productions (tem project_id)
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS productions_client_uuid_unique
  ON public.productions(project_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 2) weekly_productions (tem project_id)
ALTER TABLE public.weekly_productions ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_productions_client_uuid_unique
  ON public.weekly_productions(project_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 3) diary_items (sem company_id/project_id direto — usa o próprio client_uuid global)
ALTER TABLE public.diary_items ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS diary_items_client_uuid_unique
  ON public.diary_items(client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 4) diary_attachments (tem company_id)
ALTER TABLE public.diary_attachments ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS diary_attachments_client_uuid_unique
  ON public.diary_attachments(company_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 5) diary_entries (tem company_id e project_id)
ALTER TABLE public.diary_entries ADD COLUMN IF NOT EXISTS client_uuid UUID;
CREATE UNIQUE INDEX IF NOT EXISTS diary_entries_client_uuid_unique
  ON public.diary_entries(company_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 6) Tabela de log de sincronização por dispositivo
CREATE TABLE IF NOT EXISTS public.device_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  device_id TEXT NOT NULL,
  device_label TEXT,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pending_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT 'ok',
  last_error TEXT,
  storage_estimate_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

ALTER TABLE public.device_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own device logs"
  ON public.device_sync_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "users insert own device logs"
  ON public.device_sync_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users update own device logs"
  ON public.device_sync_log FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS device_sync_log_company_idx ON public.device_sync_log(company_id);
CREATE INDEX IF NOT EXISTS device_sync_log_user_idx ON public.device_sync_log(user_id);

CREATE TRIGGER trg_device_sync_log_updated
  BEFORE UPDATE ON public.device_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();