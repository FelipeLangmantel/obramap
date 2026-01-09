-- =============================================
-- BUG 1 FIX: Prevent duplicate orders and ensure alert status consistency
-- =============================================

-- Add quotation_id reference to supply_alerts for tracking
ALTER TABLE public.supply_alerts 
ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES public.quotation_requests(id) ON DELETE SET NULL;

ALTER TABLE public.supply_alerts 
ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

-- Create function to validate alert status before creating quotation
CREATE OR REPLACE FUNCTION public.validate_alert_for_quotation(p_alert_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_quotation_id uuid;
BEGIN
  SELECT status, quotation_id INTO v_status, v_quotation_id
  FROM supply_alerts
  WHERE id = p_alert_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerta não encontrado: %', p_alert_id;
  END IF;
  
  -- Block if already has a quotation
  IF v_quotation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este alerta já possui uma cotação vinculada';
  END IF;
  
  -- Only allow from pending or delayed status
  IF v_status NOT IN ('pending', 'delayed') THEN
    RAISE EXCEPTION 'Apenas alertas pendentes ou atrasados podem gerar cotação. Status atual: %', v_status;
  END IF;
  
  RETURN true;
END;
$$;

-- Create transactional function to create quotation from alert
CREATE OR REPLACE FUNCTION public.create_quotation_from_alert(
  p_alert_id uuid,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert supply_alerts%ROWTYPE;
  v_quotation_id uuid;
  v_title text;
BEGIN
  -- Validate and lock the alert row
  SELECT * INTO v_alert
  FROM supply_alerts
  WHERE id = p_alert_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerta não encontrado: %', p_alert_id;
  END IF;
  
  -- Validate status
  IF v_alert.quotation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este alerta já possui uma cotação vinculada';
  END IF;
  
  IF v_alert.status NOT IN ('pending', 'delayed') THEN
    RAISE EXCEPTION 'Apenas alertas pendentes ou atrasados podem gerar cotação. Status atual: %', v_alert.status;
  END IF;
  
  -- Generate title if not provided
  v_title := COALESCE(p_title, 'Cotação de Suprimentos - ' || v_alert.order_by_date);
  
  -- Create quotation in transaction
  INSERT INTO quotation_requests (
    project_id,
    title,
    required_date,
    notes,
    status
  ) VALUES (
    v_alert.project_id,
    v_title,
    v_alert.required_date,
    p_notes,
    'pending'
  )
  RETURNING id INTO v_quotation_id;
  
  -- Update alert status and link quotation
  UPDATE supply_alerts
  SET 
    status = 'quoted',
    quotation_id = v_quotation_id,
    updated_at = now()
  WHERE id = p_alert_id;
  
  RETURN v_quotation_id;
END;
$$;

-- Create function to create purchase order from alert
CREATE OR REPLACE FUNCTION public.create_order_from_alert(
  p_alert_id uuid,
  p_supplier_id uuid,
  p_order_number text DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert supply_alerts%ROWTYPE;
  v_order_id uuid;
  v_order_number text;
BEGIN
  -- Validate and lock the alert row
  SELECT * INTO v_alert
  FROM supply_alerts
  WHERE id = p_alert_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alerta não encontrado: %', p_alert_id;
  END IF;
  
  -- Validate status - can order from quoted, approved, or pending/delayed
  IF v_alert.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este alerta já possui um pedido de compra vinculado';
  END IF;
  
  IF v_alert.status NOT IN ('pending', 'delayed', 'quoted', 'approved') THEN
    RAISE EXCEPTION 'Não é possível criar pedido para alerta com status: %', v_alert.status;
  END IF;
  
  -- Generate order number if not provided
  v_order_number := COALESCE(p_order_number, 'PO-' || to_char(now(), 'YYYYMMDD-HH24MISS'));
  
  -- Create purchase order
  INSERT INTO purchase_orders (
    project_id,
    supplier_id,
    order_number,
    quotation_id,
    total_value,
    expected_delivery_date,
    notes,
    status
  ) VALUES (
    v_alert.project_id,
    p_supplier_id,
    v_order_number,
    v_alert.quotation_id,
    v_alert.total_value,
    COALESCE(p_expected_delivery_date, v_alert.required_date),
    p_notes,
    'pending'
  )
  RETURNING id INTO v_order_id;
  
  -- Update alert status and link order
  UPDATE supply_alerts
  SET 
    status = 'ordered',
    purchase_order_id = v_order_id,
    updated_at = now()
  WHERE id = p_alert_id;
  
  RETURN v_order_id;
END;
$$;

-- =============================================
-- BUG 2 FIX: Cascade delete for planning data
-- =============================================

-- Add measurement_id FK to supply_alerts if not exists (for cascade)
ALTER TABLE public.supply_alerts
DROP CONSTRAINT IF EXISTS supply_alerts_measurement_id_fkey;

ALTER TABLE public.supply_alerts
ADD CONSTRAINT supply_alerts_measurement_id_fkey
FOREIGN KEY (measurement_id) REFERENCES public.measurements(id) ON DELETE CASCADE;

-- Add planned_production_id to supply_alerts for cascade delete
ALTER TABLE public.supply_alerts
ADD COLUMN IF NOT EXISTS planned_production_id uuid;

-- Create function to cascade delete orphaned supply data
CREATE OR REPLACE FUNCTION public.cascade_delete_planning_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  v_project_id := OLD.project_id;
  
  -- Delete supply alerts linked to this measurement
  IF TG_TABLE_NAME = 'measurements' THEN
    DELETE FROM supply_alerts WHERE measurement_id = OLD.id;
  END IF;
  
  -- For planned_productions, delete by week range
  IF TG_TABLE_NAME = 'planned_productions' THEN
    DELETE FROM supply_alerts 
    WHERE project_id = OLD.project_id 
    AND week_start = OLD.week_start 
    AND week_end = OLD.week_end
    AND (scope_id = OLD.scope_id OR scope_id IS NULL)
    AND status IN ('pending', 'delayed'); -- Only delete non-processed alerts
  END IF;
  
  -- Clean up empty quotations
  DELETE FROM quotation_requests 
  WHERE id NOT IN (
    SELECT DISTINCT quotation_id FROM supply_alerts WHERE quotation_id IS NOT NULL
  )
  AND project_id = v_project_id
  AND status = 'pending';
  
  -- Clean up empty purchase orders
  DELETE FROM purchase_orders
  WHERE id NOT IN (
    SELECT DISTINCT purchase_order_id FROM supply_alerts WHERE purchase_order_id IS NOT NULL
  )
  AND project_id = v_project_id
  AND status = 'pending';
  
  -- Regenerate alerts after cleanup
  PERFORM regenerate_supply_alerts(v_project_id);
  
  RETURN OLD;
END;
$$;

-- Create trigger for measurements deletion cascade
DROP TRIGGER IF EXISTS trigger_cascade_delete_measurement ON public.measurements;
CREATE TRIGGER trigger_cascade_delete_measurement
  AFTER DELETE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_planning_data();

-- Create trigger for planned_productions deletion cascade
DROP TRIGGER IF EXISTS trigger_cascade_delete_planned_production ON public.planned_productions;
CREATE TRIGGER trigger_cascade_delete_planned_production
  AFTER DELETE ON public.planned_productions
  FOR EACH ROW
  EXECUTE FUNCTION cascade_delete_planning_data();

-- =============================================
-- Update get_supply_alerts function to filter by status
-- =============================================
CREATE OR REPLACE FUNCTION public.get_pending_supply_alerts(p_project_id uuid)
RETURNS TABLE (
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
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
  AND sa.status IN ('pending', 'delayed')
  ORDER BY sa.order_by_date ASC;
$$;

-- =============================================
-- Update get_supply_kpis to use real data
-- =============================================
CREATE OR REPLACE FUNCTION public.get_supply_kpis(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'delayed_orders', (
      SELECT COUNT(*) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status = 'delayed'
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
    ),
    'total_pending_value', COALESCE((
      SELECT SUM(total_value) FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('pending', 'delayed', 'quoted', 'approved', 'ordered')
    ), 0),
    'next_order_date', (
      SELECT MIN(order_by_date)::text FROM supply_alerts 
      WHERE project_id = p_project_id 
      AND status IN ('pending', 'delayed')
      AND order_by_date >= CURRENT_DATE
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;