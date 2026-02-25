
ALTER TABLE public.weekly_productions 
ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
ADD COLUMN IF NOT EXISTS created_by_name text;
