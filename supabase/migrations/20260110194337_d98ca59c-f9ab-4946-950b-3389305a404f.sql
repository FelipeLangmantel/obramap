-- ============================================================
-- Corrigir política de INSERT em projects para permitir system_admin
-- ============================================================

DROP POLICY IF EXISTS "Editors can create company projects" ON public.projects;

CREATE POLICY "Users can create projects" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  -- System admin pode criar para qualquer empresa ou sem empresa
  is_system_admin(auth.uid())
  OR
  -- Outros usuários só podem criar para sua própria empresa
  (
    company_id = get_user_company_id(auth.uid())
    AND company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.system_role IN ('admin', 'user')
      AND profiles.status = 'active'
    )
  )
);