-- Sincronizar status_aprovacao ↔ status no diary_entries
-- Garantia de defesa em profundidade: o frontend já sincroniza,
-- mas se algo escrever direto no banco (admin, edge function, import), o trigger garante consistência.

CREATE OR REPLACE FUNCTION public.sync_diary_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Quando aprovado, força status = finalizado
  IF NEW.status_aprovacao = 'aprovado' THEN
    NEW.status := 'finalizado';

  -- Quando volta para preenchendo/revisando e antes estava finalizado, volta para rascunho
  ELSIF NEW.status_aprovacao IN ('preenchendo', 'revisando')
        AND TG_OP = 'UPDATE'
        AND OLD.status = 'finalizado' THEN
    NEW.status := 'rascunho';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_diary_status_trigger ON public.diary_entries;

CREATE TRIGGER sync_diary_status_trigger
  BEFORE INSERT OR UPDATE ON public.diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_diary_status();