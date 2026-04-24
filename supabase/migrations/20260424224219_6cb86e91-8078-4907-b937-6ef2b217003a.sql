
-- 1) Governança em diary_items
ALTER TABLE public.diary_items
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS previous_percentual NUMERIC,
  ADD COLUMN IF NOT EXISTS regression_reason TEXT,
  ADD COLUMN IF NOT EXISTS regression_approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS regression_approved_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diary_items_review_status_chk') THEN
    ALTER TABLE public.diary_items
      ADD CONSTRAINT diary_items_review_status_chk
      CHECK (review_status IN ('pendente','aprovado','rejeitado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_diary_items_review_status
  ON public.diary_items(review_status) WHERE deleted_at IS NULL;

-- Backfill: itens existentes considerados aprovados
UPDATE public.diary_items
   SET review_status = 'aprovado'
 WHERE review_status = 'pendente'
   AND created_at < NOW() - INTERVAL '1 minute';

-- 2) Tabela de pedidos de exclusão
CREATE TABLE IF NOT EXISTS public.diary_item_delete_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_item_id UUID NOT NULL REFERENCES public.diary_items(id) ON DELETE CASCADE,
  diary_entry_id UUID NOT NULL REFERENCES public.diary_entries(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  CONSTRAINT diary_item_delete_requests_status_chk CHECK (status IN ('pendente','aprovado','rejeitado'))
);

ALTER TABLE public.diary_item_delete_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delete_req_all_company" ON public.diary_item_delete_requests;
CREATE POLICY "delete_req_all_company" ON public.diary_item_delete_requests
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_delete_req_pending
  ON public.diary_item_delete_requests(project_id, status) WHERE status = 'pendente';

-- 3) RPC: aprovar/rejeitar lançamento individual
CREATE OR REPLACE FUNCTION public.approve_diary_item_review(
  p_item_id UUID, p_decision TEXT, p_note TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD; v_pid UUID;
BEGIN
  IF p_decision NOT IN ('aprovado','rejeitado') THEN
    RAISE EXCEPTION 'Decisão inválida: %', p_decision;
  END IF;
  SELECT di.*, de.project_id AS pid INTO v_item
    FROM public.diary_items di
    JOIN public.diary_entries de ON de.id = di.diary_entry_id
   WHERE di.id = p_item_id AND di.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  v_pid := v_item.pid;
  UPDATE public.diary_items
     SET review_status = p_decision, reviewed_by = auth.uid(), reviewed_at = NOW(), review_note = p_note
   WHERE id = p_item_id;
  PERFORM public.recompute_house_progress_from_diary(v_pid, v_item.house_ids);
  RETURN jsonb_build_object('ok', true, 'decision', p_decision);
END; $$;
REVOKE ALL ON FUNCTION public.approve_diary_item_review(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_diary_item_review(UUID, TEXT, TEXT) TO authenticated;

-- 4) Solicitar exclusão
CREATE OR REPLACE FUNCTION public.request_diary_item_deletion(
  p_item_id UUID, p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD; v_req_id UUID; v_company UUID;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo da exclusão é obrigatório (mín 5 caracteres)';
  END IF;
  SELECT di.id, di.diary_entry_id, de.project_id AS pid, p.company_id INTO v_item
    FROM public.diary_items di
    JOIN public.diary_entries de ON de.id = di.diary_entry_id
    JOIN public.projects p ON p.id = de.project_id
   WHERE di.id = p_item_id AND di.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM public.diary_item_delete_requests
              WHERE diary_item_id = p_item_id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Já existe pedido de exclusão pendente';
  END IF;
  INSERT INTO public.diary_item_delete_requests
    (diary_item_id, diary_entry_id, project_id, company_id, requested_by, reason)
  VALUES (p_item_id, v_item.diary_entry_id, v_item.pid, v_item.company_id, auth.uid(), p_reason)
  RETURNING id INTO v_req_id;
  RETURN v_req_id;
END; $$;
REVOKE ALL ON FUNCTION public.request_diary_item_deletion(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_diary_item_deletion(UUID, TEXT) TO authenticated;

-- 5) Aprovar exclusão
CREATE OR REPLACE FUNCTION public.approve_diary_item_deletion(
  p_request_id UUID, p_note TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_house_ids INT[];
BEGIN
  SELECT * INTO v_req FROM public.diary_item_delete_requests
   WHERE id = p_request_id AND status = 'pendente';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou já decidido'; END IF;
  SELECT house_ids INTO v_house_ids FROM public.diary_items WHERE id = v_req.diary_item_id;
  UPDATE public.diary_items
     SET deleted_at = NOW(), deleted_by = auth.uid()
   WHERE id = v_req.diary_item_id;
  UPDATE public.diary_item_delete_requests
     SET status = 'aprovado', decided_by = auth.uid(), decided_at = NOW(), decision_note = p_note
   WHERE id = p_request_id;
  PERFORM public.recompute_house_progress_from_diary(v_req.project_id, v_house_ids);
  RETURN jsonb_build_object('ok', true, 'item_id', v_req.diary_item_id);
END; $$;
REVOKE ALL ON FUNCTION public.approve_diary_item_deletion(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_diary_item_deletion(UUID, TEXT) TO authenticated;

-- 6) Rejeitar exclusão
CREATE OR REPLACE FUNCTION public.reject_diary_item_deletion(
  p_request_id UUID, p_note TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.diary_item_delete_requests
     SET status = 'rejeitado', decided_by = auth.uid(), decided_at = NOW(), decision_note = p_note
   WHERE id = p_request_id AND status = 'pendente';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado ou já decidido'; END IF;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.reject_diary_item_deletion(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_diary_item_deletion(UUID, TEXT) TO authenticated;

-- 7) Trigger: regressão exige justificativa (engenheiro) ou auto (coord/admin)
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
    NEW.review_status := 'pendente';
    NEW.previous_percentual := OLD.percentual_executado;
  ELSE
    NEW.regression_approved_by := auth.uid();
    NEW.regression_approved_at := NOW();
    NEW.previous_percentual := OLD.percentual_executado;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_block_unauthorized_regression ON public.diary_items;
CREATE TRIGGER trg_block_unauthorized_regression
  BEFORE UPDATE ON public.diary_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_unauthorized_regression();

-- 8) Recompute considera APENAS itens aprovados
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
          AND di.review_status = 'aprovado';
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

-- 9) Auto-aprovação ao aprovar RDO
CREATE OR REPLACE FUNCTION public.fn_auto_approve_items_on_rdo_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status_aprovacao = 'aprovado' AND COALESCE(OLD.status_aprovacao,'') <> 'aprovado' THEN
    UPDATE public.diary_items
       SET review_status = 'aprovado',
           reviewed_by = COALESCE(reviewed_by, auth.uid()),
           reviewed_at = COALESCE(reviewed_at, NOW())
     WHERE diary_entry_id = NEW.id AND deleted_at IS NULL AND review_status = 'pendente';
    PERFORM public.recompute_house_progress_from_diary(NEW.project_id, NULL);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_approve_items_on_rdo_approval ON public.diary_entries;
CREATE TRIGGER trg_auto_approve_items_on_rdo_approval
  AFTER UPDATE OF status_aprovacao ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_approve_items_on_rdo_approval();
