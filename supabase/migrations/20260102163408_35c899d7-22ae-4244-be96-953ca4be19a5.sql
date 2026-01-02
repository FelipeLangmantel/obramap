-- Add latency field for predecessor relationships
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS latency_days integer DEFAULT 0;

-- Add macro_id to link to macros_template
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS macro_id text;

-- Add scope_id for service-level planning
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS scope_id text;

-- Add is_service_level to indicate if planning by service
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS is_service_level boolean DEFAULT false;

-- Add completed_units to track already executed units
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS completed_units_at_start integer DEFAULT 0;

-- Create planning versioning table to track all planning versions
CREATE TABLE IF NOT EXISTS public.planning_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS for planning_versions
ALTER TABLE public.planning_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view planning_versions" 
ON public.planning_versions FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_versions" 
ON public.planning_versions FOR ALL 
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'editor'::app_role])));

-- Add version_id to planning_stages for versioning
ALTER TABLE public.planning_stages 
ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.planning_versions(id) ON DELETE CASCADE;

-- Add cascade delete for planning_teams when stage is deleted
ALTER TABLE public.planning_teams 
DROP CONSTRAINT IF EXISTS planning_teams_stage_id_fkey;

ALTER TABLE public.planning_teams 
ADD CONSTRAINT planning_teams_stage_id_fkey 
FOREIGN KEY (stage_id) REFERENCES public.planning_stages(id) ON DELETE CASCADE;

-- Add cascade delete for daily_work_logs when stage is deleted  
ALTER TABLE public.daily_work_logs 
DROP CONSTRAINT IF EXISTS daily_work_logs_stage_id_fkey;

ALTER TABLE public.daily_work_logs 
ADD CONSTRAINT daily_work_logs_stage_id_fkey 
FOREIGN KEY (stage_id) REFERENCES public.planning_stages(id) ON DELETE CASCADE;

-- Add cascade delete for planning_alerts when stage is deleted
ALTER TABLE public.planning_alerts 
DROP CONSTRAINT IF EXISTS planning_alerts_stage_id_fkey;

ALTER TABLE public.planning_alerts 
ADD CONSTRAINT planning_alerts_stage_id_fkey 
FOREIGN KEY (stage_id) REFERENCES public.planning_stages(id) ON DELETE SET NULL;