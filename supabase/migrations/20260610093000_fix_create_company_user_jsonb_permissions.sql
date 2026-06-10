CREATE OR REPLACE FUNCTION public.create_company_user(
  p_email TEXT,
  p_display_name TEXT,
  p_temp_password TEXT,
  p_role TEXT,
  p_company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$
DECLARE
  v_user_id UUID;
  v_caller_company UUID;
  v_caller_role TEXT;
  v_admin_menus TEXT[];
  v_editor_menus TEXT[];
BEGIN
  SELECT company_id, system_role INTO v_caller_company, v_caller_role
  FROM profiles WHERE user_id = auth.uid();

  IF v_caller_company IS NULL OR v_caller_company != p_company_id THEN
    RAISE EXCEPTION 'Sem permissao para criar usuario nesta empresa';
  END IF;

  IF v_caller_role NOT IN ('admin', 'system_admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem criar usuarios';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Email ja cadastrado';
  END IF;

  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    instance_id, aud, role
  ) VALUES (
    gen_random_uuid(),
    p_email,
    extensions.crypt(p_temp_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('display_name', p_display_name),
    now(), now(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated'
  ) RETURNING id INTO v_user_id;

  v_admin_menus := ARRAY['painel_inicial','mapa','mapa_interativo','graficos',
    'producao','planejamento_semanal','planejamento_periodo','planejamento_estrategico',
    'contrato','ple_medicoes','custos','suprimentos','financeiro','diretoria',
    'entrega','smart_planning','productivity','empreiteiros','industrializacao',
    'holding','holding_receitas','holding_despesas','holding_documentos',
    'holding_prd','holding_insights','holding_config'];

  v_editor_menus := ARRAY['painel_inicial','mapa','mapa_interativo','graficos',
    'producao','planejamento_semanal','planejamento_periodo',
    'contrato','custos','suprimentos','empreiteiros','industrializacao'];

  UPDATE public.profiles SET
    company_id = p_company_id,
    system_role = CASE
      WHEN p_role = 'admin' THEN 'admin'::system_role
      ELSE 'user'::system_role
    END,
    must_change_password = true,
    status = 'active'
  WHERE user_id = v_user_id;

  UPDATE public.user_roles SET
    role = p_role::app_role
  WHERE user_id = v_user_id;

  INSERT INTO public.user_permissions (user_id, department, visible_menus, visible_management_sections)
  VALUES (
    v_user_id,
    'geral',
    to_jsonb(CASE
      WHEN p_role = 'admin' THEN v_admin_menus
      WHEN p_role = 'editor' THEN v_editor_menus
      ELSE ARRAY['painel_inicial','graficos','mapa']::TEXT[]
    END),
    to_jsonb(CASE
      WHEN p_role = 'admin' THEN ARRAY['projetos','quadras','macros','insumos','fornecedores','usuarios','configuracoes']::TEXT[]
      WHEN p_role = 'editor' THEN ARRAY['projetos','quadras','macros','insumos','fornecedores']::TEXT[]
      ELSE ARRAY[]::TEXT[]
    END)
  ) ON CONFLICT (user_id) DO UPDATE SET
    visible_menus = EXCLUDED.visible_menus,
    visible_management_sections = EXCLUDED.visible_management_sections;

  RETURN jsonb_build_object('user_id', v_user_id, 'email', p_email, 'role', p_role);
END; $$;

GRANT EXECUTE ON FUNCTION public.create_company_user(TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
