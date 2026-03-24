import { BookOpen, Building2, FileCheck2, ClipboardList, DollarSign, BarChart3, AlertTriangle, FileDown, MapPin, Info } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
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
        <p className="text-lg font-medium text-foreground">Painel de Portfólio de Obras</p>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          Guia completo para diretores e engenheiros. Tudo que você precisa saber para usar e entender o módulo.
        </p>
        <div className="flex justify-center gap-6 pt-4">
          {[
            { num: "6", label: "Tabelas no banco" },
            { num: "3", label: "Visões do painel" },
            { num: "5", label: "Abas por obra" },
            { num: "4", label: "Tipos de alerta" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-primary">{s.num}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ACCORDION SECTIONS */}
      <Accordion type="multiple" className="space-y-2">
        {/* SECTION 1 */}
        <AccordionItem value="s1" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> O que é este módulo</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { icon: "📊", title: "Painel do Portfólio", desc: "Visão consolidada de todas as obras com KPIs, semáforo de saúde e alertas. Substitui as planilhas de acompanhamento." },
                { icon: "📋", title: "Ficha da Obra", desc: "5 abas por obra: Documentos, Medições PLE, Financeiro, Aditivos e Pendências. Tudo centralizado." },
                { icon: "📈", title: "Analytics", desc: "Mapa do RS, gráfico Previsto × Realizado × Despesas, evolução mensal e indicadores donut." },
                { icon: "📄", title: "Exportação PDF", desc: "Relatório executivo em 1 clique com capa, tabela colorida de obras e alertas. Pronto para reunião." },
              ].map((f) => (
                <Card key={f.title} className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <p className="font-medium text-sm">{f.icon} {f.title}</p>
                    <p className="text-xs text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 2 */}
        <AccordionItem value="s2" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Como navegar</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { title: "Cards", desc: "Grade de cards com semáforo de saúde. Clique em qualquer card para abrir a ficha completa da obra." },
                { title: "Gantt", desc: "Cronograma horizontal Jan/2025–Dez/2026. Linha vermelha = hoje. Barra terminando antes da linha = prazo vencido." },
                { title: "Analytics", desc: "Mapa RS + PRD Chart + Evolução Financeira + 3 indicadores donut calculados automaticamente." },
              ].map((v) => (
                <Card key={v.title} className="bg-muted/30">
                  <CardContent className="p-4 space-y-1">
                    <p className="font-medium text-sm">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{v.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 Os 4 KPIs do topo (Total Contratos, Medições Aprovadas, Obras Ativas, Alertas Críticos) ficam sempre visíveis em qualquer visão — calculados em tempo real.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 3 */}
        <AccordionItem value="s3" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Semáforo de saúde</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-4 bg-emerald-500/10 border-emerald-500/20 space-y-1">
                <p className="font-medium text-sm">🟢 Verde — Sob Controle</p>
                <p className="text-xs text-muted-foreground">≥5 documentos marcados E última medição Aprovada (ou sem medição ainda)</p>
              </div>
              <div className="rounded-lg border p-4 bg-amber-500/10 border-amber-500/20 space-y-1">
                <p className="font-medium text-sm">🟡 Amarelo — Atenção</p>
                <p className="text-xs text-muted-foreground">3–4 documentos marcados OU medição no status Enviada</p>
              </div>
              <div className="rounded-lg border p-4 bg-red-500/10 border-red-500/20 space-y-1">
                <p className="font-medium text-sm">🔴 Vermelho — Crítico</p>
                <p className="text-xs text-muted-foreground">Menos de 3 docs OU medição pendente há &gt;30 dias OU prazo vencido</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 4 */}
        <AccordionItem value="s4" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Como lançar dados</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {[
                { step: "A", title: "Cadastrar obra", desc: "Clique em '+ Nova Obra' no topo. Preencha nome, empresa, contrato, SCP, valor, data, prazo e município.", tip: "Use o botão 'Importar' para cadastrar várias obras de uma vez colando os dados em formato CSV." },
                { step: "B", title: "Documentos", desc: "Ficha da obra → aba Documentos. Use os toggles para marcar Doc_Obra (6 itens: Ata, OIS, ART, CNO, Impl, SCP) e Acomp_Obra (5 itens). Salva automaticamente.", tip: null },
                { step: "C", title: "Medições PLE", desc: "Ficha → aba Medições → + Nova Medição. Campos: Nº, Mês/Ano Ref, Data Envio, Status, Valor, Nº NF, Status NF.", tip: null },
                { step: "D", title: "Despesas mensais", desc: "Ficha → aba Financeiro → + Nova Despesa. Campos: Mês, Ano, Valor, Status (Não Iniciado → Em Fechamento → Fechado).", tip: null },
                { step: "E", title: "Aditivos", desc: "Ficha → aba Aditivos. Registre cada aditivo com: Nº, dias adicionados, valor, supressão, data e status. O Gantt e a previsão de fim atualizam automaticamente.", tip: null },
                { step: "F", title: "Pendências", desc: "Ficha → aba Pendências. Adicione qualquer pendência com tipo e descrição. Marque como concluída quando resolver.", tip: null },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <Badge className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full text-xs">{s.step}</Badge>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                    {s.tip && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">💡 {s.tip}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 5 */}
        <AccordionItem value="s5" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Alertas automáticos</span>
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Condição</TableHead>
                  <TableHead className="text-xs">Severidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { tipo: "Docs incompletos", cond: "< 4 dos 6 docs marcados", sev: "warning", label: "Atenção" },
                  { tipo: "Docs crítico", cond: "< 2 docs marcados", sev: "critical", label: "Crítico" },
                  { tipo: "Medição atrasada", cond: "Pendente há > 30 dias", sev: "warning", label: "Atenção" },
                  { tipo: "Medição muito atrasada", cond: "Pendente há > 60 dias", sev: "critical", label: "Crítico" },
                  { tipo: "Prazo próximo", cond: "< 30 dias para vencer", sev: "warning", label: "Atenção" },
                  { tipo: "Prazo urgente", cond: "< 7 dias para vencer", sev: "critical", label: "Crítico" },
                  { tipo: "Prazo vencido", cond: "Data prevista já passou", sev: "critical", label: "Crítico" },
                  { tipo: "Aditivo pendente", cond: 'Status "pendente"', sev: "info", label: "Info" },
                ].map((r) => (
                  <TableRow key={r.tipo}>
                    <TableCell className="text-xs font-medium">{r.tipo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.cond}</TableCell>
                    <TableCell>
                      <Badge variant={r.sev === "critical" ? "destructive" : r.sev === "warning" ? "secondary" : "outline"} className="text-[10px]">
                        {r.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 6 */}
        <AccordionItem value="s6" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Analytics e gráficos</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {[
                { icon: "🗺️", title: "Mapa do RS", desc: "Pins coloridos pelo semáforo de saúde. Hover mostra nome e valor. Clique abre a ficha. Para aparecer: preencha o campo Município com o nome exato da cidade." },
                { icon: "📊", title: "Gráfico PRD", desc: "3 barras por obra: Previsto (azul) = valor contrato, Realizado (verde) = medições aprovadas, Despesas (vermelho) = despesas lançadas." },
                { icon: "📈", title: "Evolução Financeira", desc: "Curva de área: receitas realizadas (verde) vs despesas (vermelho) mês a mês. Aparece quando há medições aprovadas ou despesas com mês/ano preenchidos." },
                { icon: "🎯", title: "Donuts", desc: "Documentação: % obras com ≥9/11 docs. Medições OK: % com medição aprovada. No Prazo: % obras em andamento dentro do prazo." },
              ].map((g) => (
                <div key={g.title} className="flex gap-3 items-start">
                  <span className="text-lg">{g.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{g.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 7 */}
        <AccordionItem value="s7" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><FileDown className="h-4 w-4 text-primary" /> Exportar PDF</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3">
            <p className="text-sm font-medium">Relatório executivo em 1 clique</p>
            <p className="text-xs text-muted-foreground">O PDF gerado contém 3 páginas:</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>Capa escura com nome da empresa, data e os 4 KPIs</li>
              <li>Tabela completa de obras — status colorido, % andamento, previsão de fim, docs, saúde</li>
              <li>Página de alertas (apenas críticos e atenção)</li>
            </ul>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 Use para apresentações de diretoria. Formato A4 paisagem, pronto para projetor ou impressão.
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground">O botão fica desabilitado se não houver obras cadastradas.</p>
          </AccordionContent>
        </AccordionItem>

        {/* SECTION 8 */}
        <AccordionItem value="s8" className="border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Guia rápido para diretores</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="space-y-3">
              {[
                'Acesse "Painel da Holding" no menu lateral (seção HOLDING)',
                "Veja o KPI \"Alertas Críticos\" — se > 0, clique nos alertas para ver o que precisa de ação",
                "Leia o semáforo: verde = OK, amarelo = atenção, vermelho = ação necessária",
                'Clique em "Gantt" — barra terminando antes da linha vermelha = prazo vencido',
                'Clique em "Exportar PDF" para levar o relatório para a reunião',
              ].map((text, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <Badge className="h-6 w-6 shrink-0 flex items-center justify-center rounded-full text-xs">{i + 1}</Badge>
                  <p className="text-sm">{text}</p>
                </div>
              ))}
            </div>
            <Card className="bg-amber-500/10 border-amber-500/20">
              <CardContent className="p-4">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Você não precisa lançar nenhum dado. Os engenheiros responsáveis alimentam o sistema. Você apenas consulta e toma decisões com base em dados atualizados.
                </p>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* FOOTER */}
      <div className="text-center pt-4 border-t">
        <p className="text-[10px] text-muted-foreground">
          Desenvolvido por Felipe Langmantel — ObraMap Módulo Holding · 2026
        </p>
      </div>
    </div>
  );
}
