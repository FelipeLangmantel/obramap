-- Allow global system_admin users without company_id to manage IFC records.
-- Company users remain restricted to projects from their own company.

drop policy if exists "Company users manage project_3d_models"
  on public.project_3d_models;
create policy "Company users manage project_3d_models"
  on public.project_3d_models for all to authenticated
  using (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  );

drop policy if exists "Company users manage project_ifc_elements"
  on public.project_ifc_elements;
create policy "Company users manage project_ifc_elements"
  on public.project_ifc_elements for all to authenticated
  using (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  );

drop policy if exists "Company users manage project_ifc_activation_rules"
  on public.project_ifc_activation_rules;
create policy "Company users manage project_ifc_activation_rules"
  on public.project_ifc_activation_rules for all to authenticated
  using (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  );

drop policy if exists "Company users manage project_ifc_element_links"
  on public.project_ifc_element_links;
create policy "Company users manage project_ifc_element_links"
  on public.project_ifc_element_links for all to authenticated
  using (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.system_role = 'system_admin'
    )
  );
