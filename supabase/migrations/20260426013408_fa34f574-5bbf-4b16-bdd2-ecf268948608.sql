ALTER TABLE public.project_contract_services
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS unit_symbol text;