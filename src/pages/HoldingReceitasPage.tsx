import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";
import {
  TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Download, RefreshCw,
  Search, Calendar, FileText, X, Wallet, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { format, addMonths, startOfMonth, startOfWeek, endOfWeek, addWeeks, isSameWeek, isWithinInterval, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// ─── Types ───
interface MedicaoCompleta {
  id: string;
  obra_id: string;
  obra_nome: string;
  obra_empresa: string | null;
  obra_contrato: string | null;
  obra_scp: string | null;
  obra_uh: number | null;
  obra_responsavel: string | null;
  obra_tipo_contrato: string | null;
  num_medicao: string | null;
  mes_referencia: string | null;
  ano_referencia: number | null;
  data_previsao_medicao: string | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  status_medicao: "aprovada" | "enviada" | "pendente" | "nao_iniciada";
  valor_previsto_medicao: number;
  valor_medicao: number;
  num_nf: string | null;
  data_pagamento: string | null;
  status_nf: "recebido" | "aguardando_aprovacao" | "pendente";
}

// ─── Formatters ───
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : BRL.format(v);

const STATUS_MED_CONFIG: Record<string, { label: string; cls: string }> = {
  aprovada: { label: "Medição Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  enviada: { label: "Medição Enviada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente: { label: "Medição Pendente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciada: { label: "Não Iniciada", cls: "bg-muted text-muted-foreground" },
};

const STATUS_NF_CONFIG: Record<string, { label: string; cls: string }> = {
  recebido: { label: "Recebido NF", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  aguardando_aprovacao: { label: "Aguardando Aprov.", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function HoldingReceitasPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useAuth();

  const [activeTab, setActiveTab] = useState("resumo");
  const [filterObra, setFilterObra] = useState("all");
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterStatusMed, setFilterStatusMed] = useState("all");
  const [filterStatusNF, setFilterStatusNF] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [filterTipoContrato, setFilterTipoContrato] = useState("all");
  const [agrupamento, setAgrupamento] = useState<"semanal" | "quinzenal" | "mensal">("mensal");

  // ─── Data Fetching ───
  const { data, isLoading } = useQuery({
    queryKey: ["holding-receitas", company?.id],
    queryFn: async () => {
      // 1. Fetch obras for this company
      const { data: obras, error: obrasError } = await supabase
        .from("obras_portfolio")
        .select("id, nome, empresa, num_contrato, valor_contrato, parceria_scp, uh, responsavel, tipo_contrato")
        .eq("company_id", company!.id);

      if (obrasError) throw obrasError;
      const obrasList = obras || [];
      const obraIds = obrasList.map(o => o.id);

      if (obraIds.length === 0) return { obras: obrasList, medicoes: [] };

      // 2. Fetch medicoes filtered by obra_ids (server-side filter)
      const { data: medicoes, error: medError } = await supabase
        .from("medicoes_ple")
        .select("*")
        .in("obra_id", obraIds);

      if (medError) throw medError;

      const obrasMap = new Map(obrasList.map(o => [o.id, o]));
      const joined: MedicaoCompleta[] = (medicoes || []).map((m: any) => {
        const o = obrasMap.get(m.obra_id)!;
        return {
          id: m.id,
          obra_id: m.obra_id,
          obra_nome: o.nome,
          obra_empresa: o.empresa,
          obra_contrato: o.num_contrato,
          obra_scp: o.parceria_scp,
          obra_uh: (o as any).uh || null,
          obra_responsavel: (o as any).responsavel || null,
          obra_tipo_contrato: (o as any).tipo_contrato || null,
          num_medicao: m.num_medicao,
          mes_referencia: m.mes_referencia,
          ano_referencia: m.ano_referencia,
          data_previsao_medicao: m.data_previsao_medicao || null,
          data_envio: m.data_envio,
          data_aprovacao: m.data_aprovacao,
          status_medicao: m.status_medicao,
          valor_previsto_medicao: Number(m.valor_previsto_medicao) || 0,
          valor_medicao: Number(m.valor_medicao) || 0,
          num_nf: m.num_nf,
          data_pagamento: m.data_pagamento,
          status_nf: m.status_nf,
        };
      });
      return { obras: obrasList, medicoes: joined };
    },
    enabled: !!company?.id,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const obras = data?.obras || [];
  const medicoes = data?.medicoes || [];

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const aprovadas = medicoes.filter(m => m.status_medicao === "aprovada");
    const enviadas = medicoes.filter(m => m.status_medicao === "enviada");
    const pendentes = medicoes.filter(m => m.status_medicao === "pendente");
    const nfRecebida = medicoes.filter(m => m.status_nf === "recebido");

    return {
      totalGeral: medicoes.reduce((s, m) => s + m.valor_medicao, 0),
      totalAprovado: aprovadas.reduce((s, m) => s + m.valor_medicao, 0),
      totalEnviado: enviadas.reduce((s, m) => s + m.valor_medicao, 0),
      totalPendente: pendentes.reduce((s, m) => s + m.valor_medicao, 0),
      totalNFRecebida: nfRecebida.reduce((s, m) => s + m.valor_medicao, 0),
      totalAguardandoNF: medicoes.filter(m => m.status_nf === "aguardando_aprovacao").reduce((s, m) => s + m.valor_medicao, 0),
      countAprovadas: aprovadas.length,
      countEnviadas: enviadas.length,
      countPendentes: pendentes.length,
    };
  }, [medicoes]);

  // ─── Fluxo Mensal ───
  const fluxoData = useMemo(() => {
    const monthMap: Record<string, { mes: string; aprovado: number; enviado: number; pendente: number; nf_recebido: number }> = {};
    medicoes.forEach(m => {
      if (!m.mes_referencia || !m.ano_referencia) return;
      const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === m.mes_referencia!.substring(0, 3).toLowerCase());
      if (mesIdx < 0) return;
      const key = `${m.ano_referencia}-${String(mesIdx + 1).padStart(2, "0")}`;
      const label = `${MONTHS[mesIdx]}/${String(m.ano_referencia).slice(2)}`;
      if (!monthMap[key]) monthMap[key] = { mes: label, aprovado: 0, enviado: 0, pendente: 0, nf_recebido: 0 };
      if (m.status_medicao === "aprovada") monthMap[key].aprovado += m.valor_medicao;
      if (m.status_medicao === "enviada") monthMap[key].enviado += m.valor_medicao;
      if (m.status_medicao === "pendente") monthMap[key].pendente += m.valor_medicao;
      if (m.status_nf === "recebido") monthMap[key].nf_recebido += m.valor_medicao;
    });
    return Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [medicoes]);

  // ─── Filters ───
  const medicoesFiltradas = useMemo(() => {
    return medicoes.filter(m => {
      if (filterObra !== "all" && m.obra_id !== filterObra) return false;
      if (filterEmpresa !== "all" && m.obra_empresa !== filterEmpresa) return false;
      if (filterStatusMed !== "all" && m.status_medicao !== filterStatusMed) return false;
      if (filterStatusNF !== "all" && m.status_nf !== filterStatusNF) return false;
      if (filterTipoContrato !== "all" && m.obra_tipo_contrato !== filterTipoContrato) return false;
      if (searchText && !m.obra_nome.toLowerCase().includes(searchText.toLowerCase()) && !m.num_medicao?.includes(searchText)) return false;
      return true;
    });
  }, [medicoes, filterObra, filterEmpresa, filterStatusMed, filterStatusNF, filterTipoContrato, searchText]);

  const uniqueEmpresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))], [obras]);
  const hasActiveFilter = filterObra !== "all" || filterEmpresa !== "all" || filterStatusMed !== "all" || filterStatusNF !== "all" || filterTipoContrato !== "all" || searchText !== "";

  // ─── Top obras by medicao ───
  const topObrasByMedicao = useMemo(() => {
    const obraMap: Record<string, { nome: string; aprovado: number; pendente: number }> = {};
    medicoes.forEach(m => {
      if (!obraMap[m.obra_id]) obraMap[m.obra_id] = { nome: m.obra_nome, aprovado: 0, pendente: 0 };
      if (m.status_medicao === "aprovada") obraMap[m.obra_id].aprovado += m.valor_medicao;
      if (m.status_medicao === "pendente") obraMap[m.obra_id].pendente += m.valor_medicao;
    });
    return Object.values(obraMap)
      .sort((a, b) => (b.aprovado + b.pendente) - (a.aprovado + a.pendente))
      .slice(0, 8)
      .map(o => ({ ...o, nome: o.nome.length > 20 ? o.nome.slice(0, 20) + "…" : o.nome }));
  }, [medicoes]);

  // ─── Previsão 12 meses ───
  const next12Months = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const d = addMonths(startOfMonth(new Date()), i);
      return { date: d, key: format(d, "yyyy-MM"), label: format(d, "MMM/yy"), monthIdx: d.getMonth(), year: d.getFullYear() };
    }), []);

  const previsaoData = useMemo(() => {
    return next12Months.map(month => {
      const porMesRef = medicoes.filter(m => {
        if (!m.ano_referencia) return false;
        const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === (m.mes_referencia || "").substring(0, 3).toLowerCase());
        return mesIdx === month.monthIdx && m.ano_referencia === month.year;
      });
      const porPrevisao = medicoes.filter(m => {
        if (!m.data_previsao_medicao) return false;
        const d = new Date(m.data_previsao_medicao + "T12:00:00");
        return d.getMonth() === month.monthIdx && d.getFullYear() === month.year;
      });
      const obrasCount = new Set([...porMesRef, ...porPrevisao].map(m => m.obra_id)).size;
      return {
        mes: month.label,
        key: month.key,
        obrasCount,
        aprovado: porMesRef.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + m.valor_medicao, 0),
        enviado: porMesRef.filter(m => m.status_medicao === "enviada").reduce((s, m) => s + m.valor_medicao, 0),
        pendente: porMesRef.filter(m => m.status_medicao === "pendente").reduce((s, m) => s + m.valor_medicao, 0),
        nfRecebido: porMesRef.filter(m => m.status_nf === "recebido").reduce((s, m) => s + m.valor_medicao, 0),
        total: porMesRef.reduce((s, m) => s + m.valor_medicao, 0),
        previsto: porPrevisao.reduce((s, m) => s + (m.valor_previsto_medicao || 0), 0),
        countPrevistas: porPrevisao.length,
      };
    });
  }, [medicoes, next12Months]);

  // ─── Programação Financeira (Semanal / Quinzenal / Mensal) ───
  const programacaoData = useMemo(() => {
    const now = new Date();
    // Use data_envio, data_aprovacao, or data_previsao_medicao to determine when money arrives
    // Group by: expected receipt date based on status flow
    const medicoesComData = medicoes.map(m => {
      // Best date to estimate when this money enters: 
      // If NF recebido → data_pagamento
      // If aprovada → data_aprovacao (money coming soon)
      // If enviada → data_envio (waiting approval)
      // If pendente → data_previsao_medicao or mes/ano reference
      let dataRef: Date | null = null;
      let statusEntrada = "pendente";

      if (m.status_nf === "recebido" && m.data_pagamento) {
        dataRef = new Date(m.data_pagamento + "T12:00:00");
        statusEntrada = "recebido";
      } else if (m.status_medicao === "aprovada" && m.data_aprovacao) {
        dataRef = new Date(m.data_aprovacao + "T12:00:00");
        statusEntrada = "aprovado";
      } else if (m.status_medicao === "enviada" && m.data_envio) {
        dataRef = new Date(m.data_envio + "T12:00:00");
        statusEntrada = "enviado";
      } else if (m.data_previsao_medicao) {
        dataRef = new Date(m.data_previsao_medicao + "T12:00:00");
        statusEntrada = "previsto";
      } else if (m.mes_referencia && m.ano_referencia) {
        const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === m.mes_referencia!.substring(0, 3).toLowerCase());
        if (mesIdx >= 0) {
          dataRef = new Date(m.ano_referencia, mesIdx, 15);
          statusEntrada = "estimado";
        }
      }

      return { ...m, dataRef, statusEntrada };
    }).filter(m => m.dataRef !== null);

    if (agrupamento === "semanal") {
      // Next 12 weeks
      const weeks: { label: string; start: Date; end: Date; recebido: number; aprovado: number; enviado: number; pendente: number; total: number; medicoes: typeof medicoesComData }[] = [];
      for (let i = 0; i < 12; i++) {
        const weekStart = startOfWeek(addWeeks(now, i), { locale: ptBR });
        const weekEnd = endOfWeek(addWeeks(now, i), { locale: ptBR });
        const medsInWeek = medicoesComData.filter(m =>
          m.dataRef! >= weekStart && m.dataRef! <= weekEnd
        );
        weeks.push({
          label: `${format(weekStart, "dd/MM")} - ${format(weekEnd, "dd/MM")}`,
          start: weekStart,
          end: weekEnd,
          recebido: medsInWeek.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + m.valor_medicao, 0),
          aprovado: medsInWeek.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + m.valor_medicao, 0),
          enviado: medsInWeek.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + m.valor_medicao, 0),
          pendente: medsInWeek.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + m.valor_medicao, 0),
          total: medsInWeek.reduce((s, m) => s + m.valor_medicao, 0),
          medicoes: medsInWeek,
        });
      }
      return weeks;
    } else if (agrupamento === "quinzenal") {
      // Next 6 fortnights (12 weeks)
      const fortnights: { label: string; start: Date; end: Date; recebido: number; aprovado: number; enviado: number; pendente: number; total: number; medicoes: typeof medicoesComData }[] = [];
      for (let i = 0; i < 6; i++) {
        const fStart = addDays(now, i * 14);
        const fEnd = addDays(now, (i + 1) * 14 - 1);
        const medsInPeriod = medicoesComData.filter(m =>
          m.dataRef! >= fStart && m.dataRef! <= fEnd
        );
        fortnights.push({
          label: `${format(fStart, "dd/MM")} - ${format(fEnd, "dd/MM")}`,
          start: fStart,
          end: fEnd,
          recebido: medsInPeriod.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + m.valor_medicao, 0),
          aprovado: medsInPeriod.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + m.valor_medicao, 0),
          enviado: medsInPeriod.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + m.valor_medicao, 0),
          pendente: medsInPeriod.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + m.valor_medicao, 0),
          total: medsInPeriod.reduce((s, m) => s + m.valor_medicao, 0),
          medicoes: medsInPeriod,
        });
      }
      return fortnights;
    } else {
      // Next 6 months
      return Array.from({ length: 6 }, (_, i) => {
        const monthStart = startOfMonth(addMonths(now, i));
        const monthEnd = startOfMonth(addMonths(now, i + 1));
        const medsInMonth = medicoesComData.filter(m =>
          m.dataRef! >= monthStart && m.dataRef! < monthEnd
        );
        return {
          label: format(monthStart, "MMM/yy", { locale: ptBR }),
          start: monthStart,
          end: monthEnd,
          recebido: medsInMonth.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + m.valor_medicao, 0),
          aprovado: medsInMonth.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + m.valor_medicao, 0),
          enviado: medsInMonth.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + m.valor_medicao, 0),
          pendente: medsInMonth.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + m.valor_medicao, 0),
          total: medsInMonth.reduce((s, m) => s + m.valor_medicao, 0),
          medicoes: medsInMonth,
        };
      });
    }
  }, [medicoes, agrupamento]);

  // ─── Insights ───
  const insights = useMemo(() => {
    const enviadas = medicoes.filter(m => m.status_medicao === "enviada" || m.status_medicao === "pendente");
    const first = enviadas.sort((a, b) => (a.data_envio || "z").localeCompare(b.data_envio || "z"))[0];
    const next3 = previsaoData.slice(0, 3).reduce((s, p) => s + p.total, 0);
    const obraIds = new Set(medicoes.map(m => m.obra_id));
    const obrasSem = obras.filter(o => !obraIds.has(o.id));
    return { proximaEntrada: first, totalProx3Meses: next3, obrasSemMedicao: obrasSem };
  }, [medicoes, obras, previsaoData]);

  // ─── CSV Export ───
  const exportarCSV = () => {
    const headers = ["#", "Obra", "Empresa", "Contrato", "Nº Medição", "Mês Ref", "Ano Ref", "Prev. Envio", "Val. Previsto", "Data Envio", "Data Aprovação", "Status Medição", "Valor Medição", "Nº NF", "Data Pagamento", "Status NF"];
    const rows = medicoesFiltradas.map((m, i) => [
      i + 1, m.obra_nome, m.obra_empresa || "", m.obra_contrato || "",
      m.num_medicao || "", m.mes_referencia || "", m.ano_referencia || "",
      m.data_previsao_medicao || "", m.valor_previsto_medicao.toFixed(2),
      m.data_envio || "", m.data_aprovacao || "",
      m.status_medicao, m.valor_medicao.toFixed(2),
      m.num_nf || "", m.data_pagamento || "", m.status_nf
    ]);
    const csv = [headers, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `receitas-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  const clearFilters = () => {
    setFilterObra("all"); setFilterEmpresa("all"); setFilterStatusMed("all"); setFilterStatusNF("all"); setFilterTipoContrato("all"); setSearchText("");
  };

  // ─── Programação summary KPIs ───
  const progSummary = useMemo(() => {
    const totalRecebido = programacaoData.reduce((s, p) => s + p.recebido, 0);
    const totalAprovado = programacaoData.reduce((s, p) => s + p.aprovado, 0);
    const totalEnviado = programacaoData.reduce((s, p) => s + p.enviado, 0);
    const totalPendente = programacaoData.reduce((s, p) => s + p.pendente, 0);
    const totalGeral = programacaoData.reduce((s, p) => s + p.total, 0);
    return { totalRecebido, totalAprovado, totalEnviado, totalPendente, totalGeral };
  }, [programacaoData]);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
        <main className="flex-1 min-w-0 h-full overflow-auto">
    <div className="space-y-4 p-4 md:p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />Receitas & Medições PLE
          </h1>
          <p className="text-xs text-muted-foreground">Gestão financeira de entradas — todas as obras do portfólio</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportarCSV}><Download className="h-4 w-4" /> Exportar CSV</Button>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["holding-receitas"] })}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
        </div>
      </div>
            {/* 5 KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              <Card className="border-b-2 border-b-muted-foreground/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><DollarSign className="h-3.5 w-3.5" />Total Geral</div>
                  <p className="text-xl font-bold">{BRL.format(kpis.totalGeral)}</p>
                  <p className="text-[10px] text-muted-foreground">{medicoes.length} medições</p>
                </CardContent>
              </Card>
              <Card className="border-b-2 border-b-emerald-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Medições Aprovadas</div>
                  <p className="text-xl font-bold text-emerald-600">{BRL.format(kpis.totalAprovado)}</p>
                  <p className="text-[10px] text-muted-foreground">{kpis.countAprovadas} medições</p>
                </CardContent>
              </Card>
              <Card className="border-b-2 border-b-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5 text-blue-500" />Aguardando Aprovação</div>
                  <p className="text-xl font-bold text-blue-600">{BRL.format(kpis.totalEnviado)}</p>
                  <p className="text-[10px] text-muted-foreground">{kpis.countEnviadas} medições</p>
                </CardContent>
              </Card>
              <Card className="border-b-2 border-b-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><AlertCircle className="h-3.5 w-3.5 text-amber-500" />Medições Pendentes</div>
                  <p className="text-xl font-bold text-amber-600">{BRL.format(kpis.totalPendente)}</p>
                  <p className="text-[10px] text-muted-foreground">{kpis.countPendentes} medições</p>
                </CardContent>
              </Card>
              <Card className="border-b-2 border-b-emerald-400">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><FileText className="h-3.5 w-3.5 text-emerald-400" />NF Recebida</div>
                  <p className="text-xl font-bold text-emerald-500">{BRL.format(kpis.totalNFRecebida)}</p>
                  <p className="text-[10px] text-muted-foreground">Receita confirmada</p>
                </CardContent>
              </Card>
            </div>

            {/* TABS */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 max-w-lg">
                <TabsTrigger value="resumo">📊 Resumo</TabsTrigger>
                <TabsTrigger value="tabela">📋 Tabela</TabsTrigger>
                <TabsTrigger value="previsao">📅 Previsão</TabsTrigger>
                <TabsTrigger value="programacao">💰 Programação</TabsTrigger>
              </TabsList>

              {/* ═══ TAB RESUMO ═══ */}
              <TabsContent value="resumo" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Fluxo Mensal de Medições</CardTitle></CardHeader>
                    <CardContent>
                      {fluxoData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={fluxoData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="mes" fontSize={10} />
                            <YAxis tickFormatter={(v) => BRL_SHORT(v)} fontSize={10} />
                            <Tooltip formatter={(v: number) => BRL.format(v)} />
                            <Legend />
                            <Area type="monotone" dataKey="aprovado" name="Aprovado" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                            <Area type="monotone" dataKey="nf_recebido" name="NF Recebida" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                            <Area type="monotone" dataKey="enviado" name="Enviada" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                            <Area type="monotone" dataKey="pendente" name="Pendente" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-12">Nenhuma medição com mês/ano de referência.</p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Top Obras por Medição</CardTitle></CardHeader>
                    <CardContent>
                      {topObrasByMedicao.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart layout="vertical" data={topObrasByMedicao}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <YAxis type="category" dataKey="nome" width={160} fontSize={10} />
                            <XAxis type="number" tickFormatter={(v) => BRL_SHORT(v)} fontSize={10} />
                            <Tooltip formatter={(v: number) => BRL.format(v)} />
                            <Legend />
                            <Bar dataKey="aprovado" name="Aprovado" fill="#22c55e" stackId="a" />
                            <Bar dataKey="pendente" name="Pendente" fill="#f59e0b" stackId="a" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-12">Sem dados.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Obras com medição aprovada</p>
                    <p className="text-2xl font-bold">{new Set(medicoes.filter(m => m.status_medicao === "aprovada").map(m => m.obra_id)).size} / {obras.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Valor médio por medição</p>
                    <p className="text-2xl font-bold">{kpis.countAprovadas > 0 ? BRL.format(kpis.totalAprovado / kpis.countAprovadas) : "—"}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Aguardando pagamento NF</p>
                    <p className="text-2xl font-bold text-amber-600">{BRL.format(kpis.totalAguardandoNF)}</p>
                  </CardContent></Card>
                </div>
              </TabsContent>

              {/* ═══ TAB TABELA ═══ */}
              <TabsContent value="tabela" className="space-y-3 mt-4">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-8 w-48 text-xs pl-7" placeholder="Buscar obra ou medição..." value={searchText} onChange={e => setSearchText(e.target.value)} />
                  </div>
                  <Select value={filterObra} onValueChange={setFilterObra}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todas Obras" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Obras</SelectItem>
                      {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Todas Empresas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas Empresas</SelectItem>
                      {uniqueEmpresas.map(e => <SelectItem key={e!} value={e!}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterStatusMed} onValueChange={setFilterStatusMed}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Status Medição" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Status Medição</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="enviada">Enviada</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterStatusNF} onValueChange={setFilterStatusNF}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status NF" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Status NF</SelectItem>
                      <SelectItem value="recebido">Recebido</SelectItem>
                      <SelectItem value="aguardando_aprovacao">Aguardando Aprov.</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterTipoContrato} onValueChange={setFilterTipoContrato}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Tipo Contrato" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Tipos</SelectItem>
                      <SelectItem value="Ata Estado RS">Ata Estado RS</SelectItem>
                      <SelectItem value="Licitação">Licitação</SelectItem>
                      <SelectItem value="Adesão">Adesão</SelectItem>
                      <SelectItem value="Moradia Popular">Moradia Popular</SelectItem>
                      <SelectItem value="Moradia Faixa I">Moradia Faixa I</SelectItem>
                      <SelectItem value="Moradia Faixa II">Moradia Faixa II</SelectItem>
                      <SelectItem value="Alto Padrão">Alto Padrão</SelectItem>
                      <SelectItem value="Projeto de Obra">Projeto de Obra</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="secondary" className="text-xs">{medicoesFiltradas.length} medições</Badge>
                  {hasActiveFilter && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2"><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow className="bg-muted/50">
                         <TableHead colSpan={6} className="text-center text-xs font-bold border-r">IDENTIFICAÇÃO</TableHead>
                          <TableHead colSpan={9} className="text-center text-xs font-bold border-r text-blue-600">ENGENHARIA</TableHead>
                          <TableHead colSpan={3} className="text-center text-xs font-bold text-emerald-600">FINANCEIRO</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-xs w-8">#</TableHead>
                        <TableHead className="text-xs">Obra</TableHead>
                        <TableHead className="text-xs">Empresa</TableHead>
                         <TableHead className="text-xs border-r">Contrato</TableHead>
                         <TableHead className="text-xs text-center">UH</TableHead>
                         <TableHead className="text-xs">Tipo</TableHead>
                         <TableHead className="text-xs">Nº Med.</TableHead>
                        <TableHead className="text-xs">Mês</TableHead>
                        <TableHead className="text-xs">Ano</TableHead>
                         <TableHead className="text-xs">Prev. Envio</TableHead>
                         <TableHead className="text-xs text-right">Val. Previsto</TableHead>
                         <TableHead className="text-xs">Envio</TableHead>
                         <TableHead className="text-xs">Aprovação</TableHead>
                         <TableHead className="text-xs">Status Med.</TableHead>
                         <TableHead className="text-xs border-r text-right">Valor</TableHead>
                        <TableHead className="text-xs">Nº NF</TableHead>
                        <TableHead className="text-xs">Pagamento</TableHead>
                        <TableHead className="text-xs">Status NF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medicoesFiltradas.map((m, idx) => {
                        const ms = STATUS_MED_CONFIG[m.status_medicao] || STATUS_MED_CONFIG.nao_iniciada;
                        const ns = STATUS_NF_CONFIG[m.status_nf] || STATUS_NF_CONFIG.pendente;
                        return (
                          <TableRow key={m.id} className={`text-xs ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                            <TableCell className="py-2">{idx + 1}</TableCell>
                            <TableCell className="py-2 font-medium">{m.obra_nome}</TableCell>
                            <TableCell className="py-2">{m.obra_empresa || "—"}</TableCell>
                             <TableCell className="py-2 border-r">{m.obra_contrato || "—"}</TableCell>
                             <TableCell className="py-2 text-center">{m.obra_uh || "—"}</TableCell>
                             <TableCell className="py-2">{m.obra_tipo_contrato || "—"}</TableCell>
                             <TableCell className="py-2">{m.num_medicao || "—"}</TableCell>
                            <TableCell className="py-2">{m.mes_referencia || "—"}</TableCell>
                            <TableCell className="py-2">{m.ano_referencia || "—"}</TableCell>
                             <TableCell className="py-2">{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                             <TableCell className="py-2 text-right">{m.valor_previsto_medicao > 0 ? BRL.format(m.valor_previsto_medicao) : "—"}</TableCell>
                             <TableCell className="py-2">{m.data_envio ? format(new Date(m.data_envio + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                             <TableCell className="py-2">{m.data_aprovacao ? format(new Date(m.data_aprovacao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                             <TableCell className="py-2"><Badge className={`text-[10px] ${ms.cls}`} variant="secondary">{ms.label}</Badge></TableCell>
                             <TableCell className="py-2 border-r text-right font-medium">{BRL.format(m.valor_medicao)}</TableCell>
                            <TableCell className="py-2">{m.num_nf || "—"}</TableCell>
                            <TableCell className="py-2">{m.data_pagamento ? format(new Date(m.data_pagamento + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                            <TableCell className="py-2"><Badge className={`text-[10px] ${ns.cls}`} variant="secondary">{ns.label}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                      {medicoesFiltradas.length === 0 && (
                        <TableRow><TableCell colSpan={18} className="text-center py-8 text-muted-foreground">Nenhuma medição encontrada.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer totals */}
                <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
                  <span>{medicoesFiltradas.length} medições encontradas</span>
                  <span>
                    <strong>Total:</strong> {BRL.format(medicoesFiltradas.reduce((s, m) => s + m.valor_medicao, 0))}
                    {" | "}
                    <strong>Aprovado:</strong> {BRL.format(medicoesFiltradas.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + m.valor_medicao, 0))}
                  </span>
                </div>
              </TabsContent>

              {/* ═══ TAB PREVISÃO ═══ */}
              <TabsContent value="previsao" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-sm">Previsão de Caixa — Próximos 12 Meses</CardTitle>
                        <p className="text-xs text-muted-foreground">Projeção das entradas futuras baseada no calendário de medições</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                             <TableHead className="text-xs">Mês</TableHead>
                             <TableHead className="text-xs text-center">Obras</TableHead>
                             <TableHead className="text-xs text-right">Previsto</TableHead>
                             <TableHead className="text-xs text-right">Pendente</TableHead>
                             <TableHead className="text-xs text-right">Enviada</TableHead>
                             <TableHead className="text-xs text-right">Aprovada</TableHead>
                             <TableHead className="text-xs text-right">NF Recebida</TableHead>
                             <TableHead className="text-xs text-right font-bold">Total Mês</TableHead>
                             <TableHead className="text-xs text-right">Desvio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previsaoData.map((p, i) => {
                            const isCurrentMonth = i === 0;
                            const hasData = p.total > 0;
                            return (
                               <TableRow key={p.mes} className={`text-xs ${isCurrentMonth ? "bg-primary/5 border-l-2 border-l-primary" : hasData ? "bg-emerald-500/5" : "bg-muted/20"}`}>
                                 <TableCell className="py-2 font-medium">{p.mes}</TableCell>
                                 <TableCell className="py-2 text-center">{p.obrasCount || "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-primary">{p.previsto > 0 ? BRL_SHORT(p.previsto) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-amber-600">{p.pendente > 0 ? BRL.format(p.pendente) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-blue-600">{p.enviado > 0 ? BRL.format(p.enviado) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-emerald-600">{p.aprovado > 0 ? BRL.format(p.aprovado) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-emerald-500">{p.nfRecebido > 0 ? BRL.format(p.nfRecebido) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right font-bold">{p.total > 0 ? BRL.format(p.total) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right">
                                   {p.previsto > 0 && p.total > 0 ? (() => {
                                     const desvio = p.total - p.previsto;
                                     return <span className={desvio >= 0 ? "text-emerald-600" : "text-amber-600"}>{desvio >= 0 ? "+" : ""}{BRL_SHORT(Math.abs(desvio))}</span>;
                                   })() : "—"}
                                 </TableCell>
                               </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Chart */}
                    <div className="mt-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={previsaoData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="mes" fontSize={10} />
                          <YAxis tickFormatter={(v) => BRL_SHORT(v)} fontSize={10} />
                          <Tooltip formatter={(v: number) => BRL.format(v)} />
                          <Legend />
                          <Bar dataKey="aprovado" name="Aprovado" fill="#22c55e" />
                          <Bar dataKey="enviado" name="Enviado" fill="#3b82f6" />
                          <Bar dataKey="pendente" name="Pendente" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Insight cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Próxima entrada esperada</p>
                      <p className="text-sm font-semibold">
                        {insights.proximaEntrada ? `${insights.proximaEntrada.obra_nome} — ${BRL.format(insights.proximaEntrada.valor_medicao)}` : "Nenhuma medição pendente"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Total previsto próx. 3 meses</p>
                      <p className="text-sm font-semibold text-emerald-600">{BRL.format(insights.totalProx3Meses)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Valor previsto próx. 3 meses</p>
                      <p className="text-sm font-semibold text-primary">{BRL_SHORT(previsaoData.slice(0, 3).reduce((s, p) => s + p.previsto, 0))}</p>
                      <p className="text-[10px] text-muted-foreground">baseado nas datas de previsão cadastradas</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">Obras sem medição lançada</p>
                      <p className="text-sm font-semibold">{insights.obrasSemMedicao.length} obra{insights.obrasSemMedicao.length !== 1 ? "s" : ""}</p>
                      {insights.obrasSemMedicao.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{insights.obrasSemMedicao.map(o => o.nome).join(", ")}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ═══ TAB PROGRAMAÇÃO FINANCEIRA ═══ */}
              <TabsContent value="programacao" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-primary" />
                        <div>
                          <CardTitle className="text-sm">Programação de Entradas — Visão Financeira</CardTitle>
                          <p className="text-xs text-muted-foreground">Entradas previstas por período para planejamento de pagamentos</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={agrupamento === "semanal" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setAgrupamento("semanal")}
                        >
                          Semanal
                        </Button>
                        <Button
                          size="sm"
                          variant={agrupamento === "quinzenal" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setAgrupamento("quinzenal")}
                        >
                          Quinzenal
                        </Button>
                        <Button
                          size="sm"
                          variant={agrupamento === "mensal" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => setAgrupamento("mensal")}
                        >
                          Mensal
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Summary KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">💚 Recebido (NF)</p>
                        <p className="text-sm font-bold text-emerald-600">{BRL_SHORT(progSummary.totalRecebido)}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">✅ Aprovado</p>
                        <p className="text-sm font-bold text-emerald-500">{BRL_SHORT(progSummary.totalAprovado)}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">📤 Enviado</p>
                        <p className="text-sm font-bold text-blue-600">{BRL_SHORT(progSummary.totalEnviado)}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">⏳ Previsto/Estimado</p>
                        <p className="text-sm font-bold text-amber-600">{BRL_SHORT(progSummary.totalPendente)}</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center bg-primary/5">
                        <p className="text-[10px] text-muted-foreground font-semibold">Total Período</p>
                        <p className="text-sm font-bold">{BRL_SHORT(progSummary.totalGeral)}</p>
                      </div>
                    </div>

                    {/* Chart */}
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={programacaoData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="label" fontSize={9} />
                        <YAxis tickFormatter={(v) => BRL_SHORT(v)} fontSize={9} />
                        <Tooltip formatter={(v: number) => BRL.format(v)} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="recebido" name="NF Recebida" fill="#22c55e" stackId="a" />
                        <Bar dataKey="aprovado" name="Aprovado" fill="#10b981" stackId="a" />
                        <Bar dataKey="enviado" name="Enviado" fill="#3b82f6" stackId="a" />
                        <Bar dataKey="pendente" name="Previsto" fill="#f59e0b" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Detail Table */}
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Período</TableHead>
                            <TableHead className="text-xs text-right text-emerald-600">Recebido</TableHead>
                            <TableHead className="text-xs text-right text-emerald-500">Aprovado</TableHead>
                            <TableHead className="text-xs text-right text-blue-600">Enviado</TableHead>
                            <TableHead className="text-xs text-right text-amber-600">Previsto</TableHead>
                            <TableHead className="text-xs text-right font-bold">Total</TableHead>
                            <TableHead className="text-xs text-right font-bold">Acumulado</TableHead>
                            <TableHead className="text-xs text-center">Medições</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(() => {
                            let acumulado = 0;
                            return programacaoData.map((p, i) => {
                              acumulado += p.total;
                              const hasData = p.total > 0;
                              return (
                                <TableRow key={i} className={`text-xs ${hasData ? "" : "bg-muted/20"}`}>
                                  <TableCell className="py-2 font-medium">{p.label}</TableCell>
                                  <TableCell className="py-2 text-right text-emerald-600">{p.recebido > 0 ? BRL.format(p.recebido) : "—"}</TableCell>
                                  <TableCell className="py-2 text-right text-emerald-500">{p.aprovado > 0 ? BRL.format(p.aprovado) : "—"}</TableCell>
                                  <TableCell className="py-2 text-right text-blue-600">{p.enviado > 0 ? BRL.format(p.enviado) : "—"}</TableCell>
                                  <TableCell className="py-2 text-right text-amber-600">{p.pendente > 0 ? BRL.format(p.pendente) : "—"}</TableCell>
                                  <TableCell className="py-2 text-right font-bold">{p.total > 0 ? BRL.format(p.total) : "—"}</TableCell>
                                  <TableCell className="py-2 text-right font-semibold">{acumulado > 0 ? BRL.format(acumulado) : "—"}</TableCell>
                                  <TableCell className="py-2 text-center">
                                    {p.medicoes.length > 0 ? (
                                      <Badge variant="secondary" className="text-[10px]">{p.medicoes.length}</Badge>
                                    ) : "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Detail: Medições por período */}
                    {programacaoData.some(p => p.medicoes.length > 0) && (
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs text-muted-foreground">Detalhamento — Medições por Período</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {programacaoData.filter(p => p.medicoes.length > 0).map((p, i) => (
                              <div key={i}>
                                <p className="text-xs font-semibold mb-1">{p.label} — {BRL.format(p.total)}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                                  {p.medicoes.map((m: any) => {
                                    const statusCfg = STATUS_MED_CONFIG[m.status_medicao] || STATUS_MED_CONFIG.nao_iniciada;
                                    return (
                                      <div key={m.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                                        <span className="font-medium truncate">{m.obra_nome}</span>
                                        <span className="text-muted-foreground">Med {m.num_medicao || "—"}</span>
                                        <Badge className={`text-[9px] ${statusCfg.cls}`} variant="secondary">{statusCfg.label}</Badge>
                                        <span className="font-semibold whitespace-nowrap">{BRL.format(m.valor_medicao)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Financial planning tip */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary mb-1">💡 Dica para o Financeiro</p>
                      <p className="text-[11px] text-muted-foreground">
                        Use a visão <strong>Semanal</strong> para programar pagamentos de curto prazo. 
                        A <strong>Quinzenal</strong> para ciclos de pagamento a fornecedores. 
                        E a <strong>Mensal</strong> para planejamento de fluxo de caixa geral.
                        O <strong>Acumulado</strong> mostra o valor disponível total para decisões de pagamento.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}