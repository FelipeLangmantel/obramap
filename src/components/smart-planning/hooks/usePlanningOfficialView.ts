import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';

import { useAuth } from '@/contexts/AuthContext';
import { useConstruction } from '@/contexts/ConstructionContext';
import { supabase } from '@/integrations/supabase/client';

export type PlanningPackageUnitType = 'house' | 'quadra' | 'group' | 'project';

export type PlanningPackageSource =
  | 'service_planning_by_period'
  | 'planning_stages'
  | 'planned_productions'
  | 'weekly_plan_services';

export type PlanningPackageStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'estimated';

export type PlanningDiagnosticSeverity = 'info' | 'warning' | 'critical';

export interface PlanningWorkPackageView {
  id: string;
  projectId: string;
  planningVersionId: string | null;
  macroId: string | null;
  macroName: string | null;
  scopeId: string | null;
  scopeName: string | null;
  unitType: PlanningPackageUnitType;
  houseIds: number[];
  unitLabel: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  durationDays: number | null;
  teamCount: number | null;
  productivityValue: number | null;
  productivityUnit: string | null;
  plannedQuantity: number;
  realizedQuantity: number;
  plannedProgress: number;
  realProgress: number;
  remainingQuantity: number;
  status: PlanningPackageStatus;
  source: PlanningPackageSource;
  predecessorId: string | null;
  lagDays: number | null;
  estimated: boolean;
}

export interface PlanningOfficialViewDiagnostic {
  id: string;
  severity: PlanningDiagnosticSeverity;
  type:
    | 'missing_productivity'
    | 'real_production_without_package'
    | 'package_without_house'
    | 'duplicated_service'
    | 'weekly_plan_without_package'
    | 'strategic_without_operational_detail'
    | 'missing_dates';
  message: string;
  macroId?: string | null;
  scopeId?: string | null;
  source?: string;
  refId?: string;
}

export interface PlanningOfficialViewResult {
  packages: PlanningWorkPackageView[];
  planningDiagnostics: PlanningOfficialViewDiagnostic[];
  loading: boolean;
  reload: () => Promise<void>;
}

type PlanningOfficialViewRows = {
  versions: any[];
  periods: any[];
  servicePlans: any[];
  weeklyPlanServices: any[];
  plannedProductions: any[];
  stages: any[];
  weeklyProductions: any[];
  productions: any[];
  productionDeviations: any[];
  houses: any[];
  quadras: any[];
  projectProductivities: any[];
  defaultProductivities: any[];
  planningTeams: any[];
};

const getServiceKey = (macroId: string | null | undefined, scopeId: string | null | undefined) =>
  `${macroId || 'sem_macro'}::${scopeId || 'sem_servico'}`;

const getHouseNumbers = (rows: any[]) =>
  rows
    .map((house) => Number(house.house_number || house.id))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

const normalizeDate = (value: string | null | undefined) => value || null;

const getDurationDays = (start: string | null, end: string | null) => {
  if (!start || !end) return null;
  return Math.max(1, differenceInDays(startOfDay(parseISO(end)), startOfDay(parseISO(start))) + 1);
};

const getProgress = (done: number, total: number) => {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (done / total) * 100));
};

const intersects = (source: number[], target: number[]) => {
  if (!source.length || !target.length) return [];
  const sourceSet = new Set(source);
  return target.filter((value) => sourceSet.has(value));
};

const uniqueNumbers = (values: number[]) => Array.from(new Set(values)).sort((a, b) => a - b);

const getStatus = (
  plannedStartDate: string | null,
  plannedEndDate: string | null,
  realProgress: number,
  estimated: boolean
): PlanningPackageStatus => {
  if (realProgress >= 100) return 'completed';
  if (realProgress > 0) return 'in_progress';
  if (estimated) return 'estimated';
  if (plannedEndDate && startOfDay(new Date()) > startOfDay(parseISO(plannedEndDate))) return 'delayed';
  if (plannedStartDate && startOfDay(new Date()) >= startOfDay(parseISO(plannedStartDate))) return 'in_progress';
  return 'planned';
};

const buildOfficialView = (
  projectId: string,
  rows: PlanningOfficialViewRows,
  currentProject: ReturnType<typeof useConstruction>['currentProject']
) => {
  const diagnostics: PlanningOfficialViewDiagnostic[] = [];
  const activeVersion = rows.versions.find((version) => version.is_active) || rows.versions[0] || null;
  const allHouseNumbers = rows.houses.length
    ? getHouseNumbers(rows.houses)
    : Array.from({ length: currentProject?.totalHouses || 0 }, (_, index) => index + 1);

  const productivityByService = new Map<string, any>();
  rows.defaultProductivities.forEach((productivity) => {
    productivityByService.set(getServiceKey(productivity.macro_id, productivity.scope_id), {
      value: Number(productivity.base_productivity) || null,
      unit: productivity.productivity_type || 'casas/dia',
      source: 'service_productivities',
    });
  });
  rows.projectProductivities.forEach((productivity) => {
    if (productivity.is_active === false) return;
    productivityByService.set(getServiceKey(productivity.macro_id, productivity.scope_id), {
      value: Number(productivity.productivity_value) || null,
      unit: productivity.productivity_unit || 'casas/dia',
      source: 'project_service_productivity',
      teamCount: Number(productivity.default_team_count) || null,
    });
  });

  const productionByService = new Map<string, number[]>();
  const productionCountByService = new Map<string, number>();
  [...rows.productions, ...rows.weeklyProductions].forEach((production) => {
    if (production.deleted_at) return;
    const key = getServiceKey(production.macro_id, production.scope_id);
    const houses = (production.house_ids || []).map(Number).filter(Number.isFinite);
    productionByService.set(key, uniqueNumbers([...(productionByService.get(key) || []), ...houses]));
    productionCountByService.set(key, (productionCountByService.get(key) || 0) + (Number(production.houses_count) || houses.length || 0));
  });

  const makePackage = ({
    id,
    planningVersionId,
    macroId,
    macroName,
    scopeId,
    scopeName,
    unitType,
    houseIds,
    unitLabel,
    plannedStartDate,
    plannedEndDate,
    teamCount,
    productivityValue,
    productivityUnit,
    plannedQuantity,
    source,
    predecessorId,
    lagDays,
    estimated,
  }: Omit<PlanningWorkPackageView, 'projectId' | 'durationDays' | 'realizedQuantity' | 'plannedProgress' | 'realProgress' | 'remainingQuantity' | 'status'>): PlanningWorkPackageView => {
    const serviceKey = getServiceKey(macroId, scopeId);
    const producedHouses = productionByService.get(serviceKey) || [];
    const matchingHouses = houseIds.length ? intersects(producedHouses, houseIds) : [];
    const realizedQuantity = houseIds.length
      ? matchingHouses.length
      : Math.min(plannedQuantity, productionCountByService.get(serviceKey) || 0);
    const realProgress = getProgress(realizedQuantity, plannedQuantity);
    const plannedProgress = plannedStartDate && plannedEndDate
      ? getProgress(
          Math.max(0, differenceInDays(startOfDay(new Date()), startOfDay(parseISO(plannedStartDate))) + 1),
          getDurationDays(plannedStartDate, plannedEndDate) || plannedQuantity
        )
      : 0;

    return {
      id,
      projectId,
      planningVersionId,
      macroId,
      macroName,
      scopeId,
      scopeName,
      unitType,
      houseIds,
      unitLabel,
      plannedStartDate,
      plannedEndDate,
      durationDays: getDurationDays(plannedStartDate, plannedEndDate),
      teamCount,
      productivityValue,
      productivityUnit,
      plannedQuantity,
      realizedQuantity,
      plannedProgress,
      realProgress,
      remainingQuantity: Math.max(0, plannedQuantity - realizedQuantity),
      status: getStatus(plannedStartDate, plannedEndDate, realProgress, estimated),
      source,
      predecessorId,
      lagDays,
      estimated,
    };
  };

  const packages: PlanningWorkPackageView[] = [];

  if (rows.servicePlans.length > 0) {
    rows.servicePlans.forEach((plan) => {
      const productivity = productivityByService.get(getServiceKey(plan.macro_id, plan.scope_id));
      const targetHouses = Number(plan.target_houses) || 0;
      const houseIds = targetHouses > 0 && targetHouses === allHouseNumbers.length ? allHouseNumbers : [];
      const plannedQuantity = targetHouses || houseIds.length || allHouseNumbers.length || 1;

      packages.push(makePackage({
        id: `service-period:${plan.id}`,
        planningVersionId: activeVersion?.id || null,
        macroId: plan.macro_id,
        macroName: plan.macro_name,
        scopeId: plan.scope_id,
        scopeName: plan.scope_name,
        unitType: houseIds.length ? 'project' : 'group',
        houseIds,
        unitLabel: houseIds.length ? 'Todas as casas da obra' : `${plannedQuantity} unidade(s) planejada(s)`,
        plannedStartDate: normalizeDate(plan.planned_start_date),
        plannedEndDate: normalizeDate(plan.planned_end_date),
        teamCount: Number(plan.team_count || plan.teams_planned) || productivity?.teamCount || null,
        productivityValue: Number(plan.productivity_per_team || plan.productivity_planned) || productivity?.value || null,
        productivityUnit: plan.unit_label || productivity?.unit || null,
        plannedQuantity,
        source: 'service_planning_by_period',
        predecessorId: null,
        lagDays: null,
        estimated: !houseIds.length,
      }));
    });
  } else {
    rows.stages.forEach((stage) => {
      const productivity = productivityByService.get(getServiceKey(stage.macro_id, stage.scope_id));
      const plannedQuantity = allHouseNumbers.length || 1;
      packages.push(makePackage({
        id: `stage:${stage.id}`,
        planningVersionId: stage.version_id || activeVersion?.id || null,
        macroId: stage.macro_id,
        macroName: stage.name,
        scopeId: stage.scope_id,
        scopeName: stage.scope_id ? stage.name : null,
        unitType: 'project',
        houseIds: allHouseNumbers,
        unitLabel: 'Todas as casas da obra',
        plannedStartDate: null,
        plannedEndDate: null,
        teamCount: Number(stage.planned_teams) || productivity?.teamCount || null,
        productivityValue: Number(stage.planned_productivity) || productivity?.value || null,
        productivityUnit: stage.unit_label || productivity?.unit || null,
        plannedQuantity,
        source: 'planning_stages',
        predecessorId: stage.depends_on || null,
        lagDays: Number(stage.latency_days) || null,
        estimated: true,
      }));
    });
  }

  if (packages.length === 0 && rows.plannedProductions.length > 0) {
    rows.plannedProductions.forEach((planned) => {
      const houseIds = (planned.planned_house_ids || []).map(Number).filter(Number.isFinite);
      const productivity = productivityByService.get(getServiceKey(planned.macro_id, planned.scope_id));
      packages.push(makePackage({
        id: `planned-production:${planned.id}`,
        planningVersionId: activeVersion?.id || null,
        macroId: planned.macro_id,
        macroName: planned.macro_name,
        scopeId: planned.scope_id,
        scopeName: planned.scope_name,
        unitType: houseIds.length ? 'group' : 'project',
        houseIds,
        unitLabel: planned.week_start && planned.week_end
          ? `Semana ${planned.week_start} - ${planned.week_end}`
          : `${planned.planned_houses || houseIds.length || 0} casa(s)`,
        plannedStartDate: normalizeDate(planned.week_start),
        plannedEndDate: normalizeDate(planned.week_end),
        teamCount: productivity?.teamCount || null,
        productivityValue: productivity?.value || null,
        productivityUnit: productivity?.unit || null,
        plannedQuantity: Number(planned.planned_houses) || houseIds.length || 1,
        source: 'planned_productions',
        predecessorId: null,
        lagDays: null,
        estimated: !houseIds.length,
      }));
    });
  }

  const packageKeys = new Set(packages.map((pkg) => getServiceKey(pkg.macroId, pkg.scopeId)));
  const serviceCount = new Map<string, number>();
  packages.forEach((pkg) => {
    const key = getServiceKey(pkg.macroId, pkg.scopeId);
    serviceCount.set(key, (serviceCount.get(key) || 0) + 1);
    if (!pkg.productivityValue) {
      diagnostics.push({
        id: `missing-productivity:${pkg.id}`,
        severity: 'warning',
        type: 'missing_productivity',
        message: `Pacote sem produtividade cadastrada: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      });
    }
    if (!pkg.houseIds.length) {
      diagnostics.push({
        id: `without-house:${pkg.id}`,
        severity: 'info',
        type: 'package_without_house',
        message: `Pacote sem casas especificas; progresso sera estimado: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      });
    }
    if (!pkg.plannedStartDate || !pkg.plannedEndDate) {
      diagnostics.push({
        id: `missing-dates:${pkg.id}`,
        severity: 'warning',
        type: 'missing_dates',
        message: `Pacote sem datas planejadas: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      });
    }
  });

  serviceCount.forEach((count, key) => {
    if (count > 1) {
      const [macroId, scopeId] = key.split('::');
      diagnostics.push({
        id: `duplicate:${key}`,
        severity: 'warning',
        type: 'duplicated_service',
        message: `Servico aparece em ${count} pacote(s) virtuais. Verificar se e detalhamento real ou duplicidade.`,
        macroId,
        scopeId,
      });
    }
  });

  productionByService.forEach((_, key) => {
    if (!packageKeys.has(key)) {
      const [macroId, scopeId] = key.split('::');
      diagnostics.push({
        id: `real-without-package:${key}`,
        severity: 'critical',
        type: 'real_production_without_package',
        message: 'Producao real encontrada sem pacote planejado correspondente.',
        macroId,
        scopeId,
        source: 'productions/weekly_productions',
      });
    }
  });

  rows.weeklyPlanServices.forEach((weekly) => {
    const key = getServiceKey(weekly.macro_id, weekly.scope_id);
    if (!packageKeys.has(key)) {
      diagnostics.push({
        id: `weekly-without-package:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_plan_without_package',
        message: `Planejamento semanal sem pacote oficial correspondente: ${weekly.macro_name} / ${weekly.scope_name}`,
        macroId: weekly.macro_id,
        scopeId: weekly.scope_id,
        source: 'weekly_plan_services',
        refId: weekly.id,
      });
    }
  });

  if (rows.stages.length > 0 && rows.servicePlans.length === 0) {
    diagnostics.push({
      id: 'strategic-without-operational-detail',
      severity: 'info',
      type: 'strategic_without_operational_detail',
      message: 'Planejamento estrategico existe, mas ainda nao ha detalhamento operacional por periodo/pacote.',
      source: 'planning_stages',
    });
  }

  return { packages, planningDiagnostics: diagnostics };
};

export function usePlanningOfficialView(projectId: string | undefined): PlanningOfficialViewResult {
  const { company } = useAuth();
  const { currentProject } = useConstruction();
  const [rows, setRows] = useState<PlanningOfficialViewRows | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) {
      setRows(null);
      return;
    }

    setLoading(true);
    try {
      const [
        versions,
        periods,
        servicePlans,
        weeklyPlanServices,
        plannedProductions,
        stages,
        weeklyProductions,
        productions,
        productionDeviations,
        houses,
        quadras,
        projectProductivities,
        defaultProductivities,
        planningTeams,
      ] = await Promise.all([
        supabase.from('planning_versions').select('*').eq('project_id', projectId).order('version_number', { ascending: false }),
        supabase.from('planning_periods').select('*').eq('project_id', projectId).order('start_date', { ascending: true }),
        supabase.from('service_planning_by_period').select('*').eq('project_id', projectId).order('macro_order', { ascending: true }).order('scope_order', { ascending: true }),
        supabase.from('weekly_plan_services').select('*').eq('project_id', projectId),
        supabase.from('planned_productions').select('*').eq('project_id', projectId),
        supabase.from('planning_stages').select('*').eq('project_id', projectId).order('sequence_order', { ascending: true }),
        supabase.from('weekly_productions').select('*').eq('project_id', projectId),
        supabase.from('productions').select('*').eq('project_id', projectId),
        supabase.from('production_deviations').select('*').eq('project_id', projectId),
        supabase.from('houses').select('id, house_number, quadra_id').eq('project_id', projectId).order('house_number', { ascending: true }),
        supabase.from('quadras').select('*').eq('project_id', projectId).order('display_order', { ascending: true }),
        supabase.from('project_service_productivity' as any).select('*').eq('project_id', projectId),
        company?.id
          ? supabase.from('service_productivities').select('*').eq('company_id', company.id)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('planning_teams').select('*').eq('project_id', projectId),
      ]);

      const queryError = [
        versions,
        periods,
        servicePlans,
        weeklyPlanServices,
        plannedProductions,
        stages,
        weeklyProductions,
        productions,
        productionDeviations,
        houses,
        quadras,
        projectProductivities,
        defaultProductivities,
        planningTeams,
      ].find((result: any) => result.error)?.error;

      if (queryError) throw queryError;

      setRows({
        versions: versions.data || [],
        periods: periods.data || [],
        servicePlans: servicePlans.data || [],
        weeklyPlanServices: weeklyPlanServices.data || [],
        plannedProductions: plannedProductions.data || [],
        stages: stages.data || [],
        weeklyProductions: weeklyProductions.data || [],
        productions: productions.data || [],
        productionDeviations: productionDeviations.data || [],
        houses: houses.data || [],
        quadras: quadras.data || [],
        projectProductivities: (projectProductivities.data as any[]) || [],
        defaultProductivities: defaultProductivities.data || [],
        planningTeams: planningTeams.data || [],
      });
    } catch (error) {
      console.error('[Planning Official View Diagnostic] load failed', error);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [company?.id, projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const view = useMemo(() => {
    if (!projectId || !rows) {
      return { packages: [], planningDiagnostics: [] };
    }
    return buildOfficialView(projectId, rows, currentProject);
  }, [currentProject, projectId, rows]);

  useEffect(() => {
    if (!rows || !import.meta.env.DEV) return;
    console.info('[Planning Official View Diagnostic]', {
      packages: view.packages.length,
      diagnostics: view.planningDiagnostics,
      sources: {
        servicePlans: rows.servicePlans.length,
        planningStages: rows.stages.length,
        weeklyPlanServices: rows.weeklyPlanServices.length,
        plannedProductions: rows.plannedProductions.length,
        productions: rows.productions.length,
        weeklyProductions: rows.weeklyProductions.length,
      },
    });
  }, [rows, view.packages.length, view.planningDiagnostics]);

  return {
    packages: view.packages,
    planningDiagnostics: view.planningDiagnostics,
    loading,
    reload,
  };
}
