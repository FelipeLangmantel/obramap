-- Fase 6A: composicao detalhada por profissao nas frentes compartilhadas.
-- Mantem os campos agregados em project_team_work_groups como compatibilidade.

CREATE TABLE IF NOT EXISTS public.project_team_work_group_composition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  project_id uuid NOT NULL,
  company_id uuid NOT NULL,
  profession_name text NOT NULL,
  normalized_profession_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('professional', 'helper')),
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_team_work_group_composition_group_fkey
    FOREIGN KEY (group_id, project_id, company_id)
    REFERENCES public.project_team_work_groups (id, project_id, company_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wg_composition_group
  ON public.project_team_work_group_composition (group_id);

CREATE INDEX IF NOT EXISTS idx_wg_composition_project
  ON public.project_team_work_group_composition (project_id);

CREATE INDEX IF NOT EXISTS idx_wg_composition_company
  ON public.project_team_work_group_composition (company_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wg_composition_profession_role
  ON public.project_team_work_group_composition (group_id, normalized_profession_name, role);

ALTER TABLE public.project_team_work_group_composition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_project_team_work_group_composition ON public.project_team_work_group_composition;
DROP POLICY IF EXISTS ins_project_team_work_group_composition ON public.project_team_work_group_composition;
DROP POLICY IF EXISTS upd_project_team_work_group_composition ON public.project_team_work_group_composition;
DROP POLICY IF EXISTS del_project_team_work_group_composition ON public.project_team_work_group_composition;

CREATE POLICY sel_project_team_work_group_composition
ON public.project_team_work_group_composition
FOR SELECT
USING (
  public.is_system_admin()
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_team_work_group_composition.project_id
        AND p.company_id = project_team_work_group_composition.company_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_composition.group_id
        AND g.project_id = project_team_work_group_composition.project_id
        AND g.company_id = project_team_work_group_composition.company_id
    )
  )
);

CREATE POLICY ins_project_team_work_group_composition
ON public.project_team_work_group_composition
FOR INSERT
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_team_work_group_composition.project_id
        AND p.company_id = project_team_work_group_composition.company_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_composition.group_id
        AND g.project_id = project_team_work_group_composition.project_id
        AND g.company_id = project_team_work_group_composition.company_id
    )
  )
);

CREATE POLICY upd_project_team_work_group_composition
ON public.project_team_work_group_composition
FOR UPDATE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_team_work_group_composition.project_id
        AND p.company_id = project_team_work_group_composition.company_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_composition.group_id
        AND g.project_id = project_team_work_group_composition.project_id
        AND g.company_id = project_team_work_group_composition.company_id
    )
  )
)
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_team_work_group_composition.project_id
        AND p.company_id = project_team_work_group_composition.company_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_composition.group_id
        AND g.project_id = project_team_work_group_composition.project_id
        AND g.company_id = project_team_work_group_composition.company_id
    )
  )
);

CREATE POLICY del_project_team_work_group_composition
ON public.project_team_work_group_composition
FOR DELETE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_team_work_group_composition.project_id
        AND p.company_id = project_team_work_group_composition.company_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.project_team_work_groups g
      WHERE g.id = project_team_work_group_composition.group_id
        AND g.project_id = project_team_work_group_composition.project_id
        AND g.company_id = project_team_work_group_composition.company_id
    )
  )
);

CREATE TRIGGER trg_project_team_work_group_composition_updated_at
BEFORE UPDATE ON public.project_team_work_group_composition
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
