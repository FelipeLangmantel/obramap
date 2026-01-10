-- =============================================
-- FASE 4: MEASUREMENT_SERVICES - Custos e Produtividade
-- =============================================

-- 1. Adicionar colunas de custo e produtividade
ALTER TABLE public.measurement_services
ADD COLUMN IF NOT EXISTS planned_cost numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS productivity_expected numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS teams_expected integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS professionals_per_team integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS helpers_per_team integer NOT NULL DEFAULT 0;

-- 2. Comentários explicativos
COMMENT ON COLUMN public.measurement_services.planned_cost IS 'Custo planejado do serviço para esta medição';
COMMENT ON COLUMN public.measurement_services.productivity_expected IS 'Produtividade esperada (unidades/dia/equipe)';
COMMENT ON COLUMN public.measurement_services.teams_expected IS 'Número de equipes planejadas';
COMMENT ON COLUMN public.measurement_services.professionals_per_team IS 'Profissionais por equipe';
COMMENT ON COLUMN public.measurement_services.helpers_per_team IS 'Ajudantes por equipe';

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_measurement_services_measurement ON public.measurement_services(measurement_id);
CREATE INDEX IF NOT EXISTS idx_measurement_services_company_project ON public.measurement_services(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_measurement_services_scope ON public.measurement_services(scope_id);
CREATE INDEX IF NOT EXISTS idx_measurement_services_macro ON public.measurement_services(macro_id);

-- 4. Atualizar função de proteção para incluir novos campos
CREATE OR REPLACE FUNCTION public.protect_closed_measurement_services()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_status text;
BEGIN
  -- Para INSERT, verificar via NEW
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = NEW.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido adicionar serviços a uma medição fechada.';
    END IF;
  END IF;

  -- Para UPDATE, verificar via OLD (medição original)
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = OLD.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      -- Bloquear alterações em campos críticos
      IF NEW.planned_cost != OLD.planned_cost OR
         NEW.productivity_expected != OLD.productivity_expected OR
         NEW.teams_expected != OLD.teams_expected OR
         NEW.professionals_per_team != OLD.professionals_per_team OR
         NEW.helpers_per_team != OLD.helpers_per_team OR
         NEW.planned_houses != OLD.planned_houses OR
         NEW.planned_house_ids != OLD.planned_house_ids OR
         NEW.scope_id != OLD.scope_id OR
         NEW.macro_id != OLD.macro_id THEN
        RAISE EXCEPTION 'Não é permitido alterar serviços de medição fechada.';
      END IF;
    END IF;
  END IF;

  -- Para DELETE, verificar via OLD
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_measurement_status
    FROM measurements
    WHERE id = OLD.measurement_id;
    
    IF v_measurement_status = 'closed' THEN
      RAISE EXCEPTION 'Não é permitido excluir serviços de medição fechada.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Função para sincronizar planned_cost na medição
CREATE OR REPLACE FUNCTION public.sync_measurement_planned_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_measurement_id uuid;
  v_total_cost numeric;
BEGIN
  -- Determinar qual measurement_id atualizar
  IF TG_OP = 'DELETE' THEN
    v_measurement_id := OLD.measurement_id;
  ELSE
    v_measurement_id := NEW.measurement_id;
  END IF;

  -- Calcular soma total de custos planejados
  SELECT COALESCE(SUM(planned_cost), 0)
  INTO v_total_cost
  FROM measurement_services
  WHERE measurement_id = v_measurement_id;

  -- Atualizar measurement (isso vai disparar o trigger de cálculo financeiro)
  UPDATE measurements
  SET planned_cost = v_total_cost,
      updated_at = now()
  WHERE id = v_measurement_id;

  -- Para UPDATE que muda de medição, atualizar a medição antiga também
  IF TG_OP = 'UPDATE' AND OLD.measurement_id != NEW.measurement_id THEN
    SELECT COALESCE(SUM(planned_cost), 0)
    INTO v_total_cost
    FROM measurement_services
    WHERE measurement_id = OLD.measurement_id;

    UPDATE measurements
    SET planned_cost = v_total_cost,
        updated_at = now()
    WHERE id = OLD.measurement_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Trigger para sincronização de custos
DROP TRIGGER IF EXISTS trigger_sync_measurement_planned_cost ON public.measurement_services;
CREATE TRIGGER trigger_sync_measurement_planned_cost
  AFTER INSERT OR UPDATE OR DELETE ON public.measurement_services
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_measurement_planned_cost();

-- 7. Função para calcular custo estimado baseado em scope_items
CREATE OR REPLACE FUNCTION public.calculate_service_planned_cost(
  p_company_id uuid,
  p_project_id uuid,
  p_scope_id text,
  p_macro_id text,
  p_planned_houses integer
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    SUM(si.quantity * si.unit_value * p_planned_houses), 
    0
  )
  FROM scope_items si
  WHERE si.project_id = p_project_id
    AND si.scope_id = p_scope_id
    AND si.macro_id = p_macro_id;
$$;

-- 8. Função para estimar dias de execução
CREATE OR REPLACE FUNCTION public.estimate_service_duration_days(
  p_planned_houses integer,
  p_productivity_expected numeric,
  p_teams_expected integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_productivity_expected > 0 AND p_teams_expected > 0 THEN
      CEIL(p_planned_houses::numeric / (p_productivity_expected * p_teams_expected))::integer
    ELSE
      0
  END;
$$;

-- 9. Função RPC para criar serviço com cálculo automático de custo
CREATE OR REPLACE FUNCTION public.create_measurement_service_with_cost(
  p_company_id uuid,
  p_project_id uuid,
  p_measurement_id uuid,
  p_scope_id text,
  p_scope_name text,
  p_macro_id text,
  p_macro_name text,
  p_macro_color text,
  p_planned_house_ids integer[],
  p_productivity_expected numeric DEFAULT 1,
  p_teams_expected integer DEFAULT 1,
  p_professionals_per_team integer DEFAULT 1,
  p_helpers_per_team integer DEFAULT 0,
  p_family_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service_id uuid;
  v_planned_houses integer;
  v_planned_cost numeric;
BEGIN
  -- Calcular quantidade de casas
  v_planned_houses := array_length(p_planned_house_ids, 1);
  IF v_planned_houses IS NULL THEN
    v_planned_houses := 0;
  END IF;

  -- Calcular custo baseado em scope_items
  v_planned_cost := calculate_service_planned_cost(
    p_company_id, 
    p_project_id, 
    p_scope_id, 
    p_macro_id, 
    v_planned_houses
  );

  -- Inserir serviço
  INSERT INTO measurement_services (
    company_id,
    project_id,
    measurement_id,
    scope_id,
    scope_name,
    macro_id,
    macro_name,
    macro_color,
    family_id,
    planned_house_ids,
    planned_houses,
    planned_cost,
    productivity_expected,
    teams_expected,
    professionals_per_team,
    helpers_per_team
  ) VALUES (
    p_company_id,
    p_project_id,
    p_measurement_id,
    p_scope_id,
    p_scope_name,
    p_macro_id,
    p_macro_name,
    p_macro_color,
    p_family_id,
    p_planned_house_ids,
    v_planned_houses,
    v_planned_cost,
    p_productivity_expected,
    p_teams_expected,
    p_professionals_per_team,
    p_helpers_per_team
  )
  RETURNING id INTO v_service_id;

  RETURN v_service_id;
END;
$$;

-- 10. Função para recalcular custo de um serviço existente
CREATE OR REPLACE FUNCTION public.recalculate_service_cost(p_service_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_service record;
  v_new_cost numeric;
BEGIN
  -- Buscar serviço
  SELECT * INTO v_service
  FROM measurement_services
  WHERE id = p_service_id;

  IF v_service IS NULL THEN
    RAISE EXCEPTION 'Serviço não encontrado';
  END IF;

  -- Calcular novo custo
  v_new_cost := calculate_service_planned_cost(
    v_service.company_id,
    v_service.project_id,
    v_service.scope_id,
    v_service.macro_id,
    v_service.planned_houses
  );

  -- Atualizar serviço
  UPDATE measurement_services
  SET planned_cost = v_new_cost,
      updated_at = now()
  WHERE id = p_service_id;

  RETURN v_new_cost;
END;
$$;

-- 11. Função para obter resumo de custos por medição
CREATE OR REPLACE FUNCTION public.get_measurement_cost_summary(p_measurement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'measurement_id', p_measurement_id,
    'total_planned_cost', COALESCE(SUM(ms.planned_cost), 0),
    'total_services', COUNT(ms.id),
    'total_houses', MAX(ms.planned_houses),
    'services_by_macro', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'macro_id', sub.macro_id,
          'macro_name', sub.macro_name,
          'services_count', sub.cnt,
          'total_cost', sub.cost
        )
      )
      FROM (
        SELECT macro_id, macro_name, COUNT(*) as cnt, SUM(planned_cost) as cost
        FROM measurement_services
        WHERE measurement_id = p_measurement_id
        GROUP BY macro_id, macro_name
      ) sub
    )
  ) INTO v_result
  FROM measurement_services ms
  WHERE ms.measurement_id = p_measurement_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 12. Atualizar measurement_services existentes para ter company_id e project_id NOT NULL
-- (já adicionados na fase anterior, agora garantir NOT NULL)
DO $$
BEGIN
  -- Preencher valores faltantes antes de tornar NOT NULL
  UPDATE measurement_services ms
  SET company_id = m.company_id,
      project_id = m.project_id
  FROM measurements m
  WHERE ms.measurement_id = m.id
    AND (ms.company_id IS NULL OR ms.project_id IS NULL);
END $$;

-- Tentar tornar NOT NULL (se não houver nulos)
DO $$
BEGIN
  -- Verificar se há nulos antes de alterar
  IF NOT EXISTS (
    SELECT 1 FROM measurement_services 
    WHERE company_id IS NULL OR project_id IS NULL
  ) THEN
    ALTER TABLE measurement_services 
      ALTER COLUMN company_id SET NOT NULL,
      ALTER COLUMN project_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Se falhar, continuar sem erro (pode haver dados inconsistentes)
    RAISE NOTICE 'Não foi possível tornar colunas NOT NULL: %', SQLERRM;
END $$;

-- 13. Sincronizar planned_cost inicial em measurements existentes
UPDATE measurements m
SET planned_cost = (
  SELECT COALESCE(SUM(ms.planned_cost), 0)
  FROM measurement_services ms
  WHERE ms.measurement_id = m.id
)
WHERE EXISTS (
  SELECT 1 FROM measurement_services ms WHERE ms.measurement_id = m.id
);