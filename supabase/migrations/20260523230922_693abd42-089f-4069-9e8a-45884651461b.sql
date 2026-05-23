
-- =========================================================================
-- 1. Make 3d-models bucket private
-- =========================================================================
UPDATE storage.buckets SET public = false WHERE id = '3d-models';

-- =========================================================================
-- 2. Add missing UPDATE policy on holding-documents bucket
-- =========================================================================
DROP POLICY IF EXISTS "Company-scoped update holding documents" ON storage.objects;
CREATE POLICY "Company-scoped update holding documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'holding-documents'
  AND (storage.foldername(name))[1] = (get_my_company_id())::text
)
WITH CHECK (
  bucket_id = 'holding-documents'
  AND (storage.foldername(name))[1] = (get_my_company_id())::text
);

-- =========================================================================
-- 3. Tighten write RLS on tables that had role-only checks
-- Pattern: keep SELECT policies untouched; replace write policies with
--   can_write() AND project belongs to caller's company (or system_admin).
-- =========================================================================

-- ---- scope_costs ----
DROP POLICY IF EXISTS "Admins can delete scope_costs" ON public.scope_costs;
DROP POLICY IF EXISTS "Editors and admins can insert scope_costs" ON public.scope_costs;
DROP POLICY IF EXISTS "Editors and admins can update scope_costs" ON public.scope_costs;

CREATE POLICY "Editors can insert scope_costs" ON public.scope_costs
FOR INSERT TO authenticated
WITH CHECK (
  can_write() AND (
    is_system_admin(auth.uid())
    OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  )
);
CREATE POLICY "Editors can update scope_costs" ON public.scope_costs
FOR UPDATE TO authenticated
USING (
  can_write() AND (
    is_system_admin(auth.uid())
    OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  )
)
WITH CHECK (
  can_write() AND (
    is_system_admin(auth.uid())
    OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  )
);
CREATE POLICY "Editors can delete scope_costs" ON public.scope_costs
FOR DELETE TO authenticated
USING (
  can_write() AND (
    is_system_admin(auth.uid())
    OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())
  )
);

-- ---- helper macro: generate similar policies for project_id tables ----
-- We'll inline for each:

-- planning_stages
DROP POLICY IF EXISTS "Editors can manage planning_stages" ON public.planning_stages;
CREATE POLICY "Editors can insert planning_stages" ON public.planning_stages FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update planning_stages" ON public.planning_stages FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete planning_stages" ON public.planning_stages FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- planning_baselines
DROP POLICY IF EXISTS "Editors can manage planning_baselines" ON public.planning_baselines;
CREATE POLICY "Editors can insert planning_baselines" ON public.planning_baselines FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update planning_baselines" ON public.planning_baselines FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete planning_baselines" ON public.planning_baselines FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- planning_teams
DROP POLICY IF EXISTS "Editors can manage planning_teams" ON public.planning_teams;
CREATE POLICY "Editors can insert planning_teams" ON public.planning_teams FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update planning_teams" ON public.planning_teams FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete planning_teams" ON public.planning_teams FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- financial_entries
DROP POLICY IF EXISTS "Editors can insert financial_entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Editors can update financial_entries" ON public.financial_entries;
DROP POLICY IF EXISTS "Editors can delete financial_entries" ON public.financial_entries;
CREATE POLICY "Editors can insert financial_entries" ON public.financial_entries FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update financial_entries" ON public.financial_entries FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete financial_entries" ON public.financial_entries FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- invoices (has company_id directly)
DROP POLICY IF EXISTS "Editors can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Editors can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Editors can delete invoices" ON public.invoices;
CREATE POLICY "Editors can insert invoices" ON public.invoices FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR company_id = get_my_company_id()));
CREATE POLICY "Editors can update invoices" ON public.invoices FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR company_id = get_my_company_id()))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR company_id = get_my_company_id()));
CREATE POLICY "Editors can delete invoices" ON public.invoices FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR company_id = get_my_company_id()));

