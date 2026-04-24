# Manual do Usuário — ObraMap

> **Sobre este manual.** Este é o guia oficial de uso do **ObraMap — Sistema de Gestão de Obras**. Ele documenta todos os módulos, regras de negócio, permissões e fluxos diários, com foco em construtoras, holdings e empresas que executam projetos por unidade habitacional, m², m³, verbas ou outras unidades de produção. Mantenha-o como referência viva: ele é atualizado a cada release.

---

## Sumário

1. Conceitos gerais
2. Hierarquia, perfis e permissões
3. Holding — Portfólio e visão executiva
4. Cadastro de obras
5. Mapa do portfólio
6. Medições PLE — ciclo completo
7. Receitas — Previsão e Programação
8. Despesas — Regras e fechamento
9. Documentos da obra
10. Aditivos contratuais
11. Histórico e auditoria
12. PRD — Matriz Previsto x Realizado x Despesas
13. Insights de IA
14. Notificações e alertas
15. ObraMap (módulo de execução)
   - Cadastro de empreendimento, casas, quadras
   - Macros, escopos e unidades de produção
   - Planejamento estratégico (períodos)
   - Planejamento de longo prazo
   - Planejamento semanal
   - Produção e diário de obras
   - Clima, pluviometria e dias praticáveis
   - Histórico unificado
16. Suprimentos e Painel de Compras
17. Empreiteiros e contratos
18. Industrialização (paredes pré-fabricadas)
19. Produtividade e equipes
20. Simulador de desembolsos
21. Configurações e governança
22. Modo offline
23. Boas práticas para o primeiro uso

---

## 1. Conceitos gerais

### 1.1 Multi-tenant
Cada empresa (construtora) é um **tenant** independente. Toda informação — obras, medições, usuários, despesas — é isolada por `company_id`. O sistema usa políticas de acesso a nível de banco para garantir esse isolamento.

### 1.2 Camadas do sistema
- **Holding** — visão executiva consolidada do portfólio. Painéis de saúde, financeiro, mapa.
- **ObraMap (execução)** — operação diária de cada obra individualmente: planejamento, produção, diário, suprimentos.
- **Holding ↔ ObraMap** — vínculo opcional. Uma obra cadastrada na Holding pode ser linkada a um projeto operacional do ObraMap. Quando ligada, o **% físico** da obra é atualizado em tempo real pelo ObraMap.

### 1.3 Unidades de produção
A produção pode ser medida em:
- **Casas / Unidades habitacionais (UH)** — padrão histórico
- **m²** (área), **m³** (volume), **R$** (verba), **%** (percentual de etapa)
- **Unidade customizada por serviço** — cada serviço pode ter sua própria unidade

A meta total da obra (`production_target`) define o denominador para o cálculo de % físico. Sem meta, o sistema usa o nº de UH.

### 1.4 Status de obra
| Status | Significado |
|---|---|
| **Não Iniciada** | Cadastrada, ainda sem mobilização |
| **Em Andamento** | Mobilizada e produzindo |
| **Paralisada** | Suspensa temporariamente |
| **Concluída** | Entregue / encerrada |

---

## 2. Hierarquia, perfis e permissões

### 2.1 Níveis hierárquicos
- **System Admin** — operação do próprio ObraMap (atendimento, suporte). Acesso global a todas as empresas. Não confundir com Admin de Empresa.
- **Admin de Empresa** — donos / diretores da construtora. Cadastra usuários, libera módulos, governa a operação.
- **Editor** — engenheiros, planejadores, residentes. Operam o sistema no dia a dia.
- **Visualizador** — diretoria, board, investidores. Apenas leitura.

### 2.2 Permissões granulares
Cada usuário pode ter permissões liberadas por **módulo** e por **ação** (ler, criar, editar, aprovar, excluir). A liberação segue uma hierarquia:

```
Permissão Individual > Permissão de Departamento > Padrão do Perfil
```

Permissões de ação ficam armazenadas em campo JSONB `permissoes_acao`. Cada submódulo da Holding (Receitas, Despesas, Documentos, PRD, Insights) é um item independente que precisa ser liberado.

### 2.3 Departamentos
Usuários podem ser agrupados em departamentos (ex.: "Engenharia", "Financeiro", "Compras"). O admin define o pacote de permissões padrão do departamento e novos usuários herdam automaticamente.

