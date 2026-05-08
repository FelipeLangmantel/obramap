import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIfcActivationReadModel, type IfcActivationLink } from "@/hooks/useIfcActivationReadModel";

export type IfcProductionActivationStatus =
  | "would_activate"
  | "not_activated"
  | "pending_link_data"
  | "unknown_production_source";

export interface IfcProductionActivationItem {
  link_id: string;
  project_id: string;
  model_id: string;
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
  activation_status: IfcActivationLink["activation_status"];
  production_activation_status: IfcProductionActivationStatus;
  resolved_scope_id: string | null;
  resolved_scope_label: string | null;
  service_mapping_source: "exact_scope_match" | "label_suggestion" | "none";
  progress_percent: number | null;
  production_activation_reason:
    | "production_found"
    | "no_consolidated_progress"
    | "scope_not_found_in_house"
    | "service_mapping_missing"
    | "house_not_found"
    | "pending_link_data"
    | "unknown_production_source";
}

export interface IfcProductionActivationSummary {
  total_links: number;
  ready_links: number;
  would_activate: number;
  not_activated: number;
  pending_link_data: number;
  unknown_production_source: number;
  unique_houses: number;
  unique_services: number;
}

interface UseIfcProductionActivationDiagnosticsParams {
  projectId?: string | null;
  modelId?: string | null;
  enabled?: boolean;
}

interface HouseRow {
  id: string;
  house_number: number;
  macros: HouseMacroRow[];
}

interface HouseMacroRow {
  id: string | null;
  name: string | null;
  scopes: HouseScopeRow[];
}

interface HouseScopeRow {
  id: string | null;
  name: string | null;
  progress: number;
}

interface ServiceCatalogRow {
  macro_id: string | null;
  macro_name: string | null;
  scope_id: string | null;
  scope_name: string | null;
}

const emptySummary: IfcProductionActivationSummary = {
  total_links: 0,
  ready_links: 0,
  would_activate: 0,
  not_activated: 0,
  pending_link_data: 0,
  unknown_production_source: 0,
  unique_houses: 0,
  unique_services: 0,
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeProgress(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asHouseMacros(value: unknown): HouseMacroRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((macro): macro is Record<string, unknown> => !!macro && typeof macro === "object")
    .map(macro => ({
      id: normalizeNullableString(macro.id),
      name: normalizeNullableString(macro.name),
      scopes: Array.isArray(macro.scopes)
        ? macro.scopes
          .filter((scope): scope is Record<string, unknown> => !!scope && typeof scope === "object")
          .map(scope => ({
            id: normalizeNullableString(scope.id),
            name: normalizeNullableString(scope.name),
            progress: normalizeProgress(scope.progress),
          }))
        : [],
    }));
}

function asHouseRows(data: unknown): HouseRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      house_number: normalizeNullableNumber(item.house_number),
      macros: asHouseMacros(item.macros),
    }))
    .filter((item): item is HouseRow => !!item.id && item.house_number != null);
}

function asServiceCatalogRows(data: unknown): ServiceCatalogRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      macro_id: normalizeNullableString(item.macro_id),
      macro_name: normalizeNullableString(item.macro_name),
      scope_id: normalizeNullableString(item.scope_id),
      scope_name: normalizeNullableString(item.scope_name),
    }))
    .filter(item => !!item.scope_id);
}

