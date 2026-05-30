
-- =========================================================================
-- SECURITY HARDENING: remove FOR ALL policies that let viewers write,
-- replace with SELECT + can_write()-gated writes; fix profile self-escalation;
-- harden create_system_admin; fix diary_edit_requests admin column bug;
-- patch is_company_admin to also recognize system_admin.
-- =========================================================================

-- ----------------------------------------------------------------------
-- 1) PROFILES: block self-escalation via trigger on UPDATE
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_system_admin boolean := false;
  v_is_company_admin boolean := false;
BEGIN
  -- Allow service_role and superusers to bypass entirely (admin tools, edge fns)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (system_role = 'system_admin'), (system_role = 'admin')
    INTO v_is_system_admin, v_is_company_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- System admins can change anything
  IF COALESCE(v_is_system_admin, false) THEN
    RETURN NEW;
  END IF;

  -- Company admins can change other profiles in their own company,
  -- but cannot promote anyone to system_admin
  IF COALESCE(v_is_company_admin, false) THEN
    IF NEW.system_role = 'system_admin' AND OLD.system_role IS DISTINCT FROM 'system_admin' THEN
      RAISE EXCEPTION 'Not allowed to grant system_admin role';
    END IF;
    RETURN NEW;
  END IF;

  -- Regular user editing their own profile: lock down sensitive columns
  IF NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change user_id';
  END IF;
  IF NEW.system_role IS DISTINCT FROM OLD.system_role THEN
    RAISE EXCEPTION 'Not allowed to change system_role';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Not allowed to change company_id';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Not allowed to change status';
  END IF;
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'Not allowed to change must_change_password';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ----------------------------------------------------------------------
-- 2) create_system_admin: require auth, ensure caller matches target
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_system_admin(admin_user_id uuid, admin_email text, admin_display_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF auth.uid() <> admin_user_id THEN
    RAISE EXCEPTION 'Caller must be the user being promoted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE system_role = 'system_admin') THEN
    RAISE EXCEPTION 'System admin already exists';
  END IF;

  INSERT INTO public.profiles (user_id, email, display_name, system_role, status, must_change_password)
  VALUES (admin_user_id, admin_email, admin_display_name, 'system_admin', 'active', false)
  ON CONFLICT (user_id) DO UPDATE SET
    system_role = 'system_admin',
    status = 'active',
    must_change_password = false,
    display_name = EXCLUDED.display_name;

  RETURN true;
END;
$$;

-- ----------------------------------------------------------------------
-- 3) is_company_admin: also recognize system_admin
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND (
        (company_id = _company_id AND system_role = 'admin')
        OR system_role = 'system_admin'
      )
      AND status = 'active'
  )
$$;

-- ----------------------------------------------------------------------
-- 4) Fix diary_edit_requests admin policy: p.id -> p.user_id
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS diary_edit_requests_update_admin ON public.diary_edit_requests;
CREATE POLICY diary_edit_requests_update_admin ON public.diary_edit_requests
FOR UPDATE TO authenticated
USING (
  company_id = get_my_company_id()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND (p.system_role = 'admin' OR p.system_role = 'system_admin')
  )
);

-- ----------------------------------------------------------------------
-- 5) Gate despesa_edit_requests UPDATE with can_write()
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS despesa_edit_req_update ON public.despesa_edit_requests;
CREATE POLICY despesa_edit_req_update ON public.despesa_edit_requests
FOR UPDATE TO authenticated
USING (
  can_write() AND obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()
  )
);

-- ----------------------------------------------------------------------
-- 6) holding_audit_log INSERT requires can_write()
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS holding_audit_log_insert ON public.holding_audit_log;
CREATE POLICY holding_audit_log_insert ON public.holding_audit_log
FOR INSERT TO authenticated
WITH CHECK (
  can_write() AND obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()
  )
);

-- ----------------------------------------------------------------------
-- 7) Drop legacy authenticated INSERT/UPDATE/DELETE policies that have
--    writers_* replacements already in place
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert own company contractor contract services" ON public.contractor_contract_services;
DROP POLICY IF EXISTS "Users can update own company contractor contract services" ON public.contractor_contract_services;
DROP POLICY IF EXISTS "Users can delete own company contractor contract services" ON public.contractor_contract_services;

DROP POLICY IF EXISTS "Users can insert own company contractor contracts" ON public.contractor_contracts;
DROP POLICY IF EXISTS "Users can update own company contractor contracts" ON public.contractor_contracts;
DROP POLICY IF EXISTS "Users can delete own company contractor contracts" ON public.contractor_contracts;

