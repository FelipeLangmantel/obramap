import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useIfcActivationReadModel, type IfcActivationLink } from "@/hooks/useIfcActivationReadModel";
import { useIfcProductionActivationDiagnostics } from "@/hooks/useIfcProductionActivationDiagnostics";
import { useIfcServiceKeyMappingDiagnostics } from "@/hooks/useIfcServiceKeyMappingDiagnostics";
import { supabase } from "@/integrations/supabase/client";

type IfcSuggestionStatus = "suggested" | "confirmed" | "ignored";
type StatusFilter = IfcSuggestionStatus | "all";
type CategoryFilter = "production" | "text_annotation" | "unknown" | "all";

interface IfcSuggestionRow {
  id: string;
  model_id: string;
  ifc_global_id: string | null;
  ifc_entity_id: string | null;
  ifc_type: string | null;
  ifc_layer_name: string | null;
  name: string | null;
  detected_service_key: string | null;
  detected_service_label: string | null;
  detected_house_number: number | null;
  category: string | null;
  confidence: string | null;
  needs_review: boolean | null;
  status: IfcSuggestionStatus;
  raw_properties: IfcSuggestionRawProperties | null;
}

interface IfcSuggestionRawProperties {
  reachableRefsCount: number | null;
  cartesianPointCount: number | null;
  hasLocalPlacement: boolean | null;
  hasAxis2Placement3D: boolean | null;
  hasProductDefinitionShape: boolean | null;
  hasExtrudedAreaSolid: boolean | null;
  firstReachedTypes: string[];
  anchorHouseNumber: number | null;
  anchorElementId: string | null;
  anchorElementName: string | null;
  anchorDistance: number | null;
  houseDetectionSource: string | null;
  position: { x: number; y: number; z: number } | null;
  positionPointCount: number | null;
}

interface IfcModelIdRow {
  id: string;
}

interface ConfirmedIfcElementRow {
  id: string;
  company_id: string;
  project_id: string;
  model_id: string;
  detected_house_number: number | null;
  detected_service_key: string | null;
  detected_service_label: string | null;
}

interface IfcElementLinkRow {
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string;
}

interface IfcLinkDiagnosticRow {
  id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
}

interface LinkDiagnosticSummary {
  totalConfirmed: number;
  withHouseId: number;
  onlyHouseNumber: number;
  uniqueHouses: number;
  uniqueServices: number;
  withoutService: number;
  withoutHouse: number;
  groups: Array<{
    serviceKey: string;
    serviceLabel: string;
    total: number;
    houses: string[];
  }>;
}

interface HouseLookupRow {
  id?: string | number | null;
  houseNumber?: number | null;
  house_number?: number | null;
  number?: number | null;
}

interface LinkSyncResult {
  totalConfirmed: number;
  valid: number;
  created: number;
  existing: number;
  ignored: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  modelUrl?: string | null;
  houses?: HouseLookupRow[];
}

const statusLabels: Record<IfcSuggestionStatus, string> = {
  suggested: "Sugerido",
  confirmed: "Confirmado",
  ignored: "Ignorado",
};

const categoryLabels: Record<string, string> = {
  production: "Produtivo",
  text_annotation: "Texto/anotação",
  unknown: "Desconhecido",
};

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeIfcPoint(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  const x = normalizeNullableNumber(point.x);
  const y = normalizeNullableNumber(point.y);
  const z = normalizeNullableNumber(point.z);
  return x != null && y != null && z != null ? { x, y, z } : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asIfcSuggestionRawProperties(value: unknown): IfcSuggestionRawProperties | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  return {
    reachableRefsCount: normalizeNullableNumber(raw.reachableRefsCount),
    cartesianPointCount: normalizeNullableNumber(raw.cartesianPointCount),
    hasLocalPlacement: typeof raw.hasLocalPlacement === "boolean" ? raw.hasLocalPlacement : null,
    hasAxis2Placement3D: typeof raw.hasAxis2Placement3D === "boolean" ? raw.hasAxis2Placement3D : null,
    hasProductDefinitionShape: typeof raw.hasProductDefinitionShape === "boolean" ? raw.hasProductDefinitionShape : null,
    hasExtrudedAreaSolid: typeof raw.hasExtrudedAreaSolid === "boolean" ? raw.hasExtrudedAreaSolid : null,
    firstReachedTypes: normalizeStringArray(raw.firstReachedTypes),
    anchorHouseNumber: normalizeNullableNumber(raw.anchorHouseNumber),
    anchorElementId: normalizeNullableString(raw.anchorElementId),
    anchorElementName: normalizeNullableString(raw.anchorElementName),
    anchorDistance: normalizeNullableNumber(raw.anchorDistance),
    houseDetectionSource: normalizeNullableString(raw.houseDetectionSource),
    position: normalizeIfcPoint(raw.position),
    positionPointCount: normalizeNullableNumber(raw.positionPointCount),
  };
}

