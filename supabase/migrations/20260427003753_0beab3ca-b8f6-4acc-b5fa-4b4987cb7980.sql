-- Adiciona o status 'solicitando_edicao' à coluna status_aprovacao da tabela diary_entries
ALTER TABLE public.diary_entries DROP CONSTRAINT IF EXISTS diary_entries_status_aprovacao_check;

ALTER TABLE public.diary_entries
  ADD CONSTRAINT diary_entries_status_aprovacao_check
  CHECK (status_aprovacao = ANY (ARRAY['preenchendo'::text, 'revisando'::text, 'aprovado'::text, 'solicitando_edicao'::text]));