-- Create planning stages table (etapas construtivas)
CREATE TABLE public.planning_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  planned_productivity NUMERIC NOT NULL DEFAULT 1, -- unidades/dia/equipe
  planned_teams INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER, -- calculated field
  depends_on UUID REFERENCES public.planning_stages(id),
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planning_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view planning_stages" 
ON public.planning_stages FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_stages" 
ON public.planning_stages FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create planning teams table (equipes abstratas)
CREATE TABLE public.planning_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  stage_id UUID NOT NULL REFERENCES public.planning_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Equipe Alvenaria 1"
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planning_teams ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view planning_teams" 
ON public.planning_teams FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_teams" 
ON public.planning_teams FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create productivity library table
CREATE TABLE public.productivity_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID, -- NULL = global template
  stage_name TEXT NOT NULL,
  default_productivity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un/dia/equipe',
  source TEXT NOT NULL DEFAULT 'manual', -- manual, historical, calculated
  sample_count INTEGER NOT NULL DEFAULT 0, -- for historical averages
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.productivity_library ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view productivity_library" 
ON public.productivity_library FOR SELECT 
USING (true);

CREATE POLICY "Editors can manage productivity_library" 
ON public.productivity_library FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create daily work logs table (Diário de Obra)
CREATE TABLE public.daily_work_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  stage_id UUID NOT NULL REFERENCES public.planning_stages(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.planning_teams(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  units_completed NUMERIC NOT NULL DEFAULT 0,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  notes TEXT,
  weather TEXT, -- sol, nublado, chuva
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, stage_id, team_id, log_date)
);

-- Enable RLS
ALTER TABLE public.daily_work_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view daily_work_logs" 
ON public.daily_work_logs FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage daily_work_logs" 
ON public.daily_work_logs FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create planning alerts table
CREATE TABLE public.planning_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  stage_id UUID REFERENCES public.planning_stages(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- rhythm_break, bottleneck, team_conflict, delay_risk
  severity TEXT NOT NULL DEFAULT 'warning', -- info, warning, critical
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  impact_days INTEGER,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planning_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view planning_alerts" 
ON public.planning_alerts FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_alerts" 
ON public.planning_alerts FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create planning simulations table
CREATE TABLE public.planning_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  simulation_data JSONB NOT NULL DEFAULT '{}',
  results JSONB, -- calculated impacts
  is_applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planning_simulations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view planning_simulations" 
ON public.planning_simulations FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage planning_simulations" 
ON public.planning_simulations FOR ALL 
USING (EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));

-- Create triggers for updated_at
CREATE TRIGGER update_planning_stages_updated_at
BEFORE UPDATE ON public.planning_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_productivity_library_updated_at
BEFORE UPDATE ON public.productivity_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_work_logs_updated_at
BEFORE UPDATE ON public.daily_work_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default productivity templates
INSERT INTO public.productivity_library (stage_name, default_productivity, unit, source) VALUES
('Fundação', 2, 'un/dia/equipe', 'template'),
('Alvenaria', 1.5, 'un/dia/equipe', 'template'),
('Estrutura', 1, 'un/dia/equipe', 'template'),
('Cobertura', 3, 'un/dia/equipe', 'template'),
('Instalações Hidráulicas', 2, 'un/dia/equipe', 'template'),
('Instalações Elétricas', 2.5, 'un/dia/equipe', 'template'),
('Reboco', 1.5, 'un/dia/equipe', 'template'),
('Revestimento', 1, 'un/dia/equipe', 'template'),
('Pintura', 3, 'un/dia/equipe', 'template'),
('Esquadrias', 4, 'un/dia/equipe', 'template'),
('Acabamento', 2, 'un/dia/equipe', 'template'),
('Limpeza Final', 5, 'un/dia/equipe', 'template');