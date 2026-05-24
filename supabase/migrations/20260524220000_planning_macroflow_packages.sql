-- Fase 7H: pacotes pertencentes a cada macrofluxo persistente.
-- Macrofluxo = nome + pacotes incluidos + dependencias. Nao altera producao real.

CREATE TABLE IF NOT EXISTS public.planning_macroflow_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  macroflow_id uuid NOT NULL REFERENCES public.planning_macroflows(id) ON DELETE CASCADE,
  package_type text NOT NULL CHECK (package_type IN ('service', 'work_group')),
  package_key text NOT NULL,
  package_label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT planning_macroflow_packages_macroflow_project_fkey
    FOREIGN KEY (macroflow_id, project_id, company_id)
    REFERENCES public.planning_macroflows(id, project_id, company_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_planning_macroflow_packages_key
  ON public.planning_macroflow_packages(macroflow_id, package_key);

CREATE INDEX IF NOT EXISTS idx_planning_macroflow_packages_macroflow
  ON public.planning_macroflow_packages(macroflow_id);

CREATE INDEX IF NOT EXISTS idx_planning_macroflow_packages_project
  ON public.planning_macroflow_packages(project_id);

ALTER TABLE public.planning_macroflow_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sel_planning_macroflow_packages ON public.planning_macroflow_packages;
DROP POLICY IF EXISTS ins_planning_macroflow_packages ON public.planning_macroflow_packages;
DROP POLICY IF EXISTS upd_planning_macroflow_packages ON public.planning_macroflow_packages;
DROP POLICY IF EXISTS del_planning_macroflow_packages ON public.planning_macroflow_packages;

CREATE POLICY sel_planning_macroflow_packages
ON public.planning_macroflow_packages
FOR SELECT
USING (
  public.is_system_admin()
  OR (
    company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_packages.macroflow_id
        AND f.project_id = planning_macroflow_packages.project_id
        AND f.company_id = planning_macroflow_packages.company_id
    )
  )
);

CREATE POLICY ins_planning_macroflow_packages
ON public.planning_macroflow_packages
FOR INSERT
WITH CHECK (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_packages.macroflow_id
        AND f.project_id = planning_macroflow_packages.project_id
        AND f.company_id = planning_macroflow_packages.company_id
    )
  )
);

CREATE POLICY upd_planning_macroflow_packages
ON public.planning_macroflow_packages
FOR UPDATE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_packages.macroflow_id
        AND f.project_id = planning_macroflow_packages.project_id
        AND f.company_id = planning_macroflow_packages.company_id
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
      WHERE f.id = planning_macroflow_packages.macroflow_id
        AND f.project_id = planning_macroflow_packages.project_id
        AND f.company_id = planning_macroflow_packages.company_id
    )
  )
);

CREATE POLICY del_planning_macroflow_packages
ON public.planning_macroflow_packages
FOR DELETE
USING (
  public.is_system_admin()
  OR (
    public.can_write()
    AND company_id = public.get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.planning_macroflows f
      WHERE f.id = planning_macroflow_packages.macroflow_id
        AND f.project_id = planning_macroflow_packages.project_id
        AND f.company_id = planning_macroflow_packages.company_id
    )
  )
);

DROP TRIGGER IF EXISTS trg_planning_macroflow_packages_updated_at ON public.planning_macroflow_packages;
CREATE TRIGGER trg_planning_macroflow_packages_updated_at
BEFORE UPDATE ON public.planning_macroflow_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