DROP POLICY IF EXISTS "Users can insert own company contractor measurement items" ON public.contractor_measurement_items;
DROP POLICY IF EXISTS "Users can update own company contractor measurement items" ON public.contractor_measurement_items;
DROP POLICY IF EXISTS "Users can delete own company contractor measurement items" ON public.contractor_measurement_items;

DROP POLICY IF EXISTS "Users can insert own company contractor measurements" ON public.contractor_measurements;
DROP POLICY IF EXISTS "Users can update own company contractor measurements" ON public.contractor_measurements;
DROP POLICY IF EXISTS "Users can delete own company contractor measurements" ON public.contractor_measurements;

DROP POLICY IF EXISTS "Company users insert own families" ON public.material_families;
DROP POLICY IF EXISTS "Company users update own families" ON public.material_families;
DROP POLICY IF EXISTS "Company users delete own families" ON public.material_families;

-- ----------------------------------------------------------------------
-- 8) inputs: gate INSERT/UPDATE/DELETE with can_write()
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "Company users insert own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Company users update own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Company users delete own inputs" ON public.inputs;

CREATE POLICY "inputs insert writers" ON public.inputs
FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "inputs update writers" ON public.inputs
FOR UPDATE TO authenticated
USING (can_write() AND company_id = get_my_company_id())
WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "inputs delete writers" ON public.inputs
FOR DELETE TO authenticated
USING (can_write() AND company_id = get_my_company_id());

-- ----------------------------------------------------------------------
-- 9) company_contract_types: gate INSERT/UPDATE/DELETE with can_write()
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS cct_insert ON public.company_contract_types;
DROP POLICY IF EXISTS cct_update ON public.company_contract_types;
DROP POLICY IF EXISTS cct_delete ON public.company_contract_types;

CREATE POLICY cct_insert ON public.company_contract_types
FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cct_update ON public.company_contract_types
FOR UPDATE TO authenticated
USING (can_write() AND company_id = get_my_company_id())
WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cct_delete ON public.company_contract_types
FOR DELETE TO authenticated
USING (can_write() AND company_id = get_my_company_id());

-- ----------------------------------------------------------------------
-- 10) Replace FOR ALL policies with SELECT + write-gated policies
-- ----------------------------------------------------------------------

-- weekly_productions  (writers_* already exist -> just keep SELECT)
DROP POLICY IF EXISTS weekly_productions_company ON public.weekly_productions;
CREATE POLICY weekly_productions_select ON public.weekly_productions
FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

-- obras_portfolio (writers_* exist -> SELECT only)
DROP POLICY IF EXISTS obras_portfolio_company ON public.obras_portfolio;
CREATE POLICY obras_portfolio_select ON public.obras_portfolio
FOR SELECT TO authenticated
USING (company_id = get_my_company_id());

-- medicoes_ple (writers_* exist -> SELECT only)
DROP POLICY IF EXISTS medicoes_ple_company ON public.medicoes_ple;
CREATE POLICY medicoes_ple_select ON public.medicoes_ple
FOR SELECT TO authenticated
USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- Helper macro pattern via repeated DDL for simple company_id = get_my_company_id()
-- cashflow_sim_inputs
DROP POLICY IF EXISTS "Company users manage cashflow_sim_inputs" ON public.cashflow_sim_inputs;
CREATE POLICY cashflow_sim_inputs_select ON public.cashflow_sim_inputs FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY cashflow_sim_inputs_insert ON public.cashflow_sim_inputs FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_sim_inputs_update ON public.cashflow_sim_inputs FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_sim_inputs_delete ON public.cashflow_sim_inputs FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- cashflow_sim_suppliers
DROP POLICY IF EXISTS "Company users manage cashflow_sim_suppliers" ON public.cashflow_sim_suppliers;
CREATE POLICY cashflow_sim_suppliers_select ON public.cashflow_sim_suppliers FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY cashflow_sim_suppliers_insert ON public.cashflow_sim_suppliers FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_sim_suppliers_update ON public.cashflow_sim_suppliers FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_sim_suppliers_delete ON public.cashflow_sim_suppliers FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- cashflow_simulations
DROP POLICY IF EXISTS "Company users manage cashflow_simulations" ON public.cashflow_simulations;
CREATE POLICY cashflow_simulations_select ON public.cashflow_simulations FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY cashflow_simulations_insert ON public.cashflow_simulations FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_simulations_update ON public.cashflow_simulations FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY cashflow_simulations_delete ON public.cashflow_simulations FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- contractor_period_performance
DROP POLICY IF EXISTS "Company isolation for contractor_period_performance" ON public.contractor_period_performance;
CREATE POLICY contractor_period_performance_select ON public.contractor_period_performance FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY contractor_period_performance_insert ON public.contractor_period_performance FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY contractor_period_performance_update ON public.contractor_period_performance FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY contractor_period_performance_delete ON public.contractor_period_performance FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- department_permissions  (extra-sensitive: writes require admin)
DROP POLICY IF EXISTS dept_permissions_company ON public.department_permissions;
CREATE POLICY department_permissions_select ON public.department_permissions FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY department_permissions_insert ON public.department_permissions FOR INSERT TO authenticated WITH CHECK (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());
CREATE POLICY department_permissions_update ON public.department_permissions FOR UPDATE TO authenticated USING (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id()) WITH CHECK (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());
CREATE POLICY department_permissions_delete ON public.department_permissions FOR DELETE TO authenticated USING (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());

