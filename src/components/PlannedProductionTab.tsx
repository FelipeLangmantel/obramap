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
  Check
} from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
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
        .select('id, scope_id, week_start, week_end, houses_count, house_ids')
        .eq('project_id', currentProject.id);
      
      // Load deviations
      const { data: deviationData } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      setPlannedProductions((plannedData || []) as PlannedProduction[]);
      setActualProductions((actualData || []) as ActualProduction[]);
      setDeviations((deviationData || []) as Deviation[]);
      setIsLoading(false);
    };

    loadData();
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

  // Calculate comparisons for past weeks
  const comparisons = useMemo(() => {
    const now = new Date();
    
    return plannedProductions
      .filter(planned => {
        const endDate = parseISO(planned.week_end);
        return isBefore(endDate, now); // Only past weeks
      })
      .map(planned => {
        // Find actual production for same scope and period
        const actual = actualProductions.filter(a => 
          a.scope_id === planned.scope_id &&
          a.week_start === planned.week_start
        );
        
        const actualCount = actual.reduce((sum, a) => sum + a.houses_count, 0);
        const deviation = actualCount - planned.planned_houses;
        const percentDeviation = planned.planned_houses > 0 
          ? ((deviation / planned.planned_houses) * 100).toFixed(1)
          : "0";
        
        // Check if deviation already registered
        const hasDeviation = deviations.some(d => d.planned_production_id === planned.id);
        
        return {
          planned,
          actualCount,
          deviation,
          percentDeviation,
          hasDeviation,
          isNegative: deviation < 0
        };
      });
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
    const totalPlanned = comparisons.reduce((sum, c) => sum + c.planned.planned_houses, 0);
    const totalActual = comparisons.reduce((sum, c) => sum + c.actualCount, 0);
    const negativeDeviations = comparisons.filter(c => c.deviation < 0).length;
    const positiveDeviations = comparisons.filter(c => c.deviation > 0).length;
    const onTarget = comparisons.filter(c => c.deviation === 0).length;
    
    return {
      totalPlanned,
      totalActual,
      overallDeviation: totalPlanned > 0 ? (((totalActual - totalPlanned) / totalPlanned) * 100).toFixed(1) : "0",
      negativeDeviations,
      positiveDeviations,
      onTarget,
      accuracy: comparisons.length > 0 ? ((onTarget / comparisons.length) * 100).toFixed(0) : "0"
    };
  }, [comparisons]);

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

        {/* Comparisons and Stats */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Planejado vs Realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Planejado</p>
                <p className="text-xl font-bold">{stats.totalPlanned}</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Realizado</p>
                <p className="text-xl font-bold">{stats.totalActual}</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Desvio Geral</p>
                <p className={`text-xl font-bold ${parseFloat(stats.overallDeviation) < 0 ? 'text-red-500' : parseFloat(stats.overallDeviation) > 0 ? 'text-green-500' : ''}`}>
                  {stats.overallDeviation}%
                </p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Acurácia</p>
                <p className="text-xl font-bold">{stats.accuracy}%</p>
              </div>
            </div>

            {/* Comparisons List */}
            <ScrollArea className="h-[300px]">
              {comparisons.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum período passado para comparação ainda
                </div>
              ) : (
                <div className="space-y-2">
                  {comparisons.map(comp => (
                    <div 
                      key={comp.planned.id} 
                      className={`p-3 rounded-lg border ${comp.isNegative && !comp.hasDeviation ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'bg-card'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: comp.planned.macro_color }}
                          />
                          <div>
                            <p className="text-sm font-medium">{comp.planned.scope_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(comp.planned.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(comp.planned.week_end), "dd/MM", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Plan: {comp.planned.planned_houses}
                              </Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant={comp.deviation >= 0 ? "default" : "destructive"} className="text-xs">
                                Real: {comp.actualCount}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-1 justify-end">
                              {comp.deviation > 0 ? (
                                <TrendingUp className="w-3 h-3 text-green-500" />
                              ) : comp.deviation < 0 ? (
                                <TrendingDown className="w-3 h-3 text-red-500" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              )}
                              <span className={`text-xs ${comp.deviation < 0 ? 'text-red-500' : comp.deviation > 0 ? 'text-green-500' : ''}`}>
                                {comp.deviation > 0 ? '+' : ''}{comp.deviation} ({comp.percentDeviation}%)
                              </span>
                            </div>
                          </div>
                          {comp.isNegative && !comp.hasDeviation && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-8 border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setSelectedDeviation({
                                  planned: comp.planned,
                                  actual: comp.actualCount,
                                  deviation: comp.deviation
                                });
                                setDeviationDialogOpen(true);
                              }}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Justificar
                            </Button>
                          )}
                          {comp.hasDeviation && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Justificado
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Deviation Analysis */}
      {deviations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Análise de Desvios - Motivos de Não Cumprimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Reason Chart */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Frequência por Motivo</p>
                {deviationAnalysis.map((item, index) => (
                  <div key={item.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.reason}</span>
                      <Badge variant="outline">{item.count}x</Badge>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 transition-all"
                        style={{ 
                          width: `${(item.count / Math.max(...deviationAnalysis.map(d => d.count))) * 100}%`,
                          opacity: 1 - (index * 0.15)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Deviations */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Últimos Desvios Registrados</p>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {deviations.slice(0, 10).map(d => (
                      <div key={d.id} className="p-2 rounded-lg border bg-card text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{d.scope_name}</span>
                          <Badge variant="destructive" className="text-xs">
                            -{Math.abs(d.deviation)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Motivo:</strong> {d.deviation_reason}
                        </p>
                        {d.corrective_action && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                            <strong>Ação:</strong> {d.corrective_action}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Future Plans - Grouped by Week */}
      {groupedFuturePlans.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Planejamentos Futuros
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}
