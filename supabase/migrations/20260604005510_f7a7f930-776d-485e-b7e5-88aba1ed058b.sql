
-- Helper: usuário tem permissão específica para assinar documentos/RDO
CREATE OR REPLACE FUNCTION public.can_sign_documents()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (holding_permissions->>'can_sign_documents')::boolean
       FROM public.user_permissions
       WHERE user_id = auth.uid()
       LIMIT 1),
    false
  ) OR public.can_write();
$$;

GRANT EXECUTE ON FUNCTION public.can_sign_documents() TO authenticated;

-- Recria policies de escrita em diary_signatures usando can_sign_documents()
DROP POLICY IF EXISTS "Writers insert diary_signatures" ON public.diary_signatures;
DROP POLICY IF EXISTS "Writers update diary_signatures" ON public.diary_signatures;
DROP POLICY IF EXISTS "Writers delete diary_signatures" ON public.diary_signatures;

CREATE POLICY "Signers insert diary_signatures"
ON public.diary_signatures
FOR INSERT
TO authenticated
WITH CHECK (public.can_sign_documents() AND company_id = public.get_my_company_id());

CREATE POLICY "Signers update diary_signatures"
ON public.diary_signatures
FOR UPDATE
TO authenticated
USING (public.can_sign_documents() AND company_id = public.get_my_company_id())
WITH CHECK (public.can_sign_documents() AND company_id = public.get_my_company_id());

CREATE POLICY "Signers delete diary_signatures"
ON public.diary_signatures
FOR DELETE
TO authenticated
USING (public.can_sign_documents() AND company_id = public.get_my_company_id());
