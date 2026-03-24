ALTER TABLE public.medicoes_ple
  ADD COLUMN IF NOT EXISTS data_previsao_medicao DATE,
  ADD COLUMN IF NOT EXISTS valor_previsto_medicao NUMERIC DEFAULT 0;