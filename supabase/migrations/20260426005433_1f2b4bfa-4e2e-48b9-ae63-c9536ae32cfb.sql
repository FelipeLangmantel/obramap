-- Permite que admins da empresa atualizem dados da própria empresa
CREATE POLICY "Company admins can update their company"
ON public.companies
FOR UPDATE
TO authenticated
USING (
  id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid(), id)
)
WITH CHECK (
  id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid(), id)
);