CREATE TABLE IF NOT EXISTS public.project_model_meshes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  layer_key             text NOT NULL,
  mesh_name             text,
  material_name         text,
  detected_house_number integer,
  assigned_house_number integer,
  service_macro_id      text,
  service_scope_id      text,
  visible               boolean NOT NULL DEFAULT true,
  ignored               boolean NOT NULL DEFAULT false,
  production_visible    boolean NOT NULL DEFAULT false,
  progress_percent      numeric(5,2) NOT NULL DEFAULT 0,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, layer_key)
);

ALTER TABLE public.project_model_meshes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users manage project_model_meshes"
  ON public.project_model_meshes FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_pmm_project ON public.project_model_meshes (project_id);
CREATE INDEX IF NOT EXISTS idx_pmm_project_key ON public.project_model_meshes (project_id, layer_key);
CREATE INDEX IF NOT EXISTS idx_pmm_link ON public.project_model_meshes (project_id, assigned_house_number, service_macro_id, service_scope_id);

CREATE TRIGGER pmm_updated_at
  BEFORE UPDATE ON public.project_model_meshes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();