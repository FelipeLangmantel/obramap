
# Fase 1 — Frentes Compartilhadas / Grupos de Equipe (ajustado)

Implementa **apenas a base persistente + UI de cadastro** em Produtividade e Equipes. Nada de Gantt, Linha de Balanço, Semanal, Produção, Diário ou Mapa 3D é tocado.

---

## Pré-confirmações feitas (read-only no banco)

| Item | Resultado |
|---|---|
| Tipo real de `macro_id` / `scope_id` em `project_service_productivity`, `service_planning_by_period`, `diary_items`, `planning_services`, `measurement_services` | **text** |
| `fn_audit_log()` | existe (sem args) |
| `update_updated_at_column()` | existe (sem args) |
| `get_my_company_id()` | existe |
| `can_write()` | existe |
| `is_system_admin(uuid)` | existe |
| `projects.company_id` | existe (usado para join de validação) |

**Decisão:** macro_id / scope_id nas 3 novas tabelas serão **text** para casar com o ecossistema de planejamento existente. Triggers de auditoria e `updated_at` são seguros.

---

## 1. Migration (única)

Cria 3 tabelas em `public`, RLS estrito por verbo, triggers de `updated_at` + `fn_audit_log`.

### 1.1 `project_team_work_groups`
Colunas: `id uuid pk`, `company_id uuid not null`, `project_id uuid not null`, `name text not null`, `description text`, `base_unit text`, `productivity_value numeric`, `productivity_unit text`, `working_days_per_week numeric default 5`, `simultaneous_team_count numeric default 1`, `professional_count numeric default 0 check (>=0)`, `auxiliary_count numeric default 0 check (>=0)`, `active boolean default true`, `created_by uuid`, `updated_by uuid`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.

`total_people` será derivado no front (não usar generated column).

Índices: `(company_id)`, `(project_id)`, `(project_id, active)`.
Unique parcial (índice, não constraint):
```sql
CREATE UNIQUE INDEX uq_work_groups_proj_name
  ON public.project_team_work_groups (project_id, lower(name))
  WHERE active = true;
```

### 1.2 `project_team_work_group_services`
Colunas: `id uuid pk`, `company_id uuid not null`, `project_id uuid not null`, `group_id uuid not null references project_team_work_groups(id) on delete cascade`, `macro_id text`, `scope_id text`, `service_name text`, `sequence_order integer`, `lag_days numeric default 0`, `productivity_override numeric`, `productivity_unit_override text`, `active boolean default true`, + auditoria padrão.

Índices: `(group_id)`, `(project_id)`, `(macro_id)`, `(scope_id)`.
Unique parcial (índice):
```sql
CREATE UNIQUE INDEX uq_work_group_services_link
  ON public.project_team_work_group_services
     (project_id, group_id, coalesce(macro_id,''), coalesce(scope_id,''))
  WHERE active = true;
```
(`coalesce(.., '')` é seguro porque os tipos são **text**.)

### 1.3 `project_service_planning_settings`
Colunas: `id uuid pk`, `company_id uuid not null`, `project_id uuid not null`, `macro_id text`, `scope_id text`, `service_name text`, `service_planning_type text not null default 'physical_repetitive'`, `include_in_gantt boolean default true`, `include_in_line_of_balance boolean default true`, `include_in_weekly_planning boolean default true`, `notes text`, + auditoria padrão.

CHECK:
```sql
CHECK (service_planning_type IN (
  'physical_repetitive','physical_one_time','administrative_cost',
  'support_service','milestone','hidden_from_planning','undefined'
))
```

Índices: `(company_id)`, `(project_id)`, `(macro_id)`, `(scope_id)`, `(service_planning_type)`.
Unique parcial (índice, tipo text seguro com COALESCE):
```sql
CREATE UNIQUE INDEX uq_service_planning_settings_key
  ON public.project_service_planning_settings
     (project_id, coalesce(macro_id,''), coalesce(scope_id,''));
```

### 1.4 RLS — separada por verbo, com **validação dupla** (company + project↔company)

Para cada uma das 3 tabelas:

```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY sel_<tbl> ON public.<tbl>
FOR SELECT TO authenticated
USING (
  is_system_admin(auth.uid())
  OR (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = <tbl>.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

-- INSERT
CREATE POLICY ins_<tbl> ON public.<tbl>
FOR INSERT TO authenticated
WITH CHECK (
  is_system_admin(auth.uid())
  OR (
    can_write()
    AND company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = <tbl>.project_id
        AND p.company_id = get_my_company_id()
    )
  )
);

-- UPDATE (USING + WITH CHECK iguais à INSERT, sobre a linha)
-- DELETE (USING igual à INSERT)
```

Nada de `FOR ALL`, nada de `true`, nada de `auth.uid() IS NOT NULL` como permissão de escrita.

### 1.5 Auditoria

Funções confirmadas. Adicionar triggers nas 3 tabelas:
```sql
CREATE TRIGGER trg_audit_<tbl>
AFTER INSERT OR UPDATE OR DELETE ON public.<tbl>
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

CREATE TRIGGER trg_updated_at_<tbl>
BEFORE UPDATE ON public.<tbl>
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

## 2. Frontend (somente Produtividade e Equipes)

Novos arquivos:
- `src/hooks/useTeamWorkGroups.ts` — CRUD de frentes + vínculos de serviços. Todo handler chama `requireEdit()` antes de mutar.
- `src/hooks/useServicePlanningSettings.ts` — upsert por `(project_id, macro_id, scope_id)`.
- `src/components/productivity/TeamWorkGroupsPanel.tsx` — lista de frentes (cards leves no padrão claro), botão "Nova frente", ações editar/ativar/excluir, chips de serviços vinculados, total de pessoas derivado.
- `src/components/productivity/TeamWorkGroupDialog.tsx` — criar/editar (aceita `initialValues` para fluxo "Criar frente a partir desta sugestão"; nada é gravado sem confirmação).
- `src/components/productivity/AddServiceToGroupDialog.tsx` — escolher macro+scope existentes do projeto.
- `src/components/productivity/ServicePlanningSettingsPanel.tsx` — tabela com Tipo, Gantt, Linha, Semanal. Aviso: *"Esta configuração será usada nas próximas fases para filtrar Gantt, Linha de Balanço e Planejamento Semanal. Por enquanto ela apenas é salva."*

Editado:
- `src/components/productivity/ServiceProductivityView.tsx` — adicionar Tabs: **Produtividade por serviço** (atual, intocado) · **Frentes compartilhadas** · **Configuração de planejamento físico**.

`useServiceProductivity.ts` **não é tocado**.

---

## 3. Permissões

- Viewer: vê, botões desabilitados, handlers do hook abortam.
- Editor/Admin: cria/edita/exclui.
- RLS no banco garante a borda mesmo se o front falhar.

---

## 4. NÃO faz (garantia explícita)

- ❌ Gantt
- ❌ Linha de Balanço
- ❌ Planejamento Semanal
- ❌ Produção
- ❌ Diário
- ❌ Mapa 3D
- ❌ Bucket `3d-models`
- ❌ Juntar lançamentos de produção ou diário
- ❌ Alterar policies de tabelas existentes
- ❌ Fix-all de segurança

---

## 5. Limitações desta fase

- `include_in_*` ainda não consumido pelos módulos.
- Capacidade da frente ainda não valida sobrecarga no Semanal.
- Sem cálculo automático de prazo / replanejamento.

## 6. Próxima fase recomendada

Fase 2: Gantt e Linha de Balanço respeitarem `include_in_*` + Semanal validar capacidade agregada da frente.

---

**Confirma para eu aplicar a migration e implementar a UI?**
