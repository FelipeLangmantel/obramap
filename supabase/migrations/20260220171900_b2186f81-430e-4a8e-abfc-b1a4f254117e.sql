-- Tabela de lançamentos de estoque por medição/período
CREATE TABLE IF NOT EXISTS public.measurement_stock_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  planning_period_id UUID NOT NULL,
  item_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  item_unit TEXT,
  family_id UUID,
  family_name TEXT,
  quantity_required NUMERIC NOT NULL DEFAULT 0,
  quantity_in_stock NUMERIC NOT NULL DEFAULT 0,
  quantity_to_purchase NUMERIC GENERATED ALWAYS AS (GREATEST(quantity_required - quantity_in_stock, 0)) STORED,
  is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.measurement_stock_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies using user_roles table pattern
CREATE POLICY "Authenticated users can view measurement stock entries" 
ON public.measurement_stock_entries 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert measurement stock entries" 
ON public.measurement_stock_entries 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update measurement stock entries" 
ON public.measurement_stock_entries 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_measurement_stock_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_measurement_stock_entries_updated_at
BEFORE UPDATE ON public.measurement_stock_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_measurement_stock_entries_updated_at();