import React, { useMemo, useState } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { usePlanningData } from './hooks/usePlanningData';
import { usePlanningCalculations } from './hooks/usePlanningCalculations';
import { useStrategicGanttData } from './hooks/useStrategicGanttData';
import { usePlanningOfficialView } from './hooks/usePlanningOfficialView';
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
  Users,
  ClipboardList
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PlanningStage, TeamComposition } from './types';

const formatHouses = (houses: number[] | null | undefined) => {
  const safeHouses = Array.isArray(houses) ? houses.filter((house) => Number.isFinite(Number(house))) : [];
  if (!safeHouses.length) return 'Não informado';
  if (safeHouses.length <= 6) return safeHouses.join(', ');
  return `${safeHouses.slice(0, 6).join(', ')} +${safeHouses.length - 6}`;
};

const formatDateRange = (start: string | null, end: string | null) => {
  const startLabel = formatSafeDate(start);
  const endLabel = formatSafeDate(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || 'Sem data';
};

const formatSafeDate = (value: string | null | undefined, pattern = 'dd/MM/yyyy') => {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? format(date, pattern, { locale: ptBR }) : null;
};

const formatStatusLabel = (status: string | null | undefined) => {
  const labels: Record<string, string> = {
    cumprida: 'Cumprida',
    parcial: 'Parcial',
    nao_cumprida: 'Não cumprida',
    excedida: 'Excedida',
    sem_lancamento: 'Sem lançamento',
    planned: 'Planejado',
    in_progress: 'Em andamento',
    completed: 'Concluído',
    delayed: 'Atrasado',
    estimated: 'Estimado',
  };
  return status ? labels[status] || status : 'Não informado';
};

const getStatusBadgeVariant = (status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (!status) return 'outline';
  if (['nao_cumprida', 'delayed'].includes(status)) return 'destructive';
  if (['parcial', 'excedida', 'in_progress'].includes(status)) return 'secondary';
  if (['cumprida', 'completed'].includes(status)) return 'default';
  return 'outline';
};

const getSeverityBadgeVariant = (severity: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'secondary';
  return 'outline';
};

const countDiagnostics = (diagnostics: ReturnType<typeof usePlanningOfficialView>['diagnostics'], type: string) =>
  (Array.isArray(diagnostics) ? diagnostics : []).filter((diagnostic) => diagnostic?.type === type).length;

class PlanningDiagnosticRenderBoundary extends React.Component<
  {
    summary: {
      officialPackages: number;
      weeklyTargets: number;
      actualProductions: number;
      deviations: number;
      diagnostics: number;
    };
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error('[Planning Diagnostic Render Error]', error, this.props.summary);
    }
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico do Planejamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Não foi possível montar o diagnóstico com os dados atuais. O Gantt e a Linha de Balanço permanecem disponíveis.
            </p>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}


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

  // Adapter virtual da arquitetura definitiva. Nesta fase fica em modo diagnostico
  // e nao substitui as fontes visuais do Gantt/Linha de Balanco.
  const planningOfficialView = usePlanningOfficialView(currentProject?.id);
  const [diagnosticFilters, setDiagnosticFilters] = useState({
    macro: 'all',
    service: 'all',
    status: 'all',
    severity: 'all',
    week: 'all',
    contractor: 'all',
  });

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
    if (!requireEdit()) return;
    for (const stage of stagesData) {
      const macroId = (stage as any).macro_id;
      const composition = teamCompositions[macroId] || { professionals: 1, helpers: 1 };
      await addStageWithTeams(stage, composition);
    }
    await loadData();
  };

  const unresolvedAlerts = Array.isArray(alerts) ? alerts.filter(a => !a.is_resolved) : [];
  const latestBaseline = Array.isArray(baselines) ? baselines[0] : null;
  const {
    officialPackages = [],
    weeklyTargets = [],
    actualProductions = [],
    deviations = [],
    diagnostics = [],
  } = planningOfficialView || {};

  const diagnosticOptions = useMemo(() => {
    const macros = new Set<string>();
    const services = new Set<string>();
    const statuses = new Set<string>();
    const severities = new Set<string>();
    const weeks = new Set<string>();
    const contractors = new Set<string>();

    (Array.isArray(weeklyTargets) ? weeklyTargets : []).forEach((target) => {
      if (target?.macroName) macros.add(target.macroName);
      if (target?.scopeName) services.add(target.scopeName);
      if (target?.status) statuses.add(target.status);
      if (target?.weekStartDate || target?.weekEndDate) weeks.add(formatDateRange(target.weekStartDate, target.weekEndDate));
      if (target?.contractorName) contractors.add(target.contractorName);
    });
    (Array.isArray(officialPackages) ? officialPackages : []).forEach((pkg) => {
      if (pkg?.macroName) macros.add(pkg.macroName);
      if (pkg?.scopeName) services.add(pkg.scopeName);
      if (pkg?.status) statuses.add(pkg.status);
    });
    (Array.isArray(diagnostics) ? diagnostics : []).forEach((diagnostic) => {
      if (diagnostic?.severity) severities.add(diagnostic.severity);
    });

    return {
      macros: Array.from(macros).sort(),
      services: Array.from(services).sort(),
      statuses: Array.from(statuses).sort(),
      severities: Array.from(severities).sort(),
      weeks: Array.from(weeks).sort(),
      contractors: Array.from(contractors).sort(),
    };
  }, [diagnostics, officialPackages, weeklyTargets]);

  const filteredWeeklyTargets = useMemo(() => (Array.isArray(weeklyTargets) ? weeklyTargets : []).filter((target) => {
    if (!target) return false;
    if (diagnosticFilters.macro !== 'all' && target.macroName !== diagnosticFilters.macro) return false;
    if (diagnosticFilters.service !== 'all' && target.scopeName !== diagnosticFilters.service) return false;
    if (diagnosticFilters.status !== 'all' && target.status !== diagnosticFilters.status) return false;
    if (diagnosticFilters.week !== 'all' && formatDateRange(target.weekStartDate, target.weekEndDate) !== diagnosticFilters.week) return false;
    if (diagnosticFilters.contractor !== 'all' && target.contractorName !== diagnosticFilters.contractor) return false;
    return true;
  }), [diagnosticFilters, weeklyTargets]);

  const filteredPackages = useMemo(() => (Array.isArray(officialPackages) ? officialPackages : []).filter((pkg) => {
    if (!pkg) return false;
    if (diagnosticFilters.macro !== 'all' && pkg.macroName !== diagnosticFilters.macro) return false;
    if (diagnosticFilters.service !== 'all' && pkg.scopeName !== diagnosticFilters.service) return false;
    if (diagnosticFilters.status !== 'all' && pkg.status !== diagnosticFilters.status) return false;
    return true;
  }), [diagnosticFilters, officialPackages]);

  const filteredDiagnostics = useMemo(() => (Array.isArray(diagnostics) ? diagnostics : []).filter((diagnostic) => {
    if (!diagnostic) return false;
    if (diagnosticFilters.severity !== 'all' && diagnostic.severity !== diagnosticFilters.severity) return false;
    return true;
  }), [diagnosticFilters.severity, diagnostics]);

  const filteredDeviations = useMemo(() => (Array.isArray(deviations) ? deviations : []).filter((deviation) => {
    if (!deviation) return false;
    if (diagnosticFilters.macro !== 'all') {
      const target = weeklyTargets.find((item) => item.id === deviation.weeklyPlanServiceId);
      if (target?.macroName !== diagnosticFilters.macro) return false;
    }
    if (diagnosticFilters.service !== 'all') {
      const target = weeklyTargets.find((item) => item.id === deviation.weeklyPlanServiceId);
      if (target?.scopeName !== diagnosticFilters.service) return false;
    }
    return true;
  }), [deviations, diagnosticFilters.macro, diagnosticFilters.service, weeklyTargets]);

  const criticalDiagnostics = (Array.isArray(diagnostics) ? diagnostics : []).filter((diagnostic) => diagnostic?.severity === 'critical').length;
  const warningDiagnostics = (Array.isArray(diagnostics) ? diagnostics : []).filter((diagnostic) => diagnostic?.severity === 'warning').length;
  const initialBankCount = (Array.isArray(actualProductions) ? actualProductions : []).filter((actual) => actual?.source === 'initial_bank').length;
  const validInitialBankCount = (Array.isArray(actualProductions) ? actualProductions : []).filter(
    (actual) => actual?.source === 'initial_bank' && actual.countsForProgress && !actual.countsForWeeklyPerformance
  ).length;

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
                  (iniciado em {formatSafeDate(latestBaseline.created_at, "dd/MM/yyyy 'às' HH:mm") || 'Sem data'})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-6 w-full max-w-5xl">
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
          <TabsTrigger value="diagnostics" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Diagnóstico
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

        <TabsContent value="diagnostics" className="flex-1 mt-4">
          <PlanningDiagnosticRenderBoundary
            summary={{
              officialPackages: officialPackages.length,
              weeklyTargets: weeklyTargets.length,
              actualProductions: actualProductions.length,
              deviations: deviations.length,
              diagnostics: diagnostics.length,
            }}
          >
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Diagnóstico do Planejamento</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Visão somente leitura do fluxo Estratégico → Período → Semanal → Produção Real → Desvios → Saldo.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['Pacotes oficiais', officialPackages.length],
                    ['Metas semanais', weeklyTargets.length],
                    ['Produções realizadas', actualProductions.length],
                    ['Desvios', deviations.length],
                    ['Críticos', criticalDiagnostics],
                    ['Atenção', warningDiagnostics],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-2xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Metas sem pacote oficial', countDiagnostics(diagnostics, 'weekly_target_without_official_package'), 'warning'],
                    ['Metas sem empreiteiro/equipe', countDiagnostics(diagnostics, 'weekly_target_without_contractor'), 'info'],
                    ['Metas não cumpridas', countDiagnostics(diagnostics, 'weekly_target_not_completed'), 'critical'],
                    ['Metas parcialmente cumpridas', countDiagnostics(diagnostics, 'weekly_target_partially_completed'), 'warning'],
                    ['Produção sem meta semanal', countDiagnostics(diagnostics, 'production_without_weekly_target'), 'warning'],
                    ['Desvios sem motivo', countDiagnostics(diagnostics, 'deviation_without_reason'), 'warning'],
                    ['Casas fora do contrato', countDiagnostics(diagnostics, 'weekly_target_with_out_of_contract_houses'), 'warning'],
                    ['Pacotes sem meta semanal', countDiagnostics(diagnostics, 'official_package_without_weekly_target'), 'info'],
                    ['Serviços com saldo restante', countDiagnostics(diagnostics, 'service_with_remaining_balance'), 'info'],
                    ['Risco de duplicidade', countDiagnostics(diagnostics, 'duplicated_actual_production_risk'), 'warning'],
                    ['Banco inicial correto', `${validInitialBankCount}/${initialBankCount}`, 'info'],
                  ].map(([label, value, severity]) => (
                    <div key={label} className="rounded-lg border bg-card p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{label}</p>
                        <Badge variant={getSeverityBadgeVariant(String(severity))}>{severity}</Badge>
                      </div>
                      <p className="mt-2 text-xl font-semibold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['macro', 'Etapa', diagnosticOptions.macros],
                    ['service', 'Serviço', diagnosticOptions.services],
                    ['status', 'Status', diagnosticOptions.statuses],
                    ['severity', 'Severidade', diagnosticOptions.severities],
                    ['week', 'Semana', diagnosticOptions.weeks],
                    ['contractor', 'Empreiteiro/equipe', diagnosticOptions.contractors],
                  ].map(([key, label, options]) => (
                    <label key={String(key)} className="space-y-1 text-xs font-medium text-muted-foreground">
                      {label}
                      <select
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground"
                        value={diagnosticFilters[key as keyof typeof diagnosticFilters]}
                        onChange={(event) => setDiagnosticFilters((current) => ({
                          ...current,
                          [key as string]: event.target.value,
                        }))}
                      >
                        <option value="all">Todos</option>
                        {(options as string[]).map((option) => (
                          <option key={option} value={option}>
                            {key === 'status' ? formatStatusLabel(option) : option}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metas semanais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2">Semana</th>
                        <th className="p-2">Etapa</th>
                        <th className="p-2">Serviço</th>
                        <th className="p-2">Planejadas</th>
                        <th className="p-2">Executadas</th>
                        <th className="p-2">Faltantes</th>
                        <th className="p-2">Fora plano</th>
                        <th className="p-2">Empreiteiro/equipe</th>
                        <th className="p-2">% cumprido</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWeeklyTargets.map((target) => (
                        <tr key={target.id} className="border-b last:border-0">
                          <td className="p-2">{formatDateRange(target.weekStartDate, target.weekEndDate)}</td>
                          <td className="p-2">{target.macroName || '-'}</td>
                          <td className="p-2">{target.scopeName || '-'}</td>
                          <td className="p-2">{formatHouses(target.plannedHouseIds)}</td>
                          <td className="p-2">{formatHouses(target.executedHouseIds)}</td>
                          <td className="p-2">{formatHouses(target.missingHouseIds)}</td>
                          <td className="p-2">{formatHouses(target.outOfPlanHouseIds)}</td>
                          <td className="p-2">{target.contractorName || '-'}</td>
                          <td className="p-2">{target.completionPercent.toFixed(0)}%</td>
                          <td className="p-2">
                            <Badge variant={getStatusBadgeVariant(target.status)}>
                              {formatStatusLabel(target.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pacotes oficiais virtuais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2">Etapa</th>
                        <th className="p-2">Serviço</th>
                        <th className="p-2">Casas</th>
                        <th className="p-2">Período</th>
                        <th className="p-2">Planejado</th>
                        <th className="p-2">Realizado</th>
                        <th className="p-2">Saldo</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPackages.map((pkg) => (
                        <tr key={pkg.id} className="border-b last:border-0">
                          <td className="p-2">{pkg.macroName || '-'}</td>
                          <td className="p-2">{pkg.scopeName || '-'}</td>
                          <td className="p-2">{pkg.unitLabel || formatHouses(pkg.houseIds)}</td>
                          <td className="p-2">{formatDateRange(pkg.plannedStartDate, pkg.plannedEndDate)}</td>
                          <td className="p-2">{pkg.plannedQuantity}</td>
                          <td className="p-2">{pkg.realizedQuantity}</td>
                          <td className="p-2">{pkg.remainingQuantity}</td>
                          <td className="p-2">
                            <Badge variant={getStatusBadgeVariant(pkg.status)}>
                              {formatStatusLabel(pkg.status)}
                            </Badge>
                          </td>
                          <td className="p-2">{pkg.estimated ? 'Sim' : 'Não'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Desvios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead className="border-b text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2">Semana/meta</th>
                        <th className="p-2">Etapa</th>
                        <th className="p-2">Serviço</th>
                        <th className="p-2">Faltantes</th>
                        <th className="p-2">Executadas</th>
                        <th className="p-2">Fora plano</th>
                        <th className="p-2">Motivo</th>
                        <th className="p-2">Observações</th>
                        <th className="p-2">Sem motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeviations.map((deviation) => {
                        const target = weeklyTargets.find((item) => item.id === deviation.weeklyPlanServiceId);
                        return (
                          <tr key={deviation.id} className="border-b last:border-0">
                            <td className="p-2">{target ? formatDateRange(target.weekStartDate, target.weekEndDate) : deviation.weeklyPlanServiceId || '-'}</td>
                            <td className="p-2">{target?.macroName || deviation.macroId || '-'}</td>
                            <td className="p-2">{target?.scopeName || deviation.scopeId || '-'}</td>
                            <td className="p-2">{formatHouses(deviation.missingHouseIds)}</td>
                            <td className="p-2">{formatHouses(deviation.executedHouseIds)}</td>
                            <td className="p-2">{formatHouses(deviation.outOfPlanHouseIds)}</td>
                            <td className="p-2">{deviation.reason || '-'}</td>
                            <td className="p-2">{deviation.notes || '-'}</td>
                            <td className="p-2">
                              <Badge variant={!deviation.reason && !deviation.notes ? 'destructive' : 'outline'}>
                                {!deviation.reason && !deviation.notes ? 'Sim' : 'Não'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Alertas do adapter</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredDiagnostics.map((diagnostic) => (
                    <div key={diagnostic.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getSeverityBadgeVariant(diagnostic.severity)}>
                          {diagnostic.severity}
                        </Badge>
                        <Badge variant="outline">{diagnostic.type}</Badge>
                        {diagnostic.houseIds?.length ? (
                          <span className="text-xs text-muted-foreground">Casas: {formatHouses(diagnostic.houseIds)}</span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm">{diagnostic.message}</p>
                    </div>
                  ))}
                  {filteredDiagnostics.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum alerta encontrado para os filtros atuais.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          </PlanningDiagnosticRenderBoundary>
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
