
-- Trigger despesa prevista → real (idempotent)
CREATE OR REPLACE FUNCTION public.fn_converter_despesa_real()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status_medicao = 'aprovada' AND OLD.status_medicao != 'aprovada' THEN
    UPDATE despesas_mensais SET tipo_despesa = 'real'
    WHERE medicao_id = NEW.id AND tipo_despesa = 'prevista';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_despesa_real ON public.medicoes_ple;
CREATE TRIGGER trg_despesa_real
  AFTER UPDATE OF status_medicao ON public.medicoes_ple
  FOR EACH ROW EXECUTE FUNCTION public.fn_converter_despesa_real();

-- RLS despesas (drop + recreate to be safe)
DROP POLICY IF EXISTS "despesas_mensais_company" ON public.despesas_mensais;
DROP POLICY IF EXISTS "despesas_mensais_select" ON public.despesas_mensais;

CREATE POLICY "despesas_mensais_select" ON public.despesas_mensais
  FOR SELECT TO authenticated
  USING (obra_id IN (
    SELECT id FROM public.obras_portfolio WHERE company_id = public.get_my_company_id()
  ));
