-- Fase 7B: macrofluxo persistente do Planejamento Inteligente.
-- Macrofluxo organiza pacotes/frentes apenas para planejamento, sem alterar producao real.

CREATE TABLE IF NOT EXISTS public.planning_macroflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_macroflows_identity_project_company_uniq
    UNIQUE (id, project_id, company_id)
);

CREATE TABLE IF NOT EXISTS public.planning_macroflow_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  macroflow_id uuid NOT NULL REFERENCES public.planning_macroflows(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  company_id uuid NOT NULL,
  predecessor_type text NOT NULL CHECK (predecessor_type IN ('service', 'work_group')),
  predecessor_key text NOT NULL,
  predecessor_label text NOT NULL,
  successor_type text NOT NULL CHECK (successor_type IN ('service', 'work_group')),
  successor_key text NOT NULL,
  successor_label text NOT NULL,
  relation_type text NOT NULL DEFAULT 'FS' CHECK (relation_type IN ('FS', 'SS')),
  lag_days integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_macroflow_dependencies_same_package_chk
    CHECK (predecessor_type <> successor_type OR predecessor_key <> successor_key),
  CONSTRAINT planning_macroflow_dependencies_macroflow_project_fkey
    FOREIGN KEY (macroflow_id, project_id, company_id)
    REFERENCES public.planning_macroflows(id, project_id, company_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_macroflows_active_project
  ON public.planning_macroflows(project_id)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_macroflow_dependencies_relation
  ON public.planning_macroflow_dependencies(
    macroflow_id,
    predecessor_type,
    predecessor_key,
    successor_type,
    successor_key
  );

CREATE INDEX IF NOT EXISTS idx_planning_macroflows_project
  ON public.planning_macroflows(project_id);

CREATE INDEX IF NOT EXISTS idx_planning_macroflow_dependencies_macroflow
  ON public.planning_macroflow_dependencies(macroflow_id);

ALTER TABLE public.planning_macroflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_macroflow_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_planning_macroflows ON public.planning_macroflows;
DROP POLICY IF EXISTS ins_planning_macroflows ON public.planning_macroflows;
DROP POLICY IF EXISTS upd_planning_macroflows ON public.planning_macroflows;
DROP POLICY IF EXISTS del_planning_macroflows ON public.planning_macroflows;

CREATE POLICY sel_planning_macroflows
ON public.planning_macroflows
FOR SELECT
USING (
  public.is_system_admin()
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = planning_macroflows.project_id
        AND p.company_id = planning_macroflows.company_id
    )
  )
);

CREATE POLICY ins_planning_macroflows
ON public.planning_macroflows
FOR INSERT
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = planning_macroflows.project_id
        AND p.company_id = planning_macroflows.company_id
    )
  )
);

CREATE POLICY upd_planning_macroflows
ON public.planning_macroflows
FOR UPDATE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = planning_macroflows.project_id
        AND p.company_id = planning_macroflows.company_id
    )
  )
)
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = planning_macroflows.project_id
        AND p.company_id = planning_macroflows.company_id
    )
  )
);

CREATE POLICY del_planning_macroflows
ON public.planning_macroflows
FOR DELETE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = planning_macroflows.project_id
        AND p.company_id = planning_macroflows.company_id
    )
  )
);

DROP POLICY IF EXISTS sel_planning_macroflow_dependencies ON public.planning_macroflow_dependencies;
DROP POLICY IF EXISTS ins_planning_macroflow_dependencies ON public.planning_macroflow_dependencies;
DROP POLICY IF EXISTS upd_planning_macroflow_dependencies ON public.planning_macroflow_dependencies;
DROP POLICY IF EXISTS del_planning_macroflow_dependencies ON public.planning_macroflow_dependencies;

CREATE POLICY sel_planning_macroflow_dependencies
ON public.planning_macroflow_dependencies
FOR SELECT
USING (
  public.is_system_admin()
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_dependencies.macroflow_id
        AND f.project_id = planning_macroflow_dependencies.project_id
        AND f.company_id = planning_macroflow_dependencies.company_id
    )
  )
);

CREATE POLICY ins_planning_macroflow_dependencies
ON public.planning_macroflow_dependencies
FOR INSERT
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_dependencies.macroflow_id
        AND f.project_id = planning_macroflow_dependencies.project_id
        AND f.company_id = planning_macroflow_dependencies.company_id
    )
  )
);

CREATE POLICY upd_planning_macroflow_dependencies
ON public.planning_macroflow_dependencies
FOR UPDATE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_dependencies.macroflow_id
        AND f.project_id = planning_macroflow_dependencies.project_id
        AND f.company_id = planning_macroflow_dependencies.company_id
    )
  )
)
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_dependencies.macroflow_id
        AND f.project_id = planning_macroflow_dependencies.project_id
        AND f.company_id = planning_macroflow_dependencies.company_id
    )
  )
);

CREATE POLICY del_planning_macroflow_dependencies
ON public.planning_macroflow_dependencies
FOR DELETE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_dependencies.macroflow_id
        AND f.project_id = planning_macroflow_dependencies.project_id
        AND f.company_id = planning_macroflow_dependencies.company_id
    )
  )
);

DROP TRIGGER IF EXISTS trg_planning_macroflows_updated_at ON public.planning_macroflows;
CREATE TRIGGER trg_planning_macroflows_updated_at
BEFORE UPDATE ON public.planning_macroflows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_planning_macroflow_dependencies_updated_at ON public.planning_macroflow_dependencies;
CREATE TRIGGER trg_planning_macroflow_dependencies_updated_at
BEFORE UPDATE ON public.planning_macroflow_dependencies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
