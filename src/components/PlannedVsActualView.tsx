import { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Calendar,
  Home,
  DollarSign
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
  project_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  house_ids: number[];
  houses_count: number;
  is_initial_database: boolean;
}

interface ProductionDeviation {
  id: string;
  project_id: string;
  planned_production_id: string;
  week_start: string;
  week_end: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  planned_count: number;
  actual_count: number;
  deviation: number;
  deviation_reason: string;
  corrective_action: string | null;
}

interface ComparisonResult {
  planned: PlannedProduction | null;
  scopeId: string;
  scopeName: string;
  macroId: string;
  macroName: string;
  macroColor: string;
  weekStart: string;
  weekEnd: string;
  actualCount: number;
  actualHouseIds: number[];
  deviation: number;
  percentDeviation: string;
  hasDeviation: boolean;
  isNegative: boolean;
  isUnplanned: boolean;
}

const COSTS_STORAGE_KEY = "obramap_scope_costs";

export function PlannedVsActualView() {
  const { currentProject } = useConstruction();
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [actualProductions, setActualProductions] = useState<ActualProduction[]>([]);
  const [deviations, setDeviations] = useState<ProductionDeviation[]>([]);
  const [scopeCosts, setScopeCosts] = useState<Record<string, number>>({});
  
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<ComparisonResult | null>(null);
  const [deviationReason, setDeviationReason] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");

  // Load scope costs from localStorage
  useEffect(() => {
    if (currentProject?.id) {
      const savedCosts = localStorage.getItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`);
      if (savedCosts) {
        setScopeCosts(JSON.parse(savedCosts));
      }
    }
  }, [currentProject?.id]);

  // Load data
  useEffect(() => {
    if (!currentProject) return;

    const loadData = async () => {
      // Load planned productions
      const { data: planned } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      setPlannedProductions(planned || []);

      // Load actual productions (excluding initial database entries)
      const { data: actual } = await supabase
        .from('weekly_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .eq('is_initial_database', false)
        .order('week_start', { ascending: false });
      
      setActualProductions((actual || []).map(a => ({
        ...a,
        is_initial_database: a.is_initial_database || false
      })));

      // Load deviations
      const { data: devs } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id);
      
      setDeviations(devs || []);
    };

    loadData();

    // Subscribe to changes
    const channel = supabase
      .channel('planned-vs-actual-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'weekly_productions', filter: `project_id=eq.${currentProject.id}` },
        () => loadData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'planned_productions', filter: `project_id=eq.${currentProject.id}` },
        () => loadData()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'production_deviations', filter: `project_id=eq.${currentProject.id}` },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProject]);

  // Build comparisons
  const comparisons = useMemo(() => {
    const results: ComparisonResult[] = [];
    const matchedActualIds = new Set<string>();

    // First, process all planned productions
    plannedProductions.forEach(planned => {
      const plannedStart = parseISO(planned.week_start);
      const plannedEnd = parseISO(planned.week_end);
      
      // Find actual production for same scope with overlapping period
      const matchingActuals = actualProductions.filter(a => {
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

      // Mark these actuals as matched
      matchingActuals.forEach(a => matchedActualIds.add(a.id));

      // Count unique houses executed
      const executedHouseIds = new Set<number>();
      matchingActuals.forEach(a => {
        (a.house_ids || []).forEach(id => executedHouseIds.add(id));
      });

      // Calculate actual count
      const plannedHouseIdsSet = new Set(planned.planned_house_ids || []);
      const matchingExecuted = planned.planned_house_ids && planned.planned_house_ids.length > 0
        ? [...executedHouseIds].filter(id => plannedHouseIdsSet.has(id)).length
        : matchingActuals.reduce((sum, a) => sum + a.houses_count, 0);

      const actualCount = matchingExecuted;
      const deviation = actualCount - planned.planned_houses;
      const percentDeviation = planned.planned_houses > 0 
        ? ((deviation / planned.planned_houses) * 100).toFixed(1)
        : "0";

      const hasDeviation = deviations.some(d => d.planned_production_id === planned.id);

      // Only add if there's any actual production for this planned item
      if (matchingActuals.length > 0) {
        results.push({
          planned,
          scopeId: planned.scope_id,
          scopeName: planned.scope_name,
          macroId: planned.macro_id,
          macroName: planned.macro_name,
          macroColor: planned.macro_color,
          weekStart: planned.week_start,
          weekEnd: planned.week_end,
          actualCount,
          actualHouseIds: [...executedHouseIds],
          deviation,
          percentDeviation,
          hasDeviation,
          isNegative: deviation < 0,
          isUnplanned: false
        });
      }
    });

    // Add unplanned productions (actuals not matched to any planned)
    actualProductions.forEach(actual => {
      if (!matchedActualIds.has(actual.id)) {
        results.push({
          planned: null,
          scopeId: actual.scope_id,
          scopeName: actual.scope_name,
          macroId: actual.macro_id,
          macroName: actual.macro_name,
          macroColor: actual.macro_color,
          weekStart: actual.week_start,
          weekEnd: actual.week_end,
          actualCount: actual.houses_count,
          actualHouseIds: actual.house_ids || [],
          deviation: actual.houses_count,
          percentDeviation: "100",
          hasDeviation: false,
          isNegative: false,
          isUnplanned: true
        });
      }
    });

    return results.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [plannedProductions, actualProductions, deviations]);

  // Statistics
  const stats = useMemo(() => {
    const totalPlanned = comparisons.reduce((sum, c) => sum + (c.planned?.planned_houses || 0), 0);
    const totalActual = comparisons.reduce((sum, c) => sum + c.actualCount, 0);
    const totalDeviation = totalActual - totalPlanned;
    const accuracy = totalPlanned > 0 ? ((totalActual / totalPlanned) * 100).toFixed(1) : "0";
    const pendingJustifications = comparisons.filter(c => c.isNegative && !c.hasDeviation).length;
    const unplannedCount = comparisons.filter(c => c.isUnplanned).length;

    return { totalPlanned, totalActual, totalDeviation, accuracy, pendingJustifications, unplannedCount };
  }, [comparisons]);

  // Cost analysis
  const costAnalysis = useMemo(() => {
    let plannedCost = 0;
    let actualCost = 0;

    comparisons.forEach(comp => {
      const costPerHouse = scopeCosts[comp.scopeId] || 0;
      plannedCost += (comp.planned?.planned_houses || 0) * costPerHouse;
      actualCost += comp.actualCount * costPerHouse;
    });

    const deviation = actualCost - plannedCost;
    const percentDeviation = plannedCost > 0 ? ((deviation / plannedCost) * 100).toFixed(1) : "0";

    return { plannedCost, actualCost, deviation, percentDeviation };
  }, [comparisons, scopeCosts]);

  // Handle deviation registration
  const handleRegisterDeviation = (comp: ComparisonResult) => {
    setSelectedComparison(comp);
    setDeviationReason("");
    setCorrectiveAction("");
    setDeviationDialogOpen(true);
  };

  const handleSaveDeviation = async () => {
    if (!selectedComparison || !currentProject || !deviationReason.trim()) {
      toast.error("Informe o motivo do desvio");
      return;
    }

    if (!selectedComparison.planned) {
      toast.error("Não é possível registrar desvio para produção não planejada");
      return;
    }

    try {
      const { error } = await supabase
        .from('production_deviations')
        .insert({
          project_id: currentProject.id,
          planned_production_id: selectedComparison.planned.id,
          week_start: selectedComparison.weekStart,
          week_end: selectedComparison.weekEnd,
          macro_id: selectedComparison.macroId,
          macro_name: selectedComparison.macroName,
          scope_id: selectedComparison.scopeId,
          scope_name: selectedComparison.scopeName,
          planned_count: selectedComparison.planned.planned_houses,
          actual_count: selectedComparison.actualCount,
          deviation: selectedComparison.deviation,
          deviation_reason: deviationReason.trim(),
          corrective_action: correctiveAction.trim() || null
        });

      if (error) throw error;

      toast.success("Desvio registrado com sucesso");
      setDeviationDialogOpen(false);
      
      // Reload deviations
      const { data: devs } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id);
      setDeviations(devs || []);
    } catch (error) {
      console.error('Error saving deviation:', error);
      toast.error("Erro ao salvar desvio");
    }
  };

  // Generate PDF report
  const generateReportPDF = () => {
    const reportContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório Planejado x Realizado - ${currentProject?.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #1a365d; border-bottom: 2px solid #3182ce; padding-bottom: 10px; }
          h2 { color: #2d3748; margin-top: 30px; }
          .summary { background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 12px; color: #718096; }
          .summary-value { font-size: 24px; font-weight: bold; color: #2d3748; }
          .positive { color: #38a169; }
          .negative { color: #e53e3e; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 12px; }
          th { background: #edf2f7; font-weight: 600; }
          .deviation-section { margin-top: 30px; }
          .deviation-item { background: #fff5f5; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #e53e3e; }
          .action-item { background: #f0fff4; padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #38a169; }
          .footer { margin-top: 40px; text-align: center; color: #718096; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>Relatório Planejado x Realizado</h1>
        <p><strong>Projeto:</strong> ${currentProject?.name}</p>
        <p><strong>Gerado em:</strong> ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        
        <div class="summary">
          <h2 style="margin-top: 0;">Resumo Geral</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Produção Planejada</div>
              <div class="summary-value">${stats.totalPlanned} casas</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Produção Realizada</div>
              <div class="summary-value">${stats.totalActual} casas</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Desvio Total</div>
              <div class="summary-value ${stats.totalDeviation >= 0 ? 'positive' : 'negative'}">${stats.totalDeviation >= 0 ? '+' : ''}${stats.totalDeviation} casas</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Custo Planejado</div>
              <div class="summary-value">R$ ${costAnalysis.plannedCost.toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Custo Realizado</div>
              <div class="summary-value">R$ ${costAnalysis.actualCost.toLocaleString('pt-BR')}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Desvio de Custo</div>
              <div class="summary-value ${costAnalysis.deviation >= 0 ? 'positive' : 'negative'}">R$ ${costAnalysis.deviation >= 0 ? '+' : ''}${costAnalysis.deviation.toLocaleString('pt-BR')}</div>
            </div>
          </div>
        </div>

        <h2>Detalhamento por Serviço</h2>
        <table>
          <thead>
            <tr>
              <th>Período</th>
              <th>Etapa/Serviço</th>
              <th>Planejado</th>
              <th>Realizado</th>
              <th>Desvio</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${comparisons.map(comp => `
              <tr>
                <td>${format(parseISO(comp.weekStart), "dd/MM", { locale: ptBR })} - ${format(parseISO(comp.weekEnd), "dd/MM", { locale: ptBR })}</td>
                <td>${comp.macroName} - ${comp.scopeName}</td>
                <td>${comp.planned?.planned_houses || 0}</td>
                <td>${comp.actualCount}</td>
                <td class="${comp.deviation >= 0 ? 'positive' : 'negative'}">${comp.deviation >= 0 ? '+' : ''}${comp.deviation}</td>
                <td>${comp.isUnplanned ? 'Não Planejado' : comp.hasDeviation ? 'Justificado' : comp.isNegative ? 'Pendente' : 'OK'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="deviation-section">
          <h2>Análise de Desvios</h2>
          ${deviations.length === 0 ? '<p>Nenhum desvio registrado.</p>' : deviations.map(dev => `
            <div class="deviation-item">
              <strong>${dev.macro_name} - ${dev.scope_name}</strong><br>
              <small>Período: ${format(parseISO(dev.week_start), "dd/MM", { locale: ptBR })} - ${format(parseISO(dev.week_end), "dd/MM", { locale: ptBR })}</small><br>
              <strong>Motivo:</strong> ${dev.deviation_reason}<br>
              ${dev.corrective_action ? `<strong>Ação Corretiva:</strong> ${dev.corrective_action}` : ''}
            </div>
          `).join('')}
        </div>

        <div class="deviation-section">
          <h2>Ações Corretivas para Próximas Semanas</h2>
          ${deviations.filter(d => d.corrective_action).length === 0 ? '<p>Nenhuma ação corretiva registrada.</p>' : deviations.filter(d => d.corrective_action).map(dev => `
            <div class="action-item">
              <strong>${dev.macro_name} - ${dev.scope_name}</strong><br>
              ${dev.corrective_action}
            </div>
          `).join('')}
        </div>

        <div class="footer">
          <p>Relatório gerado automaticamente pelo ObraMap</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto para ver a análise
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Target className="w-4 h-4" />
              Planejado
            </div>
            <div className="text-2xl font-bold">{stats.totalPlanned}</div>
            <div className="text-xs text-muted-foreground">casas</div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle2 className="w-4 h-4" />
              Realizado
            </div>
            <div className="text-2xl font-bold">{stats.totalActual}</div>
            <div className="text-xs text-muted-foreground">casas</div>
          </CardContent>
        </Card>

        <Card className={stats.totalDeviation >= 0 ? "bg-green-500/10" : "bg-red-500/10"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              {stats.totalDeviation >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              Desvio
            </div>
            <div className={`text-2xl font-bold ${stats.totalDeviation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.totalDeviation >= 0 ? '+' : ''}{stats.totalDeviation}
            </div>
            <div className="text-xs text-muted-foreground">casas</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Custo Plan.
            </div>
            <div className="text-lg font-bold">R$ {costAnalysis.plannedCost.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Custo Real.
            </div>
            <div className="text-lg font-bold">R$ {costAnalysis.actualCost.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>

        {stats.pendingJustifications > 0 && (
          <Card className="bg-amber-500/10 border-amber-500/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
                <AlertTriangle className="w-4 h-4" />
                Pendentes
              </div>
              <div className="text-2xl font-bold text-amber-600">{stats.pendingJustifications}</div>
              <div className="text-xs text-amber-600">justificativas</div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button onClick={generateReportPDF} variant="outline" className="gap-2">
          <FileText className="w-4 h-4" />
          Gerar Relatório PDF
        </Button>
      </div>

      {/* Comparisons List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-5 h-5" />
            Análise Planejado x Realizado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {comparisons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma produção registrada para comparação</p>
              <p className="text-sm mt-1">Registre atividades em "Registrar Produção" para ver a análise</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {comparisons.map((comp, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      comp.isUnplanned 
                        ? 'bg-purple-500/5 border-purple-500/30' 
                        : comp.isNegative 
                          ? 'bg-red-500/5 border-red-500/30' 
                          : comp.deviation > 0 
                            ? 'bg-green-500/5 border-green-500/30' 
                            : 'bg-secondary/30 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: comp.macroColor }}
                          />
                          <span className="font-medium">{comp.macroName}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{comp.scopeName}</span>
                          {comp.isUnplanned && (
                            <Badge variant="secondary" className="bg-purple-500/20 text-purple-700 text-xs">
                              Não Planejado
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(comp.weekStart), "dd/MM", { locale: ptBR })} - {format(parseISO(comp.weekEnd), "dd/MM", { locale: ptBR })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Home className="w-3 h-3" />
                            {comp.actualHouseIds.length > 0 && `Casas: ${comp.actualHouseIds.slice(0, 5).join(', ')}${comp.actualHouseIds.length > 5 ? '...' : ''}`}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Planejado</div>
                          <div className="text-lg font-semibold">{comp.planned?.planned_houses || 0}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Realizado</div>
                          <div className="text-lg font-semibold">{comp.actualCount}</div>
                        </div>
                        <div className="text-center min-w-[60px]">
                          <div className="text-xs text-muted-foreground">Desvio</div>
                          <div className={`text-lg font-semibold flex items-center justify-center gap-1 ${
                            comp.deviation > 0 ? 'text-green-600' : comp.deviation < 0 ? 'text-red-600' : ''
                          }`}>
                            {comp.deviation > 0 ? <TrendingUp className="w-4 h-4" /> : 
                             comp.deviation < 0 ? <TrendingDown className="w-4 h-4" /> : 
                             <Minus className="w-4 h-4" />}
                            {comp.deviation >= 0 ? '+' : ''}{comp.deviation}
                          </div>
                        </div>

                        {comp.isNegative && !comp.isUnplanned && (
                          <div>
                            {comp.hasDeviation ? (
                              <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Justificado
                              </Badge>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleRegisterDeviation(comp)}
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Justificar
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Deviation Dialog */}
      <Dialog open={deviationDialogOpen} onOpenChange={setDeviationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Desvio</DialogTitle>
          </DialogHeader>
          
          {selectedComparison && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="font-medium">{selectedComparison.macroName} - {selectedComparison.scopeName}</p>
                <p className="text-sm text-muted-foreground">
                  Período: {format(parseISO(selectedComparison.weekStart), "dd/MM", { locale: ptBR })} - {format(parseISO(selectedComparison.weekEnd), "dd/MM", { locale: ptBR })}
                </p>
                <p className="text-sm text-red-600 mt-1">
                  Desvio: {selectedComparison.deviation} casas ({selectedComparison.percentDeviation}%)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Motivo do Desvio *</Label>
                <Textarea
                  value={deviationReason}
                  onChange={(e) => setDeviationReason(e.target.value)}
                  placeholder="Descreva o motivo da defasagem na produção..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Ação Corretiva (opcional)</Label>
                <Textarea
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Descreva as ações para corrigir nas próximas semanas..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDeviation}>
              Salvar Desvio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}