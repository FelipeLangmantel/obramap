-- 1) Corrigir RPC recompute_house_progress_from_diary para ignorar itens soft-deletados
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
  v_macro jsonb;
  v_scope jsonb;
  v_new_scopes jsonb;
  v_new_macros_arr jsonb;
  v_sum numeric;
  v_count integer;
BEGIN
  FOR v_house IN
    SELECT h.house_number, h.macros
    FROM public.houses h
    WHERE h.project_id = p_project_id
      AND (p_house_numbers IS NULL OR h.house_number = ANY(p_house_numbers))
  LOOP
    v_new_macros_arr := '[]'::jsonb;
    v_count := 0;
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
          AND di.deleted_at IS NULL;
        v_sum := LEAST(100, GREATEST(0, v_sum));
        IF (v_scope->>'progress')::numeric IS DISTINCT FROM v_sum THEN
          v_count := v_count + 1;
        END IF;
        v_new_scopes := v_new_scopes ||
          jsonb_build_object(
            'id', v_scope->>'id',
            'name', v_scope->>'name',
            'progress', v_sum,
            'startDate', v_scope->'startDate',
            'endDate', v_scope->'endDate'
          ) || (v_scope - 'progress' - 'id' - 'name' - 'startDate' - 'endDate');
      END LOOP;
      v_new_macros_arr := v_new_macros_arr || (v_macro - 'scopes' || jsonb_build_object('scopes', v_new_scopes));
    END LOOP;
    IF v_count > 0 THEN
      UPDATE public.houses
         SET macros = v_new_macros_arr, last_update = CURRENT_DATE
       WHERE project_id = p_project_id
         AND house_number = v_house.house_number;
    END IF;
    house_number := v_house.house_number;
    macros_updated := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 2) Adicionar soft delete nas 6 tabelas RDO
ALTER TABLE public.diary_labor
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.diary_equipment
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.diary_activities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.diary_occurrences
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.diary_checklist
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE public.diary_comments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- 3) Índices parciais para performance
CREATE INDEX IF NOT EXISTS idx_diary_labor_active
  ON public.diary_labor(diary_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_equipment_active
  ON public.diary_equipment(diary_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_activities_active
  ON public.diary_activities(diary_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_occurrences_active
  ON public.diary_occurrences(diary_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_checklist_active
  ON public.diary_checklist(diary_entry_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_diary_comments_active
  ON public.diary_comments(diary_entry_id) WHERE deleted_at IS NULL;