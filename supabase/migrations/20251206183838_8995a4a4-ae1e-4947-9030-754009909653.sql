-- Create table for weekly production records
CREATE TABLE public.weekly_productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#9ca3af',
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  houses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.weekly_productions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view weekly_productions" 
ON public.weekly_productions 
FOR SELECT USING (true);

CREATE POLICY "Anyone can create weekly_productions" 
ON public.weekly_productions 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update weekly_productions" 
ON public.weekly_productions 
FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete weekly_productions" 
ON public.weekly_productions 
FOR DELETE USING (true);

-- Index for performance
CREATE INDEX idx_weekly_productions_project_week ON public.weekly_productions(project_id, week_start);
CREATE INDEX idx_weekly_productions_scope ON public.weekly_productions(project_id, scope_id);

-- Trigger for updated_at
CREATE TRIGGER update_weekly_productions_updated_at
BEFORE UPDATE ON public.weekly_productions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();