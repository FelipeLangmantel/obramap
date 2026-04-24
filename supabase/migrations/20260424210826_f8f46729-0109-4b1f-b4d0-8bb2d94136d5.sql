CREATE TABLE IF NOT EXISTS public.project_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ DEFAULT now(),
  enabled_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_project_modules_project ON public.project_modules(project_id);
CREATE INDEX IF NOT EXISTS idx_project_modules_key ON public.project_modules(module_key);

ALTER TABLE public.project_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_modules_select_company"
  ON public.project_modules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "project_modules_admin_insert"
  ON public.project_modules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.company_id = public.get_my_company_id()
    )
    AND (public.is_system_admin() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "project_modules_admin_update"
  ON public.project_modules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.company_id = public.get_my_company_id()
    )
    AND (public.is_system_admin() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "project_modules_admin_delete"
  ON public.project_modules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_modules.project_id
        AND p.company_id = public.get_my_company_id()
    )
    AND (public.is_system_admin() OR public.has_role(auth.uid(), 'admin'::app_role))
  );

CREATE TRIGGER trg_project_modules_updated_at
  BEFORE UPDATE ON public.project_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_unit_label TEXT DEFAULT 'casa',
  ADD COLUMN IF NOT EXISTS default_unit_symbol TEXT DEFAULT 'un';

ALTER TABLE public.planning_stages
  ADD COLUMN IF NOT EXISTS unit_label TEXT,
  ADD COLUMN IF NOT EXISTS unit_symbol TEXT;

ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_label TEXT,
  ADD COLUMN IF NOT EXISTS unit_symbol TEXT;

COMMENT ON COLUMN public.productions.quantity IS
  'Quantidade lancada na unidade do escopo/etapa. Quando NULL usa houses_count como fallback.';

CREATE OR REPLACE FUNCTION public.recalc_obra_portfolio_progress(_project_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio_id UUID;
  v_total_houses INTEGER;
  v_completed NUMERIC;
  v_pct NUMERIC := 0;
BEGIN
  SELECT id INTO v_portfolio_id
  FROM public.obras_portfolio
  WHERE obramap_project_id = _project_id
  LIMIT 1;

  IF v_portfolio_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(total_houses, 0) INTO v_total_houses
  FROM public.projects
  WHERE id = _project_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN quantity IS NOT NULL AND quantity > 0 THEN quantity
      ELSE COALESCE(houses_count, COALESCE(array_length(house_ids, 1), 0))::numeric
    END
  ), 0) INTO v_completed
  FROM public.productions
  WHERE project_id = _project_id
    AND deleted_at IS NULL;

  IF v_total_houses > 0 THEN
    v_pct := LEAST(100, ROUND((v_completed / v_total_houses::numeric) * 100, 2));
  END IF;

  UPDATE public.obras_portfolio
  SET percentual_andamento = v_pct,
      percentual_fisico = v_pct,
      updated_at = now()
  WHERE id = v_portfolio_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_portfolio_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);
  IF v_project_id IS NOT NULL THEN
    PERFORM public.recalc_obra_portfolio_progress(v_project_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS productions_sync_portfolio ON public.productions;
CREATE TRIGGER productions_sync_portfolio
  AFTER INSERT OR UPDATE OR DELETE ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_portfolio_progress();