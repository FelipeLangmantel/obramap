
-- STEP 1: Add company_id columns (nullable first)
ALTER TABLE inputs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE units ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- STEP 2: Populate company_id from projects
UPDATE inputs SET company_id = (SELECT p.company_id FROM projects p WHERE p.id = inputs.project_id LIMIT 1) WHERE company_id IS NULL;
UPDATE suppliers SET company_id = (SELECT p.company_id FROM projects p WHERE p.id = suppliers.project_id LIMIT 1) WHERE company_id IS NULL;
UPDATE units SET company_id = (SELECT p.company_id FROM projects p WHERE p.id = units.project_id LIMIT 1) WHERE company_id IS NULL;
UPDATE material_families SET company_id = (SELECT p.company_id FROM projects p WHERE p.id = material_families.project_id LIMIT 1) WHERE company_id IS NULL;

-- STEP 3: Fallback
UPDATE inputs SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE suppliers SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE units SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;
UPDATE material_families SET company_id = (SELECT id FROM companies LIMIT 1) WHERE company_id IS NULL;

-- STEP 4: Make NOT NULL
ALTER TABLE inputs ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE units ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE material_families ALTER COLUMN company_id SET NOT NULL;

-- STEP 5: Add indexes
CREATE INDEX IF NOT EXISTS idx_inputs_company ON inputs(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_units_company ON units(company_id);
CREATE INDEX IF NOT EXISTS idx_families_company ON material_families(company_id);

-- STEP 6: Drop old permissive RLS policies
DROP POLICY IF EXISTS "Authenticated users can view inputs" ON inputs;
DROP POLICY IF EXISTS "Editors can manage inputs" ON inputs;
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Editors can manage suppliers" ON suppliers;
DROP POLICY IF EXISTS "Authenticated users can view units" ON units;
DROP POLICY IF EXISTS "Editors can manage units" ON units;
DROP POLICY IF EXISTS "Anyone can view material_families" ON material_families;
DROP POLICY IF EXISTS "Anyone can create material_families" ON material_families;
DROP POLICY IF EXISTS "Anyone can update material_families" ON material_families;
DROP POLICY IF EXISTS "Anyone can delete material_families" ON material_families;

-- STEP 7: Enable RLS
ALTER TABLE inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_families ENABLE ROW LEVEL SECURITY;

-- STEP 8: RLS policies using is_system_admin(uuid) overload

-- INPUTS
CREATE POLICY "Company users view own inputs" ON inputs FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users insert own inputs" ON inputs FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users update own inputs" ON inputs FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users delete own inputs" ON inputs FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- SUPPLIERS
CREATE POLICY "Company users view own suppliers" ON suppliers FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users insert own suppliers" ON suppliers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users update own suppliers" ON suppliers FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users delete own suppliers" ON suppliers FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- UNITS
CREATE POLICY "Company users view own units" ON units FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users insert own units" ON units FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users update own units" ON units FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users delete own units" ON units FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- MATERIAL_FAMILIES
CREATE POLICY "Company users view own families" ON material_families FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users insert own families" ON material_families FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users update own families" ON material_families FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
CREATE POLICY "Company users delete own families" ON material_families FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));