-- departments  (writes require admin)
DROP POLICY IF EXISTS departments_manage ON public.departments;
CREATE POLICY departments_insert ON public.departments FOR INSERT TO authenticated WITH CHECK (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());
CREATE POLICY departments_update ON public.departments FOR UPDATE TO authenticated USING (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id()) WITH CHECK (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());
CREATE POLICY departments_delete ON public.departments FOR DELETE TO authenticated USING (is_company_admin(auth.uid(), get_my_company_id()) AND company_id = get_my_company_id());

-- diary_entries
DROP POLICY IF EXISTS diary_entries_company ON public.diary_entries;
CREATE POLICY diary_entries_select ON public.diary_entries FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY diary_entries_insert ON public.diary_entries FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY diary_entries_update ON public.diary_entries FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY diary_entries_delete ON public.diary_entries FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- diary_photos
DROP POLICY IF EXISTS diary_photos_via_entry ON public.diary_photos;
CREATE POLICY diary_photos_select ON public.diary_photos FOR SELECT TO authenticated
USING (diary_entry_id IN (SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()));
CREATE POLICY diary_photos_insert ON public.diary_photos FOR INSERT TO authenticated
WITH CHECK (can_write() AND diary_entry_id IN (SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()));
CREATE POLICY diary_photos_update ON public.diary_photos FOR UPDATE TO authenticated
USING (can_write() AND diary_entry_id IN (SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND diary_entry_id IN (SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()));
CREATE POLICY diary_photos_delete ON public.diary_photos FOR DELETE TO authenticated
USING (can_write() AND diary_entry_id IN (SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()));

-- edit_requests
DROP POLICY IF EXISTS edit_requests_company ON public.edit_requests;
CREATE POLICY edit_requests_select ON public.edit_requests FOR SELECT TO authenticated
USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY edit_requests_insert ON public.edit_requests FOR INSERT TO authenticated
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY edit_requests_update ON public.edit_requests FOR UPDATE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY edit_requests_delete ON public.edit_requests FOR DELETE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- holding_doc_tipos
DROP POLICY IF EXISTS holding_doc_tipos_company ON public.holding_doc_tipos;
CREATE POLICY holding_doc_tipos_select ON public.holding_doc_tipos FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY holding_doc_tipos_insert ON public.holding_doc_tipos FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY holding_doc_tipos_update ON public.holding_doc_tipos FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY holding_doc_tipos_delete ON public.holding_doc_tipos FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- holding_empresas
DROP POLICY IF EXISTS holding_empresas_company ON public.holding_empresas;
CREATE POLICY holding_empresas_select ON public.holding_empresas FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY holding_empresas_insert ON public.holding_empresas FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY holding_empresas_update ON public.holding_empresas FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY holding_empresas_delete ON public.holding_empresas FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- holding_obra_docs
DROP POLICY IF EXISTS holding_obra_docs_company ON public.holding_obra_docs;
CREATE POLICY holding_obra_docs_select ON public.holding_obra_docs FOR SELECT TO authenticated
USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY holding_obra_docs_insert ON public.holding_obra_docs FOR INSERT TO authenticated
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY holding_obra_docs_update ON public.holding_obra_docs FOR UPDATE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY holding_obra_docs_delete ON public.holding_obra_docs FOR DELETE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- ind_planning_grid
DROP POLICY IF EXISTS ind_planning_grid_company ON public.ind_planning_grid;
CREATE POLICY ind_planning_grid_select ON public.ind_planning_grid FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY ind_planning_grid_insert ON public.ind_planning_grid FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY ind_planning_grid_update ON public.ind_planning_grid FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY ind_planning_grid_delete ON public.ind_planning_grid FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- obra_doc_config
DROP POLICY IF EXISTS obra_doc_config_company ON public.obra_doc_config;
CREATE POLICY obra_doc_config_select ON public.obra_doc_config FOR SELECT TO authenticated
USING (obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY obra_doc_config_insert ON public.obra_doc_config FOR INSERT TO authenticated
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY obra_doc_config_update ON public.obra_doc_config FOR UPDATE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY obra_doc_config_delete ON public.obra_doc_config FOR DELETE TO authenticated
USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- ple_projects
DROP POLICY IF EXISTS "Users can manage ple_projects in their company" ON public.ple_projects;
CREATE POLICY ple_projects_select ON public.ple_projects FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY ple_projects_insert ON public.ple_projects FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY ple_projects_update ON public.ple_projects FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY ple_projects_delete ON public.ple_projects FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- ple_entries
DROP POLICY IF EXISTS "Users can manage ple_entries via project" ON public.ple_entries;
CREATE POLICY ple_entries_select ON public.ple_entries FOR SELECT TO authenticated
USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_entries_insert ON public.ple_entries FOR INSERT TO authenticated
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_entries_update ON public.ple_entries FOR UPDATE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_entries_delete ON public.ple_entries FOR DELETE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));

