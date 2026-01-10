-- ============================================================
-- FASE 15.7 — IMPACTO DE SUPRIMENTOS NO PERÍODO
-- ============================================================
ALTER TABLE public.planning_periods
ADD COLUMN IF NOT EXISTS services_at_risk integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS houses_at_risk integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue_at_risk numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS result_at_risk numeric DEFAULT 0;