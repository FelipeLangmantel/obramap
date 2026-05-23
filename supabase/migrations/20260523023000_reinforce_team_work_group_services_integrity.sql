-- =====================================================================
-- Reinforce integrity for shared team work group service links
-- Scope: only Phase 1 shared team work group tables.
-- =====================================================================

-- 1) Fail safely if existing rows point to a group from another company/project.
DO $$
DECLARE
  inconsistent_count integer;
BEGIN
  SELECT count(*)
    INTO inconsistent_count
  FROM public.project_team_work_group_services s
  LEFT JOIN public.project_team_work_groups g
    ON g.id = s.group_id
  WHERE g.id IS NULL
     OR g.project_id <> s.project_id
     OR g.company_id <> s.company_id;

  IF inconsistent_count > 0 THEN
    RAISE EXCEPTION
      'project_team_work_group_services has % inconsistent group link(s). Review data before applying integrity constraint.',
      inconsistent_count;
  END IF;
END $$;

-- 2) Add a composite unique key on the parent so the child can enforce
-- group_id + project_id + company_id consistency with a composite FK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_work_groups_identity_scope
  ON public.project_team_work_groups (id, project_id, company_id);

ALTER TABLE public.project_team_work_group_services
  DROP CONSTRAINT IF EXISTS fk_wg_services_group_project_company;

ALTER TABLE public.project_team_work_group_services
  ADD CONSTRAINT fk_wg_services_group_project_company
  FOREIGN KEY (group_id, project_id, company_id)
  REFERENCES public.project_team_work_groups (id, project_id, company_id)
  ON UPDATE CASCADE
  ON DELETE CASCADE;

-- 3) Recreate only project_team_work_group_services policies so RLS also
-- verifies that the referenced group belongs to the same company/project.
DROP POLICY IF EXISTS sel_wg_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS ins_wg_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS upd_wg_services ON public.project_team_work_group_services;
DROP POLICY IF EXISTS del_wg_services ON public.project_team_work_group_services;

CREATE POLICY sel_wg_services ON public.project_team_work_group_services
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
        AND g.company_id = project_team_work_group_services.company_id
    )
  )
);

CREATE POLICY ins_wg_services ON public.project_team_work_group_services
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
        AND g.company_id = project_team_work_group_services.company_id
    )
  )
);

CREATE POLICY upd_wg_services ON public.project_team_work_group_services
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
        AND g.company_id = project_team_work_group_services.company_id
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
        AND g.company_id = project_team_work_group_services.company_id
    )
  )
);

CREATE POLICY del_wg_services ON public.project_team_work_group_services
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
        AND g.company_id = project_team_work_group_services.company_id
    )
  )
);
