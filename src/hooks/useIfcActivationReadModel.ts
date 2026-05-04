import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type IfcActivationStatus =
  | "ready"
  | "pending_house"
  | "pending_service"
  | "pending_house_and_service";

export interface IfcActivationLink {
  link_id: string;
  project_id: string;
  model_id: string;
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
  activation_status: IfcActivationStatus;
}

export interface IfcActivationSummary {
  total: number;
  ready: number;
  pending_house: number;
  pending_service: number;
  pending_house_and_service: number;
  with_house_id: number;
  with_house_number_only: number;
  unique_houses: number;
  unique_services: number;
}

interface UseIfcActivationReadModelParams {
  projectId?: string | null;
  modelId?: string | null;
  enabled?: boolean;
}

interface ProjectIfcElementLinkRow {
  id: string;
  project_id: string;
  model_id: string;
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
}

const emptySummary: IfcActivationSummary = {
  total: 0,
  ready: 0,
  pending_house: 0,
  pending_service: 0,
  pending_house_and_service: 0,
  with_house_id: 0,
  with_house_number_only: 0,
  unique_houses: 0,
  unique_services: 0,
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asProjectIfcElementLinkRows(data: unknown): ProjectIfcElementLinkRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      project_id: normalizeNullableString(item.project_id) || "",
      model_id: normalizeNullableString(item.model_id) || "",
      ifc_element_id: normalizeNullableString(item.ifc_element_id) || "",
      house_id: normalizeNullableString(item.house_id),
      house_number: normalizeNullableNumber(item.house_number),
      trigger_service_key: normalizeNullableString(item.trigger_service_key),
      trigger_service_label: normalizeNullableString(item.trigger_service_label),
    }))
    .filter(item => item.id && item.project_id && item.model_id && item.ifc_element_id);
}

function getActivationStatus(link: ProjectIfcElementLinkRow): IfcActivationStatus {
  const hasHouse = !!link.house_id || link.house_number != null;
  const hasService = !!link.trigger_service_key;

  if (hasHouse && hasService) return "ready";
  if (!hasHouse && !hasService) return "pending_house_and_service";
  if (!hasHouse) return "pending_house";
  return "pending_service";
}

function mapLink(row: ProjectIfcElementLinkRow): IfcActivationLink {
  return {
    link_id: row.id,
    project_id: row.project_id,
    model_id: row.model_id,
    ifc_element_id: row.ifc_element_id,
    house_id: row.house_id,
    house_number: row.house_number,
    trigger_service_key: row.trigger_service_key,
    trigger_service_label: row.trigger_service_label,
    activation_status: getActivationStatus(row),
  };
}

function summarizeLinks(links: IfcActivationLink[]): IfcActivationSummary {
  const houseKeys = new Set<string>();
  const serviceKeys = new Set<string>();

  links.forEach(link => {
    const houseKey = link.house_id || (link.house_number != null ? String(link.house_number) : "");
    if (houseKey) houseKeys.add(houseKey);
    if (link.trigger_service_key) serviceKeys.add(link.trigger_service_key);
  });

  return {
    total: links.length,
    ready: links.filter(link => link.activation_status === "ready").length,
    pending_house: links.filter(link => link.activation_status === "pending_house").length,
    pending_service: links.filter(link => link.activation_status === "pending_service").length,
    pending_house_and_service: links.filter(link => link.activation_status === "pending_house_and_service").length,
    with_house_id: links.filter(link => !!link.house_id).length,
    with_house_number_only: links.filter(link => !link.house_id && link.house_number != null).length,
    unique_houses: houseKeys.size,
    unique_services: serviceKeys.size,
  };
}

export function useIfcActivationReadModel({
  projectId,
  modelId,
  enabled = true,
}: UseIfcActivationReadModelParams) {
  const [links, setLinks] = useState<IfcActivationLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !projectId) {
      setLinks([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const linksTable = supabase.from("project_ifc_element_links" as any) as any;
      let query = linksTable
        .select(`
          id,
          project_id,
          model_id,
          ifc_element_id,
          house_id,
          house_number,
          trigger_service_key,
          trigger_service_label
        `)
        .eq("project_id", projectId)
        .eq("status", "confirmed");

      if (modelId) query = query.eq("model_id", modelId);

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      setLinks(asProjectIfcElementLinkRows(data as unknown).map(mapLink));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar modelo de leitura de ativação", err);
      const nextError = err instanceof Error ? err : new Error("Falha ao carregar vínculos IFC confirmados");
      setError(nextError);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, modelId, projectId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const summary = useMemo(() => summarizeLinks(links), [links]);

  return {
    loading,
    error,
    links,
    summary,
    refetch,
  };
}
