import { useState, useEffect, useMemo, useRef } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { 
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ClipboardList,
  Home,
  Printer,
  FileDown,
  ChevronDown,
  ChevronUp,
  Calendar,
  Info,
} from "lucide-react";
import { PlannedVsActualView } from "./PlannedVsActualView";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const PLANNING_TAB_STORAGE_KEY = "obramap_planning_tab";

// Types for weekly plan data (from approved weekly plans)
interface WeeklyPlanWeek {
  id: string;
  planning_period_id: string;
  week_number: number;
  week_start: string;
  week_end: string;
  status: string;
  services: WeeklyPlanService[];
}

interface WeeklyPlanService {
  id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  planned_house_ids: number[];
  planned_houses: number;
}

interface PeriodInfo {
  id: string;
  period_number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  status: string;
}

// Legacy types for analysis tab
interface PlannedProduction {
  id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  planned_houses: number;
  planned_house_ids: number[];
  notes: string | null;
  created_at: string;
  measurement_number?: number;
}

interface ActualProduction {
  id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  week_start: string;
  week_end: string;
  houses_count: number;
  house_ids: number[];
  is_initial_database: boolean;
}

interface Deviation {
  id: string;
  planned_production_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  planned_count: number;
  actual_count: number;
  deviation: number;
  deviation_reason: string;
  corrective_action: string | null;
}

interface ScopeCost {
  scopeId: string;
  scopeName: string;
  macroId: string;
  macroName: string;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
}

const DEVIATION_REASONS = [
  "Falta de material",
  "Falta de mão de obra",
  "Problemas climáticos",
  "Problemas técnicos",
  "Atraso de fornecedor",
  "Retrabalho necessário",
  "Mudança de escopo",
  "Equipamento indisponível",
  "Outros"
];

const COSTS_STORAGE_KEY = "obramap_scope_costs";

export function PlannedProductionTab() {
  const { currentProject } = useConstruction();
  const { canEdit, company } = useAuth();
  
  // Weekly plan data (approved plans)
  const [approvedPeriods, setApprovedPeriods] = useState<PeriodInfo[]>([]);
  const [selectedApprovedPeriodId, setSelectedApprovedPeriodId] = useState<string>("");
  const [weeklyPlanWeeks, setWeeklyPlanWeeks] = useState<WeeklyPlanWeek[]>([]);
  const [isLoadingWeeklyPlan, setIsLoadingWeeklyPlan] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // Analysis tab data (legacy)
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [actualProductions, setActualProductions] = useState<ActualProduction[]>([]);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [scopeCosts, setScopeCosts] = useState<ScopeCost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Deviation dialog
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<{
    planned: PlannedProduction;
    actual: number;
    deviation: number;
  } | null>(null);
  const [deviationReason, setDeviationReason] = useState<string>("");
  const [correctiveAction, setCorrectiveAction] = useState<string>("");
  
  // Report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"planning" | "analysis">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(PLANNING_TAB_STORAGE_KEY);
      if (saved === "planning" || saved === "analysis") return saved;
    }
    return "planning";
  });

  // ── Load approved periods that have weekly plans ──
  const loadApprovedPeriods = useCallback(async () => {
    if (!currentProject?.id || !company?.id) return;
    
    const { data: periods } = await supabase
      .from("planning_periods")
      .select("id, period_number, name, start_date, end_date, status")
      .eq("project_id", currentProject.id)
      .eq("weekly_plan_generated", true)
      .in("status", ["approved", "released_to_weekly", "closed"])
      .order("period_number", { ascending: true });
    
    setApprovedPeriods((periods || []) as PeriodInfo[]);
    
    // Auto-select first period
    if (periods && periods.length > 0 && !selectedApprovedPeriodId) {
      setSelectedApprovedPeriodId(periods[0].id);
    }
  }, [currentProject?.id, company?.id, selectedApprovedPeriodId]);

  useEffect(() => {
    loadApprovedPeriods();
  }, [loadApprovedPeriods]);

  // ── Load weekly plan data for selected period ──
  useEffect(() => {
    if (!selectedApprovedPeriodId || !company?.id) {
      setWeeklyPlanWeeks([]);
      return;
    }
    
    const loadWeeklyPlan = async () => {
      setIsLoadingWeeklyPlan(true);
      try {
        const { data: weeks, error: weeksError } = await supabase
          .from("weekly_plan_weeks")
          .select("id, planning_period_id, week_number, week_start, week_end, status")
          .eq("planning_period_id", selectedApprovedPeriodId)
          .order("week_number", { ascending: true });
        
        if (weeksError) throw weeksError;
        
        if (!weeks || weeks.length === 0) {
          setWeeklyPlanWeeks([]);
          return;
        }
        
        // Load services for all weeks
        const weekIds = weeks.map(w => w.id);
        const { data: services, error: servicesError } = await supabase
          .from("weekly_plan_services")
          .select("id, weekly_plan_week_id, macro_id, macro_name, macro_color, scope_id, scope_name, planned_house_ids, planned_houses")
          .in("weekly_plan_week_id", weekIds);
        
        if (servicesError) throw servicesError;
        
        const weeksWithServices: WeeklyPlanWeek[] = weeks.map(w => ({
          ...w,
          services: (services || []).filter(s => s.weekly_plan_week_id === w.id)
        }));
        
        setWeeklyPlanWeeks(weeksWithServices);
      } catch (err) {
        console.error("Erro ao carregar plano semanal:", err);
      } finally {
        setIsLoadingWeeklyPlan(false);
      }
    };
    
    loadWeeklyPlan();
  }, [selectedApprovedPeriodId, company?.id]);

  // ── Load analysis data (legacy planned_productions + actual) ──
  useEffect(() => {
    if (!currentProject) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      const { data: plannedData } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      const { data: actualData } = await supabase
        .from('weekly_productions')
        .select('id, scope_id, scope_name, macro_id, macro_name, week_start, week_end, houses_count, house_ids, is_initial_database')
        .eq('project_id', currentProject.id)
        .eq('is_initial_database', false);
      
      const { data: deviationData } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      const savedCosts = localStorage.getItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`);
      if (savedCosts) setScopeCosts(JSON.parse(savedCosts));
      
      setPlannedProductions((plannedData || []) as PlannedProduction[]);
      setActualProductions((actualData || []) as ActualProduction[]);
      setDeviations((deviationData || []) as Deviation[]);
      setIsLoading(false);
    };

    loadData();

    const channel = supabase
      .channel('planned-productions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_productions', filter: `project_id=eq.${currentProject.id}` },
        async () => {
          const { data: actualData } = await supabase
            .from('weekly_productions')
            .select('id, scope_id, scope_name, macro_id, macro_name, week_start, week_end, houses_count, house_ids, is_initial_database')
            .eq('project_id', currentProject.id)
            .eq('is_initial_database', false);
          setActualProductions((actualData || []) as ActualProduction[]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentProject]);

  // ── Comparisons (for analysis tab) ──
  const comparisons = useMemo(() => {
    const results: {
      planned: PlannedProduction | null;
      actualCount: number;
      actualHouseIds: number[];
      deviation: number;
      percentDeviation: string;
      hasDeviation: boolean;
      isNegative: boolean;
      isUnplanned: boolean;
      scopeId: string;
      scopeName: string;
      macroName: string;
      macroColor: string;
      weekStart: string;
      weekEnd: string;
      actualProductionId?: string;
    }[] = [];

    const matchedActualIds = new Set<string>();

    plannedProductions.forEach(planned => {
      const plannedStart = parseISO(planned.week_start);
      const plannedEnd = parseISO(planned.week_end);
      
      const actual = actualProductions.filter(a => {
        if (a.scope_id !== planned.scope_id) return false;
        const actualStart = parseISO(a.week_start);
        const actualEnd = parseISO(a.week_end);
        return (
          (a.week_start === planned.week_start && a.week_end === planned.week_end) ||
          (actualStart >= plannedStart && actualStart <= plannedEnd) ||
          (actualEnd >= plannedStart && actualEnd <= plannedEnd) ||
          (actualStart <= plannedStart && actualEnd >= plannedEnd)
        );
      });

      if (actual.length > 0) {
        actual.forEach(a => matchedActualIds.add(a.id));
        const executedHouseIds = new Set<number>();
        actual.forEach(a => (a.house_ids || []).forEach(id => executedHouseIds.add(id)));
        
        const plannedHouseIdsSet = new Set(planned.planned_house_ids || []);
        const matchingExecuted = planned.planned_house_ids?.length > 0
          ? [...executedHouseIds].filter(id => plannedHouseIdsSet.has(id)).length
          : actual.reduce((sum, a) => sum + a.houses_count, 0);
        
        const actualCount = matchingExecuted;
        const deviation = actualCount - planned.planned_houses;
        const percentDeviation = planned.planned_houses > 0 ? ((deviation / planned.planned_houses) * 100).toFixed(1) : "0";
        const hasDeviation = deviations.some(d => d.planned_production_id === planned.id);
        
        results.push({
          planned, actualCount, actualHouseIds: [...executedHouseIds], deviation, percentDeviation,
          hasDeviation, isNegative: deviation < 0, isUnplanned: false,
          scopeId: planned.scope_id, scopeName: planned.scope_name,
          macroName: planned.macro_name, macroColor: planned.macro_color,
          weekStart: planned.week_start, weekEnd: planned.week_end
        });
      }
    });

    actualProductions.forEach(actual => {
      if (!matchedActualIds.has(actual.id)) {
        results.push({
          planned: null, actualCount: actual.houses_count, actualHouseIds: actual.house_ids || [],
          deviation: actual.houses_count, percentDeviation: "100", hasDeviation: false,
          isNegative: false, isUnplanned: true,
          scopeId: actual.scope_id, scopeName: actual.scope_name,
          macroName: actual.macro_name, macroColor: '#9ca3af',
          weekStart: actual.week_start, weekEnd: actual.week_end,
          actualProductionId: actual.id
        });
      }
    });

    return results.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [plannedProductions, actualProductions, deviations]);

  const deviationAnalysis = useMemo(() => {
    const byReason: Record<string, { count: number; totalDeviation: number }> = {};
    deviations.forEach(d => {
      if (!byReason[d.deviation_reason]) byReason[d.deviation_reason] = { count: 0, totalDeviation: 0 };
      byReason[d.deviation_reason].count++;
      byReason[d.deviation_reason].totalDeviation += Math.abs(d.deviation);
    });
    return Object.entries(byReason).map(([reason, data]) => ({ reason, ...data })).sort((a, b) => b.count - a.count);
  }, [deviations]);

  const stats = useMemo(() => {
    const totalPlanned = comparisons.reduce((sum, c) => sum + (c.planned?.planned_houses || 0), 0);
    const totalActual = comparisons.reduce((sum, c) => sum + c.actualCount, 0);
    const plannedComparisons = comparisons.filter(c => c.planned !== null);
    const negativeDeviations = plannedComparisons.filter(c => c.deviation < 0).length;
    const positiveDeviations = plannedComparisons.filter(c => c.deviation > 0).length;
    const onTarget = plannedComparisons.filter(c => c.deviation === 0).length;
    const unplannedCount = comparisons.filter(c => c.isUnplanned).length;
    return {
      totalPlanned, totalActual,
      overallDeviation: totalPlanned > 0 ? (((totalActual - totalPlanned) / totalPlanned) * 100).toFixed(1) : "0",
      negativeDeviations, positiveDeviations, onTarget, unplannedCount,
      accuracy: plannedComparisons.length > 0 ? ((onTarget / plannedComparisons.length) * 100).toFixed(0) : "0"
    };
  }, [comparisons]);

  const costAnalysis = useMemo(() => {
    let plannedCost = 0;
    let realizedCost = 0;
    comparisons.forEach(comp => {
      const cost = scopeCosts.find(c => c.scopeId === comp.scopeId);
      if (cost) {
        const unitCost = cost.materialCost + cost.laborCost + cost.equipmentCost;
        plannedCost += unitCost * (comp.planned?.planned_houses || 0);
        realizedCost += unitCost * comp.actualCount;
      }
    });
    return {
      plannedCost, realizedCost,
      costDeviation: plannedCost > 0 ? (((realizedCost - plannedCost) / plannedCost) * 100).toFixed(1) : "0"
    };
  }, [comparisons, scopeCosts]);

  const pendingJustifications = comparisons.filter(c => c.isNegative && !c.hasDeviation).length;

  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // ── Deviation save ──
  const handleSaveDeviation = async () => {
    if (!selectedDeviation || !deviationReason || !currentProject) {
      toast.error("Selecione um motivo");
      return;
    }
    try {
      const { error } = await supabase.from('production_deviations').insert({
        project_id: currentProject.id,
        planned_production_id: selectedDeviation.planned.id,
        week_start: selectedDeviation.planned.week_start,
        week_end: selectedDeviation.planned.week_end,
        scope_id: selectedDeviation.planned.scope_id,
        scope_name: selectedDeviation.planned.scope_name,
        macro_id: selectedDeviation.planned.macro_id,
        macro_name: selectedDeviation.planned.macro_name,
        planned_count: selectedDeviation.planned.planned_houses,
        actual_count: selectedDeviation.actual,
        deviation: selectedDeviation.deviation,
        deviation_reason: deviationReason,
        corrective_action: correctiveAction || null,
      });
      if (error) throw error;
      toast.success("Desvio registrado com sucesso!");
      setDeviationDialogOpen(false);
      setSelectedDeviation(null);
      setDeviationReason("");
      setCorrectiveAction("");
      const { data } = await supabase.from('production_deviations').select('*').eq('project_id', currentProject.id).order('created_at', { ascending: false });
      setDeviations((data || []) as Deviation[]);
    } catch (error) {
      console.error('Error saving deviation:', error);
      toast.error("Erro ao registrar desvio");
    }
  };

  const handleTabChange = (value: string) => {
    const tab = value as "planning" | "analysis";
    setActiveTab(tab);
    localStorage.setItem(PLANNING_TAB_STORAGE_KEY, tab);
  };

  const toggleWeekExpanded = (weekKey: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  };

  // ── Print weekly plan ──
  const handlePrintWeek = (week: WeeklyPlanWeek) => {
    const totalHouses = week.services.reduce((sum, s) => sum + s.planned_houses, 0);
    const allHouseIds = [...new Set(week.services.flatMap(s => s.planned_house_ids || []))].sort((a, b) => a - b);

    const printContent = `
      <!DOCTYPE html><html><head><title>Planejamento Semanal - ${currentProject?.name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; line-height: 1.5; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #2563eb; }
        .header h1 { font-size: 24px; color: #2563eb; margin-bottom: 8px; }
        .header h2 { font-size: 18px; color: #374151; font-weight: 500; }
        .period { background: #f3f4f6; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
        .summary { display: flex; gap: 20px; margin-bottom: 25px; }
        .summary-card { flex: 1; background: #dbeafe; padding: 15px; border-radius: 8px; text-align: center; }
        .summary-card.total { background: #2563eb; color: white; }
        .summary-value { font-size: 28px; font-weight: 700; }
        .summary-label { font-size: 12px; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #2563eb; color: white; padding: 12px 15px; text-align: left; font-size: 14px; }
        td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        tr:nth-child(even) { background: #f9fafb; }
        .color-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
        .houses-count { font-weight: 700; font-size: 16px; color: #2563eb; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; }
        .signature-line { margin-top: 60px; padding-top: 10px; border-top: 1px solid #1a1a1a; width: 200px; text-align: center; font-size: 12px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
        <div class="header"><h1>PLANEJAMENTO SEMANAL</h1><h2>${currentProject?.name}</h2></div>
        <div class="period"><span>Semana ${week.week_number}:</span><span style="font-weight:700">${format(parseISO(week.week_start), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(week.week_end), "dd/MM/yyyy", { locale: ptBR })}</span></div>
        <div class="summary"><div class="summary-card"><div class="summary-value">${week.services.length}</div><div class="summary-label">Serviços</div></div><div class="summary-card total"><div class="summary-value">${totalHouses}</div><div class="summary-label">Total de Casas</div></div></div>
        <table><thead><tr><th>Etapa</th><th>Serviço</th><th style="text-align:center">Casas</th><th>Nº das Casas</th></tr></thead><tbody>
        ${week.services.map(s => `<tr><td><span class="color-dot" style="background:${s.macro_color}"></span>${s.macro_name}</td><td>${s.scope_name}</td><td style="text-align:center"><span class="houses-count">${s.planned_houses}</span></td><td style="font-size:11px">${(s.planned_house_ids || []).sort((a,b) => a-b).join(', ') || '-'}</td></tr>`).join('')}
        </tbody></table>
        <div class="footer"><div>Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div></div>
        <div style="display:flex;justify-content:space-between;margin-top:60px"><div class="signature-line">Responsável Técnico</div><div class="signature-line">Encarregado da Obra</div></div>
      </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  if (!currentProject) {
    return (<Card><CardContent className="p-8 text-center text-muted-foreground">Selecione um projeto</CardContent></Card>);
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-10">
          <TabsTrigger value="planning" className="gap-2 text-sm">
            <ClipboardList className="w-4 h-4" />
            Planejamentos Aprovados
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Planejado x Realizado
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Approved Weekly Plans (read-only) ── */}
        <TabsContent value="planning" className="flex-1 overflow-auto mt-4">
          <div className="space-y-4">
            {/* Period selector */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Medição (Período):</Label>
                  </div>
                  <Select value={selectedApprovedPeriodId} onValueChange={setSelectedApprovedPeriodId}>
                    <SelectTrigger className="w-[320px]">
                      <SelectValue placeholder="Selecione um período aprovado" />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedPeriods.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          Medição {p.period_number} — {format(parseISO(p.start_date), "dd/MM", { locale: ptBR })} a {format(parseISO(p.end_date), "dd/MM/yyyy", { locale: ptBR })}
                          {p.status === "released_to_weekly" || p.status === "closed" ? " ✓" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {approvedPeriods.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Info className="w-4 h-4" />
                      Nenhum planejamento semanal foi gerado ainda. Use a aba "Planejamento Semanal" para criar.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Weekly plan content */}
            {isLoadingWeeklyPlan ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent></Card>
            ) : weeklyPlanWeeks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{selectedApprovedPeriodId ? "Nenhum plano semanal encontrado para este período" : "Selecione um período para visualizar o planejamento"}</p>
                  <p className="text-xs mt-2">Os planejamentos são feitos na aba "Planejamento Semanal"</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {weeklyPlanWeeks.map(week => {
                  const totalHouses = week.services.reduce((sum, s) => sum + s.planned_houses, 0);
                  const allHouseIds = [...new Set(week.services.flatMap(s => s.planned_house_ids || []))].sort((a, b) => a - b);
                  const isExpanded = expandedWeeks.has(week.id);

                  // Group by macro
                  const byMacro: Record<string, { macroName: string; macroColor: string; services: WeeklyPlanService[] }> = {};
                  week.services.forEach(s => {
                    if (!byMacro[s.macro_id]) byMacro[s.macro_id] = { macroName: s.macro_name, macroColor: s.macro_color, services: [] };
                    byMacro[s.macro_id].services.push(s);
                  });

                  return (
                    <Card key={week.id} className="overflow-hidden border-2">
                      <div 
                        className="bg-primary/5 p-4 cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => toggleWeekExpanded(week.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-primary/20 flex flex-col items-center justify-center border-2 border-primary">
                              <span className="text-[10px] text-primary font-medium">Sem</span>
                              <span className="text-lg font-bold text-primary">{week.week_number}</span>
                            </div>
                            <div>
                              <p className="font-bold text-lg text-foreground">
                                {format(parseISO(week.week_start), "dd", { locale: ptBR })} a {format(parseISO(week.week_end), "dd 'de' MMMM", { locale: ptBR })}
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <ClipboardList className="w-3 h-3" />
                                  {week.services.length} serviço(s)
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Home className="w-3 h-3" />
                                  {allHouseIds.length} casa(s)
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={(e) => { e.stopPropagation(); handlePrintWeek(week); }}
                            >
                              <Printer className="w-4 h-4" />
                              Imprimir
                            </Button>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>

                        {/* Services summary badges */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(byMacro).map(([macroId, data]) => (
                            <Badge key={macroId} variant="outline" className="gap-1.5 py-1.5 px-3 bg-background">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.macroColor }} />
                              <span className="text-sm font-medium">
                                {data.services.map(s => s.scope_name).join(' + ')}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                ({data.services.reduce((sum, s) => sum + s.planned_houses, 0)})
                              </span>
                            </Badge>
                          ))}
                        </div>

                        {/* House numbers */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">Casas:</span>
                          {allHouseIds.slice(0, 30).map(id => (
                            <span key={id} className="text-xs text-primary font-medium">{id}</span>
                          ))}
                          {allHouseIds.length > 30 && <span className="text-xs text-muted-foreground">+{allHouseIds.length - 30} mais</span>}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="divide-y border-t">
                          {week.services.map(s => (
                            <div key={s.id} className="p-4 hover:bg-muted/30 transition-colors">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.macro_color }} />
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium">{s.scope_name}</span>
                                      <Badge variant="outline" className="text-xs">{s.macro_name}</Badge>
                                    </div>
                                  </div>
                                </div>
                                <Badge className="gap-1">
                                  <Home className="w-3 h-3" />
                                  {s.planned_houses} casa(s)
                                </Badge>
                              </div>
                              
                              {s.planned_house_ids && s.planned_house_ids.length > 0 && (
                                <div className="bg-secondary/30 rounded-lg p-3 mt-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Casas planejadas:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {s.planned_house_ids.sort((a, b) => a - b).map(houseId => (
                                      <Badge 
                                        key={houseId} 
                                        variant="secondary" 
                                        className="h-6 text-xs font-medium"
                                        style={{ backgroundColor: `${s.macro_color}20`, borderColor: s.macro_color, border: '1px solid' }}
                                      >
                                        {houseId}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Analysis (Planejado x Realizado) ── */}
        <TabsContent value="analysis" className="flex-1 overflow-auto mt-4">
          <PlannedVsActualView
            comparisons={comparisons}
            stats={stats}
            costAnalysis={costAnalysis}
            deviationAnalysis={deviationAnalysis}
            deviations={deviations}
            projectId={currentProject.id}
            projectName={currentProject.name}
            contractor={currentProject.contractor}
            onDeviationSaved={async () => {
              const { data } = await supabase
                .from('production_deviations')
                .select('*')
                .eq('project_id', currentProject.id)
                .order('created_at', { ascending: false });
              setDeviations((data || []) as Deviation[]);
            }}
            onProductionDeleted={async () => {
              const { data: actualData } = await supabase
                .from('weekly_productions')
                .select('id, scope_id, scope_name, macro_id, macro_name, week_start, week_end, houses_count, house_ids')
                .eq('project_id', currentProject.id);
              setActualProductions((actualData || []) as ActualProduction[]);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Deviation Dialog */}
      <Dialog open={deviationDialogOpen} onOpenChange={setDeviationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Registrar Motivo do Desvio
            </DialogTitle>
          </DialogHeader>
          {selectedDeviation && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm font-medium">{selectedDeviation.planned.scope_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(selectedDeviation.planned.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(selectedDeviation.planned.week_end), "dd/MM", { locale: ptBR })}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">Planejado: {selectedDeviation.planned.planned_houses}</Badge>
                  <Badge variant="destructive">Realizado: {selectedDeviation.actual}</Badge>
                  <Badge variant="secondary">Desvio: {selectedDeviation.deviation}</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Motivo do Não Cumprimento *</Label>
                <Select value={deviationReason} onValueChange={setDeviationReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                  <SelectContent>
                    {DEVIATION_REASONS.map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ação Corretiva (opcional)</Label>
                <Textarea 
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Descreva a ação corretiva..."
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveDeviation} disabled={!deviationReason}>Salvar Desvio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
