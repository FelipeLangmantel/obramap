-- Add category column to inputs table
ALTER TABLE public.inputs ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'material';

-- Add supplier_type column to suppliers table  
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'material';

-- Add check constraints
ALTER TABLE public.inputs DROP CONSTRAINT IF EXISTS inputs_category_check;
ALTER TABLE public.inputs ADD CONSTRAINT inputs_category_check CHECK (category IN ('material', 'labor', 'equipment'));

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_type_check CHECK (supplier_type IN ('material', 'labor'));

-- Create index for better query performance on inputs
CREATE INDEX IF NOT EXISTS idx_inputs_category ON public.inputs(category);
CREATE INDEX IF NOT EXISTS idx_inputs_project_category ON public.inputs(project_id, category);