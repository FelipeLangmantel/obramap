-- 1) Fixa search_path nas 9 funções públicas (mitigação search_path hijack)
ALTER FUNCTION public.calculate_labor_needs(uuid) SET search_path = public;
ALTER FUNCTION public.cleanup_stale_sessions() SET search_path = public;
ALTER FUNCTION public.estimate_service_duration_days(integer, numeric, integer) SET search_path = public;
ALTER FUNCTION public.repair_house_macros_from_productions(uuid) SET search_path = public;
ALTER FUNCTION public.sync_diary_status() SET search_path = public;
ALTER FUNCTION public.update_diary_edit_requests_updated_at() SET search_path = public;
ALTER FUNCTION public.update_project_service_productivity_updated_at() SET search_path = public;
ALTER FUNCTION public.update_supply_requests_updated_at() SET search_path = public;
ALTER FUNCTION public.validate_ind_planning_grid() SET search_path = public;

-- 2) Endurecer RLS de holding_obra_docs_deleted
DROP POLICY IF EXISTS "Company users can manage deleted docs" ON public.holding_obra_docs_deleted;

CREATE POLICY "Users can view deleted docs of their company"
ON public.holding_obra_docs_deleted
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = holding_obra_docs_deleted.obra_id
      AND o.company_id = public.get_my_company_id()
  )
);

CREATE POLICY "Users can insert deleted docs of their company"
ON public.holding_obra_docs_deleted
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = holding_obra_docs_deleted.obra_id
      AND o.company_id = public.get_my_company_id()
  )
);

CREATE POLICY "Users can delete deleted docs of their company"
ON public.holding_obra_docs_deleted
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = holding_obra_docs_deleted.obra_id
      AND o.company_id = public.get_my_company_id()
  )
);

-- 3) Endurecer RLS de ple_glosses
DROP POLICY IF EXISTS "Users can insert glosses" ON public.ple_glosses;
DROP POLICY IF EXISTS "Users can update glosses" ON public.ple_glosses;
DROP POLICY IF EXISTS "Users can delete glosses" ON public.ple_glosses;

CREATE POLICY "Users can insert glosses of their company"
ON public.ple_glosses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ple_projects p
    WHERE p.id = ple_glosses.ple_project_id
      AND p.company_id = public.get_my_company_id()
  )
);

CREATE POLICY "Users can update glosses of their company"
ON public.ple_glosses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ple_projects p
    WHERE p.id = ple_glosses.ple_project_id
      AND p.company_id = public.get_my_company_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ple_projects p
    WHERE p.id = ple_glosses.ple_project_id
      AND p.company_id = public.get_my_company_id()
  )
);

CREATE POLICY "Users can delete glosses of their company"
ON public.ple_glosses
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.ple_projects p
    WHERE p.id = ple_glosses.ple_project_id
      AND p.company_id = public.get_my_company_id()
  )
);