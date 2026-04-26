CREATE TABLE IF NOT EXISTS public.map_mesh_house_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  mesh_name text NOT NULL,
  house_number integer NOT NULL CHECK (house_number > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT uq_mesh_per_project UNIQUE (project_id, mesh_name)
);

CREATE INDEX IF NOT EXISTS idx_mesh_house_project
  ON public.map_mesh_house_assignments (project_id);

CREATE INDEX IF NOT EXISTS idx_mesh_house_lookup
  ON public.map_mesh_house_assignments (project_id, house_number);

CREATE OR REPLACE FUNCTION public.tg_mesh_house_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mesh_house_updated_at ON public.map_mesh_house_assignments;
CREATE TRIGGER trg_mesh_house_updated_at
  BEFORE UPDATE ON public.map_mesh_house_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_mesh_house_set_updated_at();

ALTER TABLE public.map_mesh_house_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users manage map_mesh_house_assignments"
  ON public.map_mesh_house_assignments;
CREATE POLICY "Company users manage map_mesh_house_assignments"
  ON public.map_mesh_house_assignments FOR ALL
  TO authenticated
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