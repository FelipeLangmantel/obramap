INSERT INTO public.system_modules (key, name, description, is_enabled, is_beta)
VALUES
  ('holding-receitas',   'Holding — Receitas',    'Módulo de receitas e medições PLE da holding', true, false),
  ('holding-despesas',   'Holding — Despesas',    'Módulo de despesas e custos da holding',       true, false),
  ('holding-documentos', 'Holding — Documentos',  'Módulo de documentação consolidada da holding',true, false),
  ('holding-prd',        'Holding — PRD',         'Módulo de cronograma PRD da holding',          true, false),
  ('holding-insights',   'Holding — IA Insights', 'Módulo de insights com IA da holding',         true, true)
ON CONFLICT (key) DO NOTHING;