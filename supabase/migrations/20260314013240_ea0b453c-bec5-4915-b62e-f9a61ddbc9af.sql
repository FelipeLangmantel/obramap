
-- Table to store glosses (fiscal rejections) on PLE entries
CREATE TABLE public.ple_glosses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id UUID NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES public.ple_measurements(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.ple_events(id) ON DELETE CASCADE,
  house_number INTEGER NOT NULL,
  glossed_by UUID REFERENCES auth.users(id),
  glossed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_measurement_id UUID REFERENCES public.ple_measurements(id),
  UNIQUE (measurement_id, event_id, house_number)
);

-- Enable RLS
ALTER TABLE public.ple_glosses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view glosses" ON public.ple_glosses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert glosses" ON public.ple_glosses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update glosses" ON public.ple_glosses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can delete glosses" ON public.ple_glosses FOR DELETE TO authenticated USING (true);

-- Add status field to measurements for gloss workflow: draft, pending_review, approved_with_glosses, approved
-- Already has status column, we just use new values
