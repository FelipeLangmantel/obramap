import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

export type CapacitySource = 'work_group' | 'service_productivity' | 'fallback' | 'missing';
export type CapacityDiagnosticStatus = 'ok' | 'attention' | 'overloaded' | 'missing_productivity';
export type PlanningCapacityServicePlanningType =
  | 'physical_repetitive'
  | 'physical_one_time'
  | 'administrative_cost'
  | 'support_service'
  | 'milestone'
  | 'hidden_from_planning'
  | 'undefined';

export interface PlanningCapacityServiceSetting {
  macroId: string | null;
  scopeId: string | null;
  serviceName: string | null;
  servicePlanningType: PlanningCapacityServicePlanningType;
  includeInGantt: boolean;
  includeInLineOfBalance: boolean;
  includeInWeeklyPlanning: boolean;
}

export interface PlanningCapacityWorkGroupService {
  macroId: string | null;
  scopeId: string | null;
  serviceName: string | null;
  sequenceOrder: number;
  lagDays: number;
  productivityOverride: number | null;
  productivityUnitOverride: string | null;
}

export interface PlanningCapacityWorkGroup {
  id: string;
  name: string;
  description: string | null;
  baseUnit: string | null;
  productivityValue: number | null;
  productivityUnit: string | null;
  workingDaysPerWeek: number;
  simultaneousTeamCount: number;
  professionalCount: number;
  auxiliaryCount: number;
  totalPeople: number;
  active: boolean;
  services: PlanningCapacityWorkGroupService[];
}

export interface ServiceCapacityEntry {
  macroId: string | null;
  scopeId: string | null;
  serviceName: string;
  groupId: string | null;
  groupName: string | null;
  capacitySource: CapacitySource;
  productivityValue: number | null;
  productivityUnit: string | null;
  workingDaysPerWeek: number;
  teamCount: number;
  dailyCapacity: number | null;
  weeklyCapacity: number | null;
  professionals: number;
  auxiliaries: number;
  totalPeople: number;
  includeInGantt: boolean;
  includeInLineOfBalance: boolean;
  includeInWeeklyPlanning: boolean;
  servicePlanningType: PlanningCapacityServicePlanningType;
}

export interface OverloadDiagnostic {
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  groupId: string | null;
  groupName: string;
  plannedQuantity: number;
  availableCapacity: number | null;
  overloadQuantity: number;
  overloadPercent: number;
  status: CapacityDiagnosticStatus;
  servicesCompetingForSameGroup: string[];
}

export interface PlanningCapacitySummary {
  totalWorkGroups: number;
  activeWorkGroups: number;
  servicesWithWorkGroup: number;
  servicesWithoutWorkGroup: number;
  servicesWithoutCapacity: number;
  overloadedPeriods: number;
  totalPeoplePlanned: number;
  totalTeamsPlanned: number;
}

export interface PlanningCapacityModelResult {
  planningServiceSettings: PlanningCapacityServiceSetting[];
  workGroups: PlanningCapacityWorkGroup[];
  serviceCapacityMap: ServiceCapacityEntry[];
  overloadDiagnostics: OverloadDiagnostic[];
  summary: PlanningCapacitySummary;
  diagnostics: string[];
  loading: boolean;
}

interface CapacityRawState {
  groups: any[];
  groupServices: any[];
  groupComposition: any[];
  settings: any[];
  productivities: any[];
  teamComposition: any[];
  periodServices: any[];
  planningStages: any[];
  weeklyPlanServices: any[];
  productions: any[];
  weeklyProductions: any[];
  diagnostics: string[];
}

const emptySummary: PlanningCapacitySummary = {
  totalWorkGroups: 0,
  activeWorkGroups: 0,
  servicesWithWorkGroup: 0,
  servicesWithoutWorkGroup: 0,
  servicesWithoutCapacity: 0,
  overloadedPeriods: 0,
  totalPeoplePlanned: 0,
  totalTeamsPlanned: 0,
};

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const textOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const positiveNumberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const serviceKey = (macroId?: unknown, scopeId?: unknown, serviceName?: unknown) => {
  const macro = textOrNull(macroId);
  const scope = textOrNull(scopeId);
  if (macro || scope) return `${macro ?? 'no-macro'}::${scope ?? 'no-scope'}`;
  return `name::${normalizeText(serviceName) || 'unknown'}`;
};

