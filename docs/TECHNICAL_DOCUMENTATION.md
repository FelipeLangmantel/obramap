# AUDITORIA TÉCNICA COMPLETA — ObraMap

**Última atualização:** 11/03/2026 às 23:00  
**Versão:** 2.0 — Substituição completa da documentação anterior  
**Escopo:** Diagnóstico estrutural completo de todo o sistema  
**Histórico de revisões:**  
| Data/Hora | Versão | Descrição |
|-----------|--------|-----------|
| 11/03/2026 23:00 | 2.0 | Auditoria técnica completa — 11 blocos |
| 11/03/2026 22:55 | 1.1 | Mutação atômica + ordenação propagada |
| 11/03/2026 22:48 | 1.0 | Documentação inicial |

---

## RESUMO EXECUTIVO

O ObraMap é um sistema multi-tenant de gestão de obras residenciais em série (condomínios horizontais). Construído com React/Vite + Supabase (Lovable Cloud), utiliza uma arquitetura baseada em dois contexts centrais (`AuthContext` e `ConstructionContext`) que concentram ~90% da lógica de estado. O sistema gerencia o ciclo completo: cadastro de obra → definição de etapas/serviços → orçamento → contrato → planejamento estratégico → planejamento por período → produção semanal → medições → entrega.

**Pontos fortes:** Isolamento multi-tenant via RLS + `get_my_company_id()`, sincronização atômica de mutações estruturais via RPC `apply_structure_mutation`, realtime para casas.

**Pontos críticos:** `ConstructionContext.tsx` com 1819 linhas concentrando toda a lógica de obras, dados de progresso em JSONB dentro de `houses.macros`, nomes desnormalizados em 8+ tabelas, `WeeklyProductionView.tsx` com 1852 linhas, `ProjectCostsView.tsx` com 1215 linhas.

---

## BLOCO 1 — VISÃO GERAL DA ARQUITETURA

### 1.1 Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui + Radix |
| Estado | React Context (AuthContext, ConstructionContext) |
| Cache/Queries | TanStack React Query (usado minimamente) |
| Backend | Supabase (Lovable Cloud) — PostgreSQL + Auth + RLS |
| Lógica Backend | RPCs PostgreSQL (PL/pgSQL) |
| Edge Functions | Deno (parse-budget, create-user, delete-user, etc.) |
| Realtime | Supabase Realtime (houses updates) |
| 3D | Three.js + React Three Fiber |
| Gráficos | Recharts |

### 1.2 Camadas e Responsabilidades

```
┌─────────────────────────────────────────────────┐
│                    FRONTEND                      │
│  pages/          → Roteamento e layout           │
│  components/     → UI + lógica de apresentação   │
│  contexts/       → Estado global + mutações       │
│  hooks/          → Lógica de domínio por módulo   │
│  data/           → Tipos e constantes             │
├─────────────────────────────────────────────────┤
│                    BACKEND                        │
│  RPCs            → Lógica atômica (mutations)     │
│  Triggers        → Cálculos automáticos           │
│  RLS Policies    → Segurança multi-tenant         │
│  Edge Functions  → Integração externa / parse     │
├─────────────────────────────────────────────────┤
│                   DADOS                           │
│  Tabelas Mestre  → companies, projects, inputs    │
│  Tabelas Operat. → measurements, productions      │
│  JSONB           → houses.macros (progresso)       │
│  Derivados       → scope_costs, planned_prods     │
└─────────────────────────────────────────────────┘
```

### 1.3 Fonte Primária de Verdade por Domínio

| Domínio | Fonte de Verdade | Tipo |
|---------|-----------------|------|
| Estrutura da obra (etapas/serviços) | `projects.macros_template` (JSONB) | Mestre |
| Progresso por casa | `houses.macros` (JSONB) | Operacional |
| Orçamento unitário | `scope_costs` + `scope_items` | Mestre |
| Contrato | `project_contracts` + `project_contract_services` | Derivado do orçamento |
| Planejamento estratégico | `planning_versions` + `planning_periods` + `service_planning_by_period` | Derivado do contrato |
| Produção semanal | `weekly_productions` | Operacional |
| Produção detalhada | `productions` | Operacional |
| Medições | `measurements` + `measurement_services` | Operacional |
| Insumos | `inputs` (por empresa) | Mestre |
| Fornecedores | `suppliers` (por empresa) | Mestre |
| Suprimentos | `supply_requests` + `supply_alerts` | Operacional |

