
-- =====================================================
-- MIGRAÇÃO ESTRUTURAL: Centralizar supply_alerts em measurements/measurement_services
-- =====================================================

-- 1) REMOVER trigger redundante de planned_productions
DROP TRIGGER IF EXISTS trigger_regen_alerts_planned_productions ON public.planned_productions;
DROP FUNCTION IF EXISTS public.regen_alerts_on_planned_production() CASCADE;

-- 2) ADICIONAR family_id em measurement_services (obrigatório)
ALTER TABLE public.measurement_services 
ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.material_families(id) ON DELETE SET NULL;

-- 3) CRIAR UNIQUE CONSTRAINT em supply_alerts para evitar duplicidade
-- Combinação única: project + measurement + service (macro/scope) + family
ALTER TABLE public.supply_alerts 
DROP CONSTRAINT IF EXISTS supply_alerts_unique_measurement_service;

ALTER TABLE public.supply_alerts 
ADD CONSTRAINT supply_alerts_unique_measurement_service 
UNIQUE (project_id, measurement_id, macro_id, scope_id, family_id);

-- 4) GARANTIR CASCADE em measurement_services
ALTER TABLE public.measurement_services 
DROP CONSTRAINT IF EXISTS measurement_services_measurement_id_fkey;

ALTER TABLE public.measurement_services 
ADD CONSTRAINT measurement_services_measurement_id_fkey 
FOREIGN KEY (measurement_id) REFERENCES public.measurements(id) ON DELETE CASCADE;

-- 5) GARANTIR CASCADE em supply_alerts para measurement_id
ALTER TABLE public.supply_alerts 
DROP CONSTRAINT IF EXISTS supply_alerts_measurement_id_fkey;

ALTER TABLE public.supply_alerts 
ADD CONSTRAINT supply_alerts_measurement_id_fkey 
FOREIGN KEY (measurement_id) REFERENCES public.measurements(id) ON DELETE CASCADE;

