-- Adicionar logo_url ao projects (sobrescreve o logo da empresa)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Bucket público para logos (companies + projects compartilham)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas: leitura pública, upload/delete restrito por company_id no path
DROP POLICY IF EXISTS "company_logos_public_read" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_upload_company" ON storage.objects;
DROP POLICY IF EXISTS "company_logos_delete_company" ON storage.objects;

CREATE POLICY "company_logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

CREATE POLICY "company_logos_upload_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "company_logos_update_company"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "company_logos_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);