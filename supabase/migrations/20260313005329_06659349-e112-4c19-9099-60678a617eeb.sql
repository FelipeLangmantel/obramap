
-- ============================
-- MODULE: PLE (Planilha de Levantamento de Eventos)
-- Independent measurement module
-- ============================

-- PLE Projects (independent from main projects)
CREATE TABLE public.ple_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  contractor text,
  contract_number text,
  program text,
  total_houses int NOT NULL DEFAULT 50,
  contract_value numeric NOT NULL DEFAULT 0,
  start_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ple_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ple_projects in their company"
  ON public.ple_projects FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid()));

-- Event Groups (macro categories like "1.0 - INSTALAÇÃO")
CREATE TABLE public.ple_event_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id uuid NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ple_event_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ple_event_groups via project"
  ON public.ple_event_groups FOR ALL TO authenticated
  USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

-- Events/Services (individual items)
CREATE TABLE public.ple_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id uuid NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.ple_event_groups(id) ON DELETE SET NULL,
  item_code text NOT NULL,
  discrimination text,
  sinapi_code text,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'UN',
  quantity numeric NOT NULL DEFAULT 0,
  unit_value numeric NOT NULL DEFAULT 0,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ple_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ple_events via project"
  ON public.ple_events FOR ALL TO authenticated
  USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

-- Measurements (periods)
CREATE TABLE public.ple_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id uuid NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  measurement_number int NOT NULL,
  period_label text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'pending',
  registered_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ple_project_id, measurement_number)
);

ALTER TABLE public.ple_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ple_measurements via project"
  ON public.ple_measurements FOR ALL TO authenticated
  USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

-- PLE Entries (the grid: event x house = measurement)
CREATE TABLE public.ple_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id uuid NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.ple_events(id) ON DELETE CASCADE,
  house_number int NOT NULL,
  measurement_id uuid NOT NULL REFERENCES public.ple_measurements(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, house_number)
);

ALTER TABLE public.ple_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ple_entries via project"
  ON public.ple_entries FOR ALL TO authenticated
  USING (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (ple_project_id IN (SELECT id FROM public.ple_projects WHERE company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())));

-- Indexes for performance
CREATE INDEX idx_ple_events_project ON public.ple_events(ple_project_id);
CREATE INDEX idx_ple_entries_event ON public.ple_entries(event_id);
CREATE INDEX idx_ple_entries_measurement ON public.ple_entries(measurement_id);
CREATE INDEX idx_ple_entries_project ON public.ple_entries(ple_project_id);
CREATE INDEX idx_ple_measurements_project ON public.ple_measurements(ple_project_id);
CREATE INDEX idx_ple_event_groups_project ON public.ple_event_groups(ple_project_id);
