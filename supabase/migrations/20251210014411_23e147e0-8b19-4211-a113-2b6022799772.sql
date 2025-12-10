-- Drop the existing admin-only delete policy
DROP POLICY IF EXISTS "Admins can delete scope_items" ON public.scope_items;

-- Create a new policy that allows both editors and admins to delete scope_items
CREATE POLICY "Editors and admins can delete scope_items" 
ON public.scope_items 
FOR DELETE 
USING (EXISTS (
  SELECT 1 
  FROM user_roles 
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('admin', 'editor')
));