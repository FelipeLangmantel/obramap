-- Hotfix de contencao:
-- A funcao antiga recalculava public.houses.macros usando apenas diary_items.
-- Isso podia apagar visualmente progresso legitimo vindo de Banco Inicial,
-- weekly_productions ou productions. Ate existir uma consolidacao segura
-- por todas as fontes, esta RPC preserva a assinatura e nao altera dados.

CREATE OR REPLACE FUNCTION public.recompute_house_progress_from_diary(
  p_project_id uuid,
  p_house_numbers integer[] DEFAULT NULL
)
RETURNS TABLE(house_number integer, macros_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT h.house_number, 0::integer AS macros_updated
  FROM public.houses h
  WHERE h.project_id = p_project_id
    AND (p_house_numbers IS NULL OR h.house_number = ANY(p_house_numbers))
  ORDER BY h.house_number;
END;
$$;

COMMENT ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) IS
  'HOTFIX: no-op de contencao. Nao recalcula houses.macros por diary_items para evitar regressao de progresso legitimo.';

REVOKE ALL ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recompute_house_progress_from_diary(uuid, integer[]) TO authenticated;

ALTER FUNCTION public.recompute_house_progress_from_diary(uuid, integer[])
  SET statement_timeout = '15s';
