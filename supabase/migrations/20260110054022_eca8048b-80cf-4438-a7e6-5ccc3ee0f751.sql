
-- ============================================================
-- PHASE 10: FORECAST DE RISCO OPERACIONAL POR SUPRIMENTOS
-- ============================================================

-- 1) Adicionar campos em supply_alerts
ALTER TABLE public.supply_alerts
ADD COLUMN IF NOT EXISTS risk_of_stop boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS related_service_id uuid REFERENCES public.measurement_services(id) ON DELETE SET NULL;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_supply_alerts_service ON public.supply_alerts(related_service_id);
CREATE INDEX IF NOT EXISTS idx_supply_alerts_risk_stop ON public.supply_alerts(risk_of_stop) WHERE risk_of_stop = true;

-- Adicionar 'supply' como tipo válido em risk_alerts
ALTER TABLE public.risk_alerts DROP CONSTRAINT IF EXISTS risk_alerts_type_check;
ALTER TABLE public.risk_alerts 
ADD CONSTRAINT risk_alerts_type_check 
CHECK (alert_type IN ('delay', 'cost', 'financial', 'productivity', 'supply'));

-- 2) Função recalculate_supply_risk
CREATE OR REPLACE FUNCTION public.recalculate_supply_risk(p_service_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_supply RECORD;
  v_data_limite_compra date;
  v_has_delivery boolean;
  v_lead_time integer;
  v_buffer_days integer := 2;
  v_risk_detected boolean := false;
BEGIN
  -- Buscar dados do serviço
  SELECT 
    ms.*,
    m.company_id,
    m.project_id
  INTO v_service
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE ms.id = p_service_id;
  
  IF NOT FOUND OR v_service.forecast_end_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Buscar supply_alerts relacionados ao serviço via macro_id/scope_id
  FOR v_supply IN 
    SELECT 
      sa.*,
      COALESCE(mf.lead_time_days, 7) as lead_time_days,
      i.name as input_name
    FROM supply_alerts sa
    LEFT JOIN inputs i ON i.id = sa.input_id
    LEFT JOIN material_families mf ON mf.id = i.material_family_id
    WHERE sa.project_id = v_service.project_id
      AND sa.is_active = true
      AND (
        sa.related_service_id = p_service_id
        OR (sa.macro_id = v_service.macro_id AND sa.scope_id = v_service.scope_id)
      )
  LOOP
    v_lead_time := COALESCE(v_supply.lead_time_days, 7);
    
    -- Calcular data limite para compra
    v_data_limite_compra := v_service.forecast_end_date - v_lead_time - v_buffer_days;
    
    -- Verificar se existe pedido entregue ou em trânsito para este insumo
    SELECT EXISTS (
      SELECT 1 
      FROM purchase_orders po
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.project_id = v_service.project_id
        AND po.status IN ('delivered', 'in_transit', 'shipped')
        AND (
          poi.name ILIKE '%' || v_supply.input_name || '%'
          OR poi.quotation_item_id IN (
            SELECT qi.id FROM quotation_items qi 
            WHERE qi.name ILIKE '%' || v_supply.input_name || '%'
          )
        )
    ) INTO v_has_delivery;
    
    -- Determinar se há risco de parada
    IF CURRENT_DATE > v_data_limite_compra AND NOT v_has_delivery THEN
      v_risk_detected := true;
      
      -- Atualizar supply_alert
      UPDATE supply_alerts
      SET 
        risk_of_stop = true,
        related_service_id = p_service_id,
        updated_at = now()
      WHERE id = v_supply.id;
      
      -- Gerar risk_alert
      PERFORM generate_supply_risk_alert(
        v_supply.id,
        p_service_id,
        v_service.company_id,
        v_service.project_id,
        v_supply.input_name,
        v_service.macro_name,
        v_service.scope_name
      );
    ELSE
      -- Remover risco se condições não mais aplicam
      UPDATE supply_alerts
      SET 
        risk_of_stop = false,
        updated_at = now()
      WHERE id = v_supply.id
        AND risk_of_stop = true;
      
      -- Desativar alertas relacionados
      UPDATE risk_alerts
      SET is_active = false, resolved_at = now()
      WHERE service_id = p_service_id
        AND alert_type = 'supply'
        AND is_active = true
        AND message ILIKE '%' || v_supply.input_name || '%';
    END IF;
  END LOOP;
END;
$$;

-- Função auxiliar para gerar alerta de risco de suprimento
CREATE OR REPLACE FUNCTION public.generate_supply_risk_alert(
  p_supply_alert_id uuid,
  p_service_id uuid,
  p_company_id uuid,
  p_project_id uuid,
  p_input_name text,
  p_macro_name text,
  p_scope_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_measurement_id uuid;
BEGIN
  -- Buscar measurement_id do serviço
  SELECT measurement_id INTO v_measurement_id
  FROM measurement_services
  WHERE id = p_service_id;
  
  -- Verificar se já existe alerta ativo similar
  IF EXISTS (
    SELECT 1 FROM risk_alerts
    WHERE service_id = p_service_id
      AND alert_type = 'supply'
      AND is_active = true
      AND message ILIKE '%' || p_input_name || '%'
  ) THEN
    RETURN;
  END IF;
  
  -- Inserir novo alerta
  INSERT INTO risk_alerts (
    company_id,
    project_id,
    measurement_id,
    service_id,
    level,
    alert_type,
    message
  ) VALUES (
    p_company_id,
    p_project_id,
    v_measurement_id,
    p_service_id,
    'critical',
    'supply',
    format(
      'Risco de parada do serviço "%s - %s" por falta do insumo "%s"',
      p_macro_name,
      p_scope_name,
      p_input_name
    )
  );
END;
$$;

-- 3) Função para recalcular risco de todos os serviços de um projeto
CREATE OR REPLACE FUNCTION public.recalculate_project_supply_risks(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
BEGIN
  FOR v_service_id IN 
    SELECT ms.id 
    FROM measurement_services ms
    JOIN measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = p_project_id
      AND ms.forecast_end_date IS NOT NULL
  LOOP
    PERFORM recalculate_supply_risk(v_service_id);
  END LOOP;
END;
$$;

-- 4) Trigger para recalcular quando forecast_end_date mudar
CREATE OR REPLACE FUNCTION public.trigger_supply_risk_on_forecast_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recalcular risco de suprimento se forecast_end_date mudou
  IF TG_OP = 'UPDATE' AND OLD.forecast_end_date IS DISTINCT FROM NEW.forecast_end_date THEN
    PERFORM recalculate_supply_risk(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supply_risk_forecast ON public.measurement_services;
CREATE TRIGGER trg_supply_risk_forecast
AFTER UPDATE ON public.measurement_services
FOR EACH ROW
EXECUTE FUNCTION trigger_supply_risk_on_forecast_change();

-- Trigger para recalcular quando supply_alert mudar
CREATE OR REPLACE FUNCTION public.trigger_supply_risk_on_alert_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Se tinha serviço relacionado, recalcular
    IF OLD.related_service_id IS NOT NULL THEN
      PERFORM recalculate_supply_risk(OLD.related_service_id);
    END IF;
    RETURN OLD;
  END IF;
  
  -- Buscar serviço relacionado pelo macro/scope se não tiver related_service_id
  IF NEW.related_service_id IS NOT NULL THEN
    PERFORM recalculate_supply_risk(NEW.related_service_id);
  ELSIF NEW.macro_id IS NOT NULL AND NEW.scope_id IS NOT NULL THEN
    FOR v_service_id IN
      SELECT ms.id
      FROM measurement_services ms
      JOIN measurements m ON m.id = ms.measurement_id
      WHERE m.project_id = NEW.project_id
        AND ms.macro_id = NEW.macro_id
        AND ms.scope_id = NEW.scope_id
    LOOP
      PERFORM recalculate_supply_risk(v_service_id);
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supply_risk_alert ON public.supply_alerts;
CREATE TRIGGER trg_supply_risk_alert
AFTER INSERT OR UPDATE OR DELETE ON public.supply_alerts
FOR EACH ROW
EXECUTE FUNCTION trigger_supply_risk_on_alert_change();

-- Trigger para recalcular quando purchase_order mudar
CREATE OR REPLACE FUNCTION public.trigger_supply_risk_on_purchase_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Recalcular todos os riscos do projeto
    PERFORM recalculate_project_supply_risks(OLD.project_id);
    RETURN OLD;
  END IF;
  
  -- Recalcular se status ou data mudou
  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      OLD.status IS DISTINCT FROM NEW.status OR
      OLD.expected_delivery_date IS DISTINCT FROM NEW.expected_delivery_date OR
      OLD.actual_delivery_date IS DISTINCT FROM NEW.actual_delivery_date
    )
  ) THEN
    PERFORM recalculate_project_supply_risks(NEW.project_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supply_risk_purchase ON public.purchase_orders;
CREATE TRIGGER trg_supply_risk_purchase
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_supply_risk_on_purchase_change();

-- 5) RPC get_operational_risk_dashboard
CREATE OR REPLACE FUNCTION public.get_operational_risk_dashboard(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_services_at_risk jsonb;
  v_total_impact_days integer;
  v_affected_fronts integer;
  v_critical_supplies jsonb;
BEGIN
  -- Serviços em risco por suprimentos
  SELECT jsonb_agg(service_risk ORDER BY days_at_risk DESC)
  INTO v_services_at_risk
  FROM (
    SELECT jsonb_build_object(
      'service_id', ms.id,
      'service_name', ms.macro_name || ' - ' || ms.scope_name,
      'forecast_end_date', ms.forecast_end_date,
      'planned_houses', ms.planned_houses,
      'missing_inputs', (
        SELECT jsonb_agg(jsonb_build_object(
          'input_id', sa.input_id,
          'input_name', i.name,
          'lead_time_days', COALESCE(mf.lead_time_days, 7),
          'required_by', ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
        ))
        FROM supply_alerts sa
        LEFT JOIN inputs i ON i.id = sa.input_id
        LEFT JOIN material_families mf ON mf.id = i.material_family_id
        WHERE sa.related_service_id = ms.id
          AND sa.risk_of_stop = true
          AND sa.is_active = true
      ),
      'days_at_risk', CASE 
        WHEN ms.forecast_end_date IS NOT NULL 
        THEN GREATEST(0, CURRENT_DATE - (ms.forecast_end_date - 9)::date)
        ELSE 0
      END
    ) as service_risk
    FROM measurement_services ms
    JOIN measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = p_project_id
      AND EXISTS (
        SELECT 1 FROM supply_alerts sa
        WHERE sa.related_service_id = ms.id
          AND sa.risk_of_stop = true
          AND sa.is_active = true
      )
  ) sq;
  
  -- Calcular impacto total em dias
  SELECT COALESCE(SUM(
    CASE 
      WHEN ms.forecast_end_date IS NOT NULL 
      THEN GREATEST(0, CURRENT_DATE - (ms.forecast_end_date - 9)::date)
      ELSE 0
    END
  ), 0)
  INTO v_total_impact_days
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE m.project_id = p_project_id
    AND EXISTS (
      SELECT 1 FROM supply_alerts sa
      WHERE sa.related_service_id = ms.id
        AND sa.risk_of_stop = true
        AND sa.is_active = true
    );
  
  -- Quantidade de frentes afetadas (serviços únicos por macro)
  SELECT COUNT(DISTINCT ms.macro_id)
  INTO v_affected_fronts
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  WHERE m.project_id = p_project_id
    AND EXISTS (
      SELECT 1 FROM supply_alerts sa
      WHERE sa.related_service_id = ms.id
        AND sa.risk_of_stop = true
        AND sa.is_active = true
    );
  
  -- Suprimentos críticos (com risk_of_stop)
  SELECT jsonb_agg(jsonb_build_object(
    'supply_alert_id', sa.id,
    'input_name', i.name,
    'input_category', i.category,
    'affected_service', ms.macro_name || ' - ' || ms.scope_name,
    'days_overdue', GREATEST(0, CURRENT_DATE - (
      ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
    )::date),
    'required_quantity', sa.required_quantity,
    'available_quantity', sa.available_quantity
  ) ORDER BY CURRENT_DATE - (ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2)::date DESC)
  INTO v_critical_supplies
  FROM supply_alerts sa
  JOIN inputs i ON i.id = sa.input_id
  JOIN measurement_services ms ON ms.id = sa.related_service_id
  JOIN measurements m ON m.id = ms.measurement_id
  LEFT JOIN material_families mf ON mf.id = i.material_family_id
  WHERE sa.project_id = p_project_id
    AND sa.risk_of_stop = true
    AND sa.is_active = true;
  
  -- Montar resultado final
  v_result := jsonb_build_object(
    'summary', jsonb_build_object(
      'services_at_risk_count', COALESCE(jsonb_array_length(v_services_at_risk), 0),
      'total_impact_days', v_total_impact_days,
      'affected_fronts', v_affected_fronts,
      'critical_supplies_count', COALESCE(jsonb_array_length(v_critical_supplies), 0)
    ),
    'services_at_risk', COALESCE(v_services_at_risk, '[]'::jsonb),
    'critical_supplies', COALESCE(v_critical_supplies, '[]'::jsonb),
    'recommendations', (
      SELECT jsonb_agg(jsonb_build_object(
        'priority', CASE 
          WHEN days_overdue > 7 THEN 'urgent'
          WHEN days_overdue > 3 THEN 'high'
          ELSE 'medium'
        END,
        'action', CASE 
          WHEN days_overdue > 7 THEN 'Compra emergencial necessária para ' || input_name
          WHEN days_overdue > 3 THEN 'Agilizar pedido de ' || input_name
          ELSE 'Monitorar estoque de ' || input_name
        END,
        'input_name', input_name,
        'days_overdue', days_overdue
      ) ORDER BY days_overdue DESC)
      FROM (
        SELECT 
          i.name as input_name,
          GREATEST(0, CURRENT_DATE - (
            ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
          )::date) as days_overdue
        FROM supply_alerts sa
        JOIN inputs i ON i.id = sa.input_id
        JOIN measurement_services ms ON ms.id = sa.related_service_id
        LEFT JOIN material_families mf ON mf.id = i.material_family_id
        WHERE sa.project_id = p_project_id
          AND sa.risk_of_stop = true
          AND sa.is_active = true
      ) recommendations
    ),
    'generated_at', now()
  );
  
  RETURN v_result;
END;
$$;

-- RPC para vincular supply_alert a um serviço
CREATE OR REPLACE FUNCTION public.link_supply_to_service(
  p_supply_alert_id uuid,
  p_service_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE supply_alerts
  SET 
    related_service_id = p_service_id,
    updated_at = now()
  WHERE id = p_supply_alert_id;
  
  -- Recalcular risco
  PERFORM recalculate_supply_risk(p_service_id);
END;
$$;

-- RPC para obter resumo de riscos operacionais por projeto
CREATE OR REPLACE FUNCTION public.get_supply_risk_summary(p_project_id uuid)
RETURNS TABLE (
  macro_name text,
  scope_name text,
  service_id uuid,
  forecast_end_date date,
  inputs_at_risk bigint,
  max_days_overdue integer,
  risk_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ms.macro_name,
    ms.scope_name,
    ms.id as service_id,
    ms.forecast_end_date,
    COUNT(sa.id) as inputs_at_risk,
    MAX(GREATEST(0, CURRENT_DATE - (
      ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
    )::date))::integer as max_days_overdue,
    CASE 
      WHEN MAX(GREATEST(0, CURRENT_DATE - (
        ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
      )::date)) > 7 THEN 'critical'
      WHEN MAX(GREATEST(0, CURRENT_DATE - (
        ms.forecast_end_date - COALESCE(mf.lead_time_days, 7) - 2
      )::date)) > 3 THEN 'warning'
      ELSE 'attention'
    END as risk_level
  FROM measurement_services ms
  JOIN measurements m ON m.id = ms.measurement_id
  JOIN supply_alerts sa ON sa.related_service_id = ms.id
  LEFT JOIN inputs i ON i.id = sa.input_id
  LEFT JOIN material_families mf ON mf.id = i.material_family_id
  WHERE m.project_id = p_project_id
    AND sa.risk_of_stop = true
    AND sa.is_active = true
  GROUP BY ms.id, ms.macro_name, ms.scope_name, ms.forecast_end_date
  ORDER BY max_days_overdue DESC, inputs_at_risk DESC;
END;
$$;
