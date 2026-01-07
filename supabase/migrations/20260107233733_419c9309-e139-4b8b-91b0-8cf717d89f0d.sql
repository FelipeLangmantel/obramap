-- =====================================================
-- REFATORAÇÃO SUPRIMENTOS JIT
-- =====================================================

-- 1. Adicionar company_id e is_labor à tabela material_families (se não existir)
ALTER TABLE public.material_families 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
ADD COLUMN IF NOT EXISTS is_labor boolean NOT NULL DEFAULT false;

-- Migrar dados existentes: associar families ao company do projeto
UPDATE public.material_families mf
SET company_id = (SELECT company_id FROM public.projects p WHERE p.id = mf.project_id)
WHERE mf.company_id IS NULL;

-- 2. Criar tabela materials (materiais individuais)
CREATE TABLE IF NOT EXISTS public.materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  family_id uuid REFERENCES public.material_families(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice para busca por empresa
CREATE INDEX IF NOT EXISTS idx_materials_company ON public.materials(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_family ON public.materials(family_id);

-- RLS para materials
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view materials of their company" ON public.materials
FOR SELECT USING (
  company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Admins can manage materials" ON public.materials
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles pr
    WHERE pr.user_id = auth.uid()
    AND pr.company_id = materials.company_id
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- 3. Criar tabela service_materials (vincula serviços aos materiais)
CREATE TABLE IF NOT EXISTS public.service_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  macro_id text NOT NULL,
  scope_id text NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  quantity_per_house numeric NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_materials_unique 
ON public.service_materials(project_id, macro_id, scope_id, material_id);

-- RLS para service_materials
ALTER TABLE public.service_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view service_materials of their company projects" ON public.service_materials
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = service_materials.project_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can manage service_materials" ON public.service_materials
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = service_materials.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- 4. Criar tabela project_lead_times (lead time por obra e família)
CREATE TABLE IF NOT EXISTS public.project_lead_times (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.material_families(id) ON DELETE CASCADE,
  lead_time_days integer NOT NULL DEFAULT 7,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_lead_times_unique 
ON public.project_lead_times(project_id, family_id);

-- RLS para project_lead_times
ALTER TABLE public.project_lead_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view project_lead_times of their company projects" ON public.project_lead_times
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = project_lead_times.project_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can manage project_lead_times" ON public.project_lead_times
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = project_lead_times.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- 5. Criar tabela supply_alerts (alertas JIT)
CREATE TABLE IF NOT EXISTS public.supply_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  measurement_id uuid REFERENCES public.measurements(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES public.material_families(id) ON DELETE CASCADE,
  required_date date NOT NULL,
  order_by_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'delivered', 'delayed')),
  total_quantity numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Índice único para evitar duplicatas (permite null em measurement_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_alerts_unique 
ON public.supply_alerts(project_id, COALESCE(measurement_id, '00000000-0000-0000-0000-000000000000'::uuid), family_id);

-- Índices para consultas
CREATE INDEX IF NOT EXISTS idx_supply_alerts_project ON public.supply_alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_status ON public.supply_alerts(status);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_order_date ON public.supply_alerts(order_by_date);

-- RLS para supply_alerts
ALTER TABLE public.supply_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view supply_alerts of their company projects" ON public.supply_alerts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = supply_alerts.project_id
    AND pr.user_id = auth.uid()
    AND pr.status = 'active'
  )
);

CREATE POLICY "Admins can manage supply_alerts" ON public.supply_alerts
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN profiles pr ON pr.company_id = p.company_id
    WHERE p.id = supply_alerts.project_id
    AND pr.user_id = auth.uid()
    AND pr.system_role IN ('system_admin', 'admin')
    AND pr.status = 'active'
  )
);

