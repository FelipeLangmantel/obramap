
CREATE OR REPLACE FUNCTION public.fn_validate_medicao_values()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.valor_medicao IS NOT NULL AND NEW.valor_medicao < 0 THEN
    RAISE EXCEPTION 'valor_medicao cannot be negative';
  END IF;
  IF NEW.valor_previsto_medicao IS NOT NULL AND NEW.valor_previsto_medicao < 0 THEN
    RAISE EXCEPTION 'valor_previsto_medicao cannot be negative';
  END IF;
  IF NEW.valor_acatado IS NOT NULL AND NEW.valor_medicao IS NOT NULL
     AND NEW.valor_acatado > (NEW.valor_medicao * 1.001) THEN
    RAISE EXCEPTION 'valor_acatado cannot exceed valor_medicao';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_validate_despesa_valor()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.valor < 0 THEN
    RAISE EXCEPTION 'despesa valor cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_validate_aditivo_valores()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.aditivo_valor < 0 THEN
    RAISE EXCEPTION 'aditivo_valor cannot be negative';
  END IF;
  IF NEW.supressao_valor < 0 THEN
    RAISE EXCEPTION 'supressao_valor cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fn_validate_restricao()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tipo NOT IN ('material', 'mao_de_obra', 'administrativa') THEN
    RAISE EXCEPTION 'tipo must be material, mao_de_obra, or administrativa';
  END IF;
  IF NEW.valor < 0 THEN
    RAISE EXCEPTION 'valor cannot be negative';
  END IF;
  IF NEW.impacto_medicao < 0 THEN
    RAISE EXCEPTION 'impacto_medicao cannot be negative';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
