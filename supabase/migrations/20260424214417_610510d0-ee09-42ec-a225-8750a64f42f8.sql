-- 1) Meta de produção e unidade no projeto
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS production_target NUMERIC,
  ADD COLUMN IF NOT EXISTS production_unit_label TEXT,
  ADD COLUMN IF NOT EXISTS production_unit_symbol TEXT;

COMMENT ON COLUMN public.projects.production_target IS
  'Meta total de produção do projeto na unidade configurada (ex: 12000 para 12.000 m²). Quando NULL, sistema usa total_houses como denominador.';

-- 2) Índice para acelerar buscas por vínculo
CREATE INDEX IF NOT EXISTS idx_obras_portfolio_obramap_project
  ON public.obras_portfolio(obramap_project_id)
  WHERE obramap_project_id IS NOT NULL;

-- 3) Refinar função de recálculo: usa production_target quando disponível
CREATE OR REPLACE FUNCTION public.recalc_obra_portfolio_progress(_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio_id UUID;
  v_total_houses INTEGER;
  v_target NUMERIC;
  v_completed NUMERIC;
  v_pct NUMERIC := 0;
  v_unit_label TEXT;
BEGIN
  SELECT id INTO v_portfolio_id
  FROM public.obras_portfolio
  WHERE obramap_project_id = _project_id
  LIMIT 1;

  IF v_portfolio_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(total_houses, 0),
    production_target,
    COALESCE(production_unit_label, default_unit_label, 'casa')
  INTO v_total_houses, v_target, v_unit_label
  FROM public.projects
  WHERE id = _project_id;

  -- Soma da produção real (quantity quando informado, senão houses_count/array)
  SELECT COALESCE(SUM(
    CASE
      WHEN quantity IS NOT NULL AND quantity > 0 THEN quantity
      ELSE COALESCE(houses_count, COALESCE(array_length(house_ids, 1), 0))::numeric
    END
  ), 0) INTO v_completed
  FROM public.productions
  WHERE project_id = _project_id
    AND deleted_at IS NULL;

  -- Denominador: prioriza production_target > total_houses
  IF v_target IS NOT NULL AND v_target > 0 THEN
    v_pct := LEAST(100, GREATEST(0, ROUND((v_completed / v_target) * 100, 2)));
  ELSIF v_total_houses > 0 THEN
    v_pct := LEAST(100, GREATEST(0, ROUND((v_completed / v_total_houses::numeric) * 100, 2)));
  ELSE
    v_pct := 0;
  END IF;

  UPDATE public.obras_portfolio
  SET percentual_andamento = v_pct,
      percentual_fisico = v_pct,
      updated_at = now()
  WHERE id = v_portfolio_id;
END;
$$;