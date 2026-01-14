-- =====================================================
-- REFATORAÇÃO COMPLETA: Módulo de Suprimentos com Controle de Estado
-- =====================================================

-- 1) CRIAR ENUM para status de suprimentos
DO $$ BEGIN
  CREATE TYPE supply_request_status AS ENUM ('alert', 'quoted', 'ordered', 'delivered', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) CRIAR TABELA supply_requests
CREATE TABLE IF NOT EXISTS public.supply_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_id uuid NULL,
  item_name text NOT NULL,
  item_unit text DEFAULT 'un',
  quantity numeric NOT NULL DEFAULT 0,
  unit_value numeric DEFAULT 0,
  total_value numeric GENERATED ALWAYS AS (quantity * COALESCE(unit_value, 0)) STORED,
  status supply_request_status NOT NULL DEFAULT 'alert',
  source_plan_id uuid NULL,
  measurement_id uuid NULL REFERENCES public.measurements(id) ON DELETE SET NULL,
  family_id uuid NULL REFERENCES public.material_families(id) ON DELETE SET NULL,
  scope_id text NULL,
  macro_id text NULL,
  required_date date NULL,
  order_by_date date NULL,
  is_critical boolean DEFAULT false,
  notes text NULL,
  quotation_id uuid NULL,
  purchase_order_id uuid NULL,
  supplier_id uuid NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3) CRIAR ÍNDICE ÚNICO para impedir duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_requests_unique_active
ON public.supply_requests (project_id, item_id, source_plan_id)
WHERE status NOT IN ('cancelled', 'delivered');

-- 4) CRIAR ÍNDICES para performance
CREATE INDEX IF NOT EXISTS idx_supply_requests_project ON public.supply_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_supply_requests_status ON public.supply_requests(status);
CREATE INDEX IF NOT EXISTS idx_supply_requests_family ON public.supply_requests(family_id);
CREATE INDEX IF NOT EXISTS idx_supply_requests_order_date ON public.supply_requests(order_by_date);

-- 5) HABILITAR RLS
ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;

-- 6) CRIAR POLÍTICAS RLS (usando profiles.company_id)
CREATE POLICY "Users can view supply requests of their company projects"
ON public.supply_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    INNER JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = supply_requests.project_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert supply requests to their company projects"
ON public.supply_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    INNER JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = supply_requests.project_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update supply requests of their company projects"
ON public.supply_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    INNER JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE p.id = supply_requests.project_id
    AND pr.user_id = auth.uid()
  )
);

-- 7) CRIAR TABELA supply_status_logs para auditoria
CREATE TABLE IF NOT EXISTS public.supply_status_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supply_request_id uuid NOT NULL REFERENCES public.supply_requests(id) ON DELETE CASCADE,
  old_status supply_request_status NULL,
  new_status supply_request_status NOT NULL,
  user_id uuid NULL,
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 8) CRIAR ÍNDICES para logs
CREATE INDEX IF NOT EXISTS idx_supply_status_logs_request ON public.supply_status_logs(supply_request_id);
CREATE INDEX IF NOT EXISTS idx_supply_status_logs_user ON public.supply_status_logs(user_id);

-- 9) HABILITAR RLS para logs
ALTER TABLE public.supply_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view supply logs of their company projects"
ON public.supply_status_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.supply_requests sr
    INNER JOIN public.projects p ON p.id = sr.project_id
    INNER JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE sr.id = supply_status_logs.supply_request_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert supply logs"
ON public.supply_status_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.supply_requests sr
    INNER JOIN public.projects p ON p.id = sr.project_id
    INNER JOIN public.profiles pr ON pr.company_id = p.company_id
    WHERE sr.id = supply_status_logs.supply_request_id
    AND pr.user_id = auth.uid()
  )
);

-- 10) CRIAR TRIGGER para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_supply_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supply_requests_updated_at ON public.supply_requests;
CREATE TRIGGER trg_supply_requests_updated_at
BEFORE UPDATE ON public.supply_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_supply_requests_updated_at();

-- 11) CRIAR RPC para validar e executar transição de status
CREATE OR REPLACE FUNCTION public.transition_supply_status(
  p_request_id uuid,
  p_new_status text,
  p_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_status supply_request_status;
  v_new_status supply_request_status;
  v_valid_transitions jsonb;
BEGIN
  v_valid_transitions := '{
    "alert": ["quoted", "cancelled"],
    "quoted": ["ordered", "cancelled"],
    "ordered": ["delivered"],
    "delivered": [],
    "cancelled": []
  }'::jsonb;
  
  BEGIN
    v_new_status := p_new_status::supply_request_status;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Status inválido: ' || p_new_status
    );
  END;
  
  SELECT status INTO v_current_status
  FROM supply_requests
  WHERE id = p_request_id;
  
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Requisição não encontrada'
    );
  END IF;
  
  IF NOT (v_valid_transitions->v_current_status::text) ? p_new_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transição inválida: %s → %s. Transições permitidas: %s', 
        v_current_status, 
        p_new_status,
        v_valid_transitions->v_current_status::text
      )
    );
  END IF;
  
  UPDATE supply_requests
  SET status = v_new_status
  WHERE id = p_request_id;
  
  INSERT INTO supply_status_logs (
    supply_request_id,
    old_status,
    new_status,
    user_id,
    notes
  ) VALUES (
    p_request_id,
    v_current_status,
    v_new_status,
    p_user_id,
    p_notes
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'old_status', v_current_status,
    'new_status', v_new_status,
    'request_id', p_request_id
  );
