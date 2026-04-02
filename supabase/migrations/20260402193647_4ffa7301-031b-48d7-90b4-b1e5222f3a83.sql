
-- Fix INSERT policy
DROP POLICY IF EXISTS "Users can upload doc files for their company" ON public.holding_doc_files;

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
        AND op.company_id = (
          SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
  );

-- Fix SELECT policy
DROP POLICY IF EXISTS "Users can view doc files from their company" ON public.holding_doc_files;

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
        AND op.company_id = (
          SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
  );
