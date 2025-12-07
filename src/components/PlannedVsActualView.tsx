import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  BarChart3, 
  FileDown, 
  AlertTriangle, 
  CheckCircle2,
  ArrowRight,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  Lightbulb,
  Calendar,
  Trash2,
  Edit3
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface ComparisonResult {
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
}

interface DeviationAnalysisItem {
  reason: string;
  count: number;
  totalDeviation: number;
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

interface PlannedVsActualViewProps {
  comparisons: ComparisonResult[];
  stats: {
    totalPlanned: number;
    totalActual: number;
    overallDeviation: string;
    negativeDeviations: number;
    positiveDeviations: number;
    onTarget: number;
    unplannedCount: number;
    accuracy: string;
  };
  costAnalysis: {
    plannedCost: number;
    realizedCost: number;
    costDeviation: string;
  };
  deviationAnalysis: DeviationAnalysisItem[];
  deviations: Deviation[];
  projectId: string;
  projectName: string;
  contractor: string;
  onDeviationSaved: () => void;
  onProductionDeleted?: () => void;
}

export function PlannedVsActualView({
  comparisons,
  stats,
  costAnalysis,
  deviationAnalysis,
  deviations,
  projectId,
  projectName,
  contractor,
  onDeviationSaved,
  onProductionDeleted
}: PlannedVsActualViewProps) {
  const { canEdit } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "deviations" | "actions">("overview");
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<{
    planned: PlannedProduction;
    actual: number;
    deviation: number;
  } | null>(null);
  const [deviationReason, setDeviationReason] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [editingDeviation, setEditingDeviation] = useState<Deviation | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editAction, setEditAction] = useState("");

  const pendingJustifications = comparisons.filter(c => c.isNegative && !c.hasDeviation).length;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleDeleteUnplanned = async (productionId: string) => {
    if (!productionId) return;
    
    try {
      const { error } = await supabase
        .from('weekly_productions')
        .delete()
        .eq('id', productionId);

      if (error) throw error;

      toast.success("Produção não planejada removida");
      onProductionDeleted?.();
    } catch (error) {
      console.error('Error deleting production:', error);
      toast.error("Erro ao remover produção");
    }
  };