-- ple_event_groups
DROP POLICY IF EXISTS "Users can manage ple_event_groups via project" ON public.ple_event_groups;
CREATE POLICY ple_event_groups_select ON public.ple_event_groups FOR SELECT TO authenticated
USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_event_groups_insert ON public.ple_event_groups FOR INSERT TO authenticated
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_event_groups_update ON public.ple_event_groups FOR UPDATE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_event_groups_delete ON public.ple_event_groups FOR DELETE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));

-- ple_events
DROP POLICY IF EXISTS "Users can manage ple_events via project" ON public.ple_events;
CREATE POLICY ple_events_select ON public.ple_events FOR SELECT TO authenticated
USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_events_insert ON public.ple_events FOR INSERT TO authenticated
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_events_update ON public.ple_events FOR UPDATE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_events_delete ON public.ple_events FOR DELETE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));

-- ple_measurements
DROP POLICY IF EXISTS "Users can manage ple_measurements via project" ON public.ple_measurements;
CREATE POLICY ple_measurements_select ON public.ple_measurements FOR SELECT TO authenticated
USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_measurements_insert ON public.ple_measurements FOR INSERT TO authenticated
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_measurements_update ON public.ple_measurements FOR UPDATE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));
CREATE POLICY ple_measurements_delete ON public.ple_measurements FOR DELETE TO authenticated
USING (can_write() AND ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id = get_my_company_id()));

-- production_deletion_log
DROP POLICY IF EXISTS deletion_log_company ON public.production_deletion_log;
CREATE POLICY production_deletion_log_select ON public.production_deletion_log FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY production_deletion_log_insert ON public.production_deletion_log FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());

-- production_deviations
DROP POLICY IF EXISTS production_deviations_company ON public.production_deviations;
CREATE POLICY production_deviations_select ON public.production_deviations FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY production_deviations_insert ON public.production_deviations FOR INSERT TO authenticated
WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY production_deviations_update ON public.production_deviations FOR UPDATE TO authenticated
USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY production_deviations_delete ON public.production_deviations FOR DELETE TO authenticated
USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

