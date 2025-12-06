-- Add display_order column to quadras table for persistent ordering
ALTER TABLE public.quadras 
ADD COLUMN display_order integer NOT NULL DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX idx_quadras_display_order ON public.quadras(project_id, display_order);