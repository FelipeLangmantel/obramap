# Documentação Técnica - ObraMap

**Sistema de Gestão de Obras**  
**Versão:** Janeiro 2026 (atualizado com Suprimentos JIT)  
**Desenvolvido por:** Felipe Langmantel

> **NOTA:** O módulo de Suprimentos foi refatorado para modelo Just-in-Time (JIT).
> Novas tabelas: `materials`, `service_materials`, `project_lead_times`, `supply_alerts`.
> Funções RPC: `regenerate_supply_alerts()`, `recalc_alerts_for_measurement()`.
> Triggers automáticos recalculam alertas quando planejamento ou lead times mudam.

---

## Sumário

1. [Mapa de Módulos](#1-mapa-de-módulos)
2. [Modelo de Dados](#2-modelo-de-dados)
3. [Fluxo de Informação entre Módulos](#3-fluxo-de-informação-entre-módulos)
4. [Regras de Negócio](#4-regras-de-negócio)
5. [Pontos de Cálculo e Inteligência](#5-pontos-de-cálculo-e-inteligência)
6. [Dependências Críticas](#6-dependências-críticas)

---

## 1. MAPA DE MÓDULOS

### 1.1 Mapa de Obras (Dashboard Principal)

**Função:** Visão geral do empreendimento com visualização do progresso por casa/unidade.

**Dados que cria:**
- Atualização de progresso por escopo em cada casa (tabela `houses`)
- Histórico de última atualização por casa

**Dados que consome:**
- Projetos (`projects`)
- Quadras (`quadras`)
- Casas com macros e escopos (`houses`)
- Template de macros do projeto (`projects.macros_template`)

---

### 1.2 Planejamento Semanal

**Função:** Criação de medições e planejamento de serviços a serem executados em períodos definidos.

**Dados que cria:**
- Medições (`measurements`)
- Serviços planejados por medição (`measurement_services`)
- Produções planejadas legadas (`planned_productions`)

**Dados que consome:**
- Template de macros e escopos do projeto
- Lista de casas disponíveis
- Progresso atual por escopo

---

### 1.3 Produção Semanal

**Função:** Registro da execução real de serviços por casa, vinculados ou não a uma medição.

**Dados que cria:**
- Registros de produção (`productions`)
- Registros legados (`weekly_productions`)
- Atualização de progresso nas casas (`houses.macros`)

**Dados que consome:**
- Medições e serviços (`measurements`, `measurement_services`)
- Produções planejadas (`planned_productions`)
- Casas e seu progresso atual

---

### 1.4 Banco Inicial

**Função:** Modo especial de registro para atividades já concluídas antes do início do acompanhamento digital.

**Dados que cria:**
- Produções marcadas como `is_initial_database = true`
- Atualização de progresso nas casas (não contabiliza como produção real para análise)

**Dados que consome:**
- Template de macros e escopos
- Lista de casas

---

### 1.5 Custos da Obra (Project Costs)

**Função:** Orçamento detalhado por escopo, cálculo de custos por medição e análise de curva ABC.

**Dados que cria:**
- Custos por escopo (`scope_costs`)
- Histórico local de custos unitários

**Dados que consome:**
- Template de macros e escopos
- Produções planejadas (`planned_productions`)
- Custos de material, mão de obra e equipamento por escopo

---

### 1.6 Fluxo Financeiro

**Função:** Controle de contas a pagar com visão semanal, geração de QR Code PIX e relatórios.

**Dados que cria:**
- Lançamentos financeiros (`financial_entries`)

**Dados que consome:**
- Fornecedores (`suppliers`)
- Categorias financeiras do projeto
- Lançamentos existentes

---

### 1.7 Suprimentos

**Função:** Gestão completa de cotações, pedidos de compra, acompanhamento de entregas e contratos de mão de obra.

**Dados que cria:**
- Solicitações de cotação (`quotation_requests`)
- Itens de cotação (`quotation_items`)
- Cotações de fornecedores (`supplier_quotes`)
- Pedidos de compra (`purchase_orders`)
- Itens de pedido (`purchase_order_items`)
- Rastreamento de entrega (`delivery_tracking`)
- Contratos de mão de obra (`labor_contracts`)
- Insumos (`inputs`)
- Famílias de materiais (`material_families`)

**Dados que consome:**
- Fornecedores (`suppliers`)
- Insumos cadastrados
- Produções para cálculo de contratos executados

---

### 1.8 Mapa Interativo 2D

**Função:** Posicionamento visual de casas sobre imagem de implantação do projeto.

**Dados que cria:**
- Layout do mapa (`map_layouts.houses`, `map_layouts.quadras`)
- URL da imagem de fundo

**Dados que consome:**
- Casas e seu progresso
- Quadras do projeto
- Configuração de legenda

---

### 1.9 Mapa 3D

**Função:** Visualização tridimensional do empreendimento com marcadores de progresso.

**Dados que cria:**
- Marcadores 3D de casas (`map_layouts.house_markers_3d`)
- Posição e alvo da câmera (`map_layouts.camera_position`, `camera_target`)
- URL do modelo 3D

**Dados que consome:**
- Casas e progresso por escopo
- Configuração de legenda customizada
- Modelo 3D carregado (GLTF/OBJ)

---

### 1.10 Gráficos e Análises

**Função:** Visualização consolidada de progresso por status, quadra, macro e escopo.

**Dados que cria:**
- Nenhum (apenas leitura)

**Dados que consome:**
- Casas com progresso por macro/escopo
- Quadras
- Template de macros e escopos
- Filtros ativos (status, macro, escopo, quadra)

---

### 1.11 Painel da Diretoria

**Função:** Identificação automática de riscos críticos, simulação de cenários e registro de decisões gerenciais.

**Dados que cria:**
- Decisões registradas (`board_decisions`)

**Dados que consome:**
- Produções semanais (`weekly_productions`)
- Produções planejadas (`planned_productions`)
- Casas e progresso
- Histórico de decisões

---

### 1.12 Planejamento Inteligente

**Função:** Cronograma baseado em produtividade, Gantt e Linha de Balanço com alertas automáticos.

**Dados que cria:**
- Etapas de planejamento (`planning_stages`)
- Equipes (`planning_teams`)
- Diários de obra (`daily_work_logs`)
- Alertas (`planning_alerts`)
- Simulações (`planning_simulations`)
- Baselines/versões (`planning_baselines`, `planning_versions`)

**Dados que consome:**
- Template de macros do projeto
- Total de unidades
- Data de início e fim do projeto
- Biblioteca de produtividade (`productivity_library`)

---

### 1.13 Entrega e Pós-Obra

**Função:** Controle de inspeções de entrega, checklists e gestão de pendências.

**Dados que cria:**
- Inspeções de entrega (`delivery_inspections`)
- Itens de checklist (`delivery_checklist_items`)
- Pendências/issues (`delivery_issues`)
- Templates de checklist (`delivery_checklist_templates`)

**Dados que consome:**
- Casas do projeto
- Templates de checklist
- Usuários do sistema

---

## 2. MODELO DE DADOS

### 2.1 Entidades Principais

#### projects (Projetos)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único do projeto |
| company_id | UUID (FK → companies) | Empresa proprietária |
| name | texto | Nome do empreendimento |
| location | texto | Localização |
| contractor | texto | Construtora responsável |
| start_date | data | Data de início |
| expected_end_date | data | Data prevista de término |
| total_houses | inteiro | Quantidade total de unidades |
| unit_size | numérico | Área padrão da unidade (m²) |
| macros_template | JSONB | Template de etapas e serviços |
| setup_complete | booleano | Configuração inicial concluída |
| legend_follow_macros | booleano | Legenda segue cores dos macros |
| custom_legend_items | JSONB | Itens personalizados de legenda |
| weight_mode | texto | Modo de peso (automatic/manual) |

#### houses (Casas/Unidades)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID (FK → projects) | Projeto pai |
| house_number | inteiro | Número da unidade |
| quadra_id | UUID (FK → quadras) | Quadra onde está localizada |
| area | numérico | Área em m² |
| type | texto | Tipo de unidade |
| constructor_name | texto | Nome do empreiteiro |
| expected_date | data | Data prevista de entrega |
| last_update | data | Data da última atualização |
| macros | JSONB | Estado atual de todos os macros/escopos com progresso |

**Estrutura do campo `macros` (JSONB):**
```
[
  {
    "id": "macro1",
    "name": "Estrutura",
    "color": "#ef4444",
    "scopes": [
      {
        "id": "radier",
        "name": "Radier",
        "weight": 8,
        "progress": 100,
        "startDate": "2024-06-15",
        "endDate": "2024-06-20"
      },
      ...
    ]
  },
  ...
]
```

#### quadras (Quadras/Blocos)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID (FK → projects) | Projeto pai |
| name | texto | Nome da quadra |
| house_ids | array de inteiros | Números das casas nesta quadra |
| display_order | inteiro | Ordem de exibição |

---

### 2.2 Sistema de Medições

#### measurements (Medições)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID (FK → projects) | Projeto |
| measurement_number | inteiro | Número sequencial da medição |
| start_date | data | Data de início do período |
| end_date | data | Data de fim do período |
| notes | texto | Observações |

#### measurement_services (Serviços da Medição)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| measurement_id | UUID (FK → measurements) | Medição pai |
| macro_id | texto | ID do macro (do template) |
| macro_name | texto | Nome do macro |
| macro_color | texto | Cor do macro |
| scope_id | texto | ID do escopo |
| scope_name | texto | Nome do escopo |
| planned_house_ids | array de inteiros | Casas planejadas |
| planned_houses | inteiro | Quantidade planejada |
| notes | texto | Observações |

**Relacionamento:**
- Uma **Medição** possui vários **Serviços**
- Cada **Serviço** representa um escopo específico com casas planejadas
- A combinação (measurement_id, macro_id, scope_id) é única (índice)

---

### 2.3 Sistema de Produção

#### productions (Produções)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID (FK → projects) | Projeto |
| measurement_id | UUID (FK → measurements) | Medição vinculada (opcional) |
| measurement_service_id | UUID (FK → measurement_services) | Serviço vinculado (opcional) |
| macro_id | texto | ID do macro |
| macro_name | texto | Nome do macro |
| scope_id | texto | ID do escopo |
| scope_name | texto | Nome do escopo |
| house_ids | array de inteiros | Casas executadas |
| houses_count | inteiro | Quantidade de casas |
| production_date | data | Data do registro |
| is_initial_database | booleano | Se é cadastro inicial (pré-existente) |
| is_unplanned | booleano | Se é produção não planejada |

**Relacionamento com Medição:**
- `measurement_id` é nulo se for produção não planejada
- `measurement_service_id` vincula diretamente ao serviço planejado
- Permite rastrear: "Esta produção veio de qual planejamento?"

#### weekly_productions (Produções Legadas)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID | Projeto |
| week_start | data | Início da semana |
| week_end | data | Fim da semana |
| scope_id, scope_name | texto | Escopo executado |
| macro_id, macro_name, macro_color | texto | Macro executado |
| house_ids | array | Casas executadas |
| houses_count | inteiro | Quantidade |
| is_initial_database | booleano | Cadastro inicial |

*Nota: Tabela mantida para compatibilidade com análises legadas.*

#### planned_productions (Planejamento Legado)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador único |
| project_id | UUID | Projeto |
| week_start, week_end | data | Período |
| scope_id, scope_name | texto | Escopo |
| macro_id, macro_name, macro_color | texto | Macro |
| planned_house_ids | array | Casas planejadas |
| planned_houses | inteiro | Quantidade |
| measurement_number | inteiro | Número da medição |

---

### 2.4 Planejamento Inteligente

#### planning_stages (Etapas do Cronograma)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| name | texto | Nome da etapa |
| macro_id | texto | Macro vinculado (opcional) |
| scope_id | texto | Escopo vinculado (opcional) |
| sequence_order | inteiro | Ordem de execução |
| planned_productivity | numérico | Produtividade planejada (unidades/dia/equipe) |
| planned_teams | inteiro | Quantidade de equipes |
| depends_on | UUID (FK → planning_stages) | Dependência (predecessor) |
| latency_days | inteiro | Dias de latência após predecessor |
| color | texto | Cor para visualização |

#### planning_teams (Equipes)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| stage_id | UUID (FK → planning_stages) | Etapa associada |
| name | texto | Nome da equipe |
| professionals_count | inteiro | Qtd de profissionais |
| helpers_count | inteiro | Qtd de ajudantes |
| is_active | booleano | Equipe ativa |

#### daily_work_logs (Diário de Obra)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| stage_id | UUID (FK → planning_stages) | Etapa |
| team_id | UUID (FK → planning_teams) | Equipe |
| log_date | data | Data do registro |
| units_completed | numérico | Unidades concluídas |
| house_ids | array | Casas trabalhadas |
| weather | texto | Condição climática |
| notes | texto | Observações |

#### planning_baselines (Baselines)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| name | texto | Nome do baseline |
| version_number | inteiro | Número da versão |
| baseline_data | JSONB | Snapshot completo do planejamento |
| created_at | timestamp | Data de criação |

---

### 2.5 Sistema Financeiro

#### financial_entries (Lançamentos Financeiros)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| supplier_id | UUID (FK → suppliers) | Fornecedor |
| category | texto | Categoria |
| subcategory | texto | Subcategoria |
| description | texto | Descrição |
| amount | numérico | Valor |
| due_date | data | Data de vencimento |
| payment_date | data | Data de pagamento |
| status | texto | pending/paid/overdue |
| pix_key, pix_key_type | texto | Dados PIX |

#### scope_costs (Custos por Escopo)
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID (PK) | Identificador |
| project_id | UUID | Projeto |
| macro_id, macro_name, macro_color | texto | Macro |
| scope_id, scope_name | texto | Escopo |
| material_cost | numérico | Custo de material por unidade |
| labor_cost | numérico | Custo de mão de obra por unidade |
| equipment_cost | numérico | Custo de equipamento por unidade |

---

## 3. FLUXO DE INFORMAÇÃO ENTRE MÓDULOS

### 3.1 Fluxo de Cadastro Inicial (Banco Inicial)

```
┌─────────────────────────────────────────────────────────────┐
│  1. BANCO INICIAL                                           │
│     - Usuário seleciona macro + escopo                      │
│     - Seleciona casas já concluídas                        │
│     - Marca como "is_initial_database = true"              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ATUALIZAÇÃO DE CASAS                                    │
│     - Sistema atualiza houses.macros com progresso         │
│     - NÃO conta como produção real para métricas           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VISUALIZAÇÃO                                            │
│     - Mapa de Obras exibe progresso                        │
│     - Gráficos mostram status atualizado                   │
│     - Mapa 3D reflete cores de progresso                   │
└─────────────────────────────────────────────────────────────┘
```

**Origem dos dados:** Usuário informa manualmente  
**Onde é salvo:** `productions` (is_initial_database=true), `weekly_productions` (is_initial_database=true), `houses.macros`  
**Quem consome:** Todos os módulos de visualização (exceto análises de produtividade)

---

### 3.2 Fluxo de Planejamento Semanal → Produção

```
┌─────────────────────────────────────────────────────────────┐
│  1. PLANEJAMENTO SEMANAL                                    │
│     - Usuário cria Medição (ex: 1ª Medição)                │
│     - Define período (início/fim)                          │
│     - Adiciona serviços (macro + escopo + casas)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. BANCO DE DADOS                                          │
│     - Cria registro em measurements                        │
│     - Cria registros em measurement_services               │
│     - Cria registros em planned_productions (legado)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. PRODUÇÃO SEMANAL                                        │
│     - Usuário seleciona medição + serviço                  │
│     - Sistema pré-carrega casas planejadas                 │
│     - Usuário confirma casas executadas                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. REGISTRO DE PRODUÇÃO                                    │
│     - Salva em productions com measurement_id              │
│     - Salva em weekly_productions (legado)                 │
│     - Atualiza progresso em houses.macros                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. ANÁLISES E VISUALIZAÇÕES                                │
│     - Planejado vs Realizado                               │
│     - Cálculo de desvios                                   │
│     - Painel da Diretoria                                  │
│     - Custos por medição                                   │
└─────────────────────────────────────────────────────────────┘
```

**Origem dos dados:** Planejamento Semanal  
**Onde é salvo:** `measurements`, `measurement_services`, `planned_productions`, `productions`, `houses`  
**Quem consome:** Produção Semanal, Custos, Painel Diretoria, Gráficos

---

### 3.3 Fluxo do Planejamento Inteligente

```
┌─────────────────────────────────────────────────────────────┐
│  1. ONBOARDING DO PLANEJAMENTO                              │
│     - Sistema carrega macros do projeto                    │
│     - Usuário define produtividade e equipes por etapa     │
│     - Sistema calcula duração baseada em total de unidades │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CRIAÇÃO DE BASELINE                                     │
│     - Usuário clica "Iniciar Planejamento"                 │
│     - Sistema congela versão inicial                       │
│     - Cria registro em planning_baselines                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. DIÁRIO DE OBRA                                          │
│     - Usuário registra trabalho diário                     │
│     - Informa etapa, equipe, unidades concluídas           │
│     - Salva em daily_work_logs                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. CÁLCULOS AUTOMÁTICOS                                    │
│     - Sistema calcula produtividade real                   │
│     - Atualiza inclinação da Linha de Balanço             │
│     - Projeta nova data de término                         │
│     - Identifica desvios críticos                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. ALERTAS E SIMULAÇÕES                                    │
│     - Gera alertas em planning_alerts                      │
│     - Permite simulações de cenários                       │
│     - Apoia decisões do Painel Diretoria                   │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.4 Fluxo do Painel da Diretoria

```
┌─────────────────────────────────────────────────────────────┐
│  FONTES DE DADOS                                            │
│     - weekly_productions (produção real)                   │
│     - planned_productions (planejamento)                   │
│     - houses (progresso atual)                             │
│     - board_decisions (histórico de decisões)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  IDENTIFICAÇÃO DE RISCOS                                    │
│     - Compara planejado vs realizado                       │
│     - Detecta casas paradas                                │
│     - Calcula gap de conclusão                             │
│     - Projeta impacto em custo e prazo                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  SIMULAÇÃO DE CENÁRIOS                                      │
│     - Permite testar ações corretivas                      │
│     - Calcula economia potencial                           │
│     - Indica risco residual                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  REGISTRO DE DECISÃO                                        │
│     - Diretoria escolhe ação                               │
│     - Sistema registra em board_decisions                  │
│     - Mantém histórico para auditoria                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. REGRAS DE NEGÓCIO

### 4.1 Conceito de Medição

**Definição:** Uma medição é um período formal de apuração de produção, geralmente semanal ou quinzenal.

**Regras:**
- Cada medição possui um número sequencial único por projeto
- Uma medição contém múltiplos serviços (combinação macro + escopo)
- Não é permitido duplicar o mesmo serviço na mesma medição (índice único)
- A exclusão de uma medição remove em cascata todos os serviços vinculados
- Produções vinculadas a uma medição mantêm o `measurement_id` para rastreabilidade

### 4.2 Quando a Produção Pode Ser Lançada

**Produção Planejada:**
- Requer seleção de medição existente
- Requer seleção de serviço dentro da medição
- Casas planejadas são pré-carregadas
- Sistema valida se casas já não possuem 100% no escopo

**Produção Não Planejada (Avulsa):**
- Não requer medição
- Usuário seleciona macro, escopo e casas livremente
- Registrada com `is_unplanned = true`
- Válida para ajustes ou trabalhos emergenciais

### 4.3 Cálculo do Avanço da Casa

**Fórmula:**
```
Progresso da Casa = Σ (peso_escopo × progresso_escopo) / Σ peso_escopo
```

Onde:
- `peso_escopo` = weight definido no template
- `progresso_escopo` = 0 a 100% registrado

**Implementação:**
```typescript
function calculateHouseProgress(house: House): number {
  let totalWeight = 0;
  let weightedProgress = 0;
  
  house.macros.forEach(macro => {
    macro.scopes.forEach(scope => {
      totalWeight += scope.weight;
      weightedProgress += (scope.progress * scope.weight) / 100;
    });
  });
  
  return totalWeight > 0 ? Math.round((weightedProgress / totalWeight) * 100) : 0;
}
```

### 4.4 Classificação de Status por Progresso

| Progresso | Status |
|-----------|--------|
| 0% | Não Iniciado |
| 1% - 29% | Fundação |
| 30% - 59% | Estrutura |
| 60% - 99% | Acabamento |
| 100% | Concluído |

*Nota: A legenda pode ser customizada por projeto via `custom_legend_items`.*

### 4.5 Efeitos da Exclusão de Medição

**Cascata de exclusão:**
1. Remove todos os registros em `measurement_services` com `measurement_id`
2. Remove registros em `planned_productions` com `measurement_number` correspondente
3. NÃO remove automaticamente produções (`productions`) - mantém histórico
4. NÃO reverte progresso nas casas - requer intervenção manual

### 4.6 Distinção entre Planejado e Real

| Aspecto | Planejado | Real |
|---------|-----------|------|
| Origem | Planejamento Semanal / Inteligente | Produção Semanal / Diário de Obra |
| Tabelas | `measurements`, `measurement_services`, `planned_productions`, `planning_stages` | `productions`, `weekly_productions`, `daily_work_logs`, `houses.macros` |
| Pode ser alterado depois | Sim | Sim (com ressalvas) |
| Afeta progresso da casa | Não | Sim |
| Usado para análise de desvio | Baseline (meta) | Valor efetivo |

### 4.7 Resolução de Conflitos

**Duplicidade de serviço em medição:**
- Sistema impede via índice único no banco
- Exibe mensagem de erro clara ao usuário

**Progresso superior a 100%:**
- Sistema limita automaticamente a 100%
- Produção adicional é registrada mas não altera progresso

**Cadastro inicial vs produção real:**
- Flag `is_initial_database` diferencia os registros
- Análises de produtividade ignoram registros iniciais

---

## 5. PONTOS DE CÁLCULO E INTELIGÊNCIA

### 5.1 Cálculo de Produtividade

**Localização:** `usePlanningCalculations.ts`

**Dados de entrada:**
- `daily_work_logs` (registros diários)
- `planning_stages` (etapas planejadas)
- `planning_teams` (equipes ativas)

**Lógica:**
```
Produtividade Real = Σ units_completed / dias_trabalhados / equipes_ativas
Produtividade Planejada = planned_productivity (da etapa)
Variância = (Real - Planejada) / Planejada × 100%
```

**Resultado gerado:**
- Métrica de produtividade por etapa
- Percentual de variação (positivo = acima da meta)

### 5.2 Comparativo Planejado vs Realizado

**Localização:** `PlannedProductionTab.tsx`, `PlannedVsActualView.tsx`

**Dados de entrada:**
- `planned_productions` (metas)
- `weekly_productions` (execução, excluindo is_initial_database)

**Lógica:**
- Agrupa por período (semana) e escopo
- Compara `planned_houses` com `houses_count` real
- Calcula desvio absoluto e percentual

**Resultado gerado:**
- Lista de desvios por período/escopo
- Registro de motivos em `production_deviations`

### 5.3 Projeção de Data de Término

**Localização:** `usePlanningCalculations.ts`

**Dados de entrada:**
- Cronograma de etapas calculado
- Produtividade real (se disponível)
- Variância média das etapas

**Lógica:**
```
Data Projetada = max(data_fim_etapas) + ajuste_variancia

Se variância < -15%:
  ajuste = dias_restantes × (variância / 100)
```

**Resultado gerado:**
- `projectedEndDate` exibido no dashboard

### 5.4 Indicadores de Desvio (Painel Diretoria)

**Localização:** `BoardDecisionsView.tsx`

**Dados de entrada:**
- Produção das últimas 4 semanas
- Planejamento das últimas 4 semanas
- Progresso atual das casas
- Dias restantes até o prazo

**Lógica de detecção de riscos:**

1. **Produção abaixo da meta:**
   - Se execução < 70% do planejado → alerta de produtividade

2. **Risco de atraso:**
   - Se progresso_esperado - progresso_real > 10% → alerta de prazo

3. **Casas paradas:**
   - Se last_update > 14 dias atrás → alerta de unidades paradas

4. **Gap de conclusão:**
   - Se dias_restantes < 60 e progresso < 80% → alerta crítico

**Resultado gerado:**
- Lista de decisões críticas priorizadas por severidade
- Simulações de cenário com impacto calculado

### 5.5 Cálculo de Custos por Medição

**Localização:** `ProjectCostsView.tsx`

**Dados de entrada:**
- `scope_costs` (custo unitário por escopo)
- `planned_productions` (casas planejadas por escopo)

**Lógica:**
```
Para cada medição:
  Para cada escopo planejado:
    custo_escopo = casas × (custo_material + custo_mao_obra + custo_equipamento)
  total_medicao = Σ custo_escopo
```

**Resultado gerado:**
- Custo projetado por medição
- Curva ABC por categoria (material, mão de obra, equipamento)
- Custo total do projeto

---

## 6. DEPENDÊNCIAS CRÍTICAS

### 6.1 Dependências entre Módulos

| Módulo Dependente | Depende De | Tipo de Dependência |
|-------------------|------------|---------------------|
| Produção Semanal | Planejamento Semanal | Opcional (pode lançar avulso) |
| Custos da Obra | Planejamento Semanal | Necessário para custo por medição |
| Painel Diretoria | Planejamento + Produção | Necessário para análise de desvio |
| Planejamento Inteligente | Template de Macros | Necessário (onboarding) |
| Gráficos | Casas com progresso | Necessário |
| Mapas 2D/3D | Casas + Quadras | Necessário |
| Suprimentos | Contratos de Mão de Obra | Opcional (usa produção para executado) |

### 6.2 Pontos de Inconsistência Potencial

1. **Exclusão de medição sem limpar produções:**
   - Produções ficam órfãs (measurement_id não encontrado)
   - Solução: Queries devem tratar measurement_id nulo ou inexistente

2. **Alteração do template de macros:**
   - Casas existentes ficam dessincronizadas
   - Solução: Sistema sincroniza automaticamente no carregamento (preservando progresso)

3. **Duplicidade de dados entre tabelas:**
   - `productions` vs `weekly_productions`
   - `measurement_services` vs `planned_productions`
   - Solução: Manter ambas até migração completa, priorizar tabelas novas

4. **Exclusão de casa sem atualizar quadra:**
   - house_ids na quadra pode referenciar casa inexistente
   - Solução: Validar integridade antes de operações

### 6.3 Fontes de Verdade

| Dado | Fonte de Verdade | Tabelas Derivadas |
|------|------------------|-------------------|
| Progresso da casa | `houses.macros` | Nenhuma |
| Produção real | `productions` | `weekly_productions` (legado) |
| Planejamento de medição | `measurements` + `measurement_services` | `planned_productions` (legado) |
| Cronograma inteligente | `planning_stages` + `planning_teams` | `planning_baselines` (snapshot) |
| Diário de obra | `daily_work_logs` | Nenhuma |
| Decisões gerenciais | `board_decisions` | Nenhuma |
| Custos unitários | `scope_costs` | Nenhuma |
| Template de serviços | `projects.macros_template` | `houses.macros` (cópia por casa) |

### 6.4 Operações que Exigem Cascata

| Operação | Cascata Necessária |
|----------|-------------------|
| Excluir projeto | quadras, houses, measurements, measurement_services, productions, planned_productions, planning_stages, planning_teams, daily_work_logs, planning_alerts, planning_baselines, scope_costs, financial_entries, board_decisions, map_layouts |
| Excluir quadra | Atualizar houses.quadra_id para null |
| Excluir medição | measurement_services |
| Excluir etapa de planejamento | planning_teams (da etapa), daily_work_logs (da etapa) |
| Alterar template de macros | Sincronizar houses.macros (automático no load) |

---

## Glossário

| Termo | Definição |
|-------|-----------|
| **Macro** | Etapa principal da obra (ex: Estrutura, Cobertura, Instalações) |
| **Escopo** | Serviço específico dentro de um macro (ex: Radier, Paredes, Telha) |
| **Medição** | Período de apuração de produção |
| **Produtividade** | Unidades concluídas por dia por equipe |
| **Baseline** | Versão congelada do planejamento para comparação |
| **Linha de Balanço** | Gráfico que mostra ritmo de produção por etapa ao longo do tempo |
| **Gantt** | Cronograma visual com barras representando duração de etapas |
| **Cadastro Inicial** | Registro de trabalho já concluído antes do uso do sistema |

---

*Documento gerado automaticamente para fins de documentação técnica.*
