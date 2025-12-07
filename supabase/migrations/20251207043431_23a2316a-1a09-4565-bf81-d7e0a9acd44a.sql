-- Add display_order column to projects table for manual ordering
ALTER TABLE public.projects 
ADD COLUMN display_order integer NOT NULL DEFAULT 0;

-- Set initial order based on creation date (newest first)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1 as new_order
  FROM public.projects
)
UPDATE public.projects p
SET display_order = ordered.new_order
FROM ordered
WHERE p.id = ordered.id;