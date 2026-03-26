
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS aditivo_valor_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coordenador_nome text,
  ADD COLUMN IF NOT EXISTS coordenador_telefone text,
  ADD COLUMN IF NOT EXISTS planejador_nome text,
  ADD COLUMN IF NOT EXISTS planejador_telefone text;
