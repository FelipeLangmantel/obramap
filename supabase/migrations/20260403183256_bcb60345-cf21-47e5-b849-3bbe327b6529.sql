
-- Trigger: sync supply_requests status changes to supply_alerts
-- When a supply_request status changes, find matching supply_alerts and update them
CREATE OR REPLACE FUNCTION public.fn_sync_supply_request_to_alert()
RETURNS TRIGGER AS $$
BEGIN
  -- When supply_request status changes, update corresponding supply_alerts
  -- Match by project_id + scope_id + measurement_id (planning_period_id)
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.supply_alerts
    SET status = CASE
          WHEN NEW.status = 'quoted' THEN 'quoted'
          WHEN NEW.status = 'approved' THEN 'approved'
          WHEN NEW.status = 'ordered' THEN 'ordered'
          WHEN NEW.status = 'in_transit' THEN 'in_transit'
          WHEN NEW.status = 'delivered' THEN 'delivered'
          WHEN NEW.status = 'contracted' THEN 'contracted'
          ELSE supply_alerts.status
        END,
        updated_at = now()
    WHERE supply_alerts.project_id = NEW.project_id
      AND supply_alerts.scope_item_id = NEW.item_id
      AND (supply_alerts.measurement_id = NEW.measurement_id OR (supply_alerts.measurement_id IS NULL AND NEW.measurement_id IS NULL));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_supply_request_to_alert
  AFTER UPDATE ON public.supply_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_supply_request_to_alert();
