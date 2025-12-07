-- Create a table to store map layouts for each project
CREATE TABLE public.map_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  image_url TEXT,
  quadras JSONB NOT NULL DEFAULT '[]'::jsonb,
  houses JSONB NOT NULL DEFAULT '[]'::jsonb,
  map_width INTEGER NOT NULL DEFAULT 1600,
  map_height INTEGER NOT NULL DEFAULT 1200,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Enable Row Level Security
ALTER TABLE public.map_layouts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - anyone can manage map layouts (same as other tables)
CREATE POLICY "Anyone can view map_layouts" 
ON public.map_layouts 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create map_layouts" 
ON public.map_layouts 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update map_layouts" 
ON public.map_layouts 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete map_layouts" 
ON public.map_layouts 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_map_layouts_updated_at
BEFORE UPDATE ON public.map_layouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();