### 1.4 Pontos Críticos da Arquitetura

| # | Problema | Severidade | Impacto |
|---|---------|-----------|---------|
| 1 | `ConstructionContext.tsx` = 1819 linhas — God Object | Alta | Manutenção, bugs, regressão |
| 2 | Progresso das casas em JSONB (`houses.macros`) — não-relacional | Alta | Impossível fazer queries SQL, agregações, índices |
| 3 | Nomes desnormalizados (`macro_name`, `scope_name`) em 8+ tabelas | Média | Sincronização manual necessária |
| 4 | `WeeklyProductionView.tsx` = 1852 linhas | Alta | Impossível manter |
| 5 | `ProjectCostsView.tsx` = 1215 linhas | Alta | Impossível manter |
| 6 | React Query subutilizado — estado em contexts | Média | Sem cache automático, sem retry, sem stale-while-revalidate |
| 7 | House sync client-side após structure mutation | Média | Se falhar, casas ficam dessincronizadas |

---

## BLOCO 2 — MAPA COMPLETO DE MÓDULOS

### 2.1 Painel Inicial (home)
- **Finalidade:** Dashboard resumo da obra
- **Componentes:** `HomeDashboard.tsx`
- **Lê:** `projects`, `houses`, `macros_template` (via context)
- **Escreve:** Nada
- **Hooks:** `useConstruction`, `useAuth`
- **Dependências:** Todos os dados do ConstructionContext

### 2.2 Etapas e Serviços (Gerenciamento)
- **Finalidade:** CRUD de etapas (macros) e serviços (scopes) — fonte mestre
- **Componentes:** `ManageMacrosDialog.tsx`, `ScopesList.tsx`
- **Lê:** `projects.macros_template` (JSONB)
- **Escreve:** `projects.macros_template` + cascata via `apply_structure_mutation` RPC
- **Hooks:** `useConstruction` (addMacro, updateMacro, deleteMacro, addScope, updateScope, deleteScope, reorderMacros, reorderScopes)
- **RPCs:** `apply_structure_mutation`
- **Impacta:** Mapa de Obras, Mapa Interativo, Mapa 3D, Custos, Contrato, Planejamento Estratégico, Planejamento por Período, Produção, Histograma
- **Cascata (11 tabelas):** scope_items, scope_costs, weekly_productions, planned_productions, production_deviations, labor_contracts, labor_histogram, measurement_services, budget_service_inputs, project_contract_services, service_planning_by_period

### 2.3 Cadastro de Insumos (inputs)
- **Finalidade:** Catálogo mestre de insumos por empresa
- **Componentes:** `InputsManagementView.tsx`
- **Lê:** `inputs`, `material_families`
- **Escreve:** `inputs`, `material_families`
- **Hooks:** Inline no componente
- **Escopo:** `company_id` (compartilhado entre projetos)
- **Trigger:** `trg_propagate_input_changes` propaga nome/unidade/categoria para `budget_service_inputs` e `supply_requests`
- **Impacta:** Orçamento (scope_items via input_id), Suprimentos

### 2.4 Custos da Obra (costs)
- **Finalidade:** Orçamento unitário por serviço (material, mão de obra, equipamento)
- **Componentes:** `ProjectCostsView.tsx` (1215 linhas), `BudgetItemsEditor.tsx`, `IndirectCostsTab.tsx`
- **Lê:** `scope_costs`, `scope_items`, `weekly_productions`, `planned_productions`
- **Escreve:** `scope_costs`, `scope_items`, `indirect_costs`
- **Hooks:** `useProjectSetupFlow`
- **Impacta:** Contrato (valores unitários), Planejamento (custos), Suprimentos (quantidades)

### 2.5 Contrato da Obra (project-contract)
- **Finalidade:** Definir receita unitária e meta de custo por serviço
- **Componentes:** `ProjectContractPage.tsx`, `ContractConfigCard.tsx`, `ContractServicesTable.tsx`, `ContractSummaryCards.tsx`
- **Lê:** `project_contracts`, `project_contract_services`, `scope_costs` (fallback)
- **Escreve:** `project_contracts`, `project_contract_services`
- **Hooks:** `useProjectContract`
- **RPCs:** `sync_contract_services`
- **Impacta:** Planejamento Estratégico (receita/custo), Medições (receita prevista)

