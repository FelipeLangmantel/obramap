-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_diary_items_house_ids_gin
  ON public.diary_items USING GIN (house_ids)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_diary_photos_item
  ON public.diary_photos (diary_item_id)
  WHERE diary_item_id IS NOT NULL;

-- RPC: histórico fotográfico de uma casa (todas as fotos linkadas a serviços que envolvem esta casa)
CREATE OR REPLACE FUNCTION public.get_house_photo_history(
  p_house_id integer,
  p_project_id uuid
)
RETURNS TABLE (
  photo_id uuid,
  storage_path text,
  legenda text,
  photo_created_at timestamptz,
  diary_item_id uuid,
  macro_id text,
  macro_name text,
  macro_color text,
  scope_id text,
  scope_name text,
  percentual_executado numeric,
  observacao text,
  diary_entry_id uuid,
  entry_date date,
  engineer_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dp.id           AS photo_id,
    dp.storage_path,
    dp.legenda,
    dp.created_at   AS photo_created_at,
    di.id           AS diary_item_id,
    di.macro_id,
    di.macro_name,
    di.macro_color,
    di.scope_id,
    di.scope_name,
    di.percentual_executado,
    di.observacao,
    de.id           AS diary_entry_id,
    de.entry_date,
    de.engineer_name
  FROM public.diary_photos dp
  JOIN public.diary_items di     ON di.id = dp.diary_item_id
  JOIN public.diary_entries de   ON de.id = di.diary_entry_id
  WHERE di.deleted_at IS NULL
    AND de.project_id = p_project_id
    AND de.company_id = public.get_my_company_id()
    AND p_house_id = ANY (di.house_ids)
  ORDER BY de.entry_date DESC, di.macro_name, di.scope_name, dp.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_house_photo_history(integer, uuid) TO authenticated;