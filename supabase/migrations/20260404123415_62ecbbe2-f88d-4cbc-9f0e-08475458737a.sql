
-- CASHFLOW
DROP POLICY IF EXISTS "Users can manage cashflow sim inputs for their company" ON public.cashflow_sim_inputs;
CREATE POLICY "Company users manage cashflow_sim_inputs" ON public.cashflow_sim_inputs FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Users can manage cashflow sim suppliers for their company" ON public.cashflow_sim_suppliers;
CREATE POLICY "Company users manage cashflow_sim_suppliers" ON public.cashflow_sim_suppliers FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Users can manage cashflow simulations for their company" ON public.cashflow_simulations;
CREATE POLICY "Company users manage cashflow_simulations" ON public.cashflow_simulations FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());

-- PUBLIC TABLES
DROP POLICY IF EXISTS "Anyone can view quadras" ON public.quadras;
DROP POLICY IF EXISTS "Anyone can create quadras" ON public.quadras;
DROP POLICY IF EXISTS "Anyone can update quadras" ON public.quadras;
DROP POLICY IF EXISTS "Anyone can delete quadras" ON public.quadras;
CREATE POLICY "Company users manage quadras" ON public.quadras FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Anyone can view map_layouts" ON public.map_layouts;
DROP POLICY IF EXISTS "Anyone can create map_layouts" ON public.map_layouts;
DROP POLICY IF EXISTS "Anyone can update map_layouts" ON public.map_layouts;
DROP POLICY IF EXISTS "Anyone can delete map_layouts" ON public.map_layouts;
CREATE POLICY "Company users manage map_layouts" ON public.map_layouts FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Users can manage layer links" ON public.map_layer_stage_links;
DROP POLICY IF EXISTS "Users can view layer links for their projects" ON public.map_layer_stage_links;
CREATE POLICY "Company users manage map_layer_stage_links" ON public.map_layer_stage_links FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

-- HOUSES / PLANNED_PRODUCTIONS / PRODUCTIVITY
DROP POLICY IF EXISTS "Anyone can view houses" ON public.houses;
CREATE POLICY "Company users can view houses" ON public.houses FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Anyone can view planned_productions" ON public.planned_productions;
CREATE POLICY "Company users can view planned_productions" ON public.planned_productions FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Anyone can view productivity_library" ON public.productivity_library;
CREATE POLICY "Company users can view productivity_library" ON public.productivity_library FOR SELECT TO authenticated
  USING (project_id IS NULL OR project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

-- INDIRECT COSTS
DROP POLICY IF EXISTS "Users can view indirect costs for their projects" ON public.indirect_costs;
DROP POLICY IF EXISTS "Users can insert indirect costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Users can update indirect costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Users can delete indirect costs" ON public.indirect_costs;
CREATE POLICY "Company users can view indirect_costs" ON public.indirect_costs FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
CREATE POLICY "Company writers can insert indirect_costs" ON public.indirect_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "Company writers can update indirect_costs" ON public.indirect_costs FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()) WITH CHECK (company_id = public.get_my_company_id());
CREATE POLICY "Company writers can delete indirect_costs" ON public.indirect_costs FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- AUDIT LOG
DROP POLICY IF EXISTS "audit_log_company_read" ON public.audit_log;
CREATE POLICY "audit_log_company_read" ON public.audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin(auth.uid()));

