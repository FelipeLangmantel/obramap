-- Corrigir RLS das tabelas do simulador de desembolsos
-- Bug: policies usavam profiles.id = auth.uid() mas o campo correto é profiles.user_id
-- Padrão correto usado em todo o projeto: profiles WHERE user_id = auth.uid()

-- ── cashflow_sim_suppliers ────────────────────────────
DROP POLICY IF EXISTS "Users can manage cashflow sim suppliers for their company"
  ON public.cashflow_sim_suppliers;

CREATE POLICY "cashflow_sim_suppliers_company"
ON public.cashflow_sim_suppliers
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- ── cashflow_sim_inputs ───────────────────────────────
DROP POLICY IF EXISTS "Users can manage cashflow sim inputs for their company"
  ON public.cashflow_sim_inputs;

CREATE POLICY "cashflow_sim_inputs_company"
ON public.cashflow_sim_inputs
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- ── cashflow_simulations ──────────────────────────────
DROP POLICY IF EXISTS "Users can manage cashflow simulations for their company"
  ON public.cashflow_simulations;

CREATE POLICY "cashflow_simulations_company"
ON public.cashflow_simulations
FOR ALL
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);
