-- ============================================================
-- FASE 13.1 — COMPLEMENTO DO PLANEJAMENTO FÍSICO-FINANCEIRO
-- (Adiciona colunas faltantes à tabela existente)
-- ============================================================

-- Adicionar colunas que não existem ainda
ALTER TABLE public.service_planning_targets
ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.project_contracts(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS measurement_id uuid REFERENCES public.measurements(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS target_margin_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_profit_value numeric DEFAULT 0;

-- Índices adicionais (se não existirem)
CREATE INDEX IF NOT EXISTS idx_targets_project_measurement
  ON public.service_planning_targets(project_id, measurement_number);

CREATE INDEX IF NOT EXISTS idx_targets_service
  ON public.service_planning_targets(macro_id, scope_id);

CREATE INDEX IF NOT EXISTS idx_targets_contract
  ON public.service_planning_targets(contract_id);

CREATE INDEX IF NOT EXISTS idx_targets_measurement
  ON public.service_planning_targets(measurement_id);

-- ============================================================
-- RLS (atualizar políticas se necessário)
-- ============================================================

DROP POLICY IF EXISTS "Company users view planning targets" ON public.service_planning_targets;
CREATE POLICY "Company users view planning targets"
ON public.service_planning_targets FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

DROP POLICY IF EXISTS "Admins manage planning targets" ON public.service_planning_targets;
CREATE POLICY "Admins manage planning targets"
ON public.service_planning_targets FOR ALL
USING (is_company_admin(auth.uid(), company_id))
WITH CHECK (is_company_admin(auth.uid(), company_id));