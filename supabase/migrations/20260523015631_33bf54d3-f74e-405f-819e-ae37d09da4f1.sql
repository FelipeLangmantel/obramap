
-- =====================================================================
-- FASE 1 — Frentes Compartilhadas / Grupos de Equipe
-- Apenas base persistente: 3 tabelas + RLS + auditoria
-- Não toca tabelas existentes, policies existentes, nem storage.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 project_team_work_groups
-- ---------------------------------------------------------------------
CREATE TABLE public.project_team_work_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  base_unit text,
  productivity_value numeric,
  productivity_unit text,
  working_days_per_week numeric DEFAULT 5,
  simultaneous_team_count numeric DEFAULT 1,
  professional_count numeric DEFAULT 0 CHECK (professional_count >= 0),
  auxiliary_count numeric DEFAULT 0 CHECK (auxiliary_count >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_groups_company ON public.project_team_work_groups (company_id);
CREATE INDEX idx_work_groups_project ON public.project_team_work_groups (project_id);
CREATE INDEX idx_work_groups_project_active ON public.project_team_work_groups (project_id, active);
CREATE UNIQUE INDEX uq_work_groups_proj_name
  ON public.project_team_work_groups (project_id, lower(name))
  WHERE active = true;

-- ---------------------------------------------------------------------
-- 1.2 project_team_work_group_services
-- ---------------------------------------------------------------------
CREATE TABLE public.project_team_work_group_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.project_team_work_groups(id) ON DELETE CASCADE,
  macro_id text,
  scope_id text,
  service_name text,
  sequence_order integer,
  lag_days numeric DEFAULT 0,
  productivity_override numeric,
  productivity_unit_override text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wg_services_group ON public.project_team_work_group_services (group_id);
CREATE INDEX idx_wg_services_project ON public.project_team_work_group_services (project_id);
CREATE INDEX idx_wg_services_macro ON public.project_team_work_group_services (macro_id);
CREATE INDEX idx_wg_services_scope ON public.project_team_work_group_services (scope_id);
CREATE UNIQUE INDEX uq_work_group_services_link
  ON public.project_team_work_group_services
     (project_id, group_id, COALESCE(macro_id,''), COALESCE(scope_id,''))
  WHERE active = true;

-- ---------------------------------------------------------------------
-- 1.3 project_service_planning_settings
-- ---------------------------------------------------------------------
CREATE TABLE public.project_service_planning_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  project_id uuid NOT NULL,
  macro_id text,
  scope_id text,
  service_name text,
  service_planning_type text NOT NULL DEFAULT 'physical_repetitive'
    CHECK (service_planning_type IN (
      'physical_repetitive','physical_one_time','administrative_cost',
      'support_service','milestone','hidden_from_planning','undefined'
    )),
  include_in_gantt boolean NOT NULL DEFAULT true,
  include_in_line_of_balance boolean NOT NULL DEFAULT true,
  include_in_weekly_planning boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sps_company ON public.project_service_planning_settings (company_id);
CREATE INDEX idx_sps_project ON public.project_service_planning_settings (project_id);
CREATE INDEX idx_sps_macro ON public.project_service_planning_settings (macro_id);
CREATE INDEX idx_sps_scope ON public.project_service_planning_settings (scope_id);
CREATE INDEX idx_sps_type ON public.project_service_planning_settings (service_planning_type);
CREATE UNIQUE INDEX uq_service_planning_settings_key
  ON public.project_service_planning_settings
     (project_id, COALESCE(macro_id,''), COALESCE(scope_id,''));

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.project_team_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_team_work_group_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_service_planning_settings ENABLE ROW LEVEL SECURITY;

-- ---- project_team_work_groups ----
CREATE POLICY sel_work_groups ON public.project_team_work_groups
FOR SELECT TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_groups.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY ins_work_groups ON public.project_team_work_groups
FOR INSERT TO authenticated
WITH CHECK (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_groups.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY upd_work_groups ON public.project_team_work_groups
FOR UPDATE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_groups.project_id
        AND p.company_id = get_my_company_id()
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
      WHERE p.id = project_team_work_groups.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY del_work_groups ON public.project_team_work_groups
FOR DELETE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_team_work_groups.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

-- ---- project_team_work_group_services ----
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
  )
);

-- ---- project_service_planning_settings ----
CREATE POLICY sel_sps ON public.project_service_planning_settings
FOR SELECT TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_service_planning_settings.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY ins_sps ON public.project_service_planning_settings
FOR INSERT TO authenticated
WITH CHECK (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_service_planning_settings.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY upd_sps ON public.project_service_planning_settings
FOR UPDATE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_service_planning_settings.project_id
        AND p.company_id = get_my_company_id()
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
      WHERE p.id = project_service_planning_settings.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

CREATE POLICY del_sps ON public.project_service_planning_settings
FOR DELETE TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_service_planning_settings.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

-- =====================================================================
-- Triggers: updated_at + auditoria
-- =====================================================================
CREATE TRIGGER trg_updated_at_work_groups
BEFORE UPDATE ON public.project_team_work_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_work_groups
AFTER INSERT OR UPDATE OR DELETE ON public.project_team_work_groups
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_updated_at_wg_services
BEFORE UPDATE ON public.project_team_work_group_services
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_wg_services
AFTER INSERT OR UPDATE OR DELETE ON public.project_team_work_group_services
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_updated_at_sps
BEFORE UPDATE ON public.project_service_planning_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_audit_sps
AFTER INSERT OR UPDATE OR DELETE ON public.project_service_planning_settings
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
