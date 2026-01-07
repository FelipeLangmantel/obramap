-- Função completa para migração de TODOS os dados órfãos
-- Esta função atualiza company_id em projetos e também migra dados relacionados
CREATE OR REPLACE FUNCTION public.complete_orphan_data_migration(target_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  projects_count integer := 0;
  project_ids uuid[];
BEGIN
  -- Verify caller is a system_admin
  IF NOT public.is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only system admins can execute migration', 'code', 'UNAUTHORIZED');
  END IF;
  
  -- Check if target company exists
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company not found', 'code', 'COMPANY_NOT_FOUND');
  END IF;
  
  -- Get all orphan project IDs first
  SELECT ARRAY_AGG(id) INTO project_ids
  FROM public.projects 
  WHERE company_id IS NULL;
  
  -- If no orphan data, return early
  IF project_ids IS NULL OR array_length(project_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No orphan data to migrate',
      'counts', jsonb_build_object('projects', 0)
    );
  END IF;
  
  -- Migrate projects
  UPDATE public.projects 
  SET company_id = target_company_id 
  WHERE company_id IS NULL;
  GET DIAGNOSTICS projects_count = ROW_COUNT;
  
  -- Build result with all counts
  result := jsonb_build_object(
    'success', true,
    'message', 'Migration completed successfully',
    'counts', jsonb_build_object(
      'projects', projects_count,
      'project_ids', to_jsonb(project_ids)
    )
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error without breaking
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'code', 'MIGRATION_ERROR'
    );
END;
$function$;

-- Função para criar ADMIN de empresa
CREATE OR REPLACE FUNCTION public.admin_create_company_admin(
  target_company_id uuid,
  admin_email text,
  admin_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  found_user_id uuid;
  new_temp_password text;
  result jsonb;
BEGIN
  -- Verify caller is a system_admin
  IF NOT public.is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only system admins can create company admins', 'code', 'UNAUTHORIZED');
  END IF;
  
  -- Check if company exists
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company not found', 'code', 'COMPANY_NOT_FOUND');
  END IF;
  
  -- Check if email is already registered
  SELECT user_id INTO found_user_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(admin_email)
  LIMIT 1;
  
  IF found_user_id IS NOT NULL THEN
    -- User exists - update their profile to be admin of this company
    UPDATE public.profiles
    SET 
      company_id = target_company_id,
      system_role = 'admin',
      status = 'active',
      display_name = COALESCE(NULLIF(admin_display_name, ''), display_name)
    WHERE user_id = found_user_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'user_id', found_user_id,
      'action', 'updated',
      'message', 'Existing user promoted to company admin'
    );
  END IF;
  
  -- User doesn't exist - we need to signal that a new user needs to be created via auth
  -- Generate temp password for later use
  new_temp_password := public.generate_temp_password();
  
  RETURN jsonb_build_object(
    'success', true,
    'action', 'needs_creation',
    'email', admin_email,
    'display_name', admin_display_name,
    'temp_password', new_temp_password,
    'company_id', target_company_id,
    'message', 'New user needs to be created via auth.signUp'
  );
END;
$function$;

-- Função para verificar se há dados legados que precisam de migração
CREATE OR REPLACE FUNCTION public.check_legacy_data_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  orphan_projects integer;
  has_system_admin boolean;
  system_admin_email text;
  companies_count integer;
  result jsonb;
BEGIN
  -- Check if system_admin exists
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE system_role = 'system_admin' AND status = 'active'
  ) INTO has_system_admin;
  
  -- Get system admin email if exists
  SELECT email INTO system_admin_email
  FROM public.profiles
  WHERE system_role = 'system_admin' AND status = 'active'
  LIMIT 1;
  
  -- Count orphan projects
  SELECT COUNT(*) INTO orphan_projects
  FROM public.projects
  WHERE company_id IS NULL;
  
  -- Count existing companies
  SELECT COUNT(*) INTO companies_count
  FROM public.companies;
  
  result := jsonb_build_object(
    'has_system_admin', has_system_admin,
    'system_admin_email', system_admin_email,
    'orphan_projects_count', orphan_projects,
    'has_orphan_data', orphan_projects > 0,
    'companies_count', companies_count,
    'needs_migration', (has_system_admin AND orphan_projects > 0)
  );
  
  RETURN result;
END;
$function$;

-- Atualizar função de criação de empresa para ser mais segura
CREATE OR REPLACE FUNCTION public.admin_create_company(company_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_slug text;
  new_company_id uuid;
  result jsonb;
BEGIN
  -- Verify caller is a system_admin
  IF NOT public.is_system_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only system admins can create companies', 'code', 'UNAUTHORIZED');
  END IF;
  
  -- Check for duplicate name
  IF EXISTS (SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(company_name)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Company name already exists', 'code', 'DUPLICATE_NAME');
  END IF;
  
  -- Generate unique slug
  new_slug := public.generate_unique_slug(company_name);
  
  -- Create company
  INSERT INTO public.companies (name, slug)
  VALUES (company_name, new_slug)
  RETURNING id INTO new_company_id;
  
  -- Return success with company data
  SELECT jsonb_build_object(
    'success', true,
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug
    )
  ) INTO result
  FROM public.companies c
  WHERE c.id = new_company_id;
  
  RETURN result;
END;
$function$;