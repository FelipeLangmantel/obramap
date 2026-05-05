import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIfcActivationReadModel } from "@/hooks/useIfcActivationReadModel";

export type IfcServiceKeyMatchStatus =
  | "exact_scope_match"
  | "label_suggestion"
  | "no_match"
  | "unknown_service_catalog";

export type IfcServiceKeyMatchConfidence = "high" | "medium" | "low";

export interface IfcServiceKeyMappingDiagnosticItem {
  ifc_service_key: string;
  ifc_service_label: string | null;
  matched_scope_id: string | null;
  matched_service_label: string | null;
  match_status: IfcServiceKeyMatchStatus;
  confidence: IfcServiceKeyMatchConfidence;
}

export interface IfcServiceKeyMappingDiagnosticSummary {
  total_ifc_service_keys: number;
  exact_scope_matches: number;
  label_suggestions: number;
  no_matches: number;
  unknown_service_catalog: number;
  unique_production_scope_ids: number;
}

interface UseIfcServiceKeyMappingDiagnosticsParams {
  projectId?: string | null;
  modelId?: string | null;
  enabled?: boolean;
}

interface ProductionScopeRow {
  scope_id: string | null;
}

interface ServiceCatalogRow {
  macro_id: string | null;
  macro_name: string | null;
  scope_id: string | null;
  scope_name: string | null;
}

const emptySummary: IfcServiceKeyMappingDiagnosticSummary = {
  total_ifc_service_keys: 0,
  exact_scope_matches: 0,
  label_suggestions: 0,
  no_matches: 0,
  unknown_service_catalog: 0,
  unique_production_scope_ids: 0,
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asProductionScopeRows(data: unknown): ProductionScopeRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      scope_id: normalizeNullableString(item.scope_id),
    }))
    .filter(item => !!item.scope_id);
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
  if (service.macro_name && service.scope_name) return `${service.macro_name} → ${service.scope_name}`;
  return service.scope_name || service.scope_id || null;
}

function findLabelSuggestion(
  ifcKey: string,
  ifcLabel: string | null,
  services: ServiceCatalogRow[],
) {
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

function summarizeItems(
  items: IfcServiceKeyMappingDiagnosticItem[],
  productionScopeIds: Set<string>,
): IfcServiceKeyMappingDiagnosticSummary {
  return {
    total_ifc_service_keys: items.length,
    exact_scope_matches: items.filter(item => item.match_status === "exact_scope_match").length,
    label_suggestions: items.filter(item => item.match_status === "label_suggestion").length,
    no_matches: items.filter(item => item.match_status === "no_match").length,
    unknown_service_catalog: items.filter(item => item.match_status === "unknown_service_catalog").length,
    unique_production_scope_ids: productionScopeIds.size,
  };
}

export function useIfcServiceKeyMappingDiagnostics({
  projectId,
  modelId,
  enabled = true,
}: UseIfcServiceKeyMappingDiagnosticsParams) {
  const activationReadModel = useIfcActivationReadModel({ projectId, modelId, enabled });
  const [items, setItems] = useState<IfcServiceKeyMappingDiagnosticItem[]>([]);
  const [summary, setSummary] = useState<IfcServiceKeyMappingDiagnosticSummary>(emptySummary);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!enabled || !projectId) {
      setItems([]);
      setSummary(emptySummary);
      setError(null);
      return;
    }

    setLoadingCatalog(true);
    setError(null);
    try {
      const productionsTable = supabase.from("productions" as any) as any;
      const servicesTable = supabase.from("project_contract_services" as any) as any;

      const [{ data: productionsData, error: productionsError }, { data: servicesData, error: servicesError }] = await Promise.all([
        productionsTable
          .select("scope_id")
          .eq("project_id", projectId)
          .is("deleted_at", null),
        servicesTable
          .select("macro_id, macro_name, scope_id, scope_name")
          .eq("project_id", projectId),
      ]);

      if (productionsError) throw productionsError;
      if (servicesError) throw servicesError;

      const productionScopeIds = new Set(
        asProductionScopeRows(productionsData as unknown)
          .map(row => row.scope_id)
          .filter((scopeId): scopeId is string => !!scopeId)
      );
      const serviceCatalog = asServiceCatalogRows(servicesData as unknown);
      const serviceByScopeId = new Map(serviceCatalog.map(service => [service.scope_id, service]));
      const ifcServices = new Map<string, string | null>();

      activationReadModel.links.forEach(link => {
        if (!link.trigger_service_key) return;
        if (!ifcServices.has(link.trigger_service_key)) {
          ifcServices.set(link.trigger_service_key, link.trigger_service_label);
        }
      });

      const nextItems = Array.from(ifcServices.entries())
        .map(([ifcKey, ifcLabel]) => {
          const exactService = serviceByScopeId.get(ifcKey) || null;
          if (productionScopeIds.has(ifcKey)) {
            return {
              ifc_service_key: ifcKey,
              ifc_service_label: ifcLabel,
              matched_scope_id: ifcKey,
              matched_service_label: exactService ? getServiceLabel(exactService) : null,
              match_status: "exact_scope_match" as const,
              confidence: "high" as const,
            };
          }

          if (serviceCatalog.length === 0) {
            return {
              ifc_service_key: ifcKey,
              ifc_service_label: ifcLabel,
              matched_scope_id: null,
              matched_service_label: null,
              match_status: "unknown_service_catalog" as const,
              confidence: "low" as const,
            };
          }

          const suggestedService = findLabelSuggestion(ifcKey, ifcLabel, serviceCatalog);
          if (suggestedService) {
            return {
              ifc_service_key: ifcKey,
              ifc_service_label: ifcLabel,
              matched_scope_id: suggestedService.scope_id,
              matched_service_label: getServiceLabel(suggestedService),
              match_status: "label_suggestion" as const,
              confidence: "medium" as const,
            };
          }

          return {
            ifc_service_key: ifcKey,
            ifc_service_label: ifcLabel,
            matched_scope_id: null,
            matched_service_label: null,
            match_status: "no_match" as const,
            confidence: "low" as const,
          };
        })
        .sort((a, b) => a.ifc_service_key.localeCompare(b.ifc_service_key));

      setItems(nextItems);
      setSummary(summarizeItems(nextItems, productionScopeIds));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar diagnóstico de mapeamento de serviços", err);
      const nextError = err instanceof Error ? err : new Error("Falha ao carregar diagnóstico de mapeamento IFC");
      setError(nextError);
      setItems([]);
      setSummary(emptySummary);
    } finally {
      setLoadingCatalog(false);
    }
  }, [activationReadModel.links, enabled, projectId]);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const refetch = useCallback(async () => {
    await activationReadModel.refetch();
  }, [activationReadModel]);

  return useMemo(() => ({
    loading: activationReadModel.loading || loadingCatalog,
    error: error || activationReadModel.error,
    items,
    summary,
    refetch,
  }), [activationReadModel.error, activationReadModel.loading, error, items, loadingCatalog, refetch, summary]);
}
