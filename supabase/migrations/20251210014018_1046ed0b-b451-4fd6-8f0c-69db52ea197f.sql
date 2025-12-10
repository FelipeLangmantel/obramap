-- Add unit_value column to inputs table for storing material prices
ALTER TABLE public.inputs ADD COLUMN IF NOT EXISTS unit_value numeric DEFAULT 0;