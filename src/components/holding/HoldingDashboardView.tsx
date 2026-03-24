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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ObraDetailDrawer from "./ObraDetailDrawer";
import HoldingAnalyticsView from "./HoldingAnalyticsView";
import HoldingManualView from "./HoldingManualView";
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
  BarChart3,
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
  Upload,
  BookOpen,
  TableIcon,
  Download,
  Search,
  X,
  TrendingUp,
  Pause,
} from "lucide-react";
import { addDays, format, differenceInDays, differenceInMonths } from "date-fns";

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
  municipio: string | null;
  estado: string | null;
  uh: number | null;
  responsavel: string | null;
  tipo_contrato: string | null;
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

export interface ObraEnriched extends ObraPortfolio {
  docs: DocumentosObra | null;
  latestMedicao: MedicaoPle | null;
  allMedicoes: MedicaoPle[];
  docsCount: number;
  docsTotal: number;
  health: "green" | "yellow" | "red";
}

export interface HoldingAlert {
  id: string;
  obraId: string;
  obraNome: string;
  severity: "critical" | "warning" | "info";
  icon: any;
  message: string;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return BRL.format(v);
};

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

const HEALTH_BORDER: Record<string, string> = {
  green: "border-l-emerald-500",
  yellow: "border-l-amber-500",
  red: "border-l-red-500",
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
  const [mainView, setMainView] = useState<"portfolio" | "analytics" | "manual">("portfolio");
  const [viewMode, setViewMode] = useState<"cards" | "gantt" | "tabela">("cards");
  const [showNewObraDialog, setShowNewObraDialog] = useState(false);
  const [newObraForm, setNewObraForm] = useState({
    nome: "", empresa: "", num_contrato: "", parceria_scp: "",
    valor_contrato: "", data_inicio: "", prazo_dias: "",
    status: "nao_iniciada" as "nao_iniciada" | "em_andamento" | "concluida" | "paralisada",
    percentual_andamento: 0,
    periodo_medicao: "", prazo_pagamento: "",
    municipio: "", estado: "RS",
    uh: "", responsavel: "", tipo_contrato: "",
  });
  const [savingObra, setSavingObra] = useState(false);
  const [editingObra, setEditingObra] = useState<ObraEnriched | null>(null);
  const [deletingObraId, setDeletingObraId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Filters
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSaude, setFilterSaude] = useState("all");
  const [searchNome, setSearchNome] = useState("");

  const exportarPDF = async () => {
    setIsPrinting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const today = format(new Date(), "dd/MM/yyyy");
      const companyName = (company as any)?.name || "Holding";

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
    municipio: "", estado: "RS",
    uh: "", responsavel: "", tipo_contrato: "",
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
      municipio: newObraForm.municipio || null,
      estado: newObraForm.estado || "RS",
      uh: Number(newObraForm.uh) || null,
      responsavel: newObraForm.responsavel || null,
      tipo_contrato: newObraForm.tipo_contrato || null,
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

  const handleImportObras = async () => {
    if (!company?.id || !importText.trim()) return;
    setImporting(true);
    try {
      const lines = importText.trim().split("\n").filter(l => l.trim());
      const obrasToInsert = lines.map((line, idx) => {
        const parts = line.split(",").map(s => s.trim());
        const [nome, empresa, num_contrato, parceria_scp, valor_contrato, data_inicio, prazo_dias, status, percentual_andamento, municipio, estado, uh, responsavel, tipo_contrato] = parts;
        return {
          company_id: company.id,
          nome: nome || `Obra ${idx + 1}`,
          empresa: empresa || null,
          num_contrato: num_contrato || null,
          parceria_scp: parceria_scp || null,
          valor_contrato: Number(valor_contrato) || 0,
          data_inicio: data_inicio || null,
          prazo_dias: Number(prazo_dias) || 0,
          status: (["em_andamento", "nao_iniciada", "concluida", "paralisada"].includes(status) ? status : "nao_iniciada") as "em_andamento" | "nao_iniciada" | "concluida" | "paralisada",
          percentual_andamento: Number(percentual_andamento) || 0,
          municipio: municipio || null,
          estado: estado || "RS",
          uh: Number(uh?.trim()) || null,
          responsavel: responsavel?.trim() || null,
          tipo_contrato: tipo_contrato?.trim() || null,
        };
      });

      // Duplicate check
      const existingNames = obras.map(o => o.nome.toLowerCase().trim());
      const newObras = obrasToInsert.filter(o => !existingNames.includes(o.nome.toLowerCase().trim()));
      const skipped = obrasToInsert.length - newObras.length;
      if (newObras.length === 0) {
        toast.warning("Todas as obras já estão cadastradas.");
        setImporting(false);
        return;
      }

      const { data: inserted, error } = await supabase.from("obras_portfolio").insert(newObras).select("id");
      if (error) throw error;

      if (inserted && inserted.length > 0) {
        const docsRows = inserted.map(o => ({ obra_id: o.id }));
        await supabase.from("documentos_obra").insert(docsRows);
      }

      queryClient.invalidateQueries({ queryKey: ["holding-portfolio", company.id] });
      if (skipped > 0) toast.success(`${inserted?.length || 0} obras importadas. ${skipped} já existiam e foram ignoradas.`);
      else toast.success(`${inserted?.length || 0} obras importadas com sucesso!`);
      setShowImportDialog(false);
      setImportText("");
    } catch (e: any) {
      toast.error(`Erro na importação: ${e.message || "Verifique os dados"}`);
      console.error(e);
    }
    setImporting(false);
  };

  const exportarCSV = () => {
    const header = "Obra;Empresa;Contrato;SCP;UH;Tipo Contrato;Responsável;Valor Contrato;Data Início;Prazo;Previsão Fim;Status;% And.;Docs;Saúde";
    const rows = obrasFiltradas.map((o) => {
      const fim = o.data_inicio ? format(addDays(new Date(o.data_inicio), o.prazo_dias + o.aditivo_prazo_dias), "dd/MM/yyyy") : "—";
      const statusLbl = STATUS_CONFIG[o.status]?.label || o.status;
      const healthLbl = o.health === "green" ? "Verde" : o.health === "yellow" ? "Amarelo" : "Vermelho";
      return `${o.nome};${o.empresa || "—"};${o.num_contrato || "—"};${o.parceria_scp || "—"};${o.uh || "—"};${o.tipo_contrato || "—"};${o.responsavel || "—"};${o.valor_contrato};${o.data_inicio || "—"};${o.prazo_dias || "—"};${fim};${statusLbl};${o.percentual_andamento}%;${o.docsCount}/${o.docsTotal};${healthLbl}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
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
    const obrasNaoIniciadas = obras.filter((o) => o.status === "nao_iniciada").length;
    const alertasCriticos = obras.filter((o) => o.health === "red").length;
    const emAndamento = obras.filter((o) => o.status === "em_andamento");
    const andamentoMedio = emAndamento.length > 0 ? Math.round(emAndamento.reduce((s, o) => s + o.percentual_andamento, 0) / emAndamento.length) : 0;
    return { totalContratos, totalMedicoesAprovadas, obrasAtivas, obrasNaoIniciadas, alertasCriticos, andamentoMedio };
  }, [obras]);

  const alerts = useMemo((): HoldingAlert[] => {
    const result: HoldingAlert[] = [];
    const now = new Date();

    for (const obra of obras) {
      const docObraFields = ["ata", "ois", "art", "cno", "impl", "scp"];
      const docObraCount = obra.docs ? docObraFields.filter((f) => (obra.docs as any)?.[f]).length : 0;
      if (docObraCount < 4) {
        result.push({
          id: `doc-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
          severity: docObraCount < 2 ? "critical" : "warning",
          icon: FileWarning,
          message: `${obra.nome} — faltam ${6 - docObraCount} documentos obrigatórios`,
        });
      }

      if (obra.latestMedicao?.status_medicao === "pendente" && obra.latestMedicao.data_envio) {
        const days = differenceInDays(now, new Date(obra.latestMedicao.data_envio));
        if (days > 30) {
          result.push({
            id: `med-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: days > 60 ? "critical" : "warning",
            icon: Clock,
            message: `${obra.nome} — medição pendente há ${days} dias`,
          });
        }
      }

      if (obra.data_inicio && obra.status === "em_andamento") {
        const fimPrevisto = addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias);
        const diasRestantes = differenceInDays(fimPrevisto, now);
        if (diasRestantes >= 0 && diasRestantes < 30) {
          result.push({
            id: `prazo-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: diasRestantes < 7 ? "critical" : "warning",
            icon: CalendarClock,
            message: `${obra.nome} — vence em ${diasRestantes} dias (${format(fimPrevisto, "dd/MM/yyyy")})`,
          });
        } else if (diasRestantes < 0) {
          result.push({
            id: `prazo-${obra.id}`, obraId: obra.id, obraNome: obra.nome,
            severity: "critical", icon: CalendarClock,
            message: `${obra.nome} — prazo vencido há ${Math.abs(diasRestantes)} dias`,
          });
        }
      }
    }

    for (const adit of aditivosPendentes) {
      const obra = obras.find((o) => o.id === adit.obra_id);
      if (obra) {
        result.push({
          id: `adit-${adit.id}`, obraId: obra.id, obraNome: obra.nome,
          severity: "info", icon: FileCheck2,
          message: `${obra.nome} — aditivo ${adit.num_aditivo || ""} pendente de aprovação`,
        });
      }
    }

    const order = { critical: 0, warning: 1, info: 2 };
    return result.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [obras, aditivosPendentes]);

  // Filters
  const empresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))].sort(), [obras]);

  const obrasFiltradas = useMemo(() => {
    return obras.filter(o => {
      if (filterEmpresa !== "all" && o.empresa !== filterEmpresa) return false;
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (filterSaude !== "all" && o.health !== filterSaude) return false;
      if (filterTipo !== "all" && o.tipo_contrato !== filterTipo) return false;
      if (searchNome && !o.nome.toLowerCase().includes(searchNome.toLowerCase())) return false;
      return true;
    });
  }, [obras, filterEmpresa, filterStatus, filterSaude, filterTipo, searchNome]);

  const hasActiveFilter = filterEmpresa !== "all" || filterStatus !== "all" || filterSaude !== "all" || searchNome !== "";

  const clearFilters = () => {
    setFilterEmpresa("all");
    setFilterStatus("all");
    setFilterSaude("all");
    setSearchNome("");
  };

  const openObra = useCallback((obraId: string) => {
    const obra = obras.find((o) => o.id === obraId);
    if (obra) setSelectedObra(obra);
  }, [obras]);

  // Summary stats for filtered obras
  const summaryStats = useMemo(() => {
    const valorTotal = obrasFiltradas.reduce((s, o) => s + (o.valor_contrato || 0), 0);
    const emDia = obrasFiltradas.filter(o => o.health === "green").length;
    const emAtencao = obrasFiltradas.filter(o => o.health === "yellow").length;
    const totalDocs = obrasFiltradas.reduce((s, o) => s + o.docsCount, 0);
    const totalDocsMax = obrasFiltradas.reduce((s, o) => s + o.docsTotal, 0);
    const docMedia = totalDocsMax > 0 ? Math.round((totalDocs / totalDocsMax) * 100) : 0;
    return { valorTotal, emDia, emAtencao, docMedia };
  }, [obrasFiltradas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Row — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard icon={DollarSign} label="Total em Contratos" value={BRL.format(kpis.totalContratos)} borderColor="border-b-emerald-500" valueColor="text-emerald-600 dark:text-emerald-400" />
        <KpiCard icon={ClipboardCheck} label="Medições Aprovadas" value={BRL.format(kpis.totalMedicoesAprovadas)} borderColor="border-b-cyan-500" valueColor="text-cyan-600 dark:text-cyan-400" />
        <KpiCard icon={Building2} label="Obras Ativas" value={String(kpis.obrasAtivas)} borderColor="border-b-blue-500" valueColor="text-blue-600 dark:text-blue-400" />
        <KpiCard icon={Pause} label="Não Iniciadas" value={String(kpis.obrasNaoIniciadas)} borderColor="border-b-gray-400" valueColor="text-muted-foreground" />
        <KpiCard icon={AlertTriangle} label="Alertas Críticos" value={String(kpis.alertasCriticos)} borderColor={kpis.alertasCriticos > 0 ? "border-b-red-500" : "border-b-gray-300"} valueColor={kpis.alertasCriticos > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} />
        <KpiCard icon={TrendingUp} label="% Andamento Médio" value={`${kpis.andamentoMedio}%`} borderColor="border-b-blue-500" valueColor="text-blue-600 dark:text-blue-400" />
      </div>

      {/* Main View Tabs + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
          <button onClick={() => setMainView("portfolio")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "portfolio" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Crown className="h-4 w-4" /> Portfólio
          </button>
          <button onClick={() => setMainView("analytics")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "analytics" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <BarChart3 className="h-4 w-4" /> Analytics
          </button>
          <button onClick={() => setMainView("manual")} className={`px-4 py-2 text-sm rounded-md transition-all flex items-center gap-2 ${mainView === "manual" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <BookOpen className="h-4 w-4" /> Manual
          </button>
        </div>
        {mainView !== "manual" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewObraDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Obra
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Importar
            </Button>
            {viewMode === "tabela" && mainView === "portfolio" && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportarCSV}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportarPDF} disabled={isPrinting || obras.length === 0}>
              {isPrinting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
              Exportar PDF
            </Button>
          </div>
        )}
      </div>

      {/* Filter Bar — only in portfolio */}
      {mainView === "portfolio" && obras.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar obra..."
              value={searchNome}
              onChange={(e) => setSearchNome(e.target.value)}
              className="h-8 w-48 text-xs pl-8"
            />
          </div>
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todas Empresas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Empresas</SelectItem>
              {empresas.map(e => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todos Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="paralisada">Paralisada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSaude} onValueChange={setFilterSaude}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Toda Saúde" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda Saúde</SelectItem>
              <SelectItem value="green">🟢 Verde</SelectItem>
              <SelectItem value="yellow">🟡 Amarelo</SelectItem>
              <SelectItem value="red">🔴 Vermelho</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs h-6">{obrasFiltradas.length} obras</Badge>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Limpar
            </Button>
          )}
        </div>
      )}

      {mainView === "portfolio" ? (
        <>
          {/* Portfolio Sub-Toggle */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Obras do Portfólio ({obrasFiltradas.length})</h3>
            {obrasFiltradas.length > 0 && (
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "cards" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setViewMode("gantt")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "gantt" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <GanttChart className="h-3.5 w-3.5" /> Gantt
                </button>
                <button onClick={() => setViewMode("tabela")} className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${viewMode === "tabela" ? "bg-card shadow font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <TableIcon className="h-3.5 w-3.5" /> Tabela
                </button>
              </div>
            )}
          </div>

          {/* Obras View */}
          {obrasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Crown className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">{hasActiveFilter ? "Nenhuma obra encontrada com os filtros aplicados." : "Nenhuma obra cadastrada no portfólio."}</p>
            </div>
          ) : viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {obrasFiltradas.map((obra) => (
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
                      municipio: obra.municipio || "", estado: obra.estado || "RS",
                    });
                    setEditingObra(obra);
                    setShowNewObraDialog(true);
                  }}
                  onDelete={() => setDeletingObraId(obra.id)}
                />
              ))}
            </div>
          ) : viewMode === "gantt" ? (
            <GanttTimeline obras={obrasFiltradas} onObraClick={openObra} />
          ) : (
            <ObraTable obras={obrasFiltradas} onObraClick={openObra} />
          )}

          {/* Summary Bar */}
          {obrasFiltradas.length > 0 && (
            <div className="bg-muted/30 rounded-lg px-6 py-3 flex items-center justify-between flex-wrap gap-3 text-sm">
              <div><span className="text-muted-foreground text-xs">Valor Portfólio</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{BRL_SHORT(summaryStats.valorTotal)}</p></div>
              <div><span className="text-muted-foreground text-xs">Obras em dia</span><p className="font-semibold text-emerald-600 dark:text-emerald-400">{summaryStats.emDia}</p></div>
              <div><span className="text-muted-foreground text-xs">Em atenção</span><p className="font-semibold text-amber-600 dark:text-amber-400">{summaryStats.emAtencao}</p></div>
              <div><span className="text-muted-foreground text-xs">Doc. média</span><p className="font-semibold text-foreground">{summaryStats.docMedia}%</p></div>
            </div>
          )}
        </>
      ) : mainView === "manual" ? (
        <HoldingManualView />
      ) : (
        <HoldingAnalyticsView obras={obras} alerts={alerts} onObraClick={openObra} />
      )}

      {/* Central de Alertas */}
      {alerts.length > 0 && mainView === "portfolio" && (
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
      <ObraDetailDrawer obraId={selectedObra?.id || null} obraNome={selectedObra?.nome || ""} onClose={() => setSelectedObra(null)} />

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
              <div><Label className="text-xs">Empresa</Label><Input value={newObraForm.empresa} onChange={(e) => setNewObraForm(p => ({ ...p, empresa: e.target.value }))} /></div>
              <div><Label className="text-xs">Nº Contrato</Label><Input value={newObraForm.num_contrato} onChange={(e) => setNewObraForm(p => ({ ...p, num_contrato: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Parceria SCP</Label><Input value={newObraForm.parceria_scp} onChange={(e) => setNewObraForm(p => ({ ...p, parceria_scp: e.target.value }))} placeholder="Ex: SCP Binotto" /></div>
              <div><Label className="text-xs">Valor Contrato (R$)</Label><Input type="number" value={newObraForm.valor_contrato} onChange={(e) => setNewObraForm(p => ({ ...p, valor_contrato: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Data Início</Label><Input type="date" value={newObraForm.data_inicio} onChange={(e) => setNewObraForm(p => ({ ...p, data_inicio: e.target.value }))} /></div>
              <div><Label className="text-xs">Prazo (dias)</Label><Input type="number" value={newObraForm.prazo_dias} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_dias: e.target.value }))} /></div>
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
              <div><Label className="text-xs">Período Medição</Label><Input value={newObraForm.periodo_medicao} onChange={(e) => setNewObraForm(p => ({ ...p, periodo_medicao: e.target.value }))} placeholder="Mensal, Bimestral..." /></div>
              <div><Label className="text-xs">Prazo Pagamento</Label><Input value={newObraForm.prazo_pagamento} onChange={(e) => setNewObraForm(p => ({ ...p, prazo_pagamento: e.target.value }))} placeholder="30 dias, 45 dias..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Município</Label><Input value={newObraForm.municipio} onChange={(e) => setNewObraForm(p => ({ ...p, municipio: e.target.value }))} placeholder="Ex: Taquara, Esteio..." /></div>
              <div><Label className="text-xs">Estado</Label><Input value={newObraForm.estado} onChange={(e) => setNewObraForm(p => ({ ...p, estado: e.target.value }))} placeholder="RS" /></div>
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
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os dados serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteObra} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar Obras em Lote</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Uma obra por linha, separada por vírgulas:<br />
            <code className="text-[10px] bg-muted px-1 rounded">nome, empresa, num_contrato, parceria_scp, valor_contrato, data_inicio, prazo_dias, status, percentual_andamento, municipio, estado</code>
          </p>
          <textarea className="w-full h-64 text-xs font-mono border rounded-md p-2 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-ring" value={importText} onChange={(e) => setImportText(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowImportDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleImportObras} disabled={importing || !importText.trim()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Processar e Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════
   GANTT TIMELINE
   ══════════════════════════════════════════════ */

const GANTT_START = new Date(2025, 0, 1);
const GANTT_END = new Date(2026, 11, 31);
const TOTAL_MONTHS = differenceInMonths(GANTT_END, GANTT_START) + 1;

function dateToMonthIndex(date: Date): number {
  return Math.max(0, Math.min(TOTAL_MONTHS, differenceInMonths(date, GANTT_START)));
}

function GanttTimeline({ obras, onObraClick }: { obras: ObraEnriched[]; onObraClick: (id: string) => void }) {
  const obrasWithDates = obras.filter((o) => o.data_inicio);
  if (obrasWithDates.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma obra com data de início cadastrada.</p>
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
      fullNome: obra.nome, obraId: obra.id, start: startIdx, duration,
      status: obra.status, andamento: obra.percentual_andamento,
      inicio: format(start, "dd/MM/yyyy"), fim: format(end, "dd/MM/yyyy"),
    };
  });

  const monthLabels = Array.from({ length: TOTAL_MONTHS }, (_, i) => format(new Date(2025, i, 1), "MMM/yy"));
  const ticks = Array.from({ length: TOTAL_MONTHS }, (_, i) => i);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs space-y-1">
        <p className="font-semibold">{d.fullNome}</p>
        <p>Início: {d.inicio}</p><p>Fim previsto: {d.fim}</p><p>Andamento: {d.andamento}%</p>
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
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
                onClick={(e: any) => { if (e?.activePayload?.[0]?.payload?.obraId) onObraClick(e.activePayload[0].payload.obraId); }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/40" />
                <XAxis type="number" domain={[0, TOTAL_MONTHS]} ticks={ticks} tickFormatter={(v) => monthLabels[v] || ""} tick={{ fontSize: 9 }} interval={1} />
                <YAxis type="category" dataKey="nome" width={160} tick={{ fontSize: 11 }} />
                <ReTooltip content={<CustomTooltip />} />
                <ReferenceLine x={todayIndex} stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="4 4" label={{ value: "Hoje", position: "top", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                <Bar dataKey="start" stackId="gantt" fill="transparent" radius={0} />
                <Bar dataKey="duration" stackId="gantt" radius={[4, 4, 4, 4]} cursor="pointer">
                  {chartData.map((entry, idx) => (<Cell key={idx} fill={STATUS_BAR_COLORS[entry.status] || STATUS_BAR_COLORS.nao_iniciada} />))}
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
   KPI Card (compact with bottom border)
   ══════════════════════════════════════════════ */

function KpiCard({ icon: Icon, label, value, borderColor, valueColor }: { icon: any; label: string; value: string; borderColor: string; valueColor: string }) {
  return (
    <Card className={`border-border/60 border-b-2 ${borderColor}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-4 w-4 shrink-0 ${valueColor}`} />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground truncate">{label}</p>
          <p className={`text-xl font-bold ${valueColor} truncate`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Obra Card (redesigned, denser)
   ══════════════════════════════════════════════ */

function ObraCard({ obra, onClick, onEdit, onDelete }: { obra: ObraEnriched; onClick: () => void; onEdit: () => void; onDelete: () => void }) {
  const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
  const previsaoFim = obra.data_inicio ? format(addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yyyy") : "—";
  const receitas = obra.allMedicoes.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + m.valor_medicao, 0);

  return (
    <Card className={`border-border/60 border-l-4 ${HEALTH_BORDER[obra.health]} hover:border-primary/40 hover:shadow-md transition-all cursor-pointer`} onClick={onClick}>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${HEALTH_COLORS[obra.health]}`} />
              <h3 className="font-semibold text-sm text-foreground truncate">{obra.nome}</h3>
            </div>
            {obra.empresa && <p className="text-xs text-muted-foreground mt-0.5 truncate">{obra.empresa}</p>}
            {obra.municipio && <p className="text-[10px] text-muted-foreground truncate">📍 {obra.municipio} / {obra.estado || "RS"}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge className={`text-[10px] ${statusCfg.className}`} variant="secondary">{statusCfg.label}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-md hover:bg-muted" onClick={(e) => e.stopPropagation()}><MoreVertical className="h-4 w-4 text-muted-foreground" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Andamento</span>
            <span className="font-medium text-foreground">{obra.percentual_andamento}%</span>
          </div>
          <Progress value={obra.percentual_andamento} className="h-1.5" />
        </div>

        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Contrato</span><p className="font-medium text-foreground truncate">{obra.num_contrato || "—"}</p></div>
          <div><span className="text-muted-foreground">Empresa</span><p className="font-medium text-foreground truncate">{obra.empresa || "—"}</p></div>
          <div><span className="text-muted-foreground">SCP</span><p className="font-medium text-foreground truncate">{obra.parceria_scp || "—"}</p></div>
          <div><span className="text-muted-foreground">Valor</span><p className="font-medium text-foreground truncate">{BRL_SHORT(obra.valor_contrato)}</p></div>
          <div><span className="text-muted-foreground">Início</span><p className="font-medium text-foreground">{obra.data_inicio ? format(new Date(obra.data_inicio), "dd/MM/yy") : "—"}</p></div>
          <div><span className="text-muted-foreground">Prev. Fim</span><p className="font-medium text-foreground">{previsaoFim}</p></div>
        </div>

        {receitas > 0 && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ {BRL_SHORT(receitas)} recebido</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Obra Table (full data table view)
   ══════════════════════════════════════════════ */

function ObraTable({ obras, onObraClick }: { obras: ObraEnriched[]; onObraClick: (id: string) => void }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-[10px] font-semibold w-8 sticky top-0 bg-muted/90 z-10">#</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 min-w-[160px]">Obra</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Empresa</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Contrato</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">SCP</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-right">Valor Contrato</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-right">Receitas</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Data Início</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Prazo</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Prev. Fim</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10">Status</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">% And.</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Docs</TableHead>
                <TableHead className="text-[10px] font-semibold sticky top-0 bg-muted/90 z-10 text-center">Saúde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obras.map((obra, idx) => {
                const statusCfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.nao_iniciada;
                const previsaoFim = obra.data_inicio ? format(addDays(new Date(obra.data_inicio), obra.prazo_dias + obra.aditivo_prazo_dias), "dd/MM/yy") : "—";
                const receitas = obra.allMedicoes.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + m.valor_medicao, 0);
                return (
                  <TableRow
                    key={obra.id}
                    className={`cursor-pointer hover:bg-muted/40 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}
                    onClick={() => onObraClick(obra.id)}
                  >
                    <TableCell className="text-[10px] text-muted-foreground py-2">{idx + 1}</TableCell>
                    <TableCell className="text-xs font-medium py-2 text-primary hover:underline">{obra.nome}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.empresa || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.num_contrato || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.parceria_scp || "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-right font-mono">{BRL.format(obra.valor_contrato)}</TableCell>
                    <TableCell className="text-[10px] py-2 text-right font-mono">{receitas > 0 ? BRL.format(receitas) : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{obra.data_inicio ? format(new Date(obra.data_inicio), "dd/MM/yy") : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{obra.prazo_dias ? `${obra.prazo_dias}d` : "—"}</TableCell>
                    <TableCell className="text-[10px] py-2">{previsaoFim}</TableCell>
                    <TableCell className="py-2"><Badge className={`text-[9px] ${statusCfg.className}`} variant="secondary">{statusCfg.label}</Badge></TableCell>
                    <TableCell className="text-[10px] py-2 text-center font-medium">{obra.percentual_andamento}%</TableCell>
                    <TableCell className="text-[10px] py-2 text-center">{obra.docsCount}/{obra.docsTotal}</TableCell>
                    <TableCell className="py-2 text-center"><span className={`inline-block h-3 w-3 rounded-full ${HEALTH_COLORS[obra.health]}`} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
