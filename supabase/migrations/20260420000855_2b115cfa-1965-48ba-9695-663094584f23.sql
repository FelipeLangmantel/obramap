-- ============================================================
-- 1. Colunas de soft delete
-- ============================================================
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

ALTER TABLE public.weekly_productions
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

ALTER TABLE public.diary_items
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by  UUID REFERENCES auth.users(id);

-- ============================================================
-- 2. Índices parciais para registros ativos
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_productions_active
  ON public.productions(project_id, scope_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_active
  ON public.weekly_productions(project_id, scope_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_diary_items_active
  ON public.diary_items(diary_entry_id)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 3. RLS SELECT por company (Realtime + queries normais)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'productions' AND cmd = 'SELECT'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "productions_select_company" ON public.productions
        FOR SELECT TO authenticated
        USING (project_id IN (
          SELECT id FROM public.projects WHERE company_id = public.get_my_company_id()
        ))
    $POL$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diary_items' AND cmd = 'SELECT'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "diary_items_select_company" ON public.diary_items
        FOR SELECT TO authenticated
        USING (diary_entry_id IN (
          SELECT de.id FROM public.diary_entries de
          JOIN public.projects p ON p.id = de.project_id
          WHERE p.company_id = public.get_my_company_id()
        ))
    $POL$;
  END IF;
END $$;

-- ============================================================
-- 4. RPC: delete_production_safe (soft delete + revert atômico)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_production_safe(
  p_weekly_production_id UUID,
  p_justificativa        TEXT,
  p_deleted_by           UUID,
  p_deleted_by_nome      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wp           weekly_productions%ROWTYPE;
  v_company_id   UUID;
  v_house_num    INTEGER;
  v_macros       JSONB;
  v_new_macros   JSONB;
  v_outros       INTEGER;
  v_desvios      INTEGER := 0;
  v_diary_items  INTEGER := 0;
  v_productions  INTEGER := 0;
BEGIN
  -- Validar justificativa
  IF length(trim(coalesce(p_justificativa, ''))) < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'justificativa_muito_curta');
  END IF;

  -- Buscar registro com lock
  SELECT * INTO v_wp
  FROM public.weekly_productions
  WHERE id = p_weekly_production_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'registro_nao_encontrado');
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.projects WHERE id = v_wp.project_id;

  -- 1. Revert do progresso das casas (apenas se nenhum outro registro ativo cobrir a mesma casa+scope)
  IF v_wp.house_ids IS NOT NULL THEN
    FOREACH v_house_num IN ARRAY v_wp.house_ids LOOP

      SELECT macros INTO v_macros
      FROM public.houses
      WHERE project_id = v_wp.project_id AND house_number = v_house_num
      FOR UPDATE;

      IF v_macros IS NULL THEN CONTINUE; END IF;

      SELECT COUNT(*) INTO v_outros
      FROM (
        SELECT 1 FROM public.productions
        WHERE project_id = v_wp.project_id
          AND macro_id = v_wp.macro_id
          AND scope_id = v_wp.scope_id
          AND v_house_num = ANY(house_ids)
          AND COALESCE(is_initial_database, false) = false
          AND deleted_at IS NULL
        UNION ALL
        SELECT 1 FROM public.weekly_productions
        WHERE project_id = v_wp.project_id
          AND macro_id = v_wp.macro_id
          AND scope_id = v_wp.scope_id
          AND v_house_num = ANY(house_ids)
          AND id <> p_weekly_production_id
          AND deleted_at IS NULL
      ) AS outros;

      IF v_outros = 0 THEN
        SELECT jsonb_agg(
          CASE WHEN (macro_elem->>'id') = v_wp.macro_id
            THEN jsonb_set(
              macro_elem,
              '{scopes}',
              (
                SELECT jsonb_agg(
                  CASE WHEN (scope_elem->>'id') = v_wp.scope_id
                    THEN jsonb_set(scope_elem, '{progress}', '0'::jsonb)
                    ELSE scope_elem
                  END
                )
                FROM jsonb_array_elements(macro_elem->'scopes') AS scope_elem
              )
            )
            ELSE macro_elem
          END
        ) INTO v_new_macros
        FROM jsonb_array_elements(v_macros) AS macro_elem;

        UPDATE public.houses
        SET macros = v_new_macros, last_update = CURRENT_DATE
        WHERE project_id = v_wp.project_id AND house_number = v_house_num;
      END IF;
    END LOOP;
  END IF;

  -- 2. Deletar production_deviations vinculados (hard delete — são derivados)
  DELETE FROM public.production_deviations
  WHERE project_id = v_wp.project_id
    AND scope_id = v_wp.scope_id
    AND macro_id = v_wp.macro_id
    AND week_start = v_wp.week_start;
  GET DIAGNOSTICS v_desvios = ROW_COUNT;

  -- 3. Soft delete em diary_items vinculados
  UPDATE public.diary_items
  SET deleted_at = now(),
      deleted_by = p_deleted_by
  WHERE deleted_at IS NULL
    AND production_id IN (
      SELECT id FROM public.productions
      WHERE project_id = v_wp.project_id
        AND macro_id = v_wp.macro_id
        AND scope_id = v_wp.scope_id
        AND v_wp.house_ids && house_ids
        AND deleted_at IS NULL
    );
  GET DIAGNOSTICS v_diary_items = ROW_COUNT;

  -- 4. Soft delete em productions
  UPDATE public.productions
  SET deleted_at = now(),
      deleted_by = p_deleted_by,
      deleted_reason = p_justificativa
  WHERE project_id = v_wp.project_id
    AND macro_id = v_wp.macro_id
    AND scope_id = v_wp.scope_id
    AND v_wp.house_ids && house_ids
    AND COALESCE(is_initial_database, false) = false
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_productions = ROW_COUNT;

  -- 5. Soft delete no weekly_production principal
  UPDATE public.weekly_productions
  SET deleted_at = now(),
      deleted_by = p_deleted_by,
      deleted_reason = p_justificativa
  WHERE id = p_weekly_production_id;

  -- 6. Auditoria
  BEGIN
    INSERT INTO public.production_deletion_log (
      company_id, project_id, deleted_by, deleted_by_nome,
      justificativa, weekly_production_id,
      macro_name, scope_name, house_ids, houses_count,
      week_start, week_end,
      desvios_removidos, diary_items_removidos
    ) VALUES (
      v_company_id, v_wp.project_id, p_deleted_by, p_deleted_by_nome,
      p_justificativa, p_weekly_production_id,
      v_wp.macro_name, v_wp.scope_name, v_wp.house_ids, v_wp.houses_count,
      v_wp.week_start, v_wp.week_end,
      v_desvios, v_diary_items
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- Se a tabela de log não existir/divergir, não bloqueia a operação
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'desvios_removidos', v_desvios,
    'diary_items_soft_deleted', v_diary_items,
    'productions_soft_deleted', v_productions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_production_safe(UUID, TEXT, UUID, TEXT) TO authenticated;