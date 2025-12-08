-- Create storage bucket for 3D models
INSERT INTO storage.buckets (id, name, public)
VALUES ('3d-models', '3d-models', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for 3D models bucket
CREATE POLICY "Anyone can view 3d-models"
ON storage.objects FOR SELECT
USING (bucket_id = '3d-models');

CREATE POLICY "Authenticated users can upload 3d-models"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = '3d-models');

CREATE POLICY "Authenticated users can update 3d-models"
ON storage.objects FOR UPDATE
USING (bucket_id = '3d-models');

CREATE POLICY "Authenticated users can delete 3d-models"
ON storage.objects FOR DELETE
USING (bucket_id = '3d-models');

-- Add 3D model columns to map_layouts table
ALTER TABLE public.map_layouts 
ADD COLUMN IF NOT EXISTS model_3d_url TEXT,
ADD COLUMN IF NOT EXISTS model_3d_type TEXT,
ADD COLUMN IF NOT EXISTS model_mtl_url TEXT,
ADD COLUMN IF NOT EXISTS house_markers_3d JSONB DEFAULT '[]'::jsonb;