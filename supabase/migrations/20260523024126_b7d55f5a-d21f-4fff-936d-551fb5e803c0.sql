-- 1. Unique composta no pai (necessária para FK composta)
ALTER TABLE public.project_team_work_groups
  ADD CONSTRAINT project_team_work_groups_id_project_company_key
  UNIQUE (id, project_id, company_id);

-- 2. Troca FK simples por FK composta
ALTER TABLE public.project_team_work_group_services
  DROP CONSTRAINT IF EXISTS project_team_work_group_services_group_id_fkey;

ALTER TABLE public.project_team_work_group_services
  ADD CONSTRAINT project_team_work_group_services_group_scope_fkey
  FOREIGN KEY (group_id, project_id, company_id)
  REFERENCES public.project_team_work_groups (id, project_id, company_id)
  ON DELETE CASCADE;

-- 3. Recria policies separadas por verbo com validação tripla
DROP POLICY IF EXISTS sel_project_team_work_group_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS ins_project_team_work_group_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS upd_project_team_work_group_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS del_project_team_work_group_services ON public.project_team_work_group_services;

CREATE POLICY sel_project_team_work_group_services
ON public.project_team_work_group_services
FOR SELECT TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_group_services.project_id
        AND p.company_id = get_my_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_services.group_id
        AND g.project_id = project_team_work_group_services.project_id
        AND g.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY ins_project_team_work_group_services
ON public.project_team_work_group_services
FOR INSERT TO authenticated
WITH CHECK (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_group_services.project_id
        AND p.company_id = get_my_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_services.group_id
        AND g.project_id = project_team_work_group_services.project_id
        AND g.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY upd_project_team_work_group_services
ON public.project_team_work_group_services
FOR UPDATE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_group_services.project_id
        AND p.company_id = get_my_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_services.group_id
        AND g.project_id = project_team_work_group_services.project_id
        AND g.company_id = get_my_company_id()
    )
  )
)
WITH CHECK (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_group_services.project_id
        AND p.company_id = get_my_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_services.group_id
        AND g.project_id = project_team_work_group_services.project_id
        AND g.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY del_project_team_work_group_services
ON public.project_team_work_group_services
FOR DELETE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_group_services.project_id
        AND p.company_id = get_my_company_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_services.group_id
        AND g.project_id = project_team_work_group_services.project_id
        AND g.company_id = get_my_company_id()
    )
  )
);