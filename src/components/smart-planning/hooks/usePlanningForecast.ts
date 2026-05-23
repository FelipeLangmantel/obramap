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
  plannedQuantity: number;
  capacityWithCurrentTeams: number | null;
  requiredTeams: number | null;
  currentTeams: number;
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

export interface PlanningForecastResult {
  forecastSummary: ForecastSummary;
  serviceForecasts: ServiceForecast[];
  teamRequirements: TeamRequirement[];
  criticalItems: CriticalPlanningItem[];
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
        plannedQuantity,
        capacityWithCurrentTeams,
        requiredTeams,
        currentTeams,
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
      teamRequirements,
      criticalItems,
      deviations,
      loading: loadingProductivities || officialView.loading,
    };
  }, [loadingProductivities, officialView, productivities, project]);
}
