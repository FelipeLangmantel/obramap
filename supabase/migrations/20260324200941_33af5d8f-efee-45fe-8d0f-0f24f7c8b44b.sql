
-- 1. Campos financeiros e vínculo de período nos lotes
ALTER TABLE public.ind_production_batches
  ADD COLUMN IF NOT EXISTS unit_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ind_period_id UUID REFERENCES public.ind_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obramap_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL;

-- 2. Percentual de entrada e condições de pagamento nas fábricas
ALTER TABLE public.ind_factories
  ADD COLUMN IF NOT EXISTS advance_payment_pct NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- 3. Vínculo de período nos envios
ALTER TABLE public.ind_shipments
  ADD COLUMN IF NOT EXISTS ind_period_id UUID REFERENCES public.ind_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obramap_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL;

-- 4. Vínculo de período no içamento
ALTER TABLE public.ind_lifting_schedule
  ADD COLUMN IF NOT EXISTS ind_period_id UUID REFERENCES public.ind_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obramap_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL;

-- 5. RPC: custos por período por fábrica
CREATE OR REPLACE FUNCTION public.get_ind_costs_by_period(p_context_id UUID)
RETURNS TABLE (
  period_id UUID,
  period_label TEXT,
  period_start DATE,
  period_end DATE,
  factory_id UUID,
  factory_name TEXT,
  planned_units INTEGER,
  actual_units INTEGER,
  unit_value NUMERIC,
  batch_value NUMERIC,
  advance_pct NUMERIC,
  advance_value NUMERIC,
  freight_value NUMERIC,
  lifting_value NUMERIC,
  total_value NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type TEXT;
  v_project UUID;
BEGIN
  SELECT context_type, obramap_project_id
  INTO v_type, v_project
  FROM ind_operation_contexts WHERE id = p_context_id;

  IF v_type = 'integrated' THEN
    RETURN QUERY
    SELECT
      pp.id, pp.name, pp.start_date, pp.end_date,
      f.id, f.name,
      COALESCE(SUM(b.planned_quantity), 0)::INTEGER,
      COALESCE(SUM(b.actual_quantity), 0)::INTEGER,
      COALESCE(MAX(b.unit_value), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0),
      COALESCE(MAX(f.advance_payment_pct), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0) * COALESCE(MAX(f.advance_payment_pct), 0) / 100,
      COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
        WHERE s2.context_id = p_context_id AND s2.obramap_period_id = pp.id), 0),
      COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
        WHERE ls2.context_id = p_context_id AND ls2.obramap_period_id = pp.id), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0)
        + COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
          WHERE s2.context_id = p_context_id AND s2.obramap_period_id = pp.id), 0)
        + COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
          WHERE ls2.context_id = p_context_id AND ls2.obramap_period_id = pp.id), 0)
    FROM planning_periods pp
    LEFT JOIN ind_production_batches b
      ON b.obramap_period_id = pp.id AND b.context_id = p_context_id
    LEFT JOIN ind_factories f ON f.id = b.factory_id
    WHERE pp.project_id = v_project
    GROUP BY pp.id, pp.name, pp.start_date, pp.end_date, f.id, f.name
    ORDER BY pp.start_date;
  ELSE
    RETURN QUERY
    SELECT
      ip.id, ip.name, ip.start_date, ip.end_date,
      f.id, f.name,
      COALESCE(SUM(b.planned_quantity), 0)::INTEGER,
      COALESCE(SUM(b.actual_quantity), 0)::INTEGER,
      COALESCE(MAX(b.unit_value), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0),
      COALESCE(MAX(f.advance_payment_pct), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0) * COALESCE(MAX(f.advance_payment_pct), 0) / 100,
      COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
        WHERE s2.context_id = p_context_id AND s2.ind_period_id = ip.id), 0),
      COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
        WHERE ls2.context_id = p_context_id AND ls2.ind_period_id = ip.id), 0),
      COALESCE(SUM(b.planned_quantity * b.unit_value), 0)
        + COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
          WHERE s2.context_id = p_context_id AND s2.ind_period_id = ip.id), 0)
        + COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
          WHERE ls2.context_id = p_context_id AND ls2.ind_period_id = ip.id), 0)
    FROM ind_periods ip
    LEFT JOIN ind_production_batches b
      ON b.ind_period_id = ip.id AND b.context_id = p_context_id
    LEFT JOIN ind_factories f ON f.id = b.factory_id
    WHERE ip.context_id = p_context_id
    GROUP BY ip.id, ip.name, ip.start_date, ip.end_date, ip.target_units, f.id, f.name
    ORDER BY ip.start_date;
  END IF;
END; $$;

