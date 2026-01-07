-- Function to check if any SYSTEM_ADMIN exists
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE system_role = 'system_admin'
      AND status = 'active'
  )
$$;

-- Function to count orphan data (data without company_id)
CREATE OR REPLACE FUNCTION public.count_orphan_projects()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM public.projects
  WHERE company_id IS NULL
$$;

-- Add company_id to tables that need it (if not exists)
DO $$ 
BEGIN
  -- houses already has project_id, which links to company through projects
  -- quadras already has project_id
  -- Other tables that need company_id directly or through project_id are already linked
  
  -- Ensure projects.company_id exists (should already from previous migration)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'company_id') THEN
    ALTER TABLE public.projects ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for performance if not exists
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON public.projects(company_id);

-- Function to migrate all orphan projects to a company
CREATE OR REPLACE FUNCTION public.migrate_orphan_data_to_company(target_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  projects_count integer := 0;
BEGIN
  -- Migrate projects
  UPDATE public.projects 
  SET company_id = target_company_id 
  WHERE company_id IS NULL;
  
  GET DIAGNOSTICS projects_count = ROW_COUNT;
  result := result || jsonb_build_object('projects', projects_count);
  
  RETURN result;
END;
$$;

-- Function to get orphan data counts for diagnostic
CREATE OR REPLACE FUNCTION public.get_orphan_data_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  orphan_projects integer;
  total_houses integer;
  total_quadras integer;
  total_stages integer;
  total_weekly_productions integer;
  total_planned_productions integer;
  total_scope_costs integer;
  total_suppliers integer;
  total_financial_entries integer;
  total_delivery_inspections integer;
BEGIN
  -- Count orphan projects
  SELECT COUNT(*)::integer INTO orphan_projects FROM public.projects WHERE company_id IS NULL;
  
  -- Count data in orphan projects
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_houses 
  FROM public.houses h 
  JOIN public.projects p ON h.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_quadras 
  FROM public.quadras q 
  JOIN public.projects p ON q.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_stages 
  FROM public.planning_stages ps 
  JOIN public.projects p ON ps.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_weekly_productions 
  FROM public.weekly_productions wp 
  JOIN public.projects p ON wp.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_planned_productions 
  FROM public.planned_productions pp 
  JOIN public.projects p ON pp.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_scope_costs 
  FROM public.scope_costs sc 
  JOIN public.projects p ON sc.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_suppliers 
  FROM public.suppliers s 
  JOIN public.projects p ON s.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_financial_entries 
  FROM public.financial_entries fe 
  JOIN public.projects p ON fe.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  SELECT COALESCE(COUNT(*)::integer, 0) INTO total_delivery_inspections 
  FROM public.delivery_inspections di 
  JOIN public.projects p ON di.project_id = p.id 
  WHERE p.company_id IS NULL;
  
  result := jsonb_build_object(
    'projects', orphan_projects,
    'houses', total_houses,
    'quadras', total_quadras,
    'planning_stages', total_stages,
    'weekly_productions', total_weekly_productions,
    'planned_productions', total_planned_productions,
    'scope_costs', total_scope_costs,
    'suppliers', total_suppliers,
    'financial_entries', total_financial_entries,
    'delivery_inspections', total_delivery_inspections,
    'has_orphan_data', orphan_projects > 0
  );
  
  RETURN result;
END;
$$;

-- Function to create system admin (callable from frontend)
CREATE OR REPLACE FUNCTION public.create_system_admin(
  admin_user_id uuid,
  admin_email text,
  admin_display_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if admin already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE system_role = 'system_admin') THEN
    RAISE EXCEPTION 'System admin already exists';
  END IF;
  
  -- Update or insert the profile with system_admin role
  INSERT INTO public.profiles (user_id, email, display_name, system_role, status, must_change_password)
  VALUES (admin_user_id, admin_email, admin_display_name, 'system_admin', 'active', false)
  ON CONFLICT (user_id) DO UPDATE SET
    system_role = 'system_admin',
    status = 'active',
    must_change_password = false,
    display_name = EXCLUDED.display_name;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_orphan_projects() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orphan_data_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_orphan_data_to_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_system_admin(uuid, text, text) TO authenticated;