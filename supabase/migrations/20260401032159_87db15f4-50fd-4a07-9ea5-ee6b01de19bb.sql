
-- Drop existing permissive policies on holding-documents bucket
DROP POLICY IF EXISTS "Authenticated users can upload holding documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view holding documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own holding documents" ON storage.objects;

-- INSERT: only to own company folder
CREATE POLICY "Company-scoped upload holding documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'holding-documents'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- SELECT: only own company folder
CREATE POLICY "Company-scoped view holding documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'holding-documents'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- DELETE: only own company folder
CREATE POLICY "Company-scoped delete holding documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'holding-documents'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
