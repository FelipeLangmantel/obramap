create table if not exists public.project_3d_models (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_type text not null check (model_type in ('ifc','glb','gltf','obj')),
  storage_path text,
  file_name text,
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ifc_elements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid not null references public.project_3d_models(id) on delete cascade,
  ifc_global_id text,
  ifc_entity_id text,
  ifc_type text,
  ifc_layer_name text,
  name text,
  detected_service_key text,
  detected_service_label text,
  detected_house_number integer,
  category text,
  confidence text,
  needs_review boolean not null default true,
  status text not null default 'suggested',
  raw_properties jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ifc_activation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid references public.project_3d_models(id) on delete cascade,
  match_type text not null,
  match_value text not null,
  trigger_service_key text not null,
  trigger_service_label text not null,
  visual_category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ifc_element_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  model_id uuid not null references public.project_3d_models(id) on delete cascade,
  ifc_element_id uuid not null references public.project_ifc_elements(id) on delete cascade,
  house_id uuid,
  house_number integer,
  trigger_service_key text not null,
  trigger_service_label text not null,
  status text not null default 'confirmed',
  confirmed_by uuid,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_3d_models enable row level security;
alter table public.project_ifc_elements enable row level security;
alter table public.project_ifc_activation_rules enable row level security;
alter table public.project_ifc_element_links enable row level security;

drop policy if exists "Company users manage project_3d_models"
  on public.project_3d_models;
create policy "Company users manage project_3d_models"
  on public.project_3d_models for all to authenticated
  using (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  )
  with check (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  );

drop policy if exists "Company users manage project_ifc_elements"
  on public.project_ifc_elements;
create policy "Company users manage project_ifc_elements"
  on public.project_ifc_elements for all to authenticated
  using (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  )
  with check (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  );

drop policy if exists "Company users manage project_ifc_activation_rules"
  on public.project_ifc_activation_rules;
create policy "Company users manage project_ifc_activation_rules"
  on public.project_ifc_activation_rules for all to authenticated
  using (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  )
  with check (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  );

drop policy if exists "Company users manage project_ifc_element_links"
  on public.project_ifc_element_links;
create policy "Company users manage project_ifc_element_links"
  on public.project_ifc_element_links for all to authenticated
  using (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  )
  with check (
    project_id in (
      select id from public.projects
      where company_id = public.get_my_company_id()
    )
  );

create index if not exists idx_project_3d_models_project_id
  on public.project_3d_models(project_id);
create index if not exists idx_project_3d_models_company_project
  on public.project_3d_models(company_id, project_id);
create index if not exists idx_project_3d_models_project_status
  on public.project_3d_models(project_id, status);

create index if not exists idx_project_ifc_elements_project_model
  on public.project_ifc_elements(project_id, model_id);
create index if not exists idx_project_ifc_elements_project_model_status
  on public.project_ifc_elements(project_id, model_id, status);
create index if not exists idx_project_ifc_elements_project_house_number
  on public.project_ifc_elements(project_id, detected_house_number);
create index if not exists idx_project_ifc_elements_project_service_key
  on public.project_ifc_elements(project_id, detected_service_key);
create index if not exists idx_project_ifc_elements_project_global_id
  on public.project_ifc_elements(project_id, ifc_global_id);

create unique index if not exists uq_project_ifc_elements_model_global_id
  on public.project_ifc_elements(project_id, model_id, ifc_global_id)
  where ifc_global_id is not null;

create index if not exists idx_project_ifc_activation_rules_project_model
  on public.project_ifc_activation_rules(project_id, model_id);
create index if not exists idx_project_ifc_activation_rules_project_active
  on public.project_ifc_activation_rules(project_id, is_active);

create index if not exists idx_project_ifc_element_links_project_model
  on public.project_ifc_element_links(project_id, model_id);
create index if not exists idx_project_ifc_element_links_project_house_number
  on public.project_ifc_element_links(project_id, house_number);
create index if not exists idx_project_ifc_element_links_project_service_key
  on public.project_ifc_element_links(project_id, trigger_service_key);

create unique index if not exists uq_project_ifc_element_links_element_house_service
  on public.project_ifc_element_links(
    ifc_element_id,
    coalesce(house_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(house_number, -1),
    trigger_service_key
  );

drop trigger if exists project_3d_models_updated_at
  on public.project_3d_models;
create trigger project_3d_models_updated_at
  before update on public.project_3d_models
  for each row execute function public.update_updated_at_column();

drop trigger if exists project_ifc_elements_updated_at
  on public.project_ifc_elements;
create trigger project_ifc_elements_updated_at
  before update on public.project_ifc_elements
  for each row execute function public.update_updated_at_column();

drop trigger if exists project_ifc_activation_rules_updated_at
  on public.project_ifc_activation_rules;
create trigger project_ifc_activation_rules_updated_at
  before update on public.project_ifc_activation_rules
  for each row execute function public.update_updated_at_column();

drop trigger if exists project_ifc_element_links_updated_at
  on public.project_ifc_element_links;
create trigger project_ifc_element_links_updated_at
  before update on public.project_ifc_element_links
  for each row execute function public.update_updated_at_column();