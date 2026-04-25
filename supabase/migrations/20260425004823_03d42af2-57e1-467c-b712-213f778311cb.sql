ALTER TYPE public.system_role ADD VALUE IF NOT EXISTS 'coordenador';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS coordenador_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_coordenador_user_id ON public.projects(coordenador_user_id);