import React, { useState } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePlanningData } from './hooks/usePlanningData';
import { usePlanningCalculations } from './hooks/usePlanningCalculations';
import { useStrategicGanttData } from './hooks/useStrategicGanttData';
import { PlanningOnboarding } from './PlanningOnboarding';
import { StrategicGanttChart } from './StrategicGanttChart';
import { LineOfBalance } from './LineOfBalance';
import { LaborHistogramView } from '@/components/labor-histogram/LaborHistogramView';
import { ProductivityConfigDialog } from '@/components/labor-histogram/ProductivityConfigDialog';
import { 
  BarChart3, 
  Calendar, 
  AlertTriangle, 
  TrendingUp, 
  Clock, 
  Target,
  Layers,
  Loader2,
  PlayCircle,
  BookOpen,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlanningStage, TeamComposition } from './types';
import { toast } from 'sonner';

export function SmartPlanningView() {
  const { currentProject } = useConstruction();
  const { canEdit, company } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [productivityService, setProductivityService] = useState<{
    macro_id: string; scope_id: string; macro_name: string; scope_name: string;
  } | null>(null);
  
  // Módulo estratégico - removido workLogDialog (operacional)
  const {
    stages,
    teams,
    templates,
    workLogs,
    alerts,
    baselines,
    loading,
    isSetupComplete,
    hasBaseline,
    addStageWithTeams,
    createBaseline,
    // addWorkLog removido - operacional
    loadData
  } = usePlanningData(currentProject?.id);

  // Strategic Gantt data from long-term planning
  const {
    ganttServices: strategicGanttServices,
    projectedEndDate: strategicProjectedEndDate,
    projectStartDate: strategicStartDate,
    updateServiceProductivity,
    updatePredecessor,
    loadData: reloadGantt,
  } = useStrategicGanttData(currentProject?.id);

  const {
    ganttTasks,
    lineOfBalanceData,
    projectedEndDate,
    overallProgress
  } = usePlanningCalculations({
    stages,
    teams,
    workLogs,
    totalUnits: currentProject?.totalHouses || 0,
    projectStartDate: currentProject?.startDate || ''
  });

  const handleOnboardingComplete = async (
    stagesData: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>[],
    teamCompositions: Record<string, TeamComposition>
  ) => {
    for (const stage of stagesData) {
      const macroId = (stage as any).macro_id;
      const composition = teamCompositions[macroId] || { professionals: 1, helpers: 1 };
      await addStageWithTeams(stage, composition);
    }
    await loadData();
  };

  const handleStartPlanning = async () => {
    if (!canEdit) {
      toast.error('Você não tem permissão para iniciar o planejamento');
      return;
    }
    
    await createBaseline('Planejamento Inicial');
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um projeto para continuar</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSetupComplete) {
    return (
      <div className="p-6">
        <PlanningOnboarding
          projectId={currentProject.id}
          totalUnits={currentProject.totalHouses}
          macrosTemplate={currentProject.macrosTemplate}
          templates={templates}
          onComplete={handleOnboardingComplete}
        />
      </div>
    );
  }

  const unresolvedAlerts = alerts.filter(a => !a.is_resolved);
  const latestBaseline = baselines[0];

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Planning Status Banner */}
      {!hasBaseline && (
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-full">
                  <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-medium text-amber-900 dark:text-amber-100">
                    Planejamento em Rascunho
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Clique em "Iniciar Planejamento" para congelar a versão inicial e ativar o comparativo Planejado × Realizado.
                  </p>
                </div>
              </div>
              <Button onClick={handleStartPlanning} className="gap-2" disabled={!canEdit}>
                <PlayCircle className="h-4 w-4" />
                Iniciar Planejamento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {hasBaseline && latestBaseline && (
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded-full">
                <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <span className="text-sm text-green-700 dark:text-green-300">
                  <strong>Planejamento Ativo</strong> - {latestBaseline.name} 
                  (iniciado em {format(new Date(latestBaseline.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })})
                </span>
              </div>
              {/* Botão "Diário de Obra" removido - funcionalidade operacional */}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="gantt" className="gap-2">
            <Calendar className="h-4 w-4" />
            Gantt
          </TabsTrigger>
          <TabsTrigger value="lob" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Linha de Balanço
          </TabsTrigger>
          <TabsTrigger value="histogram" className="gap-2">
            <Users className="h-4 w-4" />
            Mão de Obra
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 relative">
            <AlertTriangle className="h-4 w-4" />
            Alertas
            {unresolvedAlerts.length > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs">
                {unresolvedAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Progresso Geral
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
                <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Etapas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stages.length}</div>
                <p className="text-xs text-muted-foreground">
                  {teams.length} equipes ativas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Término Projetado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {projectedEndDate 
                    ? format(projectedEndDate, 'dd/MM/yyyy', { locale: ptBR })
                    : '-'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Previsto: {format(new Date(currentProject.expectedEndDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alertas Ativos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{unresolvedAlerts.length}</div>
                <p className="text-xs text-muted-foreground">
                  {unresolvedAlerts.filter(a => a.severity === 'critical').length} críticos
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Mini Gantt from strategic planning */}
          <StrategicGanttChart
            services={strategicGanttServices}
            projectStartDate={strategicStartDate}
            projectedEndDate={strategicProjectedEndDate}
            onUpdateProductivity={updateServiceProductivity}
            onUpdatePredecessor={updatePredecessor}
          />
        </TabsContent>

        <TabsContent value="gantt" className="flex-1 mt-4">
          <StrategicGanttChart
            services={strategicGanttServices}
            projectStartDate={strategicStartDate}
            projectedEndDate={strategicProjectedEndDate}
            onUpdateProductivity={updateServiceProductivity}
            onUpdatePredecessor={updatePredecessor}
          />
        </TabsContent>

        <TabsContent value="lob" className="flex-1 mt-4">
          <LineOfBalance 
            data={lineOfBalanceData}
            totalUnits={currentProject.totalHouses}
            projectStartDate={currentProject.startDate}
          />
        </TabsContent>

        <TabsContent value="alerts" className="flex-1 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertas Inteligentes</CardTitle>
            </CardHeader>
            <CardContent>
              {unresolvedAlerts.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nenhum alerta ativo no momento
                </p>
              ) : (
                <div className="space-y-3">
                  {unresolvedAlerts.map(alert => (
                    <div 
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.severity === 'critical' 
                          ? 'border-destructive bg-destructive/10' 
                          : alert.severity === 'warning'
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{alert.title}</h4>
                          <p className="text-sm text-muted-foreground">{alert.description}</p>
                          {alert.impact_days && (
                            <Badge variant="outline" className="mt-2">
                              Impacto: +{alert.impact_days} dias
                            </Badge>
                          )}
                        </div>
                        <Badge variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
                          {alert.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="histogram" className="flex-1 mt-4">
          <div className="space-y-6">
            {/* Histogram Card */}
            {currentProject?.id && (
              <LaborHistogramView projectId={currentProject.id} />
            )}

            {/* Productivity config per stage */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Configurar Produtividade por Serviço
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stages.length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground text-sm">
                    Configure as etapas primeiro no onboarding.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stages.map(stage => (
                      <Button
                        key={stage.id}
                        variant="outline"
                        className="justify-start gap-2 h-auto py-3"
                        onClick={() => setProductivityService({
                          macro_id: stage.macro_id || stage.id,
                          scope_id: stage.id,
                          macro_name: stage.name,
                          scope_name: stage.name,
                        })}
                      >
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <div className="text-left">
                          <p className="text-sm font-medium">{stage.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {stage.planned_productivity} un/dia • {stage.planned_teams} equipe(s)
                          </p>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Productivity Config Dialog */}
      {productivityService && company?.id && (
        <ProductivityConfigDialog
          open={!!productivityService}
          onOpenChange={(open) => { if (!open) setProductivityService(null); }}
          companyId={company.id}
          service={productivityService}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

export default SmartPlanningView;
