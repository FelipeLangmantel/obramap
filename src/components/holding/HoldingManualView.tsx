import { BookOpen, Building2, ClipboardList, BarChart3, AlertTriangle, FileDown, TrendingUp, Receipt, FolderOpen, Sparkles, FileText, Shield, Map, Zap } from "lucide-react";
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
          <h1 className="text-2xl font-bold tracking-tight">Manual do Módulo Holding</h1>
        </div>
        <p className="text-lg font-medium text-foreground">Painel de Portfólio de Obras — Guia Completo v2</p>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Guia completo para diretores, gerentes financeiros e engenheiros. Tudo que você precisa saber para usar todos os módulos da Holding.
        </p>
        <div className="flex justify-center gap-6 pt-4">
          {[
            { num: "9", label: "Arquivos" },
            { num: "5.359", label: "Linhas de código" },
            { num: "6", label: "Módulos" },
            { num: "6", label: "Tabelas banco" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-primary">{s.num}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {/* SECTION 1 */}
        <AccordionItem value="s1" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> 1. O que é o módulo Holding</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>O módulo Holding é um painel de governança corporativa para construtoras que gerenciam múltiplas obras simultaneamente. Ele consolida informações financeiras, documentais e de andamento de todo o portfólio em um único lugar.</p>
            <p><strong>6 tabelas dedicadas:</strong> obras_portfolio, documentos_obra, medicoes_ple, aditivos_contratos, despesas_mensais, pendencias_projeto — todas com RLS por empresa.</p>
            <p><strong>6 módulos independentes:</strong> Painel Principal, Receitas & Medições, Despesas & Custos, Documentação, PRD Cronograma, IA Insights.</p>
            <p><strong>Isolamento total:</strong> cada empresa vê apenas seus dados. System Admin pode habilitar/desabilitar módulos individualmente.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 2 */}
        <AccordionItem value="s2" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> 2. Como navegar — Visões do Painel Principal</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>O painel principal oferece <strong>4 visões</strong> acessíveis por abas:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Cards:</strong> grade de cards com semáforo de saúde, última medição, prazo e progresso.</li>
              <li><strong>Gantt:</strong> diagrama temporal mostrando data início, prazo e progresso de cada obra.</li>
              <li><strong>Analytics:</strong> mapa geográfico do RS, gráficos PRD, evolução financeira e donuts.</li>
              <li><strong>Manual:</strong> esta documentação interativa.</li>
            </ul>
            <p><strong>Filtros disponíveis:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Filtro global por empresa:</strong> barra superior com chips — filtra tudo (KPIs, cards, Gantt, Analytics).</li>
              <li><strong>Filtro por nome:</strong> busca textual.</li>
              <li><strong>Filtro por status:</strong> Em andamento, Não iniciada, Concluída, Paralisada.</li>
              <li><strong>Filtro por saúde:</strong> Verde, Amarelo, Vermelho.</li>
              <li><strong>Filtro por tipo contrato:</strong> Ata Estado RS, Licitação, Adesão, Moradia Popular, etc.</li>
            </ul>
            <p><strong>KPIs no topo:</strong> Total Contratos, Medições Aprovadas, Obras Ativas, % Andamento Médio, Sem Documentação, Alertas.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 3 */}
        <AccordionItem value="s3" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> 3. Semáforo de saúde</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>Cada obra recebe um semáforo automático baseado em documentação e medições:</p>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cor</TableHead><TableHead>Condição</TableHead><TableHead>Significado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell><Badge className="bg-emerald-500 text-white">Verde</Badge></TableCell><TableCell>Docs ≥ 50% + medição recente (&lt;90 dias)</TableCell><TableCell>Obra em dia</TableCell></TableRow>
                <TableRow><TableCell><Badge className="bg-amber-500 text-white">Amarelo</Badge></TableCell><TableCell>Docs &lt;50% OU medição atrasada</TableCell><TableCell>Atenção necessária</TableCell></TableRow>
                <TableRow><TableCell><Badge className="bg-red-500 text-white">Vermelho</Badge></TableCell><TableCell>Docs = 0 E sem medição</TableCell><TableCell>Situação crítica</TableCell></TableRow>
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 4 */}
        <AccordionItem value="s4" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> 4. Como cadastrar e importar obras</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p><strong>Nova Obra (botão + Nova Obra):</strong></p>
            <Table>
              <TableHeader><TableRow><TableHead>Campo</TableHead><TableHead>Obrigatório</TableHead><TableHead>Exemplo</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Nome</TableCell><TableCell>Sim</TableCell><TableCell>Residencial São Lucas</TableCell></TableRow>
                <TableRow><TableCell>Empresa</TableCell><TableCell>Não</TableCell><TableCell>PreviBras</TableCell></TableRow>
                <TableRow><TableCell>Nº Contrato</TableCell><TableCell>Não</TableCell><TableCell>CT-2025-001</TableCell></TableRow>
                <TableRow><TableCell>Parceria SCP</TableCell><TableCell>Não</TableCell><TableCell>SCP Porto Alegre</TableCell></TableRow>
                <TableRow><TableCell>Valor Contrato</TableCell><TableCell>Sim</TableCell><TableCell>5000000</TableCell></TableRow>
                <TableRow><TableCell>Data Início</TableCell><TableCell>Não</TableCell><TableCell>2025-01-15</TableCell></TableRow>
                <TableRow><TableCell>Prazo (dias)</TableCell><TableCell>Não</TableCell><TableCell>365</TableCell></TableRow>
                <TableRow><TableCell>Município / Estado</TableCell><TableCell>Não</TableCell><TableCell>Viamão / RS</TableCell></TableRow>
                <TableRow><TableCell>UH (Unidades Hab.)</TableCell><TableCell>Não</TableCell><TableCell>246</TableCell></TableRow>
                <TableRow><TableCell>Responsável</TableCell><TableCell>Não</TableCell><TableCell>Frederico - 51 990049501</TableCell></TableRow>
                <TableRow><TableCell>Tipo de Contrato</TableCell><TableCell>Não</TableCell><TableCell>Ata Estado RS</TableCell></TableRow>
              </TableBody>
            </Table>
            <p><strong>Importação em lote (CSV):</strong></p>
            <p>Cole no textarea com 14 colunas separadas por vírgula:</p>
            <code className="text-xs block bg-muted p-2 rounded">Nome,Empresa,Contrato,SCP,Valor,Data Início,Prazo dias,Status,% Andamento,Município,Estado,UH,Responsável,Tipo Contrato</code>
            <p>O sistema detecta duplicatas automaticamente pelo nome da obra e mostra quantas seriam ignoradas antes de importar.</p>
            <p>Botão "Carregar modelo" preenche um exemplo editável.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 5 */}
        <AccordionItem value="s5" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> 5. Como lançar dados na ficha da obra</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Clique em qualquer obra para abrir o drawer lateral com 5 abas:</p>
            <p><strong>A — Documentos:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Pré Obra (6 itens):</strong> Ata, OIS, ART, CNO, Implantação, SCP — toggles on/off.</li>
              <li><strong>Ensaios e Projetos (5 itens):</strong> Sondagem SPT, Planta Localização, Plano Altimétrico, Painel Bordo, Checklist Segurança.</li>
              <li>Progresso atualiza automaticamente o semáforo de saúde.</li>
            </ul>
            <p><strong>B — Medições PLE:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Campos: Nº Medição, Mês (Select obrigatório Jan-Dez), Ano, Data Envio, Data Aprovação, Status (pendente/aprovada/rejeitada), Valor, Nº NF, Data Pagamento, Status NF.</li>
              <li>Detecção de duplicata: não permite salvar se já existir medição com mesmo Nº + Mês + Ano.</li>
            </ul>
            <p><strong>C — Financeiro/Despesas:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Campos: Mês (Select obrigatório), Ano, Valor, Status (não_iniciado/em_fechamento/fechado).</li>
            </ul>
            <p><strong>D — Aditivos:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Campos: Nº Aditivo, Data, Prazo adicional (dias), Valor aditivo, Valor supressão, Status.</li>
              <li>Aditivos atualizam o Gantt e a previsão de término da obra.</li>
            </ul>
            <p><strong>E — Pendências:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tipo livre + descrição textual + checkbox de conclusão.</li>
              <li>Pendências abertas aparecem nos alertas e na visão de Documentação consolidada.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 6 */}
        <AccordionItem value="s6" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> 6. Alertas automáticos</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tipo</TableHead><TableHead>Condição</TableHead><TableHead>Severidade</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Documentação zero</TableCell><TableCell>0 docs preenchidos</TableCell><TableCell><Badge variant="destructive">Crítico</Badge></TableCell></TableRow>
                <TableRow><TableCell>Documentação incompleta</TableCell><TableCell>&lt;50% docs</TableCell><TableCell><Badge className="bg-amber-500 text-white">Atenção</Badge></TableCell></TableRow>
                <TableRow><TableCell>Sem medição</TableCell><TableCell>Nenhuma medição registrada</TableCell><TableCell><Badge variant="destructive">Crítico</Badge></TableCell></TableRow>
                <TableRow><TableCell>Medição atrasada</TableCell><TableCell>Última medição &gt;90 dias</TableCell><TableCell><Badge className="bg-amber-500 text-white">Atenção</Badge></TableCell></TableRow>
                <TableRow><TableCell>Prazo vencendo</TableCell><TableCell>&lt;30 dias para término</TableCell><TableCell><Badge className="bg-amber-500 text-white">Atenção</Badge></TableCell></TableRow>
                <TableRow><TableCell>Prazo vencido</TableCell><TableCell>Data fim ultrapassada</TableCell><TableCell><Badge variant="destructive">Crítico</Badge></TableCell></TableRow>
                <TableRow><TableCell>Obra paralisada</TableCell><TableCell>Status = paralisada</TableCell><TableCell><Badge variant="destructive">Crítico</Badge></TableCell></TableRow>
                <TableRow><TableCell>Pendências abertas</TableCell><TableCell>Pendências não concluídas</TableCell><TableCell><Badge className="bg-amber-500 text-white">Info</Badge></TableCell></TableRow>
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 7 */}
        <AccordionItem value="s7" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> 7. Módulo Receitas & Medições</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Sidebar → <strong>Receitas & Medições</strong> (rota /holding-receitas)</p>
            <p><strong>Aba Resumo:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>4 KPIs: Total Medições, Aprovadas, Pendentes, NFs Emitidas.</li>
              <li>Gráfico de fluxo mensal: barras de medições aprovadas vs pendentes por mês.</li>
              <li>Ranking das obras com maior receita acumulada.</li>
            </ul>
            <p><strong>Aba Tabela:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Seção ENGENHARIA: Obra, Contrato, UH, Tipo, Nº Medição, Mês/Ano, Envio, Aprovação, Status, Valor.</li>
              <li>Seção FINANCEIRO: Nº NF, Data Pagamento, Status NF.</li>
              <li>Linhas alternadas, totais no rodapé.</li>
            </ul>
            <p><strong>Aba Previsão de Caixa:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Projeção dos próximos 12 meses baseada em medições pendentes/aprovadas.</li>
              <li>Útil para o gerente financeiro planejar pagamentos.</li>
            </ul>
            <p><strong>Filtros:</strong> obra, empresa, status medição, status NF, busca textual, tipo contrato.</p>
            <p><strong>Exportar CSV:</strong> encoding UTF-8 BOM, separador ponto-vírgula (abre correto no Excel BR).</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 8 */}
        <AccordionItem value="s8" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> 8. Módulo Despesas & Custos</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Sidebar → <strong>Despesas & Custos</strong> (rota /holding-despesas)</p>
            <p><strong>Aba Resumo:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>4 KPIs: Total Despesas, Fechado, Em Fechamento, Não Iniciado.</li>
              <li>Gráfico de área mensal com despesas acumuladas.</li>
              <li>Ranking das 8 obras com maior despesa total.</li>
            </ul>
            <p><strong>Aba Tabela:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Colunas: Obra, Empresa, Contrato, UH, Mês/Ano, Valor, Status.</li>
              <li>Totais no rodapé: registros, total geral, total fechado.</li>
            </ul>
            <p><strong>Aba PRD Completo:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>ComposedChart: Barras Previsto (azul) × Realizado (verde) × Despesas (vermelho).</li>
              <li>Linha de Saldo/ROI no eixo Y direito.</li>
              <li>Tabela: Obra, UH, Valor Contrato, Medições Aprovadas, Despesas, Saldo, ROI%.</li>
              <li><strong>Saldo</strong> = Receitas aprovadas − Despesas fechadas.</li>
              <li><strong>ROI</strong> = ((Realizado − Despesas) / Despesas × 100)% — verde se positivo, vermelho se negativo.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 9 */}
        <AccordionItem value="s9" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" /> 9. Módulo Documentação</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Sidebar → <strong>Documentação</strong> (rota /holding-documentos)</p>
            <p><strong>Aba Visão Geral:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>5 KPIs: Total Obras, Documentação Completa, Parcial, Crítica, Pendências Abertas.</li>
              <li>Barras de progresso: documentação média e acompanhamento médio do portfólio.</li>
              <li>Tabela resumo: Pré Obra (X/6), Ensaios e Projetos (X/5), Saúde, Pendências por obra.</li>
            </ul>
            <p><strong>Aba Pré Obra:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tabela com 6 colunas de checkmarks: Ata ✓/✗, OIS ✓/✗, ART ✓/✗, CNO ✓/✗, Impl ✓/✗, SCP ✓/✗.</li>
            </ul>
            <p><strong>Aba Ensaios e Projetos:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tabela com 5 colunas: Sondagem SPT, Planta Localiz., Plano Altim., Painel Bordo, Check Seg.</li>
            </ul>
            <p><strong>Aba Pendências:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Lista consolidada de todas as pendências abertas de todas as obras.</li>
              <li>Filtros: por obra, status (Abertas/Concluídas/Todas).</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 10 */}
        <AccordionItem value="s10" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> 10. Módulo PRD — Cronograma</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Sidebar → <strong>PRD — Cronograma</strong> (rota /holding-prd)</p>
            <p><strong>Aba Visão Portfólio:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>ComposedChart mensal: barras Previsto (azul), Realizado (verde), Despesas (vermelho).</li>
              <li>Linha de desvio % (eixo Y direito, roxo).</li>
              <li>Tabela resumo: Obra, Previsto Total, Realizado, % Exec, Despesas, Saldo.</li>
            </ul>
            <p><strong>Aba Por Obra:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Select para escolher uma obra específica.</li>
              <li>Gráfico PRD individual com Curva S acumulada.</li>
            </ul>
            <p><strong>Aba Tabela Mensal:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Matriz: linhas = obras, colunas = meses.</li>
              <li>Cada célula: Previsto / Realizado / Despesas (3 valores).</li>
              <li>Codificação: verde (≥100%), âmbar (70-99%), vermelho (&lt;70%).</li>
            </ul>
            <p><strong>4 KPIs:</strong> Previsto Acumulado, Realizado Acumulado, Despesas Acumuladas, Desvio Global %.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 11 */}
        <AccordionItem value="s11" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> 11. Módulo IA — Insights <Badge variant="secondary" className="ml-1 text-[10px]">BETA</Badge></span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Sidebar → <strong>IA — Insights</strong> (rota /holding-insights)</p>
            <p><strong>Gerar Insights (botão):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Envia resumo do portfólio para IA e recebe 5 insights classificados.</li>
              <li>Cada insight tem: Tipo (Risco/Oportunidade/Alerta/Ação), Título, Descrição, Impacto (Alto/Médio/Baixo), Obra relacionada.</li>
            </ul>
            <p><strong>Gerar Relatório Executivo (botão):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Texto pronto para apresentar à diretoria.</li>
              <li>Botões: Copiar para clipboard, Exportar como PDF.</li>
            </ul>
            <p><strong>Análises pré-definidas (sem IA, instantâneas):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Obras com maior risco de atraso — calculado dos dados.</li>
              <li>Obras sem documentação — calculado.</li>
              <li>Fluxo de caixa próximos 3 meses — calculado.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 12 */}
        <AccordionItem value="s12" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Map className="h-4 w-4 text-primary" /> 12. Analytics — Mapa + Gráficos</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-4">
            <p>Acesso: Painel Principal → aba <strong>Analytics</strong></p>
            <p><strong>Mapa RS:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Pins coloridos pelo semáforo de saúde (verde/amarelo/vermelho).</li>
              <li>Lista lateral ordenada por valor do contrato — clique para centralizar no mapa.</li>
              <li>Municípios mapeados: Porto Alegre, Viamão, Canoas, Gravataí, São Leopoldo, Esteio, Sapucaia, Alvorada, Cachoeirinha, Guaíba, Eldorado do Sul, Charqueadas, Montenegro, Novo Hamburgo, Campo Bom, entre outros.</li>
            </ul>
            <p><strong>Gráficos:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>PRD Chart: barras Previsto, Realizado, Despesas + linha ROI.</li>
              <li>Evolução Financeira: área chart acumulado mês a mês.</li>
              <li>3 Donuts: status obras, saúde, tipo contrato.</li>
            </ul>
            <p>Filtro global por empresa também se aplica ao Analytics.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 13 */}
        <AccordionItem value="s13" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileDown className="h-4 w-4 text-primary" /> 13. Exportações disponíveis</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Módulo</TableHead><TableHead>Formato</TableHead><TableHead>O que exporta</TableHead><TableHead>Encoding</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Painel Holding</TableCell><TableCell>PDF</TableCell><TableCell>Relatório executivo A4 paisagem com KPIs e alertas</TableCell><TableCell>—</TableCell></TableRow>
                <TableRow><TableCell>Painel Holding</TableCell><TableCell>CSV</TableCell><TableCell>Tabela completa de obras com todos os campos</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
                <TableRow><TableCell>Receitas</TableCell><TableCell>CSV</TableCell><TableCell>Todas as medições (ENGENHARIA + FINANCEIRO)</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
                <TableRow><TableCell>Despesas</TableCell><TableCell>CSV</TableCell><TableCell>Todos os gastos mensais por obra</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
                <TableRow><TableCell>Despesas</TableCell><TableCell>CSV PRD</TableCell><TableCell>Previsto × Realizado × Despesas por obra + ROI</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
                <TableRow><TableCell>Documentos</TableCell><TableCell>CSV</TableCell><TableCell>Checklist completo Pré Obra + Ensaios e Projetos</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
                <TableRow><TableCell>PRD</TableCell><TableCell>CSV</TableCell><TableCell>Matriz mensal com Previsto/Realizado/Despesas</TableCell><TableCell>UTF-8 BOM</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-xs">Todos os CSVs usam separador ponto-vírgula (;) para compatibilidade com Excel Brasil.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 14 */}
        <AccordionItem value="s14" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> 14. Guia rápido — Gerente Financeiro</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <ol className="list-decimal pl-5 space-y-2">
              <li><strong>Receitas:</strong> Abra Receitas & Medições → aba Tabela. Filtre por status medição = "aprovada" e status NF = "emitida". Veja quais NFs faltam.</li>
              <li><strong>Previsão de Caixa:</strong> Na aba Previsão, veja as entradas esperadas dos próximos 12 meses por obra.</li>
              <li><strong>Despesas:</strong> Abra Despesas & Custos → aba Tabela. Confira gastos mensais e filtre por "em_fechamento" para ver o que precisa ser fechado.</li>
              <li><strong>PRD:</strong> Na aba PRD Completo, compare Receitas vs Despesas. Foque nas obras com ROI negativo (vermelho).</li>
              <li><strong>Exportar:</strong> Use os botões CSV em cada módulo para levar os dados ao Excel e montar planilhas de controle.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 15 */}
        <AccordionItem value="s15" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> 15. Guia rápido — Diretor</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <ol className="list-decimal pl-5 space-y-2">
              <li><strong>KPIs:</strong> Olhe os 6 cards no topo do Painel. Vermelho = ação imediata.</li>
              <li><strong>Alertas:</strong> Clique em "Alertas" para ver todas as criticidades consolidadas.</li>
              <li><strong>Gantt:</strong> Visualize prazos de todas as obras simultaneamente.</li>
              <li><strong>Analytics:</strong> Mapa + gráficos PRD + ranking de obras.</li>
              <li><strong>IA Insights:</strong> Clique "Gerar Insights" para receber 5 recomendações automáticas.</li>
              <li><strong>PDF:</strong> Exporte o relatório executivo para levar à reunião de diretoria.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 16 */}
        <AccordionItem value="s16" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> 16. Permissões — quem vê o quê</span>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground space-y-2 pb-4">
            <p>O administrador da empresa configura o acesso de cada usuário individualmente no painel de permissões.</p>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Perfil</TableHead><TableHead>Módulos acessíveis</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell><strong>Admin empresa</strong></TableCell><TableCell>Todos os módulos — acesso total</TableCell></TableRow>
                <TableRow><TableCell><strong>Gerente financeiro</strong></TableCell><TableCell>Receitas, Despesas, PRD (configurável pelo admin)</TableCell></TableRow>
                <TableRow><TableCell><strong>Engenheiro</strong></TableCell><TableCell>Painel, Documentação (configurável pelo admin)</TableCell></TableRow>
                <TableRow><TableCell><strong>Visualizador</strong></TableCell><TableCell>Somente leitura nos módulos habilitados (configurável)</TableCell></TableRow>
              </TableBody>
            </Table>
            <p className="text-xs">Cada módulo Holding tem seu próprio permissionId: holding, holding_receitas, holding_despesas, holding_documentos, holding_prd, holding_insights.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* FOOTER */}
      <div className="text-center pt-6 border-t border-border space-y-1">
        <p className="text-xs text-muted-foreground">Desenvolvido por Felipe Langmantel — ObraMap Módulo Holding · 2026</p>
        <p className="text-xs text-muted-foreground">6 módulos | 9 arquivos | 5.359 linhas | 6 tabelas Supabase</p>
      </div>
    </div>
  );
}