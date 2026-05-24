
-- Fix: delivery_checklist_templates - add tenant scope on writes
DROP POLICY IF EXISTS "Admins can manage delivery_checklist_templates" ON public.delivery_checklist_templates;
CREATE POLICY "Admins can manage delivery_checklist_templates"
ON public.delivery_checklist_templates
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
);

-- Fix: indirect_costs - add can_write() to write policies
DROP POLICY IF EXISTS "Company writers can delete indirect_costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Company writers can insert indirect_costs" ON public.indirect_costs;
DROP POLICY IF EXISTS "Company writers can update indirect_costs" ON public.indirect_costs;

CREATE POLICY "Company writers can delete indirect_costs"
ON public.indirect_costs FOR DELETE
USING (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "Company writers can insert indirect_costs"
ON public.indirect_costs FOR INSERT
WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

CREATE POLICY "Company writers can update indirect_costs"
ON public.indirect_costs FOR UPDATE
USING (company_id = public.get_my_company_id() AND public.can_write())
WITH CHECK (company_id = public.get_my_company_id() AND public.can_write());

-- Fix: project_contract_services - add can_write()
DROP POLICY IF EXISTS "Users can delete contract services from their company" ON public.project_contract_services;
DROP POLICY IF EXISTS "Users can insert contract services for their company" ON public.project_contract_services;
DROP POLICY IF EXISTS "Users can update contract services from their company" ON public.project_contract_services;

CREATE POLICY "Users can delete contract services from their company"
ON public.project_contract_services FOR DELETE
USING (
  company_id = public.get_my_company_id() AND public.can_write()
);

CREATE POLICY "Users can insert contract services for their company"
ON public.project_contract_services FOR INSERT
WITH CHECK (
  company_id = public.get_my_company_id() AND public.can_write()
);

CREATE POLICY "Users can update contract services from their company"
ON public.project_contract_services FOR UPDATE
USING (
  company_id = public.get_my_company_id() AND public.can_write()
)
WITH CHECK (
  company_id = public.get_my_company_id() AND public.can_write()
);

-- Fix: scope_items - add tenant scope on writes
DROP POLICY IF EXISTS "Editors and admins can delete scope_items" ON public.scope_items;
DROP POLICY IF EXISTS "Editors and admins can insert scope_items" ON public.scope_items;
DROP POLICY IF EXISTS "Editors and admins can update scope_items" ON public.scope_items;

CREATE POLICY "Editors and admins can delete scope_items"
ON public.scope_items FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role))
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
);

CREATE POLICY "Editors and admins can insert scope_items"
ON public.scope_items FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role))
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
);

CREATE POLICY "Editors and admins can update scope_items"
ON public.scope_items FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role))
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'editor'::app_role))
  AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
);

-- Fix: storage UPDATE policies for diary-photos and diary-signatures
CREATE POLICY "diary_photos_update_company"
ON storage.objects FOR UPDATE
USING (bucket_id = 'diary-photos' AND (storage.foldername(name))[1] = (public.get_my_company_id())::text)
WITH CHECK (bucket_id = 'diary-photos' AND (storage.foldername(name))[1] = (public.get_my_company_id())::text);

CREATE POLICY "diary_signatures_update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'diary-signatures' AND (storage.foldername(name))[1] = (public.get_my_company_id())::text)
WITH CHECK (bucket_id = 'diary-signatures' AND (storage.foldername(name))[1] = (public.get_my_company_id())::text);