const serviceNameFromRow = (row: any) =>
  textOrNull(row?.service_name)
  ?? textOrNull(row?.scope_name)
  ?? textOrNull(row?.scope)
  ?? textOrNull(row?.name)
  ?? 'Servico sem nome';

const macroNameFromRow = (row: any) =>
  textOrNull(row?.macro_name)
  ?? textOrNull(row?.stage_name)
  ?? textOrNull(row?.macro)
  ?? textOrNull(row?.etapa)
  ?? null;

const normalizePlanningType = (value: unknown): PlanningCapacityServicePlanningType => {
  const normalized = String(value ?? 'physical_repetitive') as PlanningCapacityServicePlanningType;
  if (
    normalized === 'physical_repetitive'
    || normalized === 'physical_one_time'
    || normalized === 'administrative_cost'
    || normalized === 'support_service'
    || normalized === 'milestone'
    || normalized === 'hidden_from_planning'
    || normalized === 'undefined'
  ) {
    return normalized;
  }
  return 'physical_repetitive';
};

const normalizeDailyCapacity = (
  productivityValue: number | null,
  productivityUnit: string | null,
  workingDaysPerWeek: number,
) => {
  if (!productivityValue || productivityValue <= 0) return null;
  const unit = normalizeText(productivityUnit);
  if (unit.includes('semana')) return productivityValue / Math.max(workingDaysPerWeek, 1);
  if (unit.includes('mes')) return productivityValue / 22;
  return productivityValue;
};

const readHouseDemand = (row: any) => {
  const numeric =
    positiveNumberOrNull(row?.planned_quantity)
    ?? positiveNumberOrNull(row?.quantity)
    ?? positiveNumberOrNull(row?.target_quantity)
    ?? positiveNumberOrNull(row?.planned_units)
    ?? positiveNumberOrNull(row?.houses_count)
    ?? positiveNumberOrNull(row?.planned_houses_count);
  if (numeric !== null) return numeric;

  const houseCollections = [
    row?.planned_house_ids,
    row?.house_ids,
    row?.houses,
    row?.planned_houses,
    row?.contractor_house_ids,
  ];
  for (const value of houseCollections) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') {
      const count = value.split(',').map((item) => item.trim()).filter(Boolean).length;
      if (count > 0) return count;
    }
  }

  return 0;
};

const periodKeyFromRow = (row: any) =>
  textOrNull(row?.week_id)
  ?? textOrNull(row?.weekly_plan_week_id)
  ?? textOrNull(row?.period_id)
  ?? textOrNull(row?.planning_period_id)
  ?? textOrNull(row?.week_label)
  ?? textOrNull(row?.period_label)
  ?? 'periodo-sem-data';

const periodLabelFromRow = (row: any) =>
  textOrNull(row?.week_label)
  ?? textOrNull(row?.period_label)
  ?? textOrNull(row?.name)
  ?? textOrNull(row?.weekly_plan_week_id)
  ?? textOrNull(row?.planning_period_id)
  ?? 'Periodo sem data';

const periodStartFromRow = (row: any) =>
  textOrNull(row?.week_start_date)
  ?? textOrNull(row?.start_date)
  ?? textOrNull(row?.period_start)
  ?? null;

const periodEndFromRow = (row: any) =>
  textOrNull(row?.week_end_date)
  ?? textOrNull(row?.end_date)
  ?? textOrNull(row?.period_end)
  ?? null;

async function safeRead(label: string, query: PromiseLike<{ data: any[] | null; error: any }>) {
  try {
    const { data, error } = await query;
    if (error) {
      if (import.meta.env.DEV) {
        console.warn('[Planning Capacity Model Diagnostic]', label, error);
      }
      return { data: [] as any[], warning: `${label}: ${error.message || 'erro ao ler dados'}` };
    }
    return { data: data ?? [], warning: null };
  } catch (error: any) {
    if (import.meta.env.DEV) {
      console.warn('[Planning Capacity Model Diagnostic]', label, error);
    }
    return { data: [] as any[], warning: `${label}: ${error?.message || 'erro ao ler dados'}` };
  }
}

