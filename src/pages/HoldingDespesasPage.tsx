import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Line
} from "recharts";
import {
  Receipt, DollarSign, CheckCircle2, Clock, AlertCircle, Download, RefreshCw,
  Search, X, Info
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// ─── Types ───
interface DespesaCompleta {
  id: string;
  obra_id: string;
  obra_nome: string;
  obra_empresa: string | null;
  obra_contrato: string | null;
  obra_uh: number | null;
  mes_referencia: string | null;
  ano_referencia: number | null;
  valor: number;
  status: "fechado" | "em_fechamento" | "nao_iniciado";
}

interface ObraBasic {
  id: string;
  nome: string;
  empresa: string | null;
  num_contrato: string | null;
  valor_contrato: number;
  uh: number | null;
  aditivo_valor_total: number;
}

// ─── Formatters ───
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : `R$ ${(v / 1000).toFixed(0)}k`;
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_DESP: Record<string, { label: string; cls: string }> = {
  fechado: { label: "Fechado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  em_fechamento: { label: "Em Fechamento", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciado: { label: "Não Iniciado", cls: "bg-muted text-muted-foreground" },
};

export default function HoldingDespesasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useAuth();

  const [activeTab, setActiveTab] = useState("resumo");
  const [filterObra, setFilterObra] = useState("all");
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchText, setSearchText] = useState("");

  // ─── Data Fetching ───
  const { data, isLoading } = useQuery({
    queryKey: ["holding-despesas", company?.id],
    queryFn: async () => {
      // Buscar obras primeiro para ter os IDs (evita buscar dados de outras empresas)
      const { data: obrasRaw } = await supabase
        .from("obras_portfolio")
        .select("id, nome, empresa, num_contrato, valor_contrato, uh, aditivo_valor_total")
        .eq("company_id", company!.id);

      const obras: ObraBasic[] = obrasRaw || [];
      const obrasMap = new Map(obras.map(o => [o.id, o]));
      const obraIds = obras.map(o => o.id);

      const [despesasRes, medicoesRes] = await Promise.all([
        obraIds.length > 0
          ? supabase.from("despesas_mensais").select("*").in("obra_id", obraIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        obraIds.length > 0
          ? supabase.from("medicoes_ple").select("*").in("obra_id", obraIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const despesas: DespesaCompleta[] = (despesasRes.data || [])
        .filter((d: any) => obrasMap.has(d.obra_id))
        .map((d: any) => {
          const o = obrasMap.get(d.obra_id)!;
          return {
            id: d.id, obra_id: d.obra_id, obra_nome: o.nome, obra_empresa: o.empresa,
            obra_contrato: o.num_contrato, obra_uh: o.uh,
            mes_referencia: d.mes_referencia, ano_referencia: d.ano_referencia,
            valor: Number(d.valor) || 0, status: d.status || "nao_iniciado",
          };
        });

      const medicoes = (medicoesRes.data || []).filter((m: any) => obrasMap.has(m.obra_id));

      return { obras, despesas, medicoes, obrasMap };
    },
    enabled: !!company?.id,
  });

  // ─── Realtime: auto-update on data changes ───
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`holding-despesas-${company.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "despesas_mensais" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-despesas", company?.id] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "medicoes_ple" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-despesas", company?.id] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "obras_portfolio" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-despesas", company?.id] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, company?.id]);

  const obras = data?.obras || [];
  const despesas = data?.despesas || [];
  const medicoes = data?.medicoes || [];
  const obrasMap = data?.obrasMap || new Map();

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
    const totalFechado = despesas.filter(d => d.status === "fechado").reduce((s, d) => s + d.valor, 0);
    const totalEmFechamento = despesas.filter(d => d.status === "em_fechamento").reduce((s, d) => s + d.valor, 0);
    const totalNaoIniciado = despesas.filter(d => d.status === "nao_iniciado").reduce((s, d) => s + d.valor, 0);
    const countObrasComDespesa = new Set(despesas.map(d => d.obra_id)).size;
    return { totalDespesas, totalFechado, totalEmFechamento, totalNaoIniciado, countObrasComDespesa };
  }, [despesas]);

  // ─── Filters ───
  const despesasFiltradas = useMemo(() => {
    return despesas.filter(d => {
      if (filterObra !== "all" && d.obra_id !== filterObra) return false;
      if (filterEmpresa !== "all" && d.obra_empresa !== filterEmpresa) return false;
      if (filterStatus !== "all" && d.status !== filterStatus) return false;
      if (searchText) {
        const s = searchText.toLowerCase();
        if (!d.obra_nome.toLowerCase().includes(s) && !(d.obra_contrato || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [despesas, filterObra, filterEmpresa, filterStatus, searchText]);

  const uniqueObras = useMemo(() => [...new Map(despesas.map(d => [d.obra_id, { id: d.obra_id, nome: d.obra_nome }])).values()], [despesas]);
  const uniqueEmpresas = useMemo(() => [...new Set(despesas.map(d => d.obra_empresa).filter(Boolean))], [despesas]);
  const hasFilter = filterObra !== "all" || filterEmpresa !== "all" || filterStatus !== "all" || !!searchText;

  // ─── Monthly Flow ───
  const fluxoData = useMemo(() => {
    const map = new Map<string, { fechado: number; em_fechamento: number; nao_iniciado: number }>();
    despesas.forEach(d => {
      if (!d.mes_referencia || !d.ano_referencia) return;
      const mi = MONTHS.findIndex(mn => mn.toLowerCase() === (d.mes_referencia || "").substring(0,3).toLowerCase());
      const key = `${d.ano_referencia}-${String(mi >= 0 ? mi + 1 : 1).padStart(2, "0")}`;
      const cur = map.get(key) || { fechado: 0, em_fechamento: 0, nao_iniciado: 0 };
      if (d.status === "fechado") cur.fechado += d.valor;
      else if (d.status === "em_fechamento") cur.em_fechamento += d.valor;
      else cur.nao_iniciado += d.valor;
      map.set(key, cur);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
      const [y, m] = k.split("-");
      return { name: `${MONTHS[Number(m) - 1]}/${y.slice(2)}`, ...v, total: v.fechado + v.em_fechamento + v.nao_iniciado };
    });
  }, [despesas]);

  // ─── PRD Data ───
  const prdData = useMemo(() => {
    return obras.map(o => {
      const previsto = (o.valor_contrato || 0) + (o.aditivo_valor_total || 0);
      const realizado = medicoes.filter((m: any) => m.obra_id === o.id && m.status_medicao === "aprovada").reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
      const desp = despesas.filter(d => d.obra_id === o.id).reduce((s, d) => s + d.valor, 0);
      const saldo = realizado - desp;
      const roi = desp > 0 ? ((realizado - desp) / desp) * 100 : 0;
      return { nome: o.nome.length > 14 ? o.nome.slice(0, 12) + "…" : o.nome, fullName: o.nome, uh: o.uh || 0, previsto, realizado, despesas: desp, saldo, roi, id: o.id };
    }).filter(o => o.previsto > 0 || o.realizado > 0 || o.despesas > 0);
  }, [obras, medicoes, despesas]);

  // ─── Top obras by despesa ───
  const topObrasDespesa = useMemo(() => {
    const grouped = new Map<string, { nome: string; total: number }>();
    despesas.forEach(d => {
      const cur = grouped.get(d.obra_id) || { nome: d.obra_nome, total: 0 };
      cur.total += d.valor;
      grouped.set(d.obra_id, cur);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total).slice(0, 8).map(g => ({
      nome: g.nome.length > 18 ? g.nome.slice(0, 16) + "…" : g.nome, total: g.total,
    }));
  }, [despesas]);

  // ─── Summary Stats ───
  const summaryStats = useMemo(() => {
    const obrasComDespesa = new Set(despesas.map(d => d.obra_id));
    const media = obrasComDespesa.size > 0 ? kpis.totalDespesas / obrasComDespesa.size : 0;
    const maiorGastoObra = topObrasDespesa[0] || null;
    const monthMap = new Map<string, number>();
    despesas.forEach(d => {
      if (!d.mes_referencia || !d.ano_referencia) return;
      const k = `${d.mes_referencia}/${d.ano_referencia}`;
      monthMap.set(k, (monthMap.get(k) || 0) + d.valor);
    });
    let maiorMes = { mes: "—", valor: 0 };
    monthMap.forEach((v, k) => { if (v > maiorMes.valor) maiorMes = { mes: k, valor: v }; });
    return { media, maiorGastoObra, maiorMes };
  }, [despesas, kpis, topObrasDespesa]);

  // ─── CSV Export ───
  const exportarCSV = () => {
    const headers = ["#", "Obra", "Empresa", "Contrato", "UH", "Mês", "Ano", "Valor", "Status"];
    const rows = despesasFiltradas.map((d, i) => [
      i + 1, d.obra_nome, d.obra_empresa || "", d.obra_contrato || "",
      d.obra_uh || "", d.mes_referencia || "", d.ano_referencia || "",
      d.valor.toFixed(2), d.status
    ]);
    const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `despesas-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const exportarPRD = () => {
    const headers = ["Obra", "UH", "Valor Contrato", "Medições Aprovadas", "Despesas", "Saldo", "ROI%"];
    const rows = prdData.map(p => [
      p.fullName, p.uh, p.previsto.toFixed(2), p.realizado.toFixed(2),
      p.despesas.toFixed(2), p.saldo.toFixed(2), p.roi.toFixed(1) + "%"
    ]);
    const totals = ["TOTAL", "", prdData.reduce((s, p) => s + p.previsto, 0).toFixed(2),
      prdData.reduce((s, p) => s + p.realizado, 0).toFixed(2),
      prdData.reduce((s, p) => s + p.despesas, 0).toFixed(2),
      prdData.reduce((s, p) => s + p.saldo, 0).toFixed(2), ""];
    const csv = [headers, ...rows, totals].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `prd-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("PRD exportado!");
  };

  const clearFilters = () => {
    setFilterObra("all"); setFilterEmpresa("all"); setFilterStatus("all"); setSearchText("");
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

  const kpiCards = [
    { label: "Total Lançado", value: BRL.format(kpis.totalDespesas), border: "border-b-muted-foreground/30", icon: DollarSign },
    { label: "Fechado", value: BRL.format(kpis.totalFechado), border: "border-b-emerald-500", icon: CheckCircle2 },
    { label: "Em Fechamento", value: BRL.format(kpis.totalEmFechamento), border: "border-b-amber-500", icon: Clock },
    { label: "Não Iniciado", value: BRL.format(kpis.totalNaoIniciado), border: "border-b-muted-foreground/20", icon: AlertCircle },
    { label: "Obras com Despesa", value: String(kpis.countObrasComDespesa), border: "border-b-primary", icon: Receipt },
  ];

  const prdTotals = {
    previsto: prdData.reduce((s, p) => s + p.previsto, 0),
    realizado: prdData.reduce((s, p) => s + p.realizado, 0),
    despesas: prdData.reduce((s, p) => s + p.despesas, 0),
    saldo: prdData.reduce((s, p) => s + p.saldo, 0),
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
        <main className="flex-1 min-w-0 h-full overflow-auto">
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Despesas & Custos
          </h1>
          <p className="text-xs text-muted-foreground">Gestão de custos mensais — todas as obras do portfólio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCSV}><Download className="h-4 w-4" /> Exportar CSV</Button>
          
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="tabela">Tabela</TabsTrigger>
          <TabsTrigger value="prd">PRD Completo</TabsTrigger>
        </TabsList>

        {/* ═══ TAB RESUMO ═══ */}
        <TabsContent value="resumo" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Monthly Flow */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Fluxo Mensal de Despesas</p>
                {fluxoData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={fluxoData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={9} tickFormatter={(v) => BRL_SHORT(v)} />
                      <Tooltip formatter={(v: number) => BRL.format(v)} />
                      <Legend />
                      <Area type="monotone" dataKey="fechado" name="Fechado" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                      <Area type="monotone" dataKey="em_fechamento" name="Em Fechamento" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="nao_iniciado" name="Não Iniciado" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-10">Nenhuma despesa lançada</p>}
              </CardContent>
            </Card>

            {/* Top obras by expense */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">Top 8 Obras por Despesa Total</p>
                {topObrasDespesa.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topObrasDespesa} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" fontSize={9} tickFormatter={(v) => BRL_SHORT(v)} />
                      <YAxis type="category" dataKey="nome" width={130} fontSize={10} />
                      <Tooltip formatter={(v: number) => BRL.format(v)} />
                      <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-10">Sem dados</p>}
              </CardContent>
            </Card>
          </div>

          {/* Summary cards */}
          <div className="grid md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Média despesa por obra</p>
                <p className="text-lg font-bold mt-1">{BRL.format(summaryStats.media)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Obra com maior gasto</p>
                <p className="text-lg font-bold mt-1">{summaryStats.maiorGastoObra?.nome || "—"}</p>
                {summaryStats.maiorGastoObra && <p className="text-xs text-muted-foreground">{BRL.format(summaryStats.maiorGastoObra.total)}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Mês com maior despesa</p>
                <p className="text-lg font-bold mt-1">{summaryStats.maiorMes.mes}</p>
                {summaryStats.maiorMes.valor > 0 && <p className="text-xs text-muted-foreground">{BRL.format(summaryStats.maiorMes.valor)}</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB TABELA ═══ */}
        <TabsContent value="tabela" className="space-y-3 mt-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar obra..." className="pl-8 h-9 w-48 text-xs" value={searchText} onChange={e => setSearchText(e.target.value)} />
            </div>
            <Select value={filterObra} onValueChange={setFilterObra}>
              <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Obras</SelectItem>
                {uniqueObras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueEmpresas.map(e => <SelectItem key={e!} value={e!}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                {Object.entries(STATUS_DESP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilter && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10 text-xs">#</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs">Contrato</TableHead>
                  <TableHead className="text-xs">UH</TableHead>
                  <TableHead className="text-xs">Mês/Ano</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {despesasFiltradas.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma despesa encontrada</TableCell></TableRow>
                ) : despesasFiltradas.map((d, i) => {
                  const st = STATUS_DESP[d.status] || STATUS_DESP.nao_iniciado;
                  return (
                    <TableRow key={d.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{d.obra_nome}</TableCell>
                      <TableCell className="text-xs">{d.obra_empresa || "—"}</TableCell>
                      <TableCell className="text-xs">{d.obra_contrato || "—"}</TableCell>
                      <TableCell className="text-xs">{d.obra_uh || "—"}</TableCell>
                      <TableCell className="text-xs">{d.mes_referencia && d.ano_referencia ? `${d.mes_referencia}/${d.ano_referencia}` : "—"}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{BRL.format(d.valor)}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${st.cls}`}>{st.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
            <span>{despesasFiltradas.length} registros</span>
            <div className="flex gap-4">
              <span>Total: <strong className="text-foreground">{BRL.format(despesasFiltradas.reduce((s, d) => s + d.valor, 0))}</strong></span>
              <span>Fechado: <strong className="text-emerald-600">{BRL.format(despesasFiltradas.filter(d => d.status === "fechado").reduce((s, d) => s + d.valor, 0))}</strong></span>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB PRD COMPLETO ═══ */}
        <TabsContent value="prd" className="space-y-4 mt-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong>PRD</strong> = <span className="text-blue-600">Previsto</span> (valor contrato) × <span className="text-emerald-600">Realizado</span> (medições aprovadas) × <span className="text-red-600">Despesas</span> (gastos lançados). A linha roxa mostra o saldo (Realizado − Despesas).
              </p>
            </CardContent>
          </Card>

          {/* PRD Chart */}
          {prdData.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(600, prdData.length * 60) }}>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={prdData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="nome" fontSize={9} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis yAxisId="left" fontSize={9} tickFormatter={(v) => BRL_SHORT(v)} />
                        <YAxis yAxisId="right" orientation="right" fontSize={9} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                        <Tooltip
                          formatter={(v: number, name: string) => name === "ROI %" ? `${v.toFixed(1)}%` : BRL.format(v)}
                          labelFormatter={(l) => {
                            const item = prdData.find(p => p.nome === l);
                            return item?.fullName || l;
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="previsto" name="Previsto" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                        <Bar yAxisId="left" dataKey="realizado" name="Realizado" fill="#22c55e" radius={[2, 2, 0, 0]} />
                        <Bar yAxisId="left" dataKey="despesas" name="Despesas" fill="#ef4444" radius={[2, 2, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="roi" name="ROI %" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : <p className="text-sm text-muted-foreground text-center py-6">Sem dados para exibir</p>}

          {/* PRD Table */}
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Detalhamento PRD por Obra</p>
            <Button variant="outline" size="sm" onClick={exportarPRD}><Download className="h-4 w-4 mr-1" /> Exportar PRD</Button>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">UH</TableHead>
                  <TableHead className="text-xs text-right">Valor Contrato</TableHead>
                  <TableHead className="text-xs text-right">Medições Aprovadas</TableHead>
                  <TableHead className="text-xs text-right">Despesas</TableHead>
                  <TableHead className="text-xs text-right">Saldo</TableHead>
                  <TableHead className="text-xs text-right">ROI%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prdData.map((p, i) => (
                  <TableRow key={p.id || i} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    <TableCell className="text-xs font-medium">{p.fullName}</TableCell>
                    <TableCell className="text-xs">{p.uh || "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(p.previsto)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(p.realizado)}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(p.despesas)}</TableCell>
                    <TableCell className={`text-xs text-right font-mono font-semibold ${p.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{BRL.format(p.saldo)}</TableCell>
                    <TableCell className={`text-xs text-right font-semibold ${p.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>{p.roi.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {/* Totals */}
                <TableRow className="border-t-2 font-bold bg-muted/30">
                  <TableCell className="text-xs">TOTAL</TableCell>
                  <TableCell className="text-xs">{prdData.reduce((s, p) => s + p.uh, 0)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(prdTotals.previsto)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(prdTotals.realizado)}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{BRL.format(prdTotals.despesas)}</TableCell>
                  <TableCell className={`text-xs text-right font-mono ${prdTotals.saldo >= 0 ? "text-emerald-600" : "text-red-600"}`}>{BRL.format(prdTotals.saldo)}</TableCell>
                  <TableCell className="text-xs text-right">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
