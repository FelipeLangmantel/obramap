-- Add legend configuration columns to projects table
ALTER TABLE public.projects 
ADD COLUMN legend_follow_macros boolean NOT NULL DEFAULT false,
ADD COLUMN custom_legend_items jsonb NOT NULL DEFAULT '[
  {"id": "nao_iniciado", "name": "Não Iniciado", "color": "#9ca3af", "minPercent": 0, "maxPercent": 0},
  {"id": "fundacao", "name": "Fundação", "color": "#ef4444", "minPercent": 1, "maxPercent": 25},
  {"id": "estrutura", "name": "Estrutura", "color": "#f59e0b", "minPercent": 26, "maxPercent": 60},
  {"id": "acabamento", "name": "Acabamento", "color": "#3b82f6", "minPercent": 61, "maxPercent": 99},
  {"id": "concluido", "name": "Concluído", "color": "#22c55e", "minPercent": 99.1, "maxPercent": 100}
]'::jsonb;