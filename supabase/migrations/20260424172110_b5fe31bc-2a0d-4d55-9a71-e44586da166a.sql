CREATE OR REPLACE FUNCTION public.sync_diary_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- status → status_aprovacao
  IF NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' THEN
    NEW.status_aprovacao := 'aprovado';
  ELSIF NEW.status = 'rascunho' AND OLD.status = 'finalizado' THEN
    NEW.status_aprovacao := 'preenchendo';
  END IF;

  -- status_aprovacao → status
  IF NEW.status_aprovacao = 'aprovado' AND OLD.status_aprovacao IS DISTINCT FROM 'aprovado' THEN
    NEW.status := 'finalizado';
  ELSIF NEW.status_aprovacao IN ('preenchendo', 'revisando')
        AND OLD.status_aprovacao = 'aprovado' THEN
    NEW.status := 'rascunho';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sync_diary_status_trigger ON public.diary_entries;
CREATE TRIGGER sync_diary_status_trigger
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.sync_diary_status();