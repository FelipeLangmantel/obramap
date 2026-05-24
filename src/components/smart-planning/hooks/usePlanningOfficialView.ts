import { useCallback, useEffect, useMemo, useState } from 'react';
import { differenceInDays, isValid, isWithinInterval, parseISO, startOfDay } from 'date-fns';

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

export type WeeklyTargetStatus =
  | 'cumprida'
  | 'parcial'
  | 'nao_cumprida'
  | 'excedida'
  | 'sem_lancamento';

export type ActualProductionSource = 'diary' | 'direct_production' | 'initial_bank';
export type ActualProductionOriginTable = 'weekly_productions' | 'productions';
export type PlanningDiagnosticSeverity = 'info' | 'warning' | 'critical';

export interface PlanningWorkPackageView {
  id: string;
  projectId: string;
  planningVersionId: string | null;
  periodId?: string | null;
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
  occurrenceCount?: number;
  duplicateIds?: string[];
}

export interface WeeklyTargetView {
  id: string;
  projectId: string;
  weekId: string | null;
  periodId: string | null;
  macroId: string | null;
  macroName: string | null;
  scopeId: string | null;
  scopeName: string | null;
  plannedHouseIds: number[];
  plannedHouses: number;
  contractorId: string | null;
  contractorName: string | null;
  contractorHouseIds: number[];
  contractorHouses: number;
  outOfContractHouseIds: number[];
  weekStartDate: string | null;
  weekEndDate: string | null;
  status: WeeklyTargetStatus;
  linkedPackageIds: string[];
  estimatedPackageMatch: boolean;
  executedHouseIds: number[];
  missingHouseIds: number[];
  outOfPlanHouseIds: number[];
  completionPercent: number;
}

export interface ActualProductionView {
  id: string;
  projectId: string;
  weeklyPlanServiceId: string | null;
  macroId: string | null;
  macroName: string | null;
  scopeId: string | null;
  scopeName: string | null;
  houseIds: number[];
  productionDate: string | null;
  weekStartDate: string | null;
  weekEndDate: string | null;
  source: ActualProductionSource;
  originTable: ActualProductionOriginTable;
  isInitialBank: boolean;
  progress: number | null;
  quantity: number | null;
  countsForProgress: boolean;
  countsForWeeklyPerformance: boolean;
  countsForProductivity: boolean;
  countsForDeviation: boolean;
  estimatedWeeklyMatch: boolean;
  diaryEntryId: string | null;
  diaryItemId: string | null;
}