### 2.6 Planejamento Estratégico / Longo Prazo (long-term-planning)
- **Finalidade:** Distribuir casas por período (quinzena/mês) por serviço
- **Componentes:** `LongTermPlanningPage.tsx`, `LongTermPlanningMatrix.tsx`, `PlanningHeader.tsx`
- **Lê:** `planning_versions`, `planning_periods`, `service_planning_by_period`, `project_contract_services`
- **Escreve:** `service_planning_by_period`, `planning_versions`, `planning_periods`
- **Hooks:** `useLongTermPlanning`
- **RPCs:** `initialize_long_term_planning`, `get_service_execution_bank`, `add_planning_period`, `clone_planning_version`
- **Impacta:** Planejamento por Período, Suprimentos, Histograma MO

### 2.7 Planejamento por Período / Medição (measurement-planning)
- **Finalidade:** Visualizar e gerenciar períodos do planejamento com detalhes financeiros
- **Componentes:** `MeasurementPlanningPage.tsx`, `PeriodCard.tsx`, `PeriodServicesDialog.tsx`
- **Lê:** `planning_periods`, `service_planning_by_period`
- **Escreve:** `planning_periods` (status), `service_planning_by_period`
- **Hooks:** `usePeriodPlanning`
- **RPCs:** `update_planning_period_status`, `generate_supplies_from_planning_period`
- **Impacta:** Suprimentos (geração automática ao aprovar)
- **Trigger:** `trg_calc_spbp_financials` calcula planned_revenue, planned_cost, projected_result automaticamente

### 2.8 Produção Semanal (production)
- **Finalidade:** Registrar execução real por serviço/casa/semana
- **Componentes:** `WeeklyProductionView.tsx` (1852 linhas!)
- **Lê:** `weekly_productions`, `planned_productions`, `measurement_services`, `houses`
- **Escreve:** `weekly_productions`, `houses.macros` (via trigger/realtime)
- **Hooks:** `useMeasurements`
- **Trigger:** `trg_update_period_from_production` atualiza status do período
- **Impacta:** Casas (progresso), Planejamento (banco inicial), Mapa de Obras

### 2.9 Medições (measurements)
- **Finalidade:** Agrupar serviços e produções por período de medição
- **Componentes:** `MeasurementSelector.tsx`, `MeasurementSelectorNew.tsx`
- **Lê:** `measurements`, `measurement_services`, `productions`
- **Escreve:** `measurements`, `measurement_services`, `productions`
- **Hooks:** `useMeasurements`
- **RPCs:** `close_measurement`, `reopen_measurement`, `create_measurement_service_with_cost`
- **Impacta:** Produção, Custos (realizado), Contrato (receita realizada)

### 2.10 Mapa de Obras (map)
- **Finalidade:** Visualização do progresso por casa com cores
- **Componentes:** `QuadrasGrid.tsx`, `HouseCard.tsx`, `HouseDetails.tsx`, `Legend.tsx`, `StatsCards.tsx`
- **Lê:** `houses.macros` (JSONB via context), `projects.macros_template`
- **Escreve:** `houses.macros` (progresso individual)
- **Hooks:** `useConstruction`

### 2.11 Mapa Interativo (interactive-map)
- **Finalidade:** Mapa 2D com posicionamento visual das casas
- **Componentes:** `InteractiveMapView.tsx`
- **Lê:** `map_layouts`, `houses`, `macros_template`
- **Escreve:** `map_layouts` (posições)

### 2.12 Mapa 3D (3d-map)
- **Finalidade:** Visualização 3D da obra
- **Componentes:** `Map3DView.tsx`, `LayersPanel.tsx`, `LinkLayersDialog.tsx`
- **Lê:** `map_layouts`, `houses`, `map_layer_stage_links`
- **Escreve:** `map_layouts`, `map_layer_stage_links`
- **Hooks:** `useModelLayers`

### 2.13 Suprimentos (supplies)
- **Finalidade:** Gestão JIT de materiais e alertas de compra
- **Componentes:** `SuppliesJITView.tsx`, `SupplyDashboard.tsx`, `SupplyAlertsList.tsx`, `SupplyRequestsView.tsx`
- **Lê:** `supply_alerts`, `supply_requests`, `material_families`, `category_lead_times`, `period_supply_requirements`
- **Escreve:** `supply_alerts`, `supply_requests`, `measurement_stock_entries`
- **Hooks:** `useSupplyAlerts`, `useSupplyRequests`, `useMeasurementStock`, `useMeasurementSupplies`
- **RPCs:** `generate_supplies_from_planning_period`, `transition_supply_status`

