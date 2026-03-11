
-- 1. Add 'code' column to inputs table for unique readable codes (MAT-000001, MO-000001, EQP-000001)
ALTER TABLE public.inputs ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

-- 2. Create function to generate input codes automatically
CREATE OR REPLACE FUNCTION public.generate_input_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  next_num INT;
  new_code TEXT;
BEGIN
  -- Determine prefix based on category
  IF NEW.category = 'material' THEN
    prefix := 'MAT';
  ELSIF NEW.category = 'labor' THEN
    prefix := 'MO';
  ELSIF NEW.category = 'equipment' THEN
    prefix := 'EQP';
  ELSE
    prefix := 'INS';
  END IF;

  -- Get next number for this prefix
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(code FROM LENGTH(prefix) + 2) AS INT)
  ), 0) + 1
  INTO next_num
  FROM public.inputs
  WHERE code LIKE prefix || '-%';

  new_code := prefix || '-' || LPAD(next_num::TEXT, 6, '0');
  NEW.code := new_code;
  RETURN NEW;
END;
$$;

-- 3. Create trigger to auto-generate code on insert (only if code is null)
DROP TRIGGER IF EXISTS trg_generate_input_code ON public.inputs;
CREATE TRIGGER trg_generate_input_code
  BEFORE INSERT ON public.inputs
  FOR EACH ROW
  WHEN (NEW.code IS NULL)
  EXECUTE FUNCTION public.generate_input_code();

-- 4. Backfill codes for existing inputs that don't have one
DO $$
DECLARE
  rec RECORD;
  prefix TEXT;
  next_num INT;
BEGIN
  FOR rec IN SELECT id, category FROM public.inputs WHERE code IS NULL ORDER BY created_at ASC
  LOOP
    IF rec.category = 'material' THEN prefix := 'MAT';
    ELSIF rec.category = 'labor' THEN prefix := 'MO';
    ELSIF rec.category = 'equipment' THEN prefix := 'EQP';
    ELSE prefix := 'INS';
    END IF;

    SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM LENGTH(prefix) + 2) AS INT)), 0) + 1
    INTO next_num
    FROM public.inputs WHERE code LIKE prefix || '-%';

    UPDATE public.inputs SET code = prefix || '-' || LPAD(next_num::TEXT, 6, '0') WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 5. Create audit log table for input changes
CREATE TABLE IF NOT EXISTS public.input_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  input_id UUID NOT NULL REFERENCES public.inputs(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

ALTER TABLE public.input_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view their audit logs"
  ON public.input_audit_log
  FOR SELECT
  TO authenticated
  USING (company_id = (public.get_my_company_id())::TEXT);

-- 6. Create trigger function to propagate input changes to scope_items AND log audit
CREATE OR REPLACE FUNCTION public.propagate_input_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  family_name TEXT;
BEGIN
  -- Only propagate on UPDATE
  IF TG_OP != 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Get family name if family changed
  IF NEW.material_family_id IS NOT NULL THEN
    SELECT name INTO family_name FROM public.material_families WHERE id = NEW.material_family_id;
  END IF;

  -- Propagate name change
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.scope_items SET name = NEW.name, updated_at = now()
    WHERE input_id = NEW.id;
    
    INSERT INTO public.input_audit_log (input_id, company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, auth.uid(), 'name', OLD.name, NEW.name);
  END IF;

  -- Propagate category change
  IF OLD.category IS DISTINCT FROM NEW.category THEN
    UPDATE public.scope_items SET category = NEW.category, updated_at = now()
    WHERE input_id = NEW.id;
    
    INSERT INTO public.input_audit_log (input_id, company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, auth.uid(), 'category', OLD.category, NEW.category);
  END IF;

  -- Propagate unit change
  IF OLD.unit IS DISTINCT FROM NEW.unit THEN
    UPDATE public.scope_items SET unit = NEW.unit, updated_at = now()
    WHERE input_id = NEW.id;
    
    INSERT INTO public.input_audit_log (input_id, company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, auth.uid(), 'unit', OLD.unit, NEW.unit);
  END IF;

  -- Propagate family change
  IF OLD.material_family_id IS DISTINCT FROM NEW.material_family_id THEN
    IF family_name IS NOT NULL THEN
      UPDATE public.scope_items SET material_family = family_name, updated_at = now()
      WHERE input_id = NEW.id;
    END IF;
    
    INSERT INTO public.input_audit_log (input_id, company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, auth.uid(), 'material_family_id', OLD.material_family_id::TEXT, NEW.material_family_id::TEXT);
  END IF;

  -- Log unit_value change (but do NOT propagate to scope_items - budget keeps its own price)
  IF OLD.unit_value IS DISTINCT FROM NEW.unit_value THEN
    INSERT INTO public.input_audit_log (input_id, company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, NEW.company_id, auth.uid(), 'unit_value', OLD.unit_value::TEXT, NEW.unit_value::TEXT);
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Attach trigger to inputs table
DROP TRIGGER IF EXISTS trg_propagate_input_changes ON public.inputs;
CREATE TRIGGER trg_propagate_input_changes
  AFTER UPDATE ON public.inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_input_changes();

-- 8. Also propagate budget_service_inputs when input changes
CREATE OR REPLACE FUNCTION public.propagate_input_to_budget_service()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP != 'UPDATE' THEN RETURN NEW; END IF;

  IF OLD.name IS DISTINCT FROM NEW.name THEN
    UPDATE public.budget_service_inputs SET input_name = NEW.name, updated_at = now()
    WHERE input_id = NEW.id;
  END IF;

  IF OLD.unit IS DISTINCT FROM NEW.unit THEN
    UPDATE public.budget_service_inputs SET unit = NEW.unit, updated_at = now()
    WHERE input_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_input_budget_service ON public.inputs;
CREATE TRIGGER trg_propagate_input_budget_service
  AFTER UPDATE ON public.inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.propagate_input_to_budget_service();

-- 9. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_inputs_code ON public.inputs(code);
CREATE INDEX IF NOT EXISTS idx_scope_items_input_id ON public.scope_items(input_id);
CREATE INDEX IF NOT EXISTS idx_input_audit_log_input_id ON public.input_audit_log(input_id);