END;
$$;

-- 12) CRIAR RPC para buscar requisições por status
CREATE OR REPLACE FUNCTION public.get_supply_requests_by_status(
  p_project_id uuid,
  p_status text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  project_id uuid,
  item_id uuid,
  item_name text,
  item_unit text,
  quantity numeric,
  unit_value numeric,
  total_value numeric,
  status text,
  source_plan_id uuid,
  measurement_id uuid,
  family_id uuid,
  family_name text,
  family_color text,
  scope_id text,
  macro_id text,
  required_date date,
  order_by_date date,
  is_critical boolean,
  notes text,
  quotation_id uuid,
  purchase_order_id uuid,
  supplier_id uuid,
  supplier_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sr.id,
    sr.project_id,
    sr.item_id,
    sr.item_name,
    sr.item_unit,
    sr.quantity,
    sr.unit_value,
    sr.total_value,
    sr.status::text,
    sr.source_plan_id,
    sr.measurement_id,
    sr.family_id,
    mf.name as family_name,
    mf.color as family_color,
    sr.scope_id,
    sr.macro_id,
    sr.required_date,
    sr.order_by_date,
    sr.is_critical,
    sr.notes,
    sr.quotation_id,
    sr.purchase_order_id,
    sr.supplier_id,
    s.name as supplier_name,
    sr.created_at,
    sr.updated_at
  FROM supply_requests sr
  LEFT JOIN material_families mf ON mf.id = sr.family_id
  LEFT JOIN suppliers s ON s.id = sr.supplier_id
  WHERE sr.project_id = p_project_id
    AND (p_status IS NULL OR sr.status::text = p_status)
  ORDER BY 
    CASE sr.status 
      WHEN 'alert' THEN 1 
      WHEN 'quoted' THEN 2 
      WHEN 'ordered' THEN 3 
      WHEN 'delivered' THEN 4 
      WHEN 'cancelled' THEN 5 
    END,
    sr.order_by_date ASC NULLS LAST;
$$;

-- 13) CRIAR RPC para gerar requisições a partir do planejamento
CREATE OR REPLACE FUNCTION public.generate_supply_requests_from_planning(
  p_project_id uuid,
  p_measurement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  WITH planned_items AS (
    SELECT DISTINCT
      psr.project_id,
      psr.input_id as item_id,
      COALESCE(psr.input_name, i.name) as item_name,
      COALESCE(psr.unit, i.unit, 'un') as item_unit,
      psr.quantity_required as quantity,
      i.unit_value,
      m.id as measurement_id,
      i.material_family_id as family_id,
      psr.scope_id,
      psr.macro_id,
      m.start_date as required_date,
      (m.start_date - COALESCE(mf.lead_time_days, 7))::date as order_by_date,
      psr.service_plan_id as source_plan_id
    FROM period_supply_requirements psr
    INNER JOIN planning_periods pp ON pp.id = psr.planning_period_id
    INNER JOIN measurements m ON m.planning_period_id = pp.id
    LEFT JOIN inputs i ON i.id = psr.input_id
    LEFT JOIN material_families mf ON mf.id = i.material_family_id
    WHERE psr.project_id = p_project_id
      AND (p_measurement_id IS NULL OR m.id = p_measurement_id)
      AND m.status IN ('planned', 'in_progress')
  )
  INSERT INTO supply_requests (
    project_id, item_id, item_name, item_unit, quantity, unit_value,
    measurement_id, family_id, scope_id, macro_id,
    required_date, order_by_date, source_plan_id, status
  )
  SELECT 
    pi.project_id, pi.item_id, pi.item_name, pi.item_unit, pi.quantity,
    COALESCE(pi.unit_value, 0), pi.measurement_id, pi.family_id,
    pi.scope_id, pi.macro_id, pi.required_date, pi.order_by_date,
    pi.source_plan_id, 'alert'::supply_request_status
  FROM planned_items pi
  WHERE NOT EXISTS (
    SELECT 1 FROM supply_requests sr
    WHERE sr.project_id = pi.project_id
      AND sr.item_id = pi.item_id
      AND sr.source_plan_id = pi.source_plan_id
      AND sr.status NOT IN ('cancelled', 'delivered')
  )
  ON CONFLICT DO NOTHING;
  
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'message', format('%s novas requisições criadas', v_inserted_count)
  );
END;
$$;

-- 14) COMENTÁRIOS
COMMENT ON TABLE public.supply_requests IS 'Requisições de suprimentos com controle de estado (alert → quoted → ordered → delivered)';
COMMENT ON TABLE public.supply_status_logs IS 'Log de auditoria das transições de status de suprimentos';
COMMENT ON FUNCTION public.transition_supply_status IS 'Valida e executa transições de status com registro de auditoria';
COMMENT ON FUNCTION public.get_supply_requests_by_status IS 'Busca requisições por projeto e status opcional';
COMMENT ON FUNCTION public.generate_supply_requests_from_planning IS 'Gera requisições a partir do planejamento de períodos';