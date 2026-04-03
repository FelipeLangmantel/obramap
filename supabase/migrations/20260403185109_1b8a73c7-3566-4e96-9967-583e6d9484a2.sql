
-- Trigger: when material_families.lead_time_days changes, recalculate order_by_date
-- on all open supply_alerts for that family.
-- order_by_date = required_date - lead_time_days (interval)

CREATE OR REPLACE FUNCTION public.fn_recalc_alerts_on_lead_time_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.lead_time_days IS DISTINCT FROM NEW.lead_time_days THEN
    UPDATE supply_alerts
    SET
      order_by_date = required_date - (NEW.lead_time_days || ' days')::interval,
      updated_at = now()
    WHERE family_id = NEW.id
      AND status NOT IN ('delivered', 'contracted');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_alerts_on_lead_time ON public.material_families;
CREATE TRIGGER trg_recalc_alerts_on_lead_time
  AFTER UPDATE ON public.material_families
  FOR EACH ROW
  WHEN (OLD.lead_time_days IS DISTINCT FROM NEW.lead_time_days)
  EXECUTE FUNCTION public.fn_recalc_alerts_on_lead_time_change();
