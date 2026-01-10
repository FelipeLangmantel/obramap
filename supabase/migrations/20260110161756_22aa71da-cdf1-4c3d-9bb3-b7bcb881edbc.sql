ALTER TABLE public.service_planning_by_period
ADD COLUMN IF NOT EXISTS planned_start_date date,
ADD COLUMN IF NOT EXISTS planned_end_date date,
ADD COLUMN IF NOT EXISTS supply_deadline date,
ADD COLUMN IF NOT EXISTS supply_risk boolean DEFAULT false;