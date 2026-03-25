-- ══════════════════════════════════════════════════════════════
-- Fix: sincronizar aditivo_prazo_dias e adicionar aditivo_valor_total
-- em obras_portfolio sempre que aditivos_contratos mudar
-- ══════════════════════════════════════════════════════════════

-- 1. Adicionar campo aditivo_valor_total (líquido: acréscimos - supressões)
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS aditivo_valor_total NUMERIC NOT NULL DEFAULT 0;

-- 2. Recalcular aditivo_prazo_dias e aditivo_valor_total
--    para TODAS as obras existentes a partir dos aditivos aprovados
UPDATE public.obras_portfolio op
SET
  aditivo_prazo_dias = COALESCE((
    SELECT SUM(a.aditivo_prazo_dias)
    FROM public.aditivos_contratos a
    WHERE a.obra_id = op.id
      AND a.status = 'aprovado'
  ), 0),
  aditivo_valor_total = COALESCE((
    SELECT SUM(a.aditivo_valor - a.supressao_valor)
    FROM public.aditivos_contratos a
    WHERE a.obra_id = op.id
      AND a.status = 'aprovado'
  ), 0);

-- 3. Função que recalcula os totais de uma obra específica
CREATE OR REPLACE FUNCTION public.recalc_obra_aditivos(p_obra_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.obras_portfolio
  SET
    aditivo_prazo_dias = COALESCE((
      SELECT SUM(a.aditivo_prazo_dias)
      FROM public.aditivos_contratos a
      WHERE a.obra_id = p_obra_id
        AND a.status = 'aprovado'
    ), 0),
    aditivo_valor_total = COALESCE((
      SELECT SUM(a.aditivo_valor - a.supressao_valor)
      FROM public.aditivos_contratos a
      WHERE a.obra_id = p_obra_id
        AND a.status = 'aprovado'
    ), 0)
  WHERE id = p_obra_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_obra_aditivos(UUID) TO authenticated;

-- 4. Trigger automático: toda vez que aditivos_contratos mudar,
--    recalcular os totais na obra correspondente
CREATE OR REPLACE FUNCTION public.trigger_sync_obra_aditivos()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obra_id UUID;
BEGIN
  -- Determinar qual obra foi afetada
  IF TG_OP = 'DELETE' THEN
    v_obra_id := OLD.obra_id;
  ELSE
    v_obra_id := NEW.obra_id;
  END IF;

  -- Recalcular totais da obra
  PERFORM public.recalc_obra_aditivos(v_obra_id);

  RETURN NULL; -- AFTER trigger, retorno não importa
END;
$$;

DROP TRIGGER IF EXISTS sync_obra_aditivos_trigger ON public.aditivos_contratos;
CREATE TRIGGER sync_obra_aditivos_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON public.aditivos_contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_obra_aditivos();

