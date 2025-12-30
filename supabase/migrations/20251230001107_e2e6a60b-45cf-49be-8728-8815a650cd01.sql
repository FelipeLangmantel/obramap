-- Delivery module tables (isolated, does not alter existing tables)

-- Delivery status enum for this module only
CREATE TYPE public.delivery_status AS ENUM (
  'em_vistoria',
  'entrega_agendada', 
  'entregue_sem_pendencias',
  'entregue_com_pendencias',
  'pos_obra_em_atendimento',
  'unidade_encerrada'
);

-- Issue severity enum
CREATE TYPE public.issue_severity AS ENUM ('critica', 'media', 'leve');

-- Issue status enum
CREATE TYPE public.issue_status AS ENUM ('aberta', 'em_execucao', 'aguardando_validacao', 'encerrada');

-- Checklist template categories
CREATE TABLE public.delivery_checklist_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Delivery inspections (one per house)
CREATE TABLE public.delivery_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  house_id UUID NOT NULL,
  house_number INTEGER NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'em_vistoria',
  inspection_date TIMESTAMP WITH TIME ZONE,
  delivery_date TIMESTAMP WITH TIME ZONE,
  scheduled_delivery_date DATE,
  inspector_id UUID,
  inspector_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, house_id)
);

-- Checklist items filled during inspection
CREATE TABLE public.delivery_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.delivery_inspections(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.delivery_checklist_templates(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  is_conforming BOOLEAN,
  photo_url TEXT,
  observation TEXT,
  checked_at TIMESTAMP WITH TIME ZONE,
  checked_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Delivery issues/pendencies
CREATE TABLE public.delivery_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.delivery_inspections(id) ON DELETE CASCADE,
  checklist_item_id UUID REFERENCES public.delivery_checklist_items(id) ON DELETE SET NULL,
  project_id UUID NOT NULL,
  house_id UUID NOT NULL,
  house_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  severity public.issue_severity NOT NULL DEFAULT 'media',
  status public.issue_status NOT NULL DEFAULT 'aberta',
  responsible_name TEXT,
  responsible_id UUID,
  sla_days INTEGER NOT NULL DEFAULT 7,
  due_date DATE,
  photo_before_url TEXT,
  photo_after_url TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.delivery_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_issues ENABLE ROW LEVEL SECURITY;

-- RLS Policies for delivery_checklist_templates
CREATE POLICY "Authenticated users can view delivery_checklist_templates"
ON public.delivery_checklist_templates FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage delivery_checklist_templates"
ON public.delivery_checklist_templates FOR ALL
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'::app_role));

-- RLS Policies for delivery_inspections
CREATE POLICY "Authenticated users can view delivery_inspections"
ON public.delivery_inspections FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage delivery_inspections"
ON public.delivery_inspections FOR ALL
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY(ARRAY['admin'::app_role, 'editor'::app_role])));

-- RLS Policies for delivery_checklist_items
CREATE POLICY "Authenticated users can view delivery_checklist_items"
ON public.delivery_checklist_items FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage delivery_checklist_items"
ON public.delivery_checklist_items FOR ALL
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY(ARRAY['admin'::app_role, 'editor'::app_role])));

-- RLS Policies for delivery_issues
CREATE POLICY "Authenticated users can view delivery_issues"
ON public.delivery_issues FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Editors can manage delivery_issues"
ON public.delivery_issues FOR ALL
USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = ANY(ARRAY['admin'::app_role, 'editor'::app_role])));

-- Triggers for updated_at
CREATE TRIGGER update_delivery_checklist_templates_updated_at
BEFORE UPDATE ON public.delivery_checklist_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_delivery_inspections_updated_at
BEFORE UPDATE ON public.delivery_inspections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_delivery_issues_updated_at
BEFORE UPDATE ON public.delivery_issues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();