### 2.14 Histograma de MO (labor-histogram)
- **Finalidade:** Projeção de necessidade de mão de obra por período
- **Componentes:** `LaborHistogramView.tsx`, `ProductivityConfigDialog.tsx`
- **Lê:** `labor_histogram`, `service_planning_by_period`
- **Escreve:** `labor_histogram`
- **RPCs:** `calculate_labor_needs`

### 2.15 Fluxo Financeiro (financial-flow)
- **Finalidade:** Controle de contas a pagar e receber
- **Componentes:** `FinancialFlowView.tsx`, `InvoiceManagementView.tsx`, `CategoryManagement.tsx`
- **Lê:** `financial_entries`, `invoices`, `invoice_items`, `suppliers`
- **Escreve:** `financial_entries`, `invoices`, `invoice_items`

### 2.16 Contratos de MO (labor-contracts)
- **Finalidade:** Gestão de contratos de empreiteiros por serviço
- **Componentes:** `LaborContractsView.tsx`
- **Lê/Escreve:** `labor_contracts`

### 2.17 Planejamento Inteligente / Smart Planning
- **Finalidade:** Gantt automático com produtividade e dependências
- **Componentes:** `SmartPlanningView.tsx`, `GanttChart.tsx`, `StrategicGanttChart.tsx`, `LineOfBalance.tsx`, `PlanningDashboard.tsx`
- **Lê:** `planning_stages`, `planning_teams`, `daily_work_logs`, `service_planning_by_period`
- **Escreve:** `planning_stages`, `planning_teams`, `daily_work_logs`
- **Hooks:** `usePlanningData`, `usePlanningCalculations`, `useStrategicGanttData`

### 2.18 Entrega & Pós-Obra (delivery)
- **Finalidade:** Inspeções, checklists, pendências
- **Componentes:** `DeliveryView.tsx`, `DeliveryDashboard.tsx`, `InspectionChecklistDialog.tsx`, `IssueManagementDialog.tsx`
- **Lê/Escreve:** `delivery_inspections`, `delivery_checklist_items`, `delivery_issues`, `delivery_checklist_templates`

### 2.19 Painel da Diretoria (board-decisions)
- **Finalidade:** Decisões de governança e riscos
- **Componentes:** `BoardDecisionsView.tsx`, `EnhancedDecisionDialog.tsx`, `GovernanceLevelsPanel.tsx`
- **Lê/Escreve:** `board_decisions`

### 2.20 Gráficos e Análises (charts)
- **Finalidade:** Dashboards visuais de progresso
- **Componentes:** `ChartsView.tsx`
- **Lê:** `houses.macros` (via context)

---

## BLOCO 3 — MAPA DE DADOS E FONTES DE VERDADE

### 3.1 Tabelas Principais

| Tabela | Tipo | company_id | project_id | Deletável | Finalidade |
|--------|------|-----------|-----------|-----------|-----------|
| `companies` | Mestre | PK | — | Não | Organizações |
| `profiles` | Mestre | FK | — | Via cascade | Usuários |
| `projects` | Mestre | FK | PK | Sim (cascade) | Obras |
| `houses` | Operacional | — | FK | Sim | Casas com progresso JSONB |
| `quadras` | Operacional | — | FK | Sim | Blocos/quadras |
| `inputs` | Mestre | FK (obrig.) | FK | Sim | Catálogo de insumos |
| `material_families` | Mestre | FK (obrig.) | FK | Sim | Famílias de material |
| `suppliers` | Mestre | FK (obrig.) | — | Sim | Fornecedores |
| `scope_costs` | Derivado | — | FK | Sim | Custo unitário por serviço |
| `scope_items` | Derivado | — | FK | Sim (cascade) | Itens do orçamento |
| `project_contracts` | Mestre | FK | FK | Sim | Contrato da obra |
| `project_contract_services` | Derivado | FK | FK | Sim (cascade) | Serviços do contrato |
| `planning_versions` | Operacional | FK | FK | Sim | Versão do planejamento |
| `planning_periods` | Operacional | FK | FK | Sim | Períodos (quinzenas) |
| `service_planning_by_period` | Derivado | FK | FK | Sim | Metas por período/serviço |
| `measurements` | Operacional | FK | FK | Imutável (closed) | Medições |
| `measurement_services` | Operacional | FK | FK | Sim | Serviços da medição |
| `weekly_productions` | Histórico | — | FK | Sim | Produção semanal |
| `productions` | Histórico | — | FK | Sim | Produção detalhada |
| `planned_productions` | Operacional | — | FK | Sim | Planejamento semanal |
| `production_deviations` | Derivado | — | FK | Sim | Desvios |
| `labor_contracts` | Operacional | — | FK | Sim | Contratos MO |
| `labor_histogram` | Derivado | FK | FK | Sim | Histograma MO |
| `budget_service_inputs` | Derivado | FK | FK | Sim | Vinculação insumo-serviço |
| `supply_requests` | Operacional | — | FK | Sim | Requisições de compra |
| `supply_alerts` | Operacional | — | FK | Sim | Alertas JIT |
| `financial_entries` | Operacional | — | FK | Sim | Lançamentos financeiros |
| `invoices` + `invoice_items` | Operacional | FK | FK | Sim | Notas fiscais |
| `delivery_inspections` | Operacional | — | FK | Sim | Inspeções de entrega |
| `board_decisions` | Operacional | — | FK | Sim | Decisões da diretoria |
| `planning_stages` | Operacional | — | FK | Sim | Etapas Smart Planning |
| `planning_teams` | Operacional | — | FK | Sim | Equipes Smart Planning |
| `daily_work_logs` | Histórico | — | FK | Sim | Diário de obra |
| `map_layouts` | Operacional | — | FK (1:1) | Sim | Layout do mapa |
| `indirect_costs` | Operacional | FK | FK | Sim | Custos indiretos |
| `user_permissions` | Config | — | — | Sim | Permissões granulares |
| `user_roles` | Config | — | — | Sim | Papéis legados |
| `company_modules` | Config | FK | — | Sim | Módulos por empresa |
| `system_modules` | Config Global | — | — | Não | Módulos do sistema |

