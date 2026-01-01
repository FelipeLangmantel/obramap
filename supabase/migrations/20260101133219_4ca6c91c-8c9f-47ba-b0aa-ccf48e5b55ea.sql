-- Add team composition columns to planning_teams
ALTER TABLE public.planning_teams
ADD COLUMN IF NOT EXISTS professionals_count integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS helpers_count integer NOT NULL DEFAULT 1;

-- Add planning version tracking columns to planning_stages
ALTER TABLE public.planning_stages
ADD COLUMN IF NOT EXISTS is_baseline boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS baseline_created_at timestamp with time zone;

-- Create planning_baselines table to store frozen versions
CREATE TABLE IF NOT EXISTS public.planning_baselines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Planejamento Inicial',
  version_number integer NOT NULL DEFAULT 1,
  baseline_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_planning_baselines_project_id ON public.planning_baselines(project_id);

-- Enable RLS on planning_baselines
ALTER TABLE public.planning_baselines ENABLE ROW LEVEL SECURITY;

-- RLS policies for planning_baselines
CREATE POLICY "Authenticated users can view planning_baselines" 
  ON public.planning_baselines 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_baselines" 
  ON public.planning_baselines 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = ANY (ARRAY['admin'::app_role, 'editor'::app_role])
  ));