### 2.4 Module guards
Os módulos podem ser desligados em três níveis (do mais amplo para o mais granular):

1. **Sistema (System Admin)** — desliga o módulo para a empresa toda.
2. **Empresa (Admin)** — pode desabilitar módulos pagos por escolha estratégica.
3. **Obra (Project Modules)** — desabilita o módulo apenas em uma obra específica (ex.: obra X não usa Suprimentos).

A regra é restritiva: se qualquer nível negar, o módulo aparece bloqueado para o usuário.

---

## 3. Holding — Portfólio e visão executiva

### 3.1 Painel da Holding (`/holding-portfolio`)
Centraliza todas as obras do portfólio em uma visão executiva com:

- **10 KPIs reativos** (cobertos por testes automatizados):
  - Total de obras, em andamento, atrasadas
  - Valor total contratado, faturado, a faturar
  - IDC consolidado (Índice de Dias Praticáveis)
  - Saúde do portfólio (semáforo)
- **Filtros**: empresa, município, status, semáforo
- **Mapa interativo** com clusters por cidade
- **Lista de obras** ordenada por data de início

### 3.2 Semáforo de saúde
Cada obra recebe uma cor com base em IDC e regras de negócio:

| Cor | Regra |
|---|---|
| 🟢 Verde | No prazo, medições em dia, documentação completa |
| 🟡 Amarelo | Atraso moderado ou documentação parcial |
| 🔴 Vermelho | Atraso crítico, medições atrasadas ou documentação incompleta |

### 3.3 Drawer de detalhes da obra
Acessado clicando em uma obra na lista. Possui abas:

- **Resumo** — KPIs financeiros, linha do tempo do contrato, analytics
- **Reprogramação** — alterações de previsão de medição
- **Restrições** — bloqueadores (Material, Mão de Obra, Projeto, Documentação)
- **Aditivos** — alterações contratuais
- **Documentos** — checklist da obra
- **Histórico** — linha do tempo de eventos

---

## 4. Cadastro de obras

### 4.1 Campos obrigatórios
- Nome da obra
- Status
- Valor do contrato

### 4.2 Campos recomendados
- Empresa, município, estado, UH
- Data de início, prazo (dias), tipo de contrato
- Responsáveis: **Engenheiro Residente**, **Coordenador**, **Planejador** (com telefone para alertas WhatsApp)
- `production_target` — meta total quando a unidade não for "casa" (m², R$, %)

### 4.3 Campo especial — "Valor já faturado fora do sistema"
Visível apenas para administradores quando o status é "Em Andamento". Representa execução financeira medida **antes da entrada no ObraMap**. É usado exclusivamente para o cálculo de saldo a faturar e percentual financeiro — não aparece nos relatórios de receitas.

### 4.4 Geocodificação automática
Ao salvar a obra, o sistema busca automaticamente as coordenadas (lat/lng) via API Nominatim/OpenStreetMap a partir de município e estado. Se a busca falhar, o admin pode ajustar manualmente.

### 4.5 Vínculo com ObraMap
Quando o admin liga a obra a um projeto ObraMap (`obramap_project_id`), o painel passa a mostrar `🔒 ObraMap` no campo **% físico**, sinalizando que aquele indicador é alimentado em tempo real pela execução, não mais por edição manual.

---

## 5. Mapa do portfólio

- **OpenStreetMap** com marcadores coloridos por saúde da obra
- **Sede da empresa** marcada com "S" em azul
- **Cluster por cidade** quando há 2+ obras nas mesmas coordenadas — clique no cluster para abrir popup com a lista
- **Distância e tempo até a sede** estimados por fórmula de Haversine (linha reta)
- **Lista lateral** agrupando obras por município

---

## 6. Medições PLE — ciclo completo

Toda medição segue **5 estados sequenciais**, sem saltos:

### 6.1 Saldo Inicial
Medição de governança imutável criada quando a obra já tem execução prévia ao ObraMap. Não aparece em relatórios de receitas e não pode ser editada.

### 6.2 Prevista
- Status inicial. Contém valor previsto, data de previsão, mês/ano de referência.
- "Em Andamento" é status visual: medição cuja janela engloba a data atual.
- Se a janela vencer e a medição continuar "prevista", vira **"Atrasada"** e libera atalhos de notificação por WhatsApp.

