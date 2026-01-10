-- Índices adicionais para budget_service_inputs
CREATE INDEX IF NOT EXISTS idx_bsi_project
  ON public.budget_service_inputs(project_id);

CREATE INDEX IF NOT EXISTS idx_bsi_service
  ON public.budget_service_inputs(macro_id, scope_id);

CREATE INDEX IF NOT EXISTS idx_bsi_input
  ON public.budget_service_inputs(input_id);