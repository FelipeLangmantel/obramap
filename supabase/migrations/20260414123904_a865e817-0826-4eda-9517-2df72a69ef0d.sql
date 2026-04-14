CREATE OR REPLACE FUNCTION public.fn_sync_supply_request_to_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.supply_alerts
    SET status = CASE
          WHEN NEW.status = 'quoted' THEN 'quoted'
          WHEN NEW.status = 'ordered' THEN 'ordered'
          WHEN NEW.status = 'delivered' THEN 'delivered'
          ELSE supply_alerts.status
        END,
        updated_at = now()
    WHERE supply_alerts.project_id = NEW.project_id
      AND supply_alerts.scope_item_id = NEW.item_id
      AND (
        supply_alerts.measurement_id = NEW.measurement_id
        OR (supply_alerts.measurement_id IS NULL AND NEW.measurement_id IS NULL)
      );
  END IF;

  RETURN NEW;
END;
$function$;