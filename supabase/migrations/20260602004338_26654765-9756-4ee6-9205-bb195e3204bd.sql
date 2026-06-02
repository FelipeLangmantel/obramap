
-- Substitui as policies antigas de productions (que exigiam system_role admin/system_admin)
-- pelo padrão atual baseado em can_write() + company_id da obra.
-- DELETE permanece restrito a admins da empresa.

DROP POLICY IF EXISTS "Admins can insert productions" ON public.productions;
DROP POLICY IF EXISTS "Admins can update productions" ON public.productions;
DROP POLICY IF EXISTS "Admins can delete productions" ON public.productions;
DROP POLICY IF EXISTS "Users can view productions" ON public.productions;

-- SELECT: usuário ativo da mesma empresa via project_id -> projects.company_id
CREATE POLICY "productions_select_company"
ON public.productions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = productions.project_id
      AND p.company_id = public.get_my_company_id()
  )
);

-- INSERT: precisa de can_write() (admin ou editor, viewer bloqueado)
-- e a obra precisa pertencer à empresa do usuário
CREATE POLICY "productions_insert_company"
ON public.productions
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_write()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = productions.project_id
      AND p.company_id = public.get_my_company_id()
  )
);

-- UPDATE: mesmas regras de INSERT
CREATE POLICY "productions_update_company"
ON public.productions
FOR UPDATE
TO authenticated
USING (
  public.can_write()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = productions.project_id
      AND p.company_id = public.get_my_company_id()
  )
)
WITH CHECK (
  public.can_write()
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = productions.project_id
      AND p.company_id = public.get_my_company_id()
  )
);

-- DELETE: continua restrito a admin/system_admin da mesma empresa
CREATE POLICY "productions_delete_company_admin"
ON public.productions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = productions.project_id
      AND pr.user_id = auth.uid()
      AND pr.system_role IN ('system_admin'::system_role, 'admin'::system_role)
      AND pr.status = 'active'
  )
);
