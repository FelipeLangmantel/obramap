
-- =====================================================
-- PROMPT 1: Fix log cascade bug
-- =====================================================

-- Make weekly_plan_service_id nullable (required for SET NULL)
ALTER TABLE public.weekly_plan_contractor_log
  ALTER COLUMN weekly_plan_service_id DROP NOT NULL;

-- Replace CASCADE FK with SET NULL
ALTER TABLE public.weekly_plan_contractor_log
  DROP CONSTRAINT weekly_plan_contractor_log_weekly_plan_service_id_fkey;

ALTER TABLE public.weekly_plan_contractor_log
  ADD CONSTRAINT weekly_plan_contractor_log_weekly_plan_service_id_fkey
  FOREIGN KEY (weekly_plan_service_id)
  REFERENCES public.weekly_plan_services(id)
  ON DELETE SET NULL;

-- =====================================================
-- PROMPT C1: Preparar banco para integração Produção ↔ Planejamento
-- =====================================================

-- 1. Corrigir production_deviations para novo fluxo
ALTER TABLE public.production_deviations
  ALTER COLUMN planned_production_id DROP NOT NULL,
  ALTER COLUMN deviation_reason DROP NOT NULL,
  ALTER COLUMN deviation_reason SET DEFAULT NULL;

ALTER TABLE public.production_deviations
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS weekly_plan_service_id UUID REFERENCES public.weekly_plan_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actual_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unplanned_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Corrigir RLS inseguro em production_deviations
DROP POLICY IF EXISTS "Anyone can view production_deviations" ON public.production_deviations;
DROP POLICY IF EXISTS "Anyone can create production_deviations" ON public.production_deviations;
DROP POLICY IF EXISTS "Anyone can update production_deviations" ON public.production_deviations;
DROP POLICY IF EXISTS "Anyone can delete production_deviations" ON public.production_deviations;

CREATE POLICY "production_deviations_company" ON public.production_deviations
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

-- 3. Corrigir RLS inseguro em weekly_productions
DROP POLICY IF EXISTS "Anyone can view weekly_productions" ON public.weekly_productions;
DROP POLICY IF EXISTS "Anyone can create weekly_productions" ON public.weekly_productions;
DROP POLICY IF EXISTS "Anyone can update weekly_productions" ON public.weekly_productions;
DROP POLICY IF EXISTS "Anyone can delete weekly_productions" ON public.weekly_productions;

CREATE POLICY "weekly_productions_company" ON public.weekly_productions
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()));

-- 4. Vincular weekly_productions ao planejamento novo
ALTER TABLE public.weekly_productions
  ADD COLUMN IF NOT EXISTS weekly_plan_service_id UUID REFERENCES public.weekly_plan_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_unplanned BOOLEAN NOT NULL DEFAULT false;