### 6.3 Enviada
Requer data de envio + valor da medição > 0. Representa a medição formalmente entregue ao contratante.

### 6.4 Aprovada (Acatada)
- Requer data de aprovação + valor acatado > 0 + valor acatado ≤ valor da medição.
- O **valor acatado é a fonte de verdade financeira**.
- Após aprovação o percentual financeiro da obra é recalculado automaticamente.

### 6.5 Recebido (NF)
Requer data de pagamento. Representa o pagamento efetivamente recebido.

### 6.6 Validações automáticas
- Datas devem ser cronologicamente consistentes (envio < aprovação < pagamento)
- Valor acatado nunca excede valor da medição
- Soma das medições não pode ultrapassar o valor do contrato + aditivos aprovados

### 6.7 Reprogramação de previsões
Usuários com a permissão `lancar_medicoes` podem **reprogramar previsões de medição** sem perder o histórico — o sistema arquiva o valor anterior em log.

---

## 7. Receitas — Previsão e Programação

### 7.1 Aba Previsão
Mês a mês mostra valores previstos, pendentes e número de obras com medição no período.

### 7.2 Aba Programação Financeira
Projeção semana a semana de até **15 meses** de faturamento e fluxo de caixa, com regra de deduplicação para garantir que cada medição é contabilizada uma única vez.

### 7.3 Coluna Desvio
- **Desvio = Valor Acatado − Valor Previsto**
- Aparece somente para medições aprovadas (com `valor_acatado > 0`)
- Positivo: contratante aprovou mais que o previsto
- Negativo: glosa (acatou menos)

### 7.4 KPI Total Geral
Considera todas as medições conforme status:
- Aprovadas → `valor_acatado` (fonte de verdade)
- Enviadas → `valor_medicao`
- Previstas → `valor_previsto_medicao`

### 7.5 Filtro por empresa
Disponível no cabeçalho. Filtra todas as abas simultaneamente.

---

## 8. Despesas — Regras e fechamento

### 8.1 Vínculo obrigatório
Toda despesa é vinculada a uma medição. Não existem despesas "soltas".

### 8.2 Tipos
- **Prevista** — medição não aprovada → projeção de gasto
- **Real** — medição aprovada → custo efetivamente incorrido

### 8.3 Fechamento automático
- 7 dias após o acatamento da medição, o sistema gera alerta no sino solicitando o fechamento.
- Estados: `nao_iniciado` → `em_fechamento` → `fechado`.

### 8.4 Bloqueio pós-fechamento
- Despesa bloqueada para edição.
- Editores devem solicitar desbloqueio ao admin (botão dedicado).
- Admin desbloqueia diretamente.

### 8.5 Exclusão
- Admin pode excluir qualquer despesa (com confirmação)
- Editor só exclui despesas não bloqueadas que ele próprio criou

---

## 9. Documentos da obra

### 9.1 Categorias
- **Pré Obra** — ATA, OIS, ART, CNO, etc.
- **Ensaios e Projetos** — Sondagem SPT, Planta de Localização, etc.

### 9.2 Funcionalidades
- Upload de arquivos (PDF, imagens, planilhas — máx. 20 MB)
- Download por URL assinada (expira em 1h)
- Checklist com toggle concluído/pendente
- **Modo Edição (admin)**: renomear categorias, excluir documentos com confirmação mostrando quantos arquivos serão removidos

### 9.3 Persistência das exclusões
Exclusões manuais ficam registradas em uma tabela dedicada para sobreviver a recargas e migrações.

---

## 10. Aditivos contratuais

Registros de alteração contratual que afetam:
- **Prazo** — dias adicionais
- **Valor** — valor adicional ao contrato
- **Supressão** — valor deduzido do contrato

### Status
- **Pendente** — em análise
- **Aprovado** — formalizado

O sistema totaliza automaticamente os aditivos em colunas persistidas (`aditivo_prazo_total`, `aditivo_valor_total`) para evitar recalcular em toda análise.

---

## 11. Histórico e auditoria

### 11.1 Trigger universal de auditoria
Todas as alterações em tabelas críticas disparam um trigger `fn_audit_log` que grava `dados_anteriores` e `dados_novos` em formato JSONB. Cada registro contém autor, data/hora, tabela, ação (INSERT/UPDATE/DELETE).

