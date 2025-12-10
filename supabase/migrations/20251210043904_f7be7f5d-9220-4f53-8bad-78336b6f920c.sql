-- Add measurement_number column to planned_productions table
ALTER TABLE public.planned_productions 
ADD COLUMN measurement_number integer DEFAULT 1;