CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _uname text;
BEGIN
  _uid := auth.uid();
  IF _uid IS NOT NULL THEN
    SELECT display_name INTO _uname FROM public.profiles WHERE user_id = _uid LIMIT 1;
  END IF;

  INSERT INTO public.audit_log(tabela, registro_id, acao, dados_anteriores, dados_novos, user_id, user_name)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
    _uid,
    _uname
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;