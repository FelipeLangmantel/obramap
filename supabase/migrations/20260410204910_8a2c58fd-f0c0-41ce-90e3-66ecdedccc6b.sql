
ALTER TABLE public.system_notifications ADD COLUMN IF NOT EXISTS modulo TEXT DEFAULT 'holding';
UPDATE public.system_notifications SET modulo = 'holding' WHERE modulo IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_modulo ON public.system_notifications(company_id, modulo, resolvida, lida);
