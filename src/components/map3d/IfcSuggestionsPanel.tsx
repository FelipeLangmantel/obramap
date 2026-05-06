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
type QuickFilter = "all" | "valid" | "3dtext" | "layer" | "no_service" | "no_house" | "confirmed" | "ignored" | "manual" | "manual_sequence";
type BatchAction = "confirm_valid" | "ignore_no_service";
type ManualHouseAction = "assign" | "assign_sequence" | "clear";
type ManualAssignmentMode = "same_house" | "sequence";
type ManualSequenceOrder = "current" | "entity_id" | "global_id" | "layer_name";

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
  positionSource: string | null;
  placementPosition: { x: number; y: number; z: number } | null;
  placementRefId: string | null;
  axisPlacementRefId: string | null;
  cartesianPointRefId: string | null;
  cartesianPointLinePreview: string | null;
  parsedCartesianPoint: { x: number; y: number; z: number } | null;
  cartesianPointParseFailed: boolean | null;
  placementPositionIgnored: boolean | null;
  placementPositionIgnoreReason: string | null;
  sharedPlacementKey: string | null;
  manualHouseAssignment: boolean | null;
  manualAssignedAt: string | null;
  previousHouseDetectionSource: string | null;
  manualSequenceAssignment: boolean | null;
  manualSequenceStart: number | null;
  manualSequenceIncrement: number | null;
  manualSequenceOrder: string | null;
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
    positionSource: normalizeNullableString(raw.positionSource),
    placementPosition: normalizeIfcPoint(raw.placementPosition),
    placementRefId: normalizeNullableString(raw.placementRefId),
    axisPlacementRefId: normalizeNullableString(raw.axisPlacementRefId),
    cartesianPointRefId: normalizeNullableString(raw.cartesianPointRefId),
    cartesianPointLinePreview: normalizeNullableString(raw.cartesianPointLinePreview),
    parsedCartesianPoint: normalizeIfcPoint(raw.parsedCartesianPoint),
    cartesianPointParseFailed: typeof raw.cartesianPointParseFailed === "boolean" ? raw.cartesianPointParseFailed : null,
    placementPositionIgnored: typeof raw.placementPositionIgnored === "boolean" ? raw.placementPositionIgnored : null,
    placementPositionIgnoreReason: normalizeNullableString(raw.placementPositionIgnoreReason),
    sharedPlacementKey: normalizeNullableString(raw.sharedPlacementKey),
    manualHouseAssignment: typeof raw.manualHouseAssignment === "boolean" ? raw.manualHouseAssignment : null,
    manualAssignedAt: normalizeNullableString(raw.manualAssignedAt),
    previousHouseDetectionSource: normalizeNullableString(raw.previousHouseDetectionSource),
    manualSequenceAssignment: typeof raw.manualSequenceAssignment === "boolean" ? raw.manualSequenceAssignment : null,
    manualSequenceStart: normalizeNullableNumber(raw.manualSequenceStart),
    manualSequenceIncrement: normalizeNullableNumber(raw.manualSequenceIncrement),
    manualSequenceOrder: normalizeNullableString(raw.manualSequenceOrder),
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

function isValidHouseServiceSuggestion(item: IfcSuggestionRow) {
  return item.category === "production" && item.detected_house_number != null && !!item.detected_service_key;
}

function isSuggestedValidHouseServiceSuggestion(item: IfcSuggestionRow) {
  return isValidHouseServiceSuggestion(item) && item.status === "suggested";
}

function getHouseDetectionSource(item: IfcSuggestionRow) {
  return item.raw_properties?.houseDetectionSource || null;
}

function getHouseDetectionSourceLabel(item: IfcSuggestionRow) {
  const source = getHouseDetectionSource(item);
  if (source === "3dtext_proximity") return "3Dtext próximo";
  if (source === "layer") return "Camada";
  if (source === "manual_review") return "Manual/revisao";
  if (source === "manual_sequence") return "Sequência manual";
  return source || "-";
}

function isManualHouseAssignment(item: IfcSuggestionRow) {
  return item.raw_properties?.manualHouseAssignment === true || getHouseDetectionSource(item) === "manual_review" || getHouseDetectionSource(item) === "manual_sequence";
}

