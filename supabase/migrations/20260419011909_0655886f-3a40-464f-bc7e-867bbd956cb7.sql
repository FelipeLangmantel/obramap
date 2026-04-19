-- 1. UNIQUE constraint on medicoes_ple (no duplicates exist)
ALTER TABLE public.medicoes_ple
  ADD CONSTRAINT unique_medicao_por_obra
  UNIQUE (obra_id, num_medicao)
  DEFERRABLE INITIALLY DEFERRED;

-- 2. Deprecate percentual_fisico in favor of percentual_andamento
COMMENT ON COLUMN public.obras_portfolio.percentual_fisico IS
'DEPRECATED — usar percentual_andamento (regra de domínio MCMV: físico = andamento)';

-- 3. Add modo_integracao column
ALTER TABLE public.obras_portfolio
  ADD COLUMN IF NOT EXISTS modo_integracao TEXT
  NOT NULL DEFAULT 'standalone'
  CHECK (modo_integracao IN ('standalone', 'linkado'));

-- Migrate existing linked obras
UPDATE public.obras_portfolio
  SET modo_integracao = 'linkado'
  WHERE obramap_project_id IS NOT NULL;

-- Validation trigger for modo_integracao integrity
CREATE OR REPLACE FUNCTION public.validate_modo_integracao()
RETURNS TRIGGER LANGUAGE plpgsql 
SET search_path = public
AS $$
BEGIN
  IF NEW.modo_integracao = 'linkado' AND NEW.obramap_project_id IS NULL THEN
    RAISE EXCEPTION 'Obra em modo linkado requer obramap_project_id';
  END IF;
  IF NEW.modo_integracao = 'standalone' AND NEW.obramap_project_id IS NOT NULL THEN
    NEW.obramap_project_id := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_modo_integracao_trigger ON public.obras_portfolio;
CREATE TRIGGER validate_modo_integracao_trigger
  BEFORE INSERT OR UPDATE ON public.obras_portfolio
  FOR EACH ROW EXECUTE FUNCTION public.validate_modo_integracao();