
-- =========================================================
-- 1) PUBLIC TABLE WRITE POLICIES — add company scoping
-- =========================================================

-- Helper macro pattern: drop loose policies and recreate with company scope.

-- aditivos_contratos (obra_id -> obras_portfolio.company_id)
DROP POLICY IF EXISTS writers_aditivos_insert ON public.aditivos_contratos;
DROP POLICY IF EXISTS writers_aditivos_update ON public.aditivos_contratos;
DROP POLICY IF EXISTS writers_aditivos_delete ON public.aditivos_contratos;
CREATE POLICY writers_aditivos_insert ON public.aditivos_contratos FOR INSERT
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY writers_aditivos_update ON public.aditivos_contratos FOR UPDATE
  USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY writers_aditivos_delete ON public.aditivos_contratos FOR DELETE
  USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- despesas_mensais (obra_id)
DROP POLICY IF EXISTS writers_despesas_insert ON public.despesas_mensais;
DROP POLICY IF EXISTS writers_despesas_delete ON public.despesas_mensais;
CREATE POLICY writers_despesas_insert ON public.despesas_mensais FOR INSERT
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY writers_despesas_delete ON public.despesas_mensais FOR DELETE
  USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- medicoes_ple (obra_id)
DROP POLICY IF EXISTS writers_medicoes_insert ON public.medicoes_ple;
DROP POLICY IF EXISTS writers_medicoes_update ON public.medicoes_ple;
DROP POLICY IF EXISTS writers_medicoes_delete ON public.medicoes_ple;
CREATE POLICY writers_medicoes_insert ON public.medicoes_ple FOR INSERT
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY writers_medicoes_update ON public.medicoes_ple FOR UPDATE
  USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));
CREATE POLICY writers_medicoes_delete ON public.medicoes_ple FOR DELETE
  USING (can_write() AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = get_my_company_id()));

-- houses (project_id -> projects.company_id)
DROP POLICY IF EXISTS writers_houses_insert ON public.houses;
DROP POLICY IF EXISTS writers_houses_update ON public.houses;
DROP POLICY IF EXISTS writers_houses_delete ON public.houses;
CREATE POLICY writers_houses_insert ON public.houses FOR INSERT
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_houses_update ON public.houses FOR UPDATE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_houses_delete ON public.houses FOR DELETE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

-- planned_productions (project_id)
DROP POLICY IF EXISTS writers_planned_insert ON public.planned_productions;
DROP POLICY IF EXISTS writers_planned_update ON public.planned_productions;
DROP POLICY IF EXISTS writers_planned_delete ON public.planned_productions;
CREATE POLICY writers_planned_insert ON public.planned_productions FOR INSERT
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_planned_update ON public.planned_productions FOR UPDATE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_planned_delete ON public.planned_productions FOR DELETE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

-- weekly_productions (project_id) — ensure all three are scoped
DROP POLICY IF EXISTS writers_weekly_insert ON public.weekly_productions;
DROP POLICY IF EXISTS writers_weekly_update ON public.weekly_productions;
DROP POLICY IF EXISTS writers_weekly_delete ON public.weekly_productions;
CREATE POLICY writers_weekly_insert ON public.weekly_productions FOR INSERT
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_weekly_update ON public.weekly_productions FOR UPDATE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));
CREATE POLICY writers_weekly_delete ON public.weekly_productions FOR DELETE
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

-- ind_production_batches (company_id direct)
DROP POLICY IF EXISTS writers_ind_batches_insert ON public.ind_production_batches;
DROP POLICY IF EXISTS writers_ind_batches_update ON public.ind_production_batches;
DROP POLICY IF EXISTS writers_ind_batches_delete ON public.ind_production_batches;
CREATE POLICY writers_ind_batches_insert ON public.ind_production_batches FOR INSERT
  WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY writers_ind_batches_update ON public.ind_production_batches FOR UPDATE
  USING (can_write() AND company_id = get_my_company_id())
  WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY writers_ind_batches_delete ON public.ind_production_batches FOR DELETE
  USING (can_write() AND company_id = get_my_company_id());