### 3.2 Diagrama de Dependências

```
projects.macros_template (JSONB - FONTE MESTRE)
  ├── houses.macros (JSONB - cópia sincronizada com progresso)
  ├── scope_costs (custo unitário)
  │     └── scope_items (detalhamento do orçamento)
  │           └── budget_service_inputs (vínculo com inputs)
  ├── project_contract_services (receita unitária)
  │     └── service_planning_by_period (metas por período)
  │           ├── period_supply_requirements (necessidades de suprimento)
  │           └── supply_requests (geradas automaticamente)
  ├── measurement_services (serviços da medição)
  │     └── productions (produção registrada)
  ├── weekly_productions (produção semanal)
  ├── planned_productions (planejamento semanal)
  ├── production_deviations (desvios)
  ├── labor_contracts (contratos MO)
  └── labor_histogram (histograma MO)

inputs (FONTE MESTRE - por empresa)
  ├── scope_items.input_id (vínculo com orçamento)
  ├── budget_service_inputs.input_id (coeficientes)
  └── supply_requests.item_id (requisições)
```

---

## BLOCO 4 — REGRAS DE NEGÓCIO

### 4.1 Multi-empresa
| Regra | Implementação | Local |
|-------|-------------|-------|
| Isolamento por company_id | RLS + `get_my_company_id()` | PostgreSQL |
| System Admin acessa tudo | `is_system_admin(auth.uid())` nas policies | PostgreSQL |
| Insumos compartilhados entre obras | `inputs.company_id` sem restrição por project_id | DB |
| Propagação de alteração de insumo | `trg_propagate_input_changes` | Trigger |

### 4.2 Mutação Estrutural
| Regra | Implementação | Local |
|-------|-------------|-------|
| Toda alteração em etapas/serviços é atômica | `apply_structure_mutation` RPC | PostgreSQL |
| Cascata para 11 tabelas | DELETE + UPDATE dentro da RPC | PostgreSQL |
| Sync de houses é client-side | `syncMacrosToHouses()` | ConstructionContext.tsx |
| Ordenação propagada via macro_order/scope_order | RPC + columns em contract/planning | DB + Hooks |

### 4.3 Medições
| Regra | Implementação | Local |
|-------|-------------|-------|
| Medição fechada é imutável | Trigger + RPC `close_measurement` | PostgreSQL |
| Reabertura só por system_admin | RPC `reopen_measurement` | PostgreSQL |
| Receita = contrato × % planejado | Trigger `trg_calc_spbp_financials` | PostgreSQL |

### 4.4 Produção
| Regra | Implementação | Local |
|-------|-------------|-------|
| Atualiza progresso da casa | Trigger no houses via realtime | DB + Realtime |
| Banco inicial via `is_initial_database` | Flag em weekly_productions/productions | DB |
| Banco de execução via `get_service_execution_bank` | RPC | PostgreSQL |

