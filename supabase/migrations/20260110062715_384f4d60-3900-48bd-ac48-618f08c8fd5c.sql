-- ============================================================
-- PASSO 11.3 — META FINANCEIRA DO CONTRATO
-- ============================================================

ALTER TABLE public.project_contracts
ADD COLUMN IF NOT EXISTS target_margin_percent numeric DEFAULT 10 CHECK (target_margin_percent >= 0),
ADD COLUMN IF NOT EXISTS target_profit_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS performance_status text DEFAULT 'ok';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_contracts_performance_status_check'
  ) THEN
    ALTER TABLE public.project_contracts
    ADD CONSTRAINT project_contracts_performance_status_check
    CHECK (performance_status IN ('ok', 'attention', 'critical'));
  END IF;
END $$;