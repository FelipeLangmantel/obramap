import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// tooltip removed – pipeline cards no longer use it
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend as RechartsLegend,
} from "recharts";
import {
  Factory, AlertTriangle, TrendingUp, DollarSign, Package,
  CalendarDays, Plus, Pencil, Trash2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface OverviewTabProps {
  companyId: string;
  contextId: string;
  contextName: string;
  contextType: "integrated" | "standalone";
  totalUnits: number;
}

interface LongTermRow {
  period_id: string; period_label: string; period_start: string; period_end: string;
  target_units: number; factory_id: string | null; factory_name: string | null;
  planned_units: number; actual_units: number; completion_pct: number;
}

interface CostRow {
  period_id: string; period_label: string; period_start: string; period_end: string;
  factory_id: string | null; factory_name: string | null;
  planned_units: number; actual_units: number; unit_value: number;
  batch_value: number; advance_pct: number; advance_value: number;
  freight_value: number; lifting_value: number; total_value: number;
}

interface CashRow {
  factory_id: string; factory_name: string; period_label: string; period_start: string;
  production_value: number; advance_pct: number; advance_value: number;
  advance_due_date: string; freight_value: number; lifting_value: number; total_outflow: number;
}

interface Batch {
  id: string; factory_id: string; batch_code: string; status: string;
  planned_quantity: number; planned_start: string | null; planned_finish: string | null;
  actual_quantity: number; unit_value: number; ind_period_id: string | null;
}

interface IndFactory {
  id: string; name: string; is_active: boolean;
}

interface IndPeriod {
  id: string; name: string; start_date: string; end_date: string;
  target_units: number; status: string;
}

export function OverviewTabContent({ companyId, contextId, contextName, contextType, totalUnits }: OverviewTabProps) {
  const [longTermData, setLongTermData] = useState<LongTermRow[]>([]);
  const [costData, setCostData] = useState<CostRow[]>([]);
  const [cashData, setCashData] = useState<CashRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [factories, setFactories] = useState<IndFactory[]>([]);
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Cell editing
  const [cellDialog, setCellDialog] = useState<{ periodId: string; factoryId: string; periodLabel: string; factoryName: string } | null>(null);
  const [cellValue, setCellValue] = useState(0);

  // Period CRUD
  const [periodDialog, setPeriodDialog] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", start_date: "", end_date: "", target_units: 0 });
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [deletePeriodTarget, setDeletePeriodTarget] = useState<IndPeriod | null>(null);

  // Pipeline filter
  const [pipelineFilter, setPipelineFilter] = useState("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ltRes, costRes, cashRes, batchRes, factRes, perRes] = await Promise.all([
        supabase.rpc("get_ind_long_term_plan", { p_context_id: contextId }),
        supabase.rpc("get_ind_costs_by_period", { p_context_id: contextId }),
        supabase.rpc("get_ind_cash_projection", { p_context_id: contextId }),
        supabase.from("ind_production_batches").select("id,factory_id,batch_code,status,planned_quantity,planned_start,planned_finish,actual_quantity,unit_value,ind_period_id").eq("context_id", contextId).order("planned_start"),
        supabase.from("ind_factories").select("id,name,is_active").eq("company_id", companyId).eq("is_active", true).order("name"),
        supabase.from("ind_periods").select("*").eq("context_id", contextId).order("start_date"),
      ]);
      setLongTermData((ltRes.data || []) as LongTermRow[]);
      setCostData((costRes.data || []) as CostRow[]);
      setCashData((cashRes.data || []) as CashRow[]);
      setBatches((batchRes.data || []) as Batch[]);
      setFactories((factRes.data || []) as IndFactory[]);
      setPeriods((perRes.data || []) as IndPeriod[]);
    } catch (err) {
      console.error("[Overview] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── KPI calculations ───
  const installedUnits = useMemo(() =>
    batches.filter(b => b.status === "installed" || b.status === "completed")
      .reduce((s, b) => s + b.actual_quantity, 0),
  [batches]);

  const totalCommittedCost = useMemo(() =>
    costData.reduce((s, r) => s + Number(r.batch_value || 0), 0),
  [costData]);

  const advanceNext30 = useMemo(() => {
    const now = new Date();
    const limit = addDays(now, 30);
    return cashData
      .filter(r => {
        if (!r.advance_due_date) return false;
        const d = new Date(r.advance_due_date + "T12:00:00");
        return d >= now && d <= limit;
      })
      .reduce((s, r) => s + Number(r.advance_value || 0), 0);
  }, [cashData]);

  const urgentAdvance = useMemo(() => {
    const now = new Date();
    return cashData.some(r => {
      if (!r.advance_due_date) return false;
      return differenceInDays(new Date(r.advance_due_date + "T12:00:00"), now) < 7;
    });
  }, [cashData]);

  const inProductionCount = useMemo(() =>
    batches.filter(b => b.status === "in_production").length,
  [batches]);

  const progressPct = totalUnits > 0 ? Math.min(100, (installedUnits / totalUnits) * 100) : 0;

  // ─── Long term plan matrix ───
  const uniquePeriods = useMemo(() => {
    const map = new Map<string, { id: string; label: string; start: string; end: string; target: number }>();
    longTermData.forEach(r => {
      if (!map.has(r.period_id)) {
        map.set(r.period_id, { id: r.period_id, label: r.period_label, start: r.period_start, end: r.period_end, target: r.target_units });
      }
    });
    // Also add periods not in RPC data
    periods.forEach(p => {
      if (!map.has(p.id)) {
        map.set(p.id, { id: p.id, label: p.name, start: p.start_date, end: p.end_date, target: p.target_units });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.start.localeCompare(b.start));
  }, [longTermData, periods]);

  const activeFactories = useMemo(() => factories.filter(f => f.is_active), [factories]);

  const getPlanCell = (periodId: string, factoryId: string) => {
    const row = longTermData.find(r => r.period_id === periodId && r.factory_id === factoryId);
    return row ? { planned: row.planned_units, actual: row.actual_units } : { planned: 0, actual: 0 };
  };

  const getCostCell = (periodId: string, factoryId: string) => {
    const row = costData.find(r => r.period_id === periodId && r.factory_id === factoryId);
    return row || null;
  };

  // ─── Cell edit handlers ───
  const openCellEdit = (periodId: string, factoryId: string, periodLabel: string, factoryName: string) => {
    const cell = getPlanCell(periodId, factoryId);
    setCellValue(cell.planned);
    setCellDialog({ periodId, factoryId, periodLabel, factoryName });
  };

  const saveCellEdit = async () => {
    if (!cellDialog) return;
    const { periodId, factoryId } = cellDialog;
    // Check if batch exists for this period+factory
    const existing = batches.find(b => b.ind_period_id === periodId && b.factory_id === factoryId);
    if (existing) {
      const { error } = await supabase.from("ind_production_batches")
        .update({ planned_quantity: cellValue } as any)
        .eq("id", existing.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
    } else {
      const factory = factories.find(f => f.id === factoryId);
      const { error } = await supabase.from("ind_production_batches")
        .insert({
          company_id: companyId,
          context_id: contextId,
          factory_id: factoryId,
          ind_period_id: periodId,
          batch_code: `${factory?.name?.slice(0, 3).toUpperCase() || "LOT"}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
          planned_quantity: cellValue,
          status: "planned",
        } as any);
      if (error) { toast.error("Erro ao criar lote: " + error.message); return; }
    }
    toast.success("Planejamento atualizado!");
    setCellDialog(null);
    fetchAll();
  };

  // ─── Period CRUD ───
  const openNewPeriod = () => {
    setPeriodForm({ name: "", start_date: "", end_date: "", target_units: 0 });
    setEditingPeriodId(null);
    setPeriodDialog(true);
  };
  const openEditPeriod = (p: IndPeriod) => {
    setPeriodForm({ name: p.name, start_date: p.start_date, end_date: p.end_date, target_units: p.target_units });
    setEditingPeriodId(p.id);
    setPeriodDialog(true);
  };
  const savePeriod = async () => {
    if (!periodForm.name || !periodForm.start_date || !periodForm.end_date) {
      toast.error("Nome e datas são obrigatórios");
      return;
    }
    const payload = { ...periodForm, context_id: contextId, company_id: companyId };
    if (editingPeriodId) {
      const { error } = await supabase.from("ind_periods").update(payload as any).eq("id", editingPeriodId);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Período atualizado!");
    } else {
      const { error } = await supabase.from("ind_periods").insert(payload as any);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Período criado!");
    }
    setPeriodDialog(false);
    fetchAll();
  };
  const deletePeriod = async () => {
    if (!deletePeriodTarget) return;
    const hasBatches = batches.some(b => b.ind_period_id === deletePeriodTarget.id);
    if (hasBatches) {
      toast.error("Não é possível excluir: período possui lotes vinculados.");
      setDeletePeriodTarget(null);
      return;
    }
    const { error } = await supabase.from("ind_periods").delete().eq("id", deletePeriodTarget.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Período excluído!");
    setDeletePeriodTarget(null);
    fetchAll();
  };

  // ─── Chart data ───
  const chartData = useMemo(() => {
    return uniquePeriods.map(period => {
      const entry: Record<string, any> = { name: period.label };
      activeFactories.forEach(f => {
        const cost = getCostCell(period.id, f.id);
        entry[f.name] = cost ? Number(cost.batch_value) : 0;
      });
      // Sum freight and lifting across all factories for this period
      const periodCosts = costData.filter(r => r.period_id === period.id);
      entry["Frete"] = periodCosts.reduce((s, r) => s + Number(r.freight_value || 0), 0);
      entry["Içamento"] = periodCosts.reduce((s, r) => s + Number(r.lifting_value || 0), 0);
      return entry;
    });
  }, [uniquePeriods, activeFactories, costData]);

  const chartColors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  // ─── Alerts ───
  const alerts = useMemo(() => {
    const list: { type: "error" | "warning"; msg: string }[] = [];
    const now = new Date();

    // Late batches
    batches.forEach(b => {
      if (b.planned_finish && !["completed", "installed", "cancelled"].includes(b.status)) {
        if (new Date(b.planned_finish + "T23:59:59") < now) {
          list.push({ type: "error", msg: `Lote ${b.batch_code} atrasado (previsto ${format(new Date(b.planned_finish + "T12:00:00"), "dd/MM")})` });
        }
      }
    });

    // Advance due < 7 days
    cashData.forEach(r => {
      if (r.advance_due_date && r.advance_value > 0) {
        const days = differenceInDays(new Date(r.advance_due_date + "T12:00:00"), now);
        if (days >= 0 && days < 7) {
          list.push({ type: "error", msg: `Entrada ${BRL.format(r.advance_value)} para ${r.factory_name} vence em ${days} dias` });
        } else if (days >= 7 && days < 15) {
          list.push({ type: "warning", msg: `Entrada ${BRL.format(r.advance_value)} para ${r.factory_name} vence em ${days} dias` });
        }
      }
    });

    return list;
  }, [batches, cashData]);

  // ─── Pipeline ───
  const filteredBatches = useMemo(() => {
    if (pipelineFilter === "all") return batches;
    return batches.filter(b => b.factory_id === pipelineFilter);
  }, [batches, pipelineFilter]);

  // ─── Cost totals ───
  const costTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    activeFactories.forEach(f => { totals[f.id] = 0; });
    totals.freight = 0; totals.lifting = 0; totals.total = 0; totals.advance = 0;
    costData.forEach(r => {
      if (r.factory_id) totals[r.factory_id] = (totals[r.factory_id] || 0) + Number(r.batch_value || 0);
      totals.freight += Number(r.freight_value || 0);
      totals.lifting += Number(r.lifting_value || 0);
      totals.total += Number(r.total_value || 0);
      totals.advance += Number(r.advance_value || 0);
    });
    return totals;
  }, [costData, activeFactories]);

  const PIPELINE_STYLE: Record<string, {bg:string, border:string, badge:string}> = {
    planned:            { bg:'bg-muted/40',          border:'border-border',       badge:'bg-muted text-muted-foreground' },
    released:           { bg:'bg-blue-500/10',       border:'border-blue-300',     badge:'bg-blue-100 text-blue-700' },
    in_production:      { bg:'bg-amber-500/10',      border:'border-amber-300',    badge:'bg-amber-100 text-amber-700' },
    ready:              { bg:'bg-emerald-500/10',    border:'border-emerald-300',  badge:'bg-emerald-100 text-emerald-700' },
    awaiting_transport: { bg:'bg-orange-500/10',     border:'border-orange-300',   badge:'bg-orange-100 text-orange-700' },
    in_transit:         { bg:'bg-purple-500/10',     border:'border-purple-300',   badge:'bg-purple-100 text-purple-700' },
    delivered:          { bg:'bg-green-500/10',      border:'border-green-300',    badge:'bg-green-100 text-green-800' },
    installed:          { bg:'bg-emerald-600/15',    border:'border-emerald-500',  badge:'bg-emerald-200 text-emerald-900' },
    cancelled:          { bg:'bg-destructive/10',    border:'border-destructive',  badge:'bg-destructive/20 text-destructive' },
  };

  const STATUS_LABEL: Record<string, string> = {
    planned:'Planejado', released:'Liberado', in_production:'Em Produção',
    ready:'Pronto', awaiting_transport:'Aguard. Transporte', in_transit:'Em Trânsito',
    delivered:'Entregue', installed:'Instalado', cancelled:'Cancelado',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Context badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300">
          {contextType === "standalone" ? "Standalone" : "Integrado"} — {contextName}
        </Badge>
        <span className="text-sm text-muted-foreground">{totalUnits} unidades</span>
        <Badge variant="outline" className="text-xs">
          {installedUnits} instaladas
        </Badge>
      </div>

      {/* ═══ KPIs ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Progresso</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{installedUnits} / {totalUnits}</div>
            <Progress value={progressPct} className="h-2" />
            <span className="text-[10px] text-muted-foreground">{progressPct.toFixed(1)}% instaladas</span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Custo Comprometido</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{BRL.format(totalCommittedCost)}</div>
            <span className="text-[10px] text-muted-foreground">Soma de todos os períodos</span>
          </CardContent>
        </Card>

        <Card className={advanceNext30 > 0 && cashData.some(r => {
          const d = r.advance_due_date ? differenceInDays(new Date(r.advance_due_date+'T12:00:00'), new Date()) : 999;
          return d < 7;
        }) ? 'border-destructive' : ''}>
          <CardContent className='p-4 space-y-2'>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-muted-foreground font-medium'>Entrada (30 dias)</span>
              <Zap className='h-4 w-4 text-amber-500' />
            </div>
            <div className='text-2xl font-bold text-amber-600'>{BRL.format(advanceNext30)}</div>
            {cashData.length > 0 && (() => {
              const next = [...cashData].filter(r => r.advance_due_date).sort((a,b) =>
                new Date(a.advance_due_date).getTime() - new Date(b.advance_due_date).getTime())[0];
              if (!next) return null;
              const days = differenceInDays(new Date(next.advance_due_date+'T12:00:00'), new Date());
              return (
                <div className='text-[10px] space-y-0.5'>
                  <p className={days < 7 ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    Vence em {days} dias — {next.factory_name}
                  </p>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Em Produção</span>
              <Factory className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{inProductionCount}</div>
            <span className="text-[10px] text-muted-foreground">Lotes ativos agora</span>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Alerts ═══ */}
      {alerts.length > 0 && (
        <Card className="border-amber-300 bg-amber-500/5">
          <CardContent className="p-3 space-y-1">
            {alerts.map((a, i) => (
              <div key={i} className={cn("flex items-center gap-2 text-xs", a.type === "error" ? "text-destructive" : "text-amber-700")}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{a.msg}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ═══ Long Term Plan Matrix ═══ */}
      {(uniquePeriods.length > 0 || activeFactories.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Planejamento de Longo Prazo</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs min-w-[140px]">Período</TableHead>
                  <TableHead className="text-xs text-center w-20">Meta</TableHead>
                  {activeFactories.map(f => (
                    <TableHead key={f.id} className="text-xs text-center min-w-[100px]">{f.name}</TableHead>
                  ))}
                  <TableHead className="text-xs text-center w-20 font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uniquePeriods.map(period => {
                  let periodTotal = 0;
                  let periodActual = 0;
                  return (
                    <TableRow key={period.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">{period.label}</div>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(period.start + "T12:00:00"), "dd/MM")} — {format(new Date(period.end + "T12:00:00"), "dd/MM")}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold text-foreground">{period.target}</TableCell>
                      {activeFactories.map(f => {
                        const cell = getPlanCell(period.id, f.id);
                        periodTotal += cell.planned;
                        periodActual += cell.actual;
                        const pct = cell.planned > 0 ? (cell.actual / cell.planned) * 100 : 0;
                        const barColor = cell.planned === 0 ? "" :
                          pct >= 100 ? "bg-emerald-500" :
                          pct >= 70 ? "bg-amber-500" : "bg-destructive";
                        return (
                          <TableCell
                            key={f.id}
                            className="text-center p-1 cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => openCellEdit(period.id, f.id, period.label, f.name)}
                          >
                            <div className="text-xs font-semibold text-foreground">
                              {cell.planned > 0 ? `${cell.actual}/${cell.planned}` : "—"}
                            </div>
                            {cell.planned > 0 && (
                              <div className="w-full h-1.5 rounded-full bg-secondary mt-1">
                                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-xs font-bold text-foreground">
                        {periodTotal > 0 ? `${periodActual}/${periodTotal}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                <TableRow className="bg-accent/30 font-bold">
                  <TableCell className="text-xs font-bold text-foreground">Totais</TableCell>
                  <TableCell className="text-center text-xs font-bold text-foreground">
                    {uniquePeriods.reduce((s, p) => s + p.target, 0)}
                  </TableCell>
                  {activeFactories.map(f => {
                    const sum = longTermData.filter(r => r.factory_id === f.id).reduce((s, r) => s + r.planned_units, 0);
                    const actual = longTermData.filter(r => r.factory_id === f.id).reduce((s, r) => s + r.actual_units, 0);
                    return (
                      <TableCell key={f.id} className="text-center text-xs font-bold text-foreground">
                        {sum > 0 ? `${actual}/${sum}` : "—"}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-bold text-foreground">
                    {longTermData.reduce((s, r) => s + r.actual_units, 0)}/{longTermData.reduce((s, r) => s + r.planned_units, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ Costs Table ═══ */}
      {costData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custos por Período</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs min-w-[120px]">Período</TableHead>
                  {activeFactories.map(f => (
                    <TableHead key={f.id} className="text-xs text-right min-w-[100px]">{f.name}</TableHead>
                  ))}
                  <TableHead className="text-xs text-right">Entrada</TableHead>
                  <TableHead className="text-xs text-right">Frete</TableHead>
                  <TableHead className="text-xs text-right">Içamento</TableHead>
                  <TableHead className="text-xs text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uniquePeriods.map(period => {
                  const periodCosts = costData.filter(r => r.period_id === period.id);
                  const periodAdvance = periodCosts.reduce((s, r) => s + Number(r.advance_value || 0), 0);
                  const periodFreight = periodCosts.reduce((s, r) => s + Number(r.freight_value || 0), 0);
                  const periodLifting = periodCosts.reduce((s, r) => s + Number(r.lifting_value || 0), 0);
                  const periodTotal = periodCosts.reduce((s, r) => s + Number(r.total_value || 0), 0);

                  return (
                    <TableRow key={period.id}>
                      <TableCell className="text-xs font-medium text-foreground">{period.label}</TableCell>
                      {activeFactories.map(f => {
                        const cost = getCostCell(period.id, f.id);
                        return (
                          <TableCell key={f.id} className="text-xs text-right text-foreground">
                            {cost ? BRL.format(Number(cost.batch_value)) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-xs text-right text-amber-600 font-medium">
                        {periodAdvance > 0 ? BRL.format(periodAdvance) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right text-foreground">{periodFreight > 0 ? BRL.format(periodFreight) : "—"}</TableCell>
                      <TableCell className="text-xs text-right text-foreground">{periodLifting > 0 ? BRL.format(periodLifting) : "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold text-foreground">{BRL.format(periodTotal)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-accent/30 font-bold">
                  <TableCell className="text-xs font-bold text-foreground">Totais</TableCell>
                  {activeFactories.map(f => (
                    <TableCell key={f.id} className="text-xs text-right font-bold text-foreground">
                      {BRL.format(costTotals[f.id] || 0)}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs text-right font-bold text-amber-600">{BRL.format(costTotals.advance)}</TableCell>
                  <TableCell className="text-xs text-right font-bold text-foreground">{BRL.format(costTotals.freight)}</TableCell>
                  <TableCell className="text-xs text-right font-bold text-foreground">{BRL.format(costTotals.lifting)}</TableCell>
                  <TableCell className="text-xs text-right font-bold text-foreground">{BRL.format(costTotals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ Stacked Bar Chart ═══ */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Custos por Período (Gráfico)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <RechartsLegend wrapperStyle={{ fontSize: 10 }} />
                {activeFactories.map((f, i) => (
                  <Bar key={f.id} dataKey={f.name} stackId="a" fill={chartColors[i % chartColors.length]} />
                ))}
                <Bar dataKey="Frete" stackId="a" fill="hsl(var(--chart-4))" />
                <Bar dataKey="Içamento" stackId="a" fill="hsl(var(--chart-5))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ═══ Cash Projection ═══ */}
      {cashData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Projeção de Caixa</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs">Quinzena</TableHead>
                  <TableHead className="text-xs text-right">Valor Total</TableHead>
                  <TableHead className="text-xs text-right">Entrada (R$)</TableHead>
                  <TableHead className="text-xs text-center">Data Limite</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashData.map((r, i) => {
                  const daysUntil = r.advance_due_date ? differenceInDays(new Date(r.advance_due_date + "T12:00:00"), new Date()) : 999;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium text-foreground">{r.factory_name}</TableCell>
                      <TableCell className="text-xs text-foreground">{r.period_label}</TableCell>
                      <TableCell className="text-xs text-right text-foreground">{BRL.format(Number(r.total_outflow))}</TableCell>
                      <TableCell className="text-xs text-right font-medium text-amber-600">{BRL.format(Number(r.advance_value))}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs text-foreground">
                          {r.advance_due_date ? format(new Date(r.advance_due_date + "T12:00:00"), "dd/MM/yy") : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {daysUntil < 7 ? (
                          <Badge variant="destructive" className="text-[9px]">Urgente ({daysUntil}d)</Badge>
                        ) : daysUntil < 15 ? (
                          <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-300">Atenção ({daysUntil}d)</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px]">{daysUntil}d</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ Pipeline Visual ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Pipeline de Lotes</CardTitle>
            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Filtrar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fábricas</SelectItem>
                {activeFactories.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredBatches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Nenhum lote criado ainda.</p>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {filteredBatches.map(b => {
                const style = PIPELINE_STYLE[b.status] || PIPELINE_STYLE.planned;
                const isLate = b.planned_finish && new Date(b.planned_finish) < new Date()
                  && !['delivered','installed','cancelled'].includes(b.status);
                return (
                  <div key={b.id}
                    className={`shrink-0 rounded-lg border-2 p-3 min-w-[120px] cursor-pointer transition-all hover:-translate-y-1
                      ${style.bg} ${isLate ? 'border-destructive' : style.border}`}
                    onClick={() => setCellDialog(null)}>
                    <div className='text-[10px] font-bold text-foreground'>{b.batch_code}{isLate ? ' ⚠️' : ''}</div>
                    <div className='text-[10px] text-muted-foreground mt-0.5'>
                      {factories.find(f => f.id === b.factory_id)?.name || '—'}
                    </div>
                    <div className='text-xs font-semibold text-foreground mt-1'>
                      {b.actual_quantity || 0}/{b.planned_quantity} un
                    </div>
                    <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${style.badge}`}>
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Periods Section ═══ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Períodos
            </CardTitle>
            <Button size="sm" variant="outline" onClick={openNewPeriod} className="gap-1.5 h-7 text-xs">
              <Plus className="h-3.5 w-3.5" /> Novo Período
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum período cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Início</TableHead>
                  <TableHead className="text-xs">Fim</TableHead>
                  <TableHead className="text-xs text-center">Meta</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => {
                  const hasBatches = batches.some(b => b.ind_period_id === p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium text-foreground">{p.name}</TableCell>
                      <TableCell className="text-xs text-foreground">{format(new Date(p.start_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs text-foreground">{format(new Date(p.end_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs text-center font-semibold text-foreground">{p.target_units}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">{p.status || "active"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPeriod(p)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeletePeriodTarget(p)} disabled={hasBatches}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ═══ DIALOGS ═══ */}

      {/* Cell edit dialog */}
      <Dialog open={!!cellDialog} onOpenChange={v => !v && setCellDialog(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Planejar Produção</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{cellDialog?.factoryName} — {cellDialog?.periodLabel}</p>
            <div>
              <Label className="text-xs">Quantidade Planejada</Label>
              <Input type="number" min={0} value={cellValue} onChange={e => setCellValue(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCellDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={saveCellEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period dialog */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPeriodId ? "Editar Período" : "Novo Período"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Nome *</Label>
              <Input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Quinzena 1 — Abril/2026" />
            </div>
            <div>
              <Label className="text-xs">Início *</Label>
              <Input type="date" value={periodForm.start_date} onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Fim *</Label>
              <Input type="date" value={periodForm.end_date} onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Meta (unidades)</Label>
              <Input type="number" min={0} value={periodForm.target_units} onChange={e => setPeriodForm(f => ({ ...f, target_units: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={savePeriod}>{editingPeriodId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete period confirmation */}
      <AlertDialog open={!!deletePeriodTarget} onOpenChange={v => !v && setDeletePeriodTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Período</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir "{deletePeriodTarget?.name}"? Períodos com lotes vinculados não podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletePeriod}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