-- invoice_items (company_id direct)
DROP POLICY IF EXISTS "Editors can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Editors can update invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Editors can delete invoice_items" ON public.invoice_items;
CREATE POLICY "Editors can insert invoice_items" ON public.invoice_items FOR INSERT
  WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Editors can update invoice_items" ON public.invoice_items FOR UPDATE
  USING (can_write() AND company_id = get_my_company_id())
  WITH CHECK (can_write() AND company_id = get_my_company_id());
CREATE POLICY "Editors can delete invoice_items" ON public.invoice_items FOR DELETE
  USING (can_write() AND company_id = get_my_company_id());

-- Generic project_id-based tables
DROP POLICY IF EXISTS "Editors can manage planning_alerts" ON public.planning_alerts;
CREATE POLICY "Editors can manage planning_alerts" ON public.planning_alerts FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Editors can manage delivery_issues" ON public.delivery_issues;
CREATE POLICY "Editors can manage delivery_issues" ON public.delivery_issues FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Editors can manage purchase_orders" ON public.purchase_orders;
CREATE POLICY "Editors can manage purchase_orders" ON public.purchase_orders FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Editors can manage quotation_requests" ON public.quotation_requests;
CREATE POLICY "Editors can manage quotation_requests" ON public.quotation_requests FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Editors can manage labor_contracts" ON public.labor_contracts;
CREATE POLICY "Editors can manage labor_contracts" ON public.labor_contracts FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Editors can manage planning_simulations" ON public.planning_simulations;
CREATE POLICY "Editors can manage planning_simulations" ON public.planning_simulations FOR ALL
  USING (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()))
  WITH CHECK (can_write() AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id()));

DROP POLICY IF EXISTS "Admins can manage board_decisions" ON public.board_decisions;
CREATE POLICY "Admins can manage board_decisions" ON public.board_decisions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role)
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  );

-- delivery_tracking (purchase_order_id -> purchase_orders.project_id -> projects.company_id)
DROP POLICY IF EXISTS "Editors can manage delivery_tracking" ON public.delivery_tracking;
CREATE POLICY "Editors can manage delivery_tracking" ON public.delivery_tracking FOR ALL
  USING (
    can_write() AND purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      JOIN public.projects p ON p.id = po.project_id
      WHERE p.company_id = get_my_company_id()
    )
  )
  WITH CHECK (
    can_write() AND purchase_order_id IN (
      SELECT po.id FROM public.purchase_orders po
      JOIN public.projects p ON p.id = po.project_id
      WHERE p.company_id = get_my_company_id()
    )
  );

-- =========================================================
-- 2) user_permissions / user_roles — restrict to same company
-- =========================================================
DROP POLICY IF EXISTS "Admins can manage user_permissions" ON public.user_permissions;
CREATE POLICY "Admins can manage user_permissions" ON public.user_permissions FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id IN (SELECT user_id FROM public.profiles WHERE company_id = get_my_company_id())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id IN (SELECT user_id FROM public.profiles WHERE company_id = get_my_company_id())
  );

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles in their company" ON public.user_roles FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id IN (SELECT user_id FROM public.profiles WHERE company_id = get_my_company_id())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND user_id IN (SELECT user_id FROM public.profiles WHERE company_id = get_my_company_id())
  );
-- Allow system_admin to manage all roles (no company scope)
CREATE POLICY "System admins can manage all roles" ON public.user_roles FOR ALL
  USING (is_system_admin(auth.uid()))
  WITH CHECK (is_system_admin(auth.uid()));

-- =========================================================
-- 3) company_modules bug fix
-- =========================================================
DROP POLICY IF EXISTS "Company members can read their modules" ON public.company_modules;
CREATE POLICY "Company members can read their modules" ON public.company_modules FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- =========================================================
-- 4) Storage policies
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view 3d-models" ON storage.objects;
CREATE POLICY "Company users can view 3d-models" ON storage.objects FOR SELECT
  USING (
    bucket_id = '3d-models'
    AND (storage.foldername(name))[1] = (get_my_company_id())::text
  );

-- Remove the redundant overlapping holding-documents upload policy (obra-based);
-- the company-scoped upload policy already enforces correct scope.
DROP POLICY IF EXISTS company_upload_holding_docs ON storage.objects;