### 11.2 Aba Histórico da obra
Disponível no drawer da obra na Holding e dentro do módulo Produção. Lista:
- Cadastro e edições de obra
- Documentos (upload, exclusão, renomeação)
- Despesas (criação, fechamento, desbloqueio)
- Medições (envio, aprovação, edição)
- Aditivos
- Diário de obras

### 11.3 Histórico em Produção (ObraMap)
Foi unificado em uma única aba **Histórico** que mostra:
- O log completo de eventos (timeline rica com filtros por módulo e período)
- Para administradores: bloco extra de **exclusões e correções manuais** com justificativas

---

## 12. PRD — Matriz Previsto x Realizado x Despesas

Matriz por obra que cruza:
- **Previsto** — projeção de receita por mês
- **Realizado** — medições efetivamente acatadas
- **Despesas** — custos reais incorridos

### Hierarquia de previsão
1. Lançamentos de medição na obra (mais confiável)
2. Distribuição do planejamento de longo prazo
3. Curva-S padrão da empresa

A distribuição de receita do planejamento de longo prazo segue regra explícita (documentada em `mem://logic/holding-prd-revenue-distribution`).

---

## 13. Insights de IA

A Edge Function `holding-insights` integra com o Claude da Anthropic para gerar relatórios executivos em linguagem natural:
- Análise de saúde do portfólio
- Identificação de obras em risco
- Sugestões de ação

**Importante:** a chave da API fica armazenada em secret no servidor e nunca é exposta ao frontend.

---

## 14. Notificações e alertas

Ícone de sino disponível em todas as páginas (mobile inclusive).

| Tipo | Descrição |
|---|---|
| Despesa pendente | Medição aprovada sem despesas vinculadas |
| Medição aprovada | Nova medição aprovada precisa de despesas reais |
| Fechamento | 7 dias desde o acatamento |
| Restrição financeira | Bloqueador identificado em uma obra |
| Edição solicitada | Editor pediu desbloqueio de despesa |

Notificações resolvidas desaparecem automaticamente.

---

## 15. ObraMap — módulo de execução

### 15.1 Cadastro de empreendimento
- Nome, empresa, município, total de UH
- Definição de **macros** (etapas) e **escopos** (serviços)
- Cada serviço pode ter sua própria **unidade** (m², m³, R$, %, un, customizado)
- `production_target` por obra define a meta total

### 15.2 Casas, quadras e estrutura física
- Cadastro individual de casas com numeração e quadra
- Mapa interativo das casas (grid visual)
- Edição em massa via diálogos dedicados
- Suporte a Map3D com camadas (modelos federados)

### 15.3 Macros, escopos e pesos
- Macros têm cor própria
- Escopos podem ter pesos (peso financeiro/produtivo)
- Importação de pesos a partir do orçamento
- Importação de macros e escopos via planilha

### 15.4 Planejamento estratégico (períodos)
- Definição de **períodos de medição** (ex.: PLE 1, PLE 2)
- Para cada período, atribuição de serviços por escopo
- Quantidades planejadas (na unidade do serviço)
- Sincronização atômica via RPC `apply_structure_mutation` (Hard Delete na alteração de estrutura)

### 15.5 Planejamento de longo prazo
- Visão Gantt estratégica baseada no escopo executivo
- Curva-S
- Projeção de mão de obra por trimestre

### 15.6 Planejamento semanal
- Ciclo de vida: **Rascunho → Aprovada → Liberada → Concluída**
- Alocação de empreiteiros é obrigatória antes de fechar a medição
- Importação a partir do período estratégico

### 15.7 Produção
- Aba **Registrar** — lançamento por casa/escopo/macro
- Aba **Do Diário** — produção que veio do RDO
- Aba **Análise** — sub-abas: Evolução, **Clima e dias praticáveis**, Alertas
- Aba **Histórico** — auditoria completa + correções manuais (admin)

A produção pode ser registrada em quantidade (m², R$ etc.) ou por casas selecionadas, conforme a unidade do serviço.

