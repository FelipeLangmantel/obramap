CREATE OR REPLACE FUNCTION public.sync_diary_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalizado' THEN
    NEW.status_aprovacao := 'aprovado';
  ELSIF NEW.status_aprovacao = 'aprovado' THEN
    NEW.status := 'finalizado';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.status, 'rascunho') <> 'finalizado' AND OLD.status = 'finalizado' THEN
      NEW.status_aprovacao := CASE
        WHEN NEW.status_aprovacao = 'aprovado' OR NEW.status_aprovacao IS NULL THEN 'revisando'
        ELSE NEW.status_aprovacao
      END;
    ELSIF NEW.status_aprovacao IN ('preenchendo', 'revisando') AND OLD.status = 'finalizado' THEN
      NEW.status := 'rascunho';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_diary_status_trigger ON public.diary_entries;

CREATE TRIGGER sync_diary_status_trigger
BEFORE INSERT OR UPDATE ON public.diary_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_diary_status();