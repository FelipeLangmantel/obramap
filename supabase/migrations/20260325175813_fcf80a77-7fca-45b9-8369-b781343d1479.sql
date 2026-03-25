ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS has_initial_balance BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS valor_medido_inicial NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.obras_portfolio.has_initial_balance IS
  'true após criação da medição de saldo inicial. Impede edição de percentual_andamento por não-admins.';

COMMENT ON COLUMN public.obras_portfolio.valor_medido_inicial IS
  'Valor calculado no cadastro inicial: valor_contrato * percentual_andamento / 100';