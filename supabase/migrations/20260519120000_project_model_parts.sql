CREATE TABLE IF NOT EXISTS public.project_model_parts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  name         text NOT NULL,
  file_name    text,
  storage_path text,
  public_url   text NOT NULL,
  model_type   text NOT NULL DEFAULT 'glb' CHECK (model_type IN ('glb')),
  part_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  is_primary   boolean NOT NULL DEFAULT false,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_model_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users manage project_model_parts"
  ON public.project_model_parts;
CREATE POLICY "Company users manage project_model_parts"
  ON public.project_model_parts FOR ALL TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND project_id IN (
      SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_model_parts_project_active
  ON public.project_model_parts (project_id, is_active, part_order, created_at);
CREATE INDEX IF NOT EXISTS idx_project_model_parts_company_project
  ON public.project_model_parts (company_id, project_id);

DROP TRIGGER IF EXISTS project_model_parts_updated_at
  ON public.project_model_parts;
CREATE TRIGGER project_model_parts_updated_at
  BEFORE UPDATE ON public.project_model_parts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
