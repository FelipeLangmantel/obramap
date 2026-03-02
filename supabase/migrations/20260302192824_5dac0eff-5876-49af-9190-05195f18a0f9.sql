
CREATE TABLE public.indirect_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'mês',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.indirect_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view indirect costs for their projects"
  ON public.indirect_costs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert indirect costs"
  ON public.indirect_costs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update indirect costs"
  ON public.indirect_costs FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete indirect costs"
  ON public.indirect_costs FOR DELETE TO authenticated
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.indirect_costs;
