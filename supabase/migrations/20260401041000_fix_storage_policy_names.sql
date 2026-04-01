-- Corrigir políticas de Storage do bucket holding-documents
--
-- A migration anterior (20260401032159) tentou remover as políticas permissivas
-- mas usou nomes incorretos nos DROP POLICY, resultando em noop silencioso.
-- As 3 políticas originais permissivas ainda existem no banco e prevalecem
-- (Supabase aplica políticas com OR — a mais permissiva vence).
--
-- Nomes REAIS das políticas criadas em 20260331052040:
--   'Authenticated users can upload holding docs'
--   'Authenticated users can read holding docs'
--   'Users can delete own holding docs'

DROP POLICY IF EXISTS "Authenticated users can upload holding docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read holding docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own holding docs" ON storage.objects;