-- 6. Criar função para regenerar alertas de suprimentos
CREATE OR REPLACE FUNCTION public.regenerate_supply_alerts(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_default_lead_time integer := 7;
BEGIN
  -- Obter company_id do projeto
  SELECT company_id INTO v_company_id FROM projects WHERE id = p_project_id;
  
  -- Deletar alertas pendentes existentes (manter histórico de ordered/delivered/delayed)
  DELETE FROM supply_alerts 
  WHERE project_id = p_project_id AND status = 'pending';
  
  -- Inserir novos alertas baseados no planejamento
  INSERT INTO supply_alerts (
    project_id,
    measurement_id,
    family_id,
    required_date,
    order_by_date,
    total_quantity,
    total_value,
    status
  )
  SELECT 
    p_project_id,
    m.id as measurement_id,
    mf.id as family_id,
    m.start_date as required_date,
    m.start_date - COALESCE(plt.lead_time_days, mf.lead_time_days, v_default_lead_time) as order_by_date,
    COALESCE(SUM(sm.quantity_per_house * ms.planned_houses), 0) as total_quantity,
    COALESCE(SUM(sm.quantity_per_house * ms.planned_houses * COALESCE(mat.unit_value, 0)), 0) as total_value,
    'pending'
  FROM measurements m
  JOIN measurement_services ms ON ms.measurement_id = m.id
  JOIN service_materials sm ON sm.project_id = p_project_id 
    AND sm.macro_id = ms.macro_id 
    AND sm.scope_id = ms.scope_id
  JOIN materials mat ON mat.id = sm.material_id
  JOIN material_families mf ON mf.id = mat.family_id
  LEFT JOIN project_lead_times plt ON plt.project_id = p_project_id AND plt.family_id = mf.id
  WHERE m.project_id = p_project_id
    AND m.start_date >= CURRENT_DATE
  GROUP BY m.id, mf.id, m.start_date, plt.lead_time_days, mf.lead_time_days
  HAVING SUM(sm.quantity_per_house * ms.planned_houses) > 0
  ON CONFLICT (project_id, COALESCE(measurement_id, '00000000-0000-0000-0000-000000000000'::uuid), family_id) 
  DO UPDATE SET
    required_date = EXCLUDED.required_date,
    order_by_date = EXCLUDED.order_by_date,
    total_quantity = EXCLUDED.total_quantity,
    total_value = EXCLUDED.total_value,
    updated_at = now();
    
  -- Marcar alertas como atrasados se order_by_date já passou
  UPDATE supply_alerts
  SET status = 'delayed', updated_at = now()
  WHERE project_id = p_project_id
    AND status = 'pending'
    AND order_by_date < CURRENT_DATE;
END;
$$;

-- 7. Criar função para recalcular alertas de uma medição específica
CREATE OR REPLACE FUNCTION public.recalc_alerts_for_measurement(p_measurement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_default_lead_time integer := 7;
BEGIN
  -- Obter project_id da medição
  SELECT project_id INTO v_project_id FROM measurements WHERE id = p_measurement_id;
  
  IF v_project_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Deletar alertas pendentes desta medição
  DELETE FROM supply_alerts 
  WHERE measurement_id = p_measurement_id AND status = 'pending';
  
  -- Inserir novos alertas para esta medição
  INSERT INTO supply_alerts (
    project_id,
    measurement_id,
    family_id,
    required_date,
    order_by_date,
    total_quantity,
    total_value,
    status
  )
  SELECT 
    v_project_id,
    m.id as measurement_id,
    mf.id as family_id,
    m.start_date as required_date,
    m.start_date - COALESCE(plt.lead_time_days, mf.lead_time_days, v_default_lead_time) as order_by_date,
    COALESCE(SUM(sm.quantity_per_house * ms.planned_houses), 0) as total_quantity,
    COALESCE(SUM(sm.quantity_per_house * ms.planned_houses * COALESCE(mat.unit_value, 0)), 0) as total_value,
    CASE WHEN m.start_date - COALESCE(plt.lead_time_days, mf.lead_time_days, v_default_lead_time) < CURRENT_DATE 
         THEN 'delayed' ELSE 'pending' END
  FROM measurements m
  JOIN measurement_services ms ON ms.measurement_id = m.id
  JOIN service_materials sm ON sm.project_id = v_project_id 
    AND sm.macro_id = ms.macro_id 
    AND sm.scope_id = ms.scope_id
  JOIN materials mat ON mat.id = sm.material_id
  JOIN material_families mf ON mf.id = mat.family_id
  LEFT JOIN project_lead_times plt ON plt.project_id = v_project_id AND plt.family_id = mf.id
  WHERE m.id = p_measurement_id
  GROUP BY m.id, mf.id, m.start_date, plt.lead_time_days, mf.lead_time_days
  HAVING SUM(sm.quantity_per_house * ms.planned_houses) > 0
  ON CONFLICT (project_id, COALESCE(measurement_id, '00000000-0000-0000-0000-000000000000'::uuid), family_id) 
  DO UPDATE SET
    required_date = EXCLUDED.required_date,
    order_by_date = EXCLUDED.order_by_date,
    total_quantity = EXCLUDED.total_quantity,
    total_value = EXCLUDED.total_value,
    status = EXCLUDED.status,
    updated_at = now();
END;
$$;

-- 8. Adicionar coluna unit_value à tabela materials se necessário para cálculo de valor
ALTER TABLE public.materials 
ADD COLUMN IF NOT EXISTS unit_value numeric DEFAULT 0;

-- 9. Trigger para atualizar supply_alerts quando measurement_services mudar
CREATE OR REPLACE FUNCTION public.trigger_update_supply_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_alerts_for_measurement(OLD.measurement_id);
    RETURN OLD;
  ELSE
    PERFORM recalc_alerts_for_measurement(NEW.measurement_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_measurement_services_supply_alerts ON public.measurement_services;
CREATE TRIGGER trigger_measurement_services_supply_alerts
AFTER INSERT OR UPDATE OR DELETE ON public.measurement_services
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_supply_alerts();

-- 10. Trigger para atualizar supply_alerts quando project_lead_times mudar
CREATE OR REPLACE FUNCTION public.trigger_update_lead_times_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM regenerate_supply_alerts(OLD.project_id);
    RETURN OLD;
  ELSE
    PERFORM regenerate_supply_alerts(NEW.project_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trigger_project_lead_times_supply_alerts ON public.project_lead_times;
CREATE TRIGGER trigger_project_lead_times_supply_alerts
AFTER INSERT OR UPDATE OR DELETE ON public.project_lead_times
FOR EACH ROW EXECUTE FUNCTION public.trigger_update_lead_times_alerts();