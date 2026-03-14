-- Add audit columns to ple_entries for tracking who/when
ALTER TABLE public.ple_entries 
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_by_name text;

-- Add audit columns to ple_measurements
ALTER TABLE public.ple_measurements
  ADD COLUMN IF NOT EXISTS registered_by_name text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_by_name text;

-- Create audit log table for all PLE actions
CREATE TABLE IF NOT EXISTS public.ple_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ple_project_id uuid NOT NULL REFERENCES public.ple_projects(id) ON DELETE CASCADE,
  measurement_id uuid REFERENCES public.ple_measurements(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'entry_created', 'entry_deleted', 'measurement_created', 'measurement_approved', 'gloss_added', 'gloss_removed', etc.
  details jsonb DEFAULT '{}',
  performed_by uuid REFERENCES auth.users(id),
  performed_by_name text,
  performed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.ple_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their company projects"
  ON public.ple_audit_log FOR SELECT TO authenticated
  USING (
    ple_project_id IN (
      SELECT id FROM public.ple_projects 
      WHERE company_id = public.get_my_company_id()
    )
  );

CREATE POLICY "Users can insert audit logs for their company projects"
  ON public.ple_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    ple_project_id IN (
      SELECT id FROM public.ple_projects 
      WHERE company_id = public.get_my_company_id()
    )
  );