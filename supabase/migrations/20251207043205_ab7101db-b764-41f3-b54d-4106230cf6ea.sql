-- Add unique constraint for upsert to work properly
ALTER TABLE public.scope_costs 
ADD CONSTRAINT scope_costs_project_scope_unique UNIQUE (project_id, scope_id);