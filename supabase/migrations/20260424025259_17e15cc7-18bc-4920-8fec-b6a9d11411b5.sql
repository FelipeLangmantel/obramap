-- Bucket para assinaturas digitais (PNG base64)
INSERT INTO storage.buckets (id, name, public)
VALUES ('diary-signatures', 'diary-signatures', false)
ON CONFLICT DO NOTHING;

-- RLS policies para o bucket de assinaturas (path: {company_id}/{entry_id}/...)
DO $$
BEGIN
  -- Select
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'diary_signatures_select' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "diary_signatures_select"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'diary-signatures' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  -- Insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'diary_signatures_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "diary_signatures_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'diary-signatures' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
  -- Delete
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'diary_signatures_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "diary_signatures_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'diary-signatures' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
  END IF;
END $$;