### 4.5 Planejamento
| Regra | Implementação | Local |
|-------|-------------|-------|
| Geração automática de suprimentos ao aprovar | `generate_supplies_from_planning_period` | RPC (chamada no hook) |
| Status: draft → approved → released_to_weekly → closed | `update_planning_period_status` | RPC |
| Financeiro calculado por trigger | `trg_calc_spbp_financials` | PostgreSQL |

### 4.6 Exclusão
| Regra | Status |
|-------|--------|
| **Hard Delete** em todas as tabelas | ⚠️ Implementado mas arriscado |
| Sem soft-delete/arquivamento | ⚠️ Perda permanente de histórico |
| Sem travamento estrutural após início da obra | ⚠️ Pode quebrar dados em produção |

### 4.7 Cálculos Principais
| Cálculo | Fórmula | Onde |
|---------|---------|------|
| Progresso da casa | `Σ(scope.progress × scope.weight) / Σ(weight)` | `constructionData.ts` |
| Custo unitário do serviço | `Σ(scope_items.quantity × unit_value)` | `ProjectCostsView.tsx` |
| Custo máximo (contrato) | `unit_revenue × (cost_target_percent / 100)` | `useProjectContract.ts` |
| Receita total contrato | `Σ(unit_revenue_value)` | `useProjectContract.ts` |
| Margem projetada | `total_revenue - total_max_cost` | `useProjectContract.ts` |
| Custo do período | `Σ(target_houses × unit_cost_value)` | `useLongTermPlanning.ts` + trigger |
| Receita do período | `Σ(target_houses × unit_revenue_value)` | `useLongTermPlanning.ts` + trigger |
| Resultado do período | `revenue - cost` | Vários hooks |
| Banco de execução | `unnest(weekly_productions.house_ids)` excluindo initial_db | RPC `get_service_execution_bank` |
| Capacidade produtiva | `team_count × productivity_per_team` | `usePeriodPlanning` |
| Gap de capacidade | `capacity - target_houses` | `usePeriodPlanning` |
| Duração Smart Planning | `remaining_houses / (productivity × teams)` | `useStrategicGanttData` |
| Margem do target | `(revenue - cost) / revenue × 100` | `useMeasurementPlanning` |
| Suprimentos necessários | `Σ(budget_inputs.qty_per_unit × target_houses)` | RPC `generate_supplies_from_planning_period` |

---

## BLOCO 5 — IDs, CÓDIGOS E RASTREABILIDADE

### 5.1 Modelo Atual

| Entidade | Tipo de ID | Código de Negócio | Risco |
|----------|-----------|-------------------|-------|
| Projeto | UUID (DB) | Nenhum | Baixo |
| Etapa (Macro) | `macro_TIMESTAMP` (JSONB) | Nenhum | ⚠️ Frágil — timestamp pode colidir |
| Serviço (Scope) | `scope_TIMESTAMP` (JSONB) | Nenhum | ⚠️ Frágil |
| Casa | `house_number` (integer) | Número sequencial | OK |
| Insumo | UUID (DB) | `code` (opcional) | ⚠️ Código opcional = inconsistência |
| Medição | UUID + `measurement_number` | Número sequencial | OK |
| Período | UUID + `period_number` | Número sequencial | OK |

### 5.2 Onde Usa Nome em Vez de ID (Desnormalizado)

| Tabela | Campo desnormalizado | ID correspondente (já existe) |
|--------|-------------------|------|
| `weekly_productions` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `planned_productions` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `measurement_services` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `labor_contracts` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `labor_histogram` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `service_planning_by_period` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `project_contract_services` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |
| `scope_costs` | `macro_name`, `scope_name` | `macro_id`, `scope_id` |

**Diagnóstico:** Os IDs existem e são usados para JOINs. Os nomes são desnormalizados para conveniência de exibição. A RPC `apply_structure_mutation` atualiza os nomes nas tabelas derivadas, mas se a RPC falhar parcialmente, os nomes ficam stale.

---

## BLOCO 6 — MULTIEMPRESA

### 6.1 Mapa de Isolamento

