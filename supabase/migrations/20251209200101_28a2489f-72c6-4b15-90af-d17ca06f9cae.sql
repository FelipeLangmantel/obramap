-- Add camera position columns to map_layouts table
ALTER TABLE public.map_layouts 
ADD COLUMN IF NOT EXISTS camera_position jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS camera_target jsonb DEFAULT NULL;