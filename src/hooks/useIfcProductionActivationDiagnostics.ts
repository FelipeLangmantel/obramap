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

interface ProductionRow {
  scope_id: string | null;
  house_ids: Array<number | string>;
}

interface HouseRow {
  id: string;
  house_number: number;
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

function normalizeHouseIdArray(value: unknown): Array<number | string> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number | string => (
    (typeof item === "number" && Number.isFinite(item)) ||
    (typeof item === "string" && item.trim().length > 0)
  ));
}

function asProductionRows(data: unknown): ProductionRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      scope_id: normalizeNullableString(item.scope_id),
      house_ids: normalizeHouseIdArray(item.house_ids),
    }))
    .filter(item => !!item.scope_id && item.house_ids.length > 0);
}

function asHouseRows(data: unknown): HouseRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      house_number: normalizeNullableNumber(item.house_number),
    }))
    .filter((item): item is HouseRow => !!item.id && item.house_number != null);
}

function buildProductionKey(houseNumber: number, serviceKey: string) {
  return `${houseNumber}::${serviceKey}`;
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
      const productionsTable = supabase.from("productions" as any) as any;

      const [{ data: housesData, error: housesError }, { data: productionsData, error: productionsError }] = await Promise.all([
        housesTable
          .select("id, house_number")
          .eq("project_id", projectId),
        productionsTable
          .select("scope_id, house_ids")
          .eq("project_id", projectId)
          .is("deleted_at", null),
      ]);

      if (housesError) throw housesError;
      if (productionsError) throw productionsError;

      const houseNumberById = new Map(asHouseRows(housesData as unknown).map(house => [house.id, house.house_number]));
      const producedKeys = new Set<string>();

      asProductionRows(productionsData as unknown).forEach(production => {
        if (!production.scope_id) return;
        production.house_ids.forEach(houseRef => {
          const houseNumber = typeof houseRef === "number" ? houseRef : houseNumberById.get(houseRef);
          if (houseNumber == null) return;
          producedKeys.add(buildProductionKey(houseNumber, production.scope_id!));
        });
      });

      setItems(activationReadModel.links.map(link => {
        const houseNumber = link.house_number ?? (link.house_id ? houseNumberById.get(link.house_id) ?? null : null);
        const hasLinkData = houseNumber != null && !!link.trigger_service_key;
        const productionStatus: IfcProductionActivationStatus = !hasLinkData
          ? "pending_link_data"
          : producedKeys.has(buildProductionKey(houseNumber, link.trigger_service_key!))
            ? "would_activate"
            : "not_activated";

        return {
          ...link,
          house_number: houseNumber,
          production_activation_status: productionStatus,
        };
      }));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar diagnóstico de ativação por produção", err);
      const nextError = err instanceof Error ? err : new Error("Falha ao carregar produção real para diagnóstico IFC");
      setError(nextError);
      setItems(activationReadModel.links.map(link => ({
        ...link,
        production_activation_status: "unknown_production_source",
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
