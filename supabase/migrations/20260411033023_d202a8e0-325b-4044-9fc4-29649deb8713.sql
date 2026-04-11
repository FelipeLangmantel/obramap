
CREATE TABLE public.holding_obra_docs_deleted (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.obras_portfolio(id) ON DELETE CASCADE,
  doc_tipo_id UUID NOT NULL,
  deleted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(obra_id, doc_tipo_id)
);

ALTER TABLE public.holding_obra_docs_deleted ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can manage deleted docs"
ON public.holding_obra_docs_deleted
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