function isManualSequenceAssignment(item: IfcSuggestionRow) {
  return item.raw_properties?.manualSequenceAssignment === true || getHouseDetectionSource(item) === "manual_sequence";
}

function isManualHouseAssignmentCandidate(item: IfcSuggestionRow) {
  return (
    item.category === "production" &&
    !!item.detected_service_key &&
    item.detected_house_number == null &&
    item.status === "suggested" &&
    (
      item.raw_properties?.positionSource === "global_placement_ignored" ||
      getHouseDetectionSource(item) === "none" ||
      !getHouseDetectionSource(item)
    )
  );
}

function isManualHouseAssignmentPanelItem(item: IfcSuggestionRow) {
  return isManualHouseAssignmentCandidate(item) || (
    item.category === "production" &&
    !!item.detected_service_key &&
    item.status === "suggested" &&
    isManualHouseAssignment(item)
  );
}

function getHouseNumber(house: HouseLookupRow) {
  const value = house.houseNumber ?? house.house_number ?? house.number;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getIfcEntityNumber(item: IfcSuggestionRow) {
  const value = item.ifc_entity_id || "";
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getManualSequenceOrderValue(item: IfcSuggestionRow, order: ManualSequenceOrder) {
  if (order === "entity_id") return getIfcEntityNumber(item);
  if (order === "global_id") return item.ifc_global_id || null;
  if (order === "layer_name") return item.ifc_layer_name || item.name || null;
  return item.id;
}

function sortManualSequenceItems(
  selectedItems: IfcSuggestionRow[],
  currentList: IfcSuggestionRow[],
  order: ManualSequenceOrder
) {
  const currentIndexById = new Map(currentList.map((item, index) => [item.id, index]));
  if (order === "current") return [...selectedItems].sort((a, b) => (currentIndexById.get(a.id) ?? 0) - (currentIndexById.get(b.id) ?? 0));

  return [...selectedItems].sort((a, b) => {
    const aValue = getManualSequenceOrderValue(a, order);
    const bValue = getManualSequenceOrderValue(b, order);
    if (aValue == null || bValue == null) {
      return (currentIndexById.get(a.id) ?? 0) - (currentIndexById.get(b.id) ?? 0);
    }
    if (typeof aValue === "number" && typeof bValue === "number") return aValue - bValue;
    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" });
  });
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [manualServiceFilter, setManualServiceFilter] = useState<string>("all");
  const [selectedManualIds, setSelectedManualIds] = useState<Set<string>>(new Set());
  const [manualHouseSelectValue, setManualHouseSelectValue] = useState<string>("");
  const [manualHouseInputValue, setManualHouseInputValue] = useState<string>("");
  const [manualAssignmentMode, setManualAssignmentMode] = useState<ManualAssignmentMode>("same_house");
  const [manualSequenceStartValue, setManualSequenceStartValue] = useState<string>("");
  const [manualSequenceIncrementValue, setManualSequenceIncrementValue] = useState<string>("1");
  const [manualSequenceOrder, setManualSequenceOrder] = useState<ManualSequenceOrder>("current");
  const [manualHouseAction, setManualHouseAction] = useState<ManualHouseAction | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
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

  const houseOptions = useMemo(() => {
    return Array.from(new Set(houses.map(getHouseNumber).filter((value): value is number => value != null)))
      .sort((a, b) => a - b);
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

  useEffect(() => {
    const validIds = new Set(items.map(item => item.id));
    setSelectedManualIds(prev => {
      const next = new Set(Array.from(prev).filter(id => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const filteredItems = useMemo(() => {
    const quickFiltered = items.filter(item => {
      if (quickFilter === "valid") return isValidHouseServiceSuggestion(item);
      if (quickFilter === "3dtext") return getHouseDetectionSource(item) === "3dtext_proximity";
      if (quickFilter === "layer") return getHouseDetectionSource(item) === "layer";
      if (quickFilter === "no_service") return !item.detected_service_key;
      if (quickFilter === "no_house") return item.detected_house_number == null;
      if (quickFilter === "confirmed") return item.status === "confirmed";
      if (quickFilter === "ignored") return item.status === "ignored";
      if (quickFilter === "manual") return isManualHouseAssignment(item);
      if (quickFilter === "manual_sequence") return isManualSequenceAssignment(item);
      return true;
    });
    const query = search.trim().toLowerCase();
    if (!query) return quickFiltered;

    return quickFiltered.filter(item => {
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
  }, [items, quickFilter, search]);

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === "suggested") acc.suggested += 1;
        if (item.status === "confirmed") acc.confirmed += 1;
        if (item.status === "ignored") acc.ignored += 1;
        if (item.needs_review) acc.needsReview += 1;
        if (isValidHouseServiceSuggestion(item)) acc.validHouseService += 1;
        if (getHouseDetectionSource(item) === "3dtext_proximity") acc.by3dText += 1;
        if (getHouseDetectionSource(item) === "layer") acc.byLayer += 1;
        return acc;
      },
      { total: 0, suggested: 0, confirmed: 0, ignored: 0, needsReview: 0, validHouseService: 0, by3dText: 0, byLayer: 0 }
    );
  }, [items]);

  const batchCandidates = useMemo(() => ({
    confirmValid: items.filter(isSuggestedValidHouseServiceSuggestion),
    ignoreNoService: items.filter(item => item.status === "suggested" && !item.detected_service_key),
  }), [items]);

  const manualCandidates = useMemo(() => items.filter(isManualHouseAssignmentCandidate), [items]);
  const manualPanelItems = useMemo(() => items.filter(isManualHouseAssignmentPanelItem), [items]);

  const manualServiceSummaries = useMemo(() => {
    const summaries = new Map<string, { key: string; label: string; total: number }>();
    manualCandidates.forEach(item => {
      const key = item.detected_service_key || "sem-servico";
      const existing = summaries.get(key) || {
        key,
        label: item.detected_service_label || item.detected_service_key || "Sem servico",
        total: 0,
      };
      existing.total += 1;
      summaries.set(key, existing);
    });
    return Array.from(summaries.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [manualCandidates]);

  const visibleManualCandidates = useMemo(() => {
    return manualPanelItems.filter(item => manualServiceFilter === "all" || item.detected_service_key === manualServiceFilter);
  }, [manualPanelItems, manualServiceFilter]);

  const selectedManualItems = useMemo(() => {
    return visibleManualCandidates.filter(item => selectedManualIds.has(item.id));
  }, [selectedManualIds, visibleManualCandidates]);

  const selectedManualHouseNumber = useMemo(() => {
    const value = manualHouseSelectValue === "manual" || !manualHouseSelectValue
      ? manualHouseInputValue
      : manualHouseSelectValue;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [manualHouseInputValue, manualHouseSelectValue]);

  const manualSequenceStartNumber = useMemo(() => {
    const parsed = Number(manualSequenceStartValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [manualSequenceStartValue]);

  const manualSequenceIncrementNumber = useMemo(() => {
    const parsed = Number(manualSequenceIncrementValue);
    return Number.isInteger(parsed) && parsed !== 0 ? parsed : null;
  }, [manualSequenceIncrementValue]);

  const manualSequenceOrderedItems = useMemo(() => {
    return sortManualSequenceItems(selectedManualItems, visibleManualCandidates, manualSequenceOrder);
  }, [manualSequenceOrder, selectedManualItems, visibleManualCandidates]);

  const manualSequencePreview = useMemo(() => {
    if (manualSequenceStartNumber == null || manualSequenceIncrementNumber == null) return [];
    return manualSequenceOrderedItems.map((item, index) => ({
      item,
      houseNumber: manualSequenceStartNumber + index * manualSequenceIncrementNumber,
    }));
  }, [manualSequenceIncrementNumber, manualSequenceOrderedItems, manualSequenceStartNumber]);

  const manualSequenceOrderFallback = useMemo(() => {
    if (manualSequenceOrder === "current") return false;
    return selectedManualItems.some(item => getManualSequenceOrderValue(item, manualSequenceOrder) == null);
  }, [manualSequenceOrder, selectedManualItems]);

  const manualSequenceValidation = useMemo(() => {
    if (manualSequenceStartNumber == null) return "Informe uma casa inicial valida.";
    if (manualSequenceIncrementNumber == null) return "Informe incremento valido diferente de zero.";
    if (manualSequencePreview.some(item => item.houseNumber < 1)) return "A sequencia gera casa menor que 1.";
    if (houseOptions.length > 0 && manualSequencePreview.length > houseOptions.length) {
      return "A quantidade selecionada e maior que a quantidade de casas carregadas.";
    }
    const houseOptionSet = new Set(houseOptions);
    if (houseOptions.length > 0 && manualSequencePreview.some(item => !houseOptionSet.has(item.houseNumber))) {
      return "A sequencia gera casas que nao estao na lista de casas carregada.";
    }
    return null;
  }, [houseOptions, manualSequenceIncrementNumber, manualSequencePreview, manualSequenceStartNumber]);

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
        if (item.category === "production" && item.raw_properties?.placementPosition) acc.productionWithPlacementPosition += 1;
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
        productionWithPlacementPosition: 0,
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

  const runBatchAction = async () => {
    if (!batchAction) return;
    if (!projectId) {
      toast.error("Projeto nÃ£o identificado para atualizar sugestÃµes IFC");
      setBatchAction(null);
      return;
    }

    const candidates = batchAction === "confirm_valid" ? batchCandidates.confirmValid : batchCandidates.ignoreNoService;
    if (candidates.length === 0) {
      toast.info("Nenhuma sugestÃ£o IFC encontrada para esta aÃ§Ã£o");
      setBatchAction(null);
      return;
    }

    setBatchSaving(true);
    try {
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;
      const targetStatus: IfcSuggestionStatus = batchAction === "confirm_valid" ? "confirmed" : "ignored";
      const updatePayload: Record<string, unknown> = { status: targetStatus };
      if (targetStatus === "confirmed") updatePayload.needs_review = false;

      const { error } = await elementsTable
        .update(updatePayload)
        .eq("project_id", projectId)
        .in("id", candidates.map(item => item.id));

      if (error) throw error;

      setItems(prev => prev.map(row => (
        candidates.some(item => item.id === row.id)
          ? { ...row, status: targetStatus, needs_review: targetStatus === "confirmed" ? false : row.needs_review }
          : row
      )));
      toast.success(`${candidates.length} sugestÃ£o(Ãµes) IFC atualizada(s)`);
      setBatchAction(null);
      void loadSuggestions();
    } catch (err: any) {
      console.error("[IFC] Falha ao atualizar sugestÃµes em lote", err);
      toast.error("Falha ao atualizar sugestÃµes IFC em lote");
    } finally {
      setBatchSaving(false);
    }
  };

  const toggleManualSelection = (id: string) => {
    setSelectedManualIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisibleManualCandidates = () => {
    const visibleIds = visibleManualCandidates.map(item => item.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedManualIds.has(id));
    setSelectedManualIds(prev => {
      const next = new Set(prev);
      visibleIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const runManualHouseAction = async () => {
    if (!manualHouseAction) return;
    if (!projectId) {
      toast.error("Projeto nao identificado para atribuir casa IFC");
      setManualHouseAction(null);
      return;
    }
    if (selectedManualItems.length === 0) {
      toast.info("Selecione ao menos um elemento IFC");
      setManualHouseAction(null);
      return;
    }
    if (manualHouseAction === "assign" && selectedManualHouseNumber == null) {
      toast.error("Informe uma casa valida para atribuir");
      return;
    }
    if (manualHouseAction === "assign_sequence" && manualSequenceValidation) {
      toast.error(manualSequenceValidation);
      return;
    }

    setManualSaving(true);
    try {
      const elementsTable = supabase.from("project_ifc_elements" as any) as any;
      const now = new Date().toISOString();
      const sequenceHouseById = new Map(manualSequencePreview.map(entry => [entry.item.id, entry.houseNumber]));

      await Promise.all(selectedManualItems.map(async item => {
        const previousHouseDetectionSource = item.raw_properties?.previousHouseDetectionSource || getHouseDetectionSource(item) || "none";
        const sequenceHouseNumber = sequenceHouseById.get(item.id) || null;
        const rawProperties = {
          ...(item.raw_properties || {}),
          houseDetectionSource: manualHouseAction === "assign" ? "manual_review" : manualHouseAction === "assign_sequence" ? "manual_sequence" : previousHouseDetectionSource,
          manualHouseAssignment: manualHouseAction !== "clear",
          manualSequenceAssignment: manualHouseAction === "assign_sequence",
          manualSequenceStart: manualHouseAction === "assign_sequence" ? manualSequenceStartNumber : null,
          manualSequenceIncrement: manualHouseAction === "assign_sequence" ? manualSequenceIncrementNumber : null,
          manualSequenceOrder: manualHouseAction === "assign_sequence" ? manualSequenceOrder : null,
          previousHouseDetectionSource,
          manualAssignedAt: manualHouseAction !== "clear" ? now : item.raw_properties?.manualAssignedAt || null,
          manualClearedAt: manualHouseAction === "clear" ? now : null,
        };

        const updatePayload = manualHouseAction === "assign" || manualHouseAction === "assign_sequence"
          ? {
              detected_house_number: manualHouseAction === "assign_sequence" ? sequenceHouseNumber : selectedManualHouseNumber,
              raw_properties: rawProperties,
              needs_review: true,
              confidence: "manual",
              status: "suggested",
            }
          : {
              detected_house_number: null,
              raw_properties: rawProperties,
              needs_review: true,
              status: "suggested",
            };

        const { error } = await elementsTable
          .update(updatePayload)
          .eq("id", item.id)
          .eq("project_id", projectId);

        if (error) throw error;
      }));

      toast.success(`${selectedManualItems.length} elemento(s) IFC atualizado(s)`);
      setManualHouseAction(null);
      setSelectedManualIds(new Set());
      void loadSuggestions();
    } catch (err: any) {
      console.error("[IFC] Falha na atribuicao manual de casas", err);
      toast.error("Falha ao atualizar atribuicao manual IFC");
    } finally {
      setManualSaving(false);
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

        {/* Sticky action bar — sempre visível com as ações principais de revisão em lote */}
        <div className="sticky top-0 z-20 flex flex-shrink-0 flex-col gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium text-emerald-700">
              {batchCandidates.confirmValid.length} válidas Casa + Serviço
            </span>
            <span className="font-medium text-amber-700">
              {batchCandidates.ignoreNoService.length} sem serviço
            </span>
            <span className="text-muted-foreground">
              Total: {counts.total} • Sugeridos: {counts.suggested}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setBatchAction("confirm_valid")}
              disabled={loading || batchSaving || batchCandidates.confirmValid.length === 0}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Confirmar {batchCandidates.confirmValid.length} válidas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchAction("ignore_no_service")}
              disabled={loading || batchSaving || batchCandidates.ignoreNoService.length === 0}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Ignorar {batchCandidates.ignoreNoService.length} sem serviço
            </Button>
          </div>
        </div>

        {/* Confirmação inline da ação em lote — fica logo abaixo da barra sticky */}
        {batchAction && (
          <div className="flex flex-shrink-0 flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {batchAction === "confirm_valid"
                ? `Confirmar ${batchCandidates.confirmValid.length} sugestao(oes) produtiva(s) com Casa + Servico?`
                : `Ignorar ${batchCandidates.ignoreNoService.length} sugestao(oes) sem servico detectado?`}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" onClick={() => void runBatchAction()} disabled={batchSaving}>
                {batchSaving ? "Aplicando..." : "Confirmar acao"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setBatchAction(null)} disabled={batchSaving}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Bloco de filtros + diagnósticos agora é ROLÁVEL para não empurrar a lista nem esconder a barra de ações */}
        <div className="min-h-0 max-h-[45vh] flex-shrink-0 space-y-3 overflow-y-auto border-b border-border bg-muted/20 p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-5">
            <Counter label="Total" value={counts.total} />
            <Counter label="Sugeridos" value={counts.suggested} />
            <Counter label="Confirmados" value={counts.confirmed} />
            <Counter label="Ignorados" value={counts.ignored} />
            <Counter label="Revisão" value={counts.needsReview} />
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <Counter label="Validas Casa + Servico" value={counts.validHouseService} />
            <Counter label="Por 3Dtext" value={counts.by3dText} />
            <Counter label="Por camada" value={counts.byLayer} />
            <Counter label="Pendentes de revisao" value={counts.needsReview} />
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
            <Counter label="Com placementPosition" value={anchorDiagnostics.productionWithPlacementPosition} />
            <Counter label="Com IFCCARTESIANPOINT" value={anchorDiagnostics.productionWithCartesianPoint} />
            <Counter label="Com IFCLOCALPLACEMENT" value={anchorDiagnostics.productionWithLocalPlacement} />
            <Counter label="Com IFCAXIS2PLACEMENT3D" value={anchorDiagnostics.productionWithAxisPlacement} />
            <Counter label="Com IFCPRODUCTDEFINITIONSHAPE" value={anchorDiagnostics.productionWithProductShape} />
            <Counter label="Com IFCEXTRUDEDAREASOLID" value={anchorDiagnostics.productionWithExtrudedSolid} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              ["all", "Todas"],
              ["valid", "Validas Casa + Servico"],
              ["3dtext", "Por 3Dtext"],
              ["layer", "Por camada"],
              ["no_service", "Sem servico"],
              ["no_house", "Sem casa"],
              ["manual", "Atribuidas manualmente"],
              ["manual_sequence", "Atribuidas por sequencia"],
              ["confirmed", "Confirmadas"],
              ["ignored", "Ignoradas"],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant={quickFilter === value ? "default" : "outline"}
                size="sm"
                onClick={() => setQuickFilter(value as QuickFilter)}
              >
                {label}
              </Button>
            ))}
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
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Revisao em lote</p>
              <p className="text-xs text-muted-foreground">
                Estas acoes so alteram o status em project_ifc_elements. Nenhum vinculo definitivo ou ativacao 3D Real e criada aqui.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchAction("confirm_valid")}
              disabled={loading || batchSaving || batchCandidates.confirmValid.length === 0}
            >
              Confirmar validas Casa + Servico ({batchCandidates.confirmValid.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchAction("ignore_no_service")}
              disabled={loading || batchSaving || batchCandidates.ignoreNoService.length === 0}
            >
              Ignorar sem servico detectado ({batchCandidates.ignoreNoService.length})
            </Button>
          </div>
          {batchAction && (
            <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {batchAction === "confirm_valid"
                  ? `Confirmar ${batchCandidates.confirmValid.length} sugestao(oes) produtiva(s) com Casa + Servico?`
                  : `Ignorar ${batchCandidates.ignoreNoService.length} sugestao(oes) sem servico detectado?`}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" onClick={() => void runBatchAction()} disabled={batchSaving}>
                  {batchSaving ? "Aplicando..." : "Confirmar acao"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setBatchAction(null)} disabled={batchSaving}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Este vínculo ainda não ativa o 3D Real automaticamente. A ativação será feita em etapa futura.
          </p>
          {manualPanelItems.length > 0 && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Atribuicao manual de casas</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Para produtivos com servico detectado e sem casa confiavel. A acao mantem status suggested e exige revisao antes da confirmacao.
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedManualItems.length} selecionado(s) de {visibleManualCandidates.length} visivel(is)
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                {manualServiceSummaries.map(service => (
                  <Counter key={service.key} label={service.label} value={service.total} />
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["same_house", "Mesma casa para selecionados"],
                  ["sequence", "Sequencia de casas"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={manualAssignmentMode === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setManualAssignmentMode(value as ManualAssignmentMode);
                      setManualHouseAction(null);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-[180px_1fr_auto_auto]">
                <select
                  value={manualServiceFilter}
                  onChange={event => {
                    setManualServiceFilter(event.target.value);
                    setSelectedManualIds(new Set());
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">Todos os servicos</option>
                  {manualServiceSummaries.map(service => (
                    <option key={service.key} value={service.key}>{service.label}</option>
                  ))}
                </select>

                {manualAssignmentMode === "same_house" ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={manualHouseSelectValue}
                      onChange={event => setManualHouseSelectValue(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Selecionar casa...</option>
                      {houseOptions.map(houseNumber => (
                        <option key={houseNumber} value={houseNumber}>Casa {houseNumber}</option>
                      ))}
                      <option value="manual">Digitar numero manualmente</option>
                    </select>
                    {(houseOptions.length === 0 || manualHouseSelectValue === "manual") && (
                      <Input
                        type="number"
                        min={1}
                        value={manualHouseInputValue}
                        onChange={event => setManualHouseInputValue(event.target.value)}
                        placeholder="Numero da casa"
                        className="h-9"
                      />
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-4">
                    <Input
                      type="number"
                      min={1}
                      value={manualSequenceStartValue}
                      onChange={event => setManualSequenceStartValue(event.target.value)}
                      placeholder="Casa inicial"
                      className="h-9"
                    />
                    <Input
                      type="number"
                      value={manualSequenceIncrementValue}
                      onChange={event => setManualSequenceIncrementValue(event.target.value)}
                      placeholder="Incremento"
                      className="h-9"
                    />
                    <select
                      value={manualSequenceOrder}
                      onChange={event => setManualSequenceOrder(event.target.value as ManualSequenceOrder)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm md:col-span-2"
                    >
                      <option value="current">Ordem atual da lista</option>
                      <option value="entity_id">Entity ID crescente</option>
                      <option value="global_id">GlobalId</option>
                      <option value="layer_name">Camada/nome</option>
                    </select>
                  </div>
                )}

                <Button type="button" variant="outline" size="sm" onClick={toggleAllVisibleManualCandidates} disabled={visibleManualCandidates.length === 0}>
                  {visibleManualCandidates.length > 0 && visibleManualCandidates.every(item => selectedManualIds.has(item.id))
                    ? "Limpar visiveis"
                    : "Selecionar visiveis"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setManualHouseAction(manualAssignmentMode === "sequence" ? "assign_sequence" : "assign")}
                  disabled={
                    selectedManualItems.length === 0 ||
                    manualSaving ||
                    (manualAssignmentMode === "same_house" && selectedManualHouseNumber == null) ||
                    (manualAssignmentMode === "sequence" && !!manualSequenceValidation)
                  }
                >
                  {manualAssignmentMode === "sequence" ? "Atribuir sequencia aos selecionados" : "Atribuir casa aos selecionados"}
                </Button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setManualHouseAction("clear")}
                  disabled={selectedManualItems.length === 0 || manualSaving}
                >
                  Limpar atribuicao manual dos selecionados
                </Button>
              </div>

              {manualAssignmentMode === "sequence" && (
                <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-xs">
                  <p className="font-medium">Previa da sequencia</p>
                  <p className="mt-1 text-muted-foreground">
                    A sequencia sera gravada como sugestao e ainda precisara de confirmacao.
                  </p>
                  {manualSequenceOrderFallback && (
                    <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                      Alguns itens nao possuem o campo da ordem escolhida. Para esses casos, sera usado fallback seguro pela ordem atual da lista.
                    </p>
                  )}
                  {manualSequenceValidation && selectedManualItems.length > 0 && (
                    <p className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                      {manualSequenceValidation}
                    </p>
                  )}
                  {selectedManualItems.length === 0 ? (
                    <p className="mt-2 text-muted-foreground">Selecione itens para ver a previa.</p>
                  ) : manualSequencePreview.length === 0 ? (
                    <p className="mt-2 text-muted-foreground">Informe casa inicial e incremento para gerar a previa.</p>
                  ) : (
                    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
                      {manualSequencePreview.slice(0, 10).map(entry => (
                        <div key={entry.item.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{entry.item.ifc_entity_id || entry.item.ifc_global_id || entry.item.id}</span>
                          <span className="text-muted-foreground">-&gt;</span>
                          <span>Casa {entry.houseNumber}</span>
                          <span className="truncate text-muted-foreground">{entry.item.ifc_layer_name || entry.item.name || "-"}</span>
                        </div>
                      ))}
                      {manualSequencePreview.length > 10 && (
                        <p className="pt-1 text-muted-foreground">
                          Mostrando 10 de {manualSequencePreview.length} itens selecionados.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {manualHouseAction && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {manualHouseAction === "assign"
                      ? `Atribuir Casa ${selectedManualHouseNumber || "-"} a ${selectedManualItems.length} elemento(s) IFC selecionado(s)?`
                      : manualHouseAction === "assign_sequence"
                        ? `Atribuir casas em sequencia de Casa ${manualSequencePreview[0]?.houseNumber ?? "-"} ate Casa ${manualSequencePreview[manualSequencePreview.length - 1]?.houseNumber ?? "-"} para ${selectedManualItems.length} elemento(s) IFC selecionado(s)?`
                      : `Limpar atribuicao manual de ${selectedManualItems.length} elemento(s) IFC selecionado(s)?`}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button type="button" size="sm" onClick={() => void runManualHouseAction()} disabled={manualSaving}>
                      {manualSaving ? "Aplicando..." : "Confirmar acao"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setManualHouseAction(null)} disabled={manualSaving}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                {visibleManualCandidates.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">Nenhum elemento sem casa neste filtro.</p>
                ) : (
                  visibleManualCandidates.map(item => (
                    <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedManualIds.has(item.id)}
                        onChange={() => toggleManualSelection(item.id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{item.detected_service_label || item.detected_service_key}</span>
                        <span className="ml-2 text-muted-foreground">{item.ifc_entity_id || item.ifc_global_id || item.id}</span>
                        <span className="ml-2 text-muted-foreground">{item.ifc_layer_name || item.name || "-"}</span>
                      </span>
                      <span className="text-muted-foreground">{item.raw_properties?.positionSource || "-"}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
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
  const validHouseService = isValidHouseServiceSuggestion(item);

  return (
    <div className={`rounded-md border bg-background p-3 ${validHouseService ? "border-emerald-300 ring-1 ring-emerald-100" : "border-border"}`}>
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
            {validHouseService && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Casa + Servico</Badge>
            )}
            {isManualHouseAssignment(item) && (
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Manual</Badge>
            )}
            {isManualSequenceAssignment(item) && (
              <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">Sequência</Badge>
            )}
          </div>

          <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
            <p className="truncate"><span className="font-medium text-foreground">GlobalId: </span>{item.ifc_global_id || "-"}</p>
            <p><span className="font-medium text-foreground">Entity: </span>{item.ifc_entity_id || "-"}</p>
            <p><span className="font-medium text-foreground">Tipo: </span>{item.ifc_type || "-"}</p>
            <p><span className="font-medium text-foreground">Categoria: </span>{categoryLabels[item.category || ""] || item.category || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Serviço: </span>{item.detected_service_label || item.detected_service_key || "-"}</p>
            <p><span className="font-medium text-foreground">Casa: </span>{item.detected_house_number ?? "-"}</p>
            <p><span className="font-medium text-foreground">Casa detectada: </span>{item.detected_house_number ?? "-"}</p>
            {isManualHouseAssignment(item) && (
              <p><span className="font-medium text-foreground">Casa manual: </span>{item.detected_house_number ?? "-"}</p>
            )}
            {isManualSequenceAssignment(item) && (
              <p><span className="font-medium text-foreground">Origem manual: </span>Sequência manual</p>
            )}
            <p className="truncate"><span className="font-medium text-foreground">Servico detectado: </span>{item.detected_service_label || item.detected_service_key || "-"}</p>
            <p><span className="font-medium text-foreground">Origem revisao: </span>{getHouseDetectionSourceLabel(item)}</p>
            <p><span className="font-medium text-foreground">Confiança: </span>{item.confidence || "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">Nome IFC: </span>{item.name || "-"}</p>
            <p><span className="font-medium text-foreground">Origem casa: </span>{item.raw_properties?.houseDetectionSource === "3dtext_proximity" ? "3Dtext próximo" : item.raw_properties?.houseDetectionSource || "-"}</p>
            <p><span className="font-medium text-foreground">Âncora 3Dtext: </span>{item.raw_properties?.anchorElementName || "-"}</p>
            <p><span className="font-medium text-foreground">Distância: </span>{item.raw_properties?.anchorDistance != null ? item.raw_properties.anchorDistance.toFixed(2) : "-"}</p>
            <p><span className="font-medium text-foreground">positionSource: </span>{item.raw_properties?.positionSource || "-"}</p>
            <p><span className="font-medium text-foreground">placementPosition: </span>{item.raw_properties?.placementPosition ? `${item.raw_properties.placementPosition.x.toFixed(2)}, ${item.raw_properties.placementPosition.y.toFixed(2)}, ${item.raw_properties.placementPosition.z.toFixed(2)}` : "-"}</p>
            <p className="truncate"><span className="font-medium text-foreground">placement refs: </span>{[item.raw_properties?.placementRefId, item.raw_properties?.axisPlacementRefId, item.raw_properties?.cartesianPointRefId].filter(Boolean).join(" -> ") || "-"}</p>
            <p><span className="font-medium text-foreground">parse IFCCARTESIANPOINT: </span>{item.raw_properties?.cartesianPointParseFailed ? "falhou" : item.raw_properties?.parsedCartesianPoint ? "ok" : "-"}</p>
            <p className="truncate xl:col-span-2"><span className="font-medium text-foreground">Linha IFCCARTESIANPOINT: </span>{item.raw_properties?.cartesianPointLinePreview || "-"}</p>
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
