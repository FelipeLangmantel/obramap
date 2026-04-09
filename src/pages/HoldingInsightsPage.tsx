import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, NotificationBell } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, AlertTriangle, DollarSign, Building2, RefreshCw, Copy, FileDown, Clock, ShieldAlert, FileWarning, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, differenceInDays } from "date-fns";
import { calcHealth } from "@/components/holding/HoldingDashboardView";
const parseLocalDate = (d: string) => { const [y, m, day] = d.split("-").map(Number); return new Date(y, m - 1, day); };


const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface InsightItem {
  tipo: "risco" | "oportunidade" | "alerta" | "acao";
  titulo: string;
  descricao: string;
  impacto: "alto" | "medio" | "baixo";
  obra?: string | null;
}

export default function HoldingInsightsPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [relatorio, setRelatorio] = useState("");
  const [relatorioLoading, setRelatorioLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const { data } = useQuery({
    queryKey: ["holding-insights-data", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      // 1 round trip paralelo — RLS garante isolamento por empresa
      const [obrasRes, medRes, despRes, docsRes] = await Promise.all([
        supabase.from("obras_portfolio").select("*").eq("company_id", company!.id),
        supabase.from("medicoes_ple").select("id, obra_id, status_medicao, valor_medicao, valor_acatado, data_previsao_medicao, data_aprovacao"),
        supabase.from("despesas_mensais").select("id, obra_id, valor, mes_referencia, ano_referencia, tipo_despesa"),
        supabase.from("documentos_obra").select("id, obra_id, ata, ois, art, cno, impl, scp"),
      ]);

      return {
        obras: obrasRes.data || [],
        medicoes: medRes.data || [],
        despesas: despRes.data || [],
        docs: docsRes.data || [],
      };
    },
  });

  // ─── Realtime: auto-update on data changes ───
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`holding-insights-${company.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "medicoes_ple" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-insights-data", company?.id] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "despesas_mensais" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-insights-data", company?.id] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "obras_portfolio" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-insights-data", company?.id] });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "documentos_obra" }, () => {
          queryClient.invalidateQueries({ queryKey: ["holding-insights-data", company?.id] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, company?.id]);

  const obras = data?.obras || [];
  const medicoes = data?.medicoes || [];
  const despesas = data?.despesas || [];
  const docs = data?.docs || [];

  const DOC_FIELDS = ["ata", "ois", "art", "cno", "impl", "scp"] as const;

  const enrichedObras = useMemo(() => {
    return obras.map((o: any) => {
      const obraMeds = medicoes.filter((m: any) => m.obra_id === o.id);
      const obraDesps = despesas.filter((d: any) => d.obra_id === o.id);
      const obraDocs = docs.find((d: any) => d.obra_id === o.id);
      const docsCount = obraDocs ? DOC_FIELDS.filter(f => (obraDocs as any)[f] === true).length : 0;
      const totalReceitas = obraMeds.filter((m: any) => m.status_medicao === "aprovada").reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0) + (Number((o as any).valor_medido_inicial) || 0);
      const totalDesp = obraDesps.filter((d: any) => d.tipo_despesa === "real").reduce((s: number, d: any) => s + (d.valor || 0), 0);
      const diasRestantes = o.data_inicio && o.prazo_dias
        ? differenceInDays(addDays(parseLocalDate(o.data_inicio!), o.prazo_dias + (o.aditivo_prazo_dias || 0)), new Date())
        : null;
      // Usar a mesma lógica EVM do Painel Principal (IDC, IDP, dias, glosa)
      const health = calcHealth(o as any, obraMeds as any);
      return { ...o, docsCount, totalReceitas, totalDesp, diasRestantes, health, medsCount: obraMeds.length };
    });
  }, [obras, medicoes, despesas, docs]);

  const portfolioSummary = useMemo(() => ({
    totalObras: enrichedObras.length,
    obrasAtivas: enrichedObras.filter((o: any) => o.status === "em_andamento").length,
    totalContratos: enrichedObras.reduce((s: number, o: any) => s + (o.valor_contrato || 0) + (o.aditivo_valor_total || 0), 0),
    totalReceitas: enrichedObras.reduce((s: number, o: any) => s + o.totalReceitas, 0),
    totalDespesas: enrichedObras.reduce((s: number, o: any) => s + o.totalDesp, 0),
    moeda: "BRL",
    alertasCriticos: enrichedObras.filter((o: any) => o.health === "red").length,
    obrasCriticas: enrichedObras.filter((o: any) => o.health === "red").map((o: any) => ({ nome: o.nome, docsCount: o.docsCount, diasRestantes: o.diasRestantes })),
    prazosVencendo: enrichedObras.filter((o: any) => o.diasRestantes !== null && o.diasRestantes > 0 && o.diasRestantes <= 30).map((o: any) => ({ nome: o.nome, diasRestantes: o.diasRestantes })),
    medicoesPendentes: medicoes.filter((m: any) => m.status_medicao === "pendente").length,
    obrasNaoIniciadas: enrichedObras.filter((o: any) => o.status === "nao_iniciada").length,
    obrasConcluidas: enrichedObras.filter((o: any) => o.status === "concluida").length,
  }), [enrichedObras, medicoes]);

  // Pre-defined analyses (no AI needed)
  const riskObras = useMemo(() =>
    enrichedObras
      .filter((o: any) => o.diasRestantes !== null && o.diasRestantes < 30)
      .sort((a: any, b: any) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999))
      .slice(0, 5),
    [enrichedObras]
  );

  const doclessObras = useMemo(() =>
    enrichedObras.filter((o: any) => o.docsCount < 3).sort((a: any, b: any) => a.docsCount - b.docsCount),
    [enrichedObras]
  );

  const cashFlow3m = useMemo(() => {
    const now = new Date();
    const months: { label: string; receitas: number; despesas: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = format(d, "MMM/yy");
      const mes = format(d, "MMM").toLowerCase();
      const ano = d.getFullYear();
      const rec = medicoes.filter((m: any) => {
        if (!m.data_aprovacao) return false;
        const dt = new Date(m.data_aprovacao);
        return dt.getMonth() === d.getMonth() && dt.getFullYear() === d.getFullYear() && m.status_medicao === "aprovada";
      }).reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
      const desp = despesas.filter((dp: any) => {
        return dp.tipo_despesa === "real" && dp.ano_referencia === ano && dp.mes_referencia?.toLowerCase()?.startsWith(mes.slice(0, 3));
      }).reduce((s: number, dp: any) => s + (dp.valor || 0), 0);
      months.push({ label, receitas: rec, despesas: desp });
    }
    return months;
  }, [medicoes, despesas]);

  const handleGenerateInsights = async () => {
    if (enrichedObras.length === 0) { toast.error("Nenhuma obra cadastrada para analisar."); return; }
    setInsightsLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("holding-insights", {
        body: { type: "insights", portfolioSummary },
      });
      if (error) throw error;
      if (fnData?.error) throw new Error(fnData.error);
      const text = fnData?.result || "";
      // Clean markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setInsights(parsed.insights || []);
      setLastGenerated(new Date());
      toast.success("Insights gerados com sucesso!");
    } catch (e: any) {
      console.error("Insights error:", e);
      toast.error(e.message || "Erro ao gerar insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleGenerateRelatorio = async () => {
    if (enrichedObras.length === 0) { toast.error("Nenhuma obra cadastrada para analisar."); return; }
    setRelatorioLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke("holding-insights", {
        body: { type: "relatorio", portfolioSummary },
      });
      if (error) throw error;
      if (fnData?.error) throw new Error(fnData.error);
      setRelatorio(fnData?.result || "");
      toast.success("Relatório gerado com sucesso!");
    } catch (e: any) {
      console.error("Relatorio error:", e);
      toast.error(e.message || "Erro ao gerar relatório");
    } finally {
      setRelatorioLoading(false);
    }
  };

  const handleCopyRelatorio = () => {
    navigator.clipboard.writeText(relatorio);
    toast.success("Relatório copiado!");
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Relatório Executivo — Holding", 14, 20);
    doc.setFontSize(10);
    doc.text(format(new Date(), "dd/MM/yyyy HH:mm"), 14, 28);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(relatorio.replace(/[#*]/g, ""), 260);
    doc.text(lines, 14, 38);
    doc.save(`relatorio-holding-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF exportado!");
  };

  const TIPO_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    risco: { label: "Risco", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: <AlertTriangle className="h-4 w-4" /> },
    oportunidade: { label: "Oportunidade", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <TrendingUp className="h-4 w-4" /> },
    alerta: { label: "Alerta", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: <ShieldAlert className="h-4 w-4" /> },
    acao: { label: "Ação", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: <Sparkles className="h-4 w-4" /> },
  };

  const IMPACTO_CLS: Record<string, string> = {
    alto: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    medio: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    baixo: "bg-muted text-muted-foreground",
  };

  const kpiCards = [
    { label: "Obras no Portfólio", value: portfolioSummary.totalObras, color: "text-primary", icon: <Building2 className="h-5 w-5" /> },
    { label: "Valor Total Contratos", value: BRL.format(portfolioSummary.totalContratos), color: "text-emerald-600", icon: <DollarSign className="h-5 w-5" /> },
    { label: "Alertas Críticos", value: portfolioSummary.alertasCriticos, color: "text-red-600", icon: <AlertTriangle className="h-5 w-5" /> },
    { label: "Medições Pendentes", value: portfolioSummary.medicoesPendentes, color: "text-amber-600", icon: <Clock className="h-5 w-5" /> },
  ];

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
        <main className="flex-1 min-w-0 h-full overflow-auto">
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors" />
          <NotificationBell />
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">IA — Insights do Portfólio</h1>
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] h-5">BETA</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Análise automática gerada por inteligência artificial</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerateInsights} disabled={insightsLoading || enrichedObras.length === 0} className="gap-2">
            {insightsLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar Insights
          </Button>
          <Button variant="outline" onClick={handleGenerateRelatorio} disabled={relatorioLoading || enrichedObras.length === 0} className="gap-2">
            {relatorioLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Gerar Relatório
          </Button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <Card key={k.label} className="border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={k.color}>{k.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {lastGenerated && (
        <p className="text-xs text-muted-foreground">Última análise: {format(lastGenerated, "dd/MM/yyyy HH:mm")}</p>
      )}

      {/* AI Insights */}
      {insightsLoading && (
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analisando portfólio com IA...</p>
            <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
          </CardContent>
        </Card>
      )}

      {insights.length > 0 && !insightsLoading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Insights Gerados</h2>
            <Button variant="ghost" size="sm" onClick={handleGenerateInsights} className="gap-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((ins, i) => {
              const cfg = TIPO_CONFIG[ins.tipo] || TIPO_CONFIG.alerta;
              return (
                <Card key={i} className="border-l-4" style={{ borderLeftColor: ins.tipo === "risco" ? "#ef4444" : ins.tipo === "oportunidade" ? "#22c55e" : ins.tipo === "alerta" ? "#f59e0b" : "#3b82f6" }}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${cfg.cls} text-[10px] h-5 gap-1`}>{cfg.icon}{cfg.label}</Badge>
                      <Badge className={`${IMPACTO_CLS[ins.impacto] || ""} text-[10px] h-5`}>
                        {ins.impacto === "alto" ? "Alto Impacto" : ins.impacto === "medio" ? "Médio Impacto" : "Baixo Impacto"}
                      </Badge>
                    </div>
                    <p className="font-semibold text-sm text-foreground">{ins.titulo}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{ins.descricao}</p>
                    {ins.obra && <p className="text-[10px] text-muted-foreground">📍 {ins.obra}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Executive Report */}
      {relatorioLoading && (
        <Card className="border-dashed border-2 border-primary/30">
          <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando relatório executivo...</p>
          </CardContent>
        </Card>
      )}

      {relatorio && !relatorioLoading && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Relatório Executivo</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleCopyRelatorio} className="gap-1 text-xs">
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportPDF} className="gap-1 text-xs">
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
              {relatorio}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pre-defined Analyses (always visible, no AI) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Análises Pré-definidas</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Risk of Delay */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-red-500" />
                Obras com Risco de Atraso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {riskObras.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma obra com prazo próximo do vencimento.</p>
              ) : riskObras.map((o: any) => (
                <div key={o.id} className="flex justify-between items-center text-xs border-b border-border/40 pb-1.5">
                  <span className="font-medium truncate max-w-[140px]">{o.nome}</span>
                  <Badge variant="outline" className={`text-[10px] h-5 ${(o.diasRestantes ?? 0) < 0 ? "border-red-300 text-red-600" : "border-amber-300 text-amber-600"}`}>
                    {(o.diasRestantes ?? 0) < 0 ? `${Math.abs(o.diasRestantes)}d atrasado` : `${o.diasRestantes}d restantes`}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Missing Docs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-amber-500" />
                Obras sem Documentação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {doclessObras.length === 0 ? (
                <p className="text-xs text-muted-foreground">Todas as obras têm documentação adequada.</p>
              ) : doclessObras.slice(0, 5).map((o: any) => (
                <div key={o.id} className="flex justify-between items-center text-xs border-b border-border/40 pb-1.5">
                  <span className="font-medium truncate max-w-[140px]">{o.nome}</span>
                  <Badge variant="outline" className="text-[10px] h-5 border-red-300 text-red-600">{o.docsCount}/6 docs</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Cash Flow 3 months */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                Fluxo de Caixa — Próx. 3 Meses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cashFlow3m.map(m => (
                <div key={m.label} className="space-y-1 border-b border-border/40 pb-2 last:border-0">
                  <p className="text-xs font-medium">{m.label}</p>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-emerald-600">↑ {BRL.format(m.receitas)}</span>
                    <span className="text-red-600">↓ {BRL.format(m.despesas)}</span>
                    <span className={m.receitas - m.despesas >= 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                      = {BRL.format(m.receitas - m.despesas)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-muted-foreground pt-4">
        Desenvolvido por Felipe Langmantel — ObraMap Módulo Holding · IA Insights · 2026
      </p>
    </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
