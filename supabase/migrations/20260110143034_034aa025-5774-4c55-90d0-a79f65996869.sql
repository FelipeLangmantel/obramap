-- Adicionar campo unit_revenue_value para armazenar o valor unitário contratual
ALTER TABLE public.service_planning_targets 
ADD COLUMN IF NOT EXISTS unit_revenue_value numeric DEFAULT 0;

-- Adicionar campo unit_cost_value para armazenar o custo unitário
ALTER TABLE public.service_planning_targets 
ADD COLUMN IF NOT EXISTS unit_cost_value numeric DEFAULT 0;

COMMENT ON COLUMN public.service_planning_targets.unit_revenue_value IS 'Valor unitário contratual por unidade (casa)';
COMMENT ON COLUMN public.service_planning_targets.unit_cost_value IS 'Custo unitário por unidade (casa)';