-- delivery_inspections
DROP POLICY IF EXISTS "Editors can manage delivery_inspections" ON public.delivery_inspections;
CREATE POLICY "Editors can insert delivery_inspections" ON public.delivery_inspections FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update delivery_inspections" ON public.delivery_inspections FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete delivery_inspections" ON public.delivery_inspections FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- delivery_checklist_items (scoped via inspection_id -> delivery_inspections.project_id)
DROP POLICY IF EXISTS "Editors can manage delivery_checklist_items" ON public.delivery_checklist_items;
CREATE POLICY "Editors can insert delivery_checklist_items" ON public.delivery_checklist_items FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR inspection_id IN (
  SELECT di.id FROM public.delivery_inspections di
  JOIN public.projects p ON p.id = di.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can update delivery_checklist_items" ON public.delivery_checklist_items FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR inspection_id IN (
  SELECT di.id FROM public.delivery_inspections di
  JOIN public.projects p ON p.id = di.project_id
  WHERE p.company_id = get_my_company_id()
)))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR inspection_id IN (
  SELECT di.id FROM public.delivery_inspections di
  JOIN public.projects p ON p.id = di.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can delete delivery_checklist_items" ON public.delivery_checklist_items FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR inspection_id IN (
  SELECT di.id FROM public.delivery_inspections di
  JOIN public.projects p ON p.id = di.project_id
  WHERE p.company_id = get_my_company_id()
)));

-- daily_work_logs
DROP POLICY IF EXISTS "Editors can manage daily_work_logs" ON public.daily_work_logs;
CREATE POLICY "Editors can insert daily_work_logs" ON public.daily_work_logs FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update daily_work_logs" ON public.daily_work_logs FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete daily_work_logs" ON public.daily_work_logs FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- purchase_order_items (scoped via purchase_order_id -> purchase_orders.project_id)
DROP POLICY IF EXISTS "Editors can manage purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "Editors can insert purchase_order_items" ON public.purchase_order_items FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR purchase_order_id IN (
  SELECT po.id FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can update purchase_order_items" ON public.purchase_order_items FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR purchase_order_id IN (
  SELECT po.id FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE p.company_id = get_my_company_id()
)))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR purchase_order_id IN (
  SELECT po.id FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can delete purchase_order_items" ON public.purchase_order_items FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR purchase_order_id IN (
  SELECT po.id FROM public.purchase_orders po
  JOIN public.projects p ON p.id = po.project_id
  WHERE p.company_id = get_my_company_id()
)));

-- quotation_items (scoped via quotation_id -> quotation_requests.project_id)
DROP POLICY IF EXISTS "Editors can manage quotation_items" ON public.quotation_items;
CREATE POLICY "Editors can insert quotation_items" ON public.quotation_items FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR quotation_id IN (
  SELECT qr.id FROM public.quotation_requests qr
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can update quotation_items" ON public.quotation_items FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR quotation_id IN (
  SELECT qr.id FROM public.quotation_requests qr
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR quotation_id IN (
  SELECT qr.id FROM public.quotation_requests qr
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can delete quotation_items" ON public.quotation_items FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR quotation_id IN (
  SELECT qr.id FROM public.quotation_requests qr
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));

-- supplier_quotes (scoped via quotation_item_id -> quotation_items -> quotation_requests.project_id)
DROP POLICY IF EXISTS "Editors can manage supplier_quotes" ON public.supplier_quotes;
CREATE POLICY "Editors can insert supplier_quotes" ON public.supplier_quotes FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR quotation_item_id IN (
  SELECT qi.id FROM public.quotation_items qi
  JOIN public.quotation_requests qr ON qr.id = qi.quotation_id
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can update supplier_quotes" ON public.supplier_quotes FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR quotation_item_id IN (
  SELECT qi.id FROM public.quotation_items qi
  JOIN public.quotation_requests qr ON qr.id = qi.quotation_id
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR quotation_item_id IN (
  SELECT qi.id FROM public.quotation_items qi
  JOIN public.quotation_requests qr ON qr.id = qi.quotation_id
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));
CREATE POLICY "Editors can delete supplier_quotes" ON public.supplier_quotes FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR quotation_item_id IN (
  SELECT qi.id FROM public.quotation_items qi
  JOIN public.quotation_requests qr ON qr.id = qi.quotation_id
  JOIN public.projects p ON p.id = qr.project_id
  WHERE p.company_id = get_my_company_id()
)));

-- productivity_library
DROP POLICY IF EXISTS "Editors can manage productivity_library" ON public.productivity_library;
CREATE POLICY "Editors can insert productivity_library" ON public.productivity_library FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update productivity_library" ON public.productivity_library FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete productivity_library" ON public.productivity_library FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));

-- category_lead_times
DROP POLICY IF EXISTS "Editors can manage category_lead_times" ON public.category_lead_times;
CREATE POLICY "Editors can insert category_lead_times" ON public.category_lead_times FOR INSERT TO authenticated
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can update category_lead_times" ON public.category_lead_times FOR UPDATE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())))
WITH CHECK (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
CREATE POLICY "Editors can delete category_lead_times" ON public.category_lead_times FOR DELETE TO authenticated
USING (can_write() AND (is_system_admin(auth.uid()) OR project_id IN (SELECT id FROM public.projects WHERE company_id = get_my_company_id())));
