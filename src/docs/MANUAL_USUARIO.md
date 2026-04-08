# Manual do Usuário — ObraMap

## 1. Módulo Holding — Visão Geral do Portfólio

O ObraMap é um sistema de gestão de obras voltado para construtoras e holdings com múltiplos empreendimentos. O **Painel da Holding** centraliza todas as obras do portfólio em uma visão executiva, com indicadores de saúde (semáforo), progresso financeiro e alertas críticos.

### Semáforo de Saúde
- 🟢 **Verde (Sob controle):** obra no prazo, medições em dia, documentação completa.
- 🟡 **Amarelo (Atenção):** atrasos moderados ou documentação incompleta.
- 🔴 **Vermelho (Crítico):** atrasos graves, medições pendentes ou problemas financeiros.

---

## 2. Cadastro de Obras

### Campos obrigatórios
- **Nome da obra**
- **Status:** Em Andamento, Não Iniciada, Concluída ou Paralisada
- **Valor do contrato**

### Campos recomendados
- Empresa, Município, Estado, UH (unidades habitacionais)
- Data de início, Prazo (dias), Tipo de contrato
- Responsáveis: Engenheiro, Coordenador, Planejador (com telefones para alertas WhatsApp)

### Campo especial: "Valor já faturado fora do sistema"
Visível apenas para administradores quando o status é "Em Andamento". Representa a execução financeira medida antes da entrada no ObraMap. É usado exclusivamente para calcular o saldo a faturar e o percentual financeiro — **não aparece nos relatórios de receitas**.

### Regras
- Obras são ordenadas por data de início (mais antigas primeiro); obras "Não Iniciada" aparecem por último.
- A busca é insensível a acentos (ex: "Dois Irmaos" encontra "Dois Irmãos").

---

## 3. Medições PLE — Ciclo Completo

O ciclo de vida de uma medição segue **4 etapas obrigatórias**, sem pular passos:

### 3.1 Saldo Inicial
Medição especial criada automaticamente quando a obra já possui execução prévia. Representa o valor já faturado antes do ObraMap. Não aparece nos relatórios de receitas.

### 3.2 Prevista
- Status inicial de toda medição cadastrada.
- Contém: valor previsto, data de previsão, mês/ano de referência.
- **"Em Andamento"** é um status visual (não armazenado) — atribuído à medição cujo intervalo de previsão engloba a data atual.
- Se a data de previsão expira e a medição permanece "prevista", ela assume o status **"Atrasada"** (alerta vermelho), habilitando links de WhatsApp para notificar os responsáveis.

### 3.3 Enviada
- Requer: data de envio + valor da medição > 0.
- Representa a medição formalmente enviada ao contratante.

### 3.4 Aprovada (Acatada)
- Requer: data de aprovação + valor acatado > 0 + valor acatado ≤ valor da medição.
- **O valor acatado é a fonte de verdade financeira.** É o valor efetivamente aprovado pelo contratante, podendo ser menor que o solicitado.
- Após aprovação, o percentual financeiro da obra é recalculado automaticamente.

### 3.5 Recebido (NF)
- Requer: data de pagamento.
- Representa o pagamento efetivamente recebido.

### Validações
- Datas devem ser cronologicamente consistentes (envio < aprovação < pagamento).
- Valor acatado nunca pode exceder o valor da medição.

---

## 4. Despesas — Regras de Negócio

### Vínculo obrigatório
Toda despesa é obrigatoriamente vinculada a uma medição. Não existem despesas "soltas".

### Tipos
- **Prevista:** vinculada a medição não aprovada. Representa projeção de gasto.
- **Real:** vinculada a medição aprovada. Representa custo efetivamente incorrido.

### Fechamento automático
- Após **7 dias** do acatamento de uma medição, o sistema gera um alerta (notificação no sino) solicitando o fechamento das despesas vinculadas.
- A despesa muda de status: `nao_iniciado` → `em_fechamento` → `fechado`.

### Bloqueio pós-fechamento
- Após o fechamento, a despesa é **bloqueada** para edição.
- **Editores** devem solicitar desbloqueio ao administrador através do botão de solicitação.
- **Administradores** podem desbloquear diretamente.

### Exclusão
- Administradores podem excluir qualquer despesa (com confirmação).
- Editores só podem excluir despesas não bloqueadas que eles criaram.

---

## 5. Sistema de Notificações (Sino)

O ícone de sino está disponível no cabeçalho de todas as páginas, inclusive no mobile.

### Tipos de Alertas
| Tipo | Descrição |
|------|-----------|
| ⚠️ Despesa pendente | Medição aprovada sem despesas vinculadas |
| ✅ Medição aprovada | Nova medição aprovada que precisa de despesas reais |
| 📄 Fechamento | Prazo de 7 dias expirado — despesas precisam ser fechadas |

### Como resolver pendências
1. Clique na notificação para ir diretamente à página de Despesas.
2. Localize a obra e medição indicadas.
3. Cadastre ou feche as despesas conforme o tipo de alerta.
4. Notificações resolvidas desaparecem automaticamente.

---

## 6. Documentos da Obra

Cada obra possui duas categorias de documentação:
- **Pré Obra:** ATA, OIS, ART, CNO, etc.
- **Ensaios e Projetos:** Sondagem SPT, Planta de Localização, etc.

