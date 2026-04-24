-- Adiciona unidade de produção também no planejamento por período
ALTER TABLE public.service_planning_by_period
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS unit_symbol text;