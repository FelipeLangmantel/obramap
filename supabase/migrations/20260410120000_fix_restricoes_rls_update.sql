-- FIX: restricoes_update policy missing WITH CHECK (can_write())
-- Without this, any authenticated viewer in the company can UPDATE restrictions
-- including resolving/refusing them from the Painel Financeiro sheet.
-- The USING clause only controls which rows are visible for update;
-- WITH CHECK controls whether the new values are allowed to be written.

DROP POLICY IF EXISTS "restricoes_update" ON public.restricoes_financeiras;

CREATE POLICY "restricoes_update" ON public.restricoes_financeiras
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      resolvida = false
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND system_role IN ('admin', 'system_admin')
      )
    )
  )
  WITH CHECK (
    public.can_write()
    AND company_id = public.get_my_company_id()
  );
