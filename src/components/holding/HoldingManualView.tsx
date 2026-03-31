import {
  BookOpen, Building2, ClipboardList, BarChart3, AlertTriangle,
  FileDown, TrendingUp, Receipt, FolderOpen, Sparkles, FileText,
  Shield, Map, DollarSign, Crown,
  CheckCircle2, Info, HardHat, Briefcase
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function HoldingManualView() {
  return (
    <div className="space-y-8 pb-12">

      {/* HERO */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 text-primary">
          <BookOpen className="h-8 w-8" />
          <h1 className="text-2xl font-bold tracking-tight">Manual do ObraMap — Módulo Holding</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Guia completo para diretores, coordenadores, engenheiros e equipe financeira.
          Aprenda a lançar dados, interpretar indicadores e tomar decisões com base nos números reais da obra.
        </p>
      </div>

      <Accordion type="multiple" className="space-y-2">

        {/* 1 */}
        <AccordionItem value="s1" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> 1. O que é o Módulo Holding</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>O Módulo Holding é o painel central de gestão de portfólio da sua construtora. Reúne em um único lugar todas as informações financeiras, de prazo e de andamento de todas as obras — independente da empresa ou município.</p>
            <p><strong className="text-foreground">Para que serve na prática:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>O <strong className="text-foreground">diretor</strong> acompanha o portfólio inteiro sem precisar ligar para o engenheiro.</li>
              <li>O <strong className="text-foreground">coordenador</strong> vê quais obras estão com problemas e age antes que escalem.</li>
              <li>O <strong className="text-foreground">engenheiro</strong> lança medições, despesas e documentos diretamente no sistema.</li>
              <li>O <strong className="text-foreground">financeiro</strong> projeta o fluxo de caixa e acompanha NFs e pagamentos.</li>
            </ul>
            <p><strong className="text-foreground">6 módulos disponíveis:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Painel Principal</strong> — visão geral do portfólio com semáforo de saúde</li>
              <li><strong className="text-foreground">Receitas &amp; Medições</strong> — controle de todas as medições PLE</li>
              <li><strong className="text-foreground">Despesas &amp; Custos</strong> — gastos mensais por obra</li>
              <li><strong className="text-foreground">Documentação</strong> — checklist de documentos por obra</li>
              <li><strong className="text-foreground">PRD — Cronograma</strong> — previsto × realizado × despesas</li>
              <li><strong className="text-foreground">IA Insights</strong> — análise automática do portfólio</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* 2 */}
        <AccordionItem value="s2" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> 2. Navegando pelo Painel Principal</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p><strong className="text-foreground">KPIs no topo:</strong></p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong className="text-foreground">Total em Contratos</strong> — soma dos valores contratuais + aditivos</li>
              <li><strong className="text-foreground">Total Medido / Faturado</strong> — soma das medições aprovadas</li>
              <li><strong className="text-foreground">Saldo a Faturar</strong> — o que ainda falta medir</li>
              <li><strong className="text-foreground">Andamento Médio</strong> — % físico médio das obras em andamento</li>
              <li><strong className="text-foreground">Obras Ativas</strong> — obras com status "Em Andamento"</li>
              <li><strong className="text-foreground">Alertas Críticos</strong> — obras com semáforo vermelho</li>
            </ul>
            <p><strong className="text-foreground">3 visões (botões acima dos cards):</strong></p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong className="text-foreground">Portfólio</strong> — cards ou tabela de todas as obras com semáforo e valores</li>
              <li><strong className="text-foreground">Análises</strong> — mapa geográfico, gráficos PRD e donuts de status</li>
              <li><strong className="text-foreground">Manual</strong> — esta documentação</li>
            </ul>
            <p><strong className="text-foreground">Filtros:</strong> chips por empresa (afetam KPIs, cards e gráficos), busca por nome, status, saúde, tipo de contrato, responsável e cargo.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 3 */}
        <AccordionItem value="s3" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> 3. Semáforo de Saúde — Como a obra é avaliada</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
            <p>
              Cada obra recebe automaticamente uma cor baseada em <strong className="text-foreground">4 indicadores de Engenharia de Custos (EVM — Earned Value Management)</strong>,
              padrão internacional reconhecido pelo PMI e ISO 21508.
              A cor atualiza em tempo real conforme os dados são lançados.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /><strong className="text-foreground text-xs">Verde — Sob controle</strong></div>
                <p className="text-xs">Todos os indicadores dentro dos limites. Medindo o esperado, prazo cumprido, medições regulares e glosa baixa.</p>
              </div>
              <div className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-500 inline-block" /><strong className="text-foreground text-xs">Amarelo — Atenção</strong></div>
                <p className="text-xs">Algum indicador próximo do limite. Requer acompanhamento.</p>
              </div>
              <div className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-red-500 inline-block" /><strong className="text-foreground text-xs">Vermelho — Crítico</strong></div>
                <p className="text-xs">Obra paralisada, desvio financeiro ou de prazo grave, sem medição há muito tempo ou glosa alta.</p>
              </div>
              <div className="border rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-400 inline-block" /><strong className="text-foreground text-xs">Cinza — Não Iniciada</strong></div>
                <p className="text-xs">Obra ainda não começou. Sem dados para avaliação. Neutro — não é problema.</p>
              </div>
            </div>
            <p><strong className="text-foreground">Os 4 indicadores (avaliados em cascata — para no primeiro que disparar):</strong></p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Indicador</TableHead>
                  <TableHead className="text-xs">O que mede</TableHead>
                  <TableHead className="text-xs">🟡 Atenção</TableHead>
                  <TableHead className="text-xs">🔴 Crítico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-xs">IDC — Desempenho de Custo</TableCell>
                  <TableCell className="text-xs">Valor medido aprovado ÷ valor esperado pelo % físico</TableCell>
                  <TableCell className="text-xs">IDC &lt; 85%</TableCell>
                  <TableCell className="text-xs">IDC &lt; 70%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs">IDP — Desempenho de Prazo</TableCell>
                  <TableCell className="text-xs">% execução física ÷ % tempo consumido do prazo</TableCell>
                  <TableCell className="text-xs">IDP &lt; 90%</TableCell>
                  <TableCell className="text-xs">IDP &lt; 70%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs">Dias sem Medição Aprovada</TableCell>
                  <TableCell className="text-xs">Desde a última medição com status Aprovada</TableCell>
                  <TableCell className="text-xs">&gt; 30 dias</TableCell>
                  <TableCell className="text-xs">&gt; 60 dias</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs">Glosa Acumulada</TableCell>
                  <TableCell className="text-xs">Valor glosado ÷ total medido aprovado</TableCell>
                  <TableCell className="text-xs">&gt; 5%</TableCell>
                  <TableCell className="text-xs">&gt; 15%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Exemplo prático — IDC</p>
              <p className="text-xs">Obra com 60% de execução física, mas que só aprovou 35% do contrato em medições. IDC = 35% ÷ 60% = 0,58. Abaixo de 70% → semáforo <strong>vermelho</strong>.</p>
            </div>
            <p className="text-xs"><strong className="text-foreground">Limites configuráveis:</strong> Configurações → Saúde das Obras. Qualquer alteração recalcula o semáforo de todas as obras automaticamente.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 4 */}
        <AccordionItem value="s4" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> 4. Abrindo a Ficha da Obra</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Clique em qualquer card ou linha de tabela para abrir o painel lateral. Ele tem <strong className="text-foreground">7 abas:</strong></p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Aba</TableHead>
                  <TableHead className="text-xs">Conteúdo</TableHead>
                  <TableHead className="text-xs">Perfil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-xs">Resumo</TableCell><TableCell className="text-xs">KPIs, gráfico de medições, timeline de prazo</TableCell><TableCell className="text-xs">Todos</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Documentos</TableCell><TableCell className="text-xs">Checklist Pré Obra + Ensaios</TableCell><TableCell className="text-xs">Engenheiro, Coordenador</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Medições</TableCell><TableCell className="text-xs">Lançamento e acompanhamento de medições PLE</TableCell><TableCell className="text-xs">Engenheiro, Financeiro</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Financeiro</TableCell><TableCell className="text-xs">Despesas mensais da obra</TableCell><TableCell className="text-xs">Engenheiro, Financeiro</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Aditivos</TableCell><TableCell className="text-xs">Aditivos de prazo e valor ao contrato</TableCell><TableCell className="text-xs">Coordenador, Diretor</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Pendências</TableCell><TableCell className="text-xs">Itens pendentes e problemas a resolver</TableCell><TableCell className="text-xs">Engenheiro, Coordenador</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Histórico</TableCell><TableCell className="text-xs">Log de todas as ações realizadas</TableCell><TableCell className="text-xs">Coordenador, Diretor</TableCell></TableRow>
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        {/* 5 */}
        <AccordionItem value="s5" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> 5. Lançando Medições — Passo a Passo</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-4 pb-4">
            <p>A medição percorre um <strong className="text-foreground">ciclo de 4 estágios</strong>. Cada um tem campos específicos e impacta os KPIs do painel.</p>

            <div className="space-y-3">
              <div className="border-l-4 border-l-slate-400 pl-3 space-y-1">
                <p className="font-semibold text-foreground text-xs">Estágio 1 — PREVISÃO</p>
                <p className="text-xs">Use quando a obra já sabe que vai medir, mas ainda não enviou ao contratante.</p>
                <p className="text-xs"><strong className="text-foreground">Preencher:</strong> Nº Medição · Mês Ref. · Ano Ref. · Previsão Envio · Valor Previsto (R$) · Status: Não Iniciada</p>
                <p className="text-xs"><strong className="text-foreground">Efeito:</strong> aparece na Programação Financeira como entrada futura prevista.</p>
              </div>
              <div className="border-l-4 border-l-blue-500 pl-3 space-y-1">
                <p className="font-semibold text-foreground text-xs">Estágio 2 — ENVIADA</p>
                <p className="text-xs">Preencha quando o boletim de medição foi entregue ao contratante.</p>
                <p className="text-xs"><strong className="text-foreground">Preencher:</strong> Data Envio · Valor Realizado (R$) · Status: Enviada</p>
                <p className="text-xs"><strong className="text-foreground">Efeito:</strong> KPI "Aguardando Aprovação" sobe. Programação estima pagamento: envio + 15 dias + prazo da obra.</p>
              </div>
              <div className="border-l-4 border-l-emerald-500 pl-3 space-y-1">
                <p className="font-semibold text-foreground text-xs">Estágio 3 — APROVADA</p>
                <p className="text-xs">Preencha quando o contratante aprovou a medição.</p>
                <p className="text-xs"><strong className="text-foreground">Preencher:</strong> Data Aprovação · Valor Acatado (R$)</p>
                <p className="text-xs"><strong className="text-foreground">Atenção:</strong> ao preencher a Data Aprovação, o status muda automaticamente para Aprovada.</p>
                <p className="text-xs"><strong className="text-foreground">Efeito:</strong> KPI "Medições Aprovadas" sobe. IDC recalculado. Programação usa data de aprovação + prazo.</p>
              </div>
              <div className="border-l-4 border-l-emerald-700 pl-3 space-y-1">
                <p className="font-semibold text-foreground text-xs">Estágio 4 — NF RECEBIDA</p>
                <p className="text-xs">Preencha quando a NF foi emitida e o pagamento confirmado.</p>
                <p className="text-xs"><strong className="text-foreground">Preencher:</strong> Nº NF · Data Pagamento · Status NF: Recebido</p>
                <p className="text-xs"><strong className="text-foreground">Efeito:</strong> KPI "NF Recebida" sobe. Programação usa a data real de pagamento.</p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">⚠️ Regras do sistema</p>
              <ul className="list-disc pl-4 text-xs space-y-1">
                <li>Não permite duas medições com o mesmo Nº + Mês + Ano na mesma obra.</li>
                <li>Valida saldo disponível — bloqueia se o lançamento ultrapassar o valor do contrato.</li>
                <li>Obras com saldo inicial têm esse valor descontado na validação.</li>
              </ul>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 6 */}
        <AccordionItem value="s6" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> 6. Entendendo os Valores da Medição</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Campo</TableHead>
                  <TableHead className="text-xs">Definição</TableHead>
                  <TableHead className="text-xs">Quando preencher</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-xs">Valor Previsto</TableCell>
                  <TableCell className="text-xs">Estimativa de quanto a obra pretende cobrar nesta medição</TableCell>
                  <TableCell className="text-xs">Antes do envio — para projeção de caixa</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs">Valor Realizado</TableCell>
                  <TableCell className="text-xs">Valor medido e enviado ao contratante no boletim</TableCell>
                  <TableCell className="text-xs">Na data do envio</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs">Valor Acatado</TableCell>
                  <TableCell className="text-xs">Valor aprovado pelo contratante — pode ser menor que o Realizado</TableCell>
                  <TableCell className="text-xs">Na data da aprovação</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-xs text-red-600">Glosa</TableCell>
                  <TableCell className="text-xs">Diferença Realizado − Acatado. Valor "cortado" pelo contratante</TableCell>
                  <TableCell className="text-xs">Calculado automaticamente</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Exemplo prático</p>
              <p className="text-xs">Medição enviada: <strong>R$ 200.000</strong>. Contratante aprovou: <strong>R$ 180.000</strong>. Glosa = <strong>R$ 20.000 (10%)</strong>.</p>
              <p className="text-xs">Glosa acumulada acima de 5% → semáforo amarelo. Acima de 15% → vermelho. Glosa alta pode indicar divergência técnica com a fiscalização.</p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 7 */}
        <AccordionItem value="s7" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> 7. Lançando Despesas Mensais</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Na aba <strong className="text-foreground">Financeiro</strong> da obra você registra os custos mensais. Alimenta o PRD e o cálculo de margem.</p>
            <p><strong className="text-foreground">Campos:</strong> Mês · Ano · Valor (R$) · Status</p>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Significado</TableHead><TableHead className="text-xs">Quando usar</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell className="text-xs">Não Iniciado</TableCell><TableCell className="text-xs">Despesa prevista, não executada</TableCell><TableCell className="text-xs">Planejamento futuro</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Em Fechamento</TableCell><TableCell className="text-xs">Executada, aguardando fechamento contábil</TableCell><TableCell className="text-xs">Mês ainda em aberto</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Fechado</TableCell><TableCell className="text-xs">Confirmada e contabilizada</TableCell><TableCell className="text-xs">Mês encerrado</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-xs">O KPI <strong className="text-foreground">Despesas Acumuladas</strong> soma todos os status — mostra o total comprometido.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 8 */}
        <AccordionItem value="s8" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> 8. Aditivos de Contrato</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Aba <strong className="text-foreground">Aditivos</strong> da obra. Campos: Nº Aditivo · Prazo adicional (dias) · Valor Aditivo (R$) · Supressão (R$) · Data · Status.</p>
            <p><strong className="text-foreground">Impacto automático:</strong></p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li>Valor contrato = original + aditivos − supressões</li>
              <li>Prazo = original + dias aditivados → Gantt e IDP recalculados</li>
              <li>Saldo a medir = recalculado com o novo valor</li>
              <li>Status <em>Pendente</em> = alerta no painel até assinatura</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* 9 */}
        <AccordionItem value="s9" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" /> 9. Documentos da Obra</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Aba <strong className="text-foreground">Documentos</strong> — marque os documentos que já foram obtidos.</p>
            <p><strong className="text-foreground">Pré Obra (6):</strong> ATA · OIS · ART · CNO · Implantação · SCP</p>
            <p><strong className="text-foreground">Ensaios e Projetos (5):</strong> Sondagem SPT · Planta Localização · Plano Altimétrico · Painel de Bordo · Checklist Segurança</p>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs">Os documentos são checklist de existência. Upload de arquivo (PDF, imagem) para CNO, ART, contrato etc. está previsto para próxima versão.</p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 10 */}
        <AccordionItem value="s10" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> 10. Pendências</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>Aba <strong className="text-foreground">Pendências</strong> — registre qualquer item que precisa de ação (técnico, documental ou contratual).</p>
            <p className="text-xs">Campos: Tipo · Descrição · Concluído (checkbox)</p>
            <p className="text-xs">Pendências abertas aparecem no painel de alertas e no módulo Documentação → aba Pendências. Ao concluir, sai dos alertas automaticamente.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 11 */}
        <AccordionItem value="s11" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> 11. Módulo Receitas &amp; Medições</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Sidebar → <strong className="text-foreground">Receitas &amp; Medições</strong> — visão consolidada de todas as medições de todas as obras.</p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong className="text-foreground">Resumo</strong> — KPIs + gráfico de fluxo mensal por status</li>
              <li><strong className="text-foreground">Tabela</strong> — todas as medições com filtros por obra, empresa, status medição, status NF e tipo</li>
              <li><strong className="text-foreground">Previsão de Caixa</strong> — projeção de 12 meses com colunas por status (Aprovada, Enviada, Pendente, NF Recebida)</li>
              <li><strong className="text-foreground">Programação Financeira</strong> — quando cada pagamento deve chegar. Usa prazo da obra + data de aprovação real (ou estimativa de 15 dias para enviadas)</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* 12 */}
        <AccordionItem value="s12" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> 12. Módulo PRD — Previsto × Realizado × Despesas</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Sidebar → <strong className="text-foreground">PRD — Cronograma</strong></p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-foreground">Como o Previsto é calculado</p>
              <p className="text-xs">Valor contrato distribuído linearmente pelo prazo (ex: 12 meses, R$ 1,2M → R$ 100k/mês). Se houver Valor Previsto cadastrado nas medições, ele substitui a estimativa linear.</p>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong className="text-foreground">Visão Portfólio</strong> — gráfico mensal Previsto/Realizado/Despesas + tabela com % execução e saldo por obra</li>
              <li><strong className="text-foreground">Por Obra</strong> — curva S individual com acumulado mês a mês</li>
              <li><strong className="text-foreground">Tabela Mensal</strong> — matriz obras × meses. Célula verde ≥100%, âmbar 70-99%, vermelho &lt;70%</li>
            </ul>
            <p className="text-xs">Apenas obras em andamento ou com dados lançados aparecem. Obras sem dados são omitidas.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 13 */}
        <AccordionItem value="s13" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Map className="h-4 w-4 text-primary" /> 13. Análises — Mapa e Gráficos</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>Painel Principal → aba <strong className="text-foreground">Análises</strong></p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><strong className="text-foreground">Mapa RS</strong> — pins coloridos pelo semáforo. Clique para centralizar. Lista lateral por valor de contrato.</li>
              <li><strong className="text-foreground">PRD Chart</strong> — barras Previsto/Realizado/Despesas + ROI</li>
              <li><strong className="text-foreground">Evolução Financeira</strong> — área acumulada mês a mês</li>
              <li><strong className="text-foreground">3 Donuts</strong> — distribuição por status, saúde e tipo de contrato</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* 14 */}
        <AccordionItem value="s14" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> 14. IA — Insights <Badge variant="secondary" className="ml-1 text-[10px]">BETA</Badge></span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>Sidebar → <strong className="text-foreground">IA Insights</strong> — análise automática do portfólio com dados reais do sistema.</p>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><strong className="text-foreground">Gerar Insights</strong> — 5 recomendações classificadas por tipo e impacto</li>
              <li><strong className="text-foreground">Relatório Executivo</strong> — texto pronto para diretoria, exportável em PDF</li>
              <li><strong className="text-foreground">Análises instantâneas</strong> — obras com maior risco de atraso, sem documentação e fluxo de caixa dos próximos 3 meses (calculado dos dados, sem IA)</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* 15 */}
        <AccordionItem value="s15" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileDown className="h-4 w-4 text-primary" /> 15. Exportações</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Onde</TableHead><TableHead className="text-xs">Formato</TableHead><TableHead className="text-xs">O que exporta</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell className="text-xs">Painel Principal</TableCell><TableCell className="text-xs">PDF</TableCell><TableCell className="text-xs">Relatório executivo A4 com KPIs e alertas</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Painel Principal</TableCell><TableCell className="text-xs">CSV</TableCell><TableCell className="text-xs">Tabela completa de todas as obras</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Receitas &amp; Medições</TableCell><TableCell className="text-xs">CSV</TableCell><TableCell className="text-xs">Todas as medições (engenharia + financeiro)</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Despesas</TableCell><TableCell className="text-xs">CSV</TableCell><TableCell className="text-xs">Gastos mensais por obra</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">Documentação</TableCell><TableCell className="text-xs">CSV</TableCell><TableCell className="text-xs">Checklist Pré Obra + Ensaios</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">PRD</TableCell><TableCell className="text-xs">CSV</TableCell><TableCell className="text-xs">Matriz mensal Previsto/Realizado/Despesas</TableCell></TableRow>
                <TableRow><TableCell className="text-xs">IA Insights</TableCell><TableCell className="text-xs">PDF</TableCell><TableCell className="text-xs">Relatório executivo gerado pela IA</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-xs">Todos os CSVs usam separador ponto-vírgula (;) — compatível com Excel Brasil.</p>
          </AccordionContent>
        </AccordionItem>

        {/* 16 */}
        <AccordionItem value="s16" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><HardHat className="h-4 w-4 text-primary" /> 16. Guia Rápido — Engenheiro Residente</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p className="text-xs font-medium text-foreground">Rotina mensal:</p>
            <ol className="list-decimal pl-5 space-y-2 text-xs">
              <li><strong className="text-foreground">Início do mês:</strong> crie a medição com Nº, Mês, Ano e Valor Previsto.</li>
              <li><strong className="text-foreground">Na data de envio:</strong> edite a medição → preencha Data Envio e Valor Realizado → status: Enviada.</li>
              <li><strong className="text-foreground">Quando aprovada:</strong> preencha Data Aprovação e Valor Acatado. Status vira Aprovada automaticamente.</li>
              <li><strong className="text-foreground">Ao receber:</strong> preencha Nº NF e Data Pagamento → Status NF: Recebido.</li>
              <li><strong className="text-foreground">Despesas:</strong> aba Financeiro → lance os custos do mês como "Em Fechamento". Ao fechar o mês, mude para "Fechado".</li>
              <li><strong className="text-foreground">Documentos:</strong> sempre que obter ART, CNO ou outro documento, marque na aba Documentos.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* 17 */}
        <AccordionItem value="s17" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> 17. Guia Rápido — Coordenador de Obras</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <ol className="list-decimal pl-5 space-y-2 text-xs">
              <li><strong className="text-foreground">Revisão semanal:</strong> filtre por saúde Vermelho e Amarelo. Identifique obras que precisam de ação.</li>
              <li><strong className="text-foreground">IDC baixo:</strong> obra medindo menos que o andamento físico indica — verifique medições atrasadas ou % físico superestimado.</li>
              <li><strong className="text-foreground">IDP baixo:</strong> obra atrasada em relação ao prazo — avalie necessidade de aditivo ou aceleração.</li>
              <li><strong className="text-foreground">Glosa alta:</strong> veja quais medições tiveram corte e registre pendências para investigação.</li>
              <li><strong className="text-foreground">Aditivos pendentes:</strong> resolva antes de emitir a próxima medição.</li>
              <li><strong className="text-foreground">Análises:</strong> use o mapa para visualizar distribuição geográfica das obras críticas.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* 18 */}
        <AccordionItem value="s18" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> 18. Guia Rápido — Gerente Financeiro</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <ol className="list-decimal pl-5 space-y-2 text-xs">
              <li><strong className="text-foreground">NFs pendentes:</strong> Receitas &amp; Medições → Tabela → filtre Aprovada + NF Pendente. Essas NFs precisam ser emitidas.</li>
              <li><strong className="text-foreground">Fluxo de caixa:</strong> aba Programação Financeira → veja quando cada pagamento deve entrar por semana, quinzena ou mês.</li>
              <li><strong className="text-foreground">Despesas:</strong> Despesas &amp; Custos → filtre "Em Fechamento" para ver o que precisa ser fechado.</li>
              <li><strong className="text-foreground">Margem:</strong> PRD → Visão Portfólio → coluna Saldo = Receitas Aprovadas − Despesas. Vermelho = margem negativa.</li>
              <li><strong className="text-foreground">Exportar:</strong> use os botões CSV para montar planilhas no Excel. Separador ponto-vírgula, compatível com o Excel Brasil.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* 19 */}
        <AccordionItem value="s19" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /> 19. Guia Rápido — Diretor</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <ol className="list-decimal pl-5 space-y-2 text-xs">
              <li><strong className="text-foreground">KPIs do topo:</strong> 6 cards mostram a saúde do portfólio. Alertas Críticos em vermelho = ação imediata.</li>
              <li><strong className="text-foreground">Gantt:</strong> visão temporal de todas as obras. Linha vermelha vertical = hoje. Barras além da linha = obras atrasadas.</li>
              <li><strong className="text-foreground">Análises:</strong> mapa + gráficos de distribuição e evolução financeira.</li>
              <li><strong className="text-foreground">IA Insights:</strong> clique "Gerar Insights" para receber análise automática com recomendações priorizadas.</li>
              <li><strong className="text-foreground">Relatório:</strong> IA Insights → Gerar Relatório Executivo → Exportar PDF. Pronto para reunião de diretoria.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* 20 */}
        <AccordionItem value="s20" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> 20. Perfis e Permissões de Acesso</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>O administrador configura o acesso individualmente para cada usuário.</p>
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Perfil</TableHead><TableHead className="text-xs">Capacidade</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell className="font-medium text-xs">Admin da Empresa</TableCell><TableCell className="text-xs">Acesso total — criar, editar, excluir, configurar todos os módulos</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Editor</TableCell><TableCell className="text-xs">Lançar e editar dados. Não exclui obras nem acessa configurações</TableCell></TableRow>
                <TableRow><TableCell className="font-medium text-xs">Visualizador</TableCell><TableCell className="text-xs">Somente leitura — não altera nenhum dado</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-xs">Além do perfil, é possível restringir cada usuário a <strong className="text-foreground">obras específicas</strong> — o engenheiro vê apenas as obras pelas quais é responsável.</p>
            <p className="text-xs">Acesse: Sidebar → Gerenciamento → Usuários → clique no usuário para editar.</p>
          </AccordionContent>
        </AccordionItem>

      </Accordion>

      <div className="text-center pt-6 border-t border-border">
        <p className="text-xs text-muted-foreground">ObraMap — Módulo Holding · Desenvolvido por Felipe Langmantel · 2026</p>
      </div>

    </div>
  );
}
