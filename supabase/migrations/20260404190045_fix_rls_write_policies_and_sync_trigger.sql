-- =============================================================
-- FIX 1: fn_sync_supply_request_to_alert used wrong column
-- supply_alerts.scope_item_id does not exist - correct key is
-- project_id + family_id + measurement_id
-- =============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_supply_request_to_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.supply_alerts
    SET
      status = CASE
        WHEN NEW.status = 'quoted'    THEN 'quoted'
        WHEN NEW.status = 'ordered'   THEN 'ordered'
        WHEN NEW.status = 'delivered' THEN 'delivered'
        ELSE supply_alerts.status
      END,
      updated_at = now()
    WHERE supply_alerts.project_id = NEW.project_id
      AND supply_alerts.family_id  = NEW.family_id
      AND (
        supply_alerts.measurement_id = NEW.measurement_id
        OR (supply_alerts.measurement_id IS NULL AND NEW.measurement_id IS NULL)
      )
      AND supply_alerts.status NOT IN ('delivered', 'contracted');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_supply_request_to_alert ON public.supply_requests;
CREATE TRIGGER trg_sync_supply_request_to_alert
  AFTER UPDATE ON public.supply_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_supply_request_to_alert();

-- =============================================================
-- FIX 2: Write policies were using can_write() without company
-- scoping. For multi-tenant safety, add company_id filter.
-- =============================================================

-- houses: join via project_id → projects.company_id
DROP POLICY IF EXISTS "writers_houses_insert" ON public.houses;
DROP POLICY IF EXISTS "writers_houses_update" ON public.houses;
DROP POLICY IF EXISTS "writers_houses_delete" ON public.houses;
CREATE POLICY "writers_houses_insert" ON public.houses FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_houses_update" ON public.houses FOR UPDATE TO authenticated
  USING (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_houses_delete" ON public.houses FOR DELETE TO authenticated
  USING (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );

-- planned_productions: same via project_id
DROP POLICY IF EXISTS "writers_planned_insert" ON public.planned_productions;
DROP POLICY IF EXISTS "writers_planned_update" ON public.planned_productions;
DROP POLICY IF EXISTS "writers_planned_delete" ON public.planned_productions;
CREATE POLICY "writers_planned_insert" ON public.planned_productions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_planned_update" ON public.planned_productions FOR UPDATE TO authenticated
  USING (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_planned_delete" ON public.planned_productions FOR DELETE TO authenticated
  USING (
    public.can_write()
    AND project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id())
  );

-- medicoes_ple: no direct company_id, join via obra_id → obras_portfolio
DROP POLICY IF EXISTS "writers_medicoes_insert" ON public.medicoes_ple;
DROP POLICY IF EXISTS "writers_medicoes_update" ON public.medicoes_ple;
DROP POLICY IF EXISTS "writers_medicoes_delete" ON public.medicoes_ple;
CREATE POLICY "writers_medicoes_insert" ON public.medicoes_ple FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_medicoes_update" ON public.medicoes_ple FOR UPDATE TO authenticated
  USING (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_medicoes_delete" ON public.medicoes_ple FOR DELETE TO authenticated
  USING (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );

-- despesas_mensais: join via obra_id → obras_portfolio
DROP POLICY IF EXISTS "writers_despesas_insert" ON public.despesas_mensais;
DROP POLICY IF EXISTS "writers_despesas_update" ON public.despesas_mensais;
DROP POLICY IF EXISTS "writers_despesas_delete" ON public.despesas_mensais;
CREATE POLICY "writers_despesas_insert" ON public.despesas_mensais FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_despesas_update" ON public.despesas_mensais FOR UPDATE TO authenticated
  USING (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );
CREATE POLICY "writers_despesas_delete" ON public.despesas_mensais FOR DELETE TO authenticated
  USING (
    public.can_write()
    AND obra_id IN (SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id())
  );

-- aditivos_contratos: restore the stronger policy from 20260324 that was overridden
DROP POLICY IF EXISTS "writers_aditivos_insert" ON public.aditivos_contratos;
DROP POLICY IF EXISTS "writers_aditivos_update" ON public.aditivos_contratos;
DROP POLICY IF EXISTS "writers_aditivos_delete" ON public.aditivos_contratos;
-- The FOR ALL policy from 20260324 (aditivos_contratos_company) already covers this correctly.
-- No need to re-add per-operation policies.