export interface PlanningDeviationView {
  id: string;
  projectId: string;
  weeklyPlanServiceId: string | null;
  plannedProductionId: string | null;
  macroId: string | null;
  scopeId: string | null;
  missingHouseIds: number[];
  executedHouseIds: number[];
  outOfPlanHouseIds: number[];
  reason: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface PlanningDiagnostic {
  id: string;
  severity: PlanningDiagnosticSeverity;
  type:
    | 'missing_productivity'
    | 'real_production_without_package'
    | 'package_without_house'
    | 'duplicated_service'
    | 'service_distributed_across_periods'
    | 'weekly_plan_without_package'
    | 'strategic_without_operational_detail'
    | 'missing_dates'
    | 'weekly_target_without_official_package'
    | 'weekly_target_without_contractor'
    | 'weekly_target_not_completed'
    | 'weekly_target_partially_completed'
    | 'weekly_target_exceeded'
    | 'production_without_weekly_target'
    | 'deviation_without_reason'
    | 'weekly_target_with_out_of_contract_houses'
    | 'official_package_without_weekly_target'
    | 'service_with_remaining_balance'
    | 'initial_bank_counted_as_weekly_performance'
    | 'production_without_source_classification'
    | 'diary_production_without_weekly_target'
    | 'direct_production_without_weekly_target'
    | 'initial_bank_without_reference_date'
    | 'duplicated_actual_production_risk'
    | 'weekly_target_unmatched_but_possible_production_found';
  message: string;
  projectId?: string | null;
  macroId?: string | null;
  scopeId?: string | null;
  houseIds?: number[];
  relatedIds?: string[];
  occurrenceCount?: number;
  exampleIds?: string[];
  source?: string;
  refId?: string;
}

export type PlanningOfficialViewDiagnostic = PlanningDiagnostic;

export interface PlanningOfficialViewResult {
  officialPackages: PlanningWorkPackageView[];
  weeklyTargets: WeeklyTargetView[];
  actualProductions: ActualProductionView[];
  deviations: PlanningDeviationView[];
  diagnostics: PlanningDiagnostic[];
  packages: PlanningWorkPackageView[];
  planningDiagnostics: PlanningDiagnostic[];
  loading: boolean;
  reload: () => Promise<void>;
}

type PlanningOfficialViewRows = {
  versions: any[];
  periods: any[];
  servicePlans: any[];
  weeklyPlanWeeks: any[];
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

const normalizeId = (value: string | null | undefined) => value || null;

const normalizeDate = (value: string | null | undefined) => value || null;

const getSafeDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = parseISO(value);
  if (isValid(parsed)) return startOfDay(parsed);
  const fallback = new Date(value);
  return isValid(fallback) ? startOfDay(fallback) : null;
};

const getNumericArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(Number).filter(Number.isFinite)
    : [];

const getHouseNumbers = (rows: any[]) =>
  rows
    .map((house) => Number(house.house_number || house.id))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

const getDurationDays = (start: string | null, end: string | null) => {
  const startDate = getSafeDate(start);
  const endDate = getSafeDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(1, differenceInDays(endDate, startDate) + 1);
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

const getPackagePriority = (source: PlanningPackageSource) => {
  const priorities: Record<PlanningPackageSource, number> = {
    service_planning_by_period: 1,
    planning_stages: 2,
    planned_productions: 3,
    weekly_plan_services: 4,
  };
  return priorities[source] || 99;
};

const getPackageDedupKey = (pkg: PlanningWorkPackageView) => [
  pkg.projectId,
  pkg.planningVersionId || 'sem_versao',
  pkg.periodId || 'sem_periodo',
  pkg.macroId || 'sem_macro',
  pkg.scopeId || 'sem_servico',
  pkg.houseIds.join(',') || 'sem_casas',
  pkg.plannedStartDate || 'sem_inicio',
  pkg.plannedEndDate || 'sem_fim',
  pkg.plannedQuantity,
].join('|');

const dedupeOfficialPackages = (packages: PlanningWorkPackageView[]) => {
  const grouped = new Map<string, PlanningWorkPackageView[]>();
  packages.forEach((pkg) => {
    const key = getPackageDedupKey(pkg);
    grouped.set(key, [...(grouped.get(key) || []), pkg]);
  });

  return Array.from(grouped.values()).map((items) => {
    const sorted = [...items].sort((a, b) => getPackagePriority(a.source) - getPackagePriority(b.source));
    const selected = sorted[0];
    if (items.length === 1) return selected;
    return {
      ...selected,
      occurrenceCount: items.length,
      duplicateIds: items.map((item) => item.id),
    };
  });
};

const groupDiagnostics = (diagnostics: PlanningDiagnostic[]) => {
  const severityPriority: Record<PlanningDiagnosticSeverity, number> = {
    critical: 1,
    warning: 2,
    info: 3,
  };
  const grouped = new Map<string, PlanningDiagnostic[]>();
  diagnostics.forEach((diagnostic) => {
    const key = [
      diagnostic.severity,
      diagnostic.type,
      diagnostic.projectId || 'sem_projeto',
      diagnostic.macroId || 'sem_macro',
      diagnostic.scopeId || 'sem_servico',
      diagnostic.source || 'sem_fonte',
    ].join('|');
    grouped.set(key, [...(grouped.get(key) || []), diagnostic]);
  });

  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const allHouseIds = uniqueNumbers(items.flatMap((item) => item.houseIds || []));
      const allRelatedIds = Array.from(new Set(items.flatMap((item) => item.relatedIds || []).filter(Boolean)));
      const exampleIds = items.map((item) => item.refId || item.id).filter(Boolean).slice(0, 5);
      return {
        ...first,
        id: items.length > 1 ? `grouped:${first.severity}:${first.type}:${first.macroId || 'sem_macro'}:${first.scopeId || 'sem_servico'}:${first.source || 'sem_fonte'}` : first.id,
        message: items.length > 1 ? `${first.message} (${items.length} ocorrencias agrupadas)` : first.message,
        houseIds: allHouseIds.length ? allHouseIds.slice(0, 30) : first.houseIds,
        relatedIds: allRelatedIds,
        occurrenceCount: items.length,
        exampleIds,
      };
    })
    .sort((a, b) => {
      const severityDelta = severityPriority[a.severity] - severityPriority[b.severity];
      if (severityDelta !== 0) return severityDelta;
      return (b.occurrenceCount || 1) - (a.occurrenceCount || 1);
    });
};

const isDateWithinRange = (dateValue: string | null, start: string | null, end: string | null) => {
  const date = getSafeDate(dateValue);
  const startDate = getSafeDate(start);
  const endDate = getSafeDate(end);
  if (!date || !startDate || !endDate) return false;
  return isWithinInterval(date, {
    start: startDate,
    end: endDate,
  });
};

const hasHouseMatch = (source: number[], target: number[]) => {
  if (!source.length || !target.length) return true;
  return intersects(source, target).length > 0;
};

const getStatus = (
  plannedStartDate: string | null,
  plannedEndDate: string | null,
  realProgress: number,
  estimated: boolean
): PlanningPackageStatus => {
  if (realProgress >= 100) return 'completed';
  if (realProgress > 0) return 'in_progress';
  if (estimated) return 'estimated';
  const today = startOfDay(new Date());
  const endDate = getSafeDate(plannedEndDate);
  const startDate = getSafeDate(plannedStartDate);
  if (endDate && today > endDate) return 'delayed';
  if (startDate && today >= startDate) return 'in_progress';
  return 'planned';
};

