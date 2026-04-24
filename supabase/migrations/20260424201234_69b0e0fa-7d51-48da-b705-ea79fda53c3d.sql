-- Adiciona campo telefone (E.164) na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Validação: aceita NULL ou formato +55DDD9XXXXXXXX (10 ou 11 dígitos após +55)
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_phone_format_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_phone_format_check
CHECK (phone IS NULL OR phone ~ '^\+55[1-9]{2}9?[0-9]{8}$');

COMMENT ON COLUMN public.profiles.phone IS 'Telefone no formato E.164 brasileiro (+55DDD9XXXXXXXX). Necessário para envio de avisos via WhatsApp.';