-- project_contracts (keep "System admin full access" untouched)
DROP POLICY IF EXISTS "Company users can manage project_contracts" ON public.project_contracts;
CREATE POLICY project_contracts_select ON public.project_contracts FOR SELECT TO authenticated USING (user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY project_contracts_insert ON public.project_contracts FOR INSERT TO authenticated WITH CHECK (can_write() AND user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY project_contracts_update ON public.project_contracts FOR UPDATE TO authenticated USING (can_write() AND user_belongs_to_company(auth.uid(), company_id)) WITH CHECK (can_write() AND user_belongs_to_company(auth.uid(), company_id));
CREATE POLICY project_contracts_delete ON public.project_contracts FOR DELETE TO authenticated USING (can_write() AND user_belongs_to_company(auth.uid(), company_id));

-- weekly_plan_contractor_log
DROP POLICY IF EXISTS company_isolation_wpcl ON public.weekly_plan_contractor_log;
CREATE POLICY wpcl_select ON public.weekly_plan_contractor_log FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY wpcl_insert ON public.weekly_plan_contractor_log FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY wpcl_update ON public.weekly_plan_contractor_log FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY wpcl_delete ON public.weekly_plan_contractor_log FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- ----------------------------------------------------------------------
-- 11) Tables whose FOR ALL is on {public} role (also need split)
-- ----------------------------------------------------------------------

-- budget_service_inputs (keep view policy)
DROP POLICY IF EXISTS "Users can manage budget inputs of their company" ON public.budget_service_inputs;
CREATE POLICY budget_service_inputs_insert ON public.budget_service_inputs FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY budget_service_inputs_update ON public.budget_service_inputs FOR UPDATE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()))
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY budget_service_inputs_delete ON public.budget_service_inputs FOR DELETE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- period_supply_requirements (keep view)
DROP POLICY IF EXISTS "Users can manage supply requirements of their company" ON public.period_supply_requirements;
CREATE POLICY period_supply_requirements_insert ON public.period_supply_requirements FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY period_supply_requirements_update ON public.period_supply_requirements FOR UPDATE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()))
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY period_supply_requirements_delete ON public.period_supply_requirements FOR DELETE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- purchase_requests
DROP POLICY IF EXISTS "Users manage purchase requests of company" ON public.purchase_requests;
CREATE POLICY purchase_requests_insert ON public.purchase_requests FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY purchase_requests_update ON public.purchase_requests FOR UPDATE TO authenticated
USING (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY purchase_requests_delete ON public.purchase_requests FOR DELETE TO authenticated
USING (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- purchase_request_items
DROP POLICY IF EXISTS "Users manage purchase request items of company" ON public.purchase_request_items;
CREATE POLICY purchase_request_items_insert ON public.purchase_request_items FOR INSERT TO authenticated
WITH CHECK (can_write() AND purchase_request_id IN (
  SELECT pr.id FROM public.purchase_requests pr JOIN public.profiles p ON p.company_id = pr.company_id WHERE p.user_id = auth.uid()
));
CREATE POLICY purchase_request_items_update ON public.purchase_request_items FOR UPDATE TO authenticated
USING (can_write() AND purchase_request_id IN (
  SELECT pr.id FROM public.purchase_requests pr JOIN public.profiles p ON p.company_id = pr.company_id WHERE p.user_id = auth.uid()
))
WITH CHECK (can_write() AND purchase_request_id IN (
  SELECT pr.id FROM public.purchase_requests pr JOIN public.profiles p ON p.company_id = pr.company_id WHERE p.user_id = auth.uid()
));
CREATE POLICY purchase_request_items_delete ON public.purchase_request_items FOR DELETE TO authenticated
USING (can_write() AND purchase_request_id IN (
  SELECT pr.id FROM public.purchase_requests pr JOIN public.profiles p ON p.company_id = pr.company_id WHERE p.user_id = auth.uid()
));

-- service_house_allocations
DROP POLICY IF EXISTS "Users manage house allocations" ON public.service_house_allocations;
CREATE POLICY service_house_allocations_insert ON public.service_house_allocations FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY service_house_allocations_update ON public.service_house_allocations FOR UPDATE TO authenticated
USING (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY service_house_allocations_delete ON public.service_house_allocations FOR DELETE TO authenticated
USING (can_write() AND company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- service_planning_by_period
DROP POLICY IF EXISTS "Users can manage service planning of their company" ON public.service_planning_by_period;
CREATE POLICY service_planning_by_period_insert ON public.service_planning_by_period FOR INSERT TO authenticated
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY service_planning_by_period_update ON public.service_planning_by_period FOR UPDATE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()))
WITH CHECK (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY service_planning_by_period_delete ON public.service_planning_by_period FOR DELETE TO authenticated
USING (can_write() AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- weekly_plan_services
DROP POLICY IF EXISTS "Users can manage weekly plan services for their company" ON public.weekly_plan_services;
CREATE POLICY weekly_plan_services_select ON public.weekly_plan_services FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY weekly_plan_services_insert ON public.weekly_plan_services FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY weekly_plan_services_update ON public.weekly_plan_services FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY weekly_plan_services_delete ON public.weekly_plan_services FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());

-- weekly_plan_weeks
DROP POLICY IF EXISTS "Users can manage weekly plan weeks for their company" ON public.weekly_plan_weeks;
CREATE POLICY weekly_plan_weeks_select ON public.weekly_plan_weeks FOR SELECT TO authenticated USING (company_id = get_my_company_id());
CREATE POLICY weekly_plan_weeks_insert ON public.weekly_plan_weeks FOR INSERT TO authenticated WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY weekly_plan_weeks_update ON public.weekly_plan_weeks FOR UPDATE TO authenticated USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY weekly_plan_weeks_delete ON public.weekly_plan_weeks FOR DELETE TO authenticated USING (can_write() AND company_id = get_my_company_id());