function findConsolidatedScope(house: HouseRow | null, scopeId: string | null) {
  if (!house || !scopeId) return null;

  for (const macro of house.macros) {
    const scope = macro.scopes.find(item => item.id === scopeId);
    if (scope) {
      return {
        macro,
        scope,
      };
    }
  }

  return null;
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasTokenMatch(left: string, right: string) {
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = right.split(" ").filter(Boolean);
  return rightTokens.some(token => token.length >= 3 && leftTokens.has(token));
}

function getServiceLabel(service: ServiceCatalogRow) {
  if (service.macro_name && service.scope_name) return `${service.macro_name} -> ${service.scope_name}`;
  return service.scope_name || service.scope_id || null;
}

function findLabelSuggestion(ifcKey: string, ifcLabel: string | null, services: ServiceCatalogRow[]) {
  const normalizedIfcKey = normalizeText(ifcKey);
  const normalizedIfcLabel = normalizeText(ifcLabel);
  const normalizedIfcText = [normalizedIfcKey, normalizedIfcLabel].filter(Boolean).join(" ");

  return services.find(service => {
    const serviceText = normalizeText([
      service.scope_id,
      service.scope_name,
      service.macro_name,
      getServiceLabel(service),
    ].filter(Boolean).join(" "));
    return hasTokenMatch(serviceText, normalizedIfcText);
  }) || null;
}

function summarizeItems(items: IfcProductionActivationItem[]): IfcProductionActivationSummary {
  const houseKeys = new Set<string>();
  const serviceKeys = new Set<string>();

  items.forEach(item => {
    const houseKey = item.house_id || (item.house_number != null ? String(item.house_number) : "");
    if (houseKey) houseKeys.add(houseKey);
    if (item.trigger_service_key) serviceKeys.add(item.trigger_service_key);
  });

  return {
    total_links: items.length,
    ready_links: items.filter(item => item.activation_status === "ready").length,
    would_activate: items.filter(item => item.production_activation_status === "would_activate").length,
    not_activated: items.filter(item => item.production_activation_status === "not_activated").length,
    pending_link_data: items.filter(item => item.production_activation_status === "pending_link_data").length,
    unknown_production_source: items.filter(item => item.production_activation_status === "unknown_production_source").length,
    unique_houses: houseKeys.size,
    unique_services: serviceKeys.size,
  };
}

export function useIfcProductionActivationDiagnostics({
  projectId,
  modelId,
  enabled = true,
}: UseIfcProductionActivationDiagnosticsParams) {
  const activationReadModel = useIfcActivationReadModel({ projectId, modelId, enabled });
  const [items, setItems] = useState<IfcProductionActivationItem[]>([]);
  const [loadingProduction, setLoadingProduction] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadProductionDiagnostics = useCallback(async () => {
    if (!enabled || !projectId) {
      setItems([]);
      setError(null);
      return;
    }

      setLoadingProduction(true);
    setError(null);
    try {
      const housesTable = supabase.from("houses" as any) as any;
      const servicesTable = supabase.from("project_contract_services" as any) as any;

      const [
        { data: housesData, error: housesError },
        { data: servicesData, error: servicesError },
      ] = await Promise.all([
        housesTable
          .select("id, house_number, macros")
          .eq("project_id", projectId),
        servicesTable
          .select("macro_id, macro_name, scope_id, scope_name")
          .eq("project_id", projectId),
      ]);

      if (housesError) throw housesError;
      if (servicesError) throw servicesError;

      const houses = asHouseRows(housesData as unknown);
      const houseNumberById = new Map(houses.map(house => [house.id, house.house_number]));
      const houseByNumber = new Map(houses.map(house => [house.house_number, house]));
      const serviceCatalog = asServiceCatalogRows(servicesData as unknown);
      const serviceByScopeId = new Map(serviceCatalog.map(service => [service.scope_id, service]));

      setItems(activationReadModel.links.map(link => {
        const houseNumber = link.house_number ?? (link.house_id ? houseNumberById.get(link.house_id) ?? null : null);
        const hasLinkData = houseNumber != null && !!link.trigger_service_key;
        const exactService = link.trigger_service_key ? serviceByScopeId.get(link.trigger_service_key) || null : null;
        const suggestedService = link.trigger_service_key && !exactService
          ? findLabelSuggestion(link.trigger_service_key, link.trigger_service_label, serviceCatalog)
          : null;
        const resolvedScopeId = exactService
          ? link.trigger_service_key
          : suggestedService?.scope_id || null;
        const resolvedScopeLabel = exactService ? getServiceLabel(exactService) : suggestedService ? getServiceLabel(suggestedService) : null;
        const serviceMappingSource = exactService
          ? "exact_scope_match"
          : suggestedService
            ? "label_suggestion"
            : "none";
        const house = houseNumber != null ? houseByNumber.get(houseNumber) || null : null;
        const consolidatedScope = findConsolidatedScope(house, resolvedScopeId);
        const progressPercent = consolidatedScope?.scope.progress ?? null;
        const hasProduction = (progressPercent ?? 0) > 0;
        const productionStatus: IfcProductionActivationStatus = !hasLinkData
          ? "pending_link_data"
          : hasProduction
            ? "would_activate"
            : "not_activated";
        const productionReason: IfcProductionActivationItem["production_activation_reason"] = !hasLinkData
          ? "pending_link_data"
          : !resolvedScopeId
            ? "service_mapping_missing"
            : !house
              ? "house_not_found"
              : !consolidatedScope
                ? "scope_not_found_in_house"
            : hasProduction
              ? "production_found"
              : "no_consolidated_progress";

        return {
          ...link,
          house_number: houseNumber,
          production_activation_status: productionStatus,
          resolved_scope_id: resolvedScopeId,
          resolved_scope_label: resolvedScopeLabel,
          service_mapping_source: serviceMappingSource,
          progress_percent: progressPercent,
          production_activation_reason: productionReason,
        };
      }));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar diagnóstico de ativação por produção", err);
      const nextError = err instanceof Error ? err : new Error("Falha ao carregar produção real para diagnóstico IFC");
      setError(nextError);
      setItems(activationReadModel.links.map(link => ({
        ...link,
        production_activation_status: "unknown_production_source",
        resolved_scope_id: null,
        resolved_scope_label: null,
        service_mapping_source: "none",
        progress_percent: null,
        production_activation_reason: "unknown_production_source",
      })));
    } finally {
      setLoadingProduction(false);
    }
  }, [activationReadModel.links, enabled, projectId]);

  useEffect(() => {
    void loadProductionDiagnostics();
  }, [loadProductionDiagnostics]);

  const refetch = useCallback(async () => {
    await activationReadModel.refetch();
  }, [activationReadModel]);

  const summary = useMemo(() => summarizeItems(items), [items]);

  return {
    loading: activationReadModel.loading || loadingProduction,
    error: error || activationReadModel.error,
    items,
    summary: items.length > 0 ? summary : emptySummary,
    refetch,
  };
}
