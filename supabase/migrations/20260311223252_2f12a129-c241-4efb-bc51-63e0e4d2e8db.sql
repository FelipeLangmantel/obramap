-- Fix all scope_items.material_family to match the actual family from the linked input
UPDATE public.scope_items si
SET material_family = mf.name
FROM public.inputs i
JOIN public.material_families mf ON i.material_family_id = mf.id
WHERE si.input_id = i.id
AND si.material_family IS DISTINCT FROM mf.name;

-- Drop and recreate the propagation trigger to also handle material_family
CREATE OR REPLACE FUNCTION public.propagate_input_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_name TEXT;
BEGIN
  -- Get the family name if material_family_id changed or exists
  IF NEW.material_family_id IS NOT NULL THEN
    SELECT name INTO v_family_name FROM public.material_families WHERE id = NEW.material_family_id;
  END IF;

  -- Propagate name changes
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.scope_items SET name = NEW.name WHERE input_id = NEW.id;
    UPDATE public.budget_service_inputs SET input_name = NEW.name WHERE input_id = NEW.id;
  END IF;

  -- Propagate unit changes
  IF OLD.unit IS DISTINCT FROM NEW.unit THEN
    UPDATE public.scope_items SET unit = NEW.unit WHERE input_id = NEW.id;
    UPDATE public.budget_service_inputs SET unit = NEW.unit WHERE input_id = NEW.id;
  END IF;

  -- Propagate category changes
  IF OLD.category IS DISTINCT FROM NEW.category THEN
    UPDATE public.scope_items SET category = NEW.category WHERE input_id = NEW.id;
  END IF;

  -- Propagate material_family changes
  IF OLD.material_family_id IS DISTINCT FROM NEW.material_family_id AND v_family_name IS NOT NULL THEN
    UPDATE public.scope_items SET material_family = v_family_name WHERE input_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_propagate_input_changes ON public.inputs;
CREATE TRIGGER trg_propagate_input_changes
  AFTER UPDATE ON public.inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_input_changes();

-- Also add input_code column to scope_items for display purposes
ALTER TABLE public.scope_items ADD COLUMN IF NOT EXISTS input_code TEXT;

-- Populate input_code from linked inputs
UPDATE public.scope_items si
SET input_code = i.code
FROM public.inputs i
WHERE si.input_id = i.id
AND si.input_code IS DISTINCT FROM i.code;

-- Update propagation trigger to also sync input_code
CREATE OR REPLACE FUNCTION public.propagate_input_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family_name TEXT;
BEGIN
  IF NEW.material_family_id IS NOT NULL THEN
    SELECT name INTO v_family_name FROM public.material_families WHERE id = NEW.material_family_id;
  END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.scope_items SET name = NEW.name WHERE input_id = NEW.id;
    UPDATE public.budget_service_inputs SET input_name = NEW.name WHERE input_id = NEW.id;
  END IF;

  IF OLD.unit IS DISTINCT FROM NEW.unit THEN
    UPDATE public.scope_items SET unit = NEW.unit WHERE input_id = NEW.id;
    UPDATE public.budget_service_inputs SET unit = NEW.unit WHERE input_id = NEW.id;
  END IF;

  IF OLD.category IS DISTINCT FROM NEW.category THEN
    UPDATE public.scope_items SET category = NEW.category WHERE input_id = NEW.id;
  END IF;

  IF OLD.material_family_id IS DISTINCT FROM NEW.material_family_id AND v_family_name IS NOT NULL THEN
    UPDATE public.scope_items SET material_family = v_family_name WHERE input_id = NEW.id;
  END IF;

  IF OLD.code IS DISTINCT FROM NEW.code THEN
    UPDATE public.scope_items SET input_code = NEW.code WHERE input_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
