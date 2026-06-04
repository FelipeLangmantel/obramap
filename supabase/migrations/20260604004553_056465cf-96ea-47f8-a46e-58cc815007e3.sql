-- Restrict diary storage UPDATE policies to authenticated role only
DROP POLICY IF EXISTS diary_photos_update_company ON storage.objects;
CREATE POLICY diary_photos_update_company ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'diary-photos'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS diary_signatures_update ON storage.objects;
CREATE POLICY diary_signatures_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'diary-signatures'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'diary-signatures'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );