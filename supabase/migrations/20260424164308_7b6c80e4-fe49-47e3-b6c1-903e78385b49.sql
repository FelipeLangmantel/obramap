
CREATE TABLE IF NOT EXISTS public.diary_edit_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  company_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_name TEXT NOT NULL,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  admin_response TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  unlocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diary_edit_requests_entry ON public.diary_edit_requests(diary_entry_id);
CREATE INDEX IF NOT EXISTS idx_diary_edit_requests_company_status ON public.diary_edit_requests(company_id, status);

ALTER TABLE public.diary_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diary_edit_requests_select" ON public.diary_edit_requests;
CREATE POLICY "diary_edit_requests_select"
  ON public.diary_edit_requests FOR SELECT
  TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "diary_edit_requests_insert" ON public.diary_edit_requests;
CREATE POLICY "diary_edit_requests_insert"
  ON public.diary_edit_requests FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() AND requested_by = auth.uid());

DROP POLICY IF EXISTS "diary_edit_requests_update_admin" ON public.diary_edit_requests;
CREATE POLICY "diary_edit_requests_update_admin"
  ON public.diary_edit_requests FOR UPDATE
  TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.system_role = 'admin' OR p.system_role = 'system_admin')
    )
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_diary_edit_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diary_edit_requests_updated_at ON public.diary_edit_requests;
CREATE TRIGGER trg_diary_edit_requests_updated_at
  BEFORE UPDATE ON public.diary_edit_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_diary_edit_requests_updated_at();

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'diary_edit_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.diary_edit_requests;
  END IF;
END $$;
