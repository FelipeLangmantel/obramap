
-- ============================================================
-- MÓDULO: Industrialização & Logística — Fase 1
-- Arquitetura dual: integrated + standalone
-- ============================================================

-- CAMADA 0 — Contexto Operacional
CREATE TABLE public.ind_operation_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN ('integrated', 'standalone')),
  obramap_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  client_name TEXT,
  total_units INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_ctx_integrated_requires_project
    CHECK (
      (context_type = 'integrated' AND obramap_project_id IS NOT NULL)
      OR (context_type = 'standalone')
    )
);
ALTER TABLE public.ind_operation_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_operation_contexts FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1A — Standalone: Zonas
CREATE TABLE public.ind_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  color TEXT DEFAULT '#6b7280',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_zones FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1A — Standalone: Unidades
CREATE TABLE public.ind_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES public.ind_zones(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  unit_number INTEGER NOT NULL,
  unit_type TEXT DEFAULT 'residential',
  position_x NUMERIC DEFAULT 0,
  position_y NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_production','ready','in_transit','delivered','installed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(context_id, unit_number)
);
ALTER TABLE public.ind_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_units FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1A — Standalone: Serviços
CREATE TABLE public.ind_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Estrutural',
  display_order INTEGER DEFAULT 0,
  is_industrialized BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_services FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1A — Standalone: Períodos
