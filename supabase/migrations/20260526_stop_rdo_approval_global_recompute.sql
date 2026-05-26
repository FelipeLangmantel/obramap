CREATE OR REPLACE FUNCTION public.fn_auto_approve_items_on_rdo_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_aprovacao = 'aprovado'
     AND COALESCE(OLD.status_aprovacao, '') <> 'aprovado'
  THEN
    UPDATE public.diary_items
       SET review_status = 'aprovado',
           reviewed_by = COALESCE(reviewed_by, auth.uid()),
           reviewed_at = COALESCE(reviewed_at, NOW())
     WHERE diary_entry_id = NEW.id
       AND deleted_at IS NULL
       AND COALESCE(review_status, 'pendente') = 'pendente';

    -- Nao recalcular public.houses.macros aqui.
    -- Aprovar diario deve apenas aprovar o diario e seus itens.
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_auto_approve_items_on_rdo_approval() IS
  'Ao aprovar RDO, marca itens pendentes/nulos como aprovados sem recalcular houses.macros globalmente.';
