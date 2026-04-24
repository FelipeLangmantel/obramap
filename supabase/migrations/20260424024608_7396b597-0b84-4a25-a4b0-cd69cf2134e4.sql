ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS condicao_manha TEXT DEFAULT 'praticavel' CHECK (condicao_manha IN ('praticavel', 'impraticavel')),
  ADD COLUMN IF NOT EXISTS condicao_tarde TEXT DEFAULT 'praticavel' CHECK (condicao_tarde IN ('praticavel', 'impraticavel')),
  ADD COLUMN IF NOT EXISTS condicao_noite TEXT CHECK (condicao_noite IN ('praticavel', 'impraticavel'));