export function usePlanningCapacityModel(projectId: string | undefined): PlanningCapacityModelResult {
  const [raw, setRaw] = useState<CapacityRawState>({
    groups: [],
    groupServices: [],
    groupComposition: [],
    settings: [],
    productivities: [],
    teamComposition: [],
    periodServices: [],
    planningStages: [],
    weeklyPlanServices: [],
    productions: [],
    weeklyProductions: [],
    diagnostics: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!projectId) {
        setRaw({
          groups: [],
          groupServices: [],
          groupComposition: [],
          settings: [],
          productivities: [],
          teamComposition: [],
          periodServices: [],
          planningStages: [],
          weeklyPlanServices: [],
          productions: [],
          weeklyProductions: [],
          diagnostics: [],
        });
        return;
      }

      setLoading(true);
      const [
        groups,
        groupServices,
        groupComposition,
        settings,
        productivities,
        periodServices,
        planningStages,
        weeklyPlanServices,
        productions,
        weeklyProductions,
      ] = await Promise.all([
        safeRead(
          'project_team_work_groups',
          supabase.from('project_team_work_groups' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'project_team_work_group_services',
          supabase.from('project_team_work_group_services' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'project_team_work_group_composition',
          supabase.from('project_team_work_group_composition' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'project_service_planning_settings',
          supabase.from('project_service_planning_settings' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'project_service_productivity',
          supabase.from('project_service_productivity' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'service_planning_by_period',
          supabase.from('service_planning_by_period' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'planning_stages',
          supabase.from('planning_stages' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'weekly_plan_services',
          supabase.from('weekly_plan_services' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'productions',
          supabase.from('productions' as any).select('*').eq('project_id', projectId),
        ),
        safeRead(
          'weekly_productions',
          supabase.from('weekly_productions' as any).select('*').eq('project_id', projectId),
        ),
      ]);
      const productivityIds = productivities.data.map((item) => item?.id).filter(Boolean);
      const teamComposition = productivityIds.length
        ? await safeRead(
          'project_service_team_composition',
          supabase.from('project_service_team_composition' as any).select('*').in('productivity_id', productivityIds),
        )
        : { data: [] as any[], warning: null };

      if (!alive) return;

      setRaw({
        groups: groups.data,
        groupServices: groupServices.data,
        groupComposition: groupComposition.data,
        settings: settings.data,
        productivities: productivities.data,
        teamComposition: teamComposition.data,
        periodServices: periodServices.data,
        planningStages: planningStages.data,
        weeklyPlanServices: weeklyPlanServices.data,
        productions: productions.data,
        weeklyProductions: weeklyProductions.data,
        diagnostics: [
          groups.warning,
          groupServices.warning,
          groupComposition.warning,
          settings.warning,
          productivities.warning,
          teamComposition.warning,
          periodServices.warning,
          planningStages.warning,
          weeklyPlanServices.warning,
          productions.warning,
          weeklyProductions.warning,
        ].filter(Boolean) as string[],
      });
      setLoading(false);
    }

    load().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('[Planning Capacity Model Diagnostic]', error);
      }
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [projectId]);

  return useMemo(() => {
    const activeGroupRows = raw.groups.filter((group) => group?.active !== false);
    const groupServicesByGroup = new Map<string, any[]>();
    for (const row of raw.groupServices.filter((service) => service?.active !== false)) {
      const groupId = textOrNull(row?.group_id);
      if (!groupId) continue;
      groupServicesByGroup.set(groupId, [...(groupServicesByGroup.get(groupId) ?? []), row]);
    }
    const groupCompositionByGroup = new Map<string, any[]>();
    for (const row of raw.groupComposition) {
      const groupId = textOrNull(row?.group_id);
      if (!groupId) continue;
      groupCompositionByGroup.set(groupId, [...(groupCompositionByGroup.get(groupId) ?? []), row]);
    }

    const workGroups: PlanningCapacityWorkGroup[] = raw.groups.map((group) => {
      const teamCount = Math.max(toNumber(group?.simultaneous_team_count, 1), 1);
      const detailedComposition = groupCompositionByGroup.get(String(group.id)) ?? [];
      const detailedProfessionalCount = detailedComposition
        .filter((row) => row?.role === 'professional')
        .reduce((sum, row) => sum + Math.max(toNumber(row?.quantity, 0), 0), 0);
      const detailedAuxiliaryCount = detailedComposition
        .filter((row) => row?.role === 'helper')
        .reduce((sum, row) => sum + Math.max(toNumber(row?.quantity, 0), 0), 0);
      const hasDetailedComposition = detailedComposition.length > 0;
      const professionalCount = hasDetailedComposition
        ? detailedProfessionalCount
        : Math.max(toNumber(group?.professional_count, 0), 0);
      const auxiliaryCount = hasDetailedComposition
        ? detailedAuxiliaryCount
        : Math.max(toNumber(group?.auxiliary_count, 0), 0);
      const services = (groupServicesByGroup.get(group.id) ?? []).map((service) => ({
        macroId: textOrNull(service?.macro_id),
        scopeId: textOrNull(service?.scope_id),
        serviceName: textOrNull(service?.service_name),
        sequenceOrder: toNumber(service?.sequence_order, 0),
        lagDays: toNumber(service?.lag_days, 0),
        productivityOverride: positiveNumberOrNull(service?.productivity_override),
        productivityUnitOverride: textOrNull(service?.productivity_unit_override),
      }));

      return {
        id: String(group.id),
        name: String(group.name ?? 'Frente sem nome'),
        description: textOrNull(group.description),
        baseUnit: textOrNull(group.base_unit),
        productivityValue: positiveNumberOrNull(group.productivity_value),
        productivityUnit: textOrNull(group.productivity_unit),
        workingDaysPerWeek: Math.max(toNumber(group.working_days_per_week, 5), 1),
        simultaneousTeamCount: teamCount,
        professionalCount,
        auxiliaryCount,
        totalPeople: (professionalCount + auxiliaryCount) * teamCount,
        active: group?.active !== false,
        services,
      };
    });

    const planningServiceSettings: PlanningCapacityServiceSetting[] = raw.settings.map((setting) => ({
      macroId: textOrNull(setting?.macro_id),
      scopeId: textOrNull(setting?.scope_id),
      serviceName: textOrNull(setting?.service_name),
      servicePlanningType: normalizePlanningType(setting?.service_planning_type),
      includeInGantt: setting?.include_in_gantt !== false,
      includeInLineOfBalance: setting?.include_in_line_of_balance !== false,
      includeInWeeklyPlanning: setting?.include_in_weekly_planning !== false,
    }));

    const settingByKey = new Map<string, PlanningCapacityServiceSetting>();
    for (const setting of planningServiceSettings) {
      settingByKey.set(serviceKey(setting.macroId, setting.scopeId, setting.serviceName), setting);
    }

    const productivityByKey = new Map<string, any>();
    for (const productivity of raw.productivities.filter((item) => item?.is_active !== false)) {
      productivityByKey.set(serviceKey(productivity?.macro_id, productivity?.scope_id, productivity?.service_name), productivity);
    }
    const compositionByProductivityId = new Map<string, any[]>();
    for (const item of raw.teamComposition) {
      const productivityId = textOrNull(item?.productivity_id);
      if (!productivityId) continue;
      compositionByProductivityId.set(productivityId, [...(compositionByProductivityId.get(productivityId) ?? []), item]);
    }

    const groupLinkByKey = new Map<string, { group: PlanningCapacityWorkGroup; service: PlanningCapacityWorkGroupService }>();
    for (const group of workGroups.filter((item) => item.active)) {
      for (const service of group.services) {
        groupLinkByKey.set(serviceKey(service.macroId, service.scopeId, service.serviceName), { group, service });
      }
    }

    const knownServices = new Map<string, { macroId: string | null; scopeId: string | null; serviceName: string; macroName: string | null }>();
    const rememberService = (row: any) => {
      const macroId = textOrNull(row?.macro_id);
      const scopeId = textOrNull(row?.scope_id);
      const serviceName = serviceNameFromRow(row);
      const key = serviceKey(macroId, scopeId, serviceName);
      if (!knownServices.has(key)) {
        knownServices.set(key, {
          macroId,
          scopeId,
          serviceName,
          macroName: macroNameFromRow(row),
        });
      }
    };

    raw.periodServices.forEach(rememberService);
    raw.planningStages.forEach(rememberService);
    raw.weeklyPlanServices.forEach(rememberService);
    raw.productivities.forEach(rememberService);
    raw.settings.forEach(rememberService);
    raw.groupServices.forEach(rememberService);

    const serviceCapacityMap: ServiceCapacityEntry[] = Array.from(knownServices.entries()).map(([key, service]) => {
      const setting = settingByKey.get(key) ?? {
        macroId: service.macroId,
        scopeId: service.scopeId,
        serviceName: service.serviceName,
        servicePlanningType: 'physical_repetitive' as PlanningCapacityServicePlanningType,
        includeInGantt: true,
        includeInLineOfBalance: true,
        includeInWeeklyPlanning: true,
      };
      const groupLink = groupLinkByKey.get(key);
      const productivity = productivityByKey.get(key);

      if (groupLink) {
        const value = groupLink.service.productivityOverride ?? groupLink.group.productivityValue;
        const unit = groupLink.service.productivityUnitOverride ?? groupLink.group.productivityUnit;
        const dailyBase = normalizeDailyCapacity(value, unit, groupLink.group.workingDaysPerWeek);
        const dailyCapacity = dailyBase === null ? null : dailyBase * groupLink.group.simultaneousTeamCount;
        const weeklyCapacity = dailyCapacity === null ? null : dailyCapacity * groupLink.group.workingDaysPerWeek;
        return {
          macroId: service.macroId,
          scopeId: service.scopeId,
          serviceName: service.serviceName,
          groupId: groupLink.group.id,
          groupName: groupLink.group.name,
          capacitySource: value ? 'work_group' : 'missing',
          productivityValue: value,
          productivityUnit: unit,
          workingDaysPerWeek: groupLink.group.workingDaysPerWeek,
          teamCount: groupLink.group.simultaneousTeamCount,
          dailyCapacity,
          weeklyCapacity,
          professionals: groupLink.group.professionalCount * groupLink.group.simultaneousTeamCount,
          auxiliaries: groupLink.group.auxiliaryCount * groupLink.group.simultaneousTeamCount,
          totalPeople: groupLink.group.totalPeople,
          includeInGantt: setting.includeInGantt,
          includeInLineOfBalance: setting.includeInLineOfBalance,
          includeInWeeklyPlanning: setting.includeInWeeklyPlanning,
          servicePlanningType: setting.servicePlanningType,
        };
      }

      if (productivity) {
        const workingDaysPerWeek = Math.max(toNumber(productivity.working_days_per_week, 5), 1);
        const teamCount = Math.max(toNumber(productivity.default_team_count, 1), 1);
        const value = positiveNumberOrNull(productivity.productivity_value);
        const unit = textOrNull(productivity.productivity_unit);
        const dailyBase = normalizeDailyCapacity(value, unit, workingDaysPerWeek);
        const dailyCapacity = dailyBase === null ? null : dailyBase * teamCount;
        const weeklyCapacity = dailyCapacity === null ? null : dailyCapacity * workingDaysPerWeek;
        const composition = compositionByProductivityId.get(String(productivity.id)) ?? [];
        const compositionProfessionals = composition
          .filter((item) => normalizeText(item?.role_type).includes('prof') || normalizeText(item?.role_name).includes('prof'))
          .reduce((sum, item) => sum + Math.max(toNumber(item?.quantity, 0), 0), 0);
        const compositionAuxiliaries = composition
          .filter((item) => normalizeText(item?.role_type).includes('aux') || normalizeText(item?.role_name).includes('aux'))
          .reduce((sum, item) => sum + Math.max(toNumber(item?.quantity, 0), 0), 0);
        const professionalsPerTeam = positiveNumberOrNull(productivity.professionals_per_team) ?? compositionProfessionals;
        const auxiliariesPerTeam = positiveNumberOrNull(productivity.helpers_per_team) ?? compositionAuxiliaries;
        const professionals = Math.max(professionalsPerTeam, 0) * teamCount;
        const auxiliaries = Math.max(auxiliariesPerTeam, 0) * teamCount;
        return {
          macroId: service.macroId,
          scopeId: service.scopeId,
          serviceName: service.serviceName,
          groupId: null,
          groupName: null,
          capacitySource: value ? 'service_productivity' : 'missing',
          productivityValue: value,
          productivityUnit: unit,
          workingDaysPerWeek,
          teamCount,
          dailyCapacity,
          weeklyCapacity,
          professionals,
          auxiliaries,
          totalPeople: professionals + auxiliaries,
          includeInGantt: setting.includeInGantt,
          includeInLineOfBalance: setting.includeInLineOfBalance,
          includeInWeeklyPlanning: setting.includeInWeeklyPlanning,
          servicePlanningType: setting.servicePlanningType,
        };
      }

      return {
        macroId: service.macroId,
        scopeId: service.scopeId,
        serviceName: service.serviceName,
        groupId: null,
        groupName: null,
        capacitySource: 'missing',
        productivityValue: null,
        productivityUnit: null,
        workingDaysPerWeek: 5,
        teamCount: 0,
        dailyCapacity: null,
        weeklyCapacity: null,
        professionals: 0,
        auxiliaries: 0,
        totalPeople: 0,
        includeInGantt: setting.includeInGantt,
        includeInLineOfBalance: setting.includeInLineOfBalance,
        includeInWeeklyPlanning: setting.includeInWeeklyPlanning,
        servicePlanningType: setting.servicePlanningType,
      };
    });

    const capacityByKey = new Map(serviceCapacityMap.map((entry) => [serviceKey(entry.macroId, entry.scopeId, entry.serviceName), entry]));
    const groupDemandByPeriod = new Map<string, {
      periodLabel: string;
      periodStart: string | null;
      periodEnd: string | null;
      groupId: string | null;
      groupName: string;
      plannedQuantity: number;
      services: Set<string>;
      capacity: number | null;
    }>();

    for (const row of raw.weeklyPlanServices) {
      const demand = readHouseDemand(row);
      if (demand <= 0) continue;
      const key = serviceKey(row?.macro_id, row?.scope_id, serviceNameFromRow(row));
      const capacity = capacityByKey.get(key);
      if (!capacity?.groupId) continue;

      const periodKey = periodKeyFromRow(row);
      const demandKey = `${periodKey}::${capacity.groupId}`;
      const existing = groupDemandByPeriod.get(demandKey);
      if (existing) {
        existing.plannedQuantity += demand;
        existing.services.add(capacity.serviceName);
      } else {
        groupDemandByPeriod.set(demandKey, {
          periodLabel: periodLabelFromRow(row),
          periodStart: periodStartFromRow(row),
          periodEnd: periodEndFromRow(row),
          groupId: capacity.groupId,
          groupName: capacity.groupName ?? 'Frente sem nome',
          plannedQuantity: demand,
          services: new Set([capacity.serviceName]),
          capacity: capacity.weeklyCapacity,
        });
      }
    }

    const overloadDiagnostics: OverloadDiagnostic[] = Array.from(groupDemandByPeriod.values()).map((item) => {
      const available = item.capacity;
      const overloadQuantity = available === null ? 0 : Math.max(item.plannedQuantity - available, 0);
      const overloadPercent = available && available > 0 ? (overloadQuantity / available) * 100 : 0;
      const status: CapacityDiagnosticStatus =
        available === null || available <= 0
          ? 'missing_productivity'
          : overloadQuantity <= 0
            ? 'ok'
            : overloadPercent <= 20
              ? 'attention'
              : 'overloaded';
      return {
        periodLabel: item.periodLabel,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        groupId: item.groupId,
        groupName: item.groupName,
        plannedQuantity: item.plannedQuantity,
        availableCapacity: available,
        overloadQuantity,
        overloadPercent,
        status,
        servicesCompetingForSameGroup: Array.from(item.services).sort(),
      };
    });

    const serviceKeysWithGroups = new Set(
      serviceCapacityMap
        .filter((entry) => entry.capacitySource === 'work_group')
        .map((entry) => serviceKey(entry.macroId, entry.scopeId, entry.serviceName)),
    );
    const standaloneCapacity = serviceCapacityMap.filter((entry) => entry.capacitySource === 'service_productivity');
    const summary: PlanningCapacitySummary = {
      totalWorkGroups: workGroups.length,
      activeWorkGroups: workGroups.filter((group) => group.active).length,
      servicesWithWorkGroup: serviceKeysWithGroups.size,
      servicesWithoutWorkGroup: serviceCapacityMap.filter((entry) => entry.capacitySource !== 'work_group').length,
      servicesWithoutCapacity: serviceCapacityMap.filter((entry) => entry.capacitySource === 'missing').length,
      overloadedPeriods: overloadDiagnostics.filter((item) => item.status === 'overloaded').length,
      totalPeoplePlanned:
        workGroups.filter((group) => group.active).reduce((sum, group) => sum + group.totalPeople, 0)
        + standaloneCapacity.reduce((sum, entry) => sum + entry.totalPeople, 0),
      totalTeamsPlanned:
        workGroups.filter((group) => group.active).reduce((sum, group) => sum + group.simultaneousTeamCount, 0)
        + standaloneCapacity.reduce((sum, entry) => sum + entry.teamCount, 0),
    };

    return {
      planningServiceSettings,
      workGroups,
      serviceCapacityMap,
      overloadDiagnostics,
      summary,
      diagnostics: raw.diagnostics,
      loading,
    };
  }, [loading, raw]);
}
