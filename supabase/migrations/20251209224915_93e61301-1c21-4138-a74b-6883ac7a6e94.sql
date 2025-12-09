-- Table for category lead times
CREATE TABLE public.category_lead_times (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('material', 'labor', 'equipment')),
  lead_time_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, category)
);

-- Table for suppliers
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for quotation requests (mapa de cotação)
CREATE TABLE public.quotation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')),
  required_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for quotation items
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotation_requests(id) ON DELETE CASCADE,
  scope_item_id UUID REFERENCES public.scope_items(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('material', 'labor', 'equipment')),
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  estimated_unit_value NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for supplier quotes (respostas dos fornecedores)
CREATE TABLE public.supplier_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_item_id UUID NOT NULL REFERENCES public.quotation_items(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  unit_value NUMERIC NOT NULL,
  total_value NUMERIC NOT NULL,
  delivery_days INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for purchase orders
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES public.quotation_requests(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'confirmed', 'in_transit', 'delivered', 'cancelled')),
  total_value NUMERIC NOT NULL DEFAULT 0,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for purchase order items
CREATE TABLE public.purchase_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  quotation_item_id UUID REFERENCES public.quotation_items(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('material', 'labor', 'equipment')),
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  unit_value NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for delivery tracking
CREATE TABLE public.delivery_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  tracking_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.category_lead_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Authenticated users can view category_lead_times" ON public.category_lead_times FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage category_lead_times" ON public.category_lead_times FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view suppliers" ON public.suppliers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage suppliers" ON public.suppliers FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view quotation_requests" ON public.quotation_requests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage quotation_requests" ON public.quotation_requests FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view quotation_items" ON public.quotation_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage quotation_items" ON public.quotation_items FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view supplier_quotes" ON public.supplier_quotes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage supplier_quotes" ON public.supplier_quotes FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view purchase_orders" ON public.purchase_orders FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage purchase_orders" ON public.purchase_orders FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view purchase_order_items" ON public.purchase_order_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage purchase_order_items" ON public.purchase_order_items FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

CREATE POLICY "Authenticated users can view delivery_tracking" ON public.delivery_tracking FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Editors can manage delivery_tracking" ON public.delivery_tracking FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'editor')));

-- Update triggers
CREATE TRIGGER update_category_lead_times_updated_at BEFORE UPDATE ON public.category_lead_times FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_quotation_requests_updated_at BEFORE UPDATE ON public.quotation_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();