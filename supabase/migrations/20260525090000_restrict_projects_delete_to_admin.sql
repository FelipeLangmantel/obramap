-- Restrict project deletion to company admins and system admins.
-- Editors can still use INSERT/UPDATE policies, but cannot delete projects.

DROP POLICY IF EXISTS "writers delete projects" ON public.projects;
DROP POLICY IF EXISTS "admins delete projects" ON public.projects;

CREATE POLICY "admins delete projects"
ON public.projects
FOR DELETE
USING (
  public.is_system_admin(auth.uid())
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.user_id = auth.uid()
        AND pr.company_id = projects.company_id
        AND pr.status = 'active'
        AND pr.system_role = 'admin'::public.system_role
    )
  )
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  )
);
