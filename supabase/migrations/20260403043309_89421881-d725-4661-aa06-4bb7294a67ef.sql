
CREATE TABLE public.medicao_correction_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  medicao_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  requested_by_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'previsao',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.medicao_correction_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view correction requests for their company obras"
  ON public.medicao_correction_requests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.obras_portfolio op
      JOIN public.profiles p ON p.company_id = op.company_id
      WHERE op.id = medicao_correction_requests.obra_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create correction requests"
  ON public.medicao_correction_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Company admins can update correction requests"
  ON public.medicao_correction_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.obras_portfolio op
      JOIN public.profiles p ON p.company_id = op.company_id
      WHERE op.id = medicao_correction_requests.obra_id
        AND p.id = auth.uid()
        AND p.system_role IN ('admin', 'system_admin')
    )
  );

ALTER TABLE public.medicoes_ple ADD COLUMN IF NOT EXISTS unlocked_until TIMESTAMPTZ;
ALTER TABLE public.medicoes_ple ADD COLUMN IF NOT EXISTS unlocked_by UUID;
ALTER TABLE public.medicoes_ple ADD COLUMN IF NOT EXISTS unlocked_section TEXT;