-- 6) REESCREVER regenerate_supply_alerts usando measurements + measurement_services como fonte
CREATE OR REPLACE FUNCTION public.regenerate_supply_alerts(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_scope_item RECORD;
  v_lead_time integer;
  v_required_date date;
  v_order_by_date date;
  v_is_critical boolean;
  v_status text;
BEGIN
  -- Deletar apenas alertas pendentes/atrasados do projeto
  DELETE FROM public.supply_alerts 
  WHERE project_id = p_project_id 
    AND status IN ('pending', 'delayed');

  -- Iterar sobre measurement_services de medições futuras/em andamento
  FOR v_service IN 
    SELECT 
      ms.id as service_id,
      ms.measurement_id,
      ms.macro_id,
      ms.scope_id,
      ms.scope_name,
      ms.macro_name,
      ms.planned_houses,
      ms.planned_house_ids,
      ms.family_id as service_family_id,
      m.measurement_number,
      m.start_date,
      m.end_date,
      m.project_id
    FROM public.measurement_services ms
    JOIN public.measurements m ON m.id = ms.measurement_id
    WHERE m.project_id = p_project_id
      AND m.status IN ('planned', 'in_progress')
      AND m.end_date >= CURRENT_DATE
    ORDER BY m.start_date
  LOOP
    -- Iterar sobre scope_items de material para este serviço
    FOR v_scope_item IN
      SELECT 
        si.id as scope_item_id,
        si.name,
        si.quantity,
        si.unit_value,
        si.category,
        COALESCE(v_service.service_family_id, i.material_family_id) as family_id
      FROM public.scope_items si
      LEFT JOIN public.inputs i ON i.id = si.input_id
      WHERE si.project_id = p_project_id
        AND si.macro_id = v_service.macro_id
        AND si.scope_id = v_service.scope_id
        AND si.category = 'material'
    LOOP
      -- Pular se não tem family_id definido
      IF v_scope_item.family_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Buscar lead time (projeto > família padrão)
      SELECT COALESCE(plt.lead_time_days, mf.lead_time_days, 7)
      INTO v_lead_time
      FROM public.material_families mf
      LEFT JOIN public.project_lead_times plt 
        ON plt.family_id = mf.id AND plt.project_id = p_project_id
      WHERE mf.id = v_scope_item.family_id;

      v_lead_time := COALESCE(v_lead_time, 7);
      v_required_date := v_service.start_date;
      v_order_by_date := v_required_date - v_lead_time;
      v_is_critical := (v_order_by_date <= CURRENT_DATE + 3);
      v_status := CASE WHEN v_order_by_date < CURRENT_DATE THEN 'delayed' ELSE 'pending' END;

      -- UPSERT para evitar duplicidade
      INSERT INTO public.supply_alerts (
        project_id,
        measurement_id,
        family_id,
        scope_id,
        macro_id,
        scope_item_id,
        is_labor,
        week_start,
        week_end,
        required_date,
        order_by_date,
        planned_use_date,
        is_critical,
        status,
        total_quantity,
        total_value
      ) VALUES (
        p_project_id,
        v_service.measurement_id,
        v_scope_item.family_id,
        v_service.scope_id,
        v_service.macro_id,
        v_scope_item.scope_item_id,
        false,
        v_service.start_date,
        v_service.end_date,
        v_required_date,
        v_order_by_date,
        v_service.start_date,
        v_is_critical,
        v_status,
        v_scope_item.quantity * v_service.planned_houses,
        v_scope_item.quantity * v_scope_item.unit_value * v_service.planned_houses
      )
      ON CONFLICT (project_id, measurement_id, macro_id, scope_id, family_id)
      DO UPDATE SET
        scope_item_id = EXCLUDED.scope_item_id,
        week_start = EXCLUDED.week_start,
        week_end = EXCLUDED.week_end,
        required_date = EXCLUDED.required_date,
        order_by_date = EXCLUDED.order_by_date,
        planned_use_date = EXCLUDED.planned_use_date,
        is_critical = EXCLUDED.is_critical,
        status = CASE 
          WHEN supply_alerts.status IN ('quoted', 'approved', 'ordered', 'in_transit', 'delivered') 
          THEN supply_alerts.status 
          ELSE EXCLUDED.status 
        END,
        total_quantity = EXCLUDED.total_quantity,
        total_value = EXCLUDED.total_value,
        updated_at = now();
    END LOOP;
  END LOOP;
END;
$$;

-- 7) TRIGGER ÚNICO em measurement_services para regenerar alertas
CREATE OR REPLACE FUNCTION public.trigger_measurement_services_regen_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Obter project_id da medição
  IF TG_OP = 'DELETE' THEN
    SELECT m.project_id INTO v_project_id
    FROM public.measurements m
    WHERE m.id = OLD.measurement_id;
  ELSE
    SELECT m.project_id INTO v_project_id
    FROM public.measurements m
    WHERE m.id = NEW.measurement_id;
  END IF;

  -- Regenerar alertas para o projeto
  IF v_project_id IS NOT NULL THEN
    PERFORM public.regenerate_supply_alerts(v_project_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_measurement_services_supply_alerts ON public.measurement_services;

-- Criar trigger único
CREATE TRIGGER trigger_measurement_services_regen_alerts
AFTER INSERT OR UPDATE OR DELETE ON public.measurement_services
FOR EACH ROW
EXECUTE FUNCTION public.trigger_measurement_services_regen_alerts();

-- 8) Atualizar trigger de cascade delete em measurements para também regenerar alertas
CREATE OR REPLACE FUNCTION public.cascade_delete_planning_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  -- Para measurements, o project_id vem direto do OLD
  IF TG_TABLE_NAME = 'measurements' THEN
    v_project_id := OLD.project_id;
    
    -- Deletar planned_productions relacionadas (histórico)
    DELETE FROM public.planned_productions 
    WHERE project_id = v_project_id 
      AND measurement_number = OLD.measurement_number;
      
    -- supply_alerts e measurement_services são deletados via CASCADE
    
  -- Para planned_productions (apenas limpeza, sem regenerar alertas)
  ELSIF TG_TABLE_NAME = 'planned_productions' THEN
    v_project_id := OLD.project_id;
    -- Não faz mais nada - planned_productions não afeta supply_alerts
  END IF;

  RETURN OLD;
END;
$$;

-- Comentário explicativo
COMMENT ON FUNCTION public.regenerate_supply_alerts(uuid) IS 
'Regenera supply_alerts usando measurements + measurement_services como fonte única. 
Usa UPSERT para evitar duplicidade. Ignora planned_productions.';