### 15.8 Diário de obras (RDO)
Estrutura modular com seções:
- **Detalhes** — data, equipe presente (calculada automaticamente a partir de mão de obra)
- **Clima** — manhã, tarde, noite (3 turnos), com classificação claro/nublado/chuvoso e condição praticável/impraticável
- **Mão de obra** — categoria (própria/terceirizada) e quantidade
- **Equipamentos**
- **Atividades programadas**
- **Produção** — serviços executados com percentuais e casas atendidas
- **Ocorrências** — com tags para análise
- **Checklist** — ítens personalizados
- **Comentários, fotos, vídeos, anexos**
- **Aprovação** — fluxo Preenchendo → Em Revisão → Aprovado

### Recursos do RDO

- **Pré-preenchimento de clima via API Open-Meteo** — quando a obra tem coordenadas, o sistema busca automaticamente o clima e a pluviometria do dia.
- **Confirmação obrigatória de pluviometria no envio** — antes de despachar para aprovação, o sistema mostra o valor da API e permite o residente substituir pelo medido no canteiro.
- **Importar dia anterior** — botão que copia mão de obra, equipamentos, atividades e a lista de serviços (sem percentuais) do último diário até 14 dias atrás. Seções já preenchidas hoje não são sobrescritas. Dispara apenas para residentes do dia atual e exige confirmação.
- **Solicitação de edição** — editor pode pedir desbloqueio temporário (24h) de RDO já aprovado. Admin aprova ou rejeita.
- **Modo offline** — diário é gravado localmente e sincronizado quando a conexão volta.

### 15.9 Clima, pluviometria e dias praticáveis
A aba **Análise → Clima e dias praticáveis** consolida os RDOs do período (7, 30, 90, 180, 365 dias) e mostra:

- **KPIs**: dias reportados, praticáveis, impraticáveis, chuvosos, chuva acumulada (mm), IDC (% praticável)
- **Gráfico composto** — barras de mm/dia + linha acumulada
- **Distribuição** — pizza praticáveis x impraticáveis x chuvosos
- **Resumo** — sol pleno, média de chuva, maior chuva em um dia, cobertura do período

Esses indicadores alimentam a discussão de **compensação contratual de prazo por chuva** e a análise de produtividade x clima.

### 15.10 Histórico unificado
A aba Histórico foi consolidada — antes havia duas abas (Histórico e Obra). Agora há uma só, com a timeline completa por padrão e, para administradores, um bloco adicional listando exclusões e correções manuais com justificativas.

---

## 16. Suprimentos e Painel de Compras

### 16.1 Painel de Compras (`/purchase-panel`)
Fonte primária: tabela `supply_requests`. Fornece KPIs de:
- Solicitações abertas, em cotação, em compra
- Lead time esperado x realizado
- Alertas categorizados (Material vs Mão de Obra)

### 16.2 Lead time
Configurado globalmente no painel, distinguindo:
- **Materiais** — prazo médio do fornecedor
- **Mão de Obra / Serviços** — prazo de mobilização do empreiteiro

### 16.3 Catálogo mestre de insumos
- Códigos únicos e imutáveis por categoria (ex.: MAT-000001, MO-000001)
- Sincronização entre obras
- Importação via planilha

### 16.4 Estoque
A entrada de quantidades em estoque foi **centralizada** em uma tela dedicada para garantir integridade. Diálogos de cadastro de insumos não permitem entrada de saldo direto.

---

## 17. Empreiteiros e contratos

### 17.1 Cadastro
- Dados do empreiteiro + dados bancários / PIX
- Vinculação de contratos por obra

### 17.2 Contratos
- Vínculo a serviços específicos
- Medição por contrato (tabela própria)
- Mapa de casas alocadas ao empreiteiro

### 17.3 Medições do empreiteiro
- Independente da medição PLE (cliente x construtora)
- Fluxo paralelo para fechar pagamentos a empreiteiros

---

## 18. Industrialização (paredes pré-fabricadas)

Módulo dedicado para construtoras que usam sistema construtivo pré-fabricado.

### Submódulos
- **Visão Geral** — KPIs do projeto industrial
- **Planejamento** — grade Gantt por lote
- **Lotes** — agrupamento de UH para fabricação
- **Logística** — remessas de fábrica para canteiro
- **Içamento** — controle de içamentos diários
- **Montagem** — controle de instalação no canteiro

### Modos
- **Integrado** — todo o fluxo é controlado pelo módulo
- **Standalone** — empresa só usa o módulo para acompanhar; o registro de "instalado" é informativo e não atualiza progresso da obra

