-- ═══════════════════════════════════════════════════════════════
-- FIX: medicoes_ple_company FOR ALL allows viewers to write
-- 
-- Problem: The original "medicoes_ple_company" policy uses FOR ALL,
-- which covers SELECT + INSERT + UPDATE + DELETE with only a company_id
-- check. RLS uses OR between policies of the same operation type —
-- so the FOR ALL (no can_write check) was winning over the stricter
-- writers_medicoes_* policies, letting any authenticated viewer
-- INSERT/UPDATE/DELETE medições via direct API calls.
--
-- Fix: Drop the FOR ALL, replace with SELECT-only.
-- writers_medicoes_insert/update/delete (from 20260404) already
-- enforce can_write() + company scoping for all write operations.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "medicoes_ple_company" ON public.medicoes_ple;

CREATE POLICY "medicoes_ple_select" ON public.medicoes_ple
  FOR SELECT TO authenticated
  USING (
    obra_id IN (
      SELECT id FROM public.obras_portfolio
      WHERE company_id = public.get_my_company_id()
    )
  );
