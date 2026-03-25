import React, { useState } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { usePlanningData } from './hooks/usePlanningData';
import { usePlanningCalculations } from './hooks/usePlanningCalculations';
import { useStrategicGanttData } from './hooks/useStrategicGanttData';
import { PlanningOnboarding } from './PlanningOnboarding';
import { PlanningDashboard } from './PlanningDashboard';
import { StrategicGanttChart } from './StrategicGanttChart';
import { LineOfBalance } from './LineOfBalance';
import { LaborHistogramView } from '@/components/labor-histogram/LaborHistogramView';
import { ProductivityConfigDialog } from '@/components/labor-histogram/ProductivityConfigDialog';
import { 
  BarChart3, 
  Calendar, 
  AlertTriangle, 
  TrendingUp, 
  Target,
  Loader2,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlanningStage, TeamComposition } from './types';


export function SmartPlanningView() {
  const { currentProject } = useConstruction();
  const { company, canEdit, requireEdit } = useAuth();
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
  } = useStrategicGanttData(currentProject?.id);

  const {
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
        {canEdit ? (
          <PlanningOnboarding
            projectId={currentProject.id}
            totalUnits={currentProject.totalHouses}
            macrosTemplate={currentProject.macrosTemplate}
            templates={templates}
            onComplete={handleOnboardingComplete}
          />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium">Planejamento ainda não configurado</p>
            <p className="text-sm mt-1">Apenas administradores podem configurar o planejamento.</p>
          </div>
        )}
      </div>
    );
  }

  const unresolvedAlerts = alerts.filter(a => !a.is_resolved);
  const latestBaseline = baselines[0];

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Planning info banner */}
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
          <PlanningDashboard
            stages={stages}
            teams={teams}
            ganttServices={strategicGanttServices}
            overallProgress={overallProgress}
            projectedEndDate={strategicProjectedEndDate || projectedEndDate}
            expectedEndDate={currentProject.expectedEndDate}
            totalUnits={currentProject.totalHouses}
            unresolvedAlerts={unresolvedAlerts}
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
            ganttServices={strategicGanttServices}
            projectStartDate={strategicStartDate}
            onUpdatePredecessor={updatePredecessor}
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
          {currentProject?.id && (
            <LaborHistogramView projectId={currentProject.id} />
          )}
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
