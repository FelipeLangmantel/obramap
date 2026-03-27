-- Corrigir RLS: houses e quadras SELECT público → restrito à empresa
-- As policies de INSERT/UPDATE/DELETE já foram corrigidas anteriormente
-- Apenas o SELECT estava com USING(true) aberto

-- ── HOUSES ──────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view houses" ON public.houses;

CREATE POLICY "houses_select_company"
ON public.houses
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects
    WHERE company_id = public.get_my_company_id()
  )
);

-- ── QUADRAS ─────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view quadras" ON public.quadras;

CREATE POLICY "quadras_select_company"
ON public.quadras
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects
    WHERE company_id = public.get_my_company_id()
  )
);