| Tabela | Tem company_id | RLS | Isolamento |
|--------|---------------|-----|-----------|
| `companies` | PK | ✅ | Total |
| `profiles` | FK | ✅ | Total |
| `projects` | FK | ✅ via `get_my_company_id()` | Total |
| `inputs` | FK obrigatório | ✅ | Total |
| `suppliers` | FK obrigatório | ✅ | Total |
| `material_families` | FK obrigatório | ✅ | Total |
| `houses` | Via project_id | ✅ Indireto | OK |
| `weekly_productions` | Via project_id | ✅ Indireto | OK |
| `scope_costs` | Via project_id | ⚠️ Sem company_id direto | Risco baixo |
| `scope_items` | Via project_id | ⚠️ Sem company_id direto | Risco baixo |
| `planned_productions` | Via project_id | ⚠️ Sem company_id direto | Risco baixo |
| `board_decisions` | Via project_id | ⚠️ Sem company_id direto | Risco baixo |

### 6.2 Parecer

O multiempresa está **funcionalmente maduro**. O isolamento via `get_my_company_id()` no RLS é sólido. As tabelas sem `company_id` direto são protegidas indiretamente via FK para `projects` + RLS. **Risco residual:** se uma policy em `projects` falhar, tabelas derivadas ficam expostas.

---

## BLOCO 7 — PASTAS, ARQUIVOS E RESPONSABILIDADES

### 7.1 Arquivos Críticos (tamanho e complexidade)

| Arquivo | Linhas | Problema |
|---------|--------|---------|
| `ConstructionContext.tsx` | 1819 | **God Object** — CRUD projetos, casas, quadras, macros, scopes, filtros, legends, reorder, progress, batch updates, structure mutation |
| `WeeklyProductionView.tsx` | 1852 | **Monolito** — UI + lógica + estado em um arquivo |
| `ProjectCostsView.tsx` | 1215 | **Monolito** — Orçamento completo |
| `AppSidebar.tsx` | 534 | Aceitável mas com lógica de módulos |
| `AuthContext.tsx` | 480 | Aceitável — bem delimitado |
| `useLongTermPlanning.ts` | 732 | Grande mas focado |

### 7.2 Concentração de Risco

`ConstructionContext.tsx` deveria ser dividido em pelo menos 4 hooks/contexts:
1. `useProjects` (CRUD projetos)
2. `useHouses` (progresso, filtros)
3. `useStructure` (macros, scopes, mutation)
4. `useQuadras` (CRUD quadras)

---

## BLOCO 8 — FÓRMULAS DUPLICADAS

| Fórmula | Lugar 1 | Lugar 2 | Risco |
|---------|---------|---------|-------|
| Custo do período | `useLongTermPlanning` (JS) | `trg_calc_spbp_financials` (SQL trigger) | Se divergirem, frontend ≠ backend |
| Resultado = receita - custo | `useLongTermPlanning`, `usePeriodPlanning`, `useMeasurementPlanning` | — | Baixo (fórmula simples) |

---

## BLOCO 9 — MATRIZ DE IMPACTO ENTRE MÓDULOS

| Se alterar... | Impacta diretamente... |
|--------------|----------------------|
| Etapa/Serviço (macros_template) | Mapa, Custos, Contrato, Planej. Estratégico, Planej. Período, Produção, Histograma MO, Mapa 3D, Mapa Interativo, Suprimentos |
| Insumo (inputs) | Orçamento (scope_items), Suprimentos (supply_requests) |
| Custo unitário (scope_costs) | Contrato (se recalcular), Planejamento (custos projetados) |
| Contrato (project_contract_services) | Planej. Estratégico (receita/custo), Medições (receita prevista) |
| Planejamento (service_planning_by_period) | Suprimentos, Histograma MO, Planej. por Período |
| Produção (weekly_productions) | Casas (progresso), Banco de execução (Planej. Estratégico), Mapa |
| Medição (measurements) | Produção, Custos (realizado), Recebimentos (contract_receipts) |
| Família de material | Suprimentos, Insumos |

---

## BLOCO 10 — RISCOS, DÍVIDAS TÉCNICAS E MELHORIAS

