-- Remove orphan auth user created via old RPC (missing auth.identities row).
-- Without identities, both Supabase Admin deleteUser and login fail.
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'ishoesrg@gmail.com';
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_permissions WHERE user_id = v_uid;
    DELETE FROM public.user_roles WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE user_id = v_uid;
    DELETE FROM auth.identities WHERE user_id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
  END IF;
END $$;