function normalizeSuggestionStatus(value: unknown): IfcSuggestionStatus {
  return value === "confirmed" || value === "ignored" ? value : "suggested";
}

function asIfcModelIdRow(data: unknown): IfcModelIdRow | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return typeof row.id === "string" ? { id: row.id } : null;
}

function asIfcSuggestionRows(data: unknown): IfcSuggestionRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      model_id: normalizeNullableString(item.model_id) || "",
      ifc_global_id: normalizeNullableString(item.ifc_global_id),
      ifc_entity_id: normalizeNullableString(item.ifc_entity_id),
      ifc_type: normalizeNullableString(item.ifc_type),
      ifc_layer_name: normalizeNullableString(item.ifc_layer_name),
      name: normalizeNullableString(item.name),
      detected_service_key: normalizeNullableString(item.detected_service_key),
      detected_service_label: normalizeNullableString(item.detected_service_label),
      detected_house_number: normalizeNullableNumber(item.detected_house_number),
      category: normalizeNullableString(item.category),
      confidence: normalizeNullableString(item.confidence),
      needs_review: typeof item.needs_review === "boolean" ? item.needs_review : null,
      status: normalizeSuggestionStatus(item.status),
      raw_properties: asIfcSuggestionRawProperties(item.raw_properties),
    }))
    .filter(item => item.id);
}

function asConfirmedIfcElementRows(data: unknown): ConfirmedIfcElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      company_id: normalizeNullableString(item.company_id) || "",
      project_id: normalizeNullableString(item.project_id) || "",
      model_id: normalizeNullableString(item.model_id) || "",
      detected_house_number: normalizeNullableNumber(item.detected_house_number),
      detected_service_key: normalizeNullableString(item.detected_service_key),
      detected_service_label: normalizeNullableString(item.detected_service_label),
    }))
    .filter(item => item.id && item.company_id && item.project_id && item.model_id);
}

function asIfcElementLinkRows(data: unknown): IfcElementLinkRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      ifc_element_id: normalizeNullableString(item.ifc_element_id) || "",
      house_id: normalizeNullableString(item.house_id),
      house_number: normalizeNullableNumber(item.house_number),
      trigger_service_key: normalizeNullableString(item.trigger_service_key) || "",
    }))
    .filter(item => item.ifc_element_id && item.trigger_service_key);
}

function asIfcLinkDiagnosticRows(data: unknown): IfcLinkDiagnosticRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      id: normalizeNullableString(item.id) || "",
      house_id: normalizeNullableString(item.house_id),
      house_number: normalizeNullableNumber(item.house_number),
      trigger_service_key: normalizeNullableString(item.trigger_service_key),
      trigger_service_label: normalizeNullableString(item.trigger_service_label),
    }))
    .filter(item => item.id);
}

function buildLinkKey(ifcElementId: string, houseId: string | null, houseNumber: number | null, serviceKey: string) {
  return `${ifcElementId}::${houseId || ""}::${houseNumber ?? ""}::${serviceKey}`;
}

