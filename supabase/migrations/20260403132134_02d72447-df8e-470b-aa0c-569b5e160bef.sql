
ALTER TABLE public.obras_portfolio 
  ADD COLUMN IF NOT EXISTS percentual_fisico NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_financeiro NUMERIC DEFAULT 0;

-- Migrate existing data: copy percentual_andamento to both new columns
UPDATE public.obras_portfolio
SET percentual_fisico = percentual_andamento,
    percentual_financeiro = percentual_andamento;
