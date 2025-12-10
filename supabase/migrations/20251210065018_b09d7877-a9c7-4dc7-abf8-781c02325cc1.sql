-- Add stock_quantity column to inputs table for inventory control
ALTER TABLE public.inputs ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.inputs.stock_quantity IS 'Current stock quantity of this input/material';