  const handleSaveDeviation = async () => {
    if (!selectedDeviation || !deviationReason) {
      toast.error("Selecione um motivo");
      return;
    }

    try {
      const { error } = await supabase
        .from('production_deviations')
        .insert({
          project_id: projectId,
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
      onDeviationSaved();
    } catch (error) {
      console.error('Error saving deviation:', error);
      toast.error("Erro ao registrar desvio");
    }
  };

  const handleEditDeviation = (deviation: Deviation) => {
    setEditingDeviation(deviation);
    setEditReason(deviation.deviation_reason);
    setEditAction(deviation.corrective_action || "");
    setEditDialogOpen(true);
  };

  const handleUpdateDeviation = async () => {
    if (!editingDeviation || !editReason) {
      toast.error("Selecione um motivo");
      return;
    }

    try {
      const { error } = await supabase
        .from('production_deviations')
        .update({
          deviation_reason: editReason,
          corrective_action: editAction || null,
        })
        .eq('id', editingDeviation.id);

      if (error) throw error;

      toast.success("Justificativa atualizada!");
      setEditDialogOpen(false);
      setEditingDeviation(null);
      setEditReason("");
      setEditAction("");
      onDeviationSaved();
    } catch (error) {
      console.error('Error updating deviation:', error);
      toast.error("Erro ao atualizar justificativa");
    }
  };

  const generateReportPDF = () => {
    const byWeek: Record<string, ComparisonResult[]> = {};
    comparisons.forEach(item => {
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
        totalActual: items.reduce((sum, i) => sum + i.actualCount, 0)
      };
    }).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    const nextActions = deviations
      .filter(d => d.corrective_action)
      .slice(0, 5)
      .map(d => ({ scope: d.scope_name, action: d.corrective_action }));

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório Planejado x Realizado - ${projectName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1a1a1a; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #2563eb; }
          .header h1 { font-size: 20px; color: #2563eb; margin-bottom: 5px; }
          .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
          .summary-box { background: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center; }
          .summary-label { font-size: 10px; color: #6b7280; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: 700; }
          .summary-value.positive { color: #16a34a; }
          .summary-value.negative { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-weight: 600; }
          .text-center { text-align: center; }
          .text-danger { color: #dc2626; }
          .text-success { color: #16a34a; }
          .week-header { background: #2563eb; color: white; padding: 10px; border-radius: 4px 4px 0 0; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; }
          .signature-line { width: 200px; border-top: 1px solid #374151; padding-top: 5px; text-align: center; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RELATÓRIO PLANEJADO x REALIZADO</h1>
          <h2>${projectName}</h2>
        </div>
        <div class="summary-grid">
          <div class="summary-box"><div class="summary-label">Total Planejado</div><div class="summary-value">${stats.totalPlanned}</div></div>
          <div class="summary-box"><div class="summary-label">Total Realizado</div><div class="summary-value">${stats.totalActual}</div></div>
          <div class="summary-box"><div class="summary-label">Desvio Geral</div><div class="summary-value ${parseFloat(stats.overallDeviation) < 0 ? 'negative' : 'positive'}">${stats.overallDeviation}%</div></div>
          <div class="summary-box"><div class="summary-label">Acurácia</div><div class="summary-value">${stats.accuracy}%</div></div>
          <div class="summary-box"><div class="summary-label">Não Planejados</div><div class="summary-value">${stats.unplannedCount}</div></div>
        </div>
        ${weeklyData.map(week => `
          <div style="margin-bottom: 15px;">
            <div class="week-header">${format(parseISO(week.weekStart), "dd/MM/yyyy", { locale: ptBR })} - ${format(parseISO(week.weekEnd), "dd/MM/yyyy", { locale: ptBR })}</div>
            <table>
              <thead><tr><th>Serviço</th><th class="text-center">Plan</th><th class="text-center">Real</th><th class="text-center">Desvio</th></tr></thead>
              <tbody>${week.items.map(item => `<tr><td>${item.scopeName}</td><td class="text-center">${item.planned?.planned_houses || 0}</td><td class="text-center">${item.actualCount}</td><td class="text-center ${item.deviation < 0 ? 'text-danger' : 'text-success'}">${item.deviation}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        `).join('')}
        <div class="footer"><div>Emitido: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div><div>${comparisons.length} atividades</div></div>
        <div style="display: flex; justify-content: space-between; margin-top: 40px;"><div class="signature-line">Responsável</div><div class="signature-line">Gerente</div><div class="signature-line">Encarregado</div></div>
      </body></html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with PDF button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Análise Planejado x Realizado
        </h2>
        <Button variant="outline" size="sm" className="gap-2" onClick={generateReportPDF} disabled={comparisons.length === 0}>
          <FileDown className="w-4 h-4" />
          Gerar PDF
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button variant={activeTab === "overview" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("overview")} className="gap-2">
          <Target className="w-4 h-4" />Resumo
        </Button>
        <Button variant={activeTab === "details" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("details")} className="gap-2">
          <BarChart3 className="w-4 h-4" />Detalhes
        </Button>
        <Button variant={activeTab === "deviations" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("deviations")} className="gap-2">
          <AlertCircle className="w-4 h-4" />Desvios
          {pendingJustifications > 0 && <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 justify-center">{pendingJustifications}</Badge>}
        </Button>
        <Button variant={activeTab === "actions" ? "default" : "ghost"} size="sm" onClick={() => setActiveTab("actions")} className="gap-2">
          <Lightbulb className="w-4 h-4" />Ações
        </Button>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {pendingJustifications > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <div><p className="text-sm font-medium text-red-700 dark:text-red-400">{pendingJustifications} desvio(s) pendente(s)</p></div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4"><p className="text-xs text-muted-foreground">Total Planejado</p><p className="text-2xl font-bold">{stats.totalPlanned}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Total Realizado</p><p className="text-2xl font-bold">{stats.totalActual}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Desvio</p><p className={`text-2xl font-bold ${parseFloat(stats.overallDeviation) < 0 ? 'text-red-500' : 'text-green-500'}`}>{stats.overallDeviation}%</p></Card>
            <Card className="p-4"><p className="text-xs text-muted-foreground">Acurácia</p><p className="text-2xl font-bold">{stats.accuracy}%</p></Card>
            <Card className="p-4 border-blue-200 bg-blue-50 dark:bg-blue-950/30"><p className="text-xs text-blue-600">Não Planejados</p><p className="text-2xl font-bold text-blue-700">{stats.unplannedCount}</p></Card>
          </div>
          {(costAnalysis.plannedCost > 0 || costAnalysis.realizedCost > 0) && (
            <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200">
              <div className="grid grid-cols-3 gap-4">
                <div><div className="text-xs text-amber-700">Custo Planejado</div><p className="text-lg font-bold text-amber-800">{formatCurrency(costAnalysis.plannedCost)}</p></div>
                <div><div className="text-xs text-amber-700">Custo Realizado</div><p className="text-lg font-bold text-amber-800">{formatCurrency(costAnalysis.realizedCost)}</p></div>
                <div><div className="text-xs text-amber-700">Desvio Custo</div><p className={`text-lg font-bold ${parseFloat(costAnalysis.costDeviation) > 0 ? 'text-red-600' : 'text-green-600'}`}>{costAnalysis.costDeviation}%</p></div>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4"><div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-sm font-medium">Acima</span></div><p className="text-2xl font-bold text-green-600">{stats.positiveDeviations}</p></Card>
            <Card className="p-4"><div className="flex items-center gap-2 mb-2"><Target className="w-4 h-4 text-blue-500" /><span className="text-sm font-medium">No Alvo</span></div><p className="text-2xl font-bold text-blue-600">{stats.onTarget}</p></Card>
            <Card className="p-4"><div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-sm font-medium">Abaixo</span></div><p className="text-2xl font-bold text-red-600">{stats.negativeDeviations}</p></Card>
          </div>
        </div>
      )}

      {/* Details Tab */}
      {activeTab === "details" && (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2">
            {comparisons.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Nenhuma produção registrada</p></div>
            ) : (
              comparisons.map((comp, index) => (
                <Card key={comp.planned?.id || `unplanned-${index}`} className={`p-3 ${comp.isUnplanned ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20' : comp.isNegative && !comp.hasDeviation ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: comp.macroColor }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{comp.scopeName}</p>
                          <Badge variant="outline" className="text-xs">{comp.macroName}</Badge>
                          {comp.isUnplanned && <Badge variant="secondary" className="text-xs text-blue-600">Não Planejado</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{format(parseISO(comp.weekStart), "dd/MM", { locale: ptBR })} - {format(parseISO(comp.weekEnd), "dd/MM", { locale: ptBR })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">Plan: {comp.planned?.planned_houses || 0}</Badge>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <Badge variant={comp.isUnplanned ? "secondary" : comp.deviation >= 0 ? "default" : "destructive"} className="text-xs">Real: {comp.actualCount}</Badge>
                        </div>
                        {!comp.isUnplanned && <div className="mt-1"><span className={`text-xs font-medium ${comp.deviation < 0 ? 'text-red-500' : 'text-green-500'}`}>{comp.deviation > 0 ? '+' : ''}{comp.deviation}</span></div>}
                      </div>
                      {canEdit && comp.isNegative && !comp.hasDeviation && comp.planned && (
                        <Button variant="outline" size="sm" className="gap-1 h-8 border-red-300 text-red-600" onClick={() => { setSelectedDeviation({ planned: comp.planned!, actual: comp.actualCount, deviation: comp.deviation }); setDeviationDialogOpen(true); }}>
                          <AlertTriangle className="w-3 h-3" />Justificar
                        </Button>
                      )}
                      {comp.hasDeviation && (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Justificado</Badge>
                          {canEdit && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => {
                                const deviation = deviations.find(d => d.planned_production_id === comp.planned?.id);
                                if (deviation) handleEditDeviation(deviation);
                              }}
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                      {canEdit && comp.isUnplanned && comp.actualProductionId && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteUnplanned(comp.actualProductionId!)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      )}

      {/* Deviations Tab */}
      {activeTab === "deviations" && (
        <div className="space-y-4">
          {canEdit && pendingJustifications > 0 && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" />Pendentes ({pendingJustifications})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparisons.filter(c => c.isNegative && !c.hasDeviation).map((comp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-background rounded border">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: comp.macroColor }} />
                        <span className="text-sm font-medium">{comp.scopeName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">{comp.deviation}</Badge>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setSelectedDeviation({ planned: comp.planned!, actual: comp.actualCount, deviation: comp.deviation }); setDeviationDialogOpen(true); }}>Justificar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {deviations.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" />Justificativas Registradas ({deviations.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {deviations.map((deviation) => (
                    <div key={deviation.id} className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg border">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{deviation.scope_name}</span>
                          <Badge variant="outline" className="text-xs">{deviation.macro_name}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(parseISO(deviation.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(deviation.week_end), "dd/MM", { locale: ptBR })}
                        </p>
                        <div className="mt-2 space-y-1">
                          <p className="text-xs"><span className="font-medium">Motivo:</span> {deviation.deviation_reason}</p>
                          {deviation.corrective_action && (
                            <p className="text-xs"><span className="font-medium">Ação:</span> {deviation.corrective_action}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">{deviation.deviation}</Badge>
                        {canEdit && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 gap-1"
                            onClick={() => handleEditDeviation(deviation)}
                          >
                            <Edit3 className="w-3 h-3" />
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {deviationAnalysis.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Frequência por Motivo</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deviationAnalysis.map((item, index) => (
                    <div key={item.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm"><span>{item.reason}</span><Badge variant="outline">{item.count}x</Badge></div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${(item.count / Math.max(...deviationAnalysis.map(d => d.count))) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === "actions" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" />Recomendações</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {stats.negativeDeviations > 0 && <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200"><p className="text-sm font-medium text-red-700">⚠️ {stats.negativeDeviations} abaixo do planejado</p></div>}
              {stats.unplannedCount > 0 && <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200"><p className="text-sm font-medium text-blue-700">📋 {stats.unplannedCount} não planejado(s)</p></div>}
              {deviationAnalysis.length > 0 && <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200"><p className="text-sm font-medium text-amber-700">📊 Principal causa: "{deviationAnalysis[0].reason}"</p></div>}
              {parseFloat(stats.accuracy) >= 80 && <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200"><p className="text-sm font-medium text-green-700">✅ Acurácia {stats.accuracy}% - Excelente!</p></div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deviation Dialog */}
      <Dialog open={deviationDialogOpen} onOpenChange={setDeviationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Registrar Desvio</DialogTitle></DialogHeader>
          {selectedDeviation && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm font-medium">{selectedDeviation.planned.scope_name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">Plan: {selectedDeviation.planned.planned_houses}</Badge>
                  <Badge variant="destructive">Real: {selectedDeviation.actual}</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo *</Label>
                <Select value={deviationReason} onValueChange={setDeviationReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DEVIATION_REASONS.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ação Corretiva</Label>
                <Textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="Descreva..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveDeviation} disabled={!deviationReason}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Deviation Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="w-5 h-5 text-primary" />Editar Justificativa</DialogTitle></DialogHeader>
          {editingDeviation && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm font-medium">{editingDeviation.scope_name}</p>
                <p className="text-xs text-muted-foreground mt-1">{editingDeviation.macro_name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">Plan: {editingDeviation.planned_count}</Badge>
                  <Badge variant="destructive">Real: {editingDeviation.actual_count}</Badge>
                  <Badge variant="secondary">Desvio: {editingDeviation.deviation}</Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo *</Label>
                <Select value={editReason} onValueChange={setEditReason}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DEVIATION_REASONS.map(reason => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ação Corretiva</Label>
                <Textarea value={editAction} onChange={(e) => setEditAction(e.target.value)} placeholder="Descreva..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateDeviation} disabled={!editReason}>Atualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
