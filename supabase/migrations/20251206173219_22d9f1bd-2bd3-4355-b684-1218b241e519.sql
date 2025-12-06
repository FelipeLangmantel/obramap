-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  contractor TEXT NOT NULL,
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  total_houses INTEGER NOT NULL DEFAULT 1,
  unit_size NUMERIC NOT NULL DEFAULT 45,
  project_type TEXT NOT NULL DEFAULT 'Residencial Popular',
  macros_template JSONB NOT NULL DEFAULT '[]'::jsonb,
  setup_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quadras table
CREATE TABLE public.quadras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create houses table
CREATE TABLE public.houses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  house_number INTEGER NOT NULL,
  quadra_id UUID REFERENCES public.quadras(id) ON DELETE SET NULL,
  area NUMERIC NOT NULL DEFAULT 45,
  type TEXT NOT NULL DEFAULT 'Residencial',
  constructor_name TEXT,
  expected_date DATE,
  last_update DATE NOT NULL DEFAULT now(),
  macros JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, house_number)
);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quadras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (since no auth yet)
CREATE POLICY "Anyone can view projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Anyone can create projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete projects" ON public.projects FOR DELETE USING (true);

CREATE POLICY "Anyone can view quadras" ON public.quadras FOR SELECT USING (true);
CREATE POLICY "Anyone can create quadras" ON public.quadras FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update quadras" ON public.quadras FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete quadras" ON public.quadras FOR DELETE USING (true);

CREATE POLICY "Anyone can view houses" ON public.houses FOR SELECT USING (true);
CREATE POLICY "Anyone can create houses" ON public.houses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update houses" ON public.houses FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete houses" ON public.houses FOR DELETE USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_quadras_project_id ON public.quadras(project_id);
CREATE INDEX idx_houses_project_id ON public.houses(project_id);
CREATE INDEX idx_houses_quadra_id ON public.houses(quadra_id);