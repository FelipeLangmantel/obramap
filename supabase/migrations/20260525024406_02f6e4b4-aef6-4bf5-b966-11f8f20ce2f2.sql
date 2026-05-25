
-- =========================================================
-- Harden write policies: require can_write() (admin/editor)
-- =========================================================

-- Helper: replace a USING-only write policy (INSERT/UPDATE/DELETE) so it requires can_write()

-- --- contractors family + suppliers/units/material_families ---
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'contractors','contractor_contracts','contractor_contract_services',
    'contractor_measurements','contractor_measurement_items',
    'suppliers','material_families','units'
  ]) LOOP
    -- find and drop existing write policies, recreate with can_write
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own company %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own company %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own company %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company users insert own %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company users update own %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Company users delete own %1$s" ON public.%1$s', t);
  END LOOP;
END $$;

-- recreate writes for contractors / contractor_* with can_write()
CREATE POLICY "writers insert contractors" ON public.contractors FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update contractors" ON public.contractors FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete contractors" ON public.contractors FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert contractor_contracts" ON public.contractor_contracts FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update contractor_contracts" ON public.contractor_contracts FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete contractor_contracts" ON public.contractor_contracts FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert contractor_contract_services" ON public.contractor_contract_services FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update contractor_contract_services" ON public.contractor_contract_services FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete contractor_contract_services" ON public.contractor_contract_services FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert contractor_measurements" ON public.contractor_measurements FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update contractor_measurements" ON public.contractor_measurements FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete contractor_measurements" ON public.contractor_measurements FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert contractor_measurement_items" ON public.contractor_measurement_items FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update contractor_measurement_items" ON public.contractor_measurement_items FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete contractor_measurement_items" ON public.contractor_measurement_items FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update suppliers" ON public.suppliers FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete suppliers" ON public.suppliers FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert material_families" ON public.material_families FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update material_families" ON public.material_families FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete material_families" ON public.material_families FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

CREATE POLICY "writers insert units" ON public.units FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update units" ON public.units FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete units" ON public.units FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

-- materials: writes already restricted to admins via "Admins can manage materials". Wrap with can_write() for consistency.
DROP POLICY IF EXISTS "Admins can manage materials" ON public.materials;
CREATE POLICY "Admins can insert materials" ON public.materials FOR INSERT WITH CHECK (can_write() AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = auth.uid() AND pr.company_id = materials.company_id AND pr.system_role = ANY (ARRAY['system_admin'::system_role, 'admin'::system_role]) AND pr.status = 'active'));
CREATE POLICY "Admins can update materials" ON public.materials FOR UPDATE USING (can_write() AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = auth.uid() AND pr.company_id = materials.company_id AND pr.system_role = ANY (ARRAY['system_admin'::system_role, 'admin'::system_role]) AND pr.status = 'active'));
CREATE POLICY "Admins can delete materials" ON public.materials FOR DELETE USING (can_write() AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = auth.uid() AND pr.company_id = materials.company_id AND pr.system_role = ANY (ARRAY['system_admin'::system_role, 'admin'::system_role]) AND pr.status = 'active'));

-- ============= PROJECTS =============
DROP POLICY IF EXISTS projects_access_policy ON public.projects;
-- Existing SELECT and DELETE-admin policies remain. Add admin/editor write policies.
CREATE POLICY "writers insert projects" ON public.projects FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers update projects" ON public.projects FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY "writers delete projects" ON public.projects FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

