-- ============================================================
-- FASE 15.2 — ITENS DA REQUISIÇÃO DE COMPRA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  period_supply_requirement_id uuid NOT NULL REFERENCES public.period_supply_requirements(id) ON DELETE CASCADE,
  input_id uuid NOT NULL REFERENCES public.inputs(id),
  input_name text,
  unit text,
  quantity_requested numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pri_request ON public.purchase_request_items(purchase_request_id);
CREATE INDEX IF NOT EXISTS idx_pri_requirement ON public.purchase_request_items(period_supply_requirement_id);
CREATE INDEX IF NOT EXISTS idx_pri_input ON public.purchase_request_items(input_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_pri_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pri_updated_at ON public.purchase_request_items;

CREATE TRIGGER trg_pri_updated_at
BEFORE UPDATE ON public.purchase_request_items
FOR EACH ROW
EXECUTE FUNCTION public.set_pri_updated_at();

-- RLS
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view purchase request items of company"
ON public.purchase_request_items FOR SELECT
USING (
  purchase_request_id IN (
    SELECT pr.id
    FROM purchase_requests pr
    JOIN profiles p ON p.company_id = pr.company_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users manage purchase request items of company"
ON public.purchase_request_items FOR ALL
USING (
  purchase_request_id IN (
    SELECT pr.id
    FROM purchase_requests pr
    JOIN profiles p ON p.company_id = pr.company_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  purchase_request_id IN (
    SELECT pr.id
    FROM purchase_requests pr
    JOIN profiles p ON p.company_id = pr.company_id
    WHERE p.user_id = auth.uid()
  )
);