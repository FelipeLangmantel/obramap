
-- Step 1: Measurements with no data_envio and no valor_medicao → reset to prevista
UPDATE public.medicoes_ple
SET
  status_medicao = 'prevista',
  data_envio = NULL,
  data_aprovacao = NULL,
  valor_medicao = 0,
  valor_acatado = NULL,
  num_nf = NULL,
  data_pagamento = NULL,
  status_nf = 'pendente'
WHERE num_medicao != 'Saldo Inicial'
  AND (data_envio IS NULL)
  AND (valor_medicao IS NULL OR valor_medicao = 0);

-- Step 2: Measurements with data_envio and valor_medicao but no valor_acatado → enviada
UPDATE public.medicoes_ple
SET
  status_medicao = 'enviada',
  data_aprovacao = NULL,
  valor_acatado = NULL,
  num_nf = NULL,
  data_pagamento = NULL,
  status_nf = 'pendente'
WHERE num_medicao != 'Saldo Inicial'
  AND data_envio IS NOT NULL
  AND (valor_medicao IS NOT NULL AND valor_medicao > 0)
  AND (valor_acatado IS NULL OR valor_acatado = 0);

-- Step 3: Measurements with valor_acatado > 0 → aprovada (keep NF data if exists)
UPDATE public.medicoes_ple
SET status_medicao = 'aprovada'
WHERE num_medicao != 'Saldo Inicial'
  AND valor_acatado IS NOT NULL
  AND valor_acatado > 0;

-- Step 4: Fix any remaining inconsistencies - aprovada without data_envio → enviada
UPDATE public.medicoes_ple
SET
  status_medicao = 'enviada',
  data_aprovacao = NULL,
  valor_acatado = NULL
WHERE num_medicao != 'Saldo Inicial'
  AND status_medicao = 'aprovada'
  AND data_envio IS NULL;

-- Step 5: nao_iniciada and pendente without envio data → prevista
UPDATE public.medicoes_ple
SET status_medicao = 'prevista'
WHERE num_medicao != 'Saldo Inicial'
  AND status_medicao IN ('nao_iniciada', 'pendente')
  AND data_envio IS NULL;