-- CROSS-COMPANY LEAKS (project_id tables)
DROP POLICY IF EXISTS "Authenticated users can view board_decisions" ON public.board_decisions;
CREATE POLICY "Company users can view board_decisions" ON public.board_decisions FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view planning_stages" ON public.planning_stages;
CREATE POLICY "Company users can view planning_stages" ON public.planning_stages FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view planning_baselines" ON public.planning_baselines;
CREATE POLICY "Company users can view planning_baselines" ON public.planning_baselines FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view planning_simulations" ON public.planning_simulations;
CREATE POLICY "Company users can view planning_simulations" ON public.planning_simulations FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view planning_teams" ON public.planning_teams;
CREATE POLICY "Company users can view planning_teams" ON public.planning_teams FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view planning_alerts" ON public.planning_alerts;
CREATE POLICY "Company users can view planning_alerts" ON public.planning_alerts FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view daily_work_logs" ON public.daily_work_logs;
CREATE POLICY "Company users can view daily_work_logs" ON public.daily_work_logs FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view scope_items" ON public.scope_items;
CREATE POLICY "Company users can view scope_items" ON public.scope_items FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view scope_costs" ON public.scope_costs;
CREATE POLICY "Company users can view scope_costs" ON public.scope_costs FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view labor_contracts" ON public.labor_contracts;
CREATE POLICY "Company users can view labor_contracts" ON public.labor_contracts FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view delivery_inspections" ON public.delivery_inspections;
CREATE POLICY "Company users can view delivery_inspections" ON public.delivery_inspections FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view delivery_checklist_items" ON public.delivery_checklist_items;
CREATE POLICY "Company users can view delivery_checklist_items" ON public.delivery_checklist_items FOR SELECT TO authenticated
  USING (inspection_id IN (SELECT id FROM public.delivery_inspections WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())));

DROP POLICY IF EXISTS "Authenticated users can view delivery_checklist_templates" ON public.delivery_checklist_templates;
CREATE POLICY "Company users can view delivery_checklist_templates" ON public.delivery_checklist_templates FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view delivery_issues" ON public.delivery_issues;
CREATE POLICY "Company users can view delivery_issues" ON public.delivery_issues FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view delivery_tracking" ON public.delivery_tracking;
CREATE POLICY "Company users can view delivery_tracking" ON public.delivery_tracking FOR SELECT TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())));

DROP POLICY IF EXISTS "Authenticated users can view financial_entries" ON public.financial_entries;
CREATE POLICY "Company users can view financial_entries" ON public.financial_entries FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
CREATE POLICY "Company users can view invoices" ON public.invoices FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Authenticated users can view invoice_items" ON public.invoice_items;
CREATE POLICY "Company users can view invoice_items" ON public.invoice_items FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Authenticated users can view category_lead_times" ON public.category_lead_times;
CREATE POLICY "Company users can view category_lead_times" ON public.category_lead_times FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view measurement stock entries" ON public.measurement_stock_entries;
CREATE POLICY "Company users can view measurement_stock_entries" ON public.measurement_stock_entries FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view purchase_orders" ON public.purchase_orders;
CREATE POLICY "Company users can view purchase_orders" ON public.purchase_orders FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Company users can view purchase_order_items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())));

DROP POLICY IF EXISTS "Authenticated users can view quotation_requests" ON public.quotation_requests;
CREATE POLICY "Company users can view quotation_requests" ON public.quotation_requests FOR SELECT TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

DROP POLICY IF EXISTS "Authenticated users can view quotation_items" ON public.quotation_items;
CREATE POLICY "Company users can view quotation_items" ON public.quotation_items FOR SELECT TO authenticated
  USING (quotation_id IN (SELECT id FROM public.quotation_requests WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())));

DROP POLICY IF EXISTS "Authenticated users can view supplier_quotes" ON public.supplier_quotes;
CREATE POLICY "Company users can view supplier_quotes" ON public.supplier_quotes FOR SELECT TO authenticated
  USING (quotation_item_id IN (SELECT id FROM public.quotation_items WHERE quotation_id IN (SELECT id FROM public.quotation_requests WHERE project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))));

-- 3D STORAGE
DROP POLICY IF EXISTS "Anyone can view 3d-models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload 3d-models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update 3d-models" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete 3d-models" ON storage.objects;

CREATE POLICY "Authenticated users can view 3d-models" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = '3d-models');
CREATE POLICY "Company users can upload 3d-models" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = '3d-models' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
CREATE POLICY "Company users can update 3d-models" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = '3d-models' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
CREATE POLICY "Company users can delete 3d-models" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = '3d-models' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
