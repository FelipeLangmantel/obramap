-- Add financial_categories column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS financial_categories jsonb DEFAULT '["CUSTOS EXTRAS", "MATERIAIS", "MÃO DE OBRA", "ADM E SEGURANÇA", "OUTROS", "PÓS-OBRAS E PLANEJAMENTOS"]'::jsonb;