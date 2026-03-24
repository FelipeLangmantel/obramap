
-- Step 1: Add new columns
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT;

-- Step 2: Migrate data with " - " pattern (name - phone)
UPDATE public.obras_portfolio
SET
  responsavel_nome = TRIM(SPLIT_PART(responsavel, ' - ', 1)),
  responsavel_telefone = TRIM(SPLIT_PART(responsavel, ' - ', 2))
WHERE responsavel IS NOT NULL
  AND responsavel LIKE '% - %';

-- Step 3: For records without " - " pattern (just a name)
UPDATE public.obras_portfolio
SET responsavel_nome = TRIM(responsavel)
WHERE responsavel IS NOT NULL
  AND responsavel NOT LIKE '% - %'
  AND (responsavel_nome IS NULL OR responsavel_nome = '');