-- ============= INDUSTRIAL (ind_*) =============
-- For tables with company_id direct
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ind_zones','ind_shipments','ind_installation_schedule','ind_lifting_schedule',
    'ind_factory_models','ind_periods','ind_services','ind_factories','ind_trucks',
    'ind_lifting_equipment','ind_demand_entries','ind_service_configs','ind_unit_kits',
    'ind_units','ind_factory_context_rules'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Company isolation" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Company read %1$s" ON public.%1$I FOR SELECT USING (company_id = get_my_company_id() OR is_system_admin(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "Writers insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())))', t);
    EXECUTE format('CREATE POLICY "Writers update %1$s" ON public.%1$I FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())))', t);
    EXECUTE format('CREATE POLICY "Writers delete %1$s" ON public.%1$I FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())))', t);
  END LOOP;
END $$;

-- ind_operation_contexts and ind_production_batches: already have can_write writers; just drop the redundant ALL and add a SELECT
DROP POLICY IF EXISTS "Company isolation" ON public.ind_operation_contexts;
CREATE POLICY "Company read ind_operation_contexts" ON public.ind_operation_contexts FOR SELECT USING (company_id = get_my_company_id() OR is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Company isolation" ON public.ind_production_batches;
CREATE POLICY "Company read ind_production_batches" ON public.ind_production_batches FOR SELECT USING (company_id = get_my_company_id() OR is_system_admin(auth.uid()));

-- ind_* tables scoped through context_id -> ind_operation_contexts
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['ind_batch_units','ind_demand_units','ind_installation_units','ind_lifting_units','ind_shipment_units']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Company isolation" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Company read %1$s" ON public.%1$I FOR SELECT USING (context_id IN (SELECT id FROM ind_operation_contexts WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (can_write() AND (context_id IN (SELECT id FROM ind_operation_contexts WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers update %1$s" ON public.%1$I FOR UPDATE USING (can_write() AND (context_id IN (SELECT id FROM ind_operation_contexts WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (context_id IN (SELECT id FROM ind_operation_contexts WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers delete %1$s" ON public.%1$I FOR DELETE USING (can_write() AND (context_id IN (SELECT id FROM ind_operation_contexts WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())))$f$, t);
  END LOOP;
END $$;

-- ind_factory_capacities (factory_id -> ind_factories)
DROP POLICY IF EXISTS "Company isolation" ON public.ind_factory_capacities;
CREATE POLICY "Company read ind_factory_capacities" ON public.ind_factory_capacities FOR SELECT USING (factory_id IN (SELECT id FROM ind_factories WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()));
CREATE POLICY "Writers insert ind_factory_capacities" ON public.ind_factory_capacities FOR INSERT WITH CHECK (can_write() AND (factory_id IN (SELECT id FROM ind_factories WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));
CREATE POLICY "Writers update ind_factory_capacities" ON public.ind_factory_capacities FOR UPDATE USING (can_write() AND (factory_id IN (SELECT id FROM ind_factories WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (factory_id IN (SELECT id FROM ind_factories WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));
CREATE POLICY "Writers delete ind_factory_capacities" ON public.ind_factory_capacities FOR DELETE USING (can_write() AND (factory_id IN (SELECT id FROM ind_factories WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));

-- ind_model_positions (model_id -> ind_factory_models)
DROP POLICY IF EXISTS "Company isolation" ON public.ind_model_positions;
CREATE POLICY "Company read ind_model_positions" ON public.ind_model_positions FOR SELECT USING (model_id IN (SELECT id FROM ind_factory_models WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()));
CREATE POLICY "Writers insert ind_model_positions" ON public.ind_model_positions FOR INSERT WITH CHECK (can_write() AND (model_id IN (SELECT id FROM ind_factory_models WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));
CREATE POLICY "Writers update ind_model_positions" ON public.ind_model_positions FOR UPDATE USING (can_write() AND (model_id IN (SELECT id FROM ind_factory_models WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (model_id IN (SELECT id FROM ind_factory_models WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));
CREATE POLICY "Writers delete ind_model_positions" ON public.ind_model_positions FOR DELETE USING (can_write() AND (model_id IN (SELECT id FROM ind_factory_models WHERE company_id = get_my_company_id()) OR is_system_admin(auth.uid())));

-- ============= DIARY (diary_*) =============
DO $$
DECLARE t text; pname text;
BEGIN
  FOR t, pname IN SELECT * FROM (VALUES
    ('diary_activities','diary_activities_company'),
    ('diary_attachments','diary_attachments_company'),
    ('diary_checklist','diary_checklist_company'),
    ('diary_comments','diary_comments_company'),
    ('diary_equipment','diary_equipment_company'),
    ('diary_labor','diary_labor_company'),
    ('diary_occurrences','diary_occurrences_company'),
    ('diary_signatures','diary_signatures_company'),
    ('diary_views','diary_views_company'),
    ('diary_item_corrections','corrections_company'),
    ('diary_item_delete_requests','delete_req_all_company')
  ) AS v(t,pname) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pname, t);
    EXECUTE format('CREATE POLICY "Company read %1$s" ON public.%1$I FOR SELECT USING (company_id = get_my_company_id())', t);
    EXECUTE format('CREATE POLICY "Writers insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id())', t);
    EXECUTE format('CREATE POLICY "Writers update %1$s" ON public.%1$I FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id())', t);
    EXECUTE format('CREATE POLICY "Writers delete %1$s" ON public.%1$I FOR DELETE USING (can_write() AND company_id = get_my_company_id())', t);
  END LOOP;
END $$;

-- ============= MAP / QUADRAS / PROJECT_* (project_id scoped) =============
DO $$
DECLARE t text; pname text;
BEGIN
  FOR t, pname IN SELECT * FROM (VALUES
    ('quadras','Company users manage quadras'),
    ('map_layouts','Company users manage map_layouts'),
    ('map_mesh_house_assignments','Company users manage map_mesh_house_assignments'),
    ('map_layer_stage_links','Company users manage map_layer_stage_links'),
    ('project_3d_models','Company users manage project_3d_models'),
    ('project_ifc_elements','Company users manage project_ifc_elements'),
    ('project_ifc_element_links','Company users manage project_ifc_element_links'),
    ('project_ifc_activation_rules','Company users manage project_ifc_activation_rules'),
    ('project_model_meshes','Company users manage project_model_meshes'),
    ('project_lead_times','project_lead_times_company')
  ) AS v(t,pname) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pname, t);
    EXECUTE format($f$CREATE POLICY "Company read %1$s" ON public.%1$I FOR SELECT USING (project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers update %1$s" ON public.%1$I FOR UPDATE USING (can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id())) WITH CHECK (can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))$f$, t);
    EXECUTE format($f$CREATE POLICY "Writers delete %1$s" ON public.%1$I FOR DELETE USING (can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()))$f$, t);
  END LOOP;
END $$;

-- project_model_parts (company_id + project_id)
DROP POLICY IF EXISTS "Company users manage project_model_parts" ON public.project_model_parts;
CREATE POLICY "Company read project_model_parts" ON public.project_model_parts FOR SELECT USING (company_id = get_my_company_id() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "Writers insert project_model_parts" ON public.project_model_parts FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "Writers update project_model_parts" ON public.project_model_parts FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "Writers delete project_model_parts" ON public.project_model_parts FOR DELETE USING (can_write() AND company_id = get_my_company_id());

-- ============= project_unit_types / project_unit_capacities =============
DROP POLICY IF EXISTS "Company members can insert unit types" ON public.project_unit_types;
DROP POLICY IF EXISTS "Company members can update unit types" ON public.project_unit_types;
DROP POLICY IF EXISTS "Company members can delete unit types" ON public.project_unit_types;
CREATE POLICY "Writers insert project_unit_types" ON public.project_unit_types FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers update project_unit_types" ON public.project_unit_types FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers delete project_unit_types" ON public.project_unit_types FOR DELETE USING (can_write() AND company_id = get_my_company_id());

DROP POLICY IF EXISTS "Company members can insert capacities" ON public.project_unit_capacities;
DROP POLICY IF EXISTS "Company members can update capacities" ON public.project_unit_capacities;
DROP POLICY IF EXISTS "Company members can delete capacities" ON public.project_unit_capacities;
CREATE POLICY "Writers insert project_unit_capacities" ON public.project_unit_capacities FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers update project_unit_capacities" ON public.project_unit_capacities FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers delete project_unit_capacities" ON public.project_unit_capacities FOR DELETE USING (can_write() AND company_id = get_my_company_id());

-- ============= weekly_plan_config =============
DROP POLICY IF EXISTS "Users can manage weekly plan config for their company" ON public.weekly_plan_config;
CREATE POLICY "Company read weekly_plan_config" ON public.weekly_plan_config FOR SELECT USING (company_id = get_my_company_id());
CREATE POLICY "Writers insert weekly_plan_config" ON public.weekly_plan_config FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers update weekly_plan_config" ON public.weekly_plan_config FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Writers delete weekly_plan_config" ON public.weekly_plan_config FOR DELETE USING (can_write() AND company_id = get_my_company_id());

-- ============= labor_histogram / service_* =============
DROP POLICY IF EXISTS lh_insert ON public.labor_histogram;
DROP POLICY IF EXISTS lh_update ON public.labor_histogram;
DROP POLICY IF EXISTS lh_delete ON public.labor_histogram;
CREATE POLICY lh_insert ON public.labor_histogram FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY lh_update ON public.labor_histogram FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY lh_delete ON public.labor_histogram FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

DROP POLICY IF EXISTS sp_insert ON public.service_productivities;
DROP POLICY IF EXISTS sp_update ON public.service_productivities;
DROP POLICY IF EXISTS sp_delete ON public.service_productivities;
CREATE POLICY sp_insert ON public.service_productivities FOR INSERT WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY sp_update ON public.service_productivities FOR UPDATE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid()))) WITH CHECK (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));
CREATE POLICY sp_delete ON public.service_productivities FOR DELETE USING (can_write() AND (company_id = get_my_company_id() OR is_system_admin(auth.uid())));

DROP POLICY IF EXISTS shc_company_insert ON public.service_house_capacities;
DROP POLICY IF EXISTS shc_company_update ON public.service_house_capacities;
DROP POLICY IF EXISTS shc_company_delete ON public.service_house_capacities;
CREATE POLICY shc_company_insert ON public.service_house_capacities FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY shc_company_update ON public.service_house_capacities FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY shc_company_delete ON public.service_house_capacities FOR DELETE USING (can_write() AND company_id = get_my_company_id());

DROP POLICY IF EXISTS sdc_company_insert ON public.service_default_capacities;
DROP POLICY IF EXISTS sdc_company_update ON public.service_default_capacities;
DROP POLICY IF EXISTS sdc_company_delete ON public.service_default_capacities;
CREATE POLICY sdc_company_insert ON public.service_default_capacities FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY sdc_company_update ON public.service_default_capacities FOR UPDATE USING (can_write() AND company_id = get_my_company_id()) WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY sdc_company_delete ON public.service_default_capacities FOR DELETE USING (can_write() AND company_id = get_my_company_id());

-- ============= diary_edit_log (insert-only audit, leave SELECT as is) =============
DROP POLICY IF EXISTS diary_edit_log_company_insert ON public.diary_edit_log;
CREATE POLICY diary_edit_log_company_insert ON public.diary_edit_log FOR INSERT WITH CHECK (can_write() AND company_id = get_my_company_id());
