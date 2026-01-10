-- ============================================================
-- FASE 16.1 — CAPACIDADE DE PRODUÇÃO POR SERVIÇO NO PERÍODO
-- ============================================================
ALTER TABLE public.service_planning_by_period
ADD COLUMN IF NOT EXISTS available_days integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS production_capacity numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS capacity_status text DEFAULT 'ok';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_planning_capacity_status_check'
  ) THEN
    ALTER TABLE public.service_planning_by_period
    ADD CONSTRAINT service_planning_capacity_status_check
    CHECK (capacity_status IN ('ok','attention','critical'));
  END IF;
END $$;