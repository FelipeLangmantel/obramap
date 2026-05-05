-- Keep IFC records restricted to users from the project's company.
-- Global system_admin users are intentionally not allowed through these policies.

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
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
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
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
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
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
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
  )
  with check (
    project_id in (
      select id
      from public.projects
      where company_id = public.get_my_company_id()
    )
  );
