-- Create material_families table for configurable categories
CREATE TABLE public.material_families (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text DEFAULT 'package',
  color text DEFAULT '#6b7280',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_families ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view material_families" ON public.material_families FOR SELECT USING (true);
CREATE POLICY "Anyone can create material_families" ON public.material_families FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update material_families" ON public.material_families FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete material_families" ON public.material_families FOR DELETE USING (true);

-- Add material_family column to scope_items
ALTER TABLE public.scope_items ADD COLUMN IF NOT EXISTS material_family text DEFAULT 'geral';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_scope_items_material_family ON public.scope_items(material_family);
CREATE INDEX IF NOT EXISTS idx_material_families_project_id ON public.material_families(project_id);