
-- 1. Adicionar campo planning_period_id em supply_requests
ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS planning_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carried_over_from_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_carried_over NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_net NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_supply_requests_period ON public.supply_requests(planning_period_id);

-- 2. Corrigir project_lead_times para incluir company_id
ALTER TABLE public.project_lead_times
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.project_lead_times plt
SET company_id = p.company_id
FROM public.projects p
WHERE p.id = plt.project_id AND plt.company_id IS NULL;

DROP POLICY IF EXISTS "Users can view project_lead_times of their company projects" ON public.project_lead_times;
DROP POLICY IF EXISTS "Admins can manage project_lead_times" ON public.project_lead_times;

CREATE POLICY "project_lead_times_company" ON public.project_lead_times
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

-- 3. Campos de alerta de atraso em supply_requests
ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS purchase_overdue BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS days_overdue INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_description TEXT,
  ADD COLUMN IF NOT EXISTS blocked_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_scope_ids TEXT[] NOT NULL DEFAULT '{}';

-- 4. Trigger: recalcular purchase_overdue automaticamente
CREATE OR REPLACE FUNCTION public.update_supply_overdue()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_by_date IS NOT NULL AND NEW.status NOT IN ('ordered','delivered','cancelled') THEN
    NEW.purchase_overdue := NEW.order_by_date < CURRENT_DATE;
    NEW.days_overdue := GREATEST(CURRENT_DATE - NEW.order_by_date, 0);
  ELSE
    NEW.purchase_overdue := false;
    NEW.days_overdue := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supply_overdue ON public.supply_requests;
CREATE TRIGGER trg_supply_overdue
  BEFORE INSERT OR UPDATE ON public.supply_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_supply_overdue();

-- 5. RPC: transferir excedente de estoque entre medições
CREATE OR REPLACE FUNCTION public.carry_over_stock(
  p_from_period_id UUID,
  p_to_period_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_carried INTEGER := 0;
  v_project_id UUID;
BEGIN
  SELECT project_id INTO v_project_id FROM planning_periods WHERE id = p_from_period_id;

  WITH stock_carried AS (
    SELECT
      mse.item_id,
      mse.item_name,
      mse.item_unit,
      mse.family_id,
      mse.family_name,
      GREATEST(mse.quantity_in_stock - mse.quantity_required, 0) AS qty_excess
    FROM measurement_stock_entries mse
    WHERE mse.planning_period_id = p_from_period_id
      AND mse.is_confirmed = true
      AND mse.quantity_in_stock > mse.quantity_required
  )
  UPDATE supply_requests sr
  SET
    quantity_carried_over = sc.qty_excess,
    quantity_net = GREATEST(sr.quantity - sc.qty_excess, 0),
    carried_over_from_period_id = p_from_period_id,
    updated_at = now()
  FROM stock_carried sc
  WHERE sr.planning_period_id = p_to_period_id
    AND sr.item_id = sc.item_id
    AND sc.qty_excess > 0;

  GET DIAGNOSTICS v_carried = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'carried_items', v_carried);
END;
$$;

-- 6. Corrigir measurement_stock_entries para usar planning_period_id
ALTER TABLE public.measurement_stock_entries
  ADD COLUMN IF NOT EXISTS planning_period_id UUID REFERENCES public.planning_periods(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_mse_period ON public.measurement_stock_entries(planning_period_id);