function getHouseNumber(house: HouseLookupRow) {
  const value = house.houseNumber ?? house.house_number ?? house.number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusBadgeClass(status: IfcSuggestionStatus) {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (status === "ignored") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function productionActivationStatusLabel(status: string) {
  if (status === "would_activate") return "ativaria";
  if (status === "not_activated") return "não ativaria";
  if (status === "pending_link_data") return "pendente";
  return "fonte desconhecida";
}

function serviceKeyMappingStatusLabel(status: string) {
  if (status === "exact_scope_match") return "match exato";
  if (status === "label_suggestion") return "sugestão por nome";
  if (status === "unknown_service_catalog") return "catálogo desconhecido";
  return "sem correspondência";
}

function summarizeLinkDiagnostics(links: IfcLinkDiagnosticRow[]): LinkDiagnosticSummary {
  const houseKeys = new Set<string>();
  const serviceKeys = new Set<string>();
  const groups = new Map<string, { serviceKey: string; serviceLabel: string; total: number; houses: Set<string> }>();

  links.forEach(link => {
    const houseKey = link.house_id || (link.house_number != null ? String(link.house_number) : "");
    const serviceKey = link.trigger_service_key || "";

    if (houseKey) houseKeys.add(houseKey);
    if (serviceKey) serviceKeys.add(serviceKey);

    const groupKey = serviceKey || "sem-servico";
    const existing = groups.get(groupKey) || {
      serviceKey: groupKey,
      serviceLabel: link.trigger_service_label || serviceKey || "Sem serviço",
      total: 0,
      houses: new Set<string>(),
    };

    existing.total += 1;
    if (link.house_number != null) existing.houses.add(String(link.house_number));
    else if (link.house_id) existing.houses.add("house_id");
    groups.set(groupKey, existing);
  });

  return {
    totalConfirmed: links.length,
    withHouseId: links.filter(link => !!link.house_id).length,
    onlyHouseNumber: links.filter(link => !link.house_id && link.house_number != null).length,
    uniqueHouses: houseKeys.size,
    uniqueServices: serviceKeys.size,
    withoutService: links.filter(link => !link.trigger_service_key).length,
    withoutHouse: links.filter(link => !link.house_id && link.house_number == null).length,
    groups: Array.from(groups.values())
      .map(group => ({
        serviceKey: group.serviceKey,
        serviceLabel: group.serviceLabel,
        total: group.total,
        houses: Array.from(group.houses).sort((a, b) => Number(a) - Number(b)),
      }))
      .sort((a, b) => a.serviceLabel.localeCompare(b.serviceLabel)),
  };
}

export function IfcSuggestionsPanel({ open, onOpenChange, projectId, modelUrl, houses = [] }: Props) {
  const [items, setItems] = useState<IfcSuggestionRow[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("suggested");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingLinks, setSyncingLinks] = useState(false);
  const [linkSyncResult, setLinkSyncResult] = useState<LinkSyncResult | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [linkDiagnostics, setLinkDiagnostics] = useState<LinkDiagnosticSummary | null>(null);
  const activationReadModel = useIfcActivationReadModel({ projectId, modelId, enabled: open });
  const productionActivationDiagnostics = useIfcProductionActivationDiagnostics({ projectId, modelId, enabled: open });
  const serviceKeyMappingDiagnostics = useIfcServiceKeyMappingDiagnostics({ projectId, modelId, enabled: open });

  const houseIdByNumber = useMemo(() => {
    const map = new Map<number, string>();
    houses.forEach(house => {
      const houseNumber = getHouseNumber(house);
      if (houseNumber != null && typeof house.id === "string") map.set(houseNumber, house.id);
    });
    return map;
  }, [houses]);

  const loadSuggestions = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      setModelId(null);
      return;
    }

    setLoading(true);
    try {
      let resolvedModelId: string | null = null;
      const modelTable = supabase.from("project_3d_models" as any) as any;
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;

      if (modelUrl) {
        const { data: modelData, error: modelError } = await modelTable
          .select("id")
          .eq("project_id", projectId)
          .eq("storage_path", modelUrl)
          .eq("model_type", "ifc")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (modelError) throw modelError;
        resolvedModelId = asIfcModelIdRow(modelData as unknown)?.id || null;
      }

      setModelId(resolvedModelId);

      let query = elementsTable
        .select(`
          id,
          model_id,
          ifc_global_id,
          ifc_entity_id,
          ifc_type,
          ifc_layer_name,
          name,
          detected_service_key,
          detected_service_label,
          detected_house_number,
          category,
          confidence,
          needs_review,
          status,
          raw_properties
        `)
        .eq("project_id", projectId)
        .order("ifc_layer_name", { ascending: true })
        .order("ifc_entity_id", { ascending: true });

      if (resolvedModelId) query = query.eq("model_id", resolvedModelId);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (categoryFilter !== "all") query = query.eq("category", categoryFilter);

      const { data, error } = await query;
      if (error) throw error;
      setItems(asIfcSuggestionRows(data as unknown));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar sugestões", err);
      toast.error("Falha ao carregar sugestões IFC");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, modelUrl, projectId, statusFilter]);

  useEffect(() => {
    if (!open) return;
    void loadSuggestions();
  }, [loadSuggestions, open]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;

    return items.filter(item => {
      const haystack = [
        item.ifc_layer_name,
        item.ifc_global_id,
        item.ifc_entity_id,
        item.ifc_type,
        item.detected_service_key,
        item.detected_service_label,
        item.detected_house_number != null ? String(item.detected_house_number) : "",
        item.category,
        item.status,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "suggested") acc.suggested += 1;
        if (item.status === "confirmed") acc.confirmed += 1;
        if (item.status === "ignored") acc.ignored += 1;
        if (item.needs_review) acc.needsReview += 1;
        return acc;
      },
      { total: 0, suggested: 0, confirmed: 0, ignored: 0, needsReview: 0 }
    );
  }, [items]);

  const anchorDiagnostics = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const is3dText = item.category === "text_annotation" && (item.name || "").toLowerCase().includes("3dtext");
        if (is3dText) acc.threeDTexts += 1;
        if (is3dText && (item.detected_house_number != null || item.raw_properties?.anchorHouseNumber != null)) {
          acc.numberedAnchors += 1;
        }
        if (item.category === "production" && item.detected_service_key) acc.productionWithService += 1;
        if (item.category === "production" && item.raw_properties?.houseDetectionSource === "3dtext_proximity") {
          acc.productionWithHouseByProximity += 1;
        }
        if (item.category === "production" && (item.raw_properties?.reachableRefsCount || 0) > 0) acc.productionWithRefs += 1;
        if (item.category === "production" && (item.raw_properties?.cartesianPointCount || 0) > 0) acc.productionWithCartesianPoint += 1;
        if (item.category === "production" && item.raw_properties?.hasLocalPlacement) acc.productionWithLocalPlacement += 1;
        if (item.category === "production" && item.raw_properties?.hasAxis2Placement3D) acc.productionWithAxisPlacement += 1;
        if (item.category === "production" && item.raw_properties?.hasProductDefinitionShape) acc.productionWithProductShape += 1;
        if (item.category === "production" && item.raw_properties?.hasExtrudedAreaSolid) acc.productionWithExtrudedSolid += 1;
        if (item.needs_review) acc.pendingReview += 1;
        return acc;
      },
      {
        threeDTexts: 0,
        numberedAnchors: 0,
        productionWithService: 0,
        productionWithHouseByProximity: 0,
        productionWithRefs: 0,
        productionWithCartesianPoint: 0,
        productionWithLocalPlacement: 0,
        productionWithAxisPlacement: 0,
        productionWithProductShape: 0,
        productionWithExtrudedSolid: 0,
        pendingReview: 0,
      }
    );
  }, [items]);

  const updateStatus = async (item: IfcSuggestionRow, status: IfcSuggestionStatus) => {
    setSavingId(item.id);
    if (!projectId) {
      toast.error("Projeto não identificado para atualizar sugestão IFC");
      setSavingId(null);
      return;
    }

    try {
      const updatePayload: Record<string, unknown> = { status };
      if (status === "confirmed") updatePayload.needs_review = false;
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;

      const { error } = await elementsTable
        .update(updatePayload)
        .eq("id", item.id)
        .eq("project_id", projectId);

      if (error) throw error;

      setItems(prev => prev.map(row => (
        row.id === item.id
          ? { ...row, status, needs_review: status === "confirmed" ? false : row.needs_review }
          : row
      )));
      toast.success(`Sugestão marcada como ${statusLabels[status].toLowerCase()}`);
    } catch (err: any) {
      console.error("[IFC] Falha ao atualizar sugestão", err);
      toast.error("Falha ao atualizar sugestão IFC");
    } finally {
      setSavingId(null);
    }
  };

  const syncConfirmedLinks = async () => {
    if (!projectId) {
      toast.error("Projeto não identificado para gerar vínculos IFC");
      return;
    }

    setSyncingLinks(true);
    try {
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;
      const linksTable = supabase.from("project_ifc_element_links" as any) as any;

      let confirmedQuery = elementsTable
        .select(`
          id,
          company_id,
          project_id,
          model_id,
          detected_house_number,
          detected_service_key,
          detected_service_label
        `)
        .eq("project_id", projectId)
        .eq("status", "confirmed")
        .eq("category", "production");

      if (modelId) confirmedQuery = confirmedQuery.eq("model_id", modelId);

      const { data: confirmedData, error: confirmedError } = await confirmedQuery;
      if (confirmedError) throw confirmedError;

      const confirmedElements = asConfirmedIfcElementRows(confirmedData as unknown);
      const validElements = confirmedElements.filter(item => (
        item.detected_house_number != null && !!item.detected_service_key
      ));
      const ignored = confirmedElements.length - validElements.length;

      let existingQuery = linksTable
        .select("ifc_element_id, house_id, house_number, trigger_service_key")
        .eq("project_id", projectId);

      if (modelId) existingQuery = existingQuery.eq("model_id", modelId);

      const { data: existingData, error: existingError } = await existingQuery;
      if (existingError) throw existingError;

      const existingLinks = asIfcElementLinkRows(existingData as unknown);
      const existingKeys = new Set(
        existingLinks.map(link => buildLinkKey(link.ifc_element_id, link.house_id, link.house_number, link.trigger_service_key))
      );
      const rowsToInsert = validElements
        .map(item => {
          const houseId = item.detected_house_number != null ? houseIdByNumber.get(item.detected_house_number) || null : null;
          return { item, houseId };
        })
        .filter(({ item, houseId }) => !existingKeys.has(buildLinkKey(item.id, houseId, item.detected_house_number, item.detected_service_key!)))
        .map(({ item, houseId }) => ({
          company_id: item.company_id,
          project_id: item.project_id,
          model_id: item.model_id,
          ifc_element_id: item.id,
          house_id: houseId,
          house_number: item.detected_house_number,
          trigger_service_key: item.detected_service_key,
          trigger_service_label: item.detected_service_label || item.detected_service_key,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await linksTable.insert(rowsToInsert);
        if (insertError) throw insertError;
      }

      const result = {
        totalConfirmed: confirmedElements.length,
        valid: validElements.length,
        created: rowsToInsert.length,
        existing: validElements.length - rowsToInsert.length,
        ignored,
      };
      setLinkSyncResult(result);
      toast.success(`${result.created} vínculo(s) IFC criado(s)`);
    } catch (err: any) {
      console.error("[IFC] Falha ao gerar vínculos confirmados", err);
      toast.error("Falha ao gerar vínculos IFC confirmados");
    } finally {
      setSyncingLinks(false);
    }
  };

  const loadLinkDiagnostics = async () => {
    if (!projectId) {
      toast.error("Projeto não identificado para carregar diagnóstico IFC");
      return;
    }

    setLoadingDiagnostics(true);
    try {
      const linksTable = supabase.from("project_ifc_element_links" as any) as any;
      let query = linksTable
        .select("id, house_id, house_number, trigger_service_key, trigger_service_label")
        .eq("project_id", projectId)
        .eq("status", "confirmed");

      if (modelId) query = query.eq("model_id", modelId);

      const { data, error } = await query;
      if (error) throw error;

      const links = asIfcLinkDiagnosticRows(data as unknown);
      setLinkDiagnostics(summarizeLinkDiagnostics(links));
    } catch (err: any) {
      console.error("[IFC] Falha ao carregar diagnóstico de vínculos", err);
      toast.error("Falha ao carregar diagnóstico de vínculos IFC");
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const activationItems = useMemo(() => {
    const groups = new Map<string, { serviceLabel: string; houseLabel: string; status: "pronto" | "pendente"; total: number }>();

    activationReadModel.links.forEach((link: IfcActivationLink) => {
      const serviceLabel = link.trigger_service_label || link.trigger_service_key || "sem serviço";
      const houseLabel = link.house_number != null ? String(link.house_number) : link.house_id ? "house_id" : "sem casa";
      const status = link.activation_status === "ready" ? "pronto" : "pendente";
      const key = `${serviceLabel}::${houseLabel}::${status}`;
      const existing = groups.get(key) || { serviceLabel, houseLabel, status, total: 0 };
      existing.total += 1;
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .map(([key, group]) => ({ key, ...group }))
      .sort((a, b) => a.serviceLabel.localeCompare(b.serviceLabel) || a.houseLabel.localeCompare(b.houseLabel));
  }, [activationReadModel.links]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>Sugestões IFC</DialogTitle>
          <DialogDescription>
            Revise sugestões persistidas do inventário IFC. Confirmar aqui não cria vínculo definitivo do 3D Real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-shrink-0 space-y-3 border-b border-border bg-muted/20 p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <Counter label="Total" value={counts.total} />
            <Counter label="Sugeridos" value={counts.suggested} />
            <Counter label="Confirmados" value={counts.confirmed} />
            <Counter label="Ignorados" value={counts.ignored} />
            <Counter label="Revisão" value={counts.needsReview} />
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-5">
            <Counter label="Textos 3D" value={anchorDiagnostics.threeDTexts} />
            <Counter label="Âncoras numeradas" value={anchorDiagnostics.numberedAnchors} />
            <Counter label="Produtivos com serviço" value={anchorDiagnostics.productionWithService} />
            <Counter label="Casa por proximidade" value={anchorDiagnostics.productionWithHouseByProximity} />
            <Counter label="Pendentes de revisão" value={anchorDiagnostics.pendingReview} />
          </div>
          {anchorDiagnostics.numberedAnchors > 0 && anchorDiagnostics.productionWithHouseByProximity === 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Textos 3D numerados foram detectados, mas as sugestões salvas ainda não têm casa por proximidade. Reimporte o IFC após esta correção para recalcular as sugestões.
            </p>
          )}
          <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <Counter label="Produtivos com refs" value={anchorDiagnostics.productionWithRefs} />
            <Counter label="Com IFCCARTESIANPOINT" value={anchorDiagnostics.productionWithCartesianPoint} />
            <Counter label="Com IFCLOCALPLACEMENT" value={anchorDiagnostics.productionWithLocalPlacement} />
            <Counter label="Com IFCAXIS2PLACEMENT3D" value={anchorDiagnostics.productionWithAxisPlacement} />
            <Counter label="Com IFCPRODUCTDEFINITIONSHAPE" value={anchorDiagnostics.productionWithProductShape} />
            <Counter label="Com IFCEXTRUDEDAREASOLID" value={anchorDiagnostics.productionWithExtrudedSolid} />
          </div>

          <div className="grid gap-2 md:grid-cols-[180px_220px_1fr_auto_auto]">
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="suggested">Sugeridos</option>
              <option value="confirmed">Confirmados</option>
              <option value="ignored">Ignorados</option>
            </select>
            <select
              value={categoryFilter}
              onChange={event => setCategoryFilter(event.target.value as CategoryFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Todas as categorias</option>
              <option value="production">Produtivo</option>
              <option value="text_annotation">Texto/anotação</option>
              <option value="unknown">Desconhecido</option>
            </select>
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por camada, casa, serviço, GlobalId ou entity id..."
              className="h-9"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void loadSuggestions()} disabled={loading}>
              Atualizar
            </Button>
            <Button type="button" size="sm" onClick={() => void syncConfirmedLinks()} disabled={loading || syncingLinks}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {syncingLinks ? "Gerando..." : "Gerar vínculos confirmados"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Este vínculo ainda não ativa o 3D Real automaticamente. A ativação será feita em etapa futura.
          </p>
          {linkSyncResult && (
            <div className="grid gap-2 text-xs sm:grid-cols-5">
              <Counter label="Confirmados" value={linkSyncResult.totalConfirmed} />
              <Counter label="Válidos" value={linkSyncResult.valid} />
              <Counter label="Criados" value={linkSyncResult.created} />
              <Counter label="Já existiam" value={linkSyncResult.existing} />
              <Counter label="Ignorados" value={linkSyncResult.ignored} />
            </div>
          )}
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Diagnóstico de vínculos confirmados</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este diagnóstico ainda não altera a visibilidade do 3D Real. A ativação visual será feita em etapa futura.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadLinkDiagnostics()}
                disabled={loadingDiagnostics}
              >
                {loadingDiagnostics ? "Atualizando..." : "Atualizar diagnóstico"}
              </Button>
            </div>
            {linkDiagnostics && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
                  <Counter label="Total" value={linkDiagnostics.totalConfirmed} />
                  <Counter label="Com house_id" value={linkDiagnostics.withHouseId} />
                  <Counter label="Só house_number" value={linkDiagnostics.onlyHouseNumber} />
                  <Counter label="Casas" value={linkDiagnostics.uniqueHouses} />
                  <Counter label="Serviços" value={linkDiagnostics.uniqueServices} />
                  <Counter label="Sem serviço" value={linkDiagnostics.withoutService} />
                  <Counter label="Sem casa" value={linkDiagnostics.withoutHouse} />
                </div>
                <div className="space-y-1.5">
                  {linkDiagnostics.groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum vínculo confirmado encontrado.</p>
                  ) : (
                    linkDiagnostics.groups.map(group => (
                      <div key={group.serviceKey} className="rounded border border-border bg-muted/30 px-3 py-2 text-xs">
                        <span className="font-medium">Serviço: {group.serviceLabel}</span>
                        <span className="text-muted-foreground"> - {group.total} vínculo(s) - casas: {group.houses.join(", ") || "-"}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Diagnóstico de ativação por serviço/casa</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este diagnóstico apenas prepara a ativação futura. Ele ainda não altera a visibilidade do 3D Real.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void activationReadModel.refetch()}
                disabled={activationReadModel.loading}
              >
                {activationReadModel.loading ? "Atualizando..." : "Atualizar diagnóstico"}
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <Counter label="Total" value={activationReadModel.summary.total} />
                <Counter
                  label="Com casa"
                  value={activationReadModel.summary.with_house_id + activationReadModel.summary.with_house_number_only}
                />
                <Counter
                  label="Com serviço"
                  value={activationReadModel.summary.total - activationReadModel.summary.pending_service - activationReadModel.summary.pending_house_and_service}
                />
                <Counter label="Prontos" value={activationReadModel.summary.ready} />
                <Counter
                  label="Sem casa"
                  value={activationReadModel.summary.pending_house + activationReadModel.summary.pending_house_and_service}
                />
                <Counter
                  label="Sem serviço"
                  value={activationReadModel.summary.pending_service + activationReadModel.summary.pending_house_and_service}
                />
              </div>
              {activationReadModel.error && (
                <p className="text-xs text-destructive">Falha ao carregar modelo de leitura de ativação IFC.</p>
              )}
              <div className="space-y-1.5">
                {activationItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum vínculo confirmado encontrado para diagnóstico de ativação.</p>
                ) : (
                  activationItems.map(item => (
                    <div key={item.key} className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs">
                      <span><span className="font-medium">Serviço:</span> {item.serviceLabel}</span>
                      <span><span className="font-medium">Casa:</span> {item.houseLabel}</span>
                      <span><span className="font-medium">Vínculos:</span> {item.total}</span>
                      <Badge variant={item.status === "pronto" ? "default" : "outline"} className="text-[10px]">
                        {item.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Diagnóstico com produção real</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este diagnóstico ainda não altera a visibilidade do 3D Real. Ele apenas indica o que ativaria com a produção atual.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void productionActivationDiagnostics.refetch()}
                disabled={productionActivationDiagnostics.loading}
              >
                {productionActivationDiagnostics.loading ? "Atualizando..." : "Atualizar diagnóstico"}
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
                <Counter label="Total" value={productionActivationDiagnostics.summary.total_links} />
                <Counter label="Ativariam" value={productionActivationDiagnostics.summary.would_activate} />
                <Counter label="Não ativariam" value={productionActivationDiagnostics.summary.not_activated} />
                <Counter label="Pendentes" value={productionActivationDiagnostics.summary.pending_link_data} />
                <Counter label="Fonte desconhecida" value={productionActivationDiagnostics.summary.unknown_production_source} />
              </div>
              {productionActivationDiagnostics.error && (
                <p className="text-xs text-destructive">Falha ao carregar diagnóstico IFC com produção real.</p>
              )}
              <div className="space-y-1.5">
                {productionActivationDiagnostics.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum vínculo IFC disponível para cruzar com produção real.</p>
                ) : (
                  productionActivationDiagnostics.items.map(item => (
                    <div key={item.link_id} className="flex flex-wrap items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 text-xs">
                      <span><span className="font-medium">Serviço:</span> {item.trigger_service_label || item.trigger_service_key || "sem serviço"}</span>
                      <span><span className="font-medium">Casa:</span> {item.house_number ?? (item.house_id ? "house_id" : "sem casa")}</span>
                      <span><span className="font-medium">Status:</span> {productionActivationStatusLabel(item.production_activation_status)}</span>
                      <Badge variant={item.production_activation_status === "would_activate" ? "default" : "outline"} className="text-[10px]">
                        {productionActivationStatusLabel(item.production_activation_status)}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold">Diagnóstico de mapeamento de serviços IFC</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este diagnóstico apenas identifica possíveis correspondências. Ele ainda não altera vínculos, produção ou ativação visual.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void serviceKeyMappingDiagnostics.refetch()}
                disabled={serviceKeyMappingDiagnostics.loading}
              >
                {serviceKeyMappingDiagnostics.loading ? "Atualizando..." : "Atualizar diagnóstico"}
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
                <Counter label="Total chaves IFC" value={serviceKeyMappingDiagnostics.summary.total_ifc_service_keys} />
                <Counter label="Matches exatos" value={serviceKeyMappingDiagnostics.summary.exact_scope_matches} />
                <Counter label="Sugestões por nome" value={serviceKeyMappingDiagnostics.summary.label_suggestions} />
                <Counter label="Sem correspondência" value={serviceKeyMappingDiagnostics.summary.no_matches} />
                <Counter label="Catálogo desconhecido" value={serviceKeyMappingDiagnostics.summary.unknown_service_catalog} />
              </div>
              {serviceKeyMappingDiagnostics.error && (
                <p className="text-xs text-destructive">Falha ao carregar diagnóstico de mapeamento de serviços IFC.</p>
              )}
              <div className="space-y-1.5">
                {serviceKeyMappingDiagnostics.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma chave de serviço IFC encontrada para diagnóstico.</p>
                ) : (
                  serviceKeyMappingDiagnostics.items.map(item => (
                    <div key={item.ifc_service_key} className="rounded border border-border bg-muted/30 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span><span className="font-medium">IFC key:</span> {item.ifc_service_key}</span>
                        <span><span className="font-medium">IFC label:</span> {item.ifc_service_label || "-"}</span>
                        <span><span className="font-medium">Scope/serviço sugerido:</span> {item.matched_scope_id || "-"}{item.matched_service_label ? ` - ${item.matched_service_label}` : ""}</span>
                        <span><span className="font-medium">Status:</span> {serviceKeyMappingStatusLabel(item.match_status)}</span>
                        <Badge variant={item.confidence === "high" ? "default" : "outline"} className="text-[10px]">
                          {item.confidence}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          {!modelId && modelUrl && (
            <p className="text-xs text-muted-foreground">
              Modelo IFC persistido ainda não localizado; exibindo sugestões do projeto.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Carregando sugestões...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma sugestão IFC encontrada.</div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  saving={savingId === item.id}
                  onConfirm={() => updateStatus(item, "confirmed")}
                  onIgnore={() => updateStatus(item, "ignored")}
                  onSuggest={() => updateStatus(item, "suggested")}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
    </div>
  );
}

function SuggestionCard({
  item,
  saving,
  onConfirm,
  onIgnore,
  onSuggest,
}: {
  item: IfcSuggestionRow;
  saving: boolean;
  onConfirm: () => void;
  onIgnore: () => void;
  onSuggest: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="max-w-full truncate text-sm font-semibold">
              {item.ifc_layer_name || item.name || item.ifc_type || "Elemento IFC"}
            </h4>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(item.status)}`}>
              {statusLabels[item.status]}
            </span>
            {item.needs_review && (
              <Badge variant="outline" className="text-[10px]">needs_review</Badge>
            )}
          </div>

          <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
            <p className="truncate"><span className="font-medium text-foreground">GlobalId: </span>{item.ifc_global_id || "-"}</p>
            <p><span className="font-medium text-foreground">Entity: </span>{item.ifc_entity_id || "-"}</p>
            <p><span className="font-medium text-foreground">Tipo: </span>{item.ifc_type || "-"}</p>
            <p><span className="font-medium text-foreground">Categoria: </span>{categoryLabels[item.category || ""] || item.category || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Serviço: </span>{item.detected_service_label || item.detected_service_key || "-"}</p>
            <p><span className="font-medium text-foreground">Casa: </span>{item.detected_house_number ?? "-"}</p>
            <p><span className="font-medium text-foreground">Confiança: </span>{item.confidence || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Nome IFC: </span>{item.name || "-"}</p>
            <p><span className="font-medium text-foreground">Origem casa: </span>{item.raw_properties?.houseDetectionSource === "3dtext_proximity" ? "3Dtext próximo" : item.raw_properties?.houseDetectionSource || "-"}</p>
            <p><span className="font-medium text-foreground">Âncora 3Dtext: </span>{item.raw_properties?.anchorElementName || "-"}</p>
            <p><span className="font-medium text-foreground">Distância: </span>{item.raw_properties?.anchorDistance != null ? item.raw_properties.anchorDistance.toFixed(2) : "-"}</p>
            <p><span className="font-medium text-foreground">Pontos posição: </span>{item.raw_properties?.positionPointCount ?? "-"}</p>
            <p><span className="font-medium text-foreground">Refs: </span>{item.raw_properties?.reachableRefsCount ?? "-"}</p>
            <p><span className="font-medium text-foreground">IFCCARTESIANPOINT: </span>{item.raw_properties?.cartesianPointCount ?? "-"}</p>
            <p><span className="font-medium text-foreground">IFCLOCALPLACEMENT: </span>{item.raw_properties?.hasLocalPlacement ? "sim" : "não"}</p>
            <p><span className="font-medium text-foreground">IFCAXIS2PLACEMENT3D: </span>{item.raw_properties?.hasAxis2Placement3D ? "sim" : "não"}</p>
            <p><span className="font-medium text-foreground">IFCPRODUCTDEFINITIONSHAPE: </span>{item.raw_properties?.hasProductDefinitionShape ? "sim" : "não"}</p>
            <p><span className="font-medium text-foreground">IFCEXTRUDEDAREASOLID: </span>{item.raw_properties?.hasExtrudedAreaSolid ? "sim" : "não"}</p>
            <p className="truncate xl:col-span-2"><span className="font-medium text-foreground">Tipos alcançados: </span>{item.raw_properties?.firstReachedTypes.join(", ") || "-"}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={onConfirm} disabled={saving || item.status === "confirmed"}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Confirmar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onIgnore} disabled={saving || item.status === "ignored"}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Ignorar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onSuggest} disabled={saving || item.status === "suggested"}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Sugerido
          </Button>
        </div>
      </div>
    </div>
  );
}
