import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ObraDetailDrawer from "./ObraDetailDrawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import {
  Crown,
  DollarSign,
  ClipboardCheck,
  Building2,
  AlertTriangle,
  Loader2,
  LayoutGrid,
  GanttChart,
  Eye,
  FileWarning,
  Clock,
  CalendarClock,
  FileCheck2,
  Plus,
  FileDown,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { addDays, format, differenceInDays, differenceInMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

interface ObraPortfolio {
  id: string;
  company_id: string;
  nome: string;
  empresa: string | null;
  num_contrato: string | null;
  parceria_scp: string | null;
  valor_contrato: number;
  data_inicio: string | null;
  prazo_dias: number;
  aditivo_prazo_dias: number;
  status: "em_andamento" | "nao_iniciada" | "concluida" | "paralisada";
  percentual_andamento: number;
  periodo_medicao: string | null;
  prazo_pagamento: string | null;
  created_at: string;
}

interface DocumentosObra {
  id: string;
  obra_id: string;
  ata: boolean;
  ois: boolean;
  art: boolean;
  cno: boolean;
  impl: boolean;
  scp: boolean;
  sondagem_spt: boolean;
  planta_localizacao: boolean;
  plano_altimetrico: boolean;
  painel_bordo: boolean;
  checklist_seguranca: boolean;
}

interface MedicaoPle {
  id: string;
  obra_id: string;
  num_medicao: string | null;
  mes_referencia: string | null;
  ano_referencia: number | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  status_medicao: "aprovada" | "enviada" | "pendente" | "nao_iniciada";
  valor_medicao: number;
  num_nf: string | null;
  data_pagamento: string | null;
  status_nf: "recebido" | "aguardando_aprovacao" | "pendente";
}

interface ObraEnriched extends ObraPortfolio {
  docs: DocumentosObra | null;
  latestMedicao: MedicaoPle | null;
  allMedicoes: MedicaoPle[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red";
}

interface HoldingAlert {
  id: string;
  obraId: string;
  obraNome: string;
  severity: "critical" | "warning" | "info";
  icon: any;
  message: string;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  em_andamento: { label: "Em Andamento", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  nao_iniciada: { label: "Não Iniciada", className: "bg-muted text-muted-foreground" },
  concluida: { label: "Concluída", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  paralisada: { label: "Paralisada", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const HEALTH_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  em_andamento: "hsl(217, 91%, 60%)",
  nao_iniciada: "hsl(220, 9%, 70%)",
  concluida: "hsl(142, 71%, 45%)",
  paralisada: "hsl(0, 72%, 50%)",
};

const SEVERITY_CONFIG: Record<string, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  warning: { label: "Atenção", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  info: { label: "Info", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

function countDocs(docs: DocumentosObra | null): { count: number; total: number } {
  if (!docs) return { count: 0, total: 11 };
  const fields: (keyof DocumentosObra)[] = [
    "ata", "ois", "art", "cno", "impl", "scp",
    "sondagem_spt", "planta_localizacao", "plano_altimetrico",
    "painel_bordo", "checklist_seguranca",
  ];
  return { count: fields.filter((f) => docs[f] === true).length, total: fields.length };
}

function calcHealth(docsCount: number, docsTotal: number, latestMedicao: MedicaoPle | null): "green" | "yellow" | "red" {
  const docsRatio = docsCount / docsTotal;
  const medicaoStatus = latestMedicao?.status_medicao;

  if (docsRatio < 3 / 11) return "red";
  if (medicaoStatus === "pendente") {
    if (latestMedicao?.data_envio) {
      const days = differenceInDays(new Date(), new Date(latestMedicao.data_envio));
      if (days > 30) return "red";
    }
    return "red";
  }
  if (docsRatio < 5 / 11) return "yellow";
  if (medicaoStatus === "enviada") return "yellow";
  if (docsRatio >= 5 / 11 && (!medicaoStatus || medicaoStatus === "aprovada")) return "green";
  return "yellow";
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function HoldingDashboardView() {
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [selectedObra, setSelectedObra] = useState<ObraEnriched | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "gantt">("cards");
  const [showNewObraDialog, setShowNewObraDialog] = useState(false);
  const [newObraForm, setNewObraForm] = useState({
    nome: "", empresa: "", num_contrato: "", parceria_scp: "",
    valor_contrato: "", data_inicio: "", prazo_dias: "",
    status: "nao_iniciada" as "nao_iniciada" | "em_andamento" | "concluida" | "paralisada",
    percentual_andamento: 0,
    periodo_medicao: "", prazo_pagamento: "",
  });
  const [savingObra, setSavingObra] = useState(false);
  const [editingObra, setEditingObra] = useState<ObraEnriched | null>(null);
  const [deletingObraId, setDeletingObraId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const exportarPDF = async () => {
    setIsPrinting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const today = format(new Date(), "dd/MM/yyyy");
      const companyName = (company as any)?.name || "Holding";

      // CAPA
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 297, 210, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(28);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório de Portfólio", 148, 55, { align: "center" });
      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text(companyName, 148, 70, { align: "center" });
      doc.setFontSize(11);
      doc.setTextColor(160, 160, 160);
      doc.text(`Gerado em ${today}`, 148, 82, { align: "center" });
      const kpiBoxes = [
        { label: "Total Contratos", value: BRL.format(kpis.totalContratos) },
        { label: "Medições Aprovadas", value: BRL.format(kpis.totalMedicoesAprovadas) },
        { label: "Obras Ativas", value: String(kpis.obrasAtivas) },
        { label: "Alertas Críticos", value: String(kpis.alertasCriticos) },
      ];
      kpiBoxes.forEach((k, i) => {
        const x = 18 + i * 66;
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(x, 108, 60, 28, 3, 3, "F");
        doc.setTextColor(120, 160, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(k.label, x + 30, 118, { align: "center" });
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(k.value, x + 30, 129, { align: "center" });
      });

      // TABELA DE OBRAS
      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Portfólio Detalhado", 14, 16);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(today, 283, 16, { align: "right" });

      const statusLbl: Record<string, string> = { em_andamento: "Em Andamento", nao_iniciada: "Não Iniciada", concluida: "Concluída", paralisada: "Paralisada" };
      const healthLbl: Record<string, string> = { green: "Verde", yellow: "Amarelo", red: "Vermelho" };
      const sorted = [...obras].sort((a, b) => ({ em_andamento: 0, nao_iniciada: 1, concluida: 2, paralisada: 3 }[a.status] ?? 9) - ({ em_andamento: 0, nao_iniciada: 1, concluida: 2, paralisada: 3 }[b.status] ?? 9));

      autoTable(doc, {
        startY: 22,
        head: [["Obra", "Contrato", "Empresa", "Valor", "Status", "%", "Prev. Fim", "Docs", "Saúde"]],
        body: sorted.map((o) => {
          const fim = o.data_inicio ? format(addDays(new Date(o.data_inicio), o.prazo_dias + o.aditivo_prazo_dias), "dd/MM/yy") : "—";
          return [o.nome, o.num_contrato || "—", o.empresa || "—", BRL.format(o.valor_contrato), statusLbl[o.status], `${o.percentual_andamento}%`, fim, `${o.docsCount}/${o.docsTotal}`, healthLbl[o.health]];
        }),
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
        columnStyles: { 3: { halign: "right" }, 5: { halign: "center" }, 7: { halign: "center" } },
        didParseCell: (data: any) => {
          if (data.section !== "body") return;
          if (data.column.index === 4) {
            const v = data.cell.raw;
            if (v === "Em Andamento") data.cell.styles.textColor = [37, 99, 235];
            else if (v === "Concluída") data.cell.styles.textColor = [22, 163, 74];
            else if (v === "Paralisada") data.cell.styles.textColor = [220, 38, 38];
          }
          if (data.column.index === 8) {
            const v = data.cell.raw;
            if (v === "Verde") data.cell.styles.textColor = [22, 163, 74];
            else if (v === "Amarelo") data.cell.styles.textColor = [202, 138, 4];
            else if (v === "Vermelho") data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      // ALERTAS
      const alertsToShow = alerts.filter((a) => a.severity !== "info");
      if (alertsToShow.length > 0) {
        doc.addPage();
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("Alertas do Portfólio", 14, 16);
        autoTable(doc, {
          startY: 22,
          head: [["Severidade", "Mensagem"]],
          body: alertsToShow.map((a) => [a.severity === "critical" ? "CRÍTICO" : "ATENÇÃO", a.message]),
          styles: { fontSize: 9 },
          headStyles: { fillColor: [15, 23, 42], textColor: 255 },
          didParseCell: (data: any) => {
            if (data.section === "body" && data.column.index === 0) {
              data.cell.styles.textColor = data.cell.raw === "CRÍTICO" ? [220, 38, 38] : [202, 138, 4];
            }
          },
        });
      }

      doc.save(`portfolio-holding-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar PDF. Tente novamente.");
      console.error(e);
    }
    setIsPrinting(false);
  };

  const resetNewObraForm = () => setNewObraForm({
    nome: "", empresa: "", num_contrato: "", parceria_scp: "",
    valor_contrato: "", data_inicio: "", prazo_dias: "",
    status: "nao_iniciada", percentual_andamento: 0,
    periodo_medicao: "", prazo_pagamento: "",
  });

  const handleSaveObra = async () => {
    if (!newObraForm.nome.trim() || !company?.id) {
      toast.error("Nome da obra é obrigatório.");
      return;
    }
    setSavingObra(true);
    const payload = {
      company_id: company.id,
      nome: newObraForm.nome.trim(),
      empresa: newObraForm.empresa || null,
      num_contrato: newObraForm.num_contrato || null,
      parceria_scp: newObraForm.parceria_scp || null,
      valor_contrato: Number(newObraForm.valor_contrato) || 0,
      data_inicio: newObraForm.data_inicio || null,
      prazo_dias: Number(newObraForm.prazo_dias) || 0,
      status: newObraForm.status,
      percentual_andamento: newObraForm.percentual_andamento,
      periodo_medicao: newObraForm.periodo_medicao || null,
      prazo_pagamento: newObraForm.prazo_pagamento || null,
    };

    if (editingObra) {
      const { error } = await supabase.from("obras_portfolio").update(payload).eq("id", editingObra.id);
      if (error) { toast.error("Erro ao atualizar obra."); setSavingObra(false); return; }
      toast.success("Obra atualizada!");
    } else {
      const { data, error } = await supabase.from("obras_portfolio").insert(payload).select("id").single();
      if (error || !data) { toast.error("Erro ao cadastrar obra."); setSavingObra(false); return; }
      await supabase.from("documentos_obra").insert({ obra_id: data.id });
      toast.success("Obra cadastrada com sucesso!");
    }
    queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
    setShowNewObraDialog(false);
    setEditingObra(null);
    resetNewObraForm();
    setSavingObra(false);
  };

  const handleDeleteObra = async () => {
    if (!deletingObraId || !company?.id) return;
    await supabase.from("obras_portfolio").delete().eq("id", deletingObraId);
    queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
    toast.success("Obra excluída.");
    setDeletingObraId(null);
  };

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ["holding-portfolio", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const [obrasRes, docsRes, medicoesRes] = await Promise.all([
        supabase.from("obras_portfolio").select("*").eq("company_id", company.id).order("nome"),
        supabase.from("documentos_obra").select("*"),
        supabase.from("medicoes_ple").select("*").order("ano_referencia", { ascending: false }),
      ]);
      const obrasData = (obrasRes.data || []) as ObraPortfolio[];
      const docsData = (docsRes.data || []) as DocumentosObra[];
      const medicoesData = (medicoesRes.data || []) as MedicaoPle[];

      const docsMap = new Map<string, DocumentosObra>();
      docsData.forEach((d) => docsMap.set(d.obra_id, d));

      const medicoesMap = new Map<string, MedicaoPle[]>();
      medicoesData.forEach((m) => {
        const arr = medicoesMap.get(m.obra_id) || [];
        arr.push(m);
        medicoesMap.set(m.obra_id, arr);
      });

      return obrasData.map((obra): ObraEnriched => {
        const docs = docsMap.get(obra.id) || null;
        const allMedicoes = medicoesMap.get(obra.id) || [];
        const latestMedicao = allMedicoes[0] || null;
        const { count: docsCount, total: docsTotal } = countDocs(docs);
        const health = calcHealth(docsCount, docsTotal, latestMedicao);
        return { ...obra, docs, latestMedicao, allMedicoes, docsCount, docsTotal, health };
      });
    },
    enabled: !!company?.id,
  });

  // Fetch aditivos for alerts
  const { data: aditivosPendentes = [] } = useQuery({
    queryKey: ["holding-aditivos-pendentes", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const obraIds = obras.map((o) => o.id);
      if (obraIds.length === 0) return [];
      const { data } = await supabase
        .from("aditivos_contratos")
        .select("id, obra_id, num_aditivo")
        .in("obra_id", obraIds)
        .eq("status", "pendente");
      return data || [];
    },
    enabled: !!company?.id && obras.length > 0,
  });

  const kpis = useMemo(() => {
    const totalContratos = obras.reduce((s, o) => s + (o.valor_contrato || 0), 0);
    const totalMedicoesAprovadas = obras.reduce(
      (s, o) => s + o.allMedicoes.filter((m) => m.status_medicao === "aprovada").reduce((ss, m) => ss + m.valor_medicao, 0), 0
    );
    const obrasAtivas = obras.filter((o) => o.status === "em_andamento").length;
    const alertasCriticos = obras.filter((o) => o.health === "red").length;
    return { totalContratos, totalMedicoesAprovadas, obrasAtivas, alertasCriticos };
  }, [obras]);

  // Generate alerts
  const alerts = useMemo((): HoldingAlert[] => {
    const result: HoldingAlert[] = [];
    const now = new Date();

    for (const obra of obras) {
      // 1. Docs incompletas (<4/6 doc_obra)
      const docObraFields = ["ata", "ois", "art", "cno", "impl", "scp"];
      const docObraCount = obra.docs ? docObraFields.filter((f) => (obra.docs as any)?.[f]).length : 0;
      if (docObraCount < 4) {
        result.push({
          id: `doc-${obra.id}`,
          obraId: obra.id,
          obraNome: obra.nome,
          severity: docObraCount < 2 ? "critical" : "warning",
          icon: FileWarning,
          message: `${obra.nome} — faltam ${6 - docObraCount} documentos obrigatórios`,
        });
      }

      // 2. Medição pendente >30 dias
      if (obra.latestMedicao?.status_medicao === "pendente" && obra.latestMedicao.data_envio) {
        const days = differenceInDays(now, new Date(obra.latestMedicao.data_envio));
        if (days > 30) {
          result.push({
            id: `med-${obra.id}`,
            obraId: obra.id,
            obraNome: obra.nome,
            severity: days > 60 ? "critical" : "warning",
            icon: Clock,
            message: `${obra.nome} — medição pendente há ${days} dias`,
          });
        }
      }

      // 3. Prazo vencendo em <30 dias
      if (obra.data_inicio && obra.status === "em_andamento") {
        const fimPrevisto = addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias);
        const diasRestantes = differenceInDays(fimPrevisto, now);
        if (diasRestantes >= 0 && diasRestantes < 30) {
          result.push({
            id: `prazo-${obra.id}`,
            obraId: obra.id,
            obraNome: obra.nome,
            severity: diasRestantes < 7 ? "critical" : "warning",
            icon: CalendarClock,
            message: `${obra.nome} — vence em ${diasRestantes} dias (${format(fimPrevisto, "dd/MM/yyyy")})`,
          });
        } else if (diasRestantes < 0) {
          result.push({
            id: `prazo-${obra.id}`,
            obraId: obra.id,
            obraNome: obra.nome,
            severity: "critical",
            icon: CalendarClock,
            message: `${obra.nome} — prazo vencido há ${Math.abs(diasRestantes)} dias`,
          });
        }
      }
    }

    // 4. Aditivos pendentes
    for (const adit of aditivosPendentes) {
      const obra = obras.find((o) => o.id === adit.obra_id);
      if (obra) {
        result.push({
          id: `adit-${adit.id}`,
          obraId: obra.id,
          obraNome: obra.nome,
          severity: "info",
          icon: FileCheck2,
          message: `${obra.nome} — aditivo ${adit.num_aditivo || ""} pendente de aprovação`,
        });
      }
    }

    // Sort: critical first
    const order = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [obras, aditivosPendentes]);

  const openObra = useCallback((obraId: string) => {
    const obra = obras.find((o) => o.id === obraId);
    if (obra) setSelectedObra(obra);
  }, [obras]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total em Contratos" value={BRL.format(kpis.totalContratos)} color="text-emerald-600 dark:text-emerald-400" bgColor="bg-emerald-100 dark:bg-emerald-900/30" />
        <KpiCard icon={ClipboardCheck} label="Medições Aprovadas" value={BRL.format(kpis.totalMedicoesAprovadas)} color="text-blue-600 dark:text-blue-400" bgColor="bg-blue-100 dark:bg-blue-900/30" />
        <KpiCard icon={Building2} label="Obras Ativas" value={String(kpis.obrasAtivas)} color="text-primary" bgColor="bg-primary/10" />
        <KpiCard icon={AlertTriangle} label="Alertas Críticos" value={String(kpis.alertasCriticos)} color={kpis.alertasCriticos > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} bgColor={kpis.alertasCriticos > 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-muted/50"} />
      </div>

      {/* View Toggle + Nova Obra */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">Obras do Portfólio ({obras.length})</h3>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewObraDialog(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Obra
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportarPDF} disabled={isPrinting || obras.length === 0}>
            {isPrinting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
            Exportar PDF
          </Button>
        </div>
        {obras.length > 0 && (
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "cards" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              onClick={() => setViewMode("gantt")}
              className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "gantt" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <GanttChart className="h-3.5 w-3.5" /> Gantt
            </button>
          </div>
        )}
      </div>

      {/* Obras View */}
      {obras.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Crown className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhuma obra cadastrada no portfólio.</p>
        </div>
      ) : viewMode === "cards" ? (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {obras.map((obra) => (
            <ObraCard
              key={obra.id}
              obra={obra}
              onClick={() => setSelectedObra(obra)}
              onEdit={() => {
                setNewObraForm({
                  nome: obra.nome, empresa: obra.empresa || "", num_contrato: obra.num_contrato || "",
                  parceria_scp: obra.parceria_scp || "", valor_contrato: String(obra.valor_contrato || ""),
                  data_inicio: obra.data_inicio || "", prazo_dias: String(obra.prazo_dias || ""),
                  status: obra.status, percentual_andamento: obra.percentual_andamento,
                  periodo_medicao: obra.periodo_medicao || "", prazo_pagamento: obra.prazo_pagamento || "",
                });
                setEditingObra(obra);
                setShowNewObraDialog(true);
              }}
              onDelete={() => setDeletingObraId(obra.id)}
            />
          ))}
        </div>
      ) : (
        <GanttTimeline obras={obras} onObraClick={openObra} />
      )}

      {/* Central de Alertas */}
      {alerts.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Alertas que precisam de atenção
              </h3>
              <Badge variant="destructive" className="text-xs">{alerts.length}</Badge>
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const sev = SEVERITY_CONFIG[alert.severity];
                const Icon = alert.icon;
                return (
                  <div key={alert.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1 min-w-0">{alert.message}</span>
                    <Badge variant="secondary" className={`text-[10px] shrink-0 ${sev.cls}`}>{sev.label}</Badge>
                    <Button size="sm" variant="ghost" className="text-xs shrink-0 h-7 px-2" onClick={() => openObra(alert.obraId)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Drawer */}
      <ObraDetailDrawer
        obraId={selectedObra?.id || null}
        obraNome={selectedObra?.nome || ""}
        onClose={() => setSelectedObra(null)}
      />

      {/* Nova Obra Dialog */}
      <Dialog open={showNewObraDialog} onOpenChange={(o) => { if (!o) { setShowNewObraDialog(false); setEditingObra(null); resetNewObraForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingObra ? "Editar Obra" : "Cadastrar Nova Obra"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={newObraForm.nome} onChange={(e) => setNewObraForm(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Empresa</Label>
                <Input value={newObraForm.empresa} onChange={(e) => setNewObraForm(p => ({ ...p, empresa: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Nº Contrato</Label>
                <Input value={newObraForm.num_contrato} onChange={(e) => setNewObraForm(p => ({ ...p, num_contrato: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Parceria SCP</Label>
                <Input value={newObraForm.parceria_scp} onChange={(e) => setNewObraForm(p => ({ ...p, parceria_scp: e.target.value }))} placeholder="Ex: SCP Binotto" />
              </div>
              <div>
                <Label className="text-xs">Valor Contrato (R$)</Label>
                <Input type="number" value={newObraForm.valor_contrato} onChange={(e) => setNewObraForm(p => ({ ...p, valor_contrato: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Início</Label>
                <Input type="date" value={newObraForm.data_inicio} onChange={(e) => setNewObraForm(p => ({ ...p, data_inicio: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Prazo (dias)</Label>
                <Input type="number" value={newObraForm.prazo_dias} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_dias: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={newObraForm.status} onValueChange={(v) => setNewObraForm(p => ({ ...p, status: v as typeof p.status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluida">Concluída</SelectItem>
                  <SelectItem value="paralisada">Paralisada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Andamento: {newObraForm.percentual_andamento}%</Label>
              <Slider value={[newObraForm.percentual_andamento]} onValueChange={([v]) => setNewObraForm(p => ({ ...p, percentual_andamento: v }))} max={100} step={1} className="mt-2" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Período Medição</Label>
                <Input value={newObraForm.periodo_medicao} onChange={(e) => setNewObraForm(p => ({ ...p, periodo_medicao: e.target.value }))} placeholder="Mensal, Bimestral..." />
              </div>
              <div>
                <Label className="text-xs">Prazo Pagamento</Label>
                <Input value={newObraForm.prazo_pagamento} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_pagamento: e.target.value }))} placeholder="30 dias, 45 dias..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewObraDialog(false); setEditingObra(null); resetNewObraForm(); }}>Cancelar</Button>
            <Button onClick={handleSaveObra} disabled={savingObra}>
              {savingObra ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingObra ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingObraId} onOpenChange={(o) => !o && setDeletingObraId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados (documentos, medições, despesas) serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteObra} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GANTT TIMELINE
   ══════════════════════════════════════════════ */

const GANTT_START = new Date(2025, 0, 1); // Jan 2025
const GANTT_END = new Date(2026, 11, 31); // Dec 2026
const TOTAL_MONTHS = differenceInMonths(GANTT_END, GANTT_START) + 1; // 24

function dateToMonthIndex(date: Date): number {
  return Math.max(0, Math.min(TOTAL_MONTHS, differenceInMonths(date, GANTT_START)));
}

function GanttTimeline({ obras, onObraClick }: { obras: ObraEnriched[]; onObraClick: (id: string) => void }) {
  const obrasWithDates = obras.filter((o) => o.data_inicio);
  if (obrasWithDates.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma obra com data de início cadastrada. Edite as obras para definir as datas.</p>
        </CardContent>
      </Card>
    );
  }
  const todayIndex = dateToMonthIndex(new Date());

  const chartData = obrasWithDates.map((obra) => {
    const start = new Date(obra.data_inicio!);
    const end = addDays(start, obra.prazo_dias + obra.aditivo_prazo_dias);
    const startIdx = dateToMonthIndex(start);
    const endIdx = dateToMonthIndex(end);
    const duration = Math.max(endIdx - startIdx, 0.5);

    return {
      nome: obra.nome.length > 25 ? obra.nome.slice(0, 23) + "…" : obra.nome,
      fullNome: obra.nome,
      obraId: obra.id,
      start: startIdx,
      duration,
      status: obra.status,
      andamento: obra.percentual_andamento,
      inicio: format(start, "dd/MM/yyyy"),
      fim: format(end, "dd/MM/yyyy"),
    };
  });

  const monthLabels = Array.from({ length: TOTAL_MONTHS }, (_, i) => {
    const d = new Date(2025, i, 1);
    return format(d, "MMM/yy");
  });

  const ticks = Array.from({ length: TOTAL_MONTHS }, (_, i) => i);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold">{d.fullNome}</p>
        <p>Início: {d.inicio}</p>
        <p>Fim previsto: {d.fim}</p>
        <p>Andamento: {d.andamento}%</p>
      </div>
    );
  };

  const barHeight = Math.max(32 * chartData.length + 60, 200);

  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 800 }}>
            <ResponsiveContainer width="100%" height={barHeight}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
                onClick={(e: any) => {
                  if (e?.activePayload?.[0]?.payload?.obraId) {
                    onObraClick(e.activePayload[0].payload.obraId);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/40" />
                <XAxis
                  type="number"
                  domain={[0, TOTAL_MONTHS]}
                  ticks={ticks}
                  tickFormatter={(v) => monthLabels[v] || ""}
                  tick={{ fontSize: 9 }}
                  interval={1}
                />
                <YAxis
                  type="category"
                  dataKey="nome"
                  width={160}
                  tick={{ fontSize: 11 }}
                />
                <ReTooltip content={<CustomTooltip />} />
                <ReferenceLine
                  x={todayIndex}
                  stroke="hsl(var(--destructive))"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{ value: "Hoje", position: "top", fontSize: 10, fill: "hsl(var(--destructive))" }}
                />
                {/* Invisible spacer bar for start offset */}
                <Bar dataKey="start" stackId="gantt" fill="transparent" radius={0} />
                <Bar dataKey="duration" stackId="gantt" radius={[4, 4, 4, 4]} cursor="pointer">
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={STATUS_BAR_COLORS[entry.status] || STATUS_BAR_COLORS.nao_iniciada} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.em_andamento }} /> Em Andamento</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.concluida }} /> Concluída</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.nao_iniciada }} /> Não Iniciada</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_BAR_COLORS.paralisada }} /> Paralisada</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   KPI Card
   ══════════════════════════════════════════════ */

function KpiCard({ icon: Icon, label, value, color, bgColor }: { icon: any; label: string; value: string; color: string; bgColor: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-bold ${color} truncate`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Obra Card
   ══════════════════════════════════════════════ */

function ObraCard({ obra, onClick, onEdit, onDelete }: { obra: ObraEnriched; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
  const previsaoFim =
    obra.data_inicio
      ? format(addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yyyy")
      : "—";

  return (
    <Card className="border-border/60 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer" onClick={onClick}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_COLORS[obra.health]}`} />
              <h3 className="font-semibold text-sm text-foreground truncate">{obra.nome}</h3>
            </div>
            {obra.empresa && <p className="text-xs text-muted-foreground mt-0.5 truncate">{obra.empresa}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={`text-[10px] ${statusCfg.className}`} variant="secondary">{statusCfg.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-md hover:bg-muted" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Andamento</span>
            <span className="font-medium text-foreground">{obra.percentual_andamento}%</span>
          </div>
          <Progress value={obra.percentual_andamento} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Contrato</span><p className="font-medium text-foreground truncate">{obra.num_contrato || "—"}</p></div>
          <div><span className="text-muted-foreground">Valor</span><p className="font-medium text-foreground truncate">{BRL.format(obra.valor_contrato)}</p></div>
          <div><span className="text-muted-foreground">Previsão Fim</span><p className="font-medium text-foreground">{previsaoFim}</p></div>
          <div><span className="text-muted-foreground">Docs</span><p className="font-medium text-foreground">{obra.docsCount}/{obra.docsTotal}</p></div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {obra.parceria_scp && <Badge variant="outline" className="text-[10px]">SCP: {obra.parceria_scp}</Badge>}
          {obra.latestMedicao && (
            <Badge variant="outline" className="text-[10px]">Última: {obra.latestMedicao.mes_referencia}/{obra.latestMedicao.ano_referencia}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
