
-- 1. Tabela de configuração de dias úteis por projeto
CREATE TABLE public.weekly_plan_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  working_days_per_week INTEGER NOT NULL DEFAULT 6,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

ALTER TABLE public.weekly_plan_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage weekly plan config for their company"
  ON public.weekly_plan_config FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 2. Tabela de semanas geradas por período
CREATE TABLE public.weekly_plan_weeks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_period_id UUID NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(planning_period_id, week_number)
);

ALTER TABLE public.weekly_plan_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage weekly plan weeks for their company"
  ON public.weekly_plan_weeks FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 3. Tabela de alocação de serviços por semana com casas
CREATE TABLE public.weekly_plan_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  weekly_plan_week_id UUID NOT NULL REFERENCES public.weekly_plan_weeks(id) ON DELETE CASCADE,
  planning_period_id UUID NOT NULL REFERENCES public.planning_periods(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  macro_id TEXT NOT NULL,
  macro_name TEXT NOT NULL,
  macro_color TEXT NOT NULL DEFAULT '#6b7280',
  scope_id TEXT NOT NULL,
  scope_name TEXT NOT NULL,
  planned_house_ids INTEGER[] NOT NULL DEFAULT '{}',
  planned_houses INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(weekly_plan_week_id, macro_id, scope_id)
);

ALTER TABLE public.weekly_plan_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage weekly plan services for their company"
  ON public.weekly_plan_services FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- 4. Adicionar flag na planning_periods para indicar se semanal foi gerado
ALTER TABLE public.planning_periods ADD COLUMN IF NOT EXISTS weekly_plan_generated BOOLEAN DEFAULT false;
ALTER TABLE public.planning_periods ADD COLUMN IF NOT EXISTS weekly_plan_locked BOOLEAN DEFAULT false;

-- 5. Trigger para atualizar updated_at
CREATE TRIGGER update_weekly_plan_config_updated_at
  BEFORE UPDATE ON public.weekly_plan_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_plan_weeks_updated_at
  BEFORE UPDATE ON public.weekly_plan_weeks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_plan_services_updated_at
  BEFORE UPDATE ON public.weekly_plan_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
