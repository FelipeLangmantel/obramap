import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, NotificationBell } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";
import {
  TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Download,
  Search, Calendar, FileText, X, Wallet, ChevronRight, ChevronDown, AlertTriangle, Ban, Loader2, RotateCcw
} from "lucide-react";
import { format, addMonths, startOfMonth, startOfWeek, endOfWeek, addWeeks, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/holding/CurrencyInput";

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
  obra_prazo_pagamento: number; // dias do prazo de pagamento da obra
  num_medicao: string | null;
  mes_referencia: string | null;
  ano_referencia: number | null;
  data_previsao_medicao: string | null;
  data_envio: string | null;
  data_aprovacao: string | null;
  status_medicao: "aprovada" | "enviada" | "pendente" | "nao_iniciada" | "prevista";
  valor_previsto_medicao: number;
  valor_medicao: number;
  valor_acatado: number | null;
  num_nf: string | null;
  data_pagamento: string | null;
  status_nf: "recebido" | "aguardando_aprovacao" | "pendente";
}

// Parse prazo_pagamento string ("30 dias", "45", etc.) to number of days
function parsePrazoDias(prazo: string | null): number {
  if (!prazo) return 30; // default 30 days
  const match = prazo.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

// ─── Formatters ───
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_SHORT = (v: number) => v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : BRL.format(v);

const STATUS_MED_CONFIG: Record<string, { label: string; cls: string }> = {
  aprovada: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  enviada: { label: "Aguard. Fiscal", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  prevista: { label: "Prevista", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  pendente: { label: "Prevista", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  nao_iniciada: { label: "Prevista", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const STATUS_NF_CONFIG: Record<string, { label: string; cls: string }> = {
  recebido: { label: "Recebido NF", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  aguardando_aprovacao: { label: "Aguardando Aprov.", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function HoldingReceitasPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { company, user, profile } = useAuth();

  const [activeTab, setActiveTab] = useState("financeiro");
  const [filterObra, setFilterObra] = useState("all");
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterStatusMed, setFilterStatusMed] = useState("all");
  const [filterStatusNF, setFilterStatusNF] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [filterTipoContrato, setFilterTipoContrato] = useState("all");
  const [agrupamento, setAgrupamento] = useState<"semanal" | "quinzenal" | "mensal">("mensal");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedObraId, setSelectedObraId] = useState<string | null>(
    (location.state as any)?.obraId || null
  );
  const [expandedProgPeriods, setExpandedProgPeriods] = useState<Set<number>>(new Set());
  const [reprogramarMedicao, setReprogramarMedicao] = useState<MedicaoCompleta | null>(null);
  const [reprogramarForm, setReprogramarForm] = useState({ motivo: "", novaData: "", novoValor: 0 });
  const [savingReprogramar, setSavingReprogramar] = useState(false);

  // Abrir aba correta quando vindo de notificação
  useEffect(() => {
    const state = location.state as any;
    if (state?.tab) setActiveTab(state.tab);
    if (state?.obraId) setSelectedObraId(state.obraId);
    // Limpar state para não re-abrir ao navegar de volta
    if (state?.obraId || state?.tab) {
      window.history.replaceState({}, "", location.pathname);
    }
  }, [location.state]);
  

  // ─── Data Fetching ───
  const { data, isError } = useQuery({
    queryKey: ["holding-receitas", company?.id],
    queryFn: async () => {
      const { data: obras, error: obrasError } = await supabase
        .from("obras_portfolio")
        .select("id, nome, empresa, num_contrato, valor_contrato, parceria_scp, uh, responsavel, tipo_contrato, prazo_pagamento, valor_medido_inicial, status, aditivo_valor_total")
        .eq("company_id", company!.id);

      if (obrasError) throw obrasError;
      const obrasList = obras || [];
      const obraIds = obrasList.map(o => o.id);

      if (obraIds.length === 0) return { obras: obrasList, medicoes: [], restricoes: [] };

      const [{ data: medicoes, error: medError }, { data: restricoes }] = await Promise.all([
        supabase.from("medicoes_ple").select("id, obra_id, num_medicao, mes_referencia, ano_referencia, data_previsao_medicao, data_envio, data_envio_nf, data_aprovacao, status_medicao, valor_previsto_medicao, valor_medicao, valor_acatado, num_nf, data_pagamento, status_nf").in("obra_id", obraIds),
        supabase.from("restricoes_financeiras").select("id, obra_id, medicao_id, company_id, tipo, descricao, valor, impacto_medicao, data_limite, resolvida, resolvida_em, resolvida_por_nome, valor_pago, forma_resolucao, created_by_name, created_at").in("obra_id", obraIds),
      ]);

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
          obra_prazo_pagamento: parsePrazoDias((o as any).prazo_pagamento),
          num_medicao: m.num_medicao,
          mes_referencia: m.mes_referencia,
          ano_referencia: m.ano_referencia,
          data_previsao_medicao: m.data_previsao_medicao || null,
          data_envio: m.data_envio,
          data_aprovacao: m.data_aprovacao,
          status_medicao: m.status_medicao,
          valor_previsto_medicao: Number(m.valor_previsto_medicao) || 0,
          valor_medicao: Number(m.valor_medicao) || 0,
          valor_acatado: m.valor_acatado != null ? Number(m.valor_acatado) : null,
          num_nf: m.num_nf,
          data_pagamento: m.data_pagamento,
          status_nf: m.status_nf,
        };
      });
      // Sort: Saldo Inicial first, then by num_medicao ascending within each obra
      joined.sort((a, b) => {
        if (a.obra_id !== b.obra_id) return a.obra_nome.localeCompare(b.obra_nome);
        if (a.num_medicao === "Saldo Inicial") return -1;
        if (b.num_medicao === "Saldo Inicial") return 1;
        const na = parseInt(a.num_medicao || "0", 10);
        const nb = parseInt(b.num_medicao || "0", 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return (a.num_medicao || "").localeCompare(b.num_medicao || "");
      });
      return { obras: obrasList, medicoes: joined, restricoes: (restricoes || []) as any[] };
    },
    enabled: !!company?.id,
    refetchOnWindowFocus: false, // realtime cobre mudanças de outros usuários
    staleTime: 30_000,
    gcTime: 120_000,
  });

  // ─── Realtime: auto-update when medicoes_ple changes ───
  // Filtro por obra_id (IN lista de obras da empresa) não é suportado diretamente
  // pelo realtime do Supabase. Usamos channel por company_id como namespace
  // para evitar invalidações cruzadas entre empresas diferentes.
  useEffect(() => {
    if (!company?.id) return;
    const channelName = `holding-receitas-${company.id}`;
    let realtimeTimer: ReturnType<typeof setTimeout>;
    const invalidate = () => {
      clearTimeout(realtimeTimer);
      realtimeTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["holding-receitas", company.id] });
      }, 2000);
    };
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "medicoes_ple" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "restricoes_financeiras" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "obras_portfolio" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "aditivos_contratos" }, invalidate)
      .subscribe();
    return () => { clearTimeout(realtimeTimer); supabase.removeChannel(channel); };
  }, [queryClient, company?.id]);

  const obras = data?.obras || [];
  const medicoes = data?.medicoes || [];
  const restricoes = (data as any)?.restricoes || [] as any[];
  

  // ─── Mapa de impacto financeiro por medição (apenas restrições NÃO resolvidas) ───
  const restricaoImpactoMap = useMemo(() => {
    const map = new Map<string, number>();
    (restricoes as any[]).filter((r: any) => !r.resolvida).forEach((r: any) => {
      if (r.medicao_id) {
        map.set(r.medicao_id, (map.get(r.medicao_id) || 0) + (Number(r.impacto_medicao) || 0));
      }
    });
    return map;
  }, [restricoes]);

  // Helper: valor previsto líquido (descontado o impacto das restrições vinculadas)
  const valorPrevLiquido = (m: { id: string; valor_previsto_medicao: number }) =>
    Math.max(0, m.valor_previsto_medicao - (restricaoImpactoMap.get(m.id) || 0));

  // ─── Global filter (empresa + tipo contrato only) for all tabs ───
  const medicoesFiltradasGlobal = useMemo(() => {
    return medicoes.filter(m => {
      if (filterEmpresa !== "all" && m.obra_empresa !== filterEmpresa) return false;
      if (filterTipoContrato !== "all" && m.obra_tipo_contrato !== filterTipoContrato) return false;
      return true;
    });
  }, [medicoes, filterEmpresa, filterTipoContrato]);

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const src = medicoesFiltradasGlobal;
    const aprovadas = src.filter(m => m.status_medicao === "aprovada");
    const enviadas = src.filter(m => m.status_medicao === "enviada");
    const pendentes = src.filter(m => m.status_medicao === "prevista" || m.status_medicao === "nao_iniciada");
    const nfRecebida = src.filter(m => m.status_nf === "recebido");

    return {
      totalGeral: src
        .filter(m => m.num_medicao !== "Saldo Inicial")
        .reduce((s, m) => {
          if (m.status_medicao === "aprovada") return s + (Number(m.valor_acatado ?? m.valor_medicao) || 0);
          if (m.status_medicao === "enviada") return s + (Number(m.valor_medicao) || 0);
          return s + valorPrevLiquido(m);
        }, 0),
      totalAprovado: aprovadas.reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
      totalEnviado: enviadas.reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0),
      totalPendente: pendentes.reduce((s, m) => s + valorPrevLiquido(m), 0),
      totalNFRecebida: nfRecebida.reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
      totalAguardandoNF: src.filter(m => m.status_nf === "aguardando_aprovacao").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
      countAprovadas: aprovadas.length,
      countEnviadas: enviadas.length,
      countPendentes: pendentes.length,
    };
  }, [medicoesFiltradasGlobal, valorPrevLiquido]);

  // ─── Fluxo Mensal ───
  const fluxoData = useMemo(() => {
    const monthMap: Record<string, { mes: string; aprovado: number; enviado: number; pendente: number; nf_recebido: number }> = {};
    medicoesFiltradasGlobal.forEach(m => {
      if (!m.mes_referencia || !m.ano_referencia) return;
      const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === m.mes_referencia!.substring(0, 3).toLowerCase());
      if (mesIdx < 0) return;
      const key = `${m.ano_referencia}-${String(mesIdx + 1).padStart(2, "0")}`;
      const label = `${MONTHS[mesIdx]}/${String(m.ano_referencia).slice(2)}`;
      if (!monthMap[key]) monthMap[key] = { mes: label, aprovado: 0, enviado: 0, pendente: 0, nf_recebido: 0 };
      if (m.status_medicao === "aprovada") monthMap[key].aprovado += Number(m.valor_acatado ?? m.valor_medicao) || 0;
      if (m.status_medicao === "enviada") monthMap[key].enviado += Number(m.valor_medicao) || 0;
      if (m.status_medicao === "prevista" || m.status_medicao === "nao_iniciada") monthMap[key].pendente += valorPrevLiquido(m);
      if (m.status_nf === "recebido") monthMap[key].nf_recebido += Number(m.valor_acatado ?? m.valor_medicao) || 0;
    });
    return Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [medicoesFiltradasGlobal, valorPrevLiquido]);
  const medicoesFiltradas = useMemo(() => {
    return medicoes.filter(m => {
      if (filterObra !== "all" && m.obra_id !== filterObra) return false;
      if (filterEmpresa !== "all" && m.obra_empresa !== filterEmpresa) return false;
      if (filterStatusMed !== "all" && m.status_medicao !== filterStatusMed) return false;
      if (filterStatusNF !== "all" && m.status_nf !== filterStatusNF) return false;
      if (filterTipoContrato !== "all" && m.obra_tipo_contrato !== filterTipoContrato) return false;
      if (searchText && !m.obra_nome.toLowerCase().includes(searchText.toLowerCase()) && !m.num_medicao?.includes(searchText)) return false;
      return true;
    }).sort((a, b) => {
      // Ordenar por data mais antiga → mais futura
      // Prioridade: data_previsao_medicao > data_envio > data_aprovacao > mes_referencia/ano_referencia
      const getDate = (m: typeof a): number => {
        if (m.data_previsao_medicao) return new Date(m.data_previsao_medicao + "T12:00:00").getTime();
        if (m.data_envio) return new Date(m.data_envio + "T12:00:00").getTime();
        if (m.data_aprovacao) return new Date(m.data_aprovacao + "T12:00:00").getTime();
        if (m.mes_referencia && m.ano_referencia) {
          const mesIdx = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
            .findIndex(mn => mn === m.mes_referencia!.substring(0, 3).toLowerCase());
          if (mesIdx >= 0) return new Date(m.ano_referencia, mesIdx, 1).getTime();
        }
        return 0;
      };
      return getDate(a) - getDate(b);
    });
  }, [medicoes, filterObra, filterEmpresa, filterStatusMed, filterStatusNF, filterTipoContrato, searchText]);

  const uniqueEmpresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))], [obras]);
  const hasActiveFilter = filterObra !== "all" || filterEmpresa !== "all" || filterStatusMed !== "all" || filterStatusNF !== "all" || filterTipoContrato !== "all" || searchText !== "";

  // ─── Top obras by medicao ───
  const topObrasByMedicao = useMemo(() => {
    const obraMap: Record<string, { nome: string; aprovado: number; pendente: number }> = {};
    medicoes.forEach(m => {
      if (!obraMap[m.obra_id]) obraMap[m.obra_id] = { nome: m.obra_nome, aprovado: 0, pendente: 0 };
      if (m.status_medicao === "aprovada") obraMap[m.obra_id].aprovado += Number(m.valor_acatado ?? m.valor_medicao) || 0;
      if (m.status_medicao === "enviada") obraMap[m.obra_id].aprovado += Number(m.valor_medicao) || 0; // enviada aguard. fiscal — soma ao total em aberto
    });
    return Object.values(obraMap)
      .sort((a, b) => (b.aprovado + b.pendente) - (a.aprovado + a.pendente))
      .slice(0, 8)
      .map(o => ({ ...o, nome: o.nome.length > 20 ? o.nome.slice(0, 20) + "…" : o.nome }));
  }, [medicoes]);

  // ─── Previsão: 3 meses passados + 12 futuros ───
  const previsaoMonths = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => {
      const d = addMonths(startOfMonth(new Date()), i - 3);
      return { date: d, key: format(d, "yyyy-MM"), label: format(d, "MMM/yy"), monthIdx: d.getMonth(), year: d.getFullYear() };
    }), []);

  // ─── Assign each medição to exactly ONE month (priority: data_previsao_medicao > mes_referencia) ───
  const medicaoMonthMap = useMemo(() => {
    const map = new Map<string, string>(); // medicao.id → "yyyy-MM"
    medicoesFiltradasGlobal.forEach(m => {
      let key: string | null = null;
      if (m.data_previsao_medicao) {
        const d = new Date(m.data_previsao_medicao + "T12:00:00");
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      } else if (m.mes_referencia && m.ano_referencia) {
        const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === (m.mes_referencia || "").substring(0, 3).toLowerCase());
        if (mesIdx >= 0) {
          key = `${m.ano_referencia}-${String(mesIdx + 1).padStart(2, "0")}`;
        }
      }
      if (key) map.set(m.id, key);
    });
    return map;
  }, [medicoesFiltradasGlobal]);

  const previsaoData = useMemo(() => {
    return previsaoMonths.map(month => {
      const monthKey = month.key;
      const medsInMonth = medicoesFiltradasGlobal.filter(m => medicaoMonthMap.get(m.id) === monthKey);
      const obrasCount = new Set(medsInMonth.map(m => m.obra_id)).size;
      return {
        mes: month.label,
        key: month.key,
        obrasCount,
        aprovado: medsInMonth.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
        enviado: medsInMonth.filter(m => m.status_medicao === "enviada").reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0),
        pendente: medsInMonth.filter(m => m.status_medicao === "prevista" || m.status_medicao === "nao_iniciada").reduce((s, m) => s + valorPrevLiquido(m), 0),
        nfRecebido: medsInMonth.filter(m => m.status_nf === "recebido").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
        total: medsInMonth.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
        previsto: medsInMonth.reduce((s, m) => s + (m.status_medicao === "aprovada" ? (m.valor_previsto_medicao || 0) : valorPrevLiquido(m)), 0),
        // previstoDasAprovadas: valor previsto apenas das medições já aprovadas no mês
        // Usado no desvio para comparar realizado vs o que era esperado para AQUELAS medições
        previstoDasAprovadas: medsInMonth.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (m.valor_previsto_medicao || 0), 0),
        countPrevistas: medsInMonth.length,
      };
    });
  }, [medicoesFiltradasGlobal, previsaoMonths, medicaoMonthMap, valorPrevLiquido]);

  // ─── Drill-down: medições do mês selecionado na previsão ───
  const drillDownMedicoes = useMemo(() => {
    if (!selectedMonth) return [];
    return medicoesFiltradasGlobal
      .filter(m => medicaoMonthMap.get(m.id) === selectedMonth)
      .sort((a, b) => {
        // Ordenar por data de previsão de envio (mais antiga primeiro)
        // Medições sem data ficam no final
        const da = a.data_previsao_medicao
          ? new Date(a.data_previsao_medicao + "T12:00:00").getTime()
          : Infinity;
        const db = b.data_previsao_medicao
          ? new Date(b.data_previsao_medicao + "T12:00:00").getTime()
          : Infinity;
        if (da !== db) return da - db;
        // Tie-breaker: nome da obra
        return a.obra_nome.localeCompare(b.obra_nome, "pt-BR");
      });
  }, [selectedMonth, medicoesFiltradasGlobal, medicaoMonthMap]);


  const programacaoData = useMemo(() => {
    const now = new Date();
    // Project PAYMENT dates based on obra's prazo_pagamento
    // The financial team needs to know WHEN money will actually arrive, not when it was sent
    const medicoesComData = medicoesFiltradasGlobal.map(m => {
      const prazo = m.obra_prazo_pagamento || 30;
      let dataRef: Date | null = null;
      let statusEntrada = "previsto";
      let calculo = "";

      if (m.status_nf === "recebido" && m.data_pagamento) {
        // Already received — use actual payment date
        dataRef = new Date(m.data_pagamento + "T12:00:00");
        statusEntrada = "recebido";
        calculo = `Pagamento confirmado em ${m.data_pagamento}`;
      } else if ((m.status_medicao === "aprovada" || m.data_aprovacao) && m.data_aprovacao) {
        // Approved (or enviada with data_aprovacao filled) → use real approval date
        dataRef = addDays(new Date(m.data_aprovacao + "T12:00:00"), prazo);
        statusEntrada = "aprovado";
        calculo = `Aprovada ${m.data_aprovacao} + ${prazo} dias = ${format(dataRef, "dd/MM/yy")}`;
      } else if (m.status_medicao === "enviada" && m.data_envio) {
        // Sent without approval date → estimate approval in ~15 days, then + prazo_pagamento
        const diasAprovacao = 15;
        dataRef = addDays(new Date(m.data_envio + "T12:00:00"), diasAprovacao + prazo);
        statusEntrada = "enviado";
        calculo = `Enviada ${m.data_envio} + ~${diasAprovacao}d aprovação + ${prazo}d pgto = ${format(dataRef, "dd/MM/yy")}`;
      } else if (m.data_previsao_medicao) {
        // Planned — estimate: previsao + 15 days approval + prazo_pagamento
        const diasAprovacao = 15;
        dataRef = addDays(new Date(m.data_previsao_medicao + "T12:00:00"), diasAprovacao + prazo);
        statusEntrada = "previsto";
        calculo = `Prev. envio ${m.data_previsao_medicao} + ~${diasAprovacao}d + ${prazo}d = ${format(dataRef, "dd/MM/yy")}`;
      } else if (m.mes_referencia && m.ano_referencia) {
        const mesIdx = MONTHS.findIndex(mn => mn.toLowerCase() === m.mes_referencia!.substring(0, 3).toLowerCase());
        if (mesIdx >= 0) {
          dataRef = addDays(new Date(m.ano_referencia, mesIdx, 15), 15 + prazo);
          statusEntrada = "estimado";
          calculo = `Ref. ${m.mes_referencia}/${m.ano_referencia} + ~15d + ${prazo}d pgto (estimativa)`;
        }
      }

      return { ...m, dataRef, statusEntrada, calculo };
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
          recebido: medsInWeek.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          aprovado: medsInWeek.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          enviado: medsInWeek.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0),
          pendente: medsInWeek.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + valorPrevLiquido(m), 0),
          total: medsInWeek.reduce((s, m) => s + (
            m.statusEntrada === "recebido" || m.statusEntrada === "aprovado"
              ? (Number(m.valor_acatado ?? m.valor_medicao) || 0)
              : m.statusEntrada === "enviado"
              ? (Number(m.valor_medicao) || 0)
              : valorPrevLiquido(m)
          ), 0),
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
          recebido: medsInPeriod.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          aprovado: medsInPeriod.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          enviado: medsInPeriod.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0),
          pendente: medsInPeriod.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + valorPrevLiquido(m), 0),
          total: medsInPeriod.reduce((s, m) => s + (
            m.statusEntrada === "recebido" || m.statusEntrada === "aprovado"
              ? (Number(m.valor_acatado ?? m.valor_medicao) || 0)
              : m.statusEntrada === "enviado"
              ? (Number(m.valor_medicao) || 0)
              : valorPrevLiquido(m)
          ), 0),
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
          recebido: medsInMonth.filter(m => m.statusEntrada === "recebido").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          aprovado: medsInMonth.filter(m => m.statusEntrada === "aprovado").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0),
          enviado: medsInMonth.filter(m => m.statusEntrada === "enviado").reduce((s, m) => s + (Number(m.valor_medicao) || 0), 0),
          pendente: medsInMonth.filter(m => m.statusEntrada === "previsto" || m.statusEntrada === "estimado" || m.statusEntrada === "pendente").reduce((s, m) => s + valorPrevLiquido(m), 0),
          total: medsInMonth.reduce((s, m) => s + (
            m.statusEntrada === "recebido" || m.statusEntrada === "aprovado"
              ? (Number(m.valor_acatado ?? m.valor_medicao) || 0)
              : m.statusEntrada === "enviado"
              ? (Number(m.valor_medicao) || 0)
              : valorPrevLiquido(m)
          ), 0),
          medicoes: medsInMonth,
        };
      });
    }
  }, [medicoesFiltradasGlobal, agrupamento, valorPrevLiquido]);

  // ─── Insights ───
  const insights = useMemo(() => {
    const enviadas = medicoes.filter(m => m.status_medicao === "enviada");
    const first = enviadas.sort((a, b) => (a.data_envio || "z").localeCompare(b.data_envio || "z"))[0];
    const now3 = new Date();
    const in3months = new Date(now3.getFullYear(), now3.getMonth() + 3, now3.getDate());
    const next3 = medicoes
      .filter(m => m.status_medicao !== "aprovada" && m.data_previsao_medicao)
      .filter(m => {
        const d = new Date(m.data_previsao_medicao + "T12:00:00");
        return d >= now3 && d <= in3months;
      })
      .reduce((s, m) => s + valorPrevLiquido(m), 0);
    const obraIds = new Set(medicoes.map(m => m.obra_id));
    const obrasSem = obras.filter(o => !obraIds.has(o.id));
    return { proximaEntrada: first, totalProx3Meses: next3, obrasSemMedicao: obrasSem };
  }, [medicoes, obras, previsaoData, valorPrevLiquido]);

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

  // ─── Reprogramar Previsão ───
  const handleReprogramar = async () => {
    if (!reprogramarMedicao || !reprogramarForm.motivo.trim()) return;
    setSavingReprogramar(true);
    try {
      // 1. Save history
      await supabase.from("medicao_previsao_historico").insert({
        medicao_id: reprogramarMedicao.id,
        obra_id: reprogramarMedicao.obra_id,
        data_previsao_anterior: reprogramarMedicao.data_previsao_medicao,
        valor_previsto_anterior: reprogramarMedicao.valor_previsto_medicao,
        data_previsao_nova: reprogramarForm.novaData || null,
        valor_previsto_novo: reprogramarForm.novoValor || reprogramarMedicao.valor_previsto_medicao,
        motivo: reprogramarForm.motivo.trim(),
        created_by: user?.id,
        created_by_name: (profile as any)?.display_name || user?.email || "—",
      });

      // 2. Update medicao with new forecast
      const updatePayload: any = {};
      if (reprogramarForm.novaData) updatePayload.data_previsao_medicao = reprogramarForm.novaData;
      if (reprogramarForm.novoValor > 0) updatePayload.valor_previsto_medicao = reprogramarForm.novoValor;
      
      if (Object.keys(updatePayload).length > 0) {
        await supabase.from("medicoes_ple").update(updatePayload).eq("id", reprogramarMedicao.id);
      }

      toast.success("Previsão reprogramada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["holding-receitas"], exact: false });
      setReprogramarMedicao(null);
      setReprogramarForm({ motivo: "", novaData: "", novoValor: 0 });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao reprogramar previsão.");
    } finally {
      setSavingReprogramar(false);
    }
  };

  const toggleProgPeriod = (idx: number) => {
    setExpandedProgPeriods(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
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
      {isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar dados</AlertTitle>
          <AlertDescription>Recarregue a página ou tente novamente mais tarde.</AlertDescription>
        </Alert>
      )}
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden p-2 -ml-1 text-foreground hover:text-primary hover:bg-accent rounded-md transition-colors" />
          <NotificationBell modulo="holding" />
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />Receitas & Medições PLE
            </h1>
            <p className="text-xs text-muted-foreground">Gestão financeira de entradas — todas as obras do portfólio</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Todas Empresas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Empresas</SelectItem>
              {uniqueEmpresas.map(e => <SelectItem key={e!} value={e!}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportarCSV}><Download className="h-4 w-4" /> Exportar CSV</Button>
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Clock className="h-3.5 w-3.5 text-blue-500" />Aguard. Fiscal</div>
                  <p className="text-xl font-bold text-blue-600">{BRL.format(kpis.totalEnviado)}</p>
                  <p className="text-[10px] text-muted-foreground">{kpis.countEnviadas} medições</p>
                </CardContent>
              </Card>
              <Card className="border-b-2 border-b-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><AlertCircle className="h-3.5 w-3.5 text-amber-500" />Medições Previstas</div>
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
              <TabsList className="grid w-full grid-cols-5 max-w-2xl">
                <TabsTrigger value="financeiro">💳 Financeiro</TabsTrigger>
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
                      <SelectItem value="prevista">Previsão</SelectItem>
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
                         <TableHead colSpan={3} className="text-center text-xs font-bold border-r">IDENTIFICAÇÃO</TableHead>
                          <TableHead colSpan={9} className="text-center text-xs font-bold border-r text-blue-600">ENGENHARIA</TableHead>
                          <TableHead colSpan={3} className="text-center text-xs font-bold text-emerald-600">FINANCEIRO</TableHead>
                      </TableRow>
                      <TableRow>
                        <TableHead className="text-xs w-8">#</TableHead>
                        <TableHead className="text-xs">Obra</TableHead>
                        <TableHead className="text-xs border-r">Empresa</TableHead>
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
                            <TableCell className="py-2 border-r">{m.obra_empresa || "—"}</TableCell>
                             <TableCell className="py-2">{m.num_medicao || "—"}</TableCell>
                            <TableCell className="py-2">{m.mes_referencia || "—"}</TableCell>
                            <TableCell className="py-2">{m.ano_referencia || "—"}</TableCell>
                             <TableCell className={`py-2 ${m.data_previsao_medicao && m.status_medicao !== "aprovada" && m.status_medicao !== "enviada" && new Date(m.data_previsao_medicao + "T12:00:00") < new Date() ? "text-destructive font-semibold" : ""}`}>{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                             <TableCell className="py-2 text-right">
                               {m.valor_previsto_medicao > 0 ? (
                                 m.status_medicao === "aprovada"
                                   ? BRL.format(m.valor_previsto_medicao)
                                   : (() => {
                                       const liq = valorPrevLiquido(m);
                                       const temRestr = liq < m.valor_previsto_medicao;
                                       return (
                                         <span className={temRestr ? "text-amber-600" : ""} title={temRestr ? `Bruto: ${BRL.format(m.valor_previsto_medicao)} — Restrição: −${BRL.format(m.valor_previsto_medicao - liq)}` : undefined}>
                                           {BRL.format(liq)}
                                         </span>
                                       );
                                     })()
                               ) : "—"}
                             </TableCell>
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
                        <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">Nenhuma medição encontrada.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer totals */}
                <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
                  <span>{medicoesFiltradas.length} medições encontradas</span>
                  <span>
                    <strong>Total:</strong> {BRL.format(medicoesFiltradas.reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0))}
                    {" | "}
                    <strong>Aprovado:</strong> {BRL.format(medicoesFiltradas.filter(m => m.status_medicao === "aprovada").reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0))}
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
                        <CardTitle className="text-sm">Previsão de Caixa — Últimos 3 + Próximos 12 Meses</CardTitle>
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
                            const isExpanded = selectedMonth === p.key;
                            return (
                              <>
                               <TableRow
                                 key={p.mes}
                                 className={`text-xs cursor-pointer transition-colors hover:bg-accent/50 ${isExpanded ? "bg-accent/30 font-semibold" : isCurrentMonth ? "bg-primary/5 border-l-2 border-l-primary" : hasData ? "bg-emerald-500/5" : "bg-muted/20"}`}
                                 onClick={() => setSelectedMonth(isExpanded ? null : p.key)}
                               >
                                 <TableCell className="py-2 font-medium flex items-center gap-1">
                                   {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                   {p.mes}
                                 </TableCell>
                                 <TableCell className="py-2 text-center">{p.obrasCount || "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-primary">{p.previsto > 0 ? BRL_SHORT(p.previsto) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-amber-600">{p.pendente > 0 ? BRL.format(p.pendente) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-blue-600">{p.enviado > 0 ? BRL.format(p.enviado) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-emerald-600">{p.aprovado > 0 ? BRL.format(p.aprovado) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right text-emerald-500">{p.nfRecebido > 0 ? BRL.format(p.nfRecebido) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right font-bold">{p.total > 0 ? BRL.format(p.total) : "—"}</TableCell>
                                 <TableCell className="py-2 text-right">
                                   {p.previstoDasAprovadas > 0 && p.total > 0 ? (() => {
                                     // Desvio: realizado (acatado) vs previsto das MESMAS medições aprovadas
                                     // Evita comparação entre aprovadas e total esperado do mês (incluiria pendentes)
                                     const desvio = p.total - p.previstoDasAprovadas;
                                     return <span className={desvio >= 0 ? "text-emerald-600" : "text-amber-600"}>{desvio >= 0 ? "+" : ""}{BRL_SHORT(Math.abs(desvio))}</span>;
                                   })() : "—"}
                                 </TableCell>
                               </TableRow>
                               {isExpanded && drillDownMedicoes.length > 0 && (
                                 <>
                                   {/* Drill-down header */}
                                   <TableRow className="bg-muted/40">
                                     <TableCell colSpan={2} className="py-1.5 text-[10px] font-semibold text-muted-foreground">Obra</TableCell>
                                     <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-center">Nº Med.</TableCell>
                                     <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-center">Status</TableCell>
                                     <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Previsto</TableCell>
                                     <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Acatado</TableCell>
                                     <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Desvio</TableCell>
                                      <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-right">Prev. Envio</TableCell>
                                      <TableCell className="py-1.5 text-[10px] font-semibold text-muted-foreground text-center">Ação</TableCell>
                                   </TableRow>
                                   {/* Drill-down rows */}
                                   {drillDownMedicoes.map(m => {
                                     const desvio = (m.valor_acatado != null && m.valor_acatado > 0) ? (m.valor_acatado - m.valor_previsto_medicao) : null;
                                     const statusCfg = m.status_medicao === "aprovada"
                                       ? { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
                                       : m.status_medicao === "enviada"
                                       ? { label: "Aguard. Fiscal", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" }
                                       : { label: "Prevista", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
                                     return (
                                       <TableRow key={m.id} className="text-[11px] bg-background/50 border-l-4 border-l-primary/20 hover:bg-accent/20">
                                         <TableCell colSpan={2} className="py-1.5 pl-6 truncate max-w-[180px]" title={m.obra_nome}>{m.obra_nome}</TableCell>
                                         <TableCell className="py-1.5 text-center">{m.num_medicao || "—"}</TableCell>
                                         <TableCell className="py-1.5 text-center">
                                           <Badge className={`text-[9px] px-1.5 py-0 ${statusCfg.cls}`}>{statusCfg.label}</Badge>
                                         </TableCell>
                                         <TableCell className="py-1.5 text-right">
                                           {m.valor_previsto_medicao > 0 ? (
                                             m.status_medicao === "aprovada"
                                               ? BRL.format(m.valor_previsto_medicao)
                                               : (() => {
                                                   const liq = valorPrevLiquido(m);
                                                   const temRestr = liq < m.valor_previsto_medicao;
                                                   return (
                                                     <span className={temRestr ? "text-amber-600" : ""} title={temRestr ? `Bruto: ${BRL.format(m.valor_previsto_medicao)} — Restrição: −${BRL.format(m.valor_previsto_medicao - liq)}` : undefined}>
                                                       {BRL.format(liq)}
                                                     </span>
                                                   );
                                                 })()
                                           ) : "—"}
                                         </TableCell>
                                         <TableCell className="py-1.5 text-right">{(m.valor_acatado != null && m.valor_acatado > 0) ? BRL.format(m.valor_acatado) : "—"}</TableCell>
                                         <TableCell className="py-1.5 text-right">
                                           {desvio != null ? (
                                             <span className={desvio > 0 ? "text-emerald-600" : desvio < 0 ? "text-destructive" : "text-muted-foreground"}>
                                               {desvio > 0 ? "+" : ""}{BRL.format(desvio)}
                                             </span>
                                           ) : <span className="text-muted-foreground">—</span>}
                                         </TableCell>
                                          <TableCell className={`py-1.5 text-right ${m.data_previsao_medicao && m.status_medicao !== "aprovada" && m.status_medicao !== "enviada" && new Date(m.data_previsao_medicao + "T12:00:00") < new Date() ? "text-destructive font-semibold" : ""}`}>{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                                          <TableCell className="py-1.5 text-center">
                                            {m.status_medicao !== "aprovada" && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setReprogramarMedicao(m);
                                                  setReprogramarForm({
                                                    motivo: "",
                                                    novaData: m.data_previsao_medicao || "",
                                                    novoValor: m.valor_previsto_medicao || 0,
                                                  });
                                                }}
                                              >
                                                <RotateCcw className="h-3 w-3 mr-1" />Reprogramar
                                              </Button>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                     );
                                   })}
                                   {/* Drill-down footer totals */}
                                    {(() => {
                                      const sumPrevisto = drillDownMedicoes.reduce((s, m) =>
                                        s + (m.status_medicao === "aprovada" ? (m.valor_previsto_medicao || 0) : valorPrevLiquido(m)), 0);
                                      const medsComAcatado = drillDownMedicoes.filter(m => m.valor_acatado != null && m.valor_acatado > 0);
                                      const sumAcatado = medsComAcatado.reduce((s, m) => s + (m.valor_acatado ?? 0), 0);
                                      const hasAcatado = medsComAcatado.length > 0;
                                      const sumPrevistoAcatado = medsComAcatado.reduce((s, m) => s + (m.valor_previsto_medicao || 0), 0);
                                      const sumDesvio = hasAcatado ? sumAcatado - sumPrevistoAcatado : null;
                                     return (
                                       <TableRow className="bg-muted/30 font-semibold text-[11px]">
                                         <TableCell colSpan={2} className="py-1.5 pl-6">Total ({drillDownMedicoes.length} medições)</TableCell>
                                         <TableCell className="py-1.5" />
                                         <TableCell className="py-1.5" />
                                         <TableCell className="py-1.5 text-right">{BRL.format(sumPrevisto)}</TableCell>
                                         <TableCell className="py-1.5 text-right">{hasAcatado ? BRL.format(sumAcatado) : "—"}</TableCell>
                                         <TableCell className="py-1.5 text-right">
                                           {sumDesvio != null ? (
                                             <span className={sumDesvio > 0 ? "text-emerald-600" : sumDesvio < 0 ? "text-destructive" : "text-muted-foreground"}>
                                               {sumDesvio > 0 ? "+" : ""}{BRL.format(sumDesvio)}
                                             </span>
                                           ) : "—"}
                                         </TableCell>
                                         <TableCell colSpan={2} className="py-1.5" />
                                       </TableRow>
                                     );
                                   })()}
                                 </>
                               )}
                               {isExpanded && drillDownMedicoes.length === 0 && (
                                 <TableRow className="bg-muted/20">
                                   <TableCell colSpan={9} className="py-3 text-center text-xs text-muted-foreground">Nenhuma medição encontrada para este mês</TableCell>
                                 </TableRow>
                               )}
                              </>
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
                          <Bar dataKey="enviado" name="Aguard. Fiscal" fill="#3b82f6" />
                          <Bar dataKey="previsto" name="Previsto" fill="#f59e0b" />
                          <Bar dataKey="pendente" name="Medições Previstas" fill="#94a3b8" />
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
                        {insights.proximaEntrada ? `${insights.proximaEntrada.obra_nome} — ${BRL.format(insights.proximaEntrada.valor_acatado ?? insights.proximaEntrada.valor_medicao)}` : "Nenhuma medição pendente"}
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
                      <p className="text-sm font-semibold text-primary">{BRL_SHORT(previsaoData.slice(3, 6).reduce((s, p) => s + p.previsto, 0))}</p>
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

                    {/* Detail: Medições por período com explicação de cálculo */}
                    {programacaoData.some(p => p.medicoes.length > 0) && (
                      <Card className="border-dashed">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs text-muted-foreground">Detalhamento — Previsão de Pagamento por Medição</CardTitle>
                          <p className="text-[10px] text-muted-foreground">Datas projetadas com base no prazo de pagamento cadastrado em cada obra</p>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {programacaoData.filter(p => p.medicoes.length > 0).map((p, i) => {
                              const isExpProg = expandedProgPeriods.has(i);
                              return (
                              <div key={i} className="border rounded-lg overflow-hidden">
                                <button
                                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-accent/50 transition-colors"
                                  onClick={() => toggleProgPeriod(i)}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {isExpProg ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                    {p.label} — {BRL.format(p.total)}
                                  </span>
                                  <Badge variant="secondary" className="text-[10px]">{p.medicoes.length} medições</Badge>
                                </button>
                                {isExpProg && (
                                <div className="space-y-1 px-3 pb-3">
                                  {p.medicoes.map((m: any) => {
                                    const STATUS_ENTRADA_BADGE: Record<string, { label: string; cls: string }> = {
                                      recebido: { label: "NF Recebida", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                                      aprovado: { label: "Medição Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                                      enviado:  { label: "Medição Enviada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
                                      previsto: { label: "Prevista", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
                                      estimado: { label: "Estimada", cls: "bg-muted text-muted-foreground" },
                                      pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
                                    };
                                    const statusCfg = STATUS_ENTRADA_BADGE[m.statusEntrada] || STATUS_ENTRADA_BADGE.pendente;
                                    const statusColors: Record<string, string> = {
                                      recebido: "border-l-emerald-500",
                                      aprovado: "border-l-emerald-400",
                                      enviado: "border-l-blue-500",
                                      previsto: "border-l-amber-500",
                                      estimado: "border-l-muted",
                                    };
                                    return (
                                      <div key={m.id} className={`rounded border border-l-4 ${statusColors[m.statusEntrada] || ""} px-3 py-2`}>
                                        <div className="flex items-center justify-between gap-2 text-xs">
                                          <span className="font-medium truncate flex-1">{m.obra_nome}</span>
                                          <span className="text-muted-foreground">Med {m.num_medicao || "—"}</span>
                                          <Badge className={`text-[9px] ${statusCfg.cls}`} variant="secondary">{statusCfg.label}</Badge>
                                          <span className="font-semibold whitespace-nowrap">{BRL.format(
                                            m.statusEntrada === "recebido" || m.statusEntrada === "aprovado"
                                              ? (Number(m.valor_acatado ?? m.valor_medicao) || 0)
                                              : m.statusEntrada === "enviado"
                                              ? (Number(m.valor_medicao) || 0)
                                              : (Number(m.valor_previsto_medicao) || 0)
                                          )}</span>
                                        </div>
                                        {m.calculo && (
                                          <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {m.calculo}
                                            {m.obra_prazo_pagamento && (
                                              <Badge variant="outline" className="text-[8px] ml-1">Prazo: {m.obra_prazo_pagamento}d</Badge>
                                            )}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Financial planning tip */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary mb-1">💡 Como o sistema calcula as projeções</p>
                      <p className="text-[11px] text-muted-foreground">
                        <strong>Recebido:</strong> data real de pagamento. {" "}
                        <strong>Aprovada:</strong> data aprovação + prazo de pagamento da obra. {" "}
                        <strong>Enviada:</strong> data envio + ~15 dias (aprovação estimada) + prazo pgto. {" "}
                        <strong>Prevista:</strong> data previsão + ~15d + prazo pgto. {" "}
                        O prazo de pagamento vem do cadastro de cada obra (padrão: 30 dias se não informado).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══ TAB FINANCEIRO ═══ */}
              <TabsContent value="financeiro" className="space-y-4 mt-4">
                {(() => {
                  const obrasAndamento = obras.filter((o: any) => o.status === "em_andamento" && (filterEmpresa === "all" || o.empresa === filterEmpresa));
                  const now = new Date();
                  const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

                  const obraCards = obrasAndamento.map((obra: any) => {
                    const valorContrato = (Number(obra.valor_contrato) || 0) + (Number(obra.aditivo_valor_total) || 0);
                    const medsDaObra = medicoes.filter(m => m.obra_id === obra.id);
                    const restrDaObra = restricoes.filter((r: any) => r.obra_id === obra.id && !r.resolvida);

                    const valorRecebido = medsDaObra
                      .filter(m => m.status_nf === "recebido" && m.data_pagamento)
                      .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const pctRecebido = valorContrato > 0 ? (valorRecebido / valorContrato) * 100 : 0;

                    // Acumulado financeiro: medições aprovadas + valor_medido_inicial (pré-sistema)
                    const acatadoAprovadas = medsDaObra
                      .filter(m => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
                      .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const saldoInicialMed = medsDaObra
                      .filter(m => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
                      .reduce((s, m) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const valorMedIni = saldoInicialMed > 0 ? saldoInicialMed : (Number(obra.valor_medido_inicial) || 0);
                    const totalMedido = acatadoAprovadas + valorMedIni;
                    const pctMedido = valorContrato > 0 ? Math.min(100, (totalMedido / valorContrato) * 100) : 0;

                    const proximaMedicao = medsDaObra
                      .filter(m =>
                        m.status_medicao !== "aprovada" &&
                        m.status_nf !== "recebido" &&
                        m.num_medicao !== "Saldo Inicial" &&
                        (m.data_previsao_medicao || m.data_envio || m.data_aprovacao)
                      )
                      .sort((a, b) => {
                        // Sort by most advanced stage first, then by date
                        const stageOrder: Record<string, number> = {
                          aguardando_aprovacao: 0, aprovada: 1, enviada: 2,
                          prevista: 3, nao_iniciada: 4,
                        };
                        const sa = stageOrder[a.status_medicao] ?? 5;
                        const sb = stageOrder[b.status_medicao] ?? 5;
                        if (sa !== sb) return sa - sb;
                        const da = a.data_previsao_medicao || a.data_envio || "9999";
                        const db = b.data_previsao_medicao || b.data_envio || "9999";
                        return da.localeCompare(db);
                      })
                      [0] || null;

                    const impactoRestricoes = restrDaObra
                      .filter((r: any) => r.medicao_id === proximaMedicao?.id || !r.medicao_id)
                      .reduce((s: number, r: any) => s + (Number(r.impacto_medicao) || 0), 0);
                    const valorPrevAjustado = Math.max(0, (Number(proximaMedicao?.valor_previsto_medicao) || 0) - impactoRestricoes);

                    const dataEntradaProjetada = proximaMedicao?.data_previsao_medicao
                      ? addDays(new Date(proximaMedicao.data_previsao_medicao + "T12:00:00"), 30)
                      : null;

                    const saldoReceber = Math.max(0, valorContrato - valorRecebido);
                    const hasVencidas = restrDaObra.some((r: any) => r.data_limite && new Date(r.data_limite + "T23:59:59") < now);

                    const statusColor = !proximaMedicao ? "bg-muted" :
                      (proximaMedicao.status_medicao === "prevista" || proximaMedicao.status_medicao === "nao_iniciada") ? "bg-amber-500" :
                      proximaMedicao.status_medicao === "enviada" ? "bg-blue-500" :
                      proximaMedicao.status_medicao === "aprovada" ? "bg-emerald-400" :
                      proximaMedicao.status_nf === "aguardando_aprovacao" ? "bg-emerald-600" :
                      "bg-slate-400";

                    return { obra, valorContrato, valorRecebido, pctRecebido, totalMedido, pctMedido, proximaMedicao, valorPrevAjustado, impactoRestricoes, dataEntradaProjetada, saldoReceber, restrDaObra, hasVencidas, statusColor };
                  }).sort((a, b) => {
                    if (a.hasVencidas && !b.hasVencidas) return -1;
                    if (!a.hasVencidas && b.hasVencidas) return 1;
                    const da = a.proximaMedicao?.data_previsao_medicao || "9999";
                    const db = b.proximaMedicao?.data_previsao_medicao || "9999";
                    if (da !== db) return da.localeCompare(db);
                    return b.saldoReceber - a.saldoReceber;
                  });

                  // KPIs removed — only top-level KPIs remain

                    return (
                    <>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {obraCards.map(({ obra, valorContrato, valorRecebido, pctRecebido, totalMedido, pctMedido, proximaMedicao, valorPrevAjustado, impactoRestricoes, dataEntradaProjetada, restrDaObra, hasVencidas, statusColor }) => (
                          <Card
                            key={obra.id}
                            className={`border-l-4 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all ${hasVencidas ? "border-l-destructive" : impactoRestricoes > 0 ? "border-l-amber-500" : "border-l-emerald-500/60"}`}
                            onClick={() => setSelectedObraId(obra.id)}
                          >
                            <CardContent className="p-4 space-y-2.5">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${pctMedido >= 100 ? "bg-emerald-500" : pctMedido > 0 ? "bg-blue-500" : "bg-gray-400"}`} />
                                    <h3 className="font-semibold text-sm text-foreground truncate">{obra.nome}</h3>
                                  </div>
                                  {obra.empresa && <p className="text-xs text-muted-foreground truncate ml-4">{obra.empresa}</p>}
                                </div>
                                <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 shrink-0" variant="secondary">Em Andamento</Badge>
                              </div>

                              {/* Medido — barra full-width */}
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Medido</span>
                                  <span className="font-medium text-foreground">{pctMedido.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctMedido}%` }} />
                                </div>
                                <p className="text-[10px] text-muted-foreground">{BRL.format(totalMedido)} de {BRL.format(valorContrato)}</p>
                              </div>

                              {/* Próxima entrada — barra full-width */}
                              {proximaMedicao ? (() => {
                                const valorBruto = Number(proximaMedicao.valor_previsto_medicao) || 0;
                                const pctBruto = valorContrato > 0 ? Math.min(100, (valorBruto / valorContrato) * 100) : 0;
                                return (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                      <span>Próxima entrada — Med {proximaMedicao.num_medicao}: <span className="font-medium text-foreground">{BRL.format(valorPrevAjustado)}</span></span>
                                      <span>{dataEntradaProjetada ? format(dataEntradaProjetada, "dd/MM/yy") : "—"}</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${statusColor}`} style={{ width: `${pctBruto}%` }} />
                                    </div>
                                  </div>
                                );
                              })() : (
                                <p className="text-[10px] text-muted-foreground">Sem medição prevista pendente.</p>
                              )}

                              {/* Restrição financeira — barra full-width */}
                              {impactoRestricoes > 0 && (() => {
                                const valorBruto = proximaMedicao ? (Number(proximaMedicao.valor_previsto_medicao) || 0) : 0;
                                const pctRestr = valorBruto > 0 ? Math.min(100, (impactoRestricoes / valorBruto) * 100) : 0;
                                const qtdAbertas = restrDaObra.filter((r: any) => !r.resolvida).length;
                                return (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className="text-destructive flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3 shrink-0" />
                                        Restrição financeira: −{BRL.format(impactoRestricoes)} ({pctRestr.toFixed(0)}% da medição)
                                      </span>
                                      <span className="text-destructive font-medium">{qtdAbertas} aberta(s)</span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                                      <div className="h-full bg-destructive rounded-full transition-all" style={{ width: `${pctRestr}%` }} />
                                    </div>
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        ))}
                        {obraCards.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma obra em andamento.</div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
      <FinanceiroObraSheet
        obraId={selectedObraId}
        obras={obras}
        medicoes={medicoes}
        restricoes={restricoes}
        onClose={() => setSelectedObraId(null)}
        onUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ["holding-receitas"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["holding-portfolio"], exact: false });
        }}
      />
    </SidebarProvider>
  );
}

/* ══════════════════════════════════════════════
   FinanceiroObraSheet — Decision point for financial team
   ══════════════════════════════════════════════ */

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  material: { label: "Material", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  mao_de_obra: { label: "Mão de Obra", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  administrativa: { label: "Administrativa", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

const FORMA_RESOLUCAO_OPTIONS = [
  { value: "pago", label: "Pago" },
  { value: "documento_enviado", label: "Documento enviado" },
  { value: "negociado", label: "Negociado" },
  { value: "waiver", label: "Waiver" },
  { value: "outro", label: "Outro" },
];

function FinanceiroObraSheet({
  obraId, obras, medicoes, restricoes: restricoesGlobais, onClose, onUpdate,
}: {
  obraId: string | null;
  obras: any[];
  medicoes: any[];
  restricoes: any[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { user, profile, holdingCan } = useAuth();
  const canResolve = holdingCan('resolver_restricoes');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({ valor_pago: 0, forma_resolucao: "pago" });
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [saving, setSaving] = useState(false);

  const obra = obras.find((o: any) => o.id === obraId);

  const medsDaObra = useMemo(() => {
    if (!obraId) return [];
    return medicoes.filter((m: any) => m.obra_id === obraId)
      .sort((a: any, b: any) => {
        if (a.num_medicao === "Saldo Inicial") return -1;
        if (b.num_medicao === "Saldo Inicial") return 1;
        return parseInt(a.num_medicao || "0") - parseInt(b.num_medicao || "0");
      });
  }, [medicoes, obraId]);

  const restrDaObra = useMemo(() => {
    if (!obraId) return [];
    return restricoesGlobais.filter((r: any) => r.obra_id === obraId);
  }, [restricoesGlobais, obraId]);

  const restrAbertas = restrDaObra.filter((r: any) => !r.resolvida);
  const restrResolvidas = restrDaObra.filter((r: any) => r.resolvida)
    .sort((a: any, b: any) => (b.resolvida_em || "").localeCompare(a.resolvida_em || ""));

  // Mapa de impacto por medicao_id (apenas restrições abertas)
  const restrImpactoSheetMap = useMemo(() => {
    const map = new Map<string, number>();
    restrAbertas.forEach((r: any) => {
      if (r.medicao_id) map.set(r.medicao_id, (map.get(r.medicao_id) || 0) + (Number(r.impacto_medicao) || 0));
    });
    return map;
  }, [restrAbertas]);

  const valorPrevLiquidoSheet = (m: any): number =>
    m.status_medicao === "aprovada"
      ? (Number(m.valor_previsto_medicao) || 0)
      : Math.max(0, (Number(m.valor_previsto_medicao) || 0) - (restrImpactoSheetMap.get(m.id) || 0));

  const valorContrato = obra ? (Number(obra.valor_contrato) || 0) + (Number(obra.aditivo_valor_total) || 0) : 0;
  const valorRecebido = medsDaObra
    .filter((m: any) => m.status_nf === "recebido" && m.data_pagamento)
    .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
  const saldoReceber = Math.max(0, valorContrato - valorRecebido);
  const pctRecebido = valorContrato > 0 ? (valorRecebido / valorContrato) * 100 : 0;

  const now = new Date();
  const restrVencidas = restrDaObra.filter((r: any) => r.data_limite && new Date(r.data_limite + "T23:59:59") < now);
  const impactoTotal = restrAbertas.reduce((s: number, r: any) => s + (Number(r.impacto_medicao) || 0), 0);

  const prazoFim = obra?.data_inicio && obra?.prazo_dias
    ? addDays(new Date(obra.data_inicio + "T12:00:00"), (obra.prazo_dias || 0) + (obra.aditivo_prazo_dias || 0))
    : null;
  const diasParaFim = prazoFim ? Math.ceil((prazoFim.getTime() - now.getTime()) / 86400000) : null;

  const handleResolver = async () => {
    if (!resolvingId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("restricoes_financeiras").update({
        resolvida: true,
        resolvida_em: new Date().toISOString(),
        resolvida_por: user?.id,
        resolvida_por_nome: (profile as any)?.display_name || user?.email || "Financeiro",
        valor_pago: resolveForm.valor_pago,
        forma_resolucao: resolveForm.forma_resolucao,
      }).eq("id", resolvingId);
      if (error) { toast.error("Sem permissão ou erro ao resolver restrição."); return; }
      toast.success("Restrição resolvida — impacto removido da medição.");
      onClose();   // fecha o sheet imediatamente — evita stale data visível
      onUpdate();  // refetch em background
    } catch (e) {
      console.error(e);
      toast.error("Erro ao resolver restrição.");
    } finally {
      setSaving(false);
      setResolvingId(null);
      setResolveForm({ valor_pago: 0, forma_resolucao: "pago" });
    }
  };

  const handleRecusar = async () => {
    if (!recusandoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("restricoes_financeiras").update({
        resolvida: true,
        resolvida_em: new Date().toISOString(),
        resolvida_por: user?.id,
        resolvida_por_nome: (profile as any)?.display_name || user?.email || "Financeiro",
        forma_resolucao: motivoRecusa.trim() ? `recusada: ${motivoRecusa.trim()}` : "recusada",
        valor_pago: 0,
      }).eq("id", recusandoId);
      if (error) { toast.error("Sem permissão ou erro ao recusar restrição."); return; }
      toast.success("Restrição recusada — impacto removido.");
      onClose();   // fecha o sheet imediatamente — evita stale data visível
      onUpdate();  // refetch em background
    } catch (e) {
      console.error(e);
      toast.error("Erro ao recusar restrição.");
    } finally {
      setSaving(false);
      setRecusandoId(null);
      setMotivoRecusa("");
    }
  };

  // Pre-fill resolver form when opening
  const openResolver = (r: any) => {
    setResolveForm({ valor_pago: Number(r.impacto_medicao) || 0, forma_resolucao: "pago" });
    setResolvingId(r.id);
  };

  return (
    <>
      <Sheet open={!!obraId} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="w-full sm:max-w-[75vw] overflow-y-auto p-0">
          {obra && (
            <div className="p-5 space-y-5">
              {/* Header */}
              <SheetHeader className="p-0">
                <SheetTitle className="text-base font-bold">{obra.nome}</SheetTitle>
                <div className="flex gap-1.5 flex-wrap mt-1">
                  {obra.empresa && <Badge variant="outline" className="text-[10px]">{obra.empresa}</Badge>}
                  {obra.num_contrato && <Badge variant="outline" className="text-[10px]">{obra.num_contrato}</Badge>}
                  {obra.uh && <Badge variant="outline" className="text-[10px]">{obra.uh} UH</Badge>}
                </div>
              </SheetHeader>

              {/* Alerts */}
              {restrVencidas.length > 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span><strong>{restrVencidas.length} restrição(ões) vencida(s)</strong> — prazo expirado sem resolução.</span>
                </div>
              )}
              {diasParaFim !== null && diasParaFim < 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span><strong>Prazo contratual vencido</strong> há {Math.abs(diasParaFim)} dias.</span>
                </div>
              )}
              {diasParaFim !== null && diasParaFim >= 0 && diasParaFim <= 30 && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span><strong>{diasParaFim} dias</strong> para o fim do prazo contratual.</span>
                </div>
              )}

              <Separator />

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Total Contratado</p>
                  <p className="text-sm font-bold">{BRL.format(valorContrato)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Total Medido</p>
                  {(() => {
                    // Inclui valor_medido_inicial (faturamento pré-sistema) + medições aprovadas
                    const acatadoReal = medsDaObra
                      .filter((m: any) => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const saldoInicialMed = medsDaObra
                      .filter((m: any) => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const valorMedIni = saldoInicialMed > 0 ? saldoInicialMed : (Number(obra?.valor_medido_inicial) || 0);
                    const totalMedido = acatadoReal + valorMedIni;
                    const pct = valorContrato > 0 ? (totalMedido / valorContrato * 100).toFixed(1) : "0.0";
                    return (
                      <>
                        <p className="text-sm font-bold text-emerald-600">{BRL.format(totalMedido)}</p>
                        {valorMedIni > 0 && <p className="text-[10px] text-muted-foreground">inclui {BRL.format(valorMedIni)} pré-sistema</p>}
                        <p className="text-[10px] text-muted-foreground">{pct}% do contrato</p>
                      </>
                    );
                  })()}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Saldo a Medir</p>
                  {(() => {
                    const acatadoReal = medsDaObra
                      .filter((m: any) => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const saldoInicialMed = medsDaObra
                      .filter((m: any) => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const valorMedIni = saldoInicialMed > 0 ? saldoInicialMed : (Number(obra?.valor_medido_inicial) || 0);
                    const totalMedido = acatadoReal + valorMedIni;
                    return <p className="text-sm font-bold">{BRL.format(Math.max(0, valorContrato - totalMedido))}</p>;
                  })()}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">% Andamento Financeiro</p>
                  {(() => {
                    const acatadoReal = medsDaObra
                      .filter((m: any) => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const saldoInicialMed = medsDaObra
                      .filter((m: any) => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
                      .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                    const valorMedIni = saldoInicialMed > 0 ? saldoInicialMed : (Number(obra?.valor_medido_inicial) || 0);
                    const totalMedido = acatadoReal + valorMedIni;
                    const pct = valorContrato > 0 ? (totalMedido / valorContrato * 100).toFixed(1) : "0.0";
                    return <p className="text-sm font-bold">{pct}%</p>;
                  })()}
                </div>
              </div>

              {/* Status bars */}
              {(() => {
                const acatadoAprovadas = medsDaObra
                  .filter((m: any) => m.status_medicao === "aprovada" && m.num_medicao !== "Saldo Inicial")
                  .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                const saldoInicialMed = medsDaObra
                  .filter((m: any) => m.num_medicao === "Saldo Inicial" && m.status_medicao === "aprovada")
                  .reduce((s: number, m: any) => s + (Number(m.valor_acatado ?? m.valor_medicao) || 0), 0);
                const valorMedIniSheet = saldoInicialMed > 0 ? saldoInicialMed : (Number(obra?.valor_medido_inicial) || 0);
                const aprovado = acatadoAprovadas + valorMedIniSheet;
                const enviado = medsDaObra.filter((m: any) => m.status_medicao === "enviada").reduce((s: number, m: any) => s + (Number(m.valor_medicao) || 0), 0);
                const previsto = medsDaObra.filter((m: any) => m.status_medicao === "prevista" || m.status_medicao === "nao_iniciada").reduce((s: number, m: any) => s + (Number(m.valor_previsto_medicao) || 0), 0);
                const saldo = Math.max(0, valorContrato - aprovado - enviado - previsto);
                const impactoTotal = restrAbertas.reduce((s: number, r: any) => s + (Number(r.impacto_medicao) || 0), 0);
                const total = valorContrato || 1;
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Progresso por Status</p>
                    {/* Barra única com todos os segmentos */}
                    <div className="h-4 w-full rounded-full bg-secondary overflow-hidden flex relative">
                      {aprovado > 0 && <div className="h-full bg-emerald-500" style={{ width: `${(aprovado / total) * 100}%` }} title={`Medido/Aprovado: ${BRL.format(aprovado)}`} />}
                      {enviado > 0 && <div className="h-full bg-blue-500" style={{ width: `${(enviado / total) * 100}%` }} title={`Enviado: ${BRL.format(enviado)}`} />}
                      {previsto > 0 && (
                        <div className="h-full relative" style={{ width: `${(previsto / total) * 100}%` }}>
                          <div className="h-full w-full bg-amber-400" />
                          {/* Vermelho sobreposto no previsto para mostrar impacto da restrição */}
                          {impactoTotal > 0 && (
                            <div
                              className="absolute top-0 right-0 h-full bg-destructive/70"
                              style={{ width: `${Math.min(100, (impactoTotal / previsto) * 100)}%` }}
                              title={`Impacto restrições: −${BRL.format(impactoTotal)}`}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Medido {BRL.format(aprovado)}{valorMedIniSheet > 0 && <span className="text-[9px] opacity-70">(incl. {BRL.format(valorMedIniSheet)} pré-sist.)</span>}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Enviado {BRL.format(enviado)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />Previsto {BRL.format(previsto)}</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-secondary" />Saldo {BRL.format(saldo)}</span>
                    </div>
                    {impactoTotal > 0 && (
                      <div className="flex justify-between text-[10px] text-destructive font-medium">
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Impacto de restrições: −{BRL.format(impactoTotal)}
                        </span>
                        <span>{restrAbertas.length} aberta(s)</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <Separator />

              {/* Medições — Full table */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Medições ({medsDaObra.length})</h3>
                <div className="border rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="text-[10px]">Nº</TableHead>
                        <TableHead className="text-[10px]">Status</TableHead>
                        <TableHead className="text-[10px] text-right">Previsto</TableHead>
                        <TableHead className="text-[10px] text-right text-destructive">Impacto Restrição</TableHead>
                        <TableHead className="text-[10px] text-right">Prev. Líquido</TableHead>
                        <TableHead className="text-[10px] text-right">Acatado</TableHead>
                        <TableHead className="text-[10px]">Prev. Envio</TableHead>
                        <TableHead className="text-[10px]">NF</TableHead>
                        <TableHead className="text-[10px]">Pagamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {medsDaObra.map((m: any) => {
                        const ms = STATUS_MED_CONFIG[m.status_medicao] || STATUS_MED_CONFIG.nao_iniciada;
                        const prevBruto = Number(m.valor_previsto_medicao) || 0;
                        const impacto = restrImpactoSheetMap.get(m.id) || 0;
                        const prevLiquido = m.status_medicao === "aprovada" ? prevBruto : Math.max(0, prevBruto - impacto);
                        return (
                          <TableRow key={m.id} className="text-[11px]">
                            <TableCell className="py-1">{m.num_medicao || "—"}</TableCell>
                            <TableCell className="py-1"><Badge className={`text-[9px] ${ms.cls}`} variant="secondary">{ms.label}</Badge></TableCell>
                            <TableCell className="py-1 text-right">{prevBruto > 0 ? BRL.format(prevBruto) : "—"}</TableCell>
                            <TableCell className="py-1 text-right">
                              {impacto > 0 && m.status_medicao !== "aprovada"
                                ? <span className="text-destructive font-medium">−{BRL.format(impacto)}</span>
                                : "—"}
                            </TableCell>
                            <TableCell className="py-1 text-right">
                              {prevBruto > 0 ? (
                                <span className={impacto > 0 && m.status_medicao !== "aprovada" ? "text-amber-600 font-medium" : ""}>
                                  {BRL.format(prevLiquido)}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="py-1 text-right">{m.valor_acatado != null && m.valor_acatado > 0 ? BRL.format(m.valor_acatado) : "—"}</TableCell>
                            <TableCell className="py-1">{m.data_previsao_medicao ? format(new Date(m.data_previsao_medicao + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                            <TableCell className="py-1">{m.num_nf || "—"}</TableCell>
                            <TableCell className="py-1">{m.data_pagamento ? format(new Date(m.data_pagamento + "T12:00:00"), "dd/MM/yy") : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                      {medsDaObra.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-3 text-muted-foreground text-xs">Nenhuma medição.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Histórico — timeline das aprovadas */}
              {(() => {
                const aprovadas = medsDaObra.filter((m: any) => m.status_medicao === "aprovada" && m.data_aprovacao)
                  .sort((a: any, b: any) => (a.data_aprovacao || "").localeCompare(b.data_aprovacao || ""));
                if (aprovadas.length === 0) return null;
                return (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Histórico de Aprovações</h3>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {aprovadas.map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2 text-[11px] border-l-2 border-l-emerald-500 pl-3 py-1">
                          <span className="text-muted-foreground">{format(new Date(m.data_aprovacao + "T12:00:00"), "dd/MM/yy")}</span>
                          <span className="font-medium">Med {m.num_medicao}</span>
                          <span className="font-semibold">{BRL.format(Number(m.valor_acatado ?? m.valor_medicao) || 0)}</span>
                          {m.status_nf === "recebido" && <Badge className="text-[8px] bg-emerald-100 text-emerald-700" variant="secondary">NF OK</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Gráfico acumulado */}
              {(() => {
                const aprovadas = medsDaObra
                  .filter((m: any) => m.status_medicao === "aprovada" && m.data_aprovacao)
                  .sort((a: any, b: any) => (a.data_aprovacao || "").localeCompare(b.data_aprovacao || ""));
                if (aprovadas.length < 2) return null;
                let acum = 0;
                const chartData = aprovadas.map((m: any) => {
                  acum += Number(m.valor_acatado ?? m.valor_medicao) || 0;
                  return { name: `Med ${m.num_medicao}`, acumulado: acum };
                });
                return (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Progresso Acumulado</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" fontSize={9} />
                        <YAxis fontSize={9} tickFormatter={(v) => BRL_SHORT(v)} />
                        <Tooltip formatter={(v: number) => BRL.format(v)} />
                        <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                );
              })()}

              <Separator />

              {/* Restrições Financeiras */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Restrições Financeiras</h3>

                {/* Mini KPIs */}
                <div className="flex gap-3 mb-3">
                  <Badge variant="secondary" className="text-xs">Abertas: {restrAbertas.length}</Badge>
                  <Badge variant="secondary" className="text-xs">Impacto: {BRL.format(impactoTotal)}</Badge>
                  {restrVencidas.length > 0 && <Badge variant="destructive" className="text-xs">Vencidas: {restrVencidas.length}</Badge>}
                  {restrResolvidas.length > 0 && <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Resolvidas: {restrResolvidas.length}</Badge>}
                </div>

                {restrAbertas.length === 0 && restrResolvidas.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4 border rounded-lg bg-muted/20">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                    Nenhuma restrição registrada para esta obra.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Abertas */}
                    {restrAbertas.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Abertas ({restrAbertas.length})</p>
                        {restrAbertas.map((r: any) => {
                          const tipo = TIPO_BADGE[r.tipo] || TIPO_BADGE.administrativa;
                          const isVencida = r.data_limite && new Date(r.data_limite + "T23:59:59") < now;
                          return (
                            <Card key={r.id} className={`${isVencida ? "border-destructive/60" : ""}`}>
                              <CardContent className="p-3 space-y-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className={`text-[10px] ${tipo.cls}`}>{tipo.label}</Badge>
                                  {isVencida && <Badge variant="destructive" className="text-[10px]">Vencida</Badge>}
                                </div>
                                <p className="text-xs">{r.descricao}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>Prazo: <strong>{r.data_limite ? format(new Date(r.data_limite + "T12:00:00"), "dd/MM/yy") : "—"}</strong></span>
                                </div>
                                <div className="flex items-center gap-4 text-xs">
                                  <div><span className="text-muted-foreground">Valor: </span><span className="font-semibold">{BRL.format(Number(r.valor) || 0)}</span></div>
                                  <div><span className="text-muted-foreground">Impacto medição: </span><span className="font-semibold text-amber-600">{BRL.format(Number(r.impacto_medicao) || 0)}</span></div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  {canResolve && (
                                  <>
                                  <Button size="sm" variant="outline" className="text-xs h-7 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={(e) => { e.stopPropagation(); openResolver(r); }}>
                                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Resolver
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-xs h-7 border-destructive text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setRecusandoId(r.id); setMotivoRecusa(""); }}>
                                    <Ban className="h-3.5 w-3.5 mr-1" />Recusar
                                  </Button>
                                  </>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}

                    {/* Histórico de resolvidas */}
                    {restrResolvidas.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">Histórico — Resolvidas ({restrResolvidas.length})</p>
                        {restrResolvidas.map((r: any) => {
                          const tipo = TIPO_BADGE[r.tipo] || TIPO_BADGE.administrativa;
                          return (
                            <Card key={r.id} className="opacity-70 border-emerald-500/30">
                              <CardContent className="p-3 space-y-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge className={`text-[10px] ${tipo.cls}`}>{tipo.label}</Badge>
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Resolvida</Badge>
                                </div>
                                <p className="text-xs">{r.descricao}</p>
                                <div className="flex items-center gap-4 text-xs">
                                  <div><span className="text-muted-foreground">Valor: </span><span className="font-semibold">{BRL.format(Number(r.valor) || 0)}</span></div>
                                  <div><span className="text-muted-foreground">Impacto: </span><span className="font-semibold">{BRL.format(Number(r.impacto_medicao) || 0)}</span></div>
                                  {r.valor_pago > 0 && <div><span className="text-muted-foreground">Pago: </span><span className="font-semibold text-emerald-600">{BRL.format(Number(r.valor_pago) || 0)}</span></div>}
                                </div>
                                {r.resolvida_em && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Resolvida em {format(new Date(r.resolvida_em), "dd/MM/yy HH:mm")}
                                    {r.resolvida_por_nome ? ` por ${r.resolvida_por_nome}` : ""}
                                    {r.forma_resolucao ? ` — ${r.forma_resolucao}` : ""}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog: Resolver */}
      <Dialog open={!!resolvingId} onOpenChange={(open) => { if (!open) setResolvingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver Restrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Valor pago (R$)</label>
              <CurrencyInput value={resolveForm.valor_pago} onChange={(v) => setResolveForm({ ...resolveForm, valor_pago: v })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Forma de resolução</label>
              <Select value={resolveForm.forma_resolucao} onValueChange={(v) => setResolveForm({ ...resolveForm, forma_resolucao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_RESOLUCAO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolvingId(null)}>Cancelar</Button>
            <Button onClick={handleResolver} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Confirmar Resolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Recusar */}
      <Dialog open={!!recusandoId} onOpenChange={(open) => { if (!open) setRecusandoId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar Restrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">A restrição será marcada como resolvida sem pagamento. O impacto será removido da medição.</p>
            <div>
              <label className="text-xs text-muted-foreground">Motivo (opcional)</label>
              <Textarea value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} placeholder="Descreva o motivo da recusa..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusandoId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRecusar} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ban className="h-4 w-4 mr-1" />}
              Confirmar Recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}