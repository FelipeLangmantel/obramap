-- Add supplier_scope column to track if supplier is project-specific or global
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_scope text NOT NULL DEFAULT 'project';

-- Update existing suppliers to be global by default
UPDATE public.suppliers SET supplier_scope = 'global' WHERE supplier_scope = 'project';