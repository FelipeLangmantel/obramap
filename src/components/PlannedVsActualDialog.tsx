import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  Edit3,
  Trash2
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

interface ScopeCost {
  scopeId: string;
  scopeName: string;
  macroId: string;
  macroName: string;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
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
  actualProductionId?: string; // Added for edit/delete unplanned
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

interface PlannedVsActualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function PlannedVsActualDialog({
  open,
  onOpenChange,
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
}: PlannedVsActualDialogProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "deviations" | "actions">("overview");
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<{
    planned: PlannedProduction;
    actual: number;
    deviation: number;
  } | null>(null);
  const [deviationReason, setDeviationReason] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");

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
        .update({ deleted_at: new Date().toISOString() })
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
          .header h2 {
            font-size: 14px;
            color: #374151;
            font-weight: 500;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 20px;
          }
          .summary-box {
            background: #f3f4f6;
            padding: 12px;
            border-radius: 6px;
            text-align: center;
          }
          .summary-box.warning { background: #fef3c7; }
          .summary-box.success { background: #d1fae5; }
          .summary-box.danger { background: #fee2e2; }
          .summary-label { font-size: 10px; color: #6b7280; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: 700; }
          .summary-value.positive { color: #16a34a; }
          .summary-value.negative { color: #dc2626; }
          .section { margin-bottom: 20px; }
          .section-title { 
            font-size: 12px; 
            font-weight: 700; 
            color: #374151;
            padding: 8px 12px;
            background: #e5e7eb;
            border-radius: 4px;
            margin-bottom: 10px;
          }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-weight: 600; color: #374151; }
          .text-center { text-align: center; }
          .text-danger { color: #dc2626; }
          .text-success { color: #16a34a; }
          .week-header { 
            background: #2563eb; 
            color: white; 
            padding: 10px;
            border-radius: 4px 4px 0 0;
            font-weight: 600;
          }
          .color-dot { 
            display: inline-block; 
            width: 10px; 
            height: 10px; 
            border-radius: 50%; 
            margin-right: 6px; 
          }
          .action-box {
            background: #ecfdf5;
            border-left: 3px solid #10b981;
            padding: 8px 12px;
            margin-bottom: 8px;
            border-radius: 0 4px 4px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #6b7280;
          }
          .signature-line {
            width: 200px;
            border-top: 1px solid #374151;
            padding-top: 5px;
            text-align: center;
            font-size: 10px;
          }
          @media print {
            body { padding: 20px; }
            .section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RELATÓRIO PLANEJADO x REALIZADO</h1>
          <h2>${projectName}</h2>
          <p style="font-size: 11px; color: #6b7280; margin-top: 5px;">
            Período: ${weeklyData.length > 0 ? format(parseISO(weeklyData[weeklyData.length - 1].weekStart), "dd/MM/yyyy", { locale: ptBR }) : ''} - 
            ${weeklyData.length > 0 ? format(parseISO(weeklyData[0].weekEnd), "dd/MM/yyyy", { locale: ptBR }) : ''}
          </p>
        </div>
        
        <!-- Summary -->
        <div class="summary-grid">
          <div class="summary-box">
            <div class="summary-label">Total Planejado</div>
            <div class="summary-value">${stats.totalPlanned}</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Total Realizado</div>
            <div class="summary-value">${stats.totalActual}</div>
          </div>
          <div class="summary-box ${parseFloat(stats.overallDeviation) < 0 ? 'danger' : parseFloat(stats.overallDeviation) > 0 ? 'success' : ''}">
            <div class="summary-label">Desvio Geral</div>
            <div class="summary-value ${parseFloat(stats.overallDeviation) < 0 ? 'negative' : parseFloat(stats.overallDeviation) > 0 ? 'positive' : ''}">${stats.overallDeviation}%</div>
          </div>
          <div class="summary-box">
            <div class="summary-label">Acurácia</div>
            <div class="summary-value">${stats.accuracy}%</div>
          </div>
          <div class="summary-box warning">
            <div class="summary-label">Não Planejados</div>
            <div class="summary-value">${stats.unplannedCount}</div>
          </div>
        </div>
        
        <!-- Cost Analysis -->
        ${costAnalysis.plannedCost > 0 || costAnalysis.realizedCost > 0 ? `
          <div class="section">
            <div class="section-title">ANÁLISE DE CUSTOS</div>
            <div class="summary-grid" style="grid-template-columns: repeat(3, 1fr);">
              <div class="summary-box">
                <div class="summary-label">Custo Planejado</div>
                <div class="summary-value" style="font-size: 14px;">${formatCurrency(costAnalysis.plannedCost)}</div>
              </div>
              <div class="summary-box">
                <div class="summary-label">Custo Realizado</div>
                <div class="summary-value" style="font-size: 14px;">${formatCurrency(costAnalysis.realizedCost)}</div>
              </div>
              <div class="summary-box ${parseFloat(costAnalysis.costDeviation) > 0 ? 'danger' : 'success'}">
                <div class="summary-label">Desvio de Custo</div>
                <div class="summary-value ${parseFloat(costAnalysis.costDeviation) > 0 ? 'negative' : 'positive'}" style="font-size: 14px;">${costAnalysis.costDeviation}%</div>
              </div>
            </div>
          </div>
        ` : ''}
        
        <!-- Weekly Breakdown -->
        <div class="section">
          <div class="section-title">DETALHAMENTO POR SEMANA</div>
          ${weeklyData.map(week => `
            <div style="margin-bottom: 15px;">
              <div class="week-header">
                ${format(parseISO(week.weekStart), "dd/MM/yyyy", { locale: ptBR })} - ${format(parseISO(week.weekEnd), "dd/MM/yyyy", { locale: ptBR })}
                | Plan: ${week.totalPlanned} | Real: ${week.totalActual} | Desvio: ${week.totalActual - week.totalPlanned}
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 30%">Serviço</th>
                    <th style="width: 15%" class="text-center">Planejado</th>
                    <th style="width: 15%" class="text-center">Realizado</th>
                    <th style="width: 15%" class="text-center">Desvio</th>
                    <th style="width: 25%">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${week.items.map(item => `
                    <tr>
                      <td>
                        <span class="color-dot" style="background: ${item.macroColor}"></span>
                        ${item.scopeName}
                      </td>
                      <td class="text-center">${item.planned?.planned_houses || 0}</td>
                      <td class="text-center">${item.actualCount}</td>
                      <td class="text-center ${item.deviation < 0 ? 'text-danger' : item.deviation > 0 ? 'text-success' : ''}">
                        ${item.deviation > 0 ? '+' : ''}${item.deviation}
                      </td>
                      <td>
                        ${item.isUnplanned 
                          ? '<span style="color: #2563eb;">Não Planejado</span>' 
                          : item.hasDeviation 
                            ? '<span style="color: #16a34a;">✓ Justificado</span>'
                            : item.isNegative 
                              ? '<span style="color: #dc2626;">⚠ Pendente</span>'
                              : '<span style="color: #16a34a;">✓ OK</span>'
                        }
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
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
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Análise Planejado x Realizado
              </DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={generateReportPDF}
                disabled={comparisons.length === 0}
              >
                <FileDown className="w-4 h-4" />
                Gerar PDF
              </Button>
            </div>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={activeTab === "overview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("overview")}
              className="gap-2"
            >
              <Target className="w-4 h-4" />
              Resumo
            </Button>
            <Button
              variant={activeTab === "details" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("details")}
              className="gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Detalhes
            </Button>
            <Button
              variant={activeTab === "deviations" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("deviations")}
              className="gap-2"
            >
              <AlertCircle className="w-4 h-4" />
              Desvios
              {pendingJustifications > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 justify-center">
                  {pendingJustifications}
                </Badge>
              )}
            </Button>
            <Button
              variant={activeTab === "actions" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("actions")}
              className="gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              Ações
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-4 p-1">
                {/* Pending Justifications Alert */}
                {pendingJustifications > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">
                        {pendingJustifications} desvio(s) pendente(s) de justificativa
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-500">
                        Registre o motivo dos desvios negativos na aba "Desvios"
                      </p>
                    </div>
                  </div>
                )}

                {/* Production Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Total Planejado</p>
                    <p className="text-2xl font-bold">{stats.totalPlanned}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Total Realizado</p>
                    <p className="text-2xl font-bold">{stats.totalActual}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Desvio Produção</p>
                    <p className={`text-2xl font-bold ${parseFloat(stats.overallDeviation) < 0 ? 'text-red-500' : parseFloat(stats.overallDeviation) > 0 ? 'text-green-500' : ''}`}>
                      {parseFloat(stats.overallDeviation) > 0 ? '+' : ''}{stats.overallDeviation}%
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Acurácia</p>
                    <p className="text-2xl font-bold">{stats.accuracy}%</p>
                  </Card>
                  <Card className="p-4 border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                    <p className="text-xs text-blue-600">Não Planejados</p>
                    <p className="text-2xl font-bold text-blue-700">{stats.unplannedCount}</p>
                  </Card>
                </div>

                {/* Cost Stats */}
                {(costAnalysis.plannedCost > 0 || costAnalysis.realizedCost > 0) && (
                  <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
                          <DollarSign className="w-3 h-3" />
                          Custo Planejado
                        </div>
                        <p className="text-lg font-bold text-amber-800 dark:text-amber-300">{formatCurrency(costAnalysis.plannedCost)}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 mb-1">
                          <DollarSign className="w-3 h-3" />
                          Custo Realizado
                        </div>
                        <p className="text-lg font-bold text-amber-800 dark:text-amber-300">{formatCurrency(costAnalysis.realizedCost)}</p>
                      </div>
                      <div>
                        <div className="text-xs text-amber-700 dark:text-amber-400 mb-1">Desvio Custo</div>
                        <p className={`text-lg font-bold ${parseFloat(costAnalysis.costDeviation) < 0 ? 'text-green-600' : parseFloat(costAnalysis.costDeviation) > 0 ? 'text-red-600' : 'text-amber-800'}`}>
                          {parseFloat(costAnalysis.costDeviation) > 0 ? '+' : ''}{costAnalysis.costDeviation}%
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Performance Indicators */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Acima do Planejado</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{stats.positiveDeviations}</p>
                    <p className="text-xs text-muted-foreground">atividades com produção extra</p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">No Alvo</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{stats.onTarget}</p>
                    <p className="text-xs text-muted-foreground">atividades conforme planejado</p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium">Abaixo do Planejado</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{stats.negativeDeviations}</p>
                    <p className="text-xs text-muted-foreground">atividades com produção menor</p>
                  </Card>
                </div>
              </div>
            )}

            {/* Details Tab */}
            {activeTab === "details" && (
              <div className="space-y-2 p-1">
                {comparisons.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhuma produção registrada ainda</p>
                    <p className="text-xs mt-1">Lance produções para ver o comparativo</p>
                  </div>
                ) : (
                  comparisons.map((comp, index) => (
                    <Card 
                      key={comp.planned?.id || `unplanned-${index}`} 
                      className={`p-3 ${
                        comp.isUnplanned 
                          ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/20' 
                          : comp.isNegative && !comp.hasDeviation 
                            ? 'border-red-300 bg-red-50 dark:bg-red-950/20' 
                            : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full shrink-0" 
                            style={{ backgroundColor: comp.macroColor }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{comp.scopeName}</p>
                              <Badge variant="outline" className="text-xs">{comp.macroName}</Badge>
                              {comp.isUnplanned && (
                                <Badge variant="secondary" className="text-xs text-blue-600 border-blue-300">
                                  Não Planejado
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {format(parseISO(comp.weekStart), "dd/MM", { locale: ptBR })} - {format(parseISO(comp.weekEnd), "dd/MM", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Plan: {comp.planned?.planned_houses || 0}
                              </Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant={comp.isUnplanned ? "secondary" : comp.deviation >= 0 ? "default" : "destructive"} className="text-xs">
                                Real: {comp.actualCount}
                              </Badge>
                            </div>
                            {!comp.isUnplanned && (
                              <div className="mt-1">
                                <span className={`text-xs font-medium ${comp.deviation < 0 ? 'text-red-500' : comp.deviation > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
                                  {comp.deviation > 0 ? '+' : ''}{comp.deviation} ({comp.percentDeviation}%)
                                </span>
                              </div>
                            )}
                          </div>
                          {comp.isNegative && !comp.hasDeviation && comp.planned && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-8 border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setSelectedDeviation({
                                  planned: comp.planned!,
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
                          {comp.isUnplanned && comp.actualProductionId && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteUnplanned(comp.actualProductionId!)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Deviations Tab */}
            {activeTab === "deviations" && (
              <div className="space-y-4 p-1">
                {/* Pending Justifications */}
                {pendingJustifications > 0 && (
                  <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4" />
                        Desvios Pendentes de Justificativa ({pendingJustifications})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {comparisons.filter(c => c.isNegative && !c.hasDeviation).map((comp, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-background rounded border">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: comp.macroColor }} />
                              <span className="text-sm font-medium">{comp.scopeName}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(comp.weekStart), "dd/MM", { locale: ptBR })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive" className="text-xs">
                                {comp.deviation} casas
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setSelectedDeviation({
                                    planned: comp.planned!,
                                    actual: comp.actualCount,
                                    deviation: comp.deviation
                                  });
                                  setDeviationDialogOpen(true);
                                }}
                              >
                                Justificar
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Deviation Analysis */}
                {deviationAnalysis.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Frequência por Motivo
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {deviationAnalysis.map((item, index) => (
                          <div key={item.reason} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span>{item.reason}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{item.count}x</Badge>
                                <Badge variant="destructive" className="text-xs">
                                  -{item.totalDeviation} casas
                                </Badge>
                              </div>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500 transition-all"
                                style={{ 
                                  width: `${(item.count / Math.max(...deviationAnalysis.map(d => d.count))) * 100}%`,
                                  opacity: 1 - (index * 0.1)
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recent Deviations */}
                {deviations.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Últimos Desvios Registrados</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {deviations.slice(0, 10).map(d => (
                          <div key={d.id} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{d.scope_name}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive" className="text-xs">
                                  {d.deviation} casas
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {format(parseISO(d.week_start), "dd/MM", { locale: ptBR })}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              <strong>Motivo:</strong> {d.deviation_reason}
                            </p>
                            {d.corrective_action && (
                              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                                <strong>Ação Corretiva:</strong> {d.corrective_action}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {deviations.length === 0 && pendingJustifications === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50 text-green-500" />
                    <p>Nenhum desvio registrado</p>
                    <p className="text-xs mt-1">Todas as produções estão conforme planejado</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions Tab */}
            {activeTab === "actions" && (
              <div className="space-y-4 p-1">
                {/* Recommendations based on data */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      Recomendações Baseadas nos Dados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats.negativeDeviations > 0 && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">
                          ⚠️ {stats.negativeDeviations} atividade(s) abaixo do planejado
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          Revise os motivos dos desvios e tome ações corretivas para as próximas semanas.
                        </p>
                      </div>
                    )}
                    
                    {stats.unplannedCount > 0 && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200">
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                          📋 {stats.unplannedCount} produção(ões) não planejada(s)
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          Inclua essas atividades no próximo planejamento para melhorar a acurácia.
                        </p>
                      </div>
                    )}

                    {deviationAnalysis.length > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          📊 Principal causa de desvio: "{deviationAnalysis[0].reason}"
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Ocorreu {deviationAnalysis[0].count}x afetando {deviationAnalysis[0].totalDeviation} casas. Priorize ações para mitigar esse problema.
                        </p>
                      </div>
                    )}

                    {parseFloat(stats.accuracy) >= 80 && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                          ✅ Acurácia de {stats.accuracy}% - Excelente!
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Continue mantendo o padrão de planejamento e execução.
                        </p>
                      </div>
                    )}

                    {parseFloat(stats.accuracy) < 50 && parseFloat(stats.accuracy) > 0 && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200">
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">
                          ⚠️ Acurácia baixa ({stats.accuracy}%)
                        </p>
                        <p className="text-xs text-red-600 mt-1">
                          Revise o processo de planejamento e considere fatores externos que afetam a produção.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Corrective Actions from Deviations */}
                {deviations.filter(d => d.corrective_action).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        Ações Corretivas Registradas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {deviations.filter(d => d.corrective_action).slice(0, 10).map((d, idx) => (
                          <div key={d.id} className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border-l-4 border-green-500">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{d.scope_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(d.week_start), "dd/MM", { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1">
                              Problema: {d.deviation_reason}
                            </p>
                            <p className="text-sm text-green-700 dark:text-green-400">
                              → {d.corrective_action}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {stats.totalPlanned === 0 && stats.totalActual === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Sem dados suficientes para recomendações</p>
                    <p className="text-xs mt-1">Lance produções planejadas e realizadas para ver análises</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Deviation Registration Dialog */}
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

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDeviation} disabled={!deviationReason}>
              Salvar Desvio
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
