
-- Fix the UPDATE policy: p.id should be p.user_id to match auth.uid()
DROP POLICY IF EXISTS "Company admins can update correction requests" ON public.medicao_correction_requests;

CREATE POLICY "Company admins can update correction requests"
ON public.medicao_correction_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM obras_portfolio op
    JOIN profiles p ON p.company_id = op.company_id
    WHERE op.id = medicao_correction_requests.obra_id
      AND p.user_id = auth.uid()
      AND p.system_role = ANY (ARRAY['admin'::system_role, 'system_admin'::system_role])
  )
);
