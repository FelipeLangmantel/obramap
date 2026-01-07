-- ===========================================
-- TABELA: measurements (Medições)
-- Registra cada período de medição do projeto
-- ===========================================
CREATE TABLE IF NOT EXISTS public.measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measurement_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicidade de número de medição por projeto
CREATE UNIQUE INDEX IF NOT EXISTS idx_measurements_project_number ON public.measurements(project_id, measurement_number);

-- Habilitar RLS
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para measurements
CREATE POLICY "Users can view measurements of their company projects" 
ON public.measurements 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = measurements.project_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can insert measurements" 
ON public.measurements 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can update measurements" 
ON public.measurements 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = measurements.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can delete measurements" 
ON public.measurements 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = measurements.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- ===========================================
-- TABELA: measurement_services (Serviços da Medição)
-- Serviços vinculados a cada medição
-- ===========================================
CREATE TABLE IF NOT EXISTS public.measurement_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  measurement_id UUID NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#6b7280',
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  planned_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  planned_houses INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice único para evitar serviço duplicado na mesma medição
CREATE UNIQUE INDEX IF NOT EXISTS idx_measurement_services_unique 
ON public.measurement_services(measurement_id, macro_id, scope_id);

-- Índice para busca por medição
CREATE INDEX IF NOT EXISTS idx_measurement_services_measurement ON public.measurement_services(measurement_id);

-- Habilitar RLS
ALTER TABLE public.measurement_services ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para measurement_services
CREATE POLICY "Users can view measurement_services" 
ON public.measurement_services 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.measurements m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE m.id = measurement_services.measurement_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can insert measurement_services" 
ON public.measurement_services 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.measurements m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE m.id = measurement_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can update measurement_services" 
ON public.measurement_services 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.measurements m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE m.id = measurement_services.measurement_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can delete measurement_services" 
ON public.measurement_services 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.measurements m
    JOIN public.projects p ON p.id = m.project_id
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE m.id = measurement_services.measurement_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- ===========================================
-- TABELA: productions (Produções Registradas)
-- Registros de produção vinculados às medições
-- ===========================================
CREATE TABLE IF NOT EXISTS public.productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measurement_id UUID REFERENCES public.measurements(id) ON DELETE SET NULL,
  measurement_service_id UUID REFERENCES public.measurement_services(id) ON DELETE SET NULL,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#6b7280',
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  house_ids INTEGER[] NOT NULL DEFAULT '{}',
  houses_count INTEGER NOT NULL DEFAULT 0,
  production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_initial_database BOOLEAN NOT NULL DEFAULT false,
  is_unplanned BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para otimização de consultas
CREATE INDEX IF NOT EXISTS idx_productions_project ON public.productions(project_id);
CREATE INDEX IF NOT EXISTS idx_productions_measurement ON public.productions(measurement_id);
CREATE INDEX IF NOT EXISTS idx_productions_service ON public.productions(measurement_service_id);
CREATE INDEX IF NOT EXISTS idx_productions_date ON public.productions(production_date);

-- Habilitar RLS
ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para productions
CREATE POLICY "Users can view productions" 
ON public.productions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = productions.project_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can insert productions" 
ON public.productions 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can update productions" 
ON public.productions 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = productions.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can delete productions" 
ON public.productions 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = productions.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_measurements_updated_at
  BEFORE UPDATE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_measurement_services_updated_at
  BEFORE UPDATE ON public.measurement_services
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_productions_updated_at
  BEFORE UPDATE ON public.productions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();