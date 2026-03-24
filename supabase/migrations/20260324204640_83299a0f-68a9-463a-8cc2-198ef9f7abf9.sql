ALTER TABLE public.ind_operation_contexts
  ADD COLUMN IF NOT EXISTS obras_portfolio_id UUID
    REFERENCES public.obras_portfolio(id) ON DELETE SET NULL;