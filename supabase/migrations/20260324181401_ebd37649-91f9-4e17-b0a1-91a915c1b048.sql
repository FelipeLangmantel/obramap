ALTER TABLE public.medicoes_ple
  ADD COLUMN IF NOT EXISTS valor_acatado NUMERIC DEFAULT 0;