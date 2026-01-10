-- Consolidar políticas RLS para projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "projects_access_policy" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Editors can view company projects" ON public.projects;
DROP POLICY IF EXISTS "Editors can update company projects" ON public.projects;
DROP POLICY IF EXISTS "Editors can delete company projects" ON public.projects;

-- Política unificada para todas as operações
CREATE POLICY projects_access_policy
ON public.projects
FOR ALL
TO authenticated
USING (
  is_system_admin(auth.uid())
  OR company_id = get_my_company_id()
)
WITH CHECK (
  is_system_admin(auth.uid())
  OR company_id = get_my_company_id()
);