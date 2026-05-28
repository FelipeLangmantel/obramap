-- Restrict system notifications by recipient and project access.
-- The old company-wide SELECT/UPDATE policies allowed restricted users to see
-- notifications from works they could not access.

DROP POLICY IF EXISTS "notif_select" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_update" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_company_read" ON public.system_notifications;
DROP POLICY IF EXISTS "notif_company_update" ON public.system_notifications;
DROP POLICY IF EXISTS "notifications_own_company" ON public.system_notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_user_select" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_user_update" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_secure_select" ON public.system_notifications;
DROP POLICY IF EXISTS "system_notifications_secure_update" ON public.system_notifications;

CREATE POLICY "system_notifications_secure_select"
ON public.system_notifications
FOR SELECT
TO authenticated
USING (
  public.is_system_admin(auth.uid())
  OR (
    company_id = public.get_my_company_id()
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR user_id = auth.uid()
      OR (
        user_id IS NULL
        AND obra_id IS NULL
      )
      OR (
        user_id IS NULL
        AND obra_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.obras_portfolio op
          JOIN public.user_permissions up
            ON up.user_id = auth.uid()
          WHERE op.id = system_notifications.obra_id
            AND op.company_id = system_notifications.company_id
            AND op.obramap_project_id IS NOT NULL
            AND up.allowed_project_ids IS NOT NULL
            AND array_length(up.allowed_project_ids, 1) IS NOT NULL
            AND op.obramap_project_id = ANY(up.allowed_project_ids)
        )
      )
    )
  )
);

CREATE POLICY "system_notifications_secure_update"
ON public.system_notifications
FOR UPDATE
TO authenticated
USING (
  public.is_system_admin(auth.uid())
  OR (
    company_id = public.get_my_company_id()
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR user_id = auth.uid()
      OR (
        user_id IS NULL
        AND obra_id IS NULL
      )
      OR (
        user_id IS NULL
        AND obra_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.obras_portfolio op
          JOIN public.user_permissions up
            ON up.user_id = auth.uid()
          WHERE op.id = system_notifications.obra_id
            AND op.company_id = system_notifications.company_id
            AND op.obramap_project_id IS NOT NULL
            AND up.allowed_project_ids IS NOT NULL
            AND array_length(up.allowed_project_ids, 1) IS NOT NULL
            AND op.obramap_project_id = ANY(up.allowed_project_ids)
        )
      )
    )
  )
)
WITH CHECK (
  public.is_system_admin(auth.uid())
  OR (
    company_id = public.get_my_company_id()
    AND (
      public.is_company_admin(auth.uid(), company_id)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR user_id = auth.uid()
      OR (
        user_id IS NULL
        AND obra_id IS NULL
      )
      OR (
        user_id IS NULL
        AND obra_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.obras_portfolio op
          JOIN public.user_permissions up
            ON up.user_id = auth.uid()
          WHERE op.id = system_notifications.obra_id
            AND op.company_id = system_notifications.company_id
            AND op.obramap_project_id IS NOT NULL
            AND up.allowed_project_ids IS NOT NULL
            AND array_length(up.allowed_project_ids, 1) IS NOT NULL
            AND op.obramap_project_id = ANY(up.allowed_project_ids)
        )
      )
    )
  )
);
