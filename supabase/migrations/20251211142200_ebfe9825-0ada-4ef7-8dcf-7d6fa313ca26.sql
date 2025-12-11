-- Fix RLS policies for financial_entries - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view financial_entries" ON financial_entries;
DROP POLICY IF EXISTS "Editors can manage financial_entries" ON financial_entries;

-- Permissive policies (default behavior)
CREATE POLICY "Authenticated users can view financial_entries" 
ON financial_entries 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can insert financial_entries" 
ON financial_entries 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'editor')
  )
);

CREATE POLICY "Editors can update financial_entries" 
ON financial_entries 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'editor')
  )
);

CREATE POLICY "Editors can delete financial_entries" 
ON financial_entries 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'editor')
  )
);

-- Create user_permissions table for granular access control
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Department/Category
  department TEXT DEFAULT 'geral',
  -- Allowed projects (null means all)
  allowed_project_ids UUID[] DEFAULT NULL,
  -- Menu visibility
  visible_menus JSONB DEFAULT '["dashboard", "producao", "financeiro", "suprimentos", "planejamento", "mapa", "graficos"]'::jsonb,
  -- Management sections visibility
  visible_management_sections JSONB DEFAULT '["projetos", "quadras", "macros", "escopos", "insumos", "fornecedores", "mao_de_obra", "usuarios"]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create departments table for editable categories
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default departments
INSERT INTO departments (name, display_order) VALUES 
  ('Diretor', 1),
  ('Gerente', 2),
  ('Financeiro', 3),
  ('Suprimentos', 4),
  ('Engenheiro', 5),
  ('Administrativo', 6),
  ('Técnico', 7)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_permissions
CREATE POLICY "Admins can manage user_permissions" 
ON user_permissions 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Users can view their own permissions" 
ON user_permissions 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

-- RLS policies for departments
CREATE POLICY "Anyone can view departments" 
ON departments 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admins can manage departments" 
ON departments 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Add trigger for updated_at on user_permissions
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON user_permissions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();