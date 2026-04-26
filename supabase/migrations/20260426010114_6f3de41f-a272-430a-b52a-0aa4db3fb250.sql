CREATE OR REPLACE FUNCTION public.validate_production_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_house_count int;
  v_qty_per_house numeric;
  v_house_num int;
  v_capacity numeric;
  v_already numeric;
  v_total numeric;
  v_unit_symbol text;
  v_unit_label text;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RETURN NEW;
  END IF;

  v_unit_symbol := lower(trim(COALESCE(NEW.unit_symbol, '')));
  v_unit_label := COALESCE(NEW.unit_label, '');

  -- Comparação case-insensitive
  IF v_unit_symbol NOT IN ('m²','m2','m³','m3','m','ml') THEN
    RETURN NEW;
  END IF;

  v_house_count := COALESCE(array_length(NEW.house_ids, 1), 0);
  IF v_house_count = 0 THEN
    RETURN NEW;
  END IF;

  v_qty_per_house := NEW.quantity / v_house_count;

  FOREACH v_house_num IN ARRAY NEW.house_ids LOOP
    SELECT capacity_value INTO v_capacity
    FROM public.service_house_capacities
    WHERE project_id = NEW.project_id
      AND scope_id = NEW.scope_id
      AND house_number = v_house_num;

    IF v_capacity IS NULL THEN
      SELECT capacity_value INTO v_capacity
      FROM public.service_default_capacities
      WHERE project_id = NEW.project_id
        AND scope_id = NEW.scope_id;
    END IF;

    IF v_capacity IS NULL OR v_capacity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(quantity / NULLIF(array_length(house_ids, 1), 0)), 0)
      INTO v_already
    FROM public.weekly_productions
    WHERE project_id = NEW.project_id
      AND scope_id = NEW.scope_id
      AND v_house_num = ANY(house_ids)
      AND deleted_at IS NULL
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    v_total := v_already + v_qty_per_house;

    IF v_total > v_capacity THEN
      RAISE EXCEPTION 'Capacidade excedida na Casa %: total ficaria em % % (capacidade: % %).',
        v_house_num,
        round(v_total, 2),
        v_unit_label,
        v_capacity,
        v_unit_label;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;