CREATE TABLE public.ind_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_units INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_periods FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1B — Demanda Industrial
CREATE TABLE public.ind_demand_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  obramap_period_id UUID REFERENCES public.planning_periods(id) ON DELETE SET NULL,
  ind_period_id UUID REFERENCES public.ind_periods(id) ON DELETE SET NULL,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  target_quantity INTEGER NOT NULL DEFAULT 0,
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_demand_mode_service_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_demand_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_demand_entries FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 1C — Unidades da Demanda
CREATE TABLE public.ind_demand_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_entry_id UUID NOT NULL REFERENCES public.ind_demand_entries(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  CONSTRAINT ind_demand_units_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_demand_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_demand_units FOR ALL TO authenticated
  USING (context_id IN (SELECT id FROM public.ind_operation_contexts WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 2 — Configuração do Serviço Industrializado
CREATE TABLE public.ind_service_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  requires_transport BOOLEAN NOT NULL DEFAULT true,
  requires_lifting BOOLEAN NOT NULL DEFAULT true,
  requires_installation_team BOOLEAN NOT NULL DEFAULT true,
  logistic_unit_type TEXT NOT NULL DEFAULT 'unit',
  default_lead_time_days INTEGER NOT NULL DEFAULT 7,
  loading_time_hours NUMERIC DEFAULT 1,
  unloading_time_hours NUMERIC DEFAULT 1,
  installation_time_per_unit NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_service_config_mode_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_service_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_service_configs FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 3 — Fábricas
CREATE TABLE public.ind_factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cnpj TEXT,
  city TEXT,
  state TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  avg_lead_time_days INTEGER NOT NULL DEFAULT 7,
  radius_km NUMERIC,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_factories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_factories FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 3 — Capacidade por serviço
CREATE TABLE public.ind_factory_capacities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE CASCADE,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  capacity_day INTEGER NOT NULL DEFAULT 0,
  capacity_week INTEGER NOT NULL DEFAULT 0,
  capacity_month INTEGER NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 14,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ind_factory_capacity_mode_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_factory_capacities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_factory_capacities FOR ALL TO authenticated
  USING (factory_id IN (SELECT id FROM public.ind_factories WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 3 — Regras fábrica × contexto × serviço
CREATE TABLE public.ind_factory_context_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  reserved_capacity_month INTEGER NOT NULL DEFAULT 0,
  max_share_percent NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT ind_factory_context_rule_mode_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_factory_context_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_factory_context_rules FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 4 — Modelos industriais
CREATE TABLE public.ind_factory_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  total_positions INTEGER NOT NULL DEFAULT 9,
  units_per_week INTEGER NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_factory_model_mode_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_factory_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_factory_models FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 4 — Posições do modelo
CREATE TABLE public.ind_model_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.ind_factory_models(id) ON DELETE CASCADE,
  position_code TEXT NOT NULL,
  description TEXT,
  position_order INTEGER NOT NULL DEFAULT 1,
  width_cm NUMERIC,
  height_cm NUMERIC,
  thickness_cm NUMERIC,
  weight_kg NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model_id, position_code)
);
ALTER TABLE public.ind_model_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_model_positions FOR ALL TO authenticated
  USING (model_id IN (SELECT id FROM public.ind_factory_models WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 5 — Lotes de Produção
CREATE TABLE public.ind_production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE RESTRICT,
  model_id UUID REFERENCES public.ind_factory_models(id) ON DELETE SET NULL,
  demand_entry_id UUID REFERENCES public.ind_demand_entries(id) ON DELETE SET NULL,
  macro_id TEXT,
  scope_id TEXT,
  ind_service_id UUID REFERENCES public.ind_services(id) ON DELETE SET NULL,
  batch_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','released','in_production','ready','awaiting_transport','in_transit','delivered','installed','cancelled')),
  planned_quantity INTEGER NOT NULL DEFAULT 0,
  planned_start DATE,
  planned_finish DATE,
  actual_start DATE,
  actual_finish DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_batch_mode_check
    CHECK (
      (scope_id IS NOT NULL AND ind_service_id IS NULL)
      OR (scope_id IS NULL AND ind_service_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_production_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_production_batches FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 5 — Vínculo lote × unidade
CREATE TABLE public.ind_batch_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.ind_production_batches(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','assigned','in_production','ready','delivered','installed')),
  CONSTRAINT ind_batch_units_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_batch_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_batch_units FOR ALL TO authenticated
  USING (context_id IN (SELECT id FROM public.ind_operation_contexts WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 6 — Kit por Unidade
CREATE TABLE public.ind_unit_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ind_production_batches(id) ON DELETE SET NULL,
  factory_id UUID NOT NULL REFERENCES public.ind_factories(id) ON DELETE RESTRICT,
  model_id UUID REFERENCES public.ind_factory_models(id) ON DELETE SET NULL,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  needed_by_date DATE,
  kit_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kit_status IN ('pending','in_production','partial','complete','delivered','installed')),
  components_total INTEGER NOT NULL DEFAULT 0,
  components_delivered INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ind_unit_kits_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_unit_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_unit_kits FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 7 — Caminhões
CREATE TABLE public.ind_trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  truck_type TEXT NOT NULL DEFAULT 'munck',
  capacity_kg NUMERIC NOT NULL DEFAULT 12000,
  carrier_name TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_trucks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_trucks FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 7 — Viagens
CREATE TABLE public.ind_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.ind_production_batches(id) ON DELETE RESTRICT,
  truck_id UUID REFERENCES public.ind_trucks(id) ON DELETE SET NULL,
  shipment_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','confirmed','in_transit','delivered','cancelled')),
  planned_date DATE NOT NULL,
  actual_date DATE,
  truck_plate TEXT,
  driver_name TEXT,
  truck_capacity_kg NUMERIC,
  total_weight_kg NUMERIC NOT NULL DEFAULT 0,
  freight_value NUMERIC NOT NULL DEFAULT 0,
  received_by TEXT,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_shipments FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 7 — Vínculo viagem × unidade
CREATE TABLE public.ind_shipment_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.ind_shipments(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','loaded','delivered','damaged','missing')),
  notes TEXT,
  CONSTRAINT ind_shipment_units_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_shipment_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_shipment_units FOR ALL TO authenticated
  USING (context_id IN (SELECT id FROM public.ind_operation_contexts WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 8 — Equipamentos de Içamento
CREATE TABLE public.ind_lifting_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN ('crane','munck','forklift','other')),
  supplier_name TEXT,
  capacity_tons NUMERIC,
  daily_cost NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_lifting_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_lifting_equipment FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 8 — Agenda de Içamento
CREATE TABLE public.ind_lifting_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ind_production_batches(id) ON DELETE SET NULL,
  linked_shipment_id UUID REFERENCES public.ind_shipments(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES public.ind_lifting_equipment(id) ON DELETE SET NULL,
  supplier_name TEXT,
  booking_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  daily_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','done','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_lifting_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_lifting_schedule FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- CAMADA 8 — Vínculo içamento × unidade
CREATE TABLE public.ind_lifting_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lifting_schedule_id UUID NOT NULL REFERENCES public.ind_lifting_schedule(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  CONSTRAINT ind_lifting_units_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_lifting_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_lifting_units FOR ALL TO authenticated
  USING (context_id IN (SELECT id FROM public.ind_operation_contexts WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- CAMADA 8 — Agenda de Montagem
CREATE TABLE public.ind_installation_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.ind_production_batches(id) ON DELETE SET NULL,
  lifting_schedule_id UUID REFERENCES public.ind_lifting_schedule(id) ON DELETE SET NULL,
  contractor_name TEXT,
  contractor_id UUID REFERENCES public.contractors(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  team_size INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','in_progress','done','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ind_installation_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_installation_schedule FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id() OR public.is_system_admin(auth.uid()));

-- Vínculo montagem × unidade
CREATE TABLE public.ind_installation_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id UUID NOT NULL REFERENCES public.ind_installation_schedule(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES public.ind_operation_contexts(id) ON DELETE CASCADE,
  house_number INTEGER,
  unit_id UUID REFERENCES public.ind_units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','installed','rework')),
  CONSTRAINT ind_installation_units_mode_check
    CHECK (
      (house_number IS NOT NULL AND unit_id IS NULL)
      OR (house_number IS NULL AND unit_id IS NOT NULL)
    )
);
ALTER TABLE public.ind_installation_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company isolation" ON public.ind_installation_units FOR ALL TO authenticated
  USING (context_id IN (SELECT id FROM public.ind_operation_contexts WHERE company_id = public.get_my_company_id()) OR public.is_system_admin(auth.uid()));

-- Índices de performance
CREATE INDEX idx_ind_contexts_company ON public.ind_operation_contexts(company_id);
CREATE INDEX idx_ind_contexts_project ON public.ind_operation_contexts(obramap_project_id);
CREATE INDEX idx_ind_demand_context ON public.ind_demand_entries(context_id);
CREATE INDEX idx_ind_batches_context ON public.ind_production_batches(context_id);
CREATE INDEX idx_ind_batches_factory ON public.ind_production_batches(factory_id);
CREATE INDEX idx_ind_shipments_context ON public.ind_shipments(context_id);
CREATE INDEX idx_ind_shipments_batch ON public.ind_shipments(batch_id);
CREATE INDEX idx_ind_unit_kits_context ON public.ind_unit_kits(context_id);
CREATE INDEX idx_ind_lifting_context ON public.ind_lifting_schedule(context_id);
CREATE INDEX idx_ind_installation_context ON public.ind_installation_schedule(context_id);
