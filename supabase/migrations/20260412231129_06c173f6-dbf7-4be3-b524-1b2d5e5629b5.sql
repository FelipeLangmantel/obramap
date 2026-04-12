ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS holding_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;