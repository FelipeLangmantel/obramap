-- Remove overly permissive storage policies on holding-documents bucket.
-- The company-scoped policies remain and are sufficient for proper multi-tenant access control.

DROP POLICY IF EXISTS "Authenticated users can read holding docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own holding docs" ON storage.objects;