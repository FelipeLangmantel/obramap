-- Add team dimensioning columns to service_planning_by_period
-- These are planning/analysis fields only, do NOT trigger operational records

ALTER TABLE public.service_planning_by_period
ADD COLUMN IF NOT EXISTS team_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS productivity_per_team numeric(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS expected_output integer GENERATED ALWAYS AS (team_count * COALESCE(productivity_per_team, 0)::integer) STORED;

-- Add comments for documentation
COMMENT ON COLUMN public.service_planning_by_period.team_count IS 'Number of teams allocated to this service in the period';
COMMENT ON COLUMN public.service_planning_by_period.productivity_per_team IS 'Expected houses per team per week';
COMMENT ON COLUMN public.service_planning_by_period.expected_output IS 'Computed: team_count × productivity_per_team (productive capacity)';