### Funcionalidades
- Upload de arquivos (PDF, imagens, planilhas — máx. 20MB).
- Download via URL assinada (segurança por tempo limitado).
- Checklist com toggle de status (concluído/pendente).

### Modo Edição (somente admin)
Administradores podem ativar o "Modo Edição" para:
- Renomear documentos.
- Excluir documentos e todos os arquivos anexados (com confirmação mostrando quantos arquivos serão removidos).

---

## 7. Aditivos de Contrato

Aditivos são registros de alterações contratuais que afetam:
- **Prazo:** dias adicionais ao prazo original.
- **Valor:** valor adicional ao contrato.
- **Supressão:** valor deduzido do contrato.

### Status
- **Pendente:** aditivo em análise.
- **Aprovado:** aditivo formalmente aprovado.

O sistema totaliza automaticamente os dias e valores aditivados, ajustando o prazo e valor total da obra.

---

## 8. Histórico de Movimentações

A aba Histórico registra **todas** as alterações feitas na obra, incluindo:

| Módulo | Ações registradas |
|--------|-------------------|
| 🏗️ Obra | Cadastro, edição de dados |
| 📄 Documentos | Upload, exclusão de arquivos, edição de nomes |
| 💰 Despesas | Criação, edição, exclusão, fechamento, desbloqueio |
| 📊 Medições | Criação, envio, aprovação, edição de valores |
| 📋 Aditivos | Criação, exclusão |

Cada registro mostra: autor, data/hora, descrição da ação e badge do módulo.

---

## 9. Painel de Receitas — Previsão e Programação

### Aba Previsão
Mostra mês a mês os valores previstos, pendentes e o número de obras com medição no período.

### Aba Programação
Detalha semana a semana o fluxo de recebimentos esperados baseado nas datas de previsão das medições.

### Coluna Desvio
- **Desvio = Valor Acatado − Valor Previsto**
- O desvio **só aparece** para medições aprovadas (onde `valor_acatado > 0`).
- Medições previstas ou enviadas não possuem desvio — o campo mostra "—".
- Desvio positivo: o contratante aprovou mais que o previsto.
- Desvio negativo: o contratante acatou menos que o previsto (glosa).

### Total Geral (KPI)
O Total Geral considera todas as medições conforme seu status:
- **Aprovadas:** usa `valor_acatado` (fonte de verdade).
- **Enviadas:** usa `valor_medicao`.
- **Previstas:** usa `valor_previsto_medicao`.

### Filtro por empresa
Disponível no cabeçalho da página, filtra todas as abas simultaneamente.

---

## 10. Mapa do Portfólio

### Visualização
- Mapa interativo (OpenStreetMap) com marcadores coloridos por saúde da obra.
- A sede da empresa é marcada com "S" em azul.
- Distância e tempo estimado até a sede são calculados via fórmula de Haversine (linha reta).

### Agrupamento por cidade
- Quando 2+ obras estão na mesma cidade, um cluster circular mostra a quantidade.
- Ao clicar no cluster, um popup lista todas as obras — clique em qualquer uma para abrir detalhes.

### Lista lateral
- Obras agrupadas por município, com contagem e valor total.
- Clique no município para centralizar o mapa naquela região.

---

## 11. Permissões: Admin vs Editor vs Visualizador

| Capacidade | Admin | Editor | Visualizador |
|-----------|-------|--------|--------------|
| Cadastrar/editar obras | ✅ | ✅ | ❌ |
| Excluir obras | ✅ | ❌ | ❌ |
| Cadastrar medições | ✅ | ✅ | ❌ |
| Aprovar medições | ✅ | ✅ | ❌ |
| Cadastrar despesas | ✅ | ✅ | ❌ |
| Desbloquear despesas | ✅ | ❌ (solicita) | ❌ |
| Excluir despesas | ✅ | Somente desbloqueadas | ❌ |
| Modo Edição (documentos) | ✅ | ❌ | ❌ |
| Gerenciar usuários | ✅ | ❌ | ❌ |
| "Valor faturado fora do sistema" | ✅ (edita) | 👁️ (somente leitura) | ❌ |
| Visualizar histórico | ✅ | ✅ | ✅ |

---

## 12. Alertas Críticos — O que são e como resolver

### Medição Atrasada
**O que é:** medição com data de previsão expirada e status ainda "prevista".
**Como resolver:** envie a medição ao contratante (botão "Enviar") ou atualize a data de previsão.

### Despesa sem Vínculo
**O que é:** medição aprovada sem nenhuma despesa real cadastrada.
**Como resolver:** acesse a aba Despesas da obra e vincule despesas à medição aprovada.

### Fechamento Pendente
**O que é:** 7+ dias desde a aprovação da medição e despesas ainda abertas.
**Como resolver:** revise e feche as despesas da medição na aba Despesas.

### Documentação Incompleta
**O que é:** obra com menos de 3 documentos de Pré Obra ou 2 de Ensaios.
**Como resolver:** complete o checklist de documentos na aba Documentos da obra.

---

*ObraMap — Sistema de Gestão de Obras © 2024-2026. Desenvolvido por Felipe Langmantel.*
