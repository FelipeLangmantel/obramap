
-- Create inputs (insumos) table for catalog of available materials
CREATE TABLE public.inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'un',
  material_family_id UUID REFERENCES public.material_families(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create units table for customizable units
CREATE TABLE public.units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create labor_contracts table to track labor hiring
CREATE TABLE public.labor_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  contracted_houses INTEGER NOT NULL DEFAULT 0,
  executed_houses INTEGER NOT NULL DEFAULT 0,
  unit_value NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  contractor_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labor_contracts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for inputs
CREATE POLICY "Authenticated users can view inputs" ON public.inputs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage inputs" ON public.inputs FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'editor'::app_role]))
);

-- RLS Policies for units
CREATE POLICY "Authenticated users can view units" ON public.units FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage units" ON public.units FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'editor'::app_role]))
);

-- RLS Policies for labor_contracts
CREATE POLICY "Authenticated users can view labor_contracts" ON public.labor_contracts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage labor_contracts" ON public.labor_contracts FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'editor'::app_role]))
);

-- Add input_id reference to scope_items
ALTER TABLE public.scope_items ADD COLUMN input_id UUID REFERENCES public.inputs(id) ON DELETE SET NULL;

-- Add triggers for updated_at
CREATE TRIGGER update_inputs_updated_at BEFORE UPDATE ON public.inputs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_labor_contracts_updated_at BEFORE UPDATE ON public.labor_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default units
INSERT INTO public.units (project_id, name, abbreviation) 
SELECT id, 'Unidade', 'un' FROM public.projects
UNION ALL
SELECT id, 'Metro', 'm' FROM public.projects
UNION ALL
SELECT id, 'Metro Quadrado', 'm²' FROM public.projects
UNION ALL
SELECT id, 'Metro Cúbico', 'm³' FROM public.projects
UNION ALL
SELECT id, 'Quilograma', 'kg' FROM public.projects
UNION ALL
SELECT id, 'Litro', 'L' FROM public.projects
UNION ALL
SELECT id, 'Saco', 'sc' FROM public.projects
UNION ALL
SELECT id, 'Peça', 'pç' FROM public.projects
UNION ALL
SELECT id, 'Verba', 'vb' FROM public.projects;
