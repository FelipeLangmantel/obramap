-- ============================================================
-- PASSO 11.1 — RECEBIMENTOS DO CONTRATO (CAIXA)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contract_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.project_contracts(id) ON DELETE CASCADE,
  measurement_id uuid REFERENCES public.measurements(id) ON DELETE SET NULL,
  amount_received numeric NOT NULL CHECK (amount_received >= 0),
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  source text NOT NULL DEFAULT 'CAIXA',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_receipts_contract
  ON public.contract_receipts(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_receipts_measurement
  ON public.contract_receipts(measurement_id);

-- Enable RLS
ALTER TABLE public.contract_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_receipts
CREATE POLICY "Users can view contract_receipts of their company"
  ON public.contract_receipts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_contracts pc
      JOIN public.projects p ON p.id = pc.project_id
      JOIN public.profiles pr ON pr.company_id = p.company_id
      WHERE pc.id = contract_receipts.contract_id
        AND pr.user_id = auth.uid()
        AND pr.status = 'active'
    )
  );

CREATE POLICY "Admins can manage contract_receipts"
  ON public.contract_receipts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.project_contracts pc
      JOIN public.projects p ON p.id = pc.project_id
      JOIN public.profiles pr ON pr.company_id = p.company_id
      WHERE pc.id = contract_receipts.contract_id
        AND pr.user_id = auth.uid()
        AND pr.system_role IN ('system_admin', 'admin')
        AND pr.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_contracts pc
      JOIN public.projects p ON p.id = pc.project_id
      JOIN public.profiles pr ON pr.company_id = p.company_id
      WHERE pc.id = contract_receipts.contract_id
        AND pr.user_id = auth.uid()
        AND pr.system_role IN ('system_admin', 'admin')
        AND pr.status = 'active'
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_contract_receipts_updated_at
  BEFORE UPDATE ON public.contract_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();