import { useMemo, useState } from 'react';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, FileText, Printer, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@/contexts/ConstructionContext';
import type { PlanningOfficialViewResult } from './hooks/usePlanningOfficialView';
import {
  usePlanningCapacityModel,
  type CapacityDiagnosticStatus,
} from './hooks/usePlanningCapacityModel';
import {
  usePlanningForecast,
  type ForecastStatus,
  type RecommendedActionSeverity,
  type StageForecastStatus,
  type TeamRequirementStatus,
} from './hooks/usePlanningForecast';
import type { GanttService } from './hooks/useStrategicGanttData';

interface PlanningForecastViewProps {
  project: Project;
  companyName?: string | null;
  officialView: PlanningOfficialViewResult;
  hasConfiguredMacroflow?: boolean;
  ganttServices?: GanttService[];
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data';
};

const formatDateTime = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? format(date, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Sem data';
};

const formatNumber = (value: number | null | undefined, digits = 0) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '-';

const formatPercent = (value: number | null | undefined) =>
  `${formatNumber(value, 1)}%`;

const getWeeklyCapacityUnit = (productivityUnit: string | null | undefined, fallbackUnit?: string | null) => {
  const base = String(productivityUnit || fallbackUnit || 'un')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)[0];
  return `${base || 'un'}/semana`;
};

const demandSourceLabel = (source: string | null | undefined) => {
  if (source === 'weekly_planning') return 'Planejamento Semanal';
  if (source === 'strategic_period') return 'Planejamento Estrategico por Periodo';
  return 'Sem demanda planejada';
};

const statusLabel = (status: ForecastStatus) => {
  const labels: Record<ForecastStatus, string> = {
    on_track: 'No prazo',
    attention: 'Atencao',
    delayed: 'Atrasado',
    insufficient_data: 'Dados insuficientes',
  };
  return labels[status];
};

const statusVariant = (status: ForecastStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'delayed') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'on_track') return 'default';
  return 'outline';
};

const teamStatusLabel = (status: TeamRequirementStatus) => {
  const labels: Record<TeamRequirementStatus, string> = {
    ok: 'OK',
    overloaded: 'Sobrecarga',
    missing_productivity: 'Sem produtividade',
  };
  return labels[status];
};

const capacityStatusLabel = (status: CapacityDiagnosticStatus) => {
  const labels: Record<CapacityDiagnosticStatus, string> = {
    ok: 'OK',
    attention: 'Atencao',
    overloaded: 'Sobrecarga',
    missing_productivity: 'Sem produtividade',
  };
  return labels[status];
};

const capacityStatusVariant = (status: CapacityDiagnosticStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'overloaded') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const stageStatusLabel = (status: StageForecastStatus) => {
  const labels: Record<StageForecastStatus, string> = {
    ok: 'OK',
    attention: 'Atencao',
    delayed: 'Atrasada',
    missing_data: 'Dados incompletos',
  };
  return labels[status];
};

const stageStatusVariant = (status: StageForecastStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'delayed') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const actionSeverityVariant = (severity: RecommendedActionSeverity): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'secondary';
  return 'outline';
};

const actionSeverityLabel = (severity: RecommendedActionSeverity) => {
  const labels: Record<RecommendedActionSeverity, string> = {
    critical: 'Critico',
    warning: 'Atencao',
    info: 'Informativo',
  };
  return labels[severity];
};

const getTopRisksText = (items: { service: string }[]) => {
  const services = items.slice(0, 3).map((item) => item.service);
  return services.length ? services.join(', ') : 'sem riscos criticos identificados';
};

const getConfidence = (missingProductivityCount: number, totalServices: number, missingDateCount: number) => {
  if (totalServices <= 0) {
    return {
      label: 'Baixa',
      reason: 'Nao ha pacotes suficientes para estimar a previsao.',
      variant: 'outline' as const,
    };
  }

  const missingRatio = missingProductivityCount / Math.max(totalServices, 1);
  if (missingRatio <= 0.1 && missingDateCount <= 2) {
    return {
      label: 'Alta',
      reason: 'Poucos servicos sem produtividade e datas suficientes para leitura executiva.',
      variant: 'default' as const,
    };
  }

  if (missingRatio <= 0.3) {
    return {
      label: 'Media',
      reason: `${missingProductivityCount} servico(s) sem produtividade ou datas incompletas.`,
      variant: 'secondary' as const,
    };
  }

  return {
    label: 'Baixa',
    reason: `${missingProductivityCount} servico(s) sem produtividade reduzem a confiabilidade da previsao.`,
    variant: 'destructive' as const,
  };
};

const getRecommendedAction = (reason: string, fallback: string) => {
  const normalized = reason.toLowerCase();
  if (normalized.includes('sem produtividade')) return 'Cadastrar produtividade do servico.';
  if (normalized.includes('equipe') || normalized.includes('capacidade')) return 'Avaliar reforco de equipe ou reduzir a meta do periodo.';
  if (normalized.includes('saldo')) return 'Reprogramar saldo pendente no proximo periodo.';
  if (normalized.includes('atras')) return 'Criar plano de recuperacao.';
  if (normalized.includes('dados')) return 'Revisar planejamento e datas do servico.';
  return fallback || 'Revisar produtividade, equipe e sequencia do servico.';
};

const getFrontRecommendation = (
  status: CapacityDiagnosticStatus,
  additionalTeams: number,
  demand: number,
  capacity: number | null,
) => {
  if (status === 'missing_productivity') return 'Revisar ou cadastrar produtividade da frente.';
  if (capacity === null || capacity <= 0) return 'Cadastrar produtividade para calcular necessidade de equipe.';
  if (demand <= 0) return 'Sem demanda planejada suficiente para recomendar ajuste.';
  if (status === 'ok') return 'Manter equipe atual e acompanhar proximas metas.';
  if (additionalTeams > 0) return `Adicionar ${additionalTeams} equipe(s) ou replanejar prazo.`;
  if (status === 'attention') return 'Monitorar a frente e redistribuir servicos se houver atraso.';
  return 'Redistribuir servicos ou revisar produtividade da frente.';
};

const normalizeUnitText = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const calculateWeeklyCapacity = (
  productivityValue: number | null | undefined,
  productivityUnit: string | null | undefined,
  workingDaysPerWeek: number,
  teamCount: number,
) => {
  const value = Number(productivityValue);
  const days = Math.max(Number(workingDaysPerWeek) || 0, 0);
  const teams = Math.max(Number(teamCount) || 0, 0);
  if (!Number.isFinite(value) || value <= 0 || days <= 0 || teams <= 0) return null;

  const unit = normalizeUnitText(productivityUnit);
  if (unit.includes('semana')) return value * teams;
  if (unit.includes('mes')) return (value / 22) * days * teams;
  return value * days * teams;
};

