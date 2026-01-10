-- ============================================================
-- Adicionar campo setup_step para controle de fluxo do projeto
-- ============================================================

-- Adicionar coluna para controle de etapas de configuração
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS setup_step text NOT NULL DEFAULT 'project_created';

-- Criar constraint de validação dos valores permitidos
ALTER TABLE public.projects 
DROP CONSTRAINT IF EXISTS projects_setup_step_check;

ALTER TABLE public.projects
ADD CONSTRAINT projects_setup_step_check 
CHECK (setup_step IN (
  'project_created',
  'blocks_configured',
  'services_defined',
  'budget_defined',
  'contract_defined',
  'long_term_planned'
));

-- Atualizar projetos existentes baseado nos dados já configurados
UPDATE public.projects p
SET setup_step = CASE
  -- Se tem planejamento de longo prazo
  WHEN EXISTS (
    SELECT 1 FROM planning_versions pv 
    WHERE pv.project_id = p.id
  ) THEN 'long_term_planned'
  -- Se tem contrato
  WHEN EXISTS (
    SELECT 1 FROM project_contracts pc 
    WHERE pc.project_id = p.id
  ) THEN 'contract_defined'
  -- Se tem orçamento (scope_costs)
  WHEN EXISTS (
    SELECT 1 FROM scope_costs sc 
    WHERE sc.project_id = p.id
  ) THEN 'budget_defined'
  -- Se tem macros/serviços configurados (macros_template com mais de 1 scope)
  WHEN jsonb_array_length(p.macros_template) > 0 
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.macros_template) macro
      WHERE jsonb_array_length(macro->'scopes') > 0
    ) THEN 'services_defined'
  -- Se tem quadras e casas
  WHEN EXISTS (
    SELECT 1 FROM quadras q WHERE q.project_id = p.id
  ) OR EXISTS (
    SELECT 1 FROM houses h WHERE h.project_id = p.id
  ) THEN 'blocks_configured'
  ELSE 'project_created'
END
WHERE setup_step = 'project_created';

-- Comentário explicativo
COMMENT ON COLUMN public.projects.setup_step IS 'Etapa de configuração do projeto: project_created, blocks_configured, services_defined, budget_defined, contract_defined, long_term_planned';