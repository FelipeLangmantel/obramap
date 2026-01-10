ALTER TABLE project_contracts
ADD COLUMN IF NOT EXISTS cost_target_percent numeric DEFAULT 70;