### Restrições
- Não é permitido excluir períodos com produção lançada
- Não é permitido excluir lotes com remessa criada

---

## 19. Produtividade e equipes

Módulo `/productivity` que centraliza:
- Produtividade base por serviço (un/dia ou m²/h)
- Dimensionamento da equipe necessária para cumprir cronograma
- Comparativo planejado x realizado de produtividade

---

## 20. Simulador de desembolsos

`/cashflow-simulator` projeta parcelas financeiras cruzando:
- Planejamento de longo prazo (cronograma)
- Configuração de fornecedores e prazos de pagamento

Aba **Calendário** com cards diários (badges quadrados, destaque do dia atual) e barras de fluxo dinâmicas.

---

## 21. Configurações e governança

### 21.1 Minha Empresa
- Dados cadastrais
- Logo
- Sede (lat/lng)
- Configurações de WhatsApp e e-mail

### 21.2 Tipos de contrato
Definição dos tipos suportados (Empreitada, Administração, Mista) com regras próprias.

### 21.3 Regras de notificação
Configura limites e disparos automáticos.

### 21.4 Categorias financeiras
- Categorias e subcategorias de despesa
- Tipos de fornecedor
- Tipos de mão de obra

### 21.5 Backup do banco
Edge Function `backup-database` gera dump completo sob demanda. Acesso restrito a admin.

### 21.6 Configuração de auth
- Autenticação por senha (padrão)
- Login com Google (opcional)
- Sessões com captura de IP, dispositivo, localização

---

## 22. Modo offline

O ObraMap funciona offline para o módulo Diário de Obras:

- Dados são gravados em IndexedDB local
- Fila de sincronização processa mudanças quando a conexão volta
- Anexos (fotos, vídeos) ficam no IndexedDB até envio
- Banner de status mostra: Online / Offline / Sincronizando
- Página `/diario-offline-queue` lista pendências

---

## 23. Boas práticas para o primeiro uso

### Dia 1 — Configuração
1. Cadastre sua empresa e a sede
2. Crie departamentos e usuários iniciais
3. Libere os módulos contratados
4. Cadastre tipos de contrato e categorias financeiras

### Dia 2 — Cadastro de obras
1. Cadastre a primeira obra com todos os campos recomendados
2. Vincule o engenheiro residente, coordenador e planejador
3. Faça upload dos documentos pré-obra (mínimo 3)
4. Cadastre o contrato e seus serviços

### Dia 3 — Planejamento
1. Defina macros e escopos do empreendimento
2. Cadastre as casas / unidades
3. Crie o planejamento estratégico (períodos)
4. Defina a unidade de produção por serviço

### Dia 4 — Operação
1. Crie a primeira medição PLE (Prevista)
2. Lance o primeiro RDO confirmando clima e equipe
3. Use **Importar dia anterior** a partir do segundo dia
4. Faça os primeiros lançamentos de produção

### Semanal
- Revise notificações pendentes
- Aprove RDOs do residente
- Atualize previsões de medição se necessário
- Confira o painel de Clima e Dias Praticáveis

### Mensal
- Feche as despesas das medições aprovadas
- Revise o PRD
- Gere insights de IA para a diretoria
- Reveja os documentos pendentes

---

## Apêndice A — Glossário

| Termo | Significado |
|---|---|
| **PLE** | Planilha de Levantamento de Eventos (medição) |
| **RDO** | Relatório Diário de Obras (= Diário) |
| **UH** | Unidade Habitacional |
| **IDC** | Índice de Dias Praticáveis |
| **Acatado** | Valor que o contratante efetivamente aprovou |
| **Aditivo** | Alteração contratual de prazo ou valor |
| **Macro** | Etapa construtiva (ex.: Fundação, Alvenaria) |
| **Escopo** | Serviço dentro de uma macro |
| **Saldo Inicial** | Medição imutável de execução prévia ao ObraMap |

---

## Apêndice B — Suporte e contato

- **Domínio**: https://obramap.app.br
- **App**: https://obramap.lovable.app
- **Desenvolvedor**: Felipe Langmantel

Para sugestões, reporte de bugs ou solicitações de novos módulos, contate o administrador da sua empresa, que poderá escalar ao time do ObraMap.

---

*ObraMap — Sistema de Gestão de Obras © 2024-2026. Todos os direitos reservados.*
