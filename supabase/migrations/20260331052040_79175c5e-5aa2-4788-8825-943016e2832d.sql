
-- Create storage bucket for holding documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('holding-documents', 'holding-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create table for file attachments on obra docs
CREATE TABLE public.holding_doc_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_doc_id UUID NOT NULL REFERENCES public.holding_obra_docs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by UUID NOT NULL,
  uploaded_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by obra_doc_id
CREATE INDEX idx_holding_doc_files_obra_doc_id ON public.holding_doc_files(obra_doc_id);

-- Enable RLS
ALTER TABLE public.holding_doc_files ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read files linked to their company's obras
CREATE POLICY "Users can view doc files from their company"
  ON public.holding_doc_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.holding_obra_docs hod
      JOIN public.obras_portfolio op ON op.id = hod.obra_id
      WHERE hod.id = holding_doc_files.obra_doc_id
        AND op.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- RLS: authenticated users from same company can insert
CREATE POLICY "Users can upload doc files for their company"
  ON public.holding_doc_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.holding_obra_docs hod
      JOIN public.obras_portfolio op ON op.id = hod.obra_id
      WHERE hod.id = obra_doc_id
        AND op.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- RLS: only uploader can delete their own files
CREATE POLICY "Users can delete their own doc files"
  ON public.holding_doc_files
  FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid());

-- Storage policies for holding-documents bucket
CREATE POLICY "Authenticated users can upload holding docs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'holding-documents');

CREATE POLICY "Authenticated users can read holding docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'holding-documents');

CREATE POLICY "Users can delete own holding docs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'holding-documents' AND (storage.foldername(name))[1] IS NOT NULL);
