
-- =====================================================
-- CORREÇÃO: Filtrar alertas de suprimentos para evitar duplicidade
-- Exclui itens com cotações ativas ou pedidos existentes (não cancelados)
-- =====================================================

-- 1) ATUALIZAR get_pending_supply_alerts para excluir itens com cotação/pedido ativo
CREATE OR REPLACE FUNCTION public.get_pending_supply_alerts(p_project_id uuid)
RETURNS TABLE(
  id uuid, 
  project_id uuid, 
  measurement_id uuid, 
  family_id uuid, 
  scope_id text, 
  macro_id text, 
  scope_item_id uuid, 
  is_labor boolean, 
  week_start date, 
  week_end date, 
  required_date date, 
  order_by_date date, 
  planned_use_date date, 
  actual_delivery_date date, 
  delay_days integer, 
  is_critical boolean, 
  status text, 
  total_quantity numeric, 
  total_value numeric, 
  notes text, 
  quotation_id uuid, 
  purchase_order_id uuid, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sa.id,
    sa.project_id,
    sa.measurement_id,
    sa.family_id,
    sa.scope_id,
    sa.macro_id,
    sa.scope_item_id,
    sa.is_labor,
    sa.week_start,
    sa.week_end,
    sa.required_date,
    sa.order_by_date,
    sa.planned_use_date,
    sa.actual_delivery_date,
    sa.delay_days,
    sa.is_critical,
    sa.status,
    sa.total_quantity,
    sa.total_value,
    sa.notes,
    sa.quotation_id,
    sa.purchase_order_id,
    sa.created_at,
    sa.updated_at
  FROM supply_alerts sa
  WHERE sa.project_id = p_project_id
    -- Status de alerta ativo (pendente ou atrasado)
    AND sa.status IN ('pending', 'delayed')
    -- EXCLUIR se já tem cotação ativa (não cancelada)
    AND NOT EXISTS (
      SELECT 1 FROM quotation_requests qr
      WHERE qr.id = sa.quotation_id
      AND qr.status NOT IN ('cancelled', 'cancelado')
    )
    -- EXCLUIR se já tem pedido de compra (não cancelado)
    AND NOT EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = sa.purchase_order_id
      AND po.status NOT IN ('cancelled', 'cancelado')
    )
    -- TAMBÉM excluir se a família/projeto tem cotação ou pedido em andamento
    -- mesmo que não esteja diretamente vinculado ao alerta
    AND NOT EXISTS (
      SELECT 1 
      FROM quotation_requests qr2
      INNER JOIN quotation_items qi ON qi.quotation_id = qr2.id
      WHERE qr2.project_id = sa.project_id
        AND qr2.status NOT IN ('cancelled', 'cancelado')
        AND qi.scope_item_id = sa.scope_item_id
    )
  ORDER BY sa.order_by_date ASC;
$$;

-- 2) CRIAR FUNÇÃO para limpar status de alertas quando cotação/pedido é criado
CREATE OR REPLACE FUNCTION public.update_alert_status_on_quotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Quando uma cotação é criada/atualizada, atualizar alertas vinculados
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Atualizar status dos alertas relacionados para 'quoted'
    UPDATE supply_alerts 
    SET 
      status = 'quoted',
      quotation_id = NEW.id,
      updated_at = now()
    WHERE project_id = NEW.project_id
      AND status IN ('pending', 'delayed')
      AND scope_item_id IN (
        SELECT qi.scope_item_id 
        FROM quotation_items qi 
        WHERE qi.quotation_id = NEW.id
      );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3) CRIAR FUNÇÃO para atualizar alertas quando pedido é criado
CREATE OR REPLACE FUNCTION public.update_alert_status_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Quando um pedido é criado, atualizar alertas vinculados
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE supply_alerts 
    SET 
      status = 'ordered',
      purchase_order_id = NEW.id,
      updated_at = now()
    WHERE project_id = NEW.project_id
      AND status IN ('pending', 'delayed', 'quoted', 'approved')
      AND quotation_id = NEW.quotation_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4) CRIAR TRIGGERS (se não existirem)
DROP TRIGGER IF EXISTS trg_quotation_update_alerts ON quotation_requests;
CREATE TRIGGER trg_quotation_update_alerts
  AFTER INSERT OR UPDATE ON quotation_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_status_on_quotation();

DROP TRIGGER IF EXISTS trg_order_update_alerts ON purchase_orders;
CREATE TRIGGER trg_order_update_alerts
  AFTER INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_alert_status_on_order();

-- 5) ATUALIZAR get_supply_kpis para considerar filtro correto
CREATE OR REPLACE FUNCTION public.get_supply_kpis(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'delayed_orders', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'delayed'
      -- Apenas alertas SEM cotação/pedido ativo
      AND quotation_id IS NULL
      AND purchase_order_id IS NULL
    ),
    'on_time_delivered', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'delivered'
      AND (actual_delivery_date IS NULL OR actual_delivery_date <= required_date)
    ),
    'late_delivered', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'delivered'
      AND actual_delivery_date > required_date
    ),
    'critical_purchases', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND is_critical = true
      AND status IN ('pending', 'delayed')
      -- Apenas alertas SEM cotação/pedido ativo
      AND quotation_id IS NULL
      AND purchase_order_id IS NULL
    ),
    'planned_without_order', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('pending', 'delayed')
      AND purchase_order_id IS NULL
      AND quotation_id IS NULL
    ),
    'avg_delay_days', COALESCE((
      SELECT AVG(delay_days)::integer FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND delay_days > 0
    ), 0),
    'production_stopped', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'delayed'
      AND order_by_date < CURRENT_DATE
      -- Apenas alertas SEM cotação/pedido ativo
      AND quotation_id IS NULL
      AND purchase_order_id IS NULL
    ),
    'total_pending_value', COALESCE((
      SELECT SUM(total_value) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('pending', 'delayed')
      -- Apenas alertas SEM cotação/pedido ativo (valor real pendente)
      AND quotation_id IS NULL
      AND purchase_order_id IS NULL
    ), 0),
    'in_quotation_value', COALESCE((
      SELECT SUM(total_value) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('quoted', 'approved')
    ), 0),
    'ordered_value', COALESCE((
      SELECT SUM(total_value) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'ordered'
    ), 0),
    'next_order_date', (
      SELECT MIN(order_by_date)::text FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('pending', 'delayed')
      AND quotation_id IS NULL
      AND purchase_order_id IS NULL
      AND order_by_date >= CURRENT_DATE
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- 6) COMENTÁRIOS EXPLICATIVOS
COMMENT ON FUNCTION public.get_pending_supply_alerts(uuid) IS 
'Retorna alertas de suprimentos pendentes EXCLUINDO itens que já possuem cotação ativa ou pedido de compra não cancelado. Evita duplicidade de compra.';

COMMENT ON FUNCTION public.update_alert_status_on_quotation() IS 
'Trigger que atualiza status de alertas para "quoted" quando uma cotação é criada.';

COMMENT ON FUNCTION public.update_alert_status_on_order() IS 
'Trigger que atualiza status de alertas para "ordered" quando um pedido é criado.';
