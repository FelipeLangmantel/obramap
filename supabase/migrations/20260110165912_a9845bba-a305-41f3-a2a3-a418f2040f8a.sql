-- ============================================================
-- FASE 17.1b — ATUALIZAR POLÍTICAS RLS DE ALOCAÇÃO DE CASAS
-- ============================================================
DROP POLICY IF EXISTS "Users view service house allocations of company" ON public.service_house_allocations;
DROP POLICY IF EXISTS "Users manage service house allocations of company" ON public.service_house_allocations;

DROP POLICY IF EXISTS "Users view house allocations" ON public.service_house_allocations;
CREATE POLICY "Users view house allocations"
ON public.service_house_allocations FOR SELECT
USING (
  company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users manage house allocations" ON public.service_house_allocations;
CREATE POLICY "Users manage house allocations"
ON public.service_house_allocations FOR ALL
USING (
  company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IN (SELECT company_id FROM profiles WHERE user_id = auth.uid())
);