-- RPC para recálculo idempotente do progresso de macros/escopos das casas
-- baseado nos diary_items reais. Usado para reconciliar o progresso após
-- sincronização offline (quando o cliente não pôde atualizar houses.macros).
--
-- Para cada casa do projeto: soma percentual_executado por (macro_id, scope_id)
-- a partir dos diary_items que referenciam aquela casa em house_ids,
-- limita a 100, e regrava macros JSON da casa preservando todos os outros campos.

CREATE OR REPLACE FUNCTION public.recompute_house_progress_from_diary(
  p_project_id uuid,
  p_house_numbers integer[] DEFAULT NULL
)
RETURNS TABLE(house_number integer, macros_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_house RECORD;
  v_new_macros jsonb;
  v_macro jsonb;
  v_scope jsonb;
  v_new_scopes jsonb;
  v_new_macros_arr jsonb;
  v_sum numeric;
  v_count integer;
BEGIN
  -- Iterar pelas casas do projeto (ou subset)
  FOR v_house IN
    SELECT h.house_number, h.macros
    FROM public.houses h
    WHERE h.project_id = p_project_id
      AND (p_house_numbers IS NULL OR h.house_number = ANY(p_house_numbers))
  LOOP
    v_new_macros_arr := '[]'::jsonb;
    v_count := 0;

    -- Iterar pelos macros da casa
    FOR v_macro IN SELECT * FROM jsonb_array_elements(COALESCE(v_house.macros, '[]'::jsonb))
    LOOP
      v_new_scopes := '[]'::jsonb;

      -- Iterar pelos escopos do macro
      FOR v_scope IN SELECT * FROM jsonb_array_elements(COALESCE(v_macro->'scopes', '[]'::jsonb))
      LOOP
        -- Soma percentual_executado dos diary_items que mencionam esta casa neste escopo
        SELECT COALESCE(SUM(di.percentual_executado), 0)
          INTO v_sum
        FROM public.diary_items di
        JOIN public.diary_entries de ON de.id = di.diary_entry_id
        WHERE de.project_id = p_project_id
          AND di.macro_id = v_macro->>'id'
          AND di.scope_id = v_scope->>'id'
          AND v_house.house_number = ANY(di.house_ids);

        v_sum := LEAST(100, GREATEST(0, v_sum));

        -- Só atualiza se o valor recalculado for diferente do atual
        IF (v_scope->>'progress')::numeric IS DISTINCT FROM v_sum THEN
          v_count := v_count + 1;
        END IF;

        v_new_scopes := v_new_scopes || jsonb_build_object(
          'id', v_scope->>'id',
          'name', v_scope->>'name',
          'progress', v_sum,
          'startDate', v_scope->'startDate',
          'endDate', v_scope->'endDate'
        ) || (v_scope - 'progress' - 'id' - 'name' - 'startDate' - 'endDate');
      END LOOP;

      v_new_macros_arr := v_new_macros_arr || (v_macro - 'scopes' || jsonb_build_object('scopes', v_new_scopes));
    END LOOP;

    -- Só atualiza a casa se algo mudou
    IF v_count > 0 THEN
      UPDATE public.houses
         SET macros = v_new_macros_arr,
             last_update = CURRENT_DATE
       WHERE project_id = p_project_id
         AND house_number = v_house.house_number;
    END IF;

    house_number := v_house.house_number;
    macros_updated := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) TO authenticated;

COMMENT ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) IS
'Recalcula houses.macros[].scopes[].progress somando percentual_executado de diary_items. Idempotente, usado após sincronização offline.';