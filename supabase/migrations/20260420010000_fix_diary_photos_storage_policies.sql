-- ══════════════════════════════════════════════════════════════════════
-- Fix: políticas do bucket diary-photos sem isolamento de empresa
-- 
-- PROBLEMA: políticas originais só checavam bucket_id = 'diary-photos'
-- permitindo que qualquer usuário autenticado visse/deletasse fotos
-- de outras empresas.
--
-- SOLUÇÃO: seguir o mesmo padrão do bucket holding-documents:
-- o path do arquivo começa com company_id — validar esse primeiro segmento.
--
-- Path esperado: {company_id}/{entry_id}/{timestamp}_{filename}
-- ══════════════════════════════════════════════════════════════════════

-- Remover políticas permissivas originais
DROP POLICY IF EXISTS "diary_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "diary_photos_delete" ON storage.objects;

-- INSERT: apenas na própria pasta da empresa
CREATE POLICY "diary_photos_upload_company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- SELECT: apenas a própria pasta da empresa
CREATE POLICY "diary_photos_select_company"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- DELETE: apenas a própria pasta da empresa
CREATE POLICY "diary_photos_delete_company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'diary-photos'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