-- 6. RPC: planejamento longo prazo
CREATE OR REPLACE FUNCTION public.get_ind_long_term_plan(p_context_id UUID)
RETURNS TABLE (
  period_id UUID,
  period_label TEXT,
  period_start DATE,
  period_end DATE,
  target_units INTEGER,
  factory_id UUID,
  factory_name TEXT,
  planned_units INTEGER,
  actual_units INTEGER,
  completion_pct NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type TEXT;
  v_project UUID;
BEGIN
  SELECT context_type, obramap_project_id
  INTO v_type, v_project
  FROM ind_operation_contexts WHERE id = p_context_id;

  IF v_type = 'integrated' THEN
    RETURN QUERY
    SELECT
      pp.id, pp.name, pp.start_date, pp.end_date,
      COALESCE(pp.total_planned_houses, 0)::INTEGER,
      f.id, f.name,
      COALESCE(SUM(b.planned_quantity), 0)::INTEGER,
      COALESCE(SUM(b.actual_quantity), 0)::INTEGER,
      CASE WHEN COALESCE(pp.total_planned_houses, 0) > 0
        THEN ROUND((COALESCE(SUM(b.actual_quantity), 0)::NUMERIC / pp.total_planned_houses) * 100, 1)
        ELSE 0 END
    FROM planning_periods pp
    LEFT JOIN ind_production_batches b
      ON b.obramap_period_id = pp.id AND b.context_id = p_context_id
    LEFT JOIN ind_factories f ON f.id = b.factory_id
    WHERE pp.project_id = v_project
    GROUP BY pp.id, pp.name, pp.start_date, pp.end_date, pp.total_planned_houses, f.id, f.name
    ORDER BY pp.start_date;
  ELSE
    RETURN QUERY
    SELECT
      ip.id, ip.name, ip.start_date, ip.end_date,
      ip.target_units,
      f.id, f.name,
      COALESCE(SUM(b.planned_quantity), 0)::INTEGER,
      COALESCE(SUM(b.actual_quantity), 0)::INTEGER,
      CASE WHEN ip.target_units > 0
        THEN ROUND((COALESCE(SUM(b.actual_quantity), 0)::NUMERIC / ip.target_units) * 100, 1)
        ELSE 0 END
    FROM ind_periods ip
    LEFT JOIN ind_production_batches b
      ON b.ind_period_id = ip.id AND b.context_id = p_context_id
    LEFT JOIN ind_factories f ON f.id = b.factory_id
    WHERE ip.context_id = p_context_id
    GROUP BY ip.id, ip.name, ip.start_date, ip.end_date, ip.target_units, f.id, f.name
    ORDER BY ip.start_date;
  END IF;
END; $$;

-- 7. RPC: projeção de caixa semanal
CREATE OR REPLACE FUNCTION public.get_ind_cash_projection(p_context_id UUID)
RETURNS TABLE (
  factory_id UUID,
  factory_name TEXT,
  period_label TEXT,
  period_start DATE,
  production_value NUMERIC,
  advance_pct NUMERIC,
  advance_value NUMERIC,
  advance_due_date DATE,
  freight_value NUMERIC,
  lifting_value NUMERIC,
  total_outflow NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id, f.name, ip.name,
    ip.start_date,
    COALESCE(SUM(b.planned_quantity * b.unit_value), 0),
    f.advance_payment_pct,
    COALESCE(SUM(b.planned_quantity * b.unit_value), 0) * f.advance_payment_pct / 100,
    ip.start_date - f.avg_lead_time_days,
    COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
      WHERE s2.ind_period_id = ip.id AND s2.context_id = p_context_id), 0),
    COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
      WHERE ls2.ind_period_id = ip.id AND ls2.context_id = p_context_id), 0),
    COALESCE(SUM(b.planned_quantity * b.unit_value), 0) * f.advance_payment_pct / 100
      + COALESCE((SELECT SUM(s2.freight_value) FROM ind_shipments s2
        WHERE s2.ind_period_id = ip.id AND s2.context_id = p_context_id), 0)
      + COALESCE((SELECT SUM(ls2.daily_cost) FROM ind_lifting_schedule ls2
        WHERE ls2.ind_period_id = ip.id AND ls2.context_id = p_context_id), 0)
  FROM ind_periods ip
  JOIN ind_production_batches b
    ON b.ind_period_id = ip.id AND b.context_id = p_context_id
  JOIN ind_factories f ON f.id = b.factory_id
  WHERE ip.context_id = p_context_id
    AND ip.start_date >= CURRENT_DATE
  GROUP BY f.id, f.name, ip.id, ip.name, ip.start_date, f.advance_payment_pct, f.avg_lead_time_days
  ORDER BY advance_due_date;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_ind_costs_by_period(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ind_long_term_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ind_cash_projection(UUID) TO authenticated;
