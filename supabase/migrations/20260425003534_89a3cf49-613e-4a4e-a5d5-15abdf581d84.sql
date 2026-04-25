-- Correção: propagação IMEDIATA do diário para o mapa
-- Regra de negócio: assim que o engenheiro lança no diário, o mapa atualiza.
-- A revisão do coordenador apenas REJEITA (remove do mapa) ou mantém aprovado.
-- Itens rejeitados ou soft-deleted ficam fora do agregado.

-- 1) Recompute volta a considerar TODOS os itens não rejeitados e não excluídos
CREATE OR REPLACE FUNCTION public.recompute_house_progress_from_diary(
  p_project_id uuid, p_house_numbers integer[] DEFAULT NULL
)
RETURNS TABLE(house_number integer, macros_updated integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_house RECORD; v_macro jsonb; v_scope jsonb;
  v_new_scopes jsonb; v_new_macros_arr jsonb; v_sum numeric; v_count integer;
BEGIN
  FOR v_house IN
    SELECT h.house_number, h.macros FROM public.houses h
    WHERE h.project_id = p_project_id
      AND (p_house_numbers IS NULL OR h.house_number = ANY(p_house_numbers))
  LOOP
    v_new_macros_arr := '[]'::jsonb; v_count := 0;
    FOR v_macro IN SELECT * FROM jsonb_array_elements(COALESCE(v_house.macros, '[]'::jsonb)) LOOP
      v_new_scopes := '[]'::jsonb;
      FOR v_scope IN SELECT * FROM jsonb_array_elements(COALESCE(v_macro->'scopes', '[]'::jsonb)) LOOP
        SELECT COALESCE(SUM(di.percentual_executado), 0) INTO v_sum
        FROM public.diary_items di
        JOIN public.diary_entries de ON de.id = di.diary_entry_id
        WHERE de.project_id = p_project_id
          AND di.macro_id = v_macro->>'id'
          AND di.scope_id = v_scope->>'id'
          AND v_house.house_number = ANY(di.house_ids)
          AND di.deleted_at IS NULL
          AND di.review_status <> 'rejeitado';  -- <<< inclui pendente + aprovado
        v_sum := LEAST(100, GREATEST(0, v_sum));
        IF (v_scope->>'progress')::numeric IS DISTINCT FROM v_sum THEN v_count := v_count + 1; END IF;
        v_new_scopes := v_new_scopes ||
          jsonb_build_object('id', v_scope->>'id','name', v_scope->>'name','progress', v_sum,
            'startDate', v_scope->'startDate','endDate', v_scope->'endDate')
          || (v_scope - 'progress' - 'id' - 'name' - 'startDate' - 'endDate');
      END LOOP;
      v_new_macros_arr := v_new_macros_arr || (v_macro - 'scopes' || jsonb_build_object('scopes', v_new_scopes));
    END LOOP;
    IF v_count > 0 THEN
      UPDATE public.houses SET macros = v_new_macros_arr, last_update = CURRENT_DATE
       WHERE project_id = p_project_id AND house_number = v_house.house_number;
    END IF;
    house_number := v_house.house_number; macros_updated := v_count; RETURN NEXT;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) TO authenticated;

-- 2) Trigger no diary_items: recalcula mapa em INSERT/UPDATE/SOFT-DELETE imediatamente
CREATE OR REPLACE FUNCTION public.fn_diary_item_propagate_to_map()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project_id uuid;
  v_house_numbers integer[];
BEGIN
  -- Identifica projeto e casas afetadas
  IF TG_OP = 'DELETE' THEN
    SELECT de.project_id INTO v_project_id
      FROM public.diary_entries de WHERE de.id = OLD.diary_entry_id;
    v_house_numbers := OLD.house_ids;
  ELSE
    SELECT de.project_id INTO v_project_id
      FROM public.diary_entries de WHERE de.id = NEW.diary_entry_id;
    v_house_numbers := NEW.house_ids;
    -- se UPDATE alterou house_ids, considera união das duas
    IF TG_OP = 'UPDATE' AND OLD.house_ids IS DISTINCT FROM NEW.house_ids THEN
      v_house_numbers := ARRAY(SELECT DISTINCT unnest(COALESCE(OLD.house_ids,'{}') || COALESCE(NEW.house_ids,'{}')));
    END IF;
  END IF;

  IF v_project_id IS NOT NULL AND v_house_numbers IS NOT NULL AND array_length(v_house_numbers,1) > 0 THEN
    PERFORM public.recompute_house_progress_from_diary(v_project_id, v_house_numbers);
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- nunca quebrar o lançamento por falha de propagação
  RAISE LOG 'fn_diary_item_propagate_to_map error: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_diary_item_propagate_to_map ON public.diary_items;
CREATE TRIGGER trg_diary_item_propagate_to_map
  AFTER INSERT OR UPDATE OR DELETE ON public.diary_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_diary_item_propagate_to_map();

-- 3) fn_block_unauthorized_regression: NÃO força mais review_status=pendente
--    (a propagação é imediata; coordenador só rejeita posteriormente se for o caso)
CREATE OR REPLACE FUNCTION public.fn_block_unauthorized_regression()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_coord_or_admin BOOLEAN := false; v_role TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.percentual_executado >= COALESCE(OLD.percentual_executado, 0) THEN RETURN NEW; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  v_is_coord_or_admin := COALESCE(v_role IN ('admin','system_admin','coordenador','coordinator'), false);
  IF NOT v_is_coord_or_admin THEN
    IF NEW.regression_reason IS NULL OR length(trim(NEW.regression_reason)) < 5 THEN
      RAISE EXCEPTION 'Regressão (redução de %%) exige justificativa de no mínimo 5 caracteres';
    END IF;
    NEW.previous_percentual := OLD.percentual_executado;
    -- não muda review_status: propagação continua imediata
  ELSE
    NEW.regression_approved_by := auth.uid();
    NEW.regression_approved_at := NOW();
    NEW.previous_percentual := OLD.percentual_executado;
  END IF;
  RETURN NEW;
END; $$;

-- 4) Auto-aprovação ao finalizar RDO continua, mas agora é apenas selo de auditoria
--    (a propagação já aconteceu no momento do lançamento)
CREATE OR REPLACE FUNCTION public.fn_auto_approve_items_on_rdo_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status_aprovacao = 'aprovado' AND COALESCE(OLD.status_aprovacao,'') <> 'aprovado' THEN
    UPDATE public.diary_items
       SET review_status = 'aprovado',
           reviewed_by = COALESCE(reviewed_by, auth.uid()),
           reviewed_at = COALESCE(reviewed_at, NOW())
     WHERE diary_entry_id = NEW.id AND deleted_at IS NULL AND review_status = 'pendente';
    -- recompute defensivo (idempotente)
    PERFORM public.recompute_house_progress_from_diary(NEW.project_id, NULL);
  END IF;
  RETURN NEW;
END; $$;

-- 5) Backfill: recalcula mapas com a nova regra (inclui pendentes)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT de.project_id
           FROM public.diary_entries de
           JOIN public.diary_items di ON di.diary_entry_id = de.id
           WHERE di.deleted_at IS NULL AND di.review_status <> 'rejeitado'
  LOOP
    PERFORM public.recompute_house_progress_from_diary(r.project_id, NULL);
  END LOOP;
END $$;