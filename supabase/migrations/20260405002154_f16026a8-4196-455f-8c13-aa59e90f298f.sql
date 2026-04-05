
-- Fix audit_log RLS: company admins should see all audit logs from users in their company
DROP POLICY IF EXISTS "audit_log_company_read" ON public.audit_log;

CREATE POLICY "audit_log_company_read" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    is_system_admin(auth.uid())
    OR user_id IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.company_id = public.get_my_company_id()
    )
  );
