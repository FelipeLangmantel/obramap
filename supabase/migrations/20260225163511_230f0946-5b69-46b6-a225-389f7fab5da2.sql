
CREATE TABLE public.map_layer_stage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  layer_name TEXT NOT NULL,
  stage_id UUID REFERENCES public.planning_stages(id) ON DELETE SET NULL,
  macro_id TEXT,
  scope_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, layer_name)
);

ALTER TABLE public.map_layer_stage_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view layer links for their projects"
  ON public.map_layer_stage_links FOR SELECT
  USING (true);

CREATE POLICY "Users can manage layer links"
  ON public.map_layer_stage_links FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add layer_visibility config to map_layouts
ALTER TABLE public.map_layouts ADD COLUMN IF NOT EXISTS layer_visibility JSONB DEFAULT '{}';
