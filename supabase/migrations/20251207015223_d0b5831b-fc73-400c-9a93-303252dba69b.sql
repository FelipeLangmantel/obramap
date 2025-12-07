-- Add is_initial_database column to weekly_productions
-- This marks productions that are initial data for starting project tracking
-- These should NOT be included in planned vs actual analysis
ALTER TABLE public.weekly_productions 
ADD COLUMN is_initial_database BOOLEAN NOT NULL DEFAULT false;