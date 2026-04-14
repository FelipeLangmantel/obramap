
CREATE TABLE public.medicao_previsao_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_id uuid NOT NULL REFERENCES public.medicoes_ple(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  data_previsao_anterior text,
  valor_previsto_anterior numeric DEFAULT 0,
  data_previsao_nova text,
  valor_previsto_novo numeric DEFAULT 0,
  motivo text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_by_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.medicao_previsao_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view historico of their company obras"
  ON public.medicao_previsao_historico FOR SELECT TO authenticated
  USING (
    obra_id IN (
      SELECT op.id FROM public.obras_portfolio op
      WHERE op.company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "Users can insert historico for their company obras"
  ON public.medicao_previsao_historico FOR INSERT TO authenticated
  WITH CHECK (
    obra_id IN (
      SELECT op.id FROM public.obras_portfolio op
      WHERE op.company_id = public.get_my_company_id()
    )
  );
