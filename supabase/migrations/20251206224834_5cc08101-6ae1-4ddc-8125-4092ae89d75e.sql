-- Create table for planned weekly productions
CREATE TABLE public.planned_productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#9ca3af',
  planned_houses INTEGER NOT NULL DEFAULT 0,
  planned_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planned_productions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view planned_productions" 
ON public.planned_productions 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create planned_productions" 
ON public.planned_productions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update planned_productions" 
ON public.planned_productions 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete planned_productions" 
ON public.planned_productions 
FOR DELETE 
USING (true);

-- Create table for non-compliance reasons
CREATE TABLE public.production_deviations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  planned_production_id UUID NOT NULL REFERENCES public.planned_productions(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  planned_count INTEGER NOT NULL DEFAULT 0,
  actual_count INTEGER NOT NULL DEFAULT 0,
  deviation INTEGER NOT NULL DEFAULT 0,
  deviation_reason TEXT NOT NULL,
  corrective_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.production_deviations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view production_deviations" 
ON public.production_deviations 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create production_deviations" 
ON public.production_deviations 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update production_deviations" 
ON public.production_deviations 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete production_deviations" 
ON public.production_deviations 
FOR DELETE 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_planned_productions_updated_at
BEFORE UPDATE ON public.planned_productions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_production_deviations_updated_at
BEFORE UPDATE ON public.production_deviations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_planned_productions_project ON public.planned_productions(project_id);
CREATE INDEX idx_planned_productions_week ON public.planned_productions(project_id, week_start, week_end);
CREATE INDEX idx_production_deviations_project ON public.production_deviations(project_id);
CREATE INDEX idx_production_deviations_planned ON public.production_deviations(planned_production_id);