const getActualSource = (row: any): ActualProductionSource | null => {
  if (row.is_initial_database) return 'initial_bank';
  if (row.diary_entry_id || row.diary_item_id || row.daily_work_log_id) return 'diary';
  return 'direct_production';
};

const makeDiagnostic = (
  diagnostic: Omit<PlanningDiagnostic, 'relatedIds' | 'houseIds'> & {
    relatedIds?: (string | null | undefined)[];
    houseIds?: number[];
  }
): PlanningDiagnostic => ({
  ...diagnostic,
  relatedIds: (diagnostic.relatedIds || []).filter(Boolean) as string[],
  houseIds: diagnostic.houseIds ? uniqueNumbers(diagnostic.houseIds) : undefined,
});

const buildActualProductions = (
  projectId: string,
  rows: PlanningOfficialViewRows,
  diagnostics: PlanningDiagnostic[]
) => {
  const actualProductions: ActualProductionView[] = [];

  const addActual = (row: any, originTable: ActualProductionOriginTable) => {
    if (row.deleted_at) return;
    const source = getActualSource(row);
    if (!source) {
      diagnostics.push(makeDiagnostic({
        id: `production-source:${originTable}:${row.id}`,
        severity: 'warning',
        type: 'production_without_source_classification',
        message: 'Lancamento de producao sem classificacao clara de origem.',
        projectId,
        macroId: row.macro_id,
        scopeId: row.scope_id,
        source: originTable,
        refId: row.id,
      }));
      return;
    }

    const isInitialBank = source === 'initial_bank';
    const productionDate = normalizeDate(row.production_date || row.created_at || row.week_end);
    const weeklyPlanServiceId = normalizeId(row.weekly_plan_service_id);

    if (isInitialBank && !productionDate) {
      diagnostics.push(makeDiagnostic({
        id: `initial-bank-date:${originTable}:${row.id}`,
        severity: 'warning',
        type: 'initial_bank_without_reference_date',
        message: 'Banco inicial sem data de referencia clara.',
        projectId,
        macroId: row.macro_id,
        scopeId: row.scope_id,
        source: originTable,
        refId: row.id,
      }));
    }

    actualProductions.push({
      id: `${originTable}:${row.id}`,
      projectId,
      weeklyPlanServiceId,
      macroId: normalizeId(row.macro_id),
      macroName: row.macro_name || null,
      scopeId: normalizeId(row.scope_id),
      scopeName: row.scope_name || null,
      houseIds: uniqueNumbers(getNumericArray(row.house_ids)),
      productionDate,
      weekStartDate: normalizeDate(row.week_start),
      weekEndDate: normalizeDate(row.week_end),
      source,
      originTable,
      isInitialBank,
      progress: row.progress !== undefined && row.progress !== null ? Number(row.progress) : null,
      quantity: row.quantity !== undefined && row.quantity !== null
        ? Number(row.quantity)
        : Number(row.houses_count) || getNumericArray(row.house_ids).length || null,
      countsForProgress: true,
      countsForWeeklyPerformance: !isInitialBank && Boolean(weeklyPlanServiceId),
      countsForProductivity: !isInitialBank,
      countsForDeviation: !isInitialBank,
      estimatedWeeklyMatch: false,
      diaryEntryId: row.diary_entry_id || row.daily_work_log_id || null,
      diaryItemId: row.diary_item_id || null,
    });
  };

  rows.weeklyProductions.forEach((row) => addActual(row, 'weekly_productions'));
  rows.productions.forEach((row) => addActual(row, 'productions'));

  const seenActuals = new Map<string, ActualProductionView[]>();
  actualProductions.forEach((actual) => {
    const key = [
      getServiceKey(actual.macroId, actual.scopeId),
      actual.productionDate || 'sem_data',
      actual.houseIds.join(',') || 'sem_casa',
      actual.quantity ?? 'sem_qtd',
    ].join('|');
    const list = seenActuals.get(key) || [];
    list.push(actual);
    seenActuals.set(key, list);
  });

  seenActuals.forEach((matches, key) => {
    const origins = new Set(matches.map((match) => match.originTable));
    if (matches.length > 1 && origins.size > 1) {
      diagnostics.push(makeDiagnostic({
        id: `duplicated-actual:${key}`,
        severity: 'warning',
        type: 'duplicated_actual_production_risk',
        message: 'Risco de duplicidade entre producao direta/diario e weekly_productions para o mesmo servico/data/casas.',
        projectId,
        macroId: matches[0]?.macroId,
        scopeId: matches[0]?.scopeId,
        houseIds: matches.flatMap((match) => match.houseIds),
        relatedIds: matches.map((match) => match.id),
      }));
    }
  });

  return actualProductions;
};

const buildOfficialView = (
  projectId: string,
  rows: PlanningOfficialViewRows,
  currentProject: ReturnType<typeof useConstruction>['currentProject']
) => {
  const diagnostics: PlanningDiagnostic[] = [];
  const activeVersion = rows.versions.find((version) => version.is_active) || rows.versions[0] || null;
  const periodById = new Map(rows.periods.map((period) => [period.id, period]));
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

  const actualProductions = buildActualProductions(projectId, rows, diagnostics);
  const productionByService = new Map<string, number[]>();
  const productionCountByService = new Map<string, number>();

  actualProductions
    .filter((actual) => actual.countsForProgress)
    .forEach((actual) => {
      const key = getServiceKey(actual.macroId, actual.scopeId);
      productionByService.set(key, uniqueNumbers([...(productionByService.get(key) || []), ...actual.houseIds]));
      productionCountByService.set(key, (productionCountByService.get(key) || 0) + (actual.quantity || actual.houseIds.length || 0));
    });

  const makePackage = ({
    id,
    planningVersionId,
    periodId,
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
    const plannedStart = getSafeDate(plannedStartDate);
    const plannedProgress = plannedStartDate && plannedEndDate && plannedStart
      ? getProgress(
          Math.max(0, differenceInDays(startOfDay(new Date()), plannedStart) + 1),
          getDurationDays(plannedStartDate, plannedEndDate) || plannedQuantity
        )
      : 0;

    return {
      id,
      projectId,
      planningVersionId,
      periodId,
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

  const rawOfficialPackages: PlanningWorkPackageView[] = [];

  if (rows.servicePlans.length > 0) {
    rows.servicePlans.forEach((plan) => {
      const productivity = productivityByService.get(getServiceKey(plan.macro_id, plan.scope_id));
      const hasProjectProductivity = productivity?.source === 'project_service_productivity';
      const targetHouses = Number(plan.target_houses) || 0;
      const houseIds = targetHouses > 0 && targetHouses === allHouseNumbers.length ? allHouseNumbers : [];
      const plannedQuantity = targetHouses || houseIds.length || allHouseNumbers.length || 1;

      const periodId = normalizeId(plan.planning_period_id || plan.period_id);
      const period = periodId ? periodById.get(periodId) : null;
      const plannedStartDate = normalizeDate(plan.planned_start_date || period?.start_date);
      const plannedEndDate = normalizeDate(plan.planned_end_date || period?.end_date);

      rawOfficialPackages.push(makePackage({
        id: `service-period:${plan.id}`,
        planningVersionId: activeVersion?.id || null,
        periodId,
        macroId: normalizeId(plan.macro_id),
        macroName: plan.macro_name || null,
        scopeId: normalizeId(plan.scope_id),
        scopeName: plan.scope_name || null,
        unitType: houseIds.length ? 'project' : 'group',
        houseIds,
        unitLabel: houseIds.length ? 'Todas as casas da obra' : `${plannedQuantity} unidade(s) planejada(s)`,
        plannedStartDate,
        plannedEndDate,
        teamCount: hasProjectProductivity
          ? productivity?.teamCount || null
          : Number(plan.team_count || plan.teams_planned) || productivity?.teamCount || null,
        productivityValue: hasProjectProductivity
          ? productivity?.value || null
          : Number(plan.productivity_per_team || plan.productivity_planned) || productivity?.value || null,
        productivityUnit: hasProjectProductivity
          ? productivity?.unit || null
          : plan.unit_label || productivity?.unit || null,
        plannedQuantity,
        source: 'service_planning_by_period',
        predecessorId: null,
        lagDays: null,
        estimated: !houseIds.length || !plannedStartDate || !plannedEndDate,
      }));
    });
  } else {
    rows.stages.forEach((stage) => {
      const productivity = productivityByService.get(getServiceKey(stage.macro_id, stage.scope_id));
      const hasProjectProductivity = productivity?.source === 'project_service_productivity';
      const plannedQuantity = allHouseNumbers.length || 1;
      rawOfficialPackages.push(makePackage({
        id: `stage:${stage.id}`,
        planningVersionId: stage.version_id || activeVersion?.id || null,
        periodId: null,
        macroId: normalizeId(stage.macro_id),
        macroName: stage.name || null,
        scopeId: normalizeId(stage.scope_id),
        scopeName: stage.scope_id ? stage.name : null,
        unitType: 'project',
        houseIds: allHouseNumbers,
        unitLabel: 'Todas as casas da obra',
        plannedStartDate: null,
        plannedEndDate: null,
        teamCount: hasProjectProductivity
          ? productivity?.teamCount || null
          : Number(stage.planned_teams) || productivity?.teamCount || null,
        productivityValue: hasProjectProductivity
          ? productivity?.value || null
          : Number(stage.planned_productivity) || productivity?.value || null,
        productivityUnit: hasProjectProductivity
          ? productivity?.unit || null
          : stage.unit_label || productivity?.unit || null,
        plannedQuantity,
        source: 'planning_stages',
        predecessorId: stage.depends_on || null,
        lagDays: Number(stage.latency_days) || null,
        estimated: true,
      }));
    });
  }

  if (rawOfficialPackages.length === 0 && rows.plannedProductions.length > 0) {
    rows.plannedProductions.forEach((planned) => {
      const houseIds = uniqueNumbers(getNumericArray(planned.planned_house_ids));
      const productivity = productivityByService.get(getServiceKey(planned.macro_id, planned.scope_id));
      rawOfficialPackages.push(makePackage({
        id: `planned-production:${planned.id}`,
        planningVersionId: activeVersion?.id || null,
        periodId: null,
        macroId: normalizeId(planned.macro_id),
        macroName: planned.macro_name || null,
        scopeId: normalizeId(planned.scope_id),
        scopeName: planned.scope_name || null,
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

  const officialPackages = dedupeOfficialPackages(rawOfficialPackages);

  const packagesByService = new Map<string, PlanningWorkPackageView[]>();
  officialPackages.forEach((pkg) => {
    const key = getServiceKey(pkg.macroId, pkg.scopeId);
    packagesByService.set(key, [...(packagesByService.get(key) || []), pkg]);
  });

  const weekById = new Map(rows.weeklyPlanWeeks.map((week) => [week.id, week]));

  const weeklyTargetsBase = rows.weeklyPlanServices.map((weekly) => {
    const week = weekById.get(weekly.weekly_plan_week_id) || null;
    const plannedHouseIds = uniqueNumbers(getNumericArray(weekly.planned_house_ids));
    const contractorHouseIds = uniqueNumbers(getNumericArray(weekly.contractor_house_ids));
    const outOfContractHouseIds = uniqueNumbers(getNumericArray(weekly.out_of_contract_house_ids));
    const matchingPackages = (packagesByService.get(getServiceKey(weekly.macro_id, weekly.scope_id)) || [])
      .filter((pkg) => hasHouseMatch(pkg.houseIds, plannedHouseIds));

    return {
      id: weekly.id,
      projectId,
      weekId: normalizeId(weekly.weekly_plan_week_id),
      periodId: normalizeId(weekly.planning_period_id || week?.planning_period_id),
      macroId: normalizeId(weekly.macro_id),
      macroName: weekly.macro_name || null,
      scopeId: normalizeId(weekly.scope_id),
      scopeName: weekly.scope_name || null,
      plannedHouseIds,
      plannedHouses: Number(weekly.planned_houses) || plannedHouseIds.length,
      contractorId: normalizeId(weekly.contractor_id),
      contractorName: weekly.contractor_name || null,
      contractorHouseIds,
      contractorHouses: Number(weekly.contractor_houses) || contractorHouseIds.length,
      outOfContractHouseIds,
      weekStartDate: normalizeDate(week?.week_start || weekly.week_start),
      weekEndDate: normalizeDate(week?.week_end || weekly.week_end),
      linkedPackageIds: [] as string[],
      estimatedPackageMatch: matchingPackages.length > 0,
      matchingPackageIds: matchingPackages.map((pkg) => pkg.id),
    };
  });

  const weeklyTargetMatchesActual = (target: typeof weeklyTargetsBase[number], actual: ActualProductionView) => {
    if (actual.isInitialBank) return false;
    if (actual.weeklyPlanServiceId && actual.weeklyPlanServiceId === target.id) return true;
    if (getServiceKey(actual.macroId, actual.scopeId) !== getServiceKey(target.macroId, target.scopeId)) return false;
    if (!hasHouseMatch(actual.houseIds, target.plannedHouseIds)) return false;
    return isDateWithinRange(actual.productionDate, target.weekStartDate, target.weekEndDate)
      || isDateWithinRange(actual.weekStartDate, target.weekStartDate, target.weekEndDate)
      || isDateWithinRange(actual.weekEndDate, target.weekStartDate, target.weekEndDate);
  };

  const weeklyTargets: WeeklyTargetView[] = weeklyTargetsBase.map((target) => {
    const matchingActuals = actualProductions.filter((actual) => weeklyTargetMatchesActual(target, actual));
    const possibleActuals = matchingActuals.length
      ? []
      : actualProductions.filter((actual) => (
          !actual.isInitialBank
          && getServiceKey(actual.macroId, actual.scopeId) === getServiceKey(target.macroId, target.scopeId)
          && hasHouseMatch(actual.houseIds, target.plannedHouseIds)
        ));

    if (possibleActuals.length > 0) {
      diagnostics.push(makeDiagnostic({
        id: `weekly-possible-production:${target.id}`,
        severity: 'warning',
        type: 'weekly_target_unmatched_but_possible_production_found',
        message: 'Meta semanal sem match efetivo, mas ha producao parecida por servico/casas fora do criterio de data/vinculo.',
        projectId,
        macroId: target.macroId,
        scopeId: target.scopeId,
        houseIds: target.plannedHouseIds,
        relatedIds: [target.id, ...possibleActuals.map((actual) => actual.id)],
        source: 'weekly_plan_services',
        refId: target.id,
      }));
    }

    matchingActuals.forEach((actual) => {
      actual.countsForWeeklyPerformance = true;
      actual.estimatedWeeklyMatch = !actual.weeklyPlanServiceId;
    });
    const actualHouseIds = uniqueNumbers(matchingActuals.flatMap((actual) => actual.houseIds));
    const executedHouseIds = target.plannedHouseIds.length
      ? intersects(actualHouseIds, target.plannedHouseIds)
      : actualHouseIds;
    const outOfPlanHouseIds = target.plannedHouseIds.length
      ? actualHouseIds.filter((houseId) => !target.plannedHouseIds.includes(houseId))
      : [];
    const missingHouseIds = target.plannedHouseIds.filter((houseId) => !executedHouseIds.includes(houseId));
    const completionPercent = getProgress(executedHouseIds.length, target.plannedHouses || target.plannedHouseIds.length);
    const targetWeekEnd = getSafeDate(target.weekEndDate);
    const ended = targetWeekEnd ? startOfDay(new Date()) > targetWeekEnd : false;
    const status: WeeklyTargetStatus =
      outOfPlanHouseIds.length > 0 ? 'excedida'
        : executedHouseIds.length === 0 ? (ended ? 'nao_cumprida' : 'sem_lancamento')
          : missingHouseIds.length > 0 ? 'parcial'
            : 'cumprida';

    return {
      id: target.id,
      projectId: target.projectId,
      weekId: target.weekId,
      periodId: target.periodId,
      macroId: target.macroId,
      macroName: target.macroName,
      scopeId: target.scopeId,
      scopeName: target.scopeName,
      plannedHouseIds: target.plannedHouseIds,
      plannedHouses: target.plannedHouses,
      contractorId: target.contractorId,
      contractorName: target.contractorName,
      contractorHouseIds: target.contractorHouseIds,
      contractorHouses: target.contractorHouses,
      outOfContractHouseIds: target.outOfContractHouseIds,
      weekStartDate: target.weekStartDate,
      weekEndDate: target.weekEndDate,
      status,
      linkedPackageIds: target.linkedPackageIds,
      estimatedPackageMatch: target.estimatedPackageMatch,
      executedHouseIds,
      missingHouseIds,
      outOfPlanHouseIds,
      completionPercent,
    };
  });

  const weeklyTargetById = new Map(weeklyTargets.map((target) => [target.id, target]));
  actualProductions.forEach((actual) => {
    if (actual.isInitialBank && actual.countsForWeeklyPerformance) {
      diagnostics.push(makeDiagnostic({
        id: `initial-bank-weekly:${actual.id}`,
        severity: 'critical',
        type: 'initial_bank_counted_as_weekly_performance',
        message: 'Banco inicial nao deve contar como cumprimento semanal.',
        projectId,
        macroId: actual.macroId,
        scopeId: actual.scopeId,
        houseIds: actual.houseIds,
        relatedIds: [actual.id, actual.weeklyPlanServiceId],
        source: actual.originTable,
      }));
    }
    if (!actual.isInitialBank && !actual.countsForWeeklyPerformance) {
      const type = actual.source === 'diary'
        ? 'diary_production_without_weekly_target'
        : 'direct_production_without_weekly_target';
      diagnostics.push(makeDiagnostic({
        id: `${type}:${actual.id}`,
        severity: 'warning',
        type,
        message: actual.source === 'diary'
          ? 'Producao vinda do diario sem meta semanal correspondente.'
          : 'Producao direta sem meta semanal correspondente.',
        projectId,
        macroId: actual.macroId,
        scopeId: actual.scopeId,
        houseIds: actual.houseIds,
        relatedIds: [actual.id],
        source: actual.originTable,
      }));
      diagnostics.push(makeDiagnostic({
        id: `production-without-weekly:${actual.id}`,
        severity: 'warning',
        type: 'production_without_weekly_target',
        message: 'Producao real nao vinculada a meta semanal por id nem por data/casa/servico.',
        projectId,
        macroId: actual.macroId,
        scopeId: actual.scopeId,
        houseIds: actual.houseIds,
        relatedIds: [actual.id],
        source: actual.originTable,
      }));
    }
  });

  const deviations: PlanningDeviationView[] = rows.productionDeviations
    .filter((deviation) => !deviation.deleted_at)
    .map((deviation) => ({
      id: deviation.id,
      projectId,
      weeklyPlanServiceId: normalizeId(deviation.weekly_plan_service_id),
      plannedProductionId: normalizeId(deviation.planned_production_id),
      macroId: normalizeId(deviation.macro_id),
      scopeId: normalizeId(deviation.scope_id),
      missingHouseIds: uniqueNumbers(getNumericArray(deviation.missing_house_ids)),
      executedHouseIds: uniqueNumbers(getNumericArray(deviation.actual_house_ids)),
      outOfPlanHouseIds: uniqueNumbers(getNumericArray(deviation.unplanned_house_ids)),
      reason: deviation.reason || deviation.deviation_type || null,
      notes: deviation.notes || deviation.corrective_action || null,
      createdAt: normalizeDate(deviation.created_at),
    }));

  deviations.forEach((deviation) => {
    if (!deviation.reason && !deviation.notes) {
      diagnostics.push(makeDiagnostic({
        id: `deviation-without-reason:${deviation.id}`,
        severity: 'warning',
        type: 'deviation_without_reason',
        message: 'Desvio de producao sem motivo/observacao registrado.',
        projectId,
        macroId: deviation.macroId,
        scopeId: deviation.scopeId,
        houseIds: deviation.missingHouseIds,
        relatedIds: [deviation.id, deviation.weeklyPlanServiceId],
        source: 'production_deviations',
      }));
    }
  });

  const packageKeys = new Set(officialPackages.map((pkg) => getServiceKey(pkg.macroId, pkg.scopeId)));
  const weeklyKeys = new Set(weeklyTargets.map((target) => getServiceKey(target.macroId, target.scopeId)));
  const serviceCount = new Map<string, number>();

  officialPackages.forEach((pkg) => {
    const key = getServiceKey(pkg.macroId, pkg.scopeId);
    serviceCount.set(key, (serviceCount.get(key) || 0) + 1);
    if (!pkg.productivityValue) {
      diagnostics.push(makeDiagnostic({
        id: `missing-productivity:${pkg.id}`,
        severity: 'warning',
        type: 'missing_productivity',
        message: `Pacote sem produtividade cadastrada: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        projectId,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      }));
    }
    if (!pkg.houseIds.length) {
      diagnostics.push(makeDiagnostic({
        id: `without-house:${pkg.id}`,
        severity: 'info',
        type: 'package_without_house',
        message: `Pacote sem casas especificas; progresso sera estimado: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        projectId,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      }));
    }
    if (!pkg.plannedStartDate || !pkg.plannedEndDate) {
      diagnostics.push(makeDiagnostic({
        id: `missing-dates:${pkg.id}`,
        severity: 'warning',
        type: 'missing_dates',
        message: `Pacote sem datas planejadas: ${pkg.macroName || '-'} / ${pkg.scopeName || '-'}`,
        projectId,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        source: pkg.source,
        refId: pkg.id,
      }));
    }
    if (pkg.remainingQuantity > 0) {
      diagnostics.push(makeDiagnostic({
        id: `remaining-balance:${pkg.id}`,
        severity: 'info',
        type: 'service_with_remaining_balance',
        message: `Pacote com saldo restante: ${pkg.remainingQuantity} unidade(s).`,
        projectId,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        houseIds: pkg.houseIds,
        source: pkg.source,
        refId: pkg.id,
      }));
    }
    if (!weeklyKeys.has(key)) {
      diagnostics.push(makeDiagnostic({
        id: `official-without-weekly:${pkg.id}`,
        severity: 'info',
        type: 'official_package_without_weekly_target',
        message: 'Pacote oficial virtual ainda sem meta semanal derivada.',
        projectId,
        macroId: pkg.macroId,
        scopeId: pkg.scopeId,
        houseIds: pkg.houseIds,
        source: pkg.source,
        refId: pkg.id,
      }));
    }
  });

  serviceCount.forEach((count, key) => {
    if (count > 1) {
      const [macroId, scopeId] = key.split('::');
      diagnostics.push(makeDiagnostic({
        id: `distributed-service:${key}`,
        severity: 'info',
        type: 'service_distributed_across_periods',
        message: `Servico aparece em ${count} periodos/pacotes. Isso pode estar correto, mas exige casas especificas por periodo para maior precisao.`,
        projectId,
        macroId,
        scopeId,
      }));
    }
  });

  productionByService.forEach((_, key) => {
    if (!packageKeys.has(key)) {
      const [macroId, scopeId] = key.split('::');
      diagnostics.push(makeDiagnostic({
        id: `real-without-package:${key}`,
        severity: 'critical',
        type: 'real_production_without_package',
        message: 'Producao real encontrada sem pacote planejado correspondente.',
        projectId,
        macroId,
        scopeId,
        source: 'productions/weekly_productions',
      }));
    }
  });

  weeklyTargets.forEach((weekly) => {
    if (!weekly.estimatedPackageMatch) {
      diagnostics.push(makeDiagnostic({
        id: `weekly-without-package:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_target_without_official_package',
        message: `Meta semanal sem pacote oficial virtual correspondente: ${weekly.macroName} / ${weekly.scopeName}`,
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.plannedHouseIds,
        source: 'weekly_plan_services',
        refId: weekly.id,
      }));
      diagnostics.push(makeDiagnostic({
        id: `weekly-legacy-without-package:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_plan_without_package',
        message: `Planejamento semanal sem pacote oficial correspondente: ${weekly.macroName} / ${weekly.scopeName}`,
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        source: 'weekly_plan_services',
        refId: weekly.id,
      }));
    }
    if (!weekly.contractorId && !weekly.contractorName) {
      diagnostics.push(makeDiagnostic({
        id: `weekly-without-contractor:${weekly.id}`,
        severity: 'info',
        type: 'weekly_target_without_contractor',
        message: 'Meta semanal sem empreiteiro/equipe vinculada.',
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.plannedHouseIds,
        relatedIds: [weekly.id],
        source: 'weekly_plan_services',
      }));
    }
    if (weekly.outOfContractHouseIds.length > 0) {
      diagnostics.push(makeDiagnostic({
        id: `weekly-out-contract:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_target_with_out_of_contract_houses',
        message: 'Meta semanal possui casas fora do contrato/equipe vinculada.',
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.outOfContractHouseIds,
        relatedIds: [weekly.id],
        source: 'weekly_plan_services',
      }));
    }
    if (weekly.status === 'nao_cumprida') {
      diagnostics.push(makeDiagnostic({
        id: `weekly-not-completed:${weekly.id}`,
        severity: 'critical',
        type: 'weekly_target_not_completed',
        message: 'Meta semanal encerrada sem cumprimento.',
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.missingHouseIds,
        relatedIds: [weekly.id],
        source: 'weekly_plan_services',
      }));
    }
    if (weekly.status === 'parcial') {
      diagnostics.push(makeDiagnostic({
        id: `weekly-partial:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_target_partially_completed',
        message: 'Meta semanal parcialmente cumprida.',
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.missingHouseIds,
        relatedIds: [weekly.id],
        source: 'weekly_plan_services',
      }));
    }
    if (weekly.status === 'excedida') {
      diagnostics.push(makeDiagnostic({
        id: `weekly-exceeded:${weekly.id}`,
        severity: 'warning',
        type: 'weekly_target_exceeded',
        message: 'Meta semanal teve execucao fora das casas planejadas.',
        projectId,
        macroId: weekly.macroId,
        scopeId: weekly.scopeId,
        houseIds: weekly.outOfPlanHouseIds,
        relatedIds: [weekly.id],
        source: 'weekly_plan_services',
      }));
    }
  });

  if (rows.stages.length > 0 && rows.servicePlans.length === 0) {
    diagnostics.push(makeDiagnostic({
      id: 'strategic-without-operational-detail',
      severity: 'info',
      type: 'strategic_without_operational_detail',
      message: 'Planejamento estrategico existe, mas ainda nao ha detalhamento operacional por periodo/pacote.',
      projectId,
      source: 'planning_stages',
    }));
  }

  return {
    officialPackages,
    weeklyTargets,
    actualProductions,
    deviations,
    diagnostics: groupDiagnostics(diagnostics),
  };
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
        weeklyPlanWeeks,
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
        supabase.from('weekly_plan_weeks').select('*').eq('project_id', projectId).order('week_start', { ascending: true }),
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
        weeklyPlanWeeks,
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
        weeklyPlanWeeks: weeklyPlanWeeks.data || [],
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
      return {
        officialPackages: [],
        weeklyTargets: [],
        actualProductions: [],
        deviations: [],
        diagnostics: [],
      };
    }
    return buildOfficialView(projectId, rows, currentProject);
  }, [currentProject, projectId, rows]);

  const diagnosticsSummaryKey = useMemo(() => {
    const counts = view.diagnostics.reduce<Record<string, number>>((acc, diagnostic) => {
      acc[diagnostic.type] = (acc[diagnostic.type] || 0) + 1;
      return acc;
    }, {});
    return JSON.stringify({
      officialPackages: view.officialPackages.length,
      weeklyTargets: view.weeklyTargets.length,
      actualProductions: view.actualProductions.length,
      deviations: view.deviations.length,
      diagnosticsByType: counts,
    });
  }, [
    view.actualProductions.length,
    view.deviations.length,
    view.diagnostics,
    view.officialPackages.length,
    view.weeklyTargets.length,
  ]);

  useEffect(() => {
    if (!rows || !import.meta.env.DEV) return;
    const summary = JSON.parse(diagnosticsSummaryKey);
    console.info('[Planning Weekly Flow Diagnostic]', {
      ...summary,
      sources: {
        servicePlans: rows.servicePlans.length,
        planningStages: rows.stages.length,
        weeklyPlanWeeks: rows.weeklyPlanWeeks.length,
        weeklyPlanServices: rows.weeklyPlanServices.length,
        plannedProductions: rows.plannedProductions.length,
        productions: rows.productions.length,
        weeklyProductions: rows.weeklyProductions.length,
        productionDeviations: rows.productionDeviations.length,
      },
      futureLinks: {
        weeklyPlanServicesWorkPackageIds: 'future weekly_plan_services.work_package_ids',
        productionDeviationsWorkPackageIds: 'future production_deviations.work_package_id/work_package_ids',
        teamId: 'future team_id alongside contractor_id',
      },
    });
  }, [diagnosticsSummaryKey, rows]);

  return {
    officialPackages: view.officialPackages,
    weeklyTargets: view.weeklyTargets,
    actualProductions: view.actualProductions,
    deviations: view.deviations,
    diagnostics: view.diagnostics,
    packages: view.officialPackages,
    planningDiagnostics: view.diagnostics,
    loading,
    reload,
  };
}
