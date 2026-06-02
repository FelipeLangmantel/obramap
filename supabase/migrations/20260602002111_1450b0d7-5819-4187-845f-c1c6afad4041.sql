
-- =========================================================
-- 1) diary_items: substituir FOR ALL por políticas separadas
-- =========================================================
DROP POLICY IF EXISTS "diary_items_via_entry" ON public.diary_items;

CREATE POLICY "diary_items_insert_company"
ON public.diary_items
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()
  )
);

CREATE POLICY "diary_items_update_company"
ON public.diary_items
FOR UPDATE
TO authenticated
USING (
  diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()
  )
)
WITH CHECK (
  can_write() AND diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()
  )
);

CREATE POLICY "diary_items_delete_company"
ON public.diary_items
FOR DELETE
TO authenticated
USING (
  can_write() AND diary_entry_id IN (
    SELECT id FROM public.diary_entries WHERE company_id = get_my_company_id()
  )
);

-- =========================================================
-- 2) documentos_obra: substituir FOR ALL por separadas
-- =========================================================
DROP POLICY IF EXISTS "documentos_obra_company" ON public.documentos_obra;

CREATE POLICY "documentos_obra_select_company"
ON public.documentos_obra
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = documentos_obra.obra_id
      AND o.company_id = get_my_company_id()
  )
);

CREATE POLICY "documentos_obra_insert_company"
ON public.documentos_obra
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = documentos_obra.obra_id
      AND o.company_id = get_my_company_id()
  )
);

CREATE POLICY "documentos_obra_update_company"
ON public.documentos_obra
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = documentos_obra.obra_id
      AND o.company_id = get_my_company_id()
  )
)
WITH CHECK (
  can_write() AND EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = documentos_obra.obra_id
      AND o.company_id = get_my_company_id()
  )
);

CREATE POLICY "documentos_obra_delete_company"
ON public.documentos_obra
FOR DELETE
TO authenticated
USING (
  can_write() AND EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = documentos_obra.obra_id
      AND o.company_id = get_my_company_id()
  )
);

-- =========================================================
-- 3) planning_periods: substituir o FOR ALL permissivo
-- =========================================================
DROP POLICY IF EXISTS "Users can manage planning periods of their company" ON public.planning_periods;

CREATE POLICY "Users can insert planning periods of their company"
ON public.planning_periods
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update planning periods of their company"
ON public.planning_periods
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  can_write() AND company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete planning periods of their company"
ON public.planning_periods
FOR DELETE
TO authenticated
USING (
  can_write() AND company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- =========================================================
-- 4) supply_requests: add can_write() em INSERT/UPDATE
-- =========================================================
DROP POLICY IF EXISTS "Users can insert supply requests to their company projects" ON public.supply_requests;
DROP POLICY IF EXISTS "Users can update supply requests of their company projects" ON public.supply_requests;

CREATE POLICY "Users can insert supply requests to their company projects"
ON public.supply_requests
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
);

CREATE POLICY "Users can update supply requests of their company projects"
ON public.supply_requests
FOR UPDATE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
)
WITH CHECK (
  can_write() AND project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
);

-- =========================================================
-- 5) project_service_productivity: add can_write()
-- =========================================================
DROP POLICY IF EXISTS "Users can insert productivity to their company projects" ON public.project_service_productivity;
DROP POLICY IF EXISTS "Users can update productivity of their company projects" ON public.project_service_productivity;
DROP POLICY IF EXISTS "Users can delete productivity of their company projects" ON public.project_service_productivity;

CREATE POLICY "Users can insert productivity to their company projects"
ON public.project_service_productivity
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND (
    company_id = get_my_company_id()
    OR is_system_admin(auth.uid())
  )
);

CREATE POLICY "Users can update productivity of their company projects"
ON public.project_service_productivity
FOR UPDATE
TO authenticated
USING (
  company_id = get_my_company_id() OR is_system_admin(auth.uid())
)
WITH CHECK (
  can_write() AND (
    company_id = get_my_company_id()
    OR is_system_admin(auth.uid())
  )
);

CREATE POLICY "Users can delete productivity of their company projects"
ON public.project_service_productivity
FOR DELETE
TO authenticated
USING (
  can_write() AND (
    company_id = get_my_company_id()
    OR is_system_admin(auth.uid())
  )
);

-- =========================================================
-- 6) project_service_team_composition: substituir FOR ALL
-- =========================================================
DROP POLICY IF EXISTS "Users can manage team composition via productivity" ON public.project_service_team_composition;

CREATE POLICY "team_composition_select_company"
ON public.project_service_team_composition
FOR SELECT
TO authenticated
USING (
  productivity_id IN (
    SELECT id FROM public.project_service_productivity
    WHERE company_id = get_my_company_id()
       OR is_system_admin(auth.uid())
  )
);

CREATE POLICY "team_composition_insert_company"
ON public.project_service_team_composition
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND productivity_id IN (
    SELECT id FROM public.project_service_productivity
    WHERE company_id = get_my_company_id()
       OR is_system_admin(auth.uid())
  )
);

CREATE POLICY "team_composition_update_company"
ON public.project_service_team_composition
FOR UPDATE
TO authenticated
USING (
  productivity_id IN (
    SELECT id FROM public.project_service_productivity
    WHERE company_id = get_my_company_id()
       OR is_system_admin(auth.uid())
  )
)
WITH CHECK (
  can_write() AND productivity_id IN (
    SELECT id FROM public.project_service_productivity
    WHERE company_id = get_my_company_id()
       OR is_system_admin(auth.uid())
  )
);

CREATE POLICY "team_composition_delete_company"
ON public.project_service_team_composition
FOR DELETE
TO authenticated
USING (
  can_write() AND productivity_id IN (
    SELECT id FROM public.project_service_productivity
    WHERE company_id = get_my_company_id()
       OR is_system_admin(auth.uid())
  )
);

-- =========================================================
-- 7) measurement_stock_entries: add can_write() em INSERT/UPDATE
-- =========================================================
DROP POLICY IF EXISTS "Company users can insert measurement_stock_entries" ON public.measurement_stock_entries;
DROP POLICY IF EXISTS "Company users can update measurement_stock_entries" ON public.measurement_stock_entries;

CREATE POLICY "Company users can insert measurement_stock_entries"
ON public.measurement_stock_entries
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
);

CREATE POLICY "Company users can update measurement_stock_entries"
ON public.measurement_stock_entries
FOR UPDATE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
)
WITH CHECK (
  can_write() AND project_id IN (
    SELECT id FROM public.projects WHERE company_id = get_my_company_id()
  )
);

-- =========================================================
-- 8) holding_obra_docs_deleted: add can_write() em INSERT
-- =========================================================
DROP POLICY IF EXISTS "Users can insert deleted docs of their company" ON public.holding_obra_docs_deleted;

CREATE POLICY "Users can insert deleted docs of their company"
ON public.holding_obra_docs_deleted
FOR INSERT
TO authenticated
WITH CHECK (
  can_write() AND EXISTS (
    SELECT 1 FROM public.obras_portfolio o
    WHERE o.id = holding_obra_docs_deleted.obra_id
      AND o.company_id = get_my_company_id()
  )
);

-- =========================================================
-- 9) Storage: restringe leitura do bucket privado 3d-models
-- =========================================================
DROP POLICY IF EXISTS "Company users can view 3d-models" ON storage.objects;

CREATE POLICY "Company users can view 3d-models"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = '3d-models'
  AND (storage.foldername(name))[1] = (get_my_company_id())::text
);
