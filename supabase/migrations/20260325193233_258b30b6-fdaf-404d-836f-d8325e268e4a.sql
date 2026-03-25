
-- Função que verifica se o usuário pode escrever (admin ou editor)
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'editor')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND system_role IN ('admin', 'system_admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_write() TO authenticated;

-- weekly_productions
DROP POLICY IF EXISTS "Anyone can create weekly_productions" ON public.weekly_productions;
DROP POLICY IF EXISTS "Anyone can update weekly_productions" ON public.weekly_productions;
DROP POLICY IF EXISTS "Anyone can delete weekly_productions" ON public.weekly_productions;
CREATE POLICY "writers_weekly_insert" ON public.weekly_productions FOR INSERT TO authenticated
  WITH CHECK (public.can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "writers_weekly_update" ON public.weekly_productions FOR UPDATE TO authenticated
  USING (public.can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));
CREATE POLICY "writers_weekly_delete" ON public.weekly_productions FOR DELETE TO authenticated
  USING (public.can_write() AND project_id IN (SELECT id FROM projects WHERE company_id = get_my_company_id()));

-- planned_productions
DROP POLICY IF EXISTS "Anyone can create planned_productions" ON public.planned_productions;
DROP POLICY IF EXISTS "Anyone can update planned_productions" ON public.planned_productions;
DROP POLICY IF EXISTS "Anyone can delete planned_productions" ON public.planned_productions;
CREATE POLICY "writers_planned_insert" ON public.planned_productions FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_planned_update" ON public.planned_productions FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_planned_delete" ON public.planned_productions FOR DELETE TO authenticated USING (public.can_write());

-- houses
DROP POLICY IF EXISTS "Anyone can create houses" ON public.houses;
DROP POLICY IF EXISTS "Anyone can update houses" ON public.houses;
DROP POLICY IF EXISTS "Anyone can delete houses" ON public.houses;
CREATE POLICY "writers_houses_insert" ON public.houses FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_houses_update" ON public.houses FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_houses_delete" ON public.houses FOR DELETE TO authenticated USING (public.can_write());

-- obras_portfolio
DROP POLICY IF EXISTS "Anyone can create obras_portfolio" ON public.obras_portfolio;
DROP POLICY IF EXISTS "Anyone can update obras_portfolio" ON public.obras_portfolio;
DROP POLICY IF EXISTS "Anyone can delete obras_portfolio" ON public.obras_portfolio;
CREATE POLICY "writers_obras_insert" ON public.obras_portfolio FOR INSERT TO authenticated
  WITH CHECK (public.can_write() AND company_id = get_my_company_id());
CREATE POLICY "writers_obras_update" ON public.obras_portfolio FOR UPDATE TO authenticated
  USING (public.can_write() AND company_id = get_my_company_id());
CREATE POLICY "writers_obras_delete" ON public.obras_portfolio FOR DELETE TO authenticated
  USING (public.can_write() AND company_id = get_my_company_id());

-- medicoes_ple
DROP POLICY IF EXISTS "Anyone can insert medicoes" ON public.medicoes_ple;
DROP POLICY IF EXISTS "Anyone can update medicoes" ON public.medicoes_ple;
DROP POLICY IF EXISTS "Anyone can delete medicoes" ON public.medicoes_ple;
CREATE POLICY "writers_medicoes_insert" ON public.medicoes_ple FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_medicoes_update" ON public.medicoes_ple FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_medicoes_delete" ON public.medicoes_ple FOR DELETE TO authenticated USING (public.can_write());

-- ind_operation_contexts
DROP POLICY IF EXISTS "Anyone can insert ind_operation_contexts" ON public.ind_operation_contexts;
DROP POLICY IF EXISTS "Anyone can update ind_operation_contexts" ON public.ind_operation_contexts;
DROP POLICY IF EXISTS "Anyone can delete ind_operation_contexts" ON public.ind_operation_contexts;
CREATE POLICY "writers_ind_ctx_insert" ON public.ind_operation_contexts FOR INSERT TO authenticated
  WITH CHECK (public.can_write() AND company_id = get_my_company_id());
CREATE POLICY "writers_ind_ctx_update" ON public.ind_operation_contexts FOR UPDATE TO authenticated
  USING (public.can_write() AND company_id = get_my_company_id());
CREATE POLICY "writers_ind_ctx_delete" ON public.ind_operation_contexts FOR DELETE TO authenticated
  USING (public.can_write() AND company_id = get_my_company_id());

-- ind_production_batches
DROP POLICY IF EXISTS "Anyone can insert ind_production_batches" ON public.ind_production_batches;
DROP POLICY IF EXISTS "Anyone can update ind_production_batches" ON public.ind_production_batches;
DROP POLICY IF EXISTS "Anyone can delete ind_production_batches" ON public.ind_production_batches;
CREATE POLICY "writers_ind_batches_insert" ON public.ind_production_batches FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_ind_batches_update" ON public.ind_production_batches FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_ind_batches_delete" ON public.ind_production_batches FOR DELETE TO authenticated USING (public.can_write());

-- despesas_mensais
DROP POLICY IF EXISTS "Anyone can insert despesas_mensais" ON public.despesas_mensais;
DROP POLICY IF EXISTS "Anyone can update despesas_mensais" ON public.despesas_mensais;
DROP POLICY IF EXISTS "Anyone can delete despesas_mensais" ON public.despesas_mensais;
CREATE POLICY "writers_despesas_insert" ON public.despesas_mensais FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_despesas_update" ON public.despesas_mensais FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_despesas_delete" ON public.despesas_mensais FOR DELETE TO authenticated USING (public.can_write());

-- aditivos_contratos
DROP POLICY IF EXISTS "Anyone can insert aditivos_contratos" ON public.aditivos_contratos;
DROP POLICY IF EXISTS "Anyone can update aditivos_contratos" ON public.aditivos_contratos;
DROP POLICY IF EXISTS "Anyone can delete aditivos_contratos" ON public.aditivos_contratos;
CREATE POLICY "writers_aditivos_insert" ON public.aditivos_contratos FOR INSERT TO authenticated WITH CHECK (public.can_write());
CREATE POLICY "writers_aditivos_update" ON public.aditivos_contratos FOR UPDATE TO authenticated USING (public.can_write());
CREATE POLICY "writers_aditivos_delete" ON public.aditivos_contratos FOR DELETE TO authenticated USING (public.can_write());
