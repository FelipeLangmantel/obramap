import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ComposedChart, Bar, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";
import { BarChart2, TrendingUp, DollarSign, AlertTriangle, Download } from "lucide-react";
import { format, addMonths, differenceInMonths } from "date-fns";
import { toast } from "sonner";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : `R$ ${(v / 1000).toFixed(0)}k`;
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface ObraFull {
  id: string; nome: string; empresa: string | null; valor_contrato: number;
  data_inicio: string | null; prazo_dias: number; uh: number | null; status: string;
}

interface MonthEntry {
  key: string; label: string; mes: number; ano: number;
  previsto: number; realizado: number; despesas: number;
}

export default function HoldingPrdPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [activeTab, setActiveTab] = useState("portfolio");
  const [filterObra, setFilterObra] = useState("all");
  const [selectedObra, setSelectedObra] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["holding-prd", company?.id],
    queryFn: async () => {
      const [obrasRes, medRes, despRes] = await Promise.all([
        supabase.from("obras_portfolio").select("id, nome, empresa, valor_contrato, data_inicio, prazo_dias, uh, status").eq("company_id", company!.id),
        supabase.from("medicoes_ple").select("*"),
        supabase.from("despesas_mensais").select("*"),
      ]);
      return { obras: (obrasRes.data || []) as ObraFull[], medicoes: medRes.data || [], despesas: despRes.data || [] };
    },
    enabled: !!company?.id,
  });

  const obras = data?.obras || [];
  const medicoes = data?.medicoes || [];
  const despesas = data?.despesas || [];
  const obraIds = new Set(obras.map(o => o.id));

  // Build month matrix per obra
  const obraMonthData = useMemo(() => {
    const result = new Map<string, { obra: ObraFull; months: MonthEntry[] }>();

    obras.forEach(o => {
      if (!o.data_inicio) return;
      const start = new Date(o.data_inicio);
      const prazoMeses = Math.max(1, Math.ceil(o.prazo_dias / 30));
      const monthlyPrevisto = o.valor_contrato / prazoMeses;
      const months: MonthEntry[] = [];

      for (let i = 0; i < prazoMeses; i++) {
        const d = addMonths(start, i);
        const mes = d.getMonth(); // 0-based
        const ano = d.getFullYear();
        const key = `${ano}-${String(mes + 1).padStart(2, "0")}`;

        const realizado = medicoes
          .filter((m: any) => m.obra_id === o.id && m.status_medicao === "aprovada" && MONTHS.indexOf(m.mes_referencia) === mes && m.ano_referencia === ano)
          .reduce((s: number, m: any) => s + (Number(m.valor_medicao) || 0), 0);

        const desp = despesas
          .filter((d: any) => d.obra_id === o.id && MONTHS.indexOf(d.mes_referencia) === mes && d.ano_referencia === ano)
          .reduce((s: number, d: any) => s + (Number(d.valor) || 0), 0);

        months.push({ key, label: `${MONTHS[mes]}/${String(ano).slice(2)}`, mes: mes + 1, ano, previsto: monthlyPrevisto, realizado, despesas: desp });
      }

      result.set(o.id, { obra: o, months });
    });

    return result;
  }, [obras, medicoes, despesas]);

  // All unique months sorted
  const allMonths = useMemo(() => {
    const set = new Map<string, { label: string; mes: number; ano: number }>();
    obraMonthData.forEach(({ months }) => months.forEach(m => set.set(m.key, { label: m.label, mes: m.mes, ano: m.ano })));
    return [...set.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => ({ key, ...v }));
  }, [obraMonthData]);

  // Portfolio combined monthly
  const portfolioMonthly = useMemo(() => {
    return allMonths.map(month => {
      let previsto = 0, realizado = 0, desp = 0;
      obraMonthData.forEach(({ months }) => {
        const m = months.find(e => e.key === month.key);
        if (m) { previsto += m.previsto; realizado += m.realizado; desp += m.despesas; }
      });
      const desvio = previsto > 0 ? (realizado / previsto) * 100 : 0;
      return { name: month.label, previsto, realizado, despesas: desp, desvio };
    });
  }, [allMonths, obraMonthData]);

  // KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let previstoAcum = 0;
    obraMonthData.forEach(({ months }) => {
      months.filter(m => m.key <= nowKey).forEach(m => { previstoAcum += m.previsto; });
    });
    const realizadoAcum = medicoes
      .filter((m: any) => obraIds.has(m.obra_id) && m.status_medicao === "aprovada")
      .reduce((s: number, m: any) => s + (Number(m.valor_medicao) || 0), 0);
    const despesasAcum = despesas
      .filter((d: any) => obraIds.has(d.obra_id) && d.status === "fechado")
      .reduce((s: number, d: any) => s + (Number(d.valor) || 0), 0);
    const desvio = previstoAcum > 0 ? (realizadoAcum / previstoAcum) * 100 : 0;
    return { previstoAcum, realizadoAcum, despesasAcum, desvio };
  }, [obraMonthData, medicoes, despesas, obraIds]);

  // Per-obra summary
  const obraSummary = useMemo(() => {
    return obras.map(o => {
      const entry = obraMonthData.get(o.id);
      const previsto = entry ? entry.months.reduce((s, m) => s + m.previsto, 0) : o.valor_contrato;
      const realizado = medicoes.filter((m: any) => m.obra_id === o.id && m.status_medicao === "aprovada").reduce((s: number, m: any) => s + (Number(m.valor_medicao) || 0), 0);
      const desp = despesas.filter((d: any) => d.obra_id === o.id).reduce((s: number, d: any) => s + (Number(d.valor) || 0), 0);
      const exec = previsto > 0 ? (realizado / previsto) * 100 : 0;
      const saldo = realizado - desp;
      return { ...o, previsto, realizado, despesas: desp, exec, saldo };
    }).filter(o => filterObra === "all" || o.id === filterObra);
  }, [obras, obraMonthData, medicoes, despesas, filterObra]);

  // Selected obra monthly for "Por Obra" tab
  const selectedObraMonthly = useMemo(() => {
    if (selectedObra === "all") return [];
    const entry = obraMonthData.get(selectedObra);
    if (!entry) return [];
    let cumPrev = 0, cumReal = 0;
    return entry.months.map(m => {
      cumPrev += m.previsto; cumReal += m.realizado;
      return { ...m, name: m.label, cumPrevisto: cumPrev, cumRealizado: cumReal, desvio: m.previsto > 0 ? (m.realizado / m.previsto) * 100 : 0 };
    });
  }, [selectedObra, obraMonthData]);

  const exportCSV = () => {
    const monthCols = allMonths.map(m => m.label);
    const header = ["Obra", ...monthCols.flatMap(m => [`${m} Prev`, `${m} Real`, `${m} Desp`]), "Total Prev", "Total Real", "Total Desp"];
    const rows = obras.map(o => {
      const entry = obraMonthData.get(o.id);
      const cells = allMonths.map(month => {
        const m = entry?.months.find(e => e.key === month.key);
        return [m?.previsto.toFixed(2) || "0", m?.realizado.toFixed(2) || "0", m?.despesas.toFixed(2) || "0"];
      }).flat();
      const tp = entry?.months.reduce((s, m) => s + m.previsto, 0) || 0;
      const tr = entry?.months.reduce((s, m) => s + m.realizado, 0) || 0;
      const td = entry?.months.reduce((s, m) => s + m.despesas, 0) || 0;
      return [o.nome, ...cells, tp.toFixed(2), tr.toFixed(2), td.toFixed(2)];
    });
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `prd-mensal-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  if (isLoading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
          <main className="flex-1 min-w-0 h-full overflow-auto flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </main>
        </div>
      </SidebarProvider>
    );
  }
  }

  const desvioColor = kpis.desvio >= 90 ? "border-b-emerald-500" : kpis.desvio >= 70 ? "border-b-amber-500" : "border-b-red-500";

  const kpiCards = [
    { label: "Previsto Acumulado", value: BRL.format(kpis.previstoAcum), border: "border-b-blue-500", icon: BarChart2 },
    { label: "Realizado Acumulado", value: BRL.format(kpis.realizadoAcum), border: "border-b-emerald-500", icon: TrendingUp },
    { label: "Despesas Acumuladas", value: BRL.format(kpis.despesasAcum), border: "border-b-red-500", icon: DollarSign },
    { label: "Desvio Global", value: `${kpis.desvio.toFixed(1)}%`, border: desvioColor, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary" /> PRD — Previsto × Realizado × Despesas
          </h1>
          <p className="text-xs text-muted-foreground">Acompanhamento físico-financeiro do portfólio</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterObra} onValueChange={setFilterObra}>
            <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Obras</SelectItem>
              {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((k, i) => (
          <Card key={i} className={`border-b-2 ${k.border}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-xl font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="portfolio">Visão Portfólio</TabsTrigger>
          <TabsTrigger value="obra">Por Obra</TabsTrigger>
          <TabsTrigger value="tabela">Tabela Mensal</TabsTrigger>
        </TabsList>

        {/* ═══ VISÃO PORTFÓLIO ═══ */}
        <TabsContent value="portfolio" className="space-y-4 mt-4">
          {portfolioMonthly.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Evolução PRD Mensal — Portfólio Consolidado</p>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={portfolioMonthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis yAxisId="left" fontSize={9} tickFormatter={v => BRL_SHORT(v)} />
                    <YAxis yAxisId="right" orientation="right" fontSize={9} tickFormatter={v => `${v.toFixed(0)}%`} />
                    <Tooltip formatter={(v: number, name: string) => name === "Desvio %" ? `${v.toFixed(1)}%` : BRL.format(v)} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="previsto" name="Previsto" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="realizado" name="Realizado" fill="#22c55e" radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="left" dataKey="despesas" name="Despesas" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="desvio" name="Desvio %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Nenhuma obra com data de início para gerar projeção</p>}

          {/* Summary table */}
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs text-right">Previsto Total</TableHead>
                  <TableHead className="text-xs text-right">Realizado</TableHead>
                  <TableHead className="text-xs text-right">% Exec</TableHead>
                  <TableHead className="text-xs text-right">Despesas</TableHead>
                  <TableHead className="text-xs text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obraSummary.map((o, i) => (
                  <TableRow key={o.id} className={i % 2 ? "bg-muted/20" : ""}>
                    <TableCell className="text-xs font-medium">{o.nome}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(o.previsto)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(o.realizado)}</TableCell>
                    <TableCell className={`text-xs text-right font-semibold ${o.exec >= 90 ? "text-emerald-600" : o.exec >= 70 ? "text-amber-600" : "text-red-600"}`}>{o.exec.toFixed(1)}%</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(o.despesas)}</TableCell>
                    <TableCell className={`text-xs text-right font-mono font-semibold ${o.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{BRL.format(o.saldo)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold bg-muted/30">
                  <TableCell className="text-xs">TOTAL</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(obraSummary.reduce((s, o) => s + o.previsto, 0))}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(obraSummary.reduce((s, o) => s + o.realizado, 0))}</TableCell>
                  <TableCell className="text-xs text-right">—</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(obraSummary.reduce((s, o) => s + o.despesas, 0))}</TableCell>
                  <TableCell className={`text-xs text-right font-mono font-semibold ${obraSummary.reduce((s, o) => s + o.saldo, 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{BRL.format(obraSummary.reduce((s, o) => s + o.saldo, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══ POR OBRA ═══ */}
        <TabsContent value="obra" className="space-y-4 mt-4">
          <Select value={selectedObra} onValueChange={setSelectedObra}>
            <SelectTrigger className="h-9 w-56 text-xs"><SelectValue placeholder="Selecione uma obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Selecione uma obra...</SelectItem>
              {obras.filter(o => o.data_inicio).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedObra !== "all" && selectedObraMonthly.length > 0 ? (
            <>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">PRD Mensal — {obras.find(o => o.id === selectedObra)?.nome}</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={selectedObraMonthly}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis yAxisId="left" fontSize={9} tickFormatter={v => BRL_SHORT(v)} />
                      <YAxis yAxisId="right" orientation="right" fontSize={9} tickFormatter={v => `${v.toFixed(0)}%`} />
                      <Tooltip formatter={(v: number, name: string) => name === "Desvio %" ? `${v.toFixed(1)}%` : BRL.format(v)} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="previsto" name="Previsto" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="realizado" name="Realizado" fill="#22c55e" radius={[2, 2, 0, 0]} />
                      <Bar yAxisId="left" dataKey="despesas" name="Despesas" fill="#ef4444" radius={[2, 2, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="desvio" name="Desvio %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Curva S */}
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-3">Curva S — Acumulado</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={selectedObraMonthly}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={9} tickFormatter={v => BRL_SHORT(v)} />
                      <Tooltip formatter={(v: number) => BRL.format(v)} />
                      <Legend />
                      <Area type="monotone" dataKey="cumPrevisto" name="Previsto Acum." stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="cumRealizado" name="Realizado Acum." stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">{selectedObra === "all" ? "Selecione uma obra para ver o detalhamento mensal" : "Obra sem data de início para gerar projeção"}</p>
          )}
        </TabsContent>

        {/* ═══ TABELA MENSAL ═══ */}
        <TabsContent value="tabela" className="mt-4">
          {allMonths.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs sticky left-0 bg-background z-20 min-w-[140px]">Obra</TableHead>
                    {allMonths.map(m => (
                      <TableHead key={m.key} className="text-[9px] text-center min-w-[90px]">{m.label}</TableHead>
                    ))}
                    <TableHead className="text-xs text-center min-w-[90px] bg-muted/30">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {obras.map((o, i) => {
                    const entry = obraMonthData.get(o.id);
                    const tp = entry?.months.reduce((s, m) => s + m.previsto, 0) || 0;
                    const tr = entry?.months.reduce((s, m) => s + m.realizado, 0) || 0;
                    const td = entry?.months.reduce((s, m) => s + m.despesas, 0) || 0;
                    return (
                      <TableRow key={o.id} className={i % 2 ? "bg-muted/20" : ""}>
                        <TableCell className="text-xs font-medium sticky left-0 bg-background z-10">{o.nome}</TableCell>
                        {allMonths.map(month => {
                          const m = entry?.months.find(e => e.key === month.key);
                          if (!m) return <TableCell key={month.key} className="text-center text-muted-foreground/30 text-[9px]">—</TableCell>;
                          const pct = m.previsto > 0 ? (m.realizado / m.previsto) * 100 : 0;
                          const bg = pct >= 100 ? "bg-emerald-50 dark:bg-emerald-950/20" : pct >= 70 ? "bg-amber-50 dark:bg-amber-950/20" : m.realizado > 0 ? "bg-red-50 dark:bg-red-950/20" : "";
                          return (
                            <TableCell key={month.key} className={`text-[9px] text-center p-1 ${bg}`}>
                              <div className="text-blue-600">{BRL_SHORT(m.previsto)}</div>
                              <div className="text-emerald-600 font-semibold">{BRL_SHORT(m.realizado)}</div>
                              <div className="text-red-500">{BRL_SHORT(m.despesas)}</div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-[9px] text-center bg-muted/30 p-1">
                          <div className="text-blue-600">{BRL_SHORT(tp)}</div>
                          <div className="text-emerald-600 font-semibold">{BRL_SHORT(tr)}</div>
                          <div className="text-red-500">{BRL_SHORT(td)}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="border-t-2 font-bold bg-muted/30">
                    <TableCell className="text-xs sticky left-0 bg-muted/30 z-10">TOTAL</TableCell>
                    {allMonths.map(month => {
                      let tp = 0, tr = 0, td = 0;
                      obraMonthData.forEach(({ months }) => {
                        const m = months.find(e => e.key === month.key);
                        if (m) { tp += m.previsto; tr += m.realizado; td += m.despesas; }
                      });
                      return (
                        <TableCell key={month.key} className="text-[9px] text-center p-1">
                          <div className="text-blue-600">{BRL_SHORT(tp)}</div>
                          <div className="text-emerald-600">{BRL_SHORT(tr)}</div>
                          <div className="text-red-500">{BRL_SHORT(td)}</div>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-[9px] text-center p-1">
                      <div className="text-blue-600">{BRL_SHORT(portfolioMonthly.reduce((s, m) => s + m.previsto, 0))}</div>
                      <div className="text-emerald-600">{BRL_SHORT(portfolioMonthly.reduce((s, m) => s + m.realizado, 0))}</div>
                      <div className="text-red-500">{BRL_SHORT(portfolioMonthly.reduce((s, m) => s + m.despesas, 0))}</div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Nenhuma obra com data de início cadastrada</p>}

          <p className="text-[10px] text-muted-foreground mt-2">Legenda por célula: <span className="text-blue-600">Previsto</span> / <span className="text-emerald-600">Realizado</span> / <span className="text-red-500">Despesas</span></p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
