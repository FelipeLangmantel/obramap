-- Add lead_time_days column to material_families table
ALTER TABLE public.material_families 
ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 7;

-- Add comment for clarity
COMMENT ON COLUMN public.material_families.lead_time_days IS 'Lead time in days for quotation alerts';