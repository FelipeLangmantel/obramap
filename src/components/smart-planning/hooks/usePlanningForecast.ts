import { useEffect, useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, isValid, parseISO, startOfDay } from 'date-fns';

import { useAuth } from '@/contexts/AuthContext';
import type { Project } from '@/contexts/ConstructionContext';
import { supabase } from '@/integrations/supabase/client';
import type {
  PlanningDeviationView,
  PlanningOfficialViewResult,
  PlanningWorkPackageView,
} from './usePlanningOfficialView';

export type ForecastStatus = 'on_track' | 'attention' | 'delayed' | 'insufficient_data';
export type TeamRequirementStatus = 'ok' | 'overloaded' | 'missing_productivity';
export type StageForecastStatus = 'ok' | 'attention' | 'delayed' | 'missing_data';
export type RecommendedActionSeverity = 'info' | 'warning' | 'critical';

export interface ServiceForecast {
  id: string;
  macroId: string | null;
  macroName: string;
  scopeId: string | null;
  scopeName: string;
  plannedQuantity: number;
  realizedQuantity: number;
  remainingQuantity: number;
  productivityValue: number | null;
  productivityUnit: string | null;
  teamCount: number;
  professionalsPerTeam: number;
  helpersPerTeam: number;
  estimatedDurationDays: number | null;
  estimatedStartDate: string | null;
  estimatedFinishDate: string | null;
  status: ForecastStatus;
  riskReason: string;
}

export interface TeamRequirement {
  id: string;
  macroName: string;
  scopeName: string;
  periodLabel: string;
  startDate: string | null;
  endDate: string | null;
  plannedQuantity: number;
  capacityWithCurrentTeams: number | null;
  requiredTeams: number | null;
  currentTeams: number;
  professionals: number;
  helpers: number;
  totalPeople: number;
  teamGap: number | null;
  status: TeamRequirementStatus;
}

export interface CriticalPlanningItem {
  id: string;
  service: string;
  reason: string;
  impactDays: number;
  recommendedAction: string;
}

export interface ForecastSummary {
  totalServices: number;
  plannedProgress: number;
  realProgress: number;
  remainingServices: number;
  missingProductivityCount: number;
  estimatedFinishDate: string | null;
  currentPlannedFinishDate: string | null;
  delayDays: number | null;
  status: ForecastStatus;
}

export interface StageForecast {
  macroId: string | null;
  macroName: string;
  plannedQuantity: number;
  realizedQuantity: number;
  remainingQuantity: number;
  plannedProgress: number;
  realProgress: number;
  deviation: number;
  servicesCount: number;
  criticalServicesCount: number;
  missingProductivityCount: number;
  estimatedDurationDays: number | null;
  estimatedFinishDate: string | null;
  status: StageForecastStatus;
}

export interface LaborDemandService {
  macroName: string;
  scopeName: string;
  plannedQuantity: number;
  currentTeams: number;
  requiredTeams: number | null;
  professionals: number;
  helpers: number;
  totalPeople: number;
  status: TeamRequirementStatus;
}

export interface LaborDemandByPeriod {
  periodLabel: string;
  startDate: string | null;
  endDate: string | null;
  totalTeams: number;
  totalProfessionals: number;
  totalHelpers: number;
  totalPeople: number;
  overloadedServicesCount: number;
  missingProductivityCount: number;
  services: LaborDemandService[];
}

export interface ProgressCurvePoint {
  dateLabel: string;
  plannedProgress: number;
  realProgress: number;
  deviation: number;
  estimated: boolean;
}

export interface RecommendedAction {
  id: string;
  title: string;
  description: string;
  severity: RecommendedActionSeverity;
  relatedService?: string;
  relatedStage?: string;
}

export interface PlanningForecastResult {
  forecastSummary: ForecastSummary;
  serviceForecasts: ServiceForecast[];
  stageForecasts: StageForecast[];
  teamRequirements: TeamRequirement[];
  laborDemandByPeriod: LaborDemandByPeriod[];
  progressCurve: ProgressCurvePoint[];
  criticalItems: CriticalPlanningItem[];
  recommendedActions: RecommendedAction[];
  deviations: PlanningDeviationView[];
  loading: boolean;
}

type ProductivityConfig = {
  macroId: string | null;
  scopeId: string | null;
  value: number;
  unit: string;
  workingDaysPerWeek: number;
  teamCount: number;
  professionalsPerTeam: number;
  helpersPerTeam: number;
  source: 'project' | 'default';
};

const serviceKey = (macroId: string | null | undefined, scopeId: string | null | undefined) =>
  `${macroId || 'sem_macro'}::${scopeId || 'sem_servico'}`;

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = parseISO(value);
  if (isValid(parsed)) return startOfDay(parsed);
  const fallback = new Date(value);
  return isValid(fallback) ? startOfDay(fallback) : null;
};

const toIsoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const getDailyProductivity = (productivity: ProductivityConfig | null | undefined) => {
  if (!productivity || productivity.value <= 0) return null;
  const unit = (productivity.unit || '').toLowerCase();
  if (unit.includes('semana')) {
    return productivity.value / Math.max(productivity.workingDaysPerWeek || 5, 1);
  }
  if (unit.includes('mes')) {
    return productivity.value / 22;
  }
  return productivity.value;
};

const getLatestDate = (packages: PlanningWorkPackageView[]) => {
  const dates = packages
    .map((pkg) => parseDate(pkg.plannedEndDate))
    .filter((date): date is Date => !!date)
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0] || null;
};

const getProgress = (realized: number, planned: number) => {
  if (planned <= 0) return 0;
  return Math.min(100, Math.max(0, (realized / planned) * 100));
};

const getStageStatus = (
  missingProductivityCount: number,
  criticalServicesCount: number,
  deviation: number
): StageForecastStatus => {
  if (missingProductivityCount > 0) return 'missing_data';
  if (criticalServicesCount > 0 || deviation < -15) return 'delayed';
  if (deviation < -5) return 'attention';
  return 'ok';
};

export function usePlanningForecast(
  projectId: string | undefined,
  officialView: PlanningOfficialViewResult,
  project: Project | null | undefined
): PlanningForecastResult {
  const { company } = useAuth();
  const [productivities, setProductivities] = useState<ProductivityConfig[]>([]);
  const [loadingProductivities, setLoadingProductivities] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProductivities = async () => {
      if (!projectId) {
        setProductivities([]);
        return;
      }

      setLoadingProductivities(true);
      try {
        const [projectResult, defaultResult] = await Promise.all([
          supabase
            .from('project_service_productivity' as any)
            .select('*')
            .eq('project_id', projectId)
            .eq('is_active', true),
          company?.id
            ? supabase
              .from('service_productivities')
              .select('*')
              .eq('company_id', company.id)
            : Promise.resolve({ data: [], error: null }),
        ]);

        const projectRows = ((projectResult.data as any[]) || []).map((row): ProductivityConfig => ({
          macroId: row.macro_id || null,
          scopeId: row.scope_id || null,
          value: toNumber(row.productivity_value),
          unit: row.productivity_unit || 'un/dia',
          workingDaysPerWeek: toNumber(row.working_days_per_week, 5),
          teamCount: Math.max(1, toNumber(row.default_team_count, 1)),
          professionalsPerTeam: toNumber(row.professionals_per_team, 0),
          helpersPerTeam: toNumber(row.helpers_per_team, 0),
          source: 'project',
        }));

        const defaultRows = ((defaultResult.data as any[]) || []).map((row): ProductivityConfig => ({
          macroId: row.macro_id || null,
          scopeId: row.scope_id || null,
          value: toNumber(row.base_productivity),
          unit: row.productivity_unit || 'un/dia',
          workingDaysPerWeek: 5,
          teamCount: 1,
          professionalsPerTeam: 0,
          helpersPerTeam: 0,
          source: 'default',
        }));

        const byService = new Map<string, ProductivityConfig>();
        defaultRows.forEach((item) => byService.set(serviceKey(item.macroId, item.scopeId), item));
        projectRows.forEach((item) => byService.set(serviceKey(item.macroId, item.scopeId), item));

        if (!cancelled) setProductivities(Array.from(byService.values()));
      } catch (error) {
        console.error('[Planning Forecast] failed to load productivities', error);
        if (!cancelled) setProductivities([]);
      } finally {
        if (!cancelled) setLoadingProductivities(false);
      }
    };

    void loadProductivities();
    return () => {
      cancelled = true;
    };
  }, [company?.id, projectId]);

  return useMemo(() => {
    const officialPackages = Array.isArray(officialView.officialPackages) ? officialView.officialPackages : [];
    const weeklyTargets = Array.isArray(officialView.weeklyTargets) ? officialView.weeklyTargets : [];
    const deviations = Array.isArray(officialView.deviations) ? officialView.deviations : [];
    const productivityByService = new Map(productivities.map((item) => [serviceKey(item.macroId, item.scopeId), item]));

    const grouped = new Map<string, PlanningWorkPackageView[]>();
    officialPackages.forEach((pkg) => {
      grouped.set(serviceKey(pkg.macroId, pkg.scopeId), [...(grouped.get(serviceKey(pkg.macroId, pkg.scopeId)) || []), pkg]);
    });

    const today = startOfDay(new Date());
    let cursor = today;
    const serviceForecasts = Array.from(grouped.entries())
      .map(([key, packages]) => {
        const first = packages[0];
        const productivity = productivityByService.get(key) || null;
        const dailyProductivity = getDailyProductivity(productivity);
        const teamCount = Math.max(1, productivity?.teamCount || first.teamCount || 1);
        const plannedQuantity = packages.reduce((sum, pkg) => sum + toNumber(pkg.plannedQuantity), 0);
        const realizedQuantity = Math.min(
          plannedQuantity,
          packages.reduce((sum, pkg) => sum + toNumber(pkg.realizedQuantity), 0)
        );
        const remainingQuantity = Math.max(
          0,
          packages.reduce((sum, pkg) => sum + toNumber(pkg.remainingQuantity), 0)
        );
        const estimatedDurationDays = dailyProductivity
          ? Math.max(0, Math.ceil(remainingQuantity / Math.max(dailyProductivity * teamCount, 0.01)))
          : null;
        const estimatedStartDate = remainingQuantity > 0 ? cursor : null;
        const estimatedFinishDate = estimatedDurationDays !== null && remainingQuantity > 0
          ? addDays(cursor, Math.max(estimatedDurationDays - 1, 0))
          : null;

        if (estimatedDurationDays !== null && remainingQuantity > 0) {
          cursor = addDays(estimatedFinishDate || cursor, 1);
        }

        const currentPlannedFinish = getLatestDate(packages);
        const impactDays = estimatedFinishDate && currentPlannedFinish
          ? differenceInCalendarDays(estimatedFinishDate, currentPlannedFinish)
          : 0;
        const status: ForecastStatus = !dailyProductivity && remainingQuantity > 0
          ? 'insufficient_data'
          : impactDays > 7
            ? 'delayed'
            : impactDays > 0 || remainingQuantity > 0
              ? 'attention'
              : 'on_track';
        const riskReason = status === 'insufficient_data'
          ? 'Sem produtividade cadastrada para estimar prazo.'
          : status === 'delayed'
            ? `Previsão indica ${impactDays} dia(s) além do planejamento atual.`
            : remainingQuantity > 0
              ? 'Existe saldo a executar com base no planejamento atual.'
              : 'Serviço sem saldo relevante.';

        return {
          id: key,
          macroId: first.macroId,
          macroName: first.macroName || 'Etapa não informada',
          scopeId: first.scopeId,
          scopeName: first.scopeName || 'Serviço não informado',
          plannedQuantity,
          realizedQuantity,
          remainingQuantity,
          productivityValue: productivity?.value || null,
          productivityUnit: productivity?.unit || null,
          teamCount,
          professionalsPerTeam: productivity?.professionalsPerTeam || 0,
          helpersPerTeam: productivity?.helpersPerTeam || 0,
          estimatedDurationDays,
          estimatedStartDate: toIsoDate(estimatedStartDate),
          estimatedFinishDate: toIsoDate(estimatedFinishDate),
          status,
          riskReason,
        } satisfies ServiceForecast;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.estimatedStartDate)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bDate = parseDate(b.estimatedStartDate)?.getTime() || Number.MAX_SAFE_INTEGER;
        return aDate - bDate || a.macroName.localeCompare(b.macroName) || a.scopeName.localeCompare(b.scopeName);
      });

    const totalPlanned = serviceForecasts.reduce((sum, item) => sum + item.plannedQuantity, 0);
    const totalRealized = serviceForecasts.reduce((sum, item) => sum + item.realizedQuantity, 0);
    const totalRemaining = serviceForecasts.reduce((sum, item) => sum + item.remainingQuantity, 0);
    const plannedProgress = project?.startDate && project?.expectedEndDate
      ? Math.min(100, Math.max(0, (differenceInCalendarDays(today, parseDate(project.startDate) || today) / Math.max(1, differenceInCalendarDays(parseDate(project.expectedEndDate) || today, parseDate(project.startDate) || today))) * 100))
      : 0;
    const realProgress = totalPlanned > 0 ? Math.min(100, Math.max(0, (totalRealized / totalPlanned) * 100)) : 0;
    const currentPlannedFinishDate = toIsoDate(getLatestDate(officialPackages) || parseDate(project?.expectedEndDate));
    const estimatedFinishDate = serviceForecasts
      .map((item) => parseDate(item.estimatedFinishDate))
      .filter((date): date is Date => !!date)
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
    const delayDays = estimatedFinishDate && currentPlannedFinishDate
      ? differenceInCalendarDays(estimatedFinishDate, parseDate(currentPlannedFinishDate) || estimatedFinishDate)
      : null;
    const missingProductivityCount = serviceForecasts.filter((item) => item.remainingQuantity > 0 && !item.productivityValue).length;
    const forecastStatus: ForecastStatus = missingProductivityCount > 0
      ? 'insufficient_data'
      : delayDays !== null && delayDays > 7
        ? 'delayed'
        : delayDays !== null && delayDays > 0
          ? 'attention'
          : 'on_track';

    const teamRequirements = weeklyTargets.map((target) => {
      const productivity = productivityByService.get(serviceKey(target.macroId, target.scopeId)) || null;
      const dailyProductivity = getDailyProductivity(productivity);
      const currentTeams = Math.max(1, productivity?.teamCount || 1);
      const weekDays = Math.max(1, productivity?.workingDaysPerWeek || 5);
      const plannedQuantity = target.plannedHouses || target.plannedHouseIds.length || 0;
      const capacityWithCurrentTeams = dailyProductivity ? dailyProductivity * currentTeams * weekDays : null;
      const requiredTeams = dailyProductivity
        ? Math.max(1, Math.ceil(plannedQuantity / Math.max(dailyProductivity * weekDays, 0.01)))
        : null;
      const teamGap = requiredTeams !== null ? Math.max(0, requiredTeams - currentTeams) : null;
      const professionals = productivity?.professionalsPerTeam
        ? productivity.professionalsPerTeam * (requiredTeams || currentTeams)
        : 0;
      const helpers = productivity?.helpersPerTeam
        ? productivity.helpersPerTeam * (requiredTeams || currentTeams)
        : 0;
      const status: TeamRequirementStatus = !dailyProductivity
        ? 'missing_productivity'
        : teamGap && teamGap > 0
          ? 'overloaded'
          : 'ok';
      return {
        id: target.id,
        macroName: target.macroName || 'Etapa não informada',
        scopeName: target.scopeName || 'Serviço não informado',
        periodLabel: [target.weekStartDate, target.weekEndDate].filter(Boolean).join(' - ') || 'Semana sem data',
        startDate: target.weekStartDate,
        endDate: target.weekEndDate,
        plannedQuantity,
        capacityWithCurrentTeams,
        requiredTeams,
        currentTeams,
        professionals,
        helpers,
        totalPeople: professionals + helpers,
        teamGap,
        status,
      } satisfies TeamRequirement;
    });

    const criticalItems: CriticalPlanningItem[] = [
      ...serviceForecasts
        .filter((item) => item.status === 'delayed' || item.status === 'insufficient_data')
        .slice(0, 12)
        .map((item) => ({
          id: `service-${item.id}`,
          service: `${item.macroName} / ${item.scopeName}`,
          reason: item.riskReason,
          impactDays: item.estimatedFinishDate && currentPlannedFinishDate
            ? Math.max(0, differenceInCalendarDays(parseDate(item.estimatedFinishDate) || today, parseDate(currentPlannedFinishDate) || today))
            : 0,
          recommendedAction: item.status === 'insufficient_data'
            ? 'Cadastrar produtividade e composição de equipe.'
            : 'Revisar equipe, predecessoras e sequência executiva.',
        })),
      ...teamRequirements
        .filter((item) => item.status === 'overloaded')
        .slice(0, 8)
        .map((item) => ({
          id: `team-${item.id}`,
          service: `${item.macroName} / ${item.scopeName}`,
          reason: `Meta acima da capacidade atual em ${item.teamGap} equipe(s).`,
          impactDays: 0,
          recommendedAction: 'Revisar metas semanais ou reforçar equipe.',
        })),
    ];

    const servicesByStage = new Map<string, ServiceForecast[]>();
    serviceForecasts.forEach((service) => {
      const key = service.macroId || service.macroName;
      servicesByStage.set(key, [...(servicesByStage.get(key) || []), service]);
    });

    const stageForecasts: StageForecast[] = Array.from(servicesByStage.values())
      .map((items) => {
        const first = items[0];
        const plannedQuantity = items.reduce((sum, item) => sum + item.plannedQuantity, 0);
        const realizedQuantity = items.reduce((sum, item) => sum + item.realizedQuantity, 0);
        const remainingQuantity = items.reduce((sum, item) => sum + item.remainingQuantity, 0);
        const realStageProgress = getProgress(realizedQuantity, plannedQuantity);
        const stageCriticalCount = items.filter((item) => item.status === 'delayed' || item.status === 'insufficient_data').length;
        const stageMissingProductivity = items.filter((item) => item.remainingQuantity > 0 && !item.productivityValue).length;
        const durationValues = items
          .map((item) => item.estimatedDurationDays)
          .filter((value): value is number => value !== null);
        const estimatedFinish = items
          .map((item) => parseDate(item.estimatedFinishDate))
          .filter((date): date is Date => !!date)
          .sort((a, b) => b.getTime() - a.getTime())[0] || null;
        const deviation = realStageProgress - plannedProgress;

        return {
          macroId: first.macroId,
          macroName: first.macroName,
          plannedQuantity,
          realizedQuantity,
          remainingQuantity,
          plannedProgress,
          realProgress: realStageProgress,
          deviation,
          servicesCount: items.length,
          criticalServicesCount: stageCriticalCount,
          missingProductivityCount: stageMissingProductivity,
          estimatedDurationDays: durationValues.length
            ? durationValues.reduce((sum, value) => sum + value, 0)
            : null,
          estimatedFinishDate: toIsoDate(estimatedFinish),
          status: getStageStatus(stageMissingProductivity, stageCriticalCount, deviation),
        } satisfies StageForecast;
      })
      .sort((a, b) => {
        const statusPriority: Record<StageForecastStatus, number> = {
          delayed: 1,
          missing_data: 2,
          attention: 3,
          ok: 4,
        };
        return statusPriority[a.status] - statusPriority[b.status] || a.macroName.localeCompare(b.macroName);
      });

    const laborPeriodMap = new Map<string, TeamRequirement[]>();
    teamRequirements.forEach((requirement) => {
      laborPeriodMap.set(requirement.periodLabel, [...(laborPeriodMap.get(requirement.periodLabel) || []), requirement]);
    });

    const laborDemandByPeriod: LaborDemandByPeriod[] = Array.from(laborPeriodMap.entries())
      .map(([periodLabel, items]) => {
        const startDate = items
          .map((item) => parseDate(item.startDate))
          .filter((date): date is Date => !!date)
          .sort((a, b) => a.getTime() - b.getTime())[0] || null;
        const endDate = items
          .map((item) => parseDate(item.endDate))
          .filter((date): date is Date => !!date)
          .sort((a, b) => b.getTime() - a.getTime())[0] || null;

        return {
          periodLabel,
          startDate: toIsoDate(startDate),
          endDate: toIsoDate(endDate),
          totalTeams: items.reduce((sum, item) => sum + (item.requiredTeams || item.currentTeams), 0),
          totalProfessionals: items.reduce((sum, item) => sum + item.professionals, 0),
          totalHelpers: items.reduce((sum, item) => sum + item.helpers, 0),
          totalPeople: items.reduce((sum, item) => sum + item.totalPeople, 0),
          overloadedServicesCount: items.filter((item) => item.status === 'overloaded').length,
          missingProductivityCount: items.filter((item) => item.status === 'missing_productivity').length,
          services: items.map((item) => ({
            macroName: item.macroName,
            scopeName: item.scopeName,
            plannedQuantity: item.plannedQuantity,
            currentTeams: item.currentTeams,
            requiredTeams: item.requiredTeams,
            professionals: item.professionals,
            helpers: item.helpers,
            totalPeople: item.totalPeople,
            status: item.status,
          })),
        } satisfies LaborDemandByPeriod;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.startDate)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bDate = parseDate(b.startDate)?.getTime() || Number.MAX_SAFE_INTEGER;
        return aDate - bDate || a.periodLabel.localeCompare(b.periodLabel);
      });

    const datedPackages = officialPackages
      .map((pkg) => ({ pkg, date: parseDate(pkg.plannedEndDate || pkg.plannedStartDate) }))
      .filter((item): item is { pkg: PlanningWorkPackageView; date: Date } => !!item.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const progressCurve: ProgressCurvePoint[] = datedPackages.length
      ? datedPackages.map((item, index) => {
        const packagesUntilDate = datedPackages.slice(0, index + 1).map((entry) => entry.pkg);
        const plannedUntilDate = packagesUntilDate.reduce((sum, pkg) => sum + toNumber(pkg.plannedQuantity), 0);
        const realizedUntilDate = packagesUntilDate.reduce((sum, pkg) => sum + toNumber(pkg.realizedQuantity), 0);
        const plannedCurveProgress = getProgress(plannedUntilDate, totalPlanned);
        const realCurveProgress = getProgress(realizedUntilDate, totalPlanned);
        return {
          dateLabel: toIsoDate(item.date) || 'Sem data',
          plannedProgress: plannedCurveProgress,
          realProgress: realCurveProgress,
          deviation: realCurveProgress - plannedCurveProgress,
          estimated: false,
        };
      })
      : [{
        dateLabel: toIsoDate(today) || 'Data-base',
        plannedProgress,
        realProgress,
        deviation: realProgress - plannedProgress,
        estimated: true,
      }];

    const recommendedActions: RecommendedAction[] = [
      ...(missingProductivityCount > 0 ? [{
        id: 'missing-productivity',
        title: 'Cadastrar produtividade dos servicos pendentes.',
        description: `${missingProductivityCount} servico(s) com saldo nao possuem produtividade ativa para estimar prazo e equipes.`,
        severity: 'critical' as RecommendedActionSeverity,
      }] : []),
      ...(teamRequirements.some((item) => item.status === 'overloaded') ? [{
        id: 'team-overload',
        title: 'Reforcar equipe em servicos com capacidade insuficiente.',
        description: `${teamRequirements.filter((item) => item.status === 'overloaded').length} meta(s) semanais exigem mais equipes do que a capacidade atual.`,
        severity: 'warning' as RecommendedActionSeverity,
      }] : []),
      ...(criticalItems.length > 0 ? [{
        id: 'critical-balance',
        title: 'Reprogramar saldo dos servicos criticos.',
        description: 'Priorize os servicos criticos no proximo periodo e revise a sequencia executiva.',
        severity: 'warning' as RecommendedActionSeverity,
        relatedService: criticalItems[0]?.service,
      }] : []),
      ...(stageForecasts.some((stage) => stage.status === 'delayed' || stage.status === 'missing_data') ? [{
        id: 'critical-stages',
        title: 'Revisar etapas com maior desvio.',
        description: 'As etapas com atraso ou dados insuficientes devem ser revisadas antes de enviar replanejamento oficial.',
        severity: 'warning' as RecommendedActionSeverity,
        relatedStage: stageForecasts.find((stage) => stage.status === 'delayed' || stage.status === 'missing_data')?.macroName,
      }] : []),
      ...(progressCurve.some((point) => point.estimated) ? [{
        id: 'date-confidence',
        title: 'Validar datas planejadas para aumentar confiabilidade.',
        description: 'A curva planejado x realizado esta estimada porque faltam datas suficientes nos pacotes.',
        severity: 'info' as RecommendedActionSeverity,
      }] : []),
    ];

    return {
      forecastSummary: {
        totalServices: serviceForecasts.length,
        plannedProgress,
        realProgress,
        remainingServices: serviceForecasts.filter((item) => item.remainingQuantity > 0).length,
        missingProductivityCount,
        estimatedFinishDate: toIsoDate(estimatedFinishDate),
        currentPlannedFinishDate,
        delayDays,
        status: forecastStatus,
      },
      serviceForecasts,
      stageForecasts,
      teamRequirements,
      laborDemandByPeriod,
      progressCurve,
      criticalItems,
      recommendedActions,
      deviations,
      loading: loadingProductivities || officialView.loading,
    };
  }, [loadingProductivities, officialView, productivities, project]);
}