| # | Problema | Severidade | Impacto | Urgência | Recomendação |
|---|---------|-----------|---------|----------|-------------|
| 1 | **God Object: ConstructionContext (1819 linhas)** | 🔴 Crítica | Todo o sistema | Alta | Dividir em 4+ hooks especializados |
| 2 | **Progresso em JSONB (houses.macros)** | 🔴 Crítica | Impossível queries SQL | Média | Migrar para tabela relacional `house_service_progress` |
| 3 | **Hard Delete sem soft-delete** | 🟡 Alta | Perda irreversível de histórico | Alta | Implementar soft-delete + arquivamento |
| 4 | **Sem travamento estrutural** | 🟡 Alta | Dados inconsistentes em obras em andamento | Alta | Travar mutação após primeira produção |
| 5 | **WeeklyProductionView (1852 linhas)** | 🟡 Alta | Impossível manter | Média | Refatorar em sub-componentes |
| 6 | **Nomes desnormalizados em 8+ tabelas** | 🟡 Alta | Sync manual, risco de stale | Média | Usar JOINs progressivamente |
| 7 | **House sync client-side** | 🟡 Alta | Se falhar, casas desync | Média | Mover para trigger ou RPC |
| 8 | **React Query subutilizado** | 🟡 Média | Sem cache, sem retry | Baixa | Migrar hooks para useQuery |
| 9 | **IDs macro/scope = timestamps** | 🟡 Média | Possível colisão | Baixa | Usar UUID |
| 10 | **Fórmulas duplicadas (JS + SQL)** | 🟡 Média | Divergência possível | Baixa | Centralizar no backend |
| 11 | **Sem testes automatizados** | 🟡 Média | Regressão silenciosa | Média | Implementar testes |
| 12 | **scope_costs sem company_id** | 🟢 Baixa | Protegido indiretamente | Baixa | Adicionar company_id |

---

## BLOCO 11 — PROPOSTA DE ARQUITETURA ALVO

### 11.1 Fonte Única de Verdade

| Domínio | Fonte Atual | Fonte Alvo |
|---------|------------|-----------|
| Estrutura (etapas/serviços) | `projects.macros_template` (JSONB) | Tabela relacional `project_macros` + `project_scopes` |
| Progresso por casa/serviço | `houses.macros` (JSONB) | Tabela `house_service_progress(house_id, scope_id, progress)` |

### 11.2 Políticas Propostas

**Exclusão:** Serviço com produção → soft-delete (`archived`). Serviço sem produção → hard delete permitido. Medição fechada → imutável. Insumo com referências → `inactive`.

**Travamento:** Após primeira produção → bloquear exclusão de serviço. Após contrato salvo → confirmar adição/exclusão. Após medição fechada → serviço congelado.

**Códigos:** macro_code (ETP-01), scope_code (SRV-01-01), input_code obrigatório.

**Sync:** Manter `apply_structure_mutation`. Mover house sync para RPC. Eliminar desnormalização progressivamente.

**Código:** Dividir ConstructionContext em 4 hooks. Dividir WeeklyProductionView em 4 componentes. Dividir ProjectCostsView em 3 componentes.

---

## APÊNDICE — LISTA DE RPCs DO SISTEMA

| RPC | Finalidade |
|-----|-----------|
| `get_my_company_id` | Retorna company_id do usuário autenticado |
| `is_system_admin` | Verifica se é admin global |
| `get_user_role` | Retorna papel legado |
| `apply_structure_mutation` | Mutação atômica de etapas/serviços (11 tabelas) |
| `sync_contract_services` | Sincroniza contrato com orçamento |
| `initialize_long_term_planning` | Cria versão + períodos + serviços |
| `get_service_execution_bank` | Banco de execução (casas já feitas) |
| `add_planning_period` | Adiciona período ao planejamento |
| `clone_planning_version` | Clona versão do planejamento |
| `update_planning_period_status` | Muda status do período |
| `generate_supplies_from_planning_period` | Gera requisições de suprimento |
| `close_measurement` | Fecha medição (imutável) |
| `reopen_measurement` | Reabre medição (system_admin) |
| `create_measurement_service_with_cost` | Cria serviço com custo calculado |
| `calculate_labor_needs` | Calcula necessidade de MO |
| `calculate_service_planned_cost` | Calcula custo planejado |
| `rename_house_number` | Renumera casa com cascade |
| `approve_planning_period` | Aprova período |
| `close_planning_period` | Fecha período |
| `apply_contract_to_planning` | Aplica contrato ao planejamento |
| `compare_planning_versions` | Compara versões |
| `transition_supply_status` | Transição de status de suprimento |
| `get_project_execution_dashboard` | Dashboard de execução |
| `generate_service_planning_targets` | Gera metas de serviço |
| `admin_create_company` | Cria empresa (system admin) |
| `admin_create_company_admin` | Cria admin de empresa |
| `check_legacy_data_status` | Verifica dados legados |
| `complete_orphan_data_migration` | Migra dados órfãos |

---

*Documentação gerada por auditoria do código-fonte em 2026-03-11.*
