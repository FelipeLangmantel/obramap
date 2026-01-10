-- ============================================================
-- FASE 16.3 — CAMPOS DE RISCO DE CAPACIDADE NO PERÍODO
-- ============================================================
ALTER TABLE public.planning_periods
ADD COLUMN IF NOT EXISTS services_capacity_risk integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS houses_capacity_risk integer DEFAULT 0;