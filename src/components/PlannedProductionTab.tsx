import { useState, useEffect, useMemo, useRef } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Target,
  Save,
  Calendar,
  Home,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Plus,
  Trash2,
  BarChart3,
  ClipboardList,
  AlertCircle,
  ArrowRight,
  Printer,
  FileText,
  Edit3,
  X,
  Check,
  FileDown,
  DollarSign,
  ChartLine
} from "lucide-react";
import { PlannedVsActualDialog } from "./PlannedVsActualDialog";
import { format, startOfWeek, endOfWeek, addWeeks, parseISO, isBefore, isAfter, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const { canEdit } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [selectedMacro, setSelectedMacro] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  // Planning period dates (next week by default)
  const [planStartDate, setPlanStartDate] = useState<string>(
    format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [planEndDate, setPlanEndDate] = useState<string>(
    format(endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [actualProductions, setActualProductions] = useState<ActualProduction[]>([]);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [scopeCosts, setScopeCosts] = useState<ScopeCost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Report dialog
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"week" | "month" | "all">("week");
  
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    week_start: string;
    week_end: string;
    planned_houses: string;
    notes: string;
  }>({ week_start: "", week_end: "", planned_houses: "", notes: "" });
  
  // Deviation dialog
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<{
    planned: PlannedProduction;
    actual: number;
    deviation: number;
  } | null>(null);
  const [deviationReason, setDeviationReason] = useState<string>("");
  const [correctiveAction, setCorrectiveAction] = useState<string>("");
  
  // Print dialog
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedWeekForPrint, setSelectedWeekForPrint] = useState<string>("");
  
  // Analysis dialog
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];

  const scopes = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Calculate houses not yet executed for the selected scope
  const availableHousesForScope = useMemo(() => {
    if (!selectedScope || !selectedMacro) return [];
    
    return houses.filter(house => {
      const macro = house.macros.find(m => m.id === selectedMacro);
      if (!macro) return true; // House doesn't have this macro yet
      const scope = macro.scopes.find(s => s.id === selectedScope);
      return !scope || scope.progress < 100; // Not executed or partially executed
    });
  }, [houses, selectedMacro, selectedScope]);

  // Selected house IDs for planning
  const [selectedHouseIds, setSelectedHouseIds] = useState<number[]>([]);

  // Group future plans by week
  const groupedFuturePlans = useMemo(() => {
    const futurePlans = plannedProductions.filter(p => isAfter(parseISO(p.week_end), new Date()));
    const grouped: Record<string, PlannedProduction[]> = {};
    
    futurePlans.forEach(plan => {
      const weekKey = `${plan.week_start}_${plan.week_end}`;
      if (!grouped[weekKey]) {
        grouped[weekKey] = [];
      }
      grouped[weekKey].push(plan);
    });
    
    return Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, plans]) => ({
        weekStart: plans[0].week_start,
        weekEnd: plans[0].week_end,
        plans
      }));
  }, [plannedProductions]);

  // Load data
  useEffect(() => {
    if (!currentProject) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      // Load planned productions
      const { data: plannedData } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      // Load actual productions for comparison
      const { data: actualData } = await supabase
        .from('weekly_productions')
        .select('id, scope_id, scope_name, macro_id, macro_name, week_start, week_end, houses_count, house_ids')
        .eq('project_id', currentProject.id);
      
      // Load deviations
      const { data: deviationData } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      // Load scope costs from localStorage
      const savedCosts = localStorage.getItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`);
      if (savedCosts) {
        setScopeCosts(JSON.parse(savedCosts));
      }
      
      setPlannedProductions((plannedData || []) as PlannedProduction[]);
      setActualProductions((actualData || []) as ActualProduction[]);
      setDeviations((deviationData || []) as Deviation[]);
      setIsLoading(false);
    };

    loadData();

    // Subscribe to realtime updates on weekly_productions
    const channel = supabase
      .channel('planned-productions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weekly_productions',
          filter: `project_id=eq.${currentProject.id}`
        },
        async () => {
          // Reload actual productions when changes occur
          const { data: actualData } = await supabase
            .from('weekly_productions')
            .select('id, scope_id, scope_name, macro_id, macro_name, week_start, week_end, houses_count, house_ids')
            .eq('project_id', currentProject.id);
          setActualProductions((actualData || []) as ActualProduction[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProject]);

  // Save planned production
  const handleSave = async () => {
    if (!currentProject || !selectedScope || selectedHouseIds.length === 0) {
      toast.error("Selecione ao menos uma casa para planejar");
      return;
    }

    const macro = macros.find(m => m.id === selectedMacro);
    const scope = scopes.find(s => s.id === selectedScope);
    if (!macro || !scope) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('planned_productions')
        .insert({
          project_id: currentProject.id,
          week_start: planStartDate,
          week_end: planEndDate,
          scope_id: scope.id,
          scope_name: scope.name,
          macro_id: macro.id,
          macro_name: macro.name,
          macro_color: macro.color,
          planned_houses: selectedHouseIds.length,
          planned_house_ids: selectedHouseIds,
          notes: notes || null,
        });

      if (error) throw error;

      toast.success("Planejamento salvo com sucesso!");
      
      // Reload data
      const { data } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      setPlannedProductions((data || []) as PlannedProduction[]);
      setSelectedHouseIds([]);
      setNotes("");
      setSelectedScope("");
    } catch (error) {
      console.error('Error saving planned production:', error);
      toast.error("Erro ao salvar planejamento");
    }
    setIsSaving(false);
  };

  // Start editing
  const handleStartEdit = (plan: PlannedProduction) => {
    setEditingId(plan.id);
    setEditFormData({
      week_start: plan.week_start,
      week_end: plan.week_end,
      planned_houses: plan.planned_houses.toString(),
      notes: plan.notes || ""
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({ week_start: "", week_end: "", planned_houses: "", notes: "" });
  };

  // Save edit
  const handleSaveEdit = async (id: string) => {
    const count = parseInt(editFormData.planned_houses);
    if (isNaN(count) || count <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    try {
      const { error } = await supabase
        .from('planned_productions')
        .update({
          week_start: editFormData.week_start,
          week_end: editFormData.week_end,
          planned_houses: count,
          notes: editFormData.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      setPlannedProductions(prev => prev.map(p => 
        p.id === id 
          ? { 
              ...p, 
              week_start: editFormData.week_start,
              week_end: editFormData.week_end,
              planned_houses: count,
              notes: editFormData.notes || null
            } 
          : p
      ));
      
      toast.success("Planejamento atualizado!");
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating planned production:', error);
      toast.error("Erro ao atualizar");
    }
  };

  // Delete planned production
  const handleDelete = async (id: string) => {
    try {
      await supabase.from('planned_productions').delete().eq('id', id);
      setPlannedProductions(prev => prev.filter(p => p.id !== id));
      toast.success("Planejamento removido");
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  // Save deviation reason
  const handleSaveDeviation = async () => {
    if (!selectedDeviation || !deviationReason || !currentProject) {
      toast.error("Selecione um motivo");
      return;
    }

    try {
      const { error } = await supabase
        .from('production_deviations')
        .insert({
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

      // Reload deviations
      const { data } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      setDeviations((data || []) as Deviation[]);
    } catch (error) {
      console.error('Error saving deviation:', error);
      toast.error("Erro ao registrar desvio");
    }
  };

  // Print weekly plan
  const handlePrint = (weekStart: string, weekEnd: string) => {
    setSelectedWeekForPrint(`${weekStart}_${weekEnd}`);
    setPrintDialogOpen(true);
  };

  const generatePDF = () => {
    const [weekStart, weekEnd] = selectedWeekForPrint.split('_');
    const plansForWeek = plannedProductions.filter(
      p => p.week_start === weekStart && p.week_end === weekEnd
    );

    const totalHouses = plansForWeek.reduce((sum, p) => sum + p.planned_houses, 0);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Planejamento Semanal - ${currentProject?.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 40px; 
            color: #1a1a1a;
            line-height: 1.5;
          }
          .header { 
            text-align: center; 
            margin-bottom: 30px; 
            padding-bottom: 20px;
            border-bottom: 3px solid #2563eb;
          }
          .header h1 { 
            font-size: 24px; 
            color: #2563eb;
            margin-bottom: 8px;
          }
          .header h2 {
            font-size: 18px;
            color: #374151;
            font-weight: 500;
          }
          .period { 
            background: #f3f4f6; 
            padding: 15px 20px; 
            border-radius: 8px; 
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .period-label { font-weight: 600; color: #374151; }
          .period-dates { font-size: 18px; font-weight: 700; color: #1f2937; }
          .summary {
            display: flex;
            gap: 20px;
            margin-bottom: 25px;
          }
          .summary-card {
            flex: 1;
            background: #dbeafe;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
          }
          .summary-card.total {
            background: #2563eb;
            color: white;
          }
          .summary-value { font-size: 28px; font-weight: 700; }
          .summary-label { font-size: 12px; margin-top: 4px; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th { 
            background: #2563eb; 
            color: white; 
            padding: 12px 15px; 
            text-align: left;
            font-size: 14px;
          }
          td { 
            padding: 12px 15px; 
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
          }
          tr:nth-child(even) { background: #f9fafb; }
          .color-dot {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
            vertical-align: middle;
          }
          .houses-count {
            font-weight: 700;
            font-size: 16px;
            color: #2563eb;
          }
          .notes { 
            font-size: 12px; 
            color: #6b7280; 
            font-style: italic;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #6b7280;
          }
          .signature-line {
            margin-top: 60px;
            padding-top: 10px;
            border-top: 1px solid #1a1a1a;
            width: 200px;
            text-align: center;
            font-size: 12px;
          }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PLANEJAMENTO DE PRODUÇÃO SEMANAL</h1>
          <h2>${currentProject?.name}</h2>
        </div>
        
        <div class="period">
          <span class="period-label">Período:</span>
          <span class="period-dates">
            ${format(parseISO(weekStart), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(weekEnd), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>
        
        <div class="summary">
          <div class="summary-card">
            <div class="summary-value">${plansForWeek.length}</div>
            <div class="summary-label">Atividades Planejadas</div>
          </div>
          <div class="summary-card total">
            <div class="summary-value">${totalHouses}</div>
            <div class="summary-label">Total de Casas</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 20%">Etapa</th>
              <th style="width: 25%">Serviço</th>
              <th style="width: 10%; text-align: center">Qtd</th>
              <th style="width: 25%">Casas</th>
              <th style="width: 20%">Observações</th>
            </tr>
          </thead>
          <tbody>
            ${plansForWeek.map(p => `
              <tr>
                <td>
                  <span class="color-dot" style="background: ${p.macro_color}"></span>
                  ${p.macro_name}
                </td>
                <td>${p.scope_name}</td>
                <td style="text-align: center">
                  <span class="houses-count">${p.planned_houses}</span>
                </td>
                <td style="font-size: 11px; color: #374151;">
                  ${p.planned_house_ids.length > 0 ? p.planned_house_ids.join(', ') : '-'}
                </td>
                <td class="notes">${p.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <div>Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
          <div>Contratante: ${currentProject?.contractor}</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 60px;">
          <div class="signature-line">Responsável Técnico</div>
          <div class="signature-line">Encarregado da Obra</div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    
    setPrintDialogOpen(false);
  };

  // Calculate comparisons: only show when there are actual productions registered
  // Also includes unplanned activities that were registered
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
    }[] = [];

    // Track which actual productions have been matched to planned ones
    const matchedActualIds = new Set<string>();

    // First, match planned productions with actual ones
    plannedProductions.forEach(planned => {
      const plannedStart = parseISO(planned.week_start);
      const plannedEnd = parseISO(planned.week_end);
      
      // Find actual production for same scope with overlapping period
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

      // Only create comparison if there's actual production registered
      if (actual.length > 0) {
        actual.forEach(a => matchedActualIds.add(a.id));
        
        const executedHouseIds = new Set<number>();
        actual.forEach(a => {
          (a.house_ids || []).forEach(id => executedHouseIds.add(id));
        });
        
        const plannedHouseIdsSet = new Set(planned.planned_house_ids || []);
        const matchingExecuted = planned.planned_house_ids && planned.planned_house_ids.length > 0
          ? [...executedHouseIds].filter(id => plannedHouseIdsSet.has(id)).length
          : actual.reduce((sum, a) => sum + a.houses_count, 0);
        
        const actualCount = matchingExecuted;
        const deviation = actualCount - planned.planned_houses;
        const percentDeviation = planned.planned_houses > 0 
          ? ((deviation / planned.planned_houses) * 100).toFixed(1)
          : "0";
        
        const hasDeviation = deviations.some(d => d.planned_production_id === planned.id);
        
        results.push({
          planned,
          actualCount,
          actualHouseIds: [...executedHouseIds],
          deviation,
          percentDeviation,
          hasDeviation,
          isNegative: deviation < 0,
          isUnplanned: false,
          scopeId: planned.scope_id,
          scopeName: planned.scope_name,
          macroName: planned.macro_name,
          macroColor: planned.macro_color,
          weekStart: planned.week_start,
          weekEnd: planned.week_end
        });
      }
    });

    // Now add unplanned productions (actual that weren't matched to any planned)
    actualProductions.forEach(actual => {
      if (!matchedActualIds.has(actual.id)) {
        const executedHouseIds = (actual.house_ids || []);
        
        results.push({
          planned: null,
          actualCount: actual.houses_count,
          actualHouseIds: executedHouseIds,
          deviation: actual.houses_count, // All production is "extra" since nothing was planned
          percentDeviation: "100",
          hasDeviation: false,
          isNegative: false,
          isUnplanned: true,
          scopeId: actual.scope_id,
          scopeName: actual.scope_name,
          macroName: actual.macro_name,
          macroColor: '#9ca3af',
          weekStart: actual.week_start,
          weekEnd: actual.week_end
        });
      }
    });

    // Sort by week start date
    return results.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [plannedProductions, actualProductions, deviations]);

  // Deviation analysis by reason
  const deviationAnalysis = useMemo(() => {
    const byReason: Record<string, { count: number; totalDeviation: number }> = {};
    
    deviations.forEach(d => {
      if (!byReason[d.deviation_reason]) {
        byReason[d.deviation_reason] = { count: 0, totalDeviation: 0 };
      }
      byReason[d.deviation_reason].count++;
      byReason[d.deviation_reason].totalDeviation += Math.abs(d.deviation);
    });
    
    return Object.entries(byReason)
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [deviations]);

  // Stats
  const stats = useMemo(() => {
    const totalPlanned = comparisons.reduce((sum, c) => sum + (c.planned?.planned_houses || 0), 0);
    const totalActual = comparisons.reduce((sum, c) => sum + c.actualCount, 0);
    const plannedComparisons = comparisons.filter(c => c.planned !== null);
    const negativeDeviations = plannedComparisons.filter(c => c.deviation < 0).length;
    const positiveDeviations = plannedComparisons.filter(c => c.deviation > 0).length;
    const onTarget = plannedComparisons.filter(c => c.deviation === 0).length;
    const unplannedCount = comparisons.filter(c => c.isUnplanned).length;
    
    return {
      totalPlanned,
      totalActual,
      overallDeviation: totalPlanned > 0 ? (((totalActual - totalPlanned) / totalPlanned) * 100).toFixed(1) : "0",
      negativeDeviations,
      positiveDeviations,
      onTarget,
      unplannedCount,
      accuracy: plannedComparisons.length > 0 ? ((onTarget / plannedComparisons.length) * 100).toFixed(0) : "0"
    };
  }, [comparisons]);

  // Calculate costs - planned vs realized
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
      plannedCost,
      realizedCost,
      costDeviation: plannedCost > 0 ? (((realizedCost - plannedCost) / plannedCost) * 100).toFixed(1) : "0"
    };
  }, [comparisons, scopeCosts]);

  // Count pending justifications (negative deviations without reason)
  const pendingJustifications = comparisons.filter(c => c.isNegative && !c.hasDeviation).length;

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Generate complete report PDF
  const generateReportPDF = () => {
    const reportData = comparisons.map(comp => {
      const cost = scopeCosts.find(c => c.scopeId === comp.scopeId);
      const unitCost = cost ? (cost.materialCost + cost.laborCost + cost.equipmentCost) : 0;
      const deviationInfo = comp.planned ? deviations.find(d => d.planned_production_id === comp.planned!.id) : null;
      
      return {
        ...comp,
        plannedCost: unitCost * (comp.planned?.planned_houses || 0),
        realizedCost: unitCost * comp.actualCount,
        costDeviation: unitCost * comp.deviation,
        deviationReason: deviationInfo?.deviation_reason || null,
        correctiveAction: deviationInfo?.corrective_action || null
      };
    });

    // Group by week for the report
    const byWeek: Record<string, typeof reportData> = {};
    reportData.forEach(item => {
      const weekKey = `${item.weekStart}_${item.weekEnd}`;
      if (!byWeek[weekKey]) byWeek[weekKey] = [];
      byWeek[weekKey].push(item);
    });

    const weeklyData = Object.entries(byWeek).map(([key, items]) => {
      const [weekStart, weekEnd] = key.split('_');
      return {
        weekStart,
        weekEnd,
        items,
        totalPlanned: items.reduce((sum, i) => sum + (i.planned?.planned_houses || 0), 0),
        totalActual: items.reduce((sum, i) => sum + i.actualCount, 0),
        plannedCost: items.reduce((sum, i) => sum + i.plannedCost, 0),
        realizedCost: items.reduce((sum, i) => sum + i.realizedCost, 0)
      };
    }).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    // Get next actions from recent corrective actions
    const nextActions = deviations
      .filter(d => d.corrective_action)
      .slice(0, 5)
      .map(d => ({ scope: d.scope_name, action: d.corrective_action }));

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Planejado x Realizado - ${currentProject?.name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 30px; 
            color: #1a1a1a;
            line-height: 1.4;
            font-size: 11px;
          }
          .header { 
            text-align: center; 
            margin-bottom: 20px; 
            padding-bottom: 15px;
            border-bottom: 3px solid #2563eb;
          }
          .header h1 { 
            font-size: 20px; 
            color: #2563eb;
            margin-bottom: 5px;
          }
          .header h2 { font-size: 14px; color: #374151; font-weight: 500; }
          .header p { font-size: 10px; color: #6b7280; margin-top: 5px; }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
          }
          .summary-card {
            background: #f3f4f6;
            padding: 12px;
            border-radius: 6px;
            text-align: center;
          }
          .summary-card.highlight { background: #dbeafe; }
          .summary-card.success { background: #dcfce7; }
          .summary-card.danger { background: #fee2e2; }
          .summary-value { font-size: 20px; font-weight: 700; }
          .summary-label { font-size: 9px; color: #6b7280; margin-top: 2px; }
          .section { margin-bottom: 20px; }
          .section-title { 
            font-size: 13px; 
            font-weight: 600; 
            margin-bottom: 10px; 
            padding-bottom: 5px;
            border-bottom: 2px solid #e5e7eb;
            color: #1f2937;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 15px;
            font-size: 10px;
          }
          th { 
            background: #2563eb; 
            color: white; 
            padding: 8px 6px; 
            text-align: left;
            font-size: 9px;
            font-weight: 600;
          }
          td { 
            padding: 6px; 
            border-bottom: 1px solid #e5e7eb;
          }
          tr:nth-child(even) { background: #f9fafb; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .text-success { color: #16a34a; }
          .text-danger { color: #dc2626; }
          .text-warning { color: #d97706; }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 600;
          }
          .badge-success { background: #dcfce7; color: #16a34a; }
          .badge-danger { background: #fee2e2; color: #dc2626; }
          .badge-neutral { background: #f3f4f6; color: #374151; }
          .week-header {
            background: #1f2937;
            color: white;
            padding: 8px 10px;
            font-weight: 600;
            font-size: 11px;
          }
          .deviation-box {
            background: #fef2f2;
            border-left: 3px solid #dc2626;
            padding: 8px;
            margin: 5px 0;
            font-size: 10px;
          }
          .deviation-box strong { color: #dc2626; }
          .action-box {
            background: #f0fdf4;
            border-left: 3px solid #16a34a;
            padding: 8px;
            margin: 5px 0;
            font-size: 10px;
          }
          .action-box strong { color: #16a34a; }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #6b7280;
          }
          .signature-line {
            margin-top: 50px;
            padding-top: 8px;
            border-top: 1px solid #1a1a1a;
            width: 180px;
            text-align: center;
            font-size: 10px;
          }
          @media print {
            body { padding: 15px; }
            .page-break { page-break-before: always; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RELATÓRIO PLANEJADO x REALIZADO</h1>
          <h2>${currentProject?.name}</h2>
          <p>Contratante: ${currentProject?.contractor} | Local: ${currentProject?.location}</p>
        </div>
        
        <!-- Summary Cards -->
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-value">${stats.totalPlanned}</div>
            <div class="summary-label">CASAS PLANEJADAS</div>
          </div>
          <div class="summary-card highlight">
            <div class="summary-value">${stats.totalActual}</div>
            <div class="summary-label">CASAS REALIZADAS</div>
          </div>
          <div class="summary-card ${parseFloat(stats.overallDeviation) < 0 ? 'danger' : 'success'}">
            <div class="summary-value">${stats.overallDeviation}%</div>
            <div class="summary-label">DESVIO PRODUÇÃO</div>
          </div>
          <div class="summary-card">
            <div class="summary-value">${stats.accuracy}%</div>
            <div class="summary-label">ACURÁCIA</div>
          </div>
        </div>
        
        <!-- Cost Summary -->
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-value" style="font-size: 14px;">${formatCurrency(costAnalysis.plannedCost)}</div>
            <div class="summary-label">CUSTO PLANEJADO</div>
          </div>
          <div class="summary-card highlight">
            <div class="summary-value" style="font-size: 14px;">${formatCurrency(costAnalysis.realizedCost)}</div>
            <div class="summary-label">CUSTO REALIZADO</div>
          </div>
          <div class="summary-card ${parseFloat(costAnalysis.costDeviation) < 0 ? 'success' : parseFloat(costAnalysis.costDeviation) > 0 ? 'danger' : ''}">
            <div class="summary-value" style="font-size: 14px;">${formatCurrency(costAnalysis.realizedCost - costAnalysis.plannedCost)}</div>
            <div class="summary-label">DIFERENÇA DE CUSTO</div>
          </div>
          <div class="summary-card ${parseFloat(costAnalysis.costDeviation) < 0 ? 'success' : parseFloat(costAnalysis.costDeviation) > 0 ? 'danger' : ''}">
            <div class="summary-value">${costAnalysis.costDeviation}%</div>
            <div class="summary-label">DESVIO CUSTO</div>
          </div>
        </div>
        
        <!-- Weekly Details -->
        <div class="section">
          <div class="section-title">DETALHAMENTO POR SEMANA</div>
          ${weeklyData.map(week => `
            <div class="week-header">
              Semana: ${format(parseISO(week.weekStart), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(week.weekEnd), "dd/MM/yyyy", { locale: ptBR })}
              | Plan: ${week.totalPlanned} | Real: ${week.totalActual} | Custo Plan: ${formatCurrency(week.plannedCost)} | Custo Real: ${formatCurrency(week.realizedCost)}
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 25%">Serviço</th>
                  <th style="width: 10%" class="text-center">Plan</th>
                  <th style="width: 10%" class="text-center">Real</th>
                  <th style="width: 10%" class="text-center">Desvio</th>
                  <th style="width: 15%" class="text-right">Custo Plan</th>
                  <th style="width: 15%" class="text-right">Custo Real</th>
                  <th style="width: 15%">Motivo</th>
                </tr>
              </thead>
              <tbody>
                ${week.items.map(item => `
                  <tr>
                    <td>
                      <strong>${item.scopeName}</strong>
                      ${item.isUnplanned ? '<span style="color: #2563eb; font-size: 9px;"> (Não Planejado)</span>' : ''}
                      <br><span style="color: #6b7280; font-size: 9px;">${item.macroName}</span>
                    </td>
                    <td class="text-center">${item.planned?.planned_houses || 0}</td>
                    <td class="text-center">${item.actualCount}</td>
                    <td class="text-center">
                      <span class="badge ${item.isUnplanned ? 'badge-neutral' : item.deviation >= 0 ? 'badge-success' : 'badge-danger'}">
                        ${item.isUnplanned ? '+' + item.actualCount : (item.deviation > 0 ? '+' : '') + item.deviation}
                      </span>
                    </td>
                    <td class="text-right">${formatCurrency(item.plannedCost)}</td>
                    <td class="text-right">${formatCurrency(item.realizedCost)}</td>
                    <td style="font-size: 9px;">${item.isUnplanned ? 'Atividade Extra' : (item.deviationReason || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `).join('')}
        </div>
        
        <!-- Deviation Analysis -->
        ${deviationAnalysis.length > 0 ? `
          <div class="section">
            <div class="section-title">ANÁLISE DE DESVIOS - FREQUÊNCIA POR MOTIVO</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50%">Motivo</th>
                  <th style="width: 25%" class="text-center">Ocorrências</th>
                  <th style="width: 25%" class="text-center">Total Casas Afetadas</th>
                </tr>
              </thead>
              <tbody>
                ${deviationAnalysis.map(item => `
                  <tr>
                    <td><strong>${item.reason}</strong></td>
                    <td class="text-center">${item.count}x</td>
                    <td class="text-center text-danger">${item.totalDeviation}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        
        <!-- Next Actions -->
        ${nextActions.length > 0 ? `
          <div class="section">
            <div class="section-title">AÇÕES CORRETIVAS PARA PRÓXIMAS SEMANAS</div>
            ${nextActions.map((action, idx) => `
              <div class="action-box">
                <strong>${idx + 1}. ${action.scope}:</strong> ${action.action}
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="footer">
          <div>Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
          <div>Total de registros: ${comparisons.length} atividades analisadas</div>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 40px;">
          <div class="signature-line">Responsável Técnico</div>
          <div class="signature-line">Gerente de Projeto</div>
          <div class="signature-line">Encarregado da Obra</div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    
    setReportDialogOpen(false);
  };

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Planning Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-5 h-5" />
              Planejar Produção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-secondary/30 rounded-lg space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Período do Planejamento
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input 
                    type="date" 
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input 
                    type="date" 
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Etapa (Macro)</Label>
              <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {macros.map(macro => (
                    <SelectItem key={macro.id} value={macro.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: macro.color }} />
                        {macro.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Serviço</Label>
              <Select 
                value={selectedScope} 
                onValueChange={setSelectedScope}
                disabled={!selectedMacro}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o serviço" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map(scope => (
                    <SelectItem key={scope.id} value={scope.id}>
                      {scope.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Houses Selection */}
            {selectedScope && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Casas Disponíveis (não executadas)</Label>
                  <Badge variant="outline" className="text-xs">
                    {availableHousesForScope.length} disponíveis
                  </Badge>
                </div>
                
                {availableHousesForScope.length > 0 ? (
                  <>
                    <div className="flex gap-2 mb-2">
                      <Button 
                        type="button"
                        variant="outline" 
                        size="sm"
                        className="text-xs"
                        onClick={() => setSelectedHouseIds(availableHousesForScope.map(h => h.id))}
                      >
                        Selecionar Todas
                      </Button>
                      <Button 
                        type="button"
                        variant="outline" 
                        size="sm"
                        className="text-xs"
                        onClick={() => setSelectedHouseIds([])}
                      >
                        Limpar
                      </Button>
                    </div>
                    <ScrollArea className="h-[120px] border rounded-lg p-2">
                      <div className="grid grid-cols-5 gap-1">
                        {availableHousesForScope.map(house => {
                          const isSelected = selectedHouseIds.includes(house.id);
                          return (
                            <button
                              key={house.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedHouseIds(prev => prev.filter(id => id !== house.id));
                                } else {
                                  setSelectedHouseIds(prev => [...prev, house.id]);
                                }
                              }}
                              className={`p-1.5 text-xs rounded border transition-colors ${
                                isSelected 
                                  ? 'bg-primary text-primary-foreground border-primary' 
                                  : 'bg-card border-border hover:border-primary/50'
                              }`}
                            >
                              {house.id}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground text-center">
                      {selectedHouseIds.length} casas selecionadas
                    </p>
                  </>
                ) : (
                  <div className="p-3 text-center text-xs text-muted-foreground bg-secondary/30 rounded-lg">
                    Todas as casas já foram executadas para este serviço
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm">Observações (opcional)</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre o planejamento..."
                className="min-h-[60px] resize-none"
              />
            </div>

            <Button 
              className="w-full gap-2 h-10" 
              onClick={handleSave}
              disabled={!selectedScope || selectedHouseIds.length === 0 || isSaving || !canEdit}
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Salvando..." : `Salvar Planejamento (${selectedHouseIds.length} casas)`}
            </Button>
          </CardContent>
        </Card>

        {/* Future Plans - Side Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Planejamentos Futuros
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setAnalysisDialogOpen(true)}
              >
                <ChartLine className="w-4 h-4" />
                Planejado x Realizado
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {groupedFuturePlans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum planejamento futuro cadastrado</p>
                <p className="text-xs mt-1">Use o formulário ao lado para criar novos planejamentos</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {groupedFuturePlans.map(group => {
                    const totalHouses = group.plans.reduce((sum, p) => sum + p.planned_houses, 0);
                    
                    return (
                      <div key={`${group.weekStart}_${group.weekEnd}`} className="border rounded-lg overflow-hidden">
                        {/* Week Header */}
                        <div className="bg-secondary/50 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-primary" />
                            <div>
                              <p className="font-semibold">
                                {format(parseISO(group.weekStart), "dd/MM/yyyy", { locale: ptBR })} - {format(parseISO(group.weekEnd), "dd/MM/yyyy", { locale: ptBR })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {group.plans.length} atividade(s) • {totalHouses} casas no total
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handlePrint(group.weekStart, group.weekEnd)}
                          >
                            <Printer className="w-4 h-4" />
                            Imprimir
                          </Button>
                        </div>
                        
                        {/* Plans Table */}
                        <div className="divide-y">
                          {group.plans.map(p => (
                            <div key={p.id} className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                              {editingId === p.id ? (
                                // Edit Mode
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Início</Label>
                                    <Input
                                      type="date"
                                      value={editFormData.week_start}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, week_start: e.target.value }))}
                                      className="h-8"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Fim</Label>
                                    <Input
                                      type="date"
                                      value={editFormData.week_end}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, week_end: e.target.value }))}
                                      className="h-8"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Casas</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={editFormData.planned_houses}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, planned_houses: e.target.value }))}
                                      className="h-8"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Obs.</Label>
                                    <Input
                                      value={editFormData.notes}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
                                      className="h-8"
                                      placeholder="Observações"
                                    />
                                  </div>
                                </div>
                              ) : (
                                // View Mode
                                <div className="flex items-center gap-3 flex-1">
                                  <div 
                                    className="w-4 h-4 rounded-full shrink-0" 
                                    style={{ backgroundColor: p.macro_color }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm">{p.scope_name}</span>
                                      <Badge variant="outline" className="text-xs">{p.macro_name}</Badge>
                                    </div>
                                    {p.notes && (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5">{p.notes}</p>
                                    )}
                                  </div>
                                  <Badge className="shrink-0">{p.planned_houses} casas</Badge>
                                </div>
                              )}
                              
                              {/* Action Buttons */}
                              <div className="flex items-center gap-1 ml-3">
                                {editingId === p.id ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={() => handleSaveEdit(p.id)}
                                    >
                                      <Check className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                      onClick={handleCancelEdit}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => handleStartEdit(p)}
                                      disabled={!canEdit}
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDelete(p.id)}
                                      disabled={!canEdit}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Deviation Dialog */}
      <Dialog open={deviationDialogOpen} onOpenChange={setDeviationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
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
                  placeholder="Descreva a ação corretiva a ser tomada..."
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDeviation} disabled={!deviationReason}>
              Salvar Desvio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Gerar PDF do Planejamento
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O PDF será gerado com todas as atividades planejadas para a semana selecionada, 
              incluindo etapas, serviços e metas de produção.
            </p>
            
            <div className="p-4 bg-secondary/30 rounded-lg">
              <p className="text-sm font-medium mb-2">Conteúdo do PDF:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Cabeçalho com nome do projeto</li>
                <li>• Período do planejamento</li>
                <li>• Lista de atividades e metas</li>
                <li>• Totais por etapa</li>
                <li>• Espaço para assinaturas</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={generatePDF} className="gap-2">
              <Printer className="w-4 h-4" />
              Gerar e Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report PDF Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="w-5 h-5 text-primary" />
              Gerar Relatório Planejado x Realizado
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O relatório completo incluirá análise de produção e custos, desvios registrados e ações corretivas.
            </p>
            
            <div className="p-4 bg-secondary/30 rounded-lg">
              <p className="text-sm font-medium mb-3">Conteúdo do Relatório:</p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Resumo geral de produção (planejado x realizado)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Análise de custos (planejado x realizado)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Detalhamento semanal por serviço
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Motivos dos desvios registrados
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Ações corretivas para próximas semanas
                </li>
              </ul>
            </div>

            {pendingJustifications > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <strong>Atenção:</strong> {pendingJustifications} desvio(s) sem justificativa
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  O relatório será gerado, mas alguns itens aparecerão sem motivo registrado.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Atividades Analisadas</p>
                <p className="text-xl font-bold">{comparisons.length}</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Desvios Registrados</p>
                <p className="text-xl font-bold">{deviations.length}</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={generateReportPDF} className="gap-2">
              <FileDown className="w-4 h-4" />
              Gerar e Imprimir Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Analysis Dialog */}
      <PlannedVsActualDialog
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
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
      />
    </div>
  );
}
