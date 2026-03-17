-- Fix RLS policies for weekly_plan_weeks, weekly_plan_services, weekly_plan_config
-- Bug: policies used profiles.id instead of profiles.user_id

DROP POLICY IF EXISTS "Users can manage weekly plan weeks for their company" ON public.weekly_plan_weeks;
CREATE POLICY "Users can manage weekly plan weeks for their company"
ON public.weekly_plan_weeks
FOR ALL
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Users can manage weekly plan services for their company" ON public.weekly_plan_services;
CREATE POLICY "Users can manage weekly plan services for their company"
ON public.weekly_plan_services
FOR ALL
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Users can manage weekly plan config for their company" ON public.weekly_plan_config;
CREATE POLICY "Users can manage weekly plan config for their company"
ON public.weekly_plan_config
FOR ALL
USING (company_id = public.get_my_company_id())
WITH CHECK (company_id = public.get_my_company_id());