const getCapacityStatus = (demand: number, capacity: number | null): CapacityDiagnosticStatus => {
  if (capacity === null || capacity <= 0) return 'missing_productivity';
  if (demand <= capacity) return 'ok';
  return demand <= capacity * 1.2 ? 'attention' : 'overloaded';
};

interface CapacitySimulationInput {
  teamCount: number;
  productivityValue: number;
  workingDaysPerWeek: number;
}

export function PlanningForecastView({
  project,
  companyName,
  officialView,
  hasConfiguredMacroflow = false,
  ganttServices = [],
}: PlanningForecastViewProps) {
  const forecast = usePlanningForecast(project.id, officialView, project, hasConfiguredMacroflow, ganttServices);
  const capacityModel = usePlanningCapacityModel(project.id);
  const [selectedSimulationFrontId, setSelectedSimulationFrontId] = useState('');
  const [capacitySimulations, setCapacitySimulations] = useState<Record<string, CapacitySimulationInput>>({});
  const {
    forecastSummary,
    serviceForecasts,
    teamRequirements,
    criticalItems,
    stageForecasts,
    laborDemandByPeriod,
    progressCurve,
    recommendedActions,
    deviations,
    loading,
  } = forecast;

  const missingProductivity = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.productivityValue);
  const overloadedTeams = teamRequirements.filter((item) => item.status === 'overloaded');
  const sharedCapacityOverloads = capacityModel.overloadDiagnostics.filter((item) => item.status === 'overloaded');
  const activeCapacityGroups = useMemo(
    () => capacityModel.workGroups.filter((group) => group.active),
    [capacityModel.workGroups],
  );
  const frontCapacityRows = useMemo(() => {
    return activeCapacityGroups.map((group) => {
      const groupCapacity = capacityModel.serviceCapacityMap.find((entry) => entry.groupId === group.id);
      const groupDiagnostics = capacityModel.overloadDiagnostics.filter((item) => item.groupId === group.id);
      const peakDemand = groupDiagnostics.reduce((max, item) => Math.max(max, item.plannedQuantity), 0);
      const availableCapacity = groupCapacity?.weeklyCapacity ?? null;
      const teamCount = Math.max(group.simultaneousTeamCount || 0, 0);
      const demandSource = groupDiagnostics[0]?.demandSource ?? null;
      const capacityPerTeam = availableCapacity && teamCount > 0 ? availableCapacity / teamCount : null;
      const requiredTeams = capacityPerTeam && peakDemand > 0 ? Math.ceil(peakDemand / capacityPerTeam) : null;
      const additionalTeams = requiredTeams === null ? 0 : Math.max(requiredTeams - teamCount, 0);
      const overloadQuantity = availableCapacity === null ? 0 : Math.max(peakDemand - availableCapacity, 0);
      const overloadPercent = availableCapacity && availableCapacity > 0 ? (overloadQuantity / availableCapacity) * 100 : 0;
      const status: CapacityDiagnosticStatus =
        availableCapacity === null || availableCapacity <= 0
          ? 'missing_productivity'
          : peakDemand <= availableCapacity
            ? 'ok'
            : overloadPercent <= 20
              ? 'attention'
              : 'overloaded';

      return {
        id: group.id,
        name: group.name,
        services: group.services,
        weeklyCapacity: availableCapacity,
        weeklyCapacityUnit: getWeeklyCapacityUnit(group.productivityUnit, group.baseUnit),
        productivityValue: group.productivityValue,
        productivityUnit: group.productivityUnit || group.baseUnit || '',
        workingDaysPerWeek: group.workingDaysPerWeek,
        demandSource,
        teamCount,
        totalPeople: group.totalPeople,
        peoplePerTeam: teamCount > 0 ? group.totalPeople / teamCount : group.professionalCount + group.auxiliaryCount,
        peakDemand,
        capacityPerTeam,
        requiredTeams,
        additionalTeams,
        status,
        recommendation: getFrontRecommendation(status, additionalTeams, peakDemand, availableCapacity),
      };
    });
  }, [activeCapacityGroups, capacityModel.overloadDiagnostics, capacityModel.serviceCapacityMap]);
  const selectedSimulationFront = useMemo(() => {
    if (frontCapacityRows.length === 0) return null;
    return frontCapacityRows.find((row) => row.id === selectedSimulationFrontId) ?? frontCapacityRows[0];
  }, [frontCapacityRows, selectedSimulationFrontId]);
  const selectedSimulationInput = useMemo(() => {
    if (!selectedSimulationFront) return null;
    return capacitySimulations[selectedSimulationFront.id] ?? {
      teamCount: Math.max(selectedSimulationFront.teamCount || 1, 1),
      productivityValue: selectedSimulationFront.productivityValue ?? 0,
      workingDaysPerWeek: Math.max(selectedSimulationFront.workingDaysPerWeek || 5, 1),
    };
  }, [capacitySimulations, selectedSimulationFront]);
  const simulatedCapacityResult = useMemo(() => {
    if (!selectedSimulationFront || !selectedSimulationInput) return null;

    const demand = selectedSimulationFront.peakDemand;
    const simulatedCapacity = calculateWeeklyCapacity(
      selectedSimulationInput.productivityValue,
      selectedSimulationFront.productivityUnit,
      selectedSimulationInput.workingDaysPerWeek,
      selectedSimulationInput.teamCount,
    );
    const simulatedStatus = getCapacityStatus(demand, simulatedCapacity);
    const simulatedOverload = simulatedCapacity === null ? 0 : Math.max(demand - simulatedCapacity, 0);
    const simulatedSurplus = simulatedCapacity === null ? 0 : Math.max(simulatedCapacity - demand, 0);
    const currentCapacity = selectedSimulationFront.weeklyCapacity;
    const currentStatus = getCapacityStatus(demand, currentCapacity);
    const currentOverload = currentCapacity === null ? 0 : Math.max(demand - currentCapacity, 0);
    const additionalTeams = Math.max(selectedSimulationInput.teamCount - selectedSimulationFront.teamCount, 0);
    const additionalPeople = additionalTeams * Math.max(selectedSimulationFront.peoplePerTeam || 0, 0);
    const recommendation =
      simulatedStatus === 'missing_productivity'
        ? 'Cadastre produtividade da frente para simular capacidade.'
        : demand <= 0
          ? 'Sem demanda suficiente para avaliar necessidade de equipe.'
          : simulatedOverload <= 0 && currentOverload > 0
            ? 'Cenario simulado resolve a sobrecarga atual.'
            : simulatedOverload <= 0
              ? 'Cenario mantem capacidade suficiente para a demanda prevista.'
              : simulatedStatus === 'attention'
                ? 'Cenario reduz o risco, mas ainda exige acompanhamento.'
                : 'Cenario ainda fica sobrecarregado; avalie mais equipe, produtividade ou replanejamento.';

    return {
      demand,
      currentCapacity,
      currentStatus,
      currentOverload,
      simulatedCapacity,
      simulatedStatus,
      simulatedOverload,
      simulatedSurplus,
      additionalTeams,
      additionalPeople,
      recommendation,
    };
  }, [selectedSimulationFront, selectedSimulationInput]);
  const updateSimulationInput = (field: keyof CapacitySimulationInput, value: number) => {
    if (!selectedSimulationFront) return;
    const fallback = selectedSimulationInput ?? {
      teamCount: Math.max(selectedSimulationFront.teamCount || 1, 1),
      productivityValue: selectedSimulationFront.productivityValue ?? 0,
      workingDaysPerWeek: Math.max(selectedSimulationFront.workingDaysPerWeek || 5, 1),
    };
    setCapacitySimulations((current) => ({
      ...current,
      [selectedSimulationFront.id]: {
        ...fallback,
        [field]: Math.max(Number.isFinite(value) ? value : 0, field === 'productivityValue' ? 0 : 1),
      },
    }));
  };
  const resetSimulation = () => {
    if (!selectedSimulationFront) return;
    setCapacitySimulations((current) => {
      const next = { ...current };
      delete next[selectedSimulationFront.id];
      return next;
    });
  };
  const missingDateCount = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.estimatedFinishDate).length;
  const confidence = hasConfiguredMacroflow
    ? getConfidence(forecastSummary.missingProductivityCount, forecastSummary.totalServices, missingDateCount)
    : {
      label: 'Indisponivel',
      reason: 'Configure o Macrofluxo para estimar prazo final com sequencia oficial.',
      variant: 'outline' as const,
    };
  const generatedAt = new Date();
  const totalLabor = laborDemandByPeriod.reduce(
    (acc, period) => ({
      teams: acc.teams + period.totalTeams,
      professionals: acc.professionals + period.totalProfessionals,
      helpers: acc.helpers + period.totalHelpers,
      people: acc.people + period.totalPeople,
      overloaded: acc.overloaded + period.overloadedServicesCount,
      missingProductivity: acc.missingProductivity + period.missingProductivityCount,
    }),
    { teams: 0, professionals: 0, helpers: 0, people: 0, overloaded: 0, missingProductivity: 0 },
  );
  const criticalStagesText = stageForecasts
    .filter((stage) => stage.status === 'delayed' || stage.status === 'missing_data')
    .slice(0, 3)
    .map((stage) => stage.macroName)
    .join(', ') || 'sem etapas criticas identificadas';
  const finishForecastText = forecastSummary.estimatedFinishDate
    ? formatDate(forecastSummary.estimatedFinishDate)
    : 'Configure o Macrofluxo para estimar termino';
  const delayText = forecastSummary.delayDays === null
    ? 'Indisponivel'
    : `${forecastSummary.delayDays} dia(s)`;
  const printReport = () => window.print();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Montando previsao de equipes e prazo...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 planning-forecast-page">
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 12mm;
            }

            body {
              background: #fff !important;
              color: #111827 !important;
            }

            body * {
              visibility: hidden !important;
            }

            #planning-executive-report,
            #planning-executive-report * {
              visibility: visible !important;
            }

            #planning-executive-report {
              position: absolute !important;
              inset: 0 auto auto 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              color: #111827 !important;
              box-shadow: none !important;
              border: 0 !important;
            }

            .print-section {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .print-table {
              width: 100% !important;
              border-collapse: collapse !important;
              font-size: 10px !important;
            }

            .print-table th,
            .print-table td {
              border: 1px solid #d1d5db !important;
              padding: 5px 6px !important;
              vertical-align: top !important;
            }

            .print-table th {
              background: #f3f4f6 !important;
              font-weight: 700 !important;
            }

            .print-muted {
              color: #4b5563 !important;
            }

            .print-card {
              border: 1px solid #d1d5db !important;
              background: #fff !important;
              break-inside: avoid;
            }

            .print-footer {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              font-size: 9px;
              color: #6b7280;
              border-top: 1px solid #d1d5db;
              padding-top: 4px;
            }
          }
        `}
      </style>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Previsao e Equipes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Visao somente leitura para prazo, capacidade e relatorio executivo. Nao salva dados e nao altera o planejamento oficial.
            </p>
          </div>
          <Button type="button" variant="outline" className="gap-2" onClick={printReport}>
            <Printer className="h-4 w-4" />
            Imprimir relatorio
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
            {[
              ['Progresso planejado', formatPercent(forecastSummary.plannedProgress)],
              ['Progresso realizado', formatPercent(forecastSummary.realProgress)],
              ['Desvio', formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)],
              ['Previsao de termino', finishForecastText],
              ['Atraso/adiantamento', delayText],
              ['Sem produtividade', forecastSummary.missingProductivityCount],
              ['Equipes com sobrecarga', overloadedTeams.length],
              ['Confiabilidade', confidence.label],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
            {hasConfiguredMacroflow
              ? 'Previsao estimada com base no Macrofluxo, nas produtividades cadastradas e nas demandas planejadas.'
              : 'Configure o Macrofluxo para estimar termino e atraso com sequencia oficial.'}
            {' '}Servicos sem produtividade reduzem a confiabilidade.
            Frentes compartilhadas ainda estao em diagnostico e nao unem lancamentos de producao, diario, desvios ou Mapa 3D.
          </div>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Capacidade por frente de trabalho
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            As frentes compartilhadas indicam a capacidade real de equipes que executam multiplos servicos. Este diagnostico
            nao altera producao, diario, medicao ou planejamento oficial.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            {[
              ['Frentes', capacityModel.summary.totalWorkGroups],
              ['Frentes ativas', capacityModel.summary.activeWorkGroups],
              ['Servicos com frente', capacityModel.summary.servicesWithWorkGroup],
              ['Servicos sem frente', capacityModel.summary.servicesWithoutWorkGroup],
              ['Sem capacidade', capacityModel.summary.servicesWithoutCapacity],
              ['Sobrecargas', capacityModel.summary.overloadedPeriods],
              ['Pessoas planejadas', capacityModel.summary.totalPeoplePlanned],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">{formatNumber(Number(value))}</p>
              </div>
            ))}
          </div>

          {capacityModel.diagnostics.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Algumas fontes de capacidade nao puderam ser lidas agora. O diagnostico segue com fallback seguro.
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Frente</th>
                    <th className="p-2">Servicos vinculados</th>
                    <th className="p-2">Capacidade semanal</th>
                    <th className="p-2">Equipes</th>
                    <th className="p-2">Pessoas</th>
                    <th className="p-2">Demanda prevista</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Recomendacao</th>
                  </tr>
                </thead>
                <tbody>
                  {frontCapacityRows.slice(0, 10).map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">
                        {row.services.slice(0, 4).map((service) => service.serviceName || service.scopeId || 'Servico').join(', ')}
                        {row.services.length > 4 ? ` +${row.services.length - 4}` : ''}
                      </td>
                      <td className="p-2">
                        {row.weeklyCapacity === null
                          ? 'Sem produtividade'
                          : (
                            <div>
                              <div>{formatNumber(row.weeklyCapacity, 1)} {row.weeklyCapacityUnit}</div>
                              <div className="text-xs text-muted-foreground">
                                Produtividade: {row.productivityValue ? `${formatNumber(row.productivityValue, 2)} ${row.productivityUnit || 'un/dia'}` : 'Nao informada'}
                              </div>
                              <div className="text-xs text-muted-foreground">{row.workingDaysPerWeek} dias/semana</div>
                            </div>
                          )}
                      </td>
                      <td className="p-2">
                        <div>{row.teamCount}</div>
                        {row.requiredTeams !== null && row.requiredTeams > row.teamCount && (
                          <div className="text-xs text-destructive">necessarias: {row.requiredTeams}</div>
                        )}
                      </td>
                      <td className="p-2">{row.totalPeople}</td>
                      <td className="p-2">
                        <div>{row.peakDemand > 0 ? formatNumber(row.peakDemand, 1) : 'Sem demanda'}</div>
                        <div className="text-xs text-muted-foreground">Base: {demandSourceLabel(row.demandSource)}</div>
                      </td>
                      <td className="p-2">
                        <Badge variant={capacityStatusVariant(row.status)}>
                          {capacityStatusLabel(row.status)}
                        </Badge>
                      </td>
                      <td className="p-2">{row.recommendation}</td>
                    </tr>
                  ))}
                  {frontCapacityRows.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={8}>
                        Nenhuma frente compartilhada cadastrada. Cadastre frentes em Produtividade e Equipes para obter diagnostico de capacidade.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Periodo</th>
                    <th className="p-2">Frente</th>
                    <th className="p-2">Demanda</th>
                    <th className="p-2">Capacidade</th>
                    <th className="p-2">Sobrecarga</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Base</th>
                    <th className="p-2">Servicos competindo</th>
                  </tr>
                </thead>
                <tbody>
                  {capacityModel.overloadDiagnostics.slice(0, 10).map((item) => (
                    <tr key={`${item.periodLabel}-${item.groupId ?? item.groupName}`} className="border-b last:border-0">
                      <td className="p-2">{item.periodLabel}</td>
                      <td className="p-2">{item.groupName}</td>
                      <td className="p-2">{formatNumber(item.plannedQuantity, 1)}</td>
                      <td className="p-2">{item.availableCapacity === null ? '-' : formatNumber(item.availableCapacity, 1)}</td>
                      <td className="p-2">
                        {item.overloadQuantity > 0
                          ? `${formatNumber(item.overloadQuantity, 1)} (${formatNumber(item.overloadPercent, 1)}%)`
                          : '-'}
                      </td>
                      <td className="p-2">
                        <Badge variant={capacityStatusVariant(item.status)}>
                          {capacityStatusLabel(item.status)}
                        </Badge>
                      </td>
                      <td className="p-2">{demandSourceLabel(item.demandSource)}</td>
                      <td className="p-2">{item.servicesCompetingForSameGroup.slice(0, 3).join(', ') || '-'}</td>
                    </tr>
                  ))}
                  {capacityModel.overloadDiagnostics.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={8}>
                        Nenhuma demanda semanal ou estrategica vinculada a frente compartilhada foi encontrada para calcular sobrecarga.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {sharedCapacityOverloads.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {sharedCapacityOverloads.length} periodo(s) com sobrecarga em frentes compartilhadas. A leitura e somente diagnostica e nao bloqueia o Planejamento Semanal.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            Simulador de capacidade
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Teste cenarios locais de equipe, produtividade e dias trabalhados por semana. Esta simulacao nao altera
            planejamento oficial, producao, diario, medicao, Gantt, Linha ou Planejamento Semanal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {frontCapacityRows.length === 0 ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Nenhuma frente compartilhada cadastrada. Cadastre frentes em Produtividade e Equipes para simular capacidade.
            </div>
          ) : selectedSimulationFront && selectedSimulationInput && simulatedCapacityResult ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="capacity-simulation-front">
                    Frente de trabalho
                  </label>
                  <select
                    id="capacity-simulation-front"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedSimulationFront.id}
                    onChange={(event) => setSelectedSimulationFrontId(event.target.value)}
                  >
                    {frontCapacityRows.map((front) => (
                      <option key={front.id} value={front.id}>
                        {front.name}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Servicos vinculados</p>
                    <p className="mt-1">
                      {selectedSimulationFront.services.map((service) => service.serviceName || service.scopeId || 'Servico').join(', ') || 'Nenhum servico vinculado'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {[
                    ['Capacidade atual', selectedSimulationFront.weeklyCapacity === null ? 'Sem produtividade' : `${formatNumber(selectedSimulationFront.weeklyCapacity, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`],
                    ['Demanda', simulatedCapacityResult.demand > 0 ? formatNumber(simulatedCapacityResult.demand, 1) : 'Sem demanda'],
                    ['Equipes atuais', selectedSimulationFront.teamCount],
                    ['Pessoas atuais', selectedSimulationFront.totalPeople],
                    ['Status atual', capacityStatusLabel(simulatedCapacityResult.currentStatus)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-semibold">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="simulated-team-count">
                    Equipes simultaneas simuladas
                  </label>
                  <input
                    id="simulated-team-count"
                    type="number"
                    min={1}
                    step={1}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedSimulationInput.teamCount}
                    onChange={(event) => updateSimulationInput('teamCount', Number(event.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="simulated-productivity">
                    Produtividade simulada
                  </label>
                  <input
                    id="simulated-productivity"
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedSimulationInput.productivityValue}
                    onChange={(event) => updateSimulationInput('productivityValue', Number(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Unidade: {selectedSimulationFront.productivityUnit || 'nao informada'}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="simulated-working-days">
                    Dias trabalhados por semana
                  </label>
                  <input
                    id="simulated-working-days"
                    type="number"
                    min={1}
                    max={7}
                    step={1}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={selectedSimulationInput.workingDaysPerWeek}
                    onChange={(event) => updateSimulationInput('workingDaysPerWeek', Number(event.target.value))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['Capacidade simulada', simulatedCapacityResult.simulatedCapacity === null ? 'Sem produtividade' : `${formatNumber(simulatedCapacityResult.simulatedCapacity, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`],
                  ['Sobra simulada', simulatedCapacityResult.simulatedCapacity === null ? '-' : formatNumber(simulatedCapacityResult.simulatedSurplus, 1)],
                  ['Sobrecarga simulada', simulatedCapacityResult.simulatedCapacity === null ? '-' : formatNumber(simulatedCapacityResult.simulatedOverload, 1)],
                  ['Pessoas adicionais', formatNumber(simulatedCapacityResult.additionalPeople, 0)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={capacityStatusVariant(simulatedCapacityResult.simulatedStatus)}>
                      {capacityStatusLabel(simulatedCapacityResult.simulatedStatus)}
                    </Badge>
                    {simulatedCapacityResult.additionalTeams > 0 && (
                      <span className="text-sm text-muted-foreground">
                        +{simulatedCapacityResult.additionalTeams} equipe(s) em relacao ao cenario atual
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{simulatedCapacityResult.recommendation}</p>
                </div>
                <Button type="button" variant="outline" onClick={resetSimulation}>
                  Restaurar cenario atual
                </Button>
              </div>

              {selectedSimulationFront.weeklyCapacity === null && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Cadastre produtividade da frente para comparar capacidade atual e simulada com mais confiabilidade.
                </div>
              )}
              {simulatedCapacityResult.demand <= 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Sem demanda suficiente para simular necessidade de equipe. O simulador continua disponivel para testar capacidade teorica.
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Dados incompletos para montar o simulador de capacidade.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Resumo por etapa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Etapa</th>
                  <th className="p-2">Servicos</th>
                  <th className="p-2">Planejado</th>
                  <th className="p-2">Realizado</th>
                  <th className="p-2">Saldo</th>
                  <th className="p-2">Desvio</th>
                  <th className="p-2">Criticos</th>
                  <th className="p-2">Sem produtividade</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {stageForecasts.slice(0, 14).map((stage) => (
                  <tr key={stage.macroId} className="border-b last:border-0">
                    <td className="p-2 font-medium">{stage.macroName}</td>
                    <td className="p-2">{stage.servicesCount}</td>
                    <td className="p-2">{formatNumber(stage.plannedQuantity)}</td>
                    <td className="p-2">{formatNumber(stage.realizedQuantity)}</td>
                    <td className="p-2">{formatNumber(stage.remainingQuantity)}</td>
                    <td className="p-2">{formatPercent(stage.deviation)}</td>
                    <td className="p-2">{stage.criticalServicesCount}</td>
                    <td className="p-2">{stage.missingProductivityCount}</td>
                    <td className="p-2">
                      <Badge variant={stageStatusVariant(stage.status)}>
                        {stageStatusLabel(stage.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {stageForecasts.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={9}>
                      Ainda nao ha etapas suficientes para montar o resumo executivo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Mao de obra prevista
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ['Equipes', totalLabor.teams],
                ['Profissionais', totalLabor.professionals],
                ['Auxiliares', totalLabor.helpers],
                ['Total pessoas', totalLabor.people],
                ['Sobrecargas', totalLabor.overloaded],
                ['Sem produtividade', totalLabor.missingProductivity],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{formatNumber(Number(value))}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Periodo</th>
                    <th className="p-2">Equipes</th>
                    <th className="p-2">Profissionais</th>
                    <th className="p-2">Auxiliares</th>
                    <th className="p-2">Total pessoas</th>
                    <th className="p-2">Sobrecargas</th>
                    <th className="p-2">Sem produtividade</th>
                  </tr>
                </thead>
                <tbody>
                  {laborDemandByPeriod.slice(0, 10).map((period) => (
                    <tr key={period.periodLabel} className="border-b last:border-0">
                      <td className="p-2">{period.periodLabel}</td>
                      <td className="p-2">{formatNumber(period.totalTeams)}</td>
                      <td className="p-2">{formatNumber(period.totalProfessionals)}</td>
                      <td className="p-2">{formatNumber(period.totalHelpers)}</td>
                      <td className="p-2">{formatNumber(period.totalPeople)}</td>
                      <td className="p-2">{period.overloadedServicesCount}</td>
                      <td className="p-2">{period.missingProductivityCount}</td>
                    </tr>
                  ))}
                  {laborDemandByPeriod.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                        Nenhuma meta semanal ou periodo com equipe suficiente para montar mao de obra prevista.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Curva planejado x realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Data/periodo</th>
                    <th className="p-2">Planejado</th>
                    <th className="p-2">Realizado</th>
                    <th className="p-2">Desvio</th>
                    <th className="p-2">Base</th>
                  </tr>
                </thead>
                <tbody>
                  {progressCurve.slice(0, 12).map((point) => (
                    <tr key={point.dateLabel} className="border-b last:border-0">
                      <td className="p-2">{point.dateLabel}</td>
                      <td className="p-2">{formatPercent(point.plannedProgress)}</td>
                      <td className="p-2">{formatPercent(point.realProgress)}</td>
                      <td className="p-2">{formatPercent(point.deviation)}</td>
                      <td className="p-2">{point.estimated ? 'Estimado' : 'Planejado'}</td>
                    </tr>
                  ))}
                  {progressCurve.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        Nao ha datas suficientes para montar uma curva historica confiavel.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Plano de acao recomendado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendedActions.map((action) => (
              <div key={action.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{action.title}</p>
                  <Badge variant={actionSeverityVariant(action.severity)}>
                    {actionSeverityLabel(action.severity)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
                {(action.relatedStage || action.relatedService) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[action.relatedStage, action.relatedService].filter(Boolean).join(' / ')}
                  </p>
                )}
              </div>
            ))}
            {recommendedActions.length === 0 && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Nenhuma acao recomendada foi gerada com os dados atuais.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Servicos criticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Etapa</th>
                    <th className="p-2">Servico</th>
                    <th className="p-2">Saldo</th>
                    <th className="p-2">Produtividade</th>
                    <th className="p-2">Equipe</th>
                    <th className="p-2">Duracao</th>
                    <th className="p-2">Risco</th>
                    <th className="p-2">Acao sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalItems.slice(0, 12).map((item) => {
                    const service = serviceForecasts.find((forecastItem) => `${forecastItem.macroName} / ${forecastItem.scopeName}` === item.service);
                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="p-2">{service?.macroName || '-'}</td>
                        <td className="p-2">{service?.scopeName || item.service}</td>
                        <td className="p-2">{formatNumber(service?.remainingQuantity)}</td>
                        <td className="p-2">
                          {service?.productivityValue
                            ? `${formatNumber(service.productivityValue, 2)} ${service.productivityUnit}`
                            : 'Sem produtividade'}
                        </td>
                        <td className="p-2">{service ? `${service.teamCount} equipe(s)` : '-'}</td>
                        <td className="p-2">{service?.estimatedDurationDays ?? '-'} dias</td>
                        <td className="p-2">{item.reason}</td>
                        <td className="p-2">{getRecommendedAction(item.reason, item.recommendedAction)}</td>
                      </tr>
                    );
                  })}
                  {criticalItems.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={8}>
                        Nenhum servico critico identificado com os dados atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Necessidade de equipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">Servico</th>
                    <th className="p-2">Meta</th>
                    <th className="p-2">Capacidade atual</th>
                    <th className="p-2">Equipes atuais</th>
                    <th className="p-2">Necessarias</th>
                    <th className="p-2">Diferenca</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamRequirements.slice(0, 16).map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-2">{item.scopeName}</td>
                      <td className="p-2">{formatNumber(item.plannedQuantity)}</td>
                      <td className="p-2">{item.capacityWithCurrentTeams === null ? '-' : formatNumber(item.capacityWithCurrentTeams, 1)}</td>
                      <td className="p-2">{item.currentTeams}</td>
                      <td className="p-2">{item.requiredTeams ?? '-'}</td>
                      <td className="p-2">{item.teamGap ?? '-'}</td>
                      <td className="p-2">
                        <Badge variant={item.status === 'overloaded' ? 'destructive' : item.status === 'missing_productivity' ? 'outline' : 'default'}>
                          {teamStatusLabel(item.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {teamRequirements.length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                        Nenhuma meta semanal encontrada para calcular necessidade de equipes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Servicos sem produtividade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Etapa</th>
                  <th className="p-2">Servico</th>
                  <th className="p-2">Motivo</th>
                  <th className="p-2">Acao</th>
                </tr>
              </thead>
              <tbody>
                {missingProductivity.slice(0, 20).map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">{item.macroName}</td>
                    <td className="p-2">{item.scopeName}</td>
                    <td className="p-2">Nao ha produtividade ativa para estimar o saldo.</td>
                    <td className="p-2">
                      <Button type="button" variant="outline" size="sm" disabled>
                        Cadastrar produtividade
                      </Button>
                    </td>
                  </tr>
                ))}
                {missingProductivity.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                      Todos os servicos com saldo possuem produtividade para esta previsao.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="print:shadow-none print:border-0 print-card" id="planning-executive-report">
        <CardContent className="space-y-6 p-6">
          <section className="print-section border-b pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground print-muted">ObraMap</p>
                <h1 className="mt-1 text-2xl font-bold">Relatorio Executivo de Planejamento e Previsao de Termino</h1>
                <p className="mt-2 text-sm text-muted-foreground print-muted">
                  Relatorio tecnico gerado automaticamente a partir dos dados disponiveis no Planejamento Inteligente.
                </p>
              </div>
              <Badge variant={statusVariant(forecastSummary.status)} className="w-fit">
                Situacao: {statusLabel(forecastSummary.status)}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <div><strong>Obra:</strong> {project.name}</div>
              <div><strong>Localizacao:</strong> {[project.location, project.municipio, project.estado].filter(Boolean).join(' / ') || 'Nao informado'}</div>
              <div><strong>Unidades/casas:</strong> {project.totalHouses || 'Nao informado'}</div>
              <div><strong>Empresa:</strong> {companyName || 'Nao informada'}</div>
              <div><strong>Data-base:</strong> {formatDate(new Date().toISOString())}</div>
              <div><strong>Emissao:</strong> {formatDateTime(generatedAt)}</div>
              <div><strong>Prazo planejado:</strong> {formatDate(forecastSummary.currentPlannedFinishDate)}</div>
              <div><strong>Previsao atual:</strong> {forecastSummary.estimatedFinishDate ? formatDate(forecastSummary.estimatedFinishDate) : 'Indisponivel'}</div>
            </div>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">1. Resumo executivo</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              {[
                ['Progresso planejado', formatPercent(forecastSummary.plannedProgress)],
                ['Progresso realizado', formatPercent(forecastSummary.realProgress)],
                ['Desvio', formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)],
                ['Previsao de termino', forecastSummary.estimatedFinishDate ? formatDate(forecastSummary.estimatedFinishDate) : 'Indisponivel'],
                ['Situacao', statusLabel(forecastSummary.status)],
                ['Servicos criticos', criticalItems.length],
                ['Sem produtividade', forecastSummary.missingProductivityCount],
                ['Confiabilidade', confidence.label],
              ].map(([label, value]) => (
                <div key={String(label)} className="print-card rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground print-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground print-muted">
              Confiabilidade: {confidence.label} - {confidence.reason}
            </p>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">2. Resumo por etapa</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servicos</th>
                  <th>Planejado</th>
                  <th>Realizado</th>
                  <th>Saldo</th>
                  <th>Desvio</th>
                  <th>Criticos</th>
                  <th>Sem prod.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stageForecasts.slice(0, 10).map((stage) => (
                  <tr key={stage.macroId}>
                    <td>{stage.macroName}</td>
                    <td>{stage.servicesCount}</td>
                    <td>{formatNumber(stage.plannedQuantity)}</td>
                    <td>{formatNumber(stage.realizedQuantity)}</td>
                    <td>{formatNumber(stage.remainingQuantity)}</td>
                    <td>{formatPercent(stage.deviation)}</td>
                    <td>{stage.criticalServicesCount}</td>
                    <td>{stage.missingProductivityCount}</td>
                    <td>{stageStatusLabel(stage.status)}</td>
                  </tr>
                ))}
                {stageForecasts.length === 0 && (
                  <tr><td colSpan={9}>Nao ha etapas suficientes para o resumo por etapa.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">3. Mao de obra prevista</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th>Equipes</th>
                  <th>Profissionais</th>
                  <th>Auxiliares</th>
                  <th>Total pessoas</th>
                  <th>Sobrecargas</th>
                  <th>Sem produtividade</th>
                </tr>
              </thead>
              <tbody>
                {laborDemandByPeriod.slice(0, 10).map((period) => (
                  <tr key={period.periodLabel}>
                    <td>{period.periodLabel}</td>
                    <td>{formatNumber(period.totalTeams)}</td>
                    <td>{formatNumber(period.totalProfessionals)}</td>
                    <td>{formatNumber(period.totalHelpers)}</td>
                    <td>{formatNumber(period.totalPeople)}</td>
                    <td>{period.overloadedServicesCount}</td>
                    <td>{period.missingProductivityCount}</td>
                  </tr>
                ))}
                {laborDemandByPeriod.length === 0 && (
                  <tr><td colSpan={7}>Nao ha metas por periodo suficientes para calcular mao de obra prevista.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">4. Capacidade por frente de trabalho</h2>
            <p className="mt-2 text-sm text-muted-foreground print-muted">
              As frentes compartilhadas indicam a capacidade real das equipes responsaveis por multiplos servicos.
              O diagnostico nao altera producao, diario, medicao ou planejamento oficial; serve para apoiar decisao
              de reforco de equipe ou replanejamento.
            </p>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Frente</th>
                  <th>Servicos vinculados</th>
                  <th>Capacidade semanal</th>
                  <th>Equipes atuais</th>
                  <th>Pessoas</th>
                  <th>Demanda prevista</th>
                  <th>Status</th>
                  <th>Recomendacao</th>
                </tr>
              </thead>
              <tbody>
                {frontCapacityRows.slice(0, 10).map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      {row.services.slice(0, 3).map((service) => service.serviceName || service.scopeId || 'Servico').join(', ')}
                      {row.services.length > 3 ? ` +${row.services.length - 3}` : ''}
                    </td>
                    <td>
                      {row.weeklyCapacity === null
                        ? 'Sem produtividade'
                        : `${formatNumber(row.weeklyCapacity, 1)} ${row.weeklyCapacityUnit}`}
                    </td>
                    <td>{row.requiredTeams !== null && row.requiredTeams > row.teamCount ? `${row.teamCount} / necessarias ${row.requiredTeams}` : row.teamCount}</td>
                    <td>{row.totalPeople}</td>
                    <td>
                      {row.peakDemand > 0 ? formatNumber(row.peakDemand, 1) : 'Sem demanda'}
                      {' '}({demandSourceLabel(row.demandSource)})
                    </td>
                    <td>{capacityStatusLabel(row.status)}</td>
                    <td>{row.recommendation}</td>
                  </tr>
                ))}
                {frontCapacityRows.length === 0 && (
                  <tr><td colSpan={8}>Nenhuma frente compartilhada cadastrada para diagnostico de capacidade.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          {selectedSimulationFront && selectedSimulationInput && simulatedCapacityResult && (
            <section className="print-section">
              <h2 className="text-lg font-semibold">5. Cenario simulado de capacidade</h2>
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                Este cenario e apenas uma simulacao local e nao altera o planejamento oficial, producao, diario,
                medicao, Gantt, Linha de Balanco ou Planejamento Semanal.
              </p>
              <table className="print-table mt-3 w-full text-sm">
                <tbody>
                  <tr>
                    <th>Frente simulada</th>
                    <td>{selectedSimulationFront.name}</td>
                    <th>Status simulado</th>
                    <td>{capacityStatusLabel(simulatedCapacityResult.simulatedStatus)}</td>
                  </tr>
                  <tr>
                    <th>Capacidade atual</th>
                    <td>
                      {simulatedCapacityResult.currentCapacity === null
                        ? 'Sem produtividade cadastrada'
                        : `${formatNumber(simulatedCapacityResult.currentCapacity, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`}
                    </td>
                    <th>Demanda considerada</th>
                    <td>
                      {simulatedCapacityResult.demand > 0
                        ? formatNumber(simulatedCapacityResult.demand, 1)
                        : 'Sem demanda suficiente para comparacao'}
                    </td>
                  </tr>
                  <tr>
                    <th>Equipes atuais</th>
                    <td>{selectedSimulationFront.teamCount}</td>
                    <th>Equipes simuladas</th>
                    <td>{selectedSimulationInput.teamCount}</td>
                  </tr>
                  <tr>
                    <th>Produtividade simulada</th>
                    <td>
                      {selectedSimulationInput.productivityValue > 0
                        ? `${formatNumber(selectedSimulationInput.productivityValue, 2)} ${selectedSimulationFront.productivityUnit || 'unidade'}`
                        : 'Sem produtividade cadastrada para simulacao'}
                    </td>
                    <th>Dias trabalhados simulados</th>
                    <td>{selectedSimulationInput.workingDaysPerWeek}</td>
                  </tr>
                  <tr>
                    <th>Capacidade semanal simulada</th>
                    <td>
                      {simulatedCapacityResult.simulatedCapacity === null
                        ? 'Sem produtividade cadastrada para simulacao'
                        : `${formatNumber(simulatedCapacityResult.simulatedCapacity, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`}
                    </td>
                    <th>Pessoas adicionais estimadas</th>
                    <td>{formatNumber(simulatedCapacityResult.additionalPeople, 0)}</td>
                  </tr>
                  <tr>
                    <th>Sobrecarga ou sobra simulada</th>
                    <td colSpan={3}>
                      {simulatedCapacityResult.simulatedCapacity === null
                        ? 'Sem produtividade cadastrada para simulacao'
                        : simulatedCapacityResult.simulatedOverload > 0
                          ? `Sobrecarga de ${formatNumber(simulatedCapacityResult.simulatedOverload, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`
                          : simulatedCapacityResult.simulatedSurplus > 0
                            ? `Sobra de ${formatNumber(simulatedCapacityResult.simulatedSurplus, 1)} ${selectedSimulationFront.weeklyCapacityUnit}`
                            : 'Capacidade simulada igual a demanda considerada'}
                    </td>
                  </tr>
                  <tr>
                    <th>Recomendacao simulada</th>
                    <td colSpan={3}>{simulatedCapacityResult.recommendation}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section className="print-section">
            <h2 className="text-lg font-semibold">6. Curva planejado x realizado</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Data/periodo</th>
                  <th>Planejado</th>
                  <th>Realizado</th>
                  <th>Desvio</th>
                  <th>Base</th>
                </tr>
              </thead>
              <tbody>
                {progressCurve.slice(0, 10).map((point) => (
                  <tr key={point.dateLabel}>
                    <td>{point.dateLabel}</td>
                    <td>{formatPercent(point.plannedProgress)}</td>
                    <td>{formatPercent(point.realProgress)}</td>
                    <td>{formatPercent(point.deviation)}</td>
                    <td>{point.estimated ? 'Estimado' : 'Planejado'}</td>
                  </tr>
                ))}
                {progressCurve.length === 0 && (
                  <tr><td colSpan={5}>Nao ha datas suficientes para gerar curva historica confiavel.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">7. Plano de acao recomendado</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Acao</th>
                  <th>Descricao</th>
                  <th>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {recommendedActions.slice(0, 8).map((action) => (
                  <tr key={action.id}>
                    <td>{actionSeverityLabel(action.severity)}</td>
                    <td>{action.title}</td>
                    <td>{action.description}</td>
                    <td>{[action.relatedStage, action.relatedService].filter(Boolean).join(' / ') || '-'}</td>
                  </tr>
                ))}
                {recommendedActions.length === 0 && (
                  <tr><td colSpan={4}>Nenhuma acao recomendada foi gerada com os dados atuais.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">8. Analise de prazo</h2>
            <p className="mt-2 text-sm text-muted-foreground print-muted">
              {forecastSummary.estimatedFinishDate
                ? `Com base nos dados disponiveis ate a data-base, produtividade cadastrada, Macrofluxo e saldo de servicos pendentes, a previsao atual de termino da obra e ${formatDate(forecastSummary.estimatedFinishDate)}.`
                : 'Previsao de termino: Indisponivel. Configure o Macrofluxo para estimar prazo final com sequencia oficial.'}
            </p>
            {forecastSummary.delayDays !== null && forecastSummary.delayDays > 0 && (
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A previsao indica atraso estimado de {forecastSummary.delayDays} dia(s) em relacao ao prazo planejado.
              </p>
            )}
            {forecastSummary.status === 'insufficient_data' && (
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A previsao possui confiabilidade limitada porque faltam Macrofluxo, produtividade cadastrada ou datas planejadas suficientes.
              </p>
            )}
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">9. Servicos criticos</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Saldo</th>
                  <th>Produtividade</th>
                  <th>Equipe atual</th>
                  <th>Duracao</th>
                  <th>Risco</th>
                  <th>Acao recomendada</th>
                </tr>
              </thead>
              <tbody>
                {criticalItems.slice(0, 10).map((item) => {
                  const service = serviceForecasts.find((forecastItem) => `${forecastItem.macroName} / ${forecastItem.scopeName}` === item.service);
                  return (
                    <tr key={item.id}>
                      <td>{service?.macroName || '-'}</td>
                      <td>{service?.scopeName || item.service}</td>
                      <td>{formatNumber(service?.remainingQuantity)}</td>
                      <td>{service?.productivityValue ? `${formatNumber(service.productivityValue, 2)} ${service.productivityUnit}` : 'Sem produtividade'}</td>
                      <td>{service ? `${service.teamCount} equipe(s)` : '-'}</td>
                      <td>{service?.estimatedDurationDays ?? '-'} dias</td>
                      <td>{item.reason}</td>
                      <td>{getRecommendedAction(item.reason, item.recommendedAction)}</td>
                    </tr>
                  );
                })}
                {criticalItems.length === 0 && (
                  <tr><td colSpan={8}>Nenhum servico critico identificado.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">10. Necessidade de equipes</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Meta periodo/semana</th>
                  <th>Capacidade atual</th>
                  <th>Equipes atuais</th>
                  <th>Equipes necessarias</th>
                  <th>Diferenca</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamRequirements.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>{item.macroName}</td>
                    <td>{item.scopeName}</td>
                    <td>{formatNumber(item.plannedQuantity)}</td>
                    <td>{item.capacityWithCurrentTeams === null ? '-' : formatNumber(item.capacityWithCurrentTeams, 1)}</td>
                    <td>{item.currentTeams}</td>
                    <td>{item.requiredTeams ?? '-'}</td>
                    <td>{item.teamGap ?? '-'}</td>
                    <td>{teamStatusLabel(item.status)}</td>
                  </tr>
                ))}
                {teamRequirements.length === 0 && (
                  <tr><td colSpan={8}>Nenhuma meta semanal encontrada para calcular necessidade de equipes.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">11. Servicos sem produtividade</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Servico</th>
                  <th>Impacto</th>
                  <th>Acao recomendada</th>
                </tr>
              </thead>
              <tbody>
                {missingProductivity.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>{item.macroName}</td>
                    <td>{item.scopeName}</td>
                    <td>Reduz a confiabilidade da previsao e impede estimar duracao do saldo.</td>
                    <td>Cadastrar produtividade do servico.</td>
                  </tr>
                ))}
                {missingProductivity.length === 0 && (
                  <tr><td colSpan={4}>Nao ha servicos pendentes sem produtividade nesta previsao.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">12. Desvios e justificativas</h2>
            <table className="print-table mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Servico/meta</th>
                  <th>Casa/unidade</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th>Responsavel</th>
                  <th>Observacoes</th>
                </tr>
              </thead>
              <tbody>
                {deviations.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>{item.weeklyPlanServiceId || item.plannedProductionId || 'Meta nao identificada'}</td>
                    <td>{[...item.missingHouseIds, ...item.executedHouseIds, ...item.outOfPlanHouseIds].slice(0, 8).join(', ') || '-'}</td>
                    <td>{item.reason || 'Sem motivo informado'}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>Nao informado</td>
                    <td>{item.notes || 'Sem observacoes'}</td>
                  </tr>
                ))}
                {deviations.length === 0 && (
                  <tr><td colSpan={6}>Nao ha desvios registrados para o periodo analisado.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="print-section grid gap-3 md:grid-cols-2">
            <div className="print-card rounded-lg border p-3">
              <h2 className="text-base font-semibold">13. Gantt resumido</h2>
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                O cronograma detalhado encontra-se disponivel na aba Gantt do Planejamento Inteligente.
              </p>
            </div>
            <div className="print-card rounded-lg border p-3">
              <h2 className="text-base font-semibold">14. Linha de Balanco</h2>
              <p className="mt-2 text-sm text-muted-foreground print-muted">
                A Linha de Balanco detalhada encontra-se disponivel na aba Linha de Balanco do Planejamento Inteligente.
              </p>
            </div>
          </section>

          <section className="print-section">
            <h2 className="text-lg font-semibold">15. Conclusao tecnica</h2>
            <p className="mt-2 text-sm text-muted-foreground print-muted">
              Com base nos dados disponiveis ate a data-base, a obra apresenta progresso realizado de {formatPercent(forecastSummary.realProgress)}
              frente a {formatPercent(forecastSummary.plannedProgress)} planejado, resultando em desvio de {formatPercent(forecastSummary.realProgress - forecastSummary.plannedProgress)}.
              A previsao estimada de termino e {forecastSummary.estimatedFinishDate ? formatDate(forecastSummary.estimatedFinishDate) : 'indisponivel ate configurar o Macrofluxo'} e a situacao geral e {statusLabel(forecastSummary.status).toLowerCase()}.
              Os principais pontos de atencao concentram-se em {criticalStagesText}, com servicos criticos como {getTopRisksText(criticalItems)}.
              Recomenda-se revisar produtividade, reforcar equipes nos servicos com capacidade insuficiente e reprogramar saldos pendentes nos proximos periodos.
              A previsao deve ser interpretada com confiabilidade {confidence.label.toLowerCase()}, pois {confidence.reason.toLowerCase()}
            </p>
          </section>

          <section className="print-section mt-10 grid gap-6 md:grid-cols-2">
            <div className="border-t pt-3 text-sm text-muted-foreground print-muted">
              Responsavel tecnico / assinatura
            </div>
            <div className="border-t pt-3 text-sm text-muted-foreground print-muted">
              Contratante / fiscalizacao
            </div>
          </section>

          <div className="print-footer">
            Relatorio gerado automaticamente pelo ObraMap em {formatDateTime(generatedAt)}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
