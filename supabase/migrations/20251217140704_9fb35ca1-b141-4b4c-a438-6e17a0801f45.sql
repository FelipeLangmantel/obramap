-- Add weight_mode column to projects table to track if weights are automatic (from budget) or manual
ALTER TABLE public.projects
ADD COLUMN weight_mode text NOT NULL DEFAULT 'manual';

-- Add comment explaining the column
COMMENT ON COLUMN public.projects.weight_mode IS 'Weight calculation mode: "automatic" (from budget) or "manual" (user-defined)';