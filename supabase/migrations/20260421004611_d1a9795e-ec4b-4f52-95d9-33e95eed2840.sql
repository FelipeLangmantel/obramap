
-- Substituir políticas permissivas do bucket diary-photos por políticas com isolamento de empresa.
-- Path esperado: {company_id}/{entry_id}/{timestamp}_{filename}

DROP POLICY IF EXISTS "diary_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_delete" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_upload_company" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_select_company" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_delete_company" ON storage.objects;

CREATE POLICY "diary_photos_upload_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "diary_photos_select_company"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "diary_photos_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
