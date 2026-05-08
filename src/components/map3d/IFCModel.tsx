import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIfcProductionActivationDiagnostics } from "@/hooks/useIfcProductionActivationDiagnostics";

type IfcServiceOption = {
  id: string;
  label: string;
  macro_id: string;
  scope_id: string;
};

interface Props {
  url: string;
  projectId?: string | null;
  companyId?: string | null;
  onLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  onMeshClick?: (mesh: THREE.Object3D) => void;
  selectedMeshKey?: string | null;
  ifcRealModeActive?: boolean;
  houseOptions?: number[];
  serviceOptions?: IfcServiceOption[];
}

interface IfcInventoryItem {
  id: string;
  type: string;
  globalId: string;
  name: string;
  quotedValues: string[];
  layerNames: string[];
  primaryLayerName: string | null;
  reachableRefs: string[];
  detectedServiceKey: string | null;
  detectedServiceLabel: string | null;
  detectedHouseNumber: number | null;
  semanticConfidence: "high" | "medium" | "low";
  semanticNeedsReview: boolean;
  category: "production" | "text" | "unnamed";
  position: IfcPoint | null;
  positionPointCount: number;
  positionSource: "local_placement" | "reachable_points" | "global_placement_ignored" | "none";
  placementPosition: IfcPoint | null;
  placementRefId: string | null;
  axisPlacementRefId: string | null;
  cartesianPointRefId: string | null;
  cartesianPointLinePreview: string | null;
  parsedCartesianPoint: IfcPoint | null;
  cartesianPointParseFailed: boolean;
  placementPositionIgnored: boolean;
  placementPositionIgnoreReason: string | null;
  sharedPlacementKey: string | null;
  anchorHouseNumber: number | null;
  anchorElementId: string | null;
  anchorElementName: string | null;
  anchorDistance: number | null;
  houseDetectionSource: "layer" | "3dtext_proximity" | "none";
  refDiagnostics: IfcRefDiagnostics;
  rawLine: string;
}

interface IfcLayerAssignment {
  id: string;
  name: string;
  refs: string[];
  rawLine: string;
}

interface IfcPoint {
  x: number;
  y: number;
  z: number;
}

interface IfcRefDiagnostics {
  reachableRefsCount: number;
  cartesianPointCount: number;
  hasLocalPlacement: boolean;
  hasAxis2Placement3D: boolean;
  hasProductDefinitionShape: boolean;
  hasExtrudedAreaSolid: boolean;
  firstReachedTypes: string[];
}

type IfcInventoryFilter = "all" | "production" | "text" | "unnamed";
type IfcInventorySaveStatus = "idle" | "saving" | "saved" | "error";
type IfcVisualStatus = "idle" | "loading" | "ready" | "error";
type Project3DModelIdRow = { id: string };
type ProtectedIfcElementRow = { ifc_global_id: string | null; ifc_entity_id: string | null };
type IfcPersistedStatus = "suggested" | "confirmed" | "ignored";
type IfcInspectGroupMode = "none" | "house" | "service";
type Ifc3DTestControlKey = "91-radier" | "91-paredes" | "92-radier" | "92-paredes";
type Ifc3DTestOverlay = {
  key: Ifc3DTestControlKey;
  label: string;
  entityId: string;
};
type IfcProductionOverlay = {
  key: string;
  label: string;
  entityId: string;
  progressPercent: number;
  role: "context" | "production";
};
type IfcRealMaterialSource = "original" | "original_array" | "fallback";
type IfcPersistedElementRow = {
  id: string;
  model_id: string | null;
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
  status: IfcPersistedStatus;
  raw_properties: Record<string, unknown> | null;
};
type IfcFinalLinkRow = {
  id: string | null;
  model_id: string | null;
  ifc_element_id: string;
  house_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
  status: IfcPersistedStatus;
};
type Ifc3DTestLinkedElementRow = {
  ifc_element_id: string;
  ifc_entity_id: string | null;
  ifc_global_id: string | null;
  house_number: number | null;
  trigger_service_key: string | null;
  trigger_service_label: string | null;
  status: IfcPersistedStatus;
};
type IfcVisualInspectSelection = {
  uuid: string;
  objectName: string | null;
  objectType: string;
  parentName: string | null;
  parentUuid: string | null;
  entityId: string | null;
  globalId: string | null;
  center: IfcPoint | null;
  size: IfcPoint | null;
  hitRootOrGroup: boolean;
  identificationError: string | null;
  geometryAttributes: string[];
  faceIndex: number | null;
};
type PersistDiagnostics = {
  authUserId: string | null;
  authUserEmail: string | null;
  projectId: string | null;
  companyId: string | null;
  profileCompanyId: string | null;
  projectCompanyId: string | null;
  companyMatches: boolean | null;
  effectiveCompanyId: string | null;
  modelPayloadCompanyId: string | null;
  modelPayloadProjectId: string | null;
  stage: string;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: string | null;
  errorHint: string | null;
  nonFatal: boolean;
};

function asProject3DModelIdRow(data: unknown): Project3DModelIdRow | null {
  if (!data || typeof data !== "object") return null;

  const maybeRow = data as Record<string, unknown>;
  return typeof maybeRow.id === "string" ? { id: maybeRow.id } : null;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeIfcPersistedStatus(value: unknown): IfcPersistedStatus {
  return value === "confirmed" || value === "ignored" ? value : "suggested";
}

function normalizeRawProperties(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asProtectedIfcElementRows(data: unknown): ProtectedIfcElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row): ProtectedIfcElementRow => ({
      ifc_global_id: normalizeNullableString(row.ifc_global_id),
      ifc_entity_id: normalizeNullableString(row.ifc_entity_id),
    }));
}

function asIfcPersistedElementRows(data: unknown): IfcPersistedElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row): IfcPersistedElementRow | null => {
      const id = normalizeNullableString(row.id);
      if (!id) return null;

      return {
        id,
        model_id: normalizeNullableString(row.model_id),
        ifc_global_id: normalizeNullableString(row.ifc_global_id),
        ifc_entity_id: normalizeNullableString(row.ifc_entity_id),
        ifc_type: normalizeNullableString(row.ifc_type),
        ifc_layer_name: normalizeNullableString(row.ifc_layer_name),
        name: normalizeNullableString(row.name),
        detected_service_key: normalizeNullableString(row.detected_service_key),
        detected_service_label: normalizeNullableString(row.detected_service_label),
        detected_house_number: normalizeNullableNumber(row.detected_house_number),
        category: normalizeNullableString(row.category),
        confidence: normalizeNullableString(row.confidence),
        needs_review: normalizeBoolean(row.needs_review),
        status: normalizeIfcPersistedStatus(row.status),
        raw_properties: normalizeRawProperties(row.raw_properties),
      };
    })
    .filter((row): row is IfcPersistedElementRow => !!row);
}

function asIfcFinalLinkRows(data: unknown): IfcFinalLinkRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row): IfcFinalLinkRow | null => {
      const ifcElementId = normalizeNullableString(row.ifc_element_id);
      if (!ifcElementId) return null;

      return {
        id: normalizeNullableString(row.id),
        model_id: normalizeNullableString(row.model_id),
        ifc_element_id: ifcElementId,
        house_id: normalizeNullableString(row.house_id),
        house_number: normalizeNullableNumber(row.house_number),
        trigger_service_key: normalizeNullableString(row.trigger_service_key),
        trigger_service_label: normalizeNullableString(row.trigger_service_label),
        status: normalizeIfcPersistedStatus(row.status),
      };
    })
    .filter((row): row is IfcFinalLinkRow => !!row);
}

function buildIfc3DTestLinkedElements(elements: IfcPersistedElementRow[], links: IfcFinalLinkRow[]): Ifc3DTestLinkedElementRow[] {
  const elementById = new Map(elements.map(element => [element.id, element]));

  const linkedElements = links
    .map((link): Ifc3DTestLinkedElementRow | null => {
      const element = elementById.get(link.ifc_element_id);
      if (!element) return null;

      return {
        ifc_element_id: link.ifc_element_id,
        ifc_entity_id: element.ifc_entity_id,
        ifc_global_id: element.ifc_global_id,
        house_number: link.house_number,
        trigger_service_key: link.trigger_service_key,
        trigger_service_label: link.trigger_service_label,
        status: link.status,
      };
    })
    .filter((row): row is Ifc3DTestLinkedElementRow => !!row);

  if (import.meta.env.DEV) {
    const missingLinks = links.filter(link => !elementById.has(link.ifc_element_id));
    console.log("[IFC Test] join diagnostics", {
      elementsByIdSize: elementById.size,
      firstLinkElementId: links[0]?.ifc_element_id ?? null,
      firstElementId: elements[0]?.id ?? null,
      matchedCount: linkedElements.length,
      missingCount: missingLinks.length,
      missingSample: missingLinks.slice(0, 5).map(link => ({
        id: link.id,
        model_id: link.model_id,
        ifc_element_id: link.ifc_element_id,
        house_id: link.house_id,
        house_number: link.house_number,
        trigger_service_key: link.trigger_service_key,
        status: link.status,
      })),
      matchedSample: linkedElements.slice(0, 5).map(element => ({
        ifc_element_id: element.ifc_element_id,
        ifc_entity_id: element.ifc_entity_id,
        ifc_global_id: element.ifc_global_id,
        house_number: element.house_number,
        trigger_service_key: element.trigger_service_key,
        status: element.status,
      })),
    });
  }

  return linkedElements;
}

const IFC_ENTITY_TYPES = [
  "IFCBUILDINGELEMENTPROXY",
  "IFCWALL",
  "IFCSLAB",
  "IFCROOF",
  "IFCDOOR",
  "IFCWINDOW",
];

function summarizeLine(line: string) {
  const compact = line.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function isUsefulIfcName(value: string | null | undefined) {
  const normalized = (value || "").trim();
  return !!normalized && normalized.toLowerCase() !== "undefined";
}

function contains3dText(value: string | null | undefined) {
  return (value || "").toLowerCase().includes("3dtext");
}

function normalizeIfcLayerName(layerName: string | null) {
  return (layerName || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIfcSearchText(...values: Array<string | null | undefined>) {
  return normalizeIfcLayerName(values.filter(Boolean).join(" "));
}

function isIfcRealContextElement(element: IfcPersistedElementRow, linkedElementIds: Set<string>) {
  const text = normalizeIfcSearchText(element.category, element.ifc_layer_name, element.name, element.ifc_type);
  const hasContextKeyword = [
    "lote",
    "terreno",
    "rua",
    "avenida",
    "via",
    "asfalto",
    "calcada",
    "calcamento",
    "passeio",
    "meio fio",
    "guia",
    "sarjeta",
    "paver",
    "grama",
    "vegetacao",
    "paisagismo",
    "solo",
    "entorno",
    "base",
    "urban",
    "implantacao",
    "quadra",
    "texto",
    "3dtext",
    "numeracao",
    "cota",
    "anotacao",
    "legenda",
    "ifcsite",
    "ifcannotation",
    "ifctext",
  ].some(keyword => text.includes(keyword));

  if (hasContextKeyword) return true;
  if (element.category && element.category !== "production") return true;
  if (!element.category) return true;
  if (!element.detected_service_key && !linkedElementIds.has(element.id)) return true;
  return false;
}

function getIfcRealContextDiagnosticReason(element: IfcPersistedElementRow, linkedElementIds: Set<string>) {
  const text = normalizeIfcSearchText(element.category, element.ifc_layer_name, element.name, element.ifc_type);
  const keyword = [
    "lote",
    "terreno",
    "rua",
    "avenida",
    "via",
    "asfalto",
    "calcada",
    "calcamento",
    "passeio",
    "meio fio",
    "guia",
    "sarjeta",
    "paver",
    "grama",
    "grass",
    "vegetacao",
    "paisagismo",
    "solo",
    "site",
    "ifcsite",
    "terrain",
    "entorno",
    "base",
    "urban",
    "implantacao",
    "quadra",
    "texto",
    "3dtext",
    "numeracao",
    "cota",
    "anotacao",
    "legenda",
    "ifcannotation",
    "ifctext",
  ].find(item => text.includes(item));

  if (keyword) return `context_keyword:${keyword}`;
  if (element.category && element.category !== "production") return `non_production_category:${element.category}`;
  if (!element.category) return "missing_category";
  if (!element.detected_service_key && !linkedElementIds.has(element.id)) return "no_service_or_final_link";
  return "production_candidate";
}

function isIfcRealContextSearchHit(element: IfcPersistedElementRow) {
  const text = normalizeIfcSearchText(element.category, element.ifc_layer_name, element.name, element.ifc_type);
  return [
    "lote",
    "terreno",
    "rua",
    "via",
    "calcada",
    "asfalto",
    "paver",
    "solo",
    "grama",
    "grass",
    "site",
    "ifcsite",
    "terrain",
    "entorno",
    "implantacao",
    "3dtext",
    "texto",
  ].some(term => text.includes(term));
}

function parseIfcLayerSemantic(layerName: string | null): {
  serviceKey: string | null;
  serviceLabel: string | null;
  houseNumber: number | null;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
} {
  const normalized = normalizeIfcLayerName(layerName);
  const houseMatch = normalized.match(/\b(?:casa|lote)\s*0*(\d+)\b/);
  const houseNumber = houseMatch ? Number(houseMatch[1]) : null;
  let serviceKey: string | null = null;
  let serviceLabel: string | null = null;
  let needsReview = false;

  if (normalized.includes("radier")) {
    serviceKey = "radier";
    serviceLabel = "Radier";
  } else if (normalized.includes("parede")) {
    serviceKey = "paredes";
    serviceLabel = "Paredes";
  } else if (normalized.includes("oitao")) {
    serviceKey = "oitao";
    serviceLabel = "Oitão";
  } else if (normalized.includes("telhado") || normalized.includes("cobertura")) {
    serviceKey = "cobertura";
    serviceLabel = "Cobertura";
  } else if (normalized.includes("piso")) {
    serviceKey = "piso";
    serviceLabel = "Piso";
  } else if (normalized.includes("lote")) {
    serviceLabel = "Referência/Lote";
    needsReview = true;
  }

  const confidence = serviceKey && houseNumber != null ? "high" : serviceKey ? "medium" : "low";
  return { serviceKey, serviceLabel, houseNumber, confidence, needsReview };
}

function classifyIfcElement(name: string, primaryLayerName: string | null): IfcInventoryItem["category"] {
  if (contains3dText(name) || contains3dText(primaryLayerName)) return "text";
  if (isUsefulIfcName(primaryLayerName)) return "production";
  return "unnamed";
}

function extract3dTextHouseNumber(name: string | null | undefined) {
  const match = (name || "").match(/3dtext\s*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractRefs(line: string) {
  return Array.from(new Set(line.match(/#\d+/g) || []));
}

function getIfcLineType(line: string | undefined) {
  const match = (line || "").match(/^#\d+\s*=\s*([A-Z0-9_]+)/i);
  return match ? match[1].toUpperCase() : null;
}

function parseIfcCoordinateNumber(value: string | undefined) {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized || normalized === "$") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCartesianPoint(line: string): IfcPoint | null {
  if (!/IFCCARTESIANPOINT/i.test(line)) return null;

  const tupleMatch = line.match(/IFCCARTESIANPOINT\s*\(\s*\(\s*([\s\S]*?)\s*\)\s*\)/i);
  if (!tupleMatch) return null;

  const values = tupleMatch[1].split(",").map(value => value.trim());
  const x = parseIfcCoordinateNumber(values[0]);
  const y = parseIfcCoordinateNumber(values[1]);
  const z = values.length >= 3 ? parseIfcCoordinateNumber(values[2]) : 0;

  if (x == null || y == null || z == null) return null;
  return { x, y, z };
}

function extractPositionFromRefs(refs: Set<string>, lineById: Map<string, string>) {
  const points: IfcPoint[] = [];

  for (const ref of refs) {
    const line = lineById.get(ref);
    if (!line) continue;
    const point = extractCartesianPoint(line);
    if (point) points.push(point);
  }

  if (points.length === 0) return { position: null, pointCount: 0 };

  const total = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
      z: acc.z + point.z,
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    position: {
      x: total.x / points.length,
      y: total.y / points.length,
      z: total.z / points.length,
    },
    pointCount: points.length,
  };
}

function findFirstRefByType(refs: Iterable<string>, lineById: Map<string, string>, type: string) {
  for (const ref of refs) {
    if (getIfcLineType(lineById.get(ref)) === type) return ref;
  }

  return null;
}

function extractPlacementPositionFromRefs(refs: Set<string>, lineById: Map<string, string>) {
  const placementRefId = findFirstRefByType(refs, lineById, "IFCLOCALPLACEMENT");
  if (!placementRefId) {
    return {
      placementPosition: null,
      placementRefId: null,
      axisPlacementRefId: null,
      cartesianPointRefId: null,
      cartesianPointLinePreview: null,
      parsedCartesianPoint: null,
      cartesianPointParseFailed: false,
    };
  }

  const placementLine = lineById.get(placementRefId);
  const placementRefs = extractRefs(placementLine || "");
  let axisPlacementRefId = findFirstRefByType(placementRefs, lineById, "IFCAXIS2PLACEMENT3D");

  if (!axisPlacementRefId) {
    const placementReachableRefs = collectReachableRefs(placementRefId, lineById, 3, 80);
    axisPlacementRefId = findFirstRefByType(placementReachableRefs, lineById, "IFCAXIS2PLACEMENT3D");
  }

  if (!axisPlacementRefId) {
    return {
      placementPosition: null,
      placementRefId,
      axisPlacementRefId: null,
      cartesianPointRefId: null,
      cartesianPointLinePreview: null,
      parsedCartesianPoint: null,
      cartesianPointParseFailed: false,
    };
  }

  const axisLine = lineById.get(axisPlacementRefId);
  const axisRefs = extractRefs(axisLine || "");
  let cartesianPointRefId = findFirstRefByType(axisRefs, lineById, "IFCCARTESIANPOINT");

  if (!cartesianPointRefId) {
    const axisReachableRefs = collectReachableRefs(axisPlacementRefId, lineById, 2, 50);
    cartesianPointRefId = findFirstRefByType(axisReachableRefs, lineById, "IFCCARTESIANPOINT");
  }

  const cartesianPointLine = cartesianPointRefId ? lineById.get(cartesianPointRefId) || "" : "";
  const parsedCartesianPoint = cartesianPointLine ? extractCartesianPoint(cartesianPointLine) : null;
  const cartesianPointLinePreview = cartesianPointLine ? summarizeLine(cartesianPointLine) : null;
  const cartesianPointParseFailed = Boolean(cartesianPointRefId && !parsedCartesianPoint);

  return {
    placementPosition: parsedCartesianPoint,
    placementRefId,
    axisPlacementRefId,
    cartesianPointRefId,
    cartesianPointLinePreview,
    parsedCartesianPoint,
    cartesianPointParseFailed,
  };
}

function distanceBetweenPoints(a: IfcPoint, b: IfcPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isOriginPoint(point: IfcPoint | null) {
  if (!point) return false;
  return Math.abs(point.x) < 1e-9 && Math.abs(point.y) < 1e-9 && Math.abs(point.z) < 1e-9;
}

function buildSharedPlacementKey(item: Pick<IfcInventoryItem, "placementRefId" | "cartesianPointRefId">) {
  if (!item.placementRefId || !item.cartesianPointRefId) return null;
  return `${item.placementRefId}->${item.cartesianPointRefId}`;
}

function parseIfcLineMap(text: string) {
  const lineById = new Map<string, string>();
  const linePattern = /(#\d+)\s*=\s*[^;]+;/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text)) !== null) {
    lineById.set(match[1], match[0]);
  }

  return lineById;
}

function parseLayerAssignments(text: string): IfcLayerAssignment[] {
  const layerPattern = /(#\d+)\s*=\s*IFCPRESENTATIONLAYERASSIGNMENT\s*\(\s*'([^']*)'\s*,\s*[^,]*,\s*\(([^)]*)\)[^;]*;/gi;
  const layers: IfcLayerAssignment[] = [];
  let match: RegExpExecArray | null;

  while ((match = layerPattern.exec(text)) !== null) {
    const [, id, name, refsText] = match;
    layers.push({
      id,
      name,
      refs: extractRefs(refsText),
      rawLine: summarizeLine(match[0]),
    });
  }

  return layers;
}

function buildRefToLayerNames(layers: IfcLayerAssignment[]) {
  const refToLayerNames = new Map<string, string[]>();

  for (const layer of layers) {
    for (const ref of layer.refs) {
      const existing = refToLayerNames.get(ref) || [];
      if (!existing.includes(layer.name)) existing.push(layer.name);
      refToLayerNames.set(ref, existing);
    }
  }

  return refToLayerNames;
}

function buildReverseRefMap(lineById: Map<string, string>) {
  const reverseRefMap = new Map<string, string[]>();

  lineById.forEach((line, id) => {
    for (const ref of extractRefs(line)) {
      if (ref === id) continue;
      const existing = reverseRefMap.get(ref) || [];
      if (!existing.includes(id)) existing.push(id);
      reverseRefMap.set(ref, existing);
    }
  });

  return reverseRefMap;
}

function collectReachableRefs(startId: string, lineById: Map<string, string>, maxDepth = 5, maxRefs = 500) {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id) || current.depth > maxDepth) continue;
    if (visited.size >= maxRefs) break;

    visited.add(current.id);
    const line = lineById.get(current.id);
    if (!line || current.depth === maxDepth) continue;

    for (const ref of extractRefs(line)) {
      if (!visited.has(ref)) queue.push({ id: ref, depth: current.depth + 1 });
    }
  }

  return visited;
}

function buildRefDiagnostics(reachableRefs: Set<string>, lineById: Map<string, string>): IfcRefDiagnostics {
  const firstReachedTypes: string[] = [];
  let cartesianPointCount = 0;
  let hasLocalPlacement = false;
  let hasAxis2Placement3D = false;
  let hasProductDefinitionShape = false;
  let hasExtrudedAreaSolid = false;

  for (const ref of reachableRefs) {
    const type = getIfcLineType(lineById.get(ref));
    if (!type) continue;

    if (firstReachedTypes.length < 10 && !firstReachedTypes.includes(type)) {
      firstReachedTypes.push(type);
    }

    if (type === "IFCCARTESIANPOINT") cartesianPointCount += 1;
    if (type === "IFCLOCALPLACEMENT") hasLocalPlacement = true;
    if (type === "IFCAXIS2PLACEMENT3D") hasAxis2Placement3D = true;
    if (type === "IFCPRODUCTDEFINITIONSHAPE") hasProductDefinitionShape = true;
    if (type === "IFCEXTRUDEDAREASOLID") hasExtrudedAreaSolid = true;
  }

  return {
    reachableRefsCount: reachableRefs.size,
    cartesianPointCount,
    hasLocalPlacement,
    hasAxis2Placement3D,
    hasProductDefinitionShape,
    hasExtrudedAreaSolid,
    firstReachedTypes,
  };
}

function findLayerNamesForRefs(reachableRefs: Set<string>, refToLayerNames: Map<string, string[]>) {
  const found = new Set<string>();

  for (const ref of reachableRefs) {
    (refToLayerNames.get(ref) || []).forEach(name => found.add(name));
  }

  return Array.from(found);
}

function findLayerNamesByReverseRefs(
  elementId: string,
  refToLayerNames: Map<string, string[]>,
  reverseRefMap: Map<string, string[]>,
  maxDepth = 5
) {
  const found = new Set<string>();

  refToLayerNames.forEach((layerNames, layerRef) => {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: layerRef, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.depth > maxDepth) continue;
      if (current.id === elementId) {
        layerNames.forEach(name => found.add(name));
        return;
      }

      visited.add(current.id);
      if (current.depth === maxDepth) continue;

      for (const parentRef of reverseRefMap.get(current.id) || []) {
        if (!visited.has(parentRef)) queue.push({ id: parentRef, depth: current.depth + 1 });
      }
    }
  });

  return Array.from(found);
}

function apply3dTextHouseAnchors(items: IfcInventoryItem[]) {
  const anchors = items.filter(item => (
    item.category === "text" &&
    item.anchorHouseNumber != null &&
    item.position
  ));

  if (anchors.length === 0) return items;

  return items.map(item => {
    if (
      item.category !== "production" ||
      !item.detectedServiceKey ||
      item.detectedHouseNumber != null ||
      !item.position
    ) {
      return item;
    }

    const rankedAnchors = anchors
      .map(anchor => ({
        anchor,
        distance: distanceBetweenPoints(item.position!, anchor.position!),
      }))
      .sort((a, b) => a.distance - b.distance);

    const nearest = rankedAnchors[0];
    if (!nearest) return item;

    const second = rankedAnchors[1];
    const confidence: IfcInventoryItem["semanticConfidence"] =
      second && nearest.distance <= second.distance * 0.6 ? "high" : "medium";

    return {
      ...item,
      detectedHouseNumber: nearest.anchor.anchorHouseNumber,
      semanticConfidence: confidence,
      semanticNeedsReview: confidence !== "high",
      anchorElementId: nearest.anchor.id,
      anchorElementName: nearest.anchor.name,
      anchorDistance: nearest.distance,
      houseDetectionSource: "3dtext_proximity" as const,
    };
  });
}

function ignoreSharedGlobalPlacements(items: IfcInventoryItem[]) {
  const sharedOriginCounts = new Map<string, number>();

  items.forEach(item => {
    if (item.category !== "production" || item.positionSource !== "local_placement" || !isOriginPoint(item.placementPosition)) {
      return;
    }

    const sharedPlacementKey = buildSharedPlacementKey(item);
    if (!sharedPlacementKey) return;
    sharedOriginCounts.set(sharedPlacementKey, (sharedOriginCounts.get(sharedPlacementKey) || 0) + 1);
  });

  return items.map(item => {
    const sharedPlacementKey = buildSharedPlacementKey(item);
    const sharedCount = sharedPlacementKey ? sharedOriginCounts.get(sharedPlacementKey) || 0 : 0;
    const shouldIgnore = (
      item.category === "production" &&
      item.positionSource === "local_placement" &&
      isOriginPoint(item.placementPosition) &&
      sharedCount >= 3
    );

    if (!shouldIgnore) {
      return {
        ...item,
        sharedPlacementKey,
      };
    }

    return {
      ...item,
      position: null,
      positionSource: "global_placement_ignored" as const,
      placementPositionIgnored: true,
      placementPositionIgnoreReason: "shared_global_origin",
      sharedPlacementKey,
    };
  });
}

function parseIfcText(text: string): IfcInventoryItem[] {
  const lineById = parseIfcLineMap(text);
  const layerAssignments = parseLayerAssignments(text);
  const refToLayerNames = buildRefToLayerNames(layerAssignments);
  const reverseRefMap = buildReverseRefMap(lineById);
  const entityPattern = new RegExp(
    `(#\\d+)\\s*=\\s*(${IFC_ENTITY_TYPES.join("|")})\\s*\\(([^;]*)\\);`,
    "gi"
  );
  const items: IfcInventoryItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = entityPattern.exec(text)) !== null) {
    const [, id, type, args] = match;
    const quoted = Array.from(args.matchAll(/'([^']*)'/g)).map(item => item[1]);
    const name = quoted[1] || "";
    const rawLine = match[0];
    const reachableRefs = collectReachableRefs(id, lineById, 10, 800);
    const layerNames = findLayerNamesForRefs(reachableRefs, refToLayerNames);
    if (layerNames.length === 0) {
      findLayerNamesByReverseRefs(id, refToLayerNames, reverseRefMap, 5).forEach(layerName => {
        if (!layerNames.includes(layerName)) layerNames.push(layerName);
      });
    }
    const primaryLayerName = layerNames[0] || null;
    const semantic = parseIfcLayerSemantic(primaryLayerName);
    const category = classifyIfcElement(name, primaryLayerName);
    const anchorHouseNumber = category === "text" ? extract3dTextHouseNumber(name) : null;
    const refDiagnostics = buildRefDiagnostics(reachableRefs, lineById);
    const {
      placementPosition,
      placementRefId,
      axisPlacementRefId,
      cartesianPointRefId,
      cartesianPointLinePreview,
      parsedCartesianPoint,
      cartesianPointParseFailed,
    } = extractPlacementPositionFromRefs(reachableRefs, lineById);
    const { position: fallbackPosition, pointCount } = extractPositionFromRefs(reachableRefs, lineById);
    const position = placementPosition || fallbackPosition;
    const positionSource = placementPosition ? "local_placement" : fallbackPosition ? "reachable_points" : "none";

    items.push({
      id,
      type: type.toUpperCase(),
      globalId: quoted[0] || "",
      name,
      quotedValues: quoted,
      layerNames,
      primaryLayerName,
      reachableRefs: Array.from(reachableRefs),
      detectedServiceKey: semantic.serviceKey,
      detectedServiceLabel: semantic.serviceLabel,
      detectedHouseNumber: semantic.houseNumber,
      semanticConfidence: semantic.confidence,
      semanticNeedsReview: semantic.needsReview,
      category,
      position,
      positionPointCount: pointCount,
      positionSource,
      placementPosition,
      placementRefId,
      axisPlacementRefId,
      cartesianPointRefId,
      cartesianPointLinePreview,
      parsedCartesianPoint,
      cartesianPointParseFailed,
      placementPositionIgnored: false,
      placementPositionIgnoreReason: null,
      sharedPlacementKey: buildSharedPlacementKey({ placementRefId, cartesianPointRefId }),
      anchorHouseNumber,
      anchorElementId: null,
      anchorElementName: null,
      anchorDistance: null,
      houseDetectionSource: semantic.houseNumber != null ? "layer" : "none",
      refDiagnostics,
      rawLine: summarizeLine(rawLine),
    });
  }

  return apply3dTextHouseAnchors(ignoreSharedGlobalPlacements(items));
}

function getIfcFileName(url: string) {
  try {
    const parsedUrl = new URL(url);
    const pathName = decodeURIComponent(parsedUrl.pathname);
    return pathName.split("/").filter(Boolean).pop() || "modelo-ifc.ifc";
  } catch {
    return url.split("/").filter(Boolean).pop() || "modelo-ifc.ifc";
  }
}

function mapIfcCategory(category: IfcInventoryItem["category"]) {
  if (category === "production") return "production";
  if (category === "text") return "text_annotation";
  return "unknown";
}

type IfcLoaderConstructor = new () => {
  ifcManager?: {
    applyWebIfcConfig?: (settings: Record<string, unknown>) => void | Promise<void>;
    setWasmPath?: (path: string) => void | Promise<void>;
    useWebWorkers?: (active: boolean, path?: string) => void | Promise<void>;
  };
  load: (
    url: string,
    onLoad: (model: THREE.Object3D) => void,
    onProgress?: unknown,
    onError?: (error: unknown) => void
  ) => void;
};

type IfcLoaderModule = {
  IFCLoader?: IfcLoaderConstructor;
  default?: IfcLoaderConstructor;
};

const ifcLoaderModules = import.meta.glob<IfcLoaderModule>([
  "/node_modules/web-ifc-three/**/IFCLoader*.js",
  "/node_modules/web-ifc-three/**/IFCLoader*.mjs",
]);

const IFC_VISUAL_WASM_PATH = "/wasm/";
const IFC_VISUAL_PACKAGE_VERSIONS = {
  three: "0.160.1",
  webIfc: "0.0.44",
  webIfcThree: "0.0.126",
};

async function loadIfcLoaderConstructor() {
  const candidates = Object.entries(ifcLoaderModules).sort(([left], [right]) => {
    const score = (path: string) => {
      if (path.endsWith("/IFCLoader.js") || path.endsWith("/IFCLoader.mjs")) return 0;
      if (path.includes("/IFCLoader/")) return 1;
      return 2;
    };

    return score(left) - score(right);
  });

  for (const [, loadModule] of candidates) {
    const module = await loadModule();
    const Loader = module.IFCLoader || module.default;
    if (typeof Loader === "function") return Loader;
  }

  const candidatePaths = candidates.map(([path]) => path);
  console.warn("[IFC] IFCLoader nao encontrado no bundle", {
    candidateCount: candidatePaths.length,
    candidatePaths,
  });

  throw new Error(
    `IFCLoader nao foi encontrado no bundle. Candidatos encontrados: ${candidatePaths.length}. Verifique se web-ifc-three esta instalado e empacotado pelo Vite.`
  );
}

async function inspectIfcVisualWasmFiles() {
  const files = ["web-ifc.wasm", "web-ifc-mt.wasm"];
  const results = await Promise.all(
    files.map(async fileName => {
      const path = `${IFC_VISUAL_WASM_PATH}${fileName}`;
      try {
        const response = await fetch(path, { method: "HEAD" });
        return {
          path,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        };
      } catch (error: any) {
        return {
          path,
          ok: false,
          error: error?.message || "Falha ao verificar arquivo WASM",
        };
      }
    })
  );

  return {
    wasmPath: IFC_VISUAL_WASM_PATH,
    packageVersions: IFC_VISUAL_PACKAGE_VERSIONS,
    files: results,
  };
}

function describeIfcVisualError(error: any, wasmDiagnostics: unknown) {
  const message = error?.message || "Falha ao renderizar IFC visual";
  const stack = error?.stack;
  const isOpenModelMismatch = message.includes("OpenModel is not a function");

  console.warn("[IFC] Diagnostico da renderizacao visual", {
    errorMessage: message,
    stack,
    wasmDiagnostics,
    packageVersions: IFC_VISUAL_PACKAGE_VERSIONS,
  });

  if (isOpenModelMismatch) {
    return "Falha de compatibilidade entre web-ifc/web-ifc-three e os arquivos WASM em /wasm/. Inventario textual mantido.";
  }

  return message;
}

type IfcVisualTextureKind =
  | "concreto_agregado"
  | "concreto_liso"
  | "grama"
  | "vegetacao"
  | "asfalto"
  | "paver"
  | "parede_revestida"
  | "solo";

const IFC_VISUAL_TEXTURES: Record<
  IfcVisualTextureKind,
  { path: string; repeat: [number, number]; tileSize: number; color: string; opacity: number; roughness: number }
> = {
  concreto_agregado: {
    path: "/textures/ifc/Concrete_12_1K.png",
    repeat: [7, 7],
    tileSize: 3,
    color: "#d3d1ca",
    opacity: 0.94,
    roughness: 0.82,
  },
  concreto_liso: {
    path: "/textures/ifc/Concrete_16_1K.png",
    repeat: [6, 6],
    tileSize: 3,
    color: "#c8c6be",
    opacity: 0.94,
    roughness: 0.78,
  },
  grama: {
    path: "/textures/ifc/Vegetation_Grass.jpg",
    repeat: [16, 16],
    tileSize: 6,
    color: "#7fa66b",
    opacity: 0.92,
    roughness: 0.88,
  },
  vegetacao: {
    path: "/textures/ifc/Vegetation_Juniper.jpg",
    repeat: [14, 14],
    tileSize: 6,
    color: "#496f3d",
    opacity: 0.92,
    roughness: 0.9,
  },
  asfalto: {
    path: "/textures/ifc/Asphalt_06_1K.png",
    repeat: [8, 8],
    tileSize: 5,
    color: "#575b58",
    opacity: 0.92,
    roughness: 0.8,
  },
  paver: {
    path: "/textures/ifc/Concrete_Block_8x8_Gray.jpg",
    repeat: [8, 8],
    tileSize: 2,
    color: "#b9aea2",
    opacity: 0.94,
    roughness: 0.78,
  },
  parede_revestida: {
    path: "/textures/ifc/Concrete_Scored_Jointless.jpg",
    repeat: [5, 5],
    tileSize: 2.5,
    color: "#d8d2c8",
    opacity: 0.95,
    roughness: 0.8,
  },
  solo: {
    path: "/textures/ifc/Soil_04_1K.png",
    repeat: [12, 12],
    tileSize: 6,
    color: "#8b6f4e",
    opacity: 0.9,
    roughness: 0.9,
  },
};

type IfcVisualMaterialKind = IfcVisualTextureKind | "simple_text" | "neutral";

const IFC_PAINT_TEXTURE_OPTIONS: Array<{ kind: IfcVisualTextureKind; label: string }> = [
  { kind: "paver", label: "Paver" },
  { kind: "parede_revestida", label: "Parede/Revestimento" },
  { kind: "solo", label: "Solo" },
  { kind: "grama", label: "Grama" },
  { kind: "vegetacao", label: "Vegetação" },
  { kind: "asfalto", label: "Asfalto" },
  { kind: "concreto_agregado", label: "Concreto agregado" },
  { kind: "concreto_liso", label: "Concreto liso" },
];

const IFC_3D_TEST_CONTROLS: Array<{
  key: Ifc3DTestControlKey;
  houseNumber: number;
  serviceKey: "radier" | "paredes";
  label: string;
}> = [
  { key: "91-radier", houseNumber: 91, serviceKey: "radier", label: "Casa 91 | Radier" },
  { key: "91-paredes", houseNumber: 91, serviceKey: "paredes", label: "Casa 91 | Paredes" },
  { key: "92-radier", houseNumber: 92, serviceKey: "radier", label: "Casa 92 | Radier" },
  { key: "92-paredes", houseNumber: 92, serviceKey: "paredes", label: "Casa 92 | Paredes" },
];

function disposeIfcVisualMaterial(material: THREE.Material, disposedTextures?: Set<THREE.Texture>) {
  const materialWithTextures = material as THREE.Material & Record<string, unknown>;
  const textureKeys = [
    "map",
    "alphaMap",
    "aoMap",
    "bumpMap",
    "displacementMap",
    "emissiveMap",
    "envMap",
    "lightMap",
    "metalnessMap",
    "normalMap",
    "roughnessMap",
  ];

  textureKeys.forEach(key => {
    const texture = materialWithTextures[key];
    if (texture instanceof THREE.Texture && !disposedTextures?.has(texture)) {
      disposedTextures?.add(texture);
      texture.dispose();
    }
  });

  material.dispose();
}

function disposeIfcVisualObject(object: THREE.Object3D | null) {
  if (!object) return;
  const disposedMaterials = new Set<THREE.Material>();
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedTextures = new Set<THREE.Texture>();

  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
      disposedGeometries.add(mesh.geometry);
      mesh.geometry.dispose();
    }

    const material = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) {
      material.forEach(item => {
        if (item && !disposedMaterials.has(item)) {
          disposedMaterials.add(item);
          disposeIfcVisualMaterial(item, disposedTextures);
        }
      });
    } else if (material && !disposedMaterials.has(material)) {
      disposedMaterials.add(material);
      disposeIfcVisualMaterial(material, disposedTextures);
    }
  });
}

function getIfcVisualMaterialColor(material: THREE.Material) {
  const maybeColor = (material as THREE.Material & { color?: THREE.Color }).color;
  if (!maybeColor || !(maybeColor instanceof THREE.Color)) return null;
  return `#${maybeColor.getHexString()}`;
}

function hasIfcVisualTextureMap(material: THREE.Material) {
  const materialWithMap = material as THREE.Material & { map?: THREE.Texture | null };
  return materialWithMap.map instanceof THREE.Texture;
}

function hasIfcVisualUsableTextureMap(material: THREE.Material) {
  const materialWithMap = material as THREE.Material & { map?: THREE.Texture | null };
  const map = materialWithMap.map;
  if (!(map instanceof THREE.Texture)) return false;

  const image = map.image as { width?: number; height?: number } | undefined;
  return Boolean(image && Number(image.width || 0) > 0 && Number(image.height || 0) > 0);
}

function getIfcVisualMaterials(mesh: THREE.Mesh) {
  const material = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(material)) return material.filter(Boolean);
  return material ? [material] : [];
}

function isIfcVisualMaterialUseful(material: THREE.Material) {
  if (hasIfcVisualUsableTextureMap(material)) return true;
  const color = getIfcVisualMaterialColor(material);
  const isDefaultGray = !color || ["#cccccc", "#bfbfbf", "#ffffff"].includes(color.toLowerCase());
  const hasSpecificName = Boolean(material.name?.trim() && !material.name.toLowerCase().includes("default"));
  const hasDistinctColor = Boolean(color && !isDefaultGray);
  const hasTransparency = material.transparent || material.opacity < 0.99;
  return hasSpecificName || hasDistinctColor || hasTransparency;
}

function getIfcVisualMeshBounds(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  if (!geometry || !geometry.getAttribute("position")) return null;

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;

  const size = new THREE.Vector3();
  box.getSize(size);
  const isHorizontalPlane = size.y <= Math.max(size.x, size.z) * 0.08 && size.x > 4 && size.z > 4;
  const isLargeHorizontalPlane = isHorizontalPlane && size.x * size.z >= 400;
  return { box, size, isHorizontalPlane, isLargeHorizontalPlane };
}

function getIfcVisualUvAxes(size: THREE.Vector3) {
  const isHorizontal = size.y <= Math.max(size.x, size.z) * 0.12;
  if (isHorizontal) return { uAxis: "x" as const, vAxis: "z" as const, uLength: size.x, vLength: size.z };

  return size.x >= size.z
    ? { uAxis: "x" as const, vAxis: "y" as const, uLength: size.x, vLength: size.y }
    : { uAxis: "z" as const, vAxis: "y" as const, uLength: size.z, vLength: size.y };
}

function ensureIfcVisualPlanarUv(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  if (!geometry || geometry.getAttribute("uv") || !geometry.getAttribute("position")) return false;

  const bounds = getIfcVisualMeshBounds(mesh);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  if (!bounds || !position) return false;

  const { box, size } = bounds;
  const axes = getIfcVisualUvAxes(size);
  const uSize = Math.max(axes.uLength, 1);
  const vSize = Math.max(axes.vLength, 1);
  const uv = new Float32Array(position.count * 2);

  const readAxis = (index: number, axis: "x" | "y" | "z") => {
    if (axis === "x") return position.getX(index);
    if (axis === "y") return position.getY(index);
    return position.getZ(index);
  };
  const minAxis = (axis: "x" | "y" | "z") => {
    if (axis === "x") return box.min.x;
    if (axis === "y") return box.min.y;
    return box.min.z;
  };

  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (readAxis(index, axes.uAxis) - minAxis(axes.uAxis)) / uSize;
    uv[index * 2 + 1] = (readAxis(index, axes.vAxis) - minAxis(axes.vAxis)) / vSize;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
  return true;
}

function getIfcVisualTextureRepeat(kind: IfcVisualTextureKind, mesh: THREE.Mesh): [number, number] {
  const bounds = getIfcVisualMeshBounds(mesh);
  const config = IFC_VISUAL_TEXTURES[kind];
  if (!bounds) return config.repeat;

  const axes = getIfcVisualUvAxes(bounds.size);
  return [
    Math.max(1, Math.min(80, axes.uLength / config.tileSize)),
    Math.max(1, Math.min(80, axes.vLength / config.tileSize)),
  ];
}

function getIfcVisualClassificationSource(mesh: THREE.Mesh) {
  return [
    mesh.name,
    mesh.userData?.name,
    mesh.userData?.ifcLayerName,
    mesh.userData?.layerName,
    mesh.userData?.category,
    mesh.userData?.type,
    ...getIfcVisualMaterials(mesh).map(material => material.name),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getIfcVisualTextureKind(mesh: THREE.Mesh): IfcVisualMaterialKind {
  const source = getIfcVisualClassificationSource(mesh);
  const bounds = getIfcVisualMeshBounds(mesh);

  if (source.includes("3dtext") || source.includes("texto") || source.includes("text")) return "simple_text";
  if (
    source.includes("rua") ||
    source.includes("via") ||
    source.includes("asfalto") ||
    source.includes("pavimento") ||
    source.includes("acesso") ||
    source.includes("estrada")
  ) {
    return "asfalto";
  }
  if (
    source.includes("calcada") ||
    source.includes("paver") ||
    source.includes("passeio") ||
    source.includes("intertravado")
  ) {
    return "paver";
  }
  if (source.includes("vegetacao")) return "vegetacao";
  if (source.includes("grama") || source.includes("jardim") || source.includes("area verde")) return "grama";
  if (
    source.includes("lote") ||
    source.includes("terreno") ||
    source.includes("solo") ||
    source.includes("ground") ||
    source.includes("site") ||
    source.includes("topografia")
  ) {
    return "solo";
  }
  if (source.includes("parede") || source.includes("paredes") || source.includes("oitao") || source.includes("wall")) {
    return "parede_revestida";
  }
  if (source.includes("laje") || source.includes("slab") || source.includes("piso concreto") || source.includes("concreto liso")) {
    return "concreto_liso";
  }
  if (
    source.includes("radier") ||
    source.includes("fundacao") ||
    source.includes("base estrutural") ||
    source.includes("concreto")
  ) {
    if (bounds?.isLargeHorizontalPlane && !source.includes("radier") && !source.includes("fundacao")) return "solo";
    return "concreto_agregado";
  }
  if (bounds?.isLargeHorizontalPlane) return "solo";
  return "neutral";
}

function createIfcVisualTexture(
  kind: IfcVisualTextureKind,
  loader: THREE.TextureLoader,
  textureCache: Map<IfcVisualTextureKind, THREE.Texture>,
  textureLoadStatus: Map<IfcVisualTextureKind, "loading" | "loaded" | "error">
) {
  const cached = textureCache.get(kind);
  if (cached) return cached;

  const config = IFC_VISUAL_TEXTURES[kind];
  const texture = loader.load(
    config.path,
    loadedTexture => {
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.needsUpdate = true;
      textureLoadStatus.set(kind, "loaded");
    },
    undefined,
    error => {
      textureLoadStatus.set(kind, "error");
      console.warn("[IFC Textures] failed texture load", { kind, path: config.path, error });
    }
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(config.repeat[0], config.repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureLoadStatus.set(kind, "loading");
  textureCache.set(kind, texture);
  return texture;
}

function createIfcVisualTextMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#64748b",
    roughness: 0.65,
    metalness: 0.02,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
}

function createIfcVisualNeutralMaterial() {
  return new THREE.MeshStandardMaterial({
    color: "#d6d3ca",
    roughness: 0.78,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
}

function createIfcVisualColorFallbackMaterial(kind: IfcVisualMaterialKind) {
  const palette: Record<IfcVisualMaterialKind, { color: string; opacity: number; roughness: number }> = {
    concreto_agregado: { color: "#c9c7bf", opacity: 0.94, roughness: 0.78 },
    concreto_liso: { color: "#d8d6ce", opacity: 0.94, roughness: 0.74 },
    grama: { color: "#7f9f6a", opacity: 0.88, roughness: 0.86 },
    vegetacao: { color: "#5d7f4f", opacity: 0.88, roughness: 0.9 },
    asfalto: { color: "#6a6d6a", opacity: 0.9, roughness: 0.8 },
    paver: { color: "#b8b4ab", opacity: 0.92, roughness: 0.78 },
    parede_revestida: { color: "#e1ded6", opacity: 0.95, roughness: 0.78 },
    solo: { color: "#8b785d", opacity: 0.88, roughness: 0.9 },
    simple_text: { color: "#64748b", opacity: 0.5, roughness: 0.65 },
    neutral: { color: "#d6d3ca", opacity: 0.86, roughness: 0.78 },
  };
  const config = palette[kind];
  return new THREE.MeshStandardMaterial({
    color: config.color,
    roughness: config.roughness,
    metalness: 0.02,
    transparent: config.opacity < 1,
    opacity: config.opacity,
    side: THREE.DoubleSide,
  });
}

function createIfcVisualTexturedMaterial(
  kind: IfcVisualTextureKind,
  textureLoader: THREE.TextureLoader,
  textureCache: Map<IfcVisualTextureKind, THREE.Texture>,
  textureLoadStatus: Map<IfcVisualTextureKind, "loading" | "loaded" | "error">,
  repeat: [number, number]
) {
  const config = IFC_VISUAL_TEXTURES[kind];
  const texture = createIfcVisualTexture(kind, textureLoader, textureCache, textureLoadStatus).clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return new THREE.MeshStandardMaterial({
    color: config.color,
    map: texture,
    roughness: config.roughness,
    metalness: 0.04,
    transparent: config.opacity < 1,
    opacity: config.opacity,
    side: THREE.DoubleSide,
  });
}

function createIfcPaintMaterial(
  kind: IfcVisualTextureKind,
  mesh: THREE.Mesh,
  textureLoader: THREE.TextureLoader,
  textureCache: Map<IfcVisualTextureKind, THREE.Texture>,
  textureLoadStatus: Map<IfcVisualTextureKind, "loading" | "loaded" | "error">
) {
  if (!mesh.geometry?.getAttribute("uv")) {
    ensureIfcVisualPlanarUv(mesh);
  }

  return createIfcVisualTexturedMaterial(
    kind,
    textureLoader,
    textureCache,
    textureLoadStatus,
    getIfcVisualTextureRepeat(kind, mesh)
  );
}

function disposeIfcVisualTextureCache(textureCache: Map<IfcVisualTextureKind, THREE.Texture>) {
  textureCache.forEach(texture => texture.dispose());
  textureCache.clear();
}

function formatIfcPoint(point: IfcPoint | null) {
  if (!point) return "-";
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}`;
}

function normalizeIfcEntityId(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function getIfcEntityIdVariants(value: string | null | undefined) {
  const normalized = normalizeIfcEntityId(value);
  if (!normalized) return new Set<string>();
  return new Set([normalized, normalized.replace(/^#/, "")]);
}

function getIfcGeometryAttributeNames(geometry: THREE.BufferGeometry | undefined) {
  return geometry?.attributes ? Object.keys(geometry.attributes) : [];
}

function getIfcAttributeValue(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, index: number) {
  const maybeAttribute = attribute as { getX?: (index: number) => number } | undefined;
  if (!maybeAttribute?.getX) return null;
  return normalizeNullableNumber(maybeAttribute.getX(index));
}

function getIfcExpressAttributeValue(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  vertexIndex: number,
  faceIndex: number,
  triangleCount?: number
) {
  const count = (attribute as { count?: number } | undefined)?.count;
  if (
    typeof count === "number" &&
    typeof triangleCount === "number" &&
    count === triangleCount &&
    faceIndex >= 0 &&
    faceIndex < count
  ) {
    return getIfcAttributeValue(attribute, faceIndex);
  }
  return getIfcAttributeValue(attribute, vertexIndex);
}

function getIfcExpressIdFromIntersection(intersection: any): {
  entityId: string | null;
  reason: string | null;
  attributeName: string | null;
} {
  const mesh = findIfcVisualMesh(intersection?.object || null);
  const geometry = mesh?.geometry;
  if (!mesh || !geometry) return { entityId: null, reason: "missing_mesh_or_geometry", attributeName: null };

  const faceIndex = typeof intersection?.faceIndex === "number" ? intersection.faceIndex : null;
  if (faceIndex == null) return { entityId: null, reason: "missing_face_index", attributeName: null };

  const attributeNames = ["expressID", "expressId", "ifcExpressID", "ifcExpressId"];
  const index = geometry.index;
  const position = geometry.getAttribute("position");
  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor((position?.count || 0) / 3);
  const candidateVertexIndices = [
    intersection?.face?.a,
    faceIndex * 3,
    index?.getX?.(faceIndex * 3),
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  for (const attributeName of attributeNames) {
    const attribute = geometry.getAttribute(attributeName) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!attribute) continue;

    for (const vertexIndex of candidateVertexIndices) {
      const expressId = getIfcExpressAttributeValue(attribute, vertexIndex, faceIndex, triangleCount);
      if (expressId != null) return { entityId: `#${expressId}`, reason: null, attributeName };
    }
  }

  const directValue = mesh.userData?.expressID ?? mesh.userData?.expressId ?? intersection?.object?.userData?.expressID ?? intersection?.object?.userData?.expressId;
  const directNumber = normalizeNullableNumber(directValue);
  if (directNumber != null) return { entityId: `#${directNumber}`, reason: "used_user_data_fallback", attributeName: null };

  return { entityId: null, reason: "missing_express_id_attribute", attributeName: null };
}

function getIfcVisualSelectionGlobalId(intersection: any, mesh: THREE.Mesh | null) {
  return normalizeNullableString(mesh?.userData?.GlobalId)
    || normalizeNullableString(mesh?.userData?.globalId)
    || normalizeNullableString(intersection?.object?.userData?.GlobalId)
    || normalizeNullableString(intersection?.object?.userData?.globalId);
}

function getIfcVisualObjectBounds(object: THREE.Object3D | null) {
  if (!object) return { center: null, size: null };

  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return { center: null, size: null };

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  return {
    center: { x: center.x, y: center.y, z: center.z },
    size: { x: size.x, y: size.y, z: size.z },
  };
}

function findIfcPersistedElementMatch(selection: IfcVisualInspectSelection | null, elements: IfcPersistedElementRow[]) {
  if (!selection) return null;

  const entityVariants = getIfcEntityIdVariants(selection.entityId);
  if (entityVariants.size > 0) {
    const byEntity = elements.find(element => {
      const persistedVariants = getIfcEntityIdVariants(element.ifc_entity_id);
      return Array.from(entityVariants).some(value => persistedVariants.has(value));
    });
    if (byEntity) return byEntity;
  }

  if (selection.globalId) {
    const byGlobalId = elements.find(element => element.ifc_global_id === selection.globalId);
    if (byGlobalId) return byGlobalId;
  }

  return null;
}

function getPersistedHouseDetectionSource(element: IfcPersistedElementRow | null) {
  if (!element?.raw_properties) return "none";
  return normalizeNullableString(element.raw_properties.houseDetectionSource)
    || normalizeNullableString(element.raw_properties.previousHouseDetectionSource)
    || (element.raw_properties.manualSequenceAssignment ? "manual_sequence" : null)
    || (element.raw_properties.manualHouseAssignment ? "manual_review" : null)
    || "none";
}

function getPersistedHouseDetectionLabel(source: string) {
  if (source === "3dtext_proximity") return "3Dtext próximo";
  if (source === "layer") return "Camada/nome";
  if (source === "manual_review") return "Manual/revisão";
  if (source === "manual_sequence") return "Sequência manual";
  return "Sem origem";
}

function createIfcInspectHighlightMaterial() {
  return new THREE.MeshBasicMaterial({
    color: "#fde047",
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    polygonOffsetUnits: -8,
  });
}

function getIfcExpressAttribute(geometry: THREE.BufferGeometry | undefined) {
  if (!geometry) return { attribute: null as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null, attributeName: null as string | null };
  const attributeNames = ["expressID", "expressId", "ifcExpressID", "ifcExpressId"];
  for (const attributeName of attributeNames) {
    const attribute = geometry.getAttribute(attributeName) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (attribute) return { attribute, attributeName };
  }
  return { attribute: null, attributeName: null };
}

function getIfcEntityNumericId(entityId: string | null | undefined) {
  const normalized = normalizeIfcEntityId(entityId);
  if (!normalized) return null;
  const parsed = Number(normalized.replace(/^#/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampIfcRealOpacity(progressPercent: number) {
  const progress = Number.isFinite(progressPercent) ? progressPercent : 0;
  return Math.min(1, Math.max(0.12, 0.12 + (progress / 100) * 0.88));
}

function getIfcRealOpacity(progressPercent: number, role: IfcProductionOverlay["role"]) {
  return role === "context"
    ? 0.95
    : progressPercent >= 100 ? 1 : clampIfcRealOpacity(progressPercent);
}

function configureIfcRealMaterial(material: THREE.Material, opacity: number, role: IfcProductionOverlay["role"]) {
  const realMaterial = material as THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    depthWrite?: boolean;
    side?: THREE.Side;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
  };

  realMaterial.opacity = opacity;
  realMaterial.transparent = opacity < 1 || realMaterial.transparent === true;
  realMaterial.depthWrite = role === "production" && opacity >= 1;
  realMaterial.side = THREE.DoubleSide;
  realMaterial.polygonOffset = true;
  realMaterial.polygonOffsetFactor = -4;
  realMaterial.polygonOffsetUnits = -4;
  material.needsUpdate = true;
  return material;
}

function createIfcRealFallbackMaterial(progressPercent: number, role: IfcProductionOverlay["role"]) {
  const opacity = getIfcRealOpacity(progressPercent, role);
  return configureIfcRealMaterial(new THREE.MeshBasicMaterial({
    color: role === "context" ? "#6f6b63" : "#9f9a90",
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
  }), opacity, role);
}

function getIfcPrimaryMaterial(material: THREE.Material | THREE.Material[] | undefined): {
  material: THREE.Material | null;
  source: IfcRealMaterialSource;
} {
  if (Array.isArray(material)) {
    const selected = material.find(item => {
      const candidate = item as THREE.Material & { map?: unknown; color?: unknown };
      return !!candidate?.map || !!candidate?.color;
    }) || material[0] || null;
    return { material: selected, source: selected ? "original_array" : "fallback" };
  }
  return { material: material || null, source: material ? "original" : "fallback" };
}

function createIfcRealVisualMaterialFromSource(sourceMaterial: THREE.Material | THREE.Material[] | undefined, progressPercent: number, role: IfcProductionOverlay["role"]): {
  material: THREE.Material;
  source: IfcRealMaterialSource;
} {
  const opacity = getIfcRealOpacity(progressPercent, role);
  const { material, source } = getIfcPrimaryMaterial(sourceMaterial);
  if (!material) {
    return { material: createIfcRealFallbackMaterial(progressPercent, role), source: "fallback" };
  }

  return {
    material: configureIfcRealMaterial(material.clone(), opacity, role),
    source,
  };
}

function createIfcHiddenBaseMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  material.colorWrite = false;
  return material;
}

function createIfcEntityHighlightMesh(mesh: THREE.Mesh, entityId: string, options?: {
  material?: THREE.Material;
  name?: string;
  renderOrder?: number;
  includeBoxHelper?: boolean;
  boxColor?: THREE.ColorRepresentation;
}): {
  highlight: THREE.Mesh | null;
  boxHelper: THREE.Box3Helper | null;
  matchingFaces: number;
  highlightVertexCount: number;
  bounds: { center: IfcPoint | null; size: IfcPoint | null };
  boundsRaw: { min: IfcPoint; max: IfcPoint; size: IfcPoint } | null;
  reason: string | null;
} {
  const geometry = mesh.geometry;
  const targetExpressId = getIfcEntityNumericId(entityId);
  if (!geometry || targetExpressId == null) {
    return { highlight: null, boxHelper: null, matchingFaces: 0, highlightVertexCount: 0, bounds: { center: null, size: null }, boundsRaw: null, reason: "missing_geometry_or_entity_id" };
  }

  const position = geometry.getAttribute("position") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!position) {
    return { highlight: null, boxHelper: null, matchingFaces: 0, highlightVertexCount: 0, bounds: { center: null, size: null }, boundsRaw: null, reason: "missing_position_attribute" };
  }

  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const index = geometry.index;
  const { attribute: expressAttribute, attributeName } = getIfcExpressAttribute(geometry);
  if (!expressAttribute) {
    return { highlight: null, boxHelper: null, matchingFaces: 0, highlightVertexCount: 0, bounds: { center: null, size: null }, boundsRaw: null, reason: "missing_express_id_attribute" };
  }

  const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
  const positions: number[] = [];
  const normals: number[] = [];
  let matchingFaces = 0;

  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex += 1) {
    const vertexIndices = [0, 1, 2].map(offset => {
      const rawIndex = faceIndex * 3 + offset;
      return index ? index.getX(rawIndex) : rawIndex;
    });
    const expressValues = vertexIndices
      .map(vertexIndex => getIfcExpressAttributeValue(expressAttribute, vertexIndex, faceIndex, triangleCount))
      .filter((value): value is number => value != null);

    if (!expressValues.some(value => value === targetExpressId)) continue;

    matchingFaces += 1;
    vertexIndices.forEach(vertexIndex => {
      positions.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
      if (normal) normals.push(normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex));
    });
  }

  if (matchingFaces === 0 || positions.length === 0) {
    return { highlight: null, boxHelper: null, matchingFaces, highlightVertexCount: 0, bounds: { center: null, size: null }, boundsRaw: null, reason: `no_matching_faces_for_${attributeName || "expressID"}` };
  }

  const highlightGeometry = new THREE.BufferGeometry();
  highlightGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) {
    highlightGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    highlightGeometry.computeVertexNormals();
  }
  highlightGeometry.computeBoundingBox();
  highlightGeometry.computeBoundingSphere();

  const highlight = new THREE.Mesh(highlightGeometry, options?.material || createIfcInspectHighlightMaterial());
  highlight.name = options?.name || `IFC selected entity ${entityId}`;
  highlight.renderOrder = options?.renderOrder ?? 999;
  mesh.add(highlight);
  highlight.updateMatrixWorld(true);

  const localBox = highlightGeometry.boundingBox?.clone() || null;
  const boxHelper = options?.includeBoxHelper === false
    ? null
    : localBox && !localBox.isEmpty() ? new THREE.Box3Helper(localBox, options?.boxColor || "#38bdf8") : null;
  if (boxHelper) {
    boxHelper.name = `IFC selected entity box ${entityId}`;
    boxHelper.renderOrder = 1000;
    const material = boxHelper.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.95;
    mesh.add(boxHelper);
    boxHelper.updateMatrixWorld(true);
  }

  const box = new THREE.Box3().setFromObject(highlight);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const min = box.min;
  const max = box.max;
  if (!box.isEmpty()) {
    box.getCenter(center);
    box.getSize(size);
  }

  return {
    highlight,
    boxHelper,
    matchingFaces,
    highlightVertexCount: positions.length / 3,
    bounds: box.isEmpty()
      ? { center: null, size: null }
      : {
          center: { x: center.x, y: center.y, z: center.z },
          size: { x: size.x, y: size.y, z: size.z },
        },
    boundsRaw: box.isEmpty()
      ? null
      : {
          min: { x: min.x, y: min.y, z: min.z },
          max: { x: max.x, y: max.y, z: max.z },
          size: { x: size.x, y: size.y, z: size.z },
        },
    reason: null,
  };
}

function disposeIfcHighlightOverlay(overlay: { highlight: THREE.Mesh; boxHelper: THREE.Box3Helper | null }) {
  overlay.highlight.parent?.remove(overlay.highlight);
  overlay.boxHelper?.parent?.remove(overlay.boxHelper);
  disposeIfcVisualObject(overlay.highlight);
  if (overlay.boxHelper) {
    overlay.boxHelper.geometry?.dispose();
    const material = overlay.boxHelper.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) {
      material.forEach(item => item.dispose());
    } else {
      material.dispose();
    }
  }
}

function disposeIfcRealVisualOverlay(overlay: { highlight: THREE.Mesh; boxHelper: THREE.Box3Helper | null }) {
  overlay.highlight.parent?.remove(overlay.highlight);
  overlay.boxHelper?.parent?.remove(overlay.boxHelper);
  overlay.highlight.geometry?.dispose();
  const material = overlay.highlight.material as THREE.Material | THREE.Material[];
  if (Array.isArray(material)) {
    material.forEach(item => item.dispose());
  } else {
    material?.dispose();
  }
  if (overlay.boxHelper) {
    overlay.boxHelper.geometry?.dispose();
    const helperMaterial = overlay.boxHelper.material as THREE.Material | THREE.Material[];
    if (Array.isArray(helperMaterial)) {
      helperMaterial.forEach(item => item.dispose());
    } else {
      helperMaterial.dispose();
    }
  }
}

function isIfcVisualRootOrWholeModel(object: THREE.Object3D | null, root: THREE.Object3D | null) {
  if (!object) return true;
  return object === root || object.name === "IFC visual diagnostic model" || object.type === "Group" || object.type === "Scene";
}

function findIfcInspectableIntersection(event: any) {
  const intersections = Array.isArray(event?.intersections) && event.intersections.length > 0
    ? event.intersections
    : [event];

  return intersections.find((intersection: any) => {
    const mesh = findIfcVisualMesh(intersection?.object || null);
    return !!mesh?.geometry && typeof intersection?.faceIndex === "number";
  }) || null;
}

function logIfcInspectIntersections(event: any) {
  const intersections = Array.isArray(event?.intersections) && event.intersections.length > 0
    ? event.intersections
    : [event];

  console.info("[IFC Inspect] raycast intersections", intersections.slice(0, 5).map((intersection: any) => {
    const object = intersection?.object as THREE.Object3D | undefined;
    const mesh = findIfcVisualMesh(object || null);
    const expressId = getIfcExpressIdFromIntersection(intersection);
    return {
      objectName: object?.name || null,
      objectUuid: object?.uuid || null,
      objectType: object?.type || null,
      isMesh: !!(object as THREE.Mesh | undefined)?.isMesh,
      faceIndex: typeof intersection?.faceIndex === "number" ? intersection.faceIndex : null,
      geometryAttributes: getIfcGeometryAttributeNames(mesh?.geometry),
      geometryGroupsCount: mesh?.geometry?.groups?.length ?? 0,
      parentName: object?.parent?.name || null,
      extractedExpressID: expressId.entityId,
      expressIDReason: expressId.reason,
      expressIDAttribute: expressId.attributeName,
    };
  }));
}

function findIfcVisualMesh(object: THREE.Object3D | null): THREE.Mesh | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const mesh = current as THREE.Mesh;
    if (mesh.isMesh) return mesh;
    current = current.parent;
  }
  return null;
}

function configureIfcVisualMaterials(model: THREE.Object3D) {
  const sharedFallbackMaterials = new Map<IfcVisualMaterialKind, THREE.Material>();
  const materialKeys = new Set<string>();
  const materialDiagnostics: Array<{
    meshName: string;
    materialName: string;
    materialType: string;
    materialColor: string | null;
    hasMap: boolean;
    opacity: number;
    transparent: boolean;
  }> = [];
  let meshCount = 0;
  let originalMaterialsWithMap = 0;
  let preservedOriginalMaterials = 0;
  let colorFallbackMaterials = 0;
  let materialsWithColor = 0;
  let unnamedMaterials = 0;
  const classificationCounts: Record<IfcVisualMaterialKind, number> = {
    concreto_agregado: 0,
    concreto_liso: 0,
    grama: 0,
    vegetacao: 0,
    asfalto: 0,
    paver: 0,
    parede_revestida: 0,
    solo: 0,
    simple_text: 0,
    neutral: 0,
  };
  const largeMeshDiagnostics: Array<{
    meshName: string;
    kind: IfcVisualMaterialKind;
    size: [number, number, number];
  }> = [];

  model.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    meshCount += 1;
    mesh.userData.ifcVisualOnly = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const originalMaterials = getIfcVisualMaterials(mesh);
    const hasUsefulOriginalMaterial = originalMaterials.some(isIfcVisualMaterialUseful);

    originalMaterials.forEach(material => {
      const materialColor = getIfcVisualMaterialColor(material);
      const hasMap = hasIfcVisualTextureMap(material);
      materialKeys.add(`${material.type}::${material.name || "sem-nome"}::${materialColor || "sem-cor"}::${hasMap}`);
      if (materialColor) materialsWithColor += 1;
      if (hasMap) originalMaterialsWithMap += 1;
      if (!material.name?.trim()) unnamedMaterials += 1;

      materialDiagnostics.push({
        meshName: mesh.name || "(sem nome)",
        materialName: material.name || "(sem nome)",
        materialType: material.type,
        materialColor,
        hasMap,
        opacity: material.opacity,
        transparent: material.transparent,
      });
    });

    if (hasUsefulOriginalMaterial) {
      preservedOriginalMaterials += 1;
      originalMaterials.forEach(material => {
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      });
      return;
    }

    const textureKind = getIfcVisualTextureKind(mesh);
    classificationCounts[textureKind] += 1;
    const bounds = getIfcVisualMeshBounds(mesh);
    if (bounds?.isLargeHorizontalPlane) {
      largeMeshDiagnostics.push({
        meshName: mesh.name || "(sem nome)",
        kind: textureKind,
        size: [bounds.size.x, bounds.size.y, bounds.size.z],
      });
    }

    let fallbackMaterial = sharedFallbackMaterials.get(textureKind);
    if (!fallbackMaterial) {
      fallbackMaterial = createIfcVisualColorFallbackMaterial(textureKind);
      sharedFallbackMaterials.set(textureKind, fallbackMaterial);
    }

    colorFallbackMaterials += 1;
    mesh.material = fallbackMaterial;
  });

  console.info("[IFC Visual] base material summary", {
    terrainSoilCount: classificationCounts.solo,
    grassCount: classificationCounts.grama,
    vegetationCount: classificationCounts.vegetacao,
    asphaltCount: classificationCounts.asfalto,
    paverCount: classificationCounts.paver,
    concreteCount: classificationCounts.concreto_agregado + classificationCounts.concreto_liso,
    wallCount: classificationCounts.parede_revestida,
    neutralFallbackCount: classificationCounts.neutral,
    textCount: classificationCounts.simple_text,
    unnamedOrUnclassifiedCount: unnamedMaterials,
    preservedOriginalMaterials,
    colorFallbackMaterials,
    largeMeshDiagnostics: largeMeshDiagnostics.slice(0, 20),
  });
  console.info("[IFC Visual] material diagnostics", {
    totalMeshes: meshCount,
    uniqueOriginalMaterials: materialKeys.size,
    originalMaterialsWithMap,
    preservedOriginalMaterials,
    colorFallbackMaterials,
    materialsWithColor,
    unnamedMaterials,
    sample: materialDiagnostics.slice(0, 20),
  });
}

function IFCVisualModel({
  url,
  visible,
  paintEnabled,
  inspectEnabled,
  selectedPaintTexture,
  undoPaintSignal,
  clearPaintSignal,
  clearInspectSignal,
  testOverlays,
  productionOverlays,
  productionRealModeActive,
  onInspectSelection,
  onStatusChange,
}: {
  url: string;
  visible: boolean;
  paintEnabled: boolean;
  inspectEnabled: boolean;
  selectedPaintTexture: IfcVisualTextureKind;
  undoPaintSignal: number;
  clearPaintSignal: number;
  clearInspectSignal: number;
  testOverlays: Ifc3DTestOverlay[];
  productionOverlays: IfcProductionOverlay[];
  productionRealModeActive: boolean;
  onInspectSelection: (selection: IfcVisualInspectSelection | null) => void;
  onStatusChange: (status: IfcVisualStatus, message?: string | null) => void;
}) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const objectRef = useRef<THREE.Object3D | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadingUrlRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);
  const paintTextureLoaderRef = useRef<THREE.TextureLoader | null>(null);
  const paintTextureCacheRef = useRef(new Map<IfcVisualTextureKind, THREE.Texture>());
  const paintTextureStatusRef = useRef(new Map<IfcVisualTextureKind, "loading" | "loaded" | "error">());
  const paintHistoryRef = useRef<Array<{
    mesh: THREE.Mesh;
    previousMaterial: THREE.Material | THREE.Material[];
    paintedMaterial: THREE.Material;
  }>>([]);
  const inspectHighlightRef = useRef<{
    highlight: THREE.Mesh;
    boxHelper: THREE.Box3Helper | null;
  } | null>(null);
  const testOverlayRef = useRef<Array<{
    key: Ifc3DTestControlKey;
    entityId: string;
    highlight: THREE.Mesh;
    boxHelper: THREE.Box3Helper | null;
  }>>([]);
  const productionOverlayRef = useRef<Array<{
    key: string;
    entityId: string;
    materialSource: IfcRealMaterialSource;
    highlight: THREE.Mesh;
    boxHelper: THREE.Box3Helper | null;
  }>>([]);
  const realBaseMaterialRef = useRef<Array<{
    mesh: THREE.Mesh;
    previousMaterial: THREE.Material | THREE.Material[];
  }>>([]);
  const realHiddenMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const restorePaintEntry = useCallback((entry: {
    mesh: THREE.Mesh;
    previousMaterial: THREE.Material | THREE.Material[];
    paintedMaterial: THREE.Material;
  }) => {
    if (entry.mesh.material === entry.paintedMaterial) {
      entry.mesh.material = entry.previousMaterial;
    }
    disposeIfcVisualMaterial(entry.paintedMaterial);
  }, []);

  const applyPaintToMesh = useCallback((mesh: THREE.Mesh) => {
    const textureLoader = paintTextureLoaderRef.current || new THREE.TextureLoader();
    paintTextureLoaderRef.current = textureLoader;
    const previousMaterial = mesh.material as THREE.Material | THREE.Material[];
    const paintedMaterial = createIfcPaintMaterial(
      selectedPaintTexture,
      mesh,
      textureLoader,
      paintTextureCacheRef.current,
      paintTextureStatusRef.current
    );

    mesh.material = paintedMaterial;
    paintHistoryRef.current.push({ mesh, previousMaterial, paintedMaterial });
    console.info("[IFC Paint] painted object", {
      texture: selectedPaintTexture,
      texturePath: IFC_VISUAL_TEXTURES[selectedPaintTexture].path,
      uuid: mesh.uuid,
      name: mesh.name,
    });
  }, [selectedPaintTexture]);

  const clearInspectHighlight = useCallback(() => {
    const current = inspectHighlightRef.current;
    if (!current) return;

    disposeIfcHighlightOverlay(current);
    inspectHighlightRef.current = null;
  }, []);

  const selectIfcElementByEntityId = useCallback((mesh: THREE.Mesh, entityId: string) => {
    clearInspectHighlight();
    console.info("[IFC Select] selected entityId", { entityId });
    const result = createIfcEntityHighlightMesh(mesh, entityId);
    console.info("[IFC Select] matching faces count", { entityId, count: result.matchingFaces });

    if (!result.highlight) {
      console.info("[IFC Select] unable to isolate entity", {
        entityId,
        reason: result.reason,
        geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
        indexed: Boolean(mesh.geometry?.index),
      });
      return result;
    }

    inspectHighlightRef.current = { highlight: result.highlight, boxHelper: result.boxHelper };
    console.info("[IFC Select] highlight geometry created", { entityId, faces: result.matchingFaces });
    console.info("[IFC Select] highlight added to scene", {
      entityId,
      parentUuid: result.highlight.parent?.uuid || null,
      parentName: result.highlight.parent?.name || null,
    });
    console.info("[IFC Select] highlight vertex count", { entityId, count: result.highlightVertexCount });
    console.info("[IFC Select] bounding box min/max/size", result.boundsRaw);
    if (result.boxHelper) {
      console.info("[IFC Select] box helper added", {
        entityId,
        parentUuid: result.boxHelper.parent?.uuid || null,
        parentName: result.boxHelper.parent?.name || null,
      });
    }
    return result;
  }, [clearInspectHighlight]);

  const clearTestOverlays = useCallback(() => {
    testOverlayRef.current.forEach(disposeIfcHighlightOverlay);
    testOverlayRef.current = [];
  }, []);

  const clearProductionOverlays = useCallback(() => {
    const removed = productionOverlayRef.current.length;
    productionOverlayRef.current.forEach(disposeIfcRealVisualOverlay);
    productionOverlayRef.current = [];
    if (import.meta.env.DEV && removed > 0) {
      console.log("[IFC Real Visual] overlays removed", { removed });
    }
  }, []);

  const restoreIfcRealBaseMaterials = useCallback(() => {
    const restored = realBaseMaterialRef.current.length;
    realBaseMaterialRef.current.forEach(entry => {
      entry.mesh.material = entry.previousMaterial;
    });
    realBaseMaterialRef.current = [];
    realHiddenMaterialRef.current?.dispose();
    realHiddenMaterialRef.current = null;
    if (import.meta.env.DEV && restored > 0) {
      console.log("[IFC Real Visual] base materials restored", { restored });
    }
  }, []);

  useEffect(() => {
    restoreIfcRealBaseMaterials();
    if (!visible || !objectRef.current || !productionRealModeActive) return;

    const hiddenMaterial = createIfcHiddenBaseMaterial();
    realHiddenMaterialRef.current = hiddenMaterial;
    const entries: Array<{ mesh: THREE.Mesh; previousMaterial: THREE.Material | THREE.Material[] }> = [];
    objectRef.current.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      entries.push({ mesh, previousMaterial: mesh.material as THREE.Material | THREE.Material[] });
      mesh.material = hiddenMaterial;
    });
    realBaseMaterialRef.current = entries;

    if (import.meta.env.DEV) {
      console.log("[IFC Real Visual] base hidden", { meshCount: entries.length });
      console.log("[IFC Real Context] base visibility", {
        baseHidden: true,
        affectedBaseMeshes: entries.length,
      });
    }

    return () => {
      restoreIfcRealBaseMaterials();
    };
  }, [object, productionRealModeActive, restoreIfcRealBaseMaterials, visible]);

  const testOverlayKey = useMemo(() => {
    return testOverlays.map(item => `${item.key}:${item.entityId}`).sort().join("|");
  }, [testOverlays]);

  const productionOverlayKey = useMemo(() => {
    return productionOverlays.map(item => `${item.key}:${item.entityId}`).sort().join("|");
  }, [productionOverlays]);

  useEffect(() => {
    clearTestOverlays();
    if (!visible || !objectRef.current || testOverlays.length === 0) return;

    const meshes: THREE.Mesh[] = [];
    objectRef.current.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
    });

    if (import.meta.env.DEV) {
      console.log("[IFC Test] entity ids used", testOverlays.map(item => ({
        key: item.key,
        label: item.label,
        entityId: item.entityId,
        targetExpressId: getIfcEntityNumericId(item.entityId),
      })));
    }

    testOverlays.forEach(item => {
      let created = false;
      for (const mesh of meshes) {
        const result = createIfcEntityHighlightMesh(mesh, item.entityId);
        if (import.meta.env.DEV) {
          console.log("[IFC Test] overlay attempt", {
            key: item.key,
            label: item.label,
            entityId: item.entityId,
            targetExpressId: getIfcEntityNumericId(item.entityId),
            created: !!result.highlight,
            matchingFaces: result.matchingFaces,
            reason: result.reason,
            geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
            meshName: mesh.name || null,
            meshUuid: mesh.uuid,
          });
        }
        if (!result.highlight) continue;

        testOverlayRef.current.push({
          key: item.key,
          entityId: item.entityId,
          highlight: result.highlight,
          boxHelper: result.boxHelper,
        });
        if (import.meta.env.DEV) {
          console.log("[IFC Test] overlay created", {
            key: item.key,
            label: item.label,
            entityId: item.entityId,
            targetExpressId: getIfcEntityNumericId(item.entityId),
            matchingFaces: result.matchingFaces,
            vertexCount: result.highlightVertexCount,
            bounds: result.boundsRaw,
            geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
          });
        }
        created = true;
        break;
      }

      if (!created && import.meta.env.DEV) {
        console.log("[IFC Test] unable to create overlay", {
          key: item.key,
          label: item.label,
          entityId: item.entityId,
          targetExpressId: getIfcEntityNumericId(item.entityId),
          meshCount: meshes.length,
        });
      }
    });

    return () => {
      clearTestOverlays();
    };
  }, [clearTestOverlays, object, testOverlayKey, testOverlays, visible]);

  useEffect(() => {
    clearProductionOverlays();
    if (!visible || !objectRef.current || productionOverlays.length === 0) return;

    const meshes: THREE.Mesh[] = [];
    objectRef.current.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
    });

    if (import.meta.env.DEV) {
      console.log("[IFC Real Visual] entity ids used", productionOverlays.map(item => ({
        key: item.key,
        label: item.label,
        entityId: item.entityId,
        role: item.role,
        progressPercent: item.progressPercent,
        opacity: getIfcRealOpacity(item.progressPercent, item.role),
        targetExpressId: getIfcEntityNumericId(item.entityId),
      })));
    }

    let createdCount = 0;
    let originalMaterialCount = 0;
    let fallbackMaterialCount = 0;
    const materialSamples: Array<{
      entityId: string;
      progressPercent: number;
      role: IfcProductionOverlay["role"];
      materialSource: IfcRealMaterialSource;
    }> = [];
    productionOverlays.forEach(item => {
      let created = false;
      for (const mesh of meshes) {
        const originalEntry = realBaseMaterialRef.current.find(entry => entry.mesh === mesh);
        const sourceMaterial = originalEntry?.previousMaterial || (mesh.material as THREE.Material | THREE.Material[] | undefined);
        const { material, source: materialSource } = createIfcRealVisualMaterialFromSource(sourceMaterial, item.progressPercent, item.role);
        const result = createIfcEntityHighlightMesh(mesh, item.entityId, {
          material,
          name: `IFC real ${item.role} entity ${item.entityId}`,
          renderOrder: item.role === "context" ? 900 : 1200,
          includeBoxHelper: false,
        });
        if (import.meta.env.DEV) {
          console.log("[IFC Real Visual] overlay attempt", {
            key: item.key,
            label: item.label,
            entityId: item.entityId,
            role: item.role,
            progressPercent: item.progressPercent,
            opacity: getIfcRealOpacity(item.progressPercent, item.role),
            materialSource,
            targetExpressId: getIfcEntityNumericId(item.entityId),
            created: !!result.highlight,
            matchingFaces: result.matchingFaces,
            reason: result.reason,
            geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
            meshName: mesh.name || null,
            meshUuid: mesh.uuid,
          });
          if (item.role === "context") {
            console.log("[IFC Real Context] subset attempt", {
              key: item.key,
              label: item.label,
              entityId: item.entityId,
              matchingFaces: result.matchingFaces,
              created: !!result.highlight,
              skipReason: result.highlight ? null : result.reason || "subset_not_created",
              geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
              meshName: mesh.name || null,
              meshUuid: mesh.uuid,
              materialSource,
            });
          }
        }
        if (!result.highlight) {
          material.dispose();
          continue;
        }

        productionOverlayRef.current.push({
          key: item.key,
          entityId: item.entityId,
          materialSource,
          highlight: result.highlight,
          boxHelper: result.boxHelper,
        });
        if (materialSource === "fallback") fallbackMaterialCount += 1;
        else originalMaterialCount += 1;
        if (materialSamples.length < 6) {
          materialSamples.push({
            entityId: item.entityId,
            progressPercent: item.progressPercent,
            role: item.role,
            materialSource,
          });
        }
        createdCount += 1;
        created = true;
        break;
      }

      if (!created && import.meta.env.DEV) {
        console.log("[IFC Real Visual] unable to create overlay", {
          key: item.key,
          label: item.label,
          entityId: item.entityId,
          role: item.role,
          progressPercent: item.progressPercent,
          targetExpressId: getIfcEntityNumericId(item.entityId),
          meshCount: meshes.length,
        });
        if (item.role === "context") {
          console.log("[IFC Real Context] skipped render", {
            key: item.key,
            label: item.label,
            entityId: item.entityId,
            skipReason: meshes.length === 0 ? "no_mesh_with_geometry" : "matchingFaces_zero_or_subset_failed",
            meshCount: meshes.length,
          });
        }
      }
    });

    if (import.meta.env.DEV) {
      console.log("[IFC Real Visual] overlays created", {
        requested: productionOverlays.length,
        created: createdCount,
        context: productionOverlays.filter(item => item.role === "context").length,
        production: productionOverlays.filter(item => item.role === "production").length,
        originalMaterials: originalMaterialCount,
        fallbackMaterials: fallbackMaterialCount,
        materialSamples,
      });
    }

    return () => {
      clearProductionOverlays();
    };
  }, [clearProductionOverlays, object, productionOverlayKey, productionOverlays, visible]);

  const inspectMesh = useCallback((event: any, hit: THREE.Object3D) => {
    logIfcInspectIntersections(event);

    const intersection = findIfcInspectableIntersection(event);
    const mesh = findIfcVisualMesh(intersection?.object || null);
    if (!mesh) {
      console.info("[IFC Inspect] no inventory match", { reason: "no mesh", uuid: hit.uuid, name: hit.name, type: hit.type });
      onInspectSelection(null);
      return;
    }

    const expressIdResult = getIfcExpressIdFromIntersection(intersection);
    const bounds = getIfcVisualObjectBounds(mesh);
    const hitRootOrGroup = isIfcVisualRootOrWholeModel(intersection?.object || hit, objectRef.current);
    const identificationError = expressIdResult.entityId
      ? null
      : "Não foi possível identificar o elemento IFC individual neste clique";

    const selection: IfcVisualInspectSelection = {
      uuid: mesh.uuid,
      objectName: hitRootOrGroup && !expressIdResult.entityId ? null : mesh.name || null,
      objectType: mesh.type,
      parentName: mesh.parent?.name || null,
      parentUuid: mesh.parent?.uuid || null,
      entityId: expressIdResult.entityId,
      globalId: getIfcVisualSelectionGlobalId(intersection, mesh),
      center: bounds.center,
      size: bounds.size,
      hitRootOrGroup,
      identificationError,
      geometryAttributes: getIfcGeometryAttributeNames(mesh.geometry),
      faceIndex: typeof intersection?.faceIndex === "number" ? intersection.faceIndex : null,
    };

    if (selection.entityId && !isIfcVisualRootOrWholeModel(mesh, objectRef.current)) {
      const highlightResult = selectIfcElementByEntityId(mesh, selection.entityId);
      if (highlightResult?.bounds.center && highlightResult.bounds.size) {
        selection.center = highlightResult.bounds.center;
        selection.size = highlightResult.bounds.size;
      }
    } else {
      clearInspectHighlight();
      if (!selection.entityId) {
        console.info("[IFC Inspect] no inventory match", {
          reason: expressIdResult.reason,
          uuid: mesh.uuid,
          name: mesh.name,
          attributes: selection.geometryAttributes,
        });
      }
    }

    onInspectSelection(selection);
    console.info("[IFC Inspect] selected mesh", selection);
    if (selection.hitRootOrGroup) {
      console.info("[IFC Inspect] click hit root/group before mesh", {
        hitUuid: hit.uuid,
        hitName: hit.name,
        hitType: hit.type,
        meshUuid: mesh.uuid,
      });
    }
  }, [clearInspectHighlight, onInspectSelection, selectIfcElementByEntityId]);

  useEffect(() => {
    if (undoPaintSignal <= 0) return;
    const entry = paintHistoryRef.current.pop();
    if (!entry) {
      console.info("[IFC Paint] undo", { restored: false });
      return;
    }

    restorePaintEntry(entry);
    console.info("[IFC Paint] undo", { restored: true, uuid: entry.mesh.uuid, name: entry.mesh.name });
  }, [restorePaintEntry, undoPaintSignal]);

  useEffect(() => {
    if (clearPaintSignal <= 0) return;
    const entries = [...paintHistoryRef.current].reverse();
    paintHistoryRef.current = [];
    entries.forEach(restorePaintEntry);
    console.info("[IFC Paint] clear local paints", { count: entries.length });
  }, [clearPaintSignal, restorePaintEntry]);

  useEffect(() => {
    if (clearInspectSignal <= 0) return;
    clearInspectHighlight();
  }, [clearInspectHighlight, clearInspectSignal]);

  useEffect(() => {
    if (!visible) {
      loadTokenRef.current += 1;
      loadingUrlRef.current = null;

      paintHistoryRef.current = [];
      disposeIfcVisualTextureCache(paintTextureCacheRef.current);
      clearInspectHighlight();
      clearProductionOverlays();
      restoreIfcRealBaseMaterials();

      if (objectRef.current) {
        disposeIfcVisualObject(objectRef.current);
        objectRef.current = null;
        objectUrlRef.current = null;
        setObject(null);
        console.info("[IFC Visual] disposed");
      }

      return;
    }

    if (objectRef.current && objectUrlRef.current === url) {
      onStatusChange("ready", null);
      return;
    }

    if (loadingUrlRef.current === url) {
      return;
    }

    let cancelled = false;
    const loadToken = loadTokenRef.current + 1;
    loadTokenRef.current = loadToken;
    loadingUrlRef.current = url;

    const loadVisualIfc = async () => {
      paintHistoryRef.current = [];
      clearInspectHighlight();
      clearProductionOverlays();
      restoreIfcRealBaseMaterials();

      if (objectRef.current) {
        disposeIfcVisualObject(objectRef.current);
        objectRef.current = null;
        objectUrlRef.current = null;
        setObject(null);
        console.info("[IFC Visual] disposed");
      }

      setObject(null);
      setLoadError(null);
      onStatusChange("loading", null);
      console.info("[IFC Visual] loading url...", { url });

      let wasmDiagnostics: Awaited<ReturnType<typeof inspectIfcVisualWasmFiles>> | null = null;

      try {
        wasmDiagnostics = await inspectIfcVisualWasmFiles();
        console.info("[IFC] Diagnostico WASM visual", wasmDiagnostics);

        const IFCLoader = await loadIfcLoaderConstructor();
        const loader = new IFCLoader();

        if (loader.ifcManager?.useWebWorkers) {
          await loader.ifcManager.useWebWorkers(false);
        }

        if (loader.ifcManager?.setWasmPath) {
          await loader.ifcManager.setWasmPath(IFC_VISUAL_WASM_PATH);
        }

        if (loader.ifcManager?.applyWebIfcConfig) {
          await loader.ifcManager.applyWebIfcConfig({
            COORDINATE_TO_ORIGIN: true,
            USE_FAST_BOOLS: true,
          });
        }

        const model = await new Promise<THREE.Object3D>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });

        if (cancelled || loadTokenRef.current !== loadToken) {
          disposeIfcVisualObject(model);
          console.info("[IFC Visual] disposed");
          return;
        }

        model.name = "IFC visual diagnostic model";
        configureIfcVisualMaterials(model);

        objectRef.current = model;
        objectUrlRef.current = url;
        loadingUrlRef.current = null;
        setObject(model);
        onStatusChange("ready", null);
        console.info("[IFC Visual] loaded");
      } catch (err: any) {
        if (cancelled || loadTokenRef.current !== loadToken) return;
        console.warn("[IFC] Falha na renderizacao visual IFC", err);
        const message = describeIfcVisualError(err, wasmDiagnostics);
        loadingUrlRef.current = null;
        onStatusChange("error", message);
        setLoadError(message);
      }
    };

    void loadVisualIfc();

    return () => {
      cancelled = true;
      if (loadTokenRef.current === loadToken) {
        loadTokenRef.current += 1;
        loadingUrlRef.current = null;
      }

      paintHistoryRef.current = [];
      clearInspectHighlight();
      clearProductionOverlays();
      restoreIfcRealBaseMaterials();

      if (objectRef.current && objectUrlRef.current === url) {
        disposeIfcVisualObject(objectRef.current);
        objectRef.current = null;
        objectUrlRef.current = null;
        setObject(null);
        console.info("[IFC Visual] disposed");
      }
    };
  }, [clearInspectHighlight, clearProductionOverlays, onStatusChange, restoreIfcRealBaseMaterials, url, visible]);

  if (!visible) return null;

  return (
    <>
      {visible && !object && !loadError && (
        <Html center>
          <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow">
            Carregando IFC visual...
          </div>
        </Html>
      )}
      {visible && loadError && (
        <Html center>
          <div className="max-w-xs rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow">
            IFC visual indisponivel. Inventario textual mantido.
          </div>
        </Html>
      )}
      {object && (
        <primitive
          object={object}
          onClick={(event: any) => {
            event.stopPropagation();
            const hit = event.object as THREE.Object3D;
            const mesh = findIfcVisualMesh(hit);
            if (inspectEnabled) {
              inspectMesh(event, hit);
              return;
            }
            if (paintEnabled) {
              if (!mesh) {
                console.info("[IFC Paint] no object hit");
                return;
              }
              applyPaintToMesh(mesh);
              return;
            }
            console.info("[IFC] Clique visual", {
              uuid: hit.uuid,
              name: hit.name,
              type: hit.type,
              expressID: hit.userData?.expressID,
            });
          }}
          onPointerMissed={() => {
            if (inspectEnabled) console.info("[IFC Inspect] no object hit");
            if (paintEnabled) console.info("[IFC Paint] no object hit");
          }}
        />
      )}
    </>
  );
}

function buildIfcElementPayload(item: IfcInventoryItem, projectId: string, companyId: string, modelId: string) {
  return {
    company_id: companyId,
    project_id: projectId,
    model_id: modelId,
    ifc_global_id: item.globalId || null,
    ifc_entity_id: item.id,
    ifc_type: item.type,
    ifc_layer_name: item.primaryLayerName,
    name: item.name || null,
    detected_service_key: item.detectedServiceKey,
    detected_service_label: item.detectedServiceLabel,
    detected_house_number: item.detectedHouseNumber,
    category: mapIfcCategory(item.category),
    confidence: item.semanticConfidence,
    needs_review: item.semanticNeedsReview || item.semanticConfidence !== "high",
    status: "suggested",
    raw_properties: {
      layerNames: item.layerNames,
      quotedValues: item.quotedValues,
      rawLine: item.rawLine,
      reachableRefsCount: item.reachableRefs.length,
      cartesianPointCount: item.refDiagnostics.cartesianPointCount,
      hasLocalPlacement: item.refDiagnostics.hasLocalPlacement,
      hasAxis2Placement3D: item.refDiagnostics.hasAxis2Placement3D,
      hasProductDefinitionShape: item.refDiagnostics.hasProductDefinitionShape,
      hasExtrudedAreaSolid: item.refDiagnostics.hasExtrudedAreaSolid,
      firstReachedTypes: item.refDiagnostics.firstReachedTypes,
      position: item.position,
      positionPointCount: item.positionPointCount,
      positionSource: item.positionSource,
      placementPosition: item.placementPosition,
      placementRefId: item.placementRefId,
      axisPlacementRefId: item.axisPlacementRefId,
      cartesianPointRefId: item.cartesianPointRefId,
      cartesianPointLinePreview: item.cartesianPointLinePreview,
      parsedCartesianPoint: item.parsedCartesianPoint,
      cartesianPointParseFailed: item.cartesianPointParseFailed,
      placementPositionIgnored: item.placementPositionIgnored,
      placementPositionIgnoreReason: item.placementPositionIgnoreReason,
      sharedPlacementKey: item.sharedPlacementKey,
      anchorHouseNumber: item.anchorHouseNumber,
      anchorElementId: item.anchorElementId,
      anchorElementName: item.anchorElementName,
      anchorDistance: item.anchorDistance,
      houseDetectionSource: item.houseDetectionSource,
    },
  };
}

export function IFCModel({ url, projectId, companyId, onLoaded, onSceneReady, onMeshClick, selectedMeshKey, ifcRealModeActive = false, houseOptions = [], serviceOptions = [] }: Props) {
  const [items, setItems] = useState<IfcInventoryItem[]>([]);
  const [filter, setFilter] = useState<IfcInventoryFilter>("production");
  const [search, setSearch] = useState("");
  const [expandedRawLines, setExpandedRawLines] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<IfcInventorySaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [persistDiagnostics, setPersistDiagnostics] = useState<PersistDiagnostics | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showVisualIfc, setShowVisualIfc] = useState(true);
  const [visualStatus, setVisualStatus] = useState<IfcVisualStatus>("idle");
  const [visualMessage, setVisualMessage] = useState<string | null>(null);
  const [paintModeEnabled, setPaintModeEnabled] = useState(false);
  const [inspectModeEnabled, setInspectModeEnabled] = useState(false);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [ifcPanelOpen, setIfcPanelOpen] = useState(false);
  const [inspectPanelCollapsed, setInspectPanelCollapsed] = useState(false);
  const [inspectSelection, setInspectSelection] = useState<IfcVisualInspectSelection | null>(null);
  const [inspectGroupMode, setInspectGroupMode] = useState<IfcInspectGroupMode>("none");
  const [persistedElements, setPersistedElements] = useState<IfcPersistedElementRow[]>([]);
  const [ifc3dTestLinkedElements, setIfc3dTestLinkedElements] = useState<Ifc3DTestLinkedElementRow[]>([]);
  const [ifcLinkEditSavingId, setIfcLinkEditSavingId] = useState<string | null>(null);
  const [ifc3dTestEnabled, setIfc3dTestEnabled] = useState(false);
  const [ifc3dTestToggles, setIfc3dTestToggles] = useState<Record<Ifc3DTestControlKey, boolean>>({
    "91-radier": false,
    "91-paredes": false,
    "92-radier": false,
    "92-paredes": false,
  });
  const [selectedPaintTexture, setSelectedPaintTexture] = useState<IfcVisualTextureKind>("paver");
  const [undoPaintSignal, setUndoPaintSignal] = useState(0);
  const [clearPaintSignal, setClearPaintSignal] = useState(0);
  const [clearInspectSignal, setClearInspectSignal] = useState(0);
  const calledRef = useRef(false);
  const persistedKeyRef = useRef<string | null>(null);
  const autoMinimizedInventoryRef = useRef(false);
  const inspectPanelOpenLoggedRef = useRef(false);
  const productionActivationDiagnostics = useIfcProductionActivationDiagnostics({
    projectId,
    enabled: !!projectId && ifcRealModeActive && showVisualIfc && visualStatus === "ready",
  });

  void onSceneReady;
  void onMeshClick;
  void selectedMeshKey;

  const handleVisualStatusChange = useCallback((status: IfcVisualStatus, message?: string | null) => {
    setVisualStatus(status);
    setVisualMessage(message || null);
  }, []);

  const handleSelectPaintTexture = useCallback((kind: IfcVisualTextureKind) => {
    setSelectedPaintTexture(kind);
    console.info("[IFC Paint] texture selected", {
      texture: kind,
      texturePath: IFC_VISUAL_TEXTURES[kind].path,
    });
  }, []);

  const handleTogglePaintMode = useCallback(() => {
    setPaintModeEnabled(prev => {
      const next = !prev;
      if (next) {
        setInspectModeEnabled(false);
        setInspectGroupMode("none");
      }
      return next;
    });
  }, []);

  const handleToggleInspectMode = useCallback(() => {
    setInspectModeEnabled(prev => {
      const next = !prev;
      if (next) {
        setPaintModeEnabled(false);
      } else {
        setInspectSelection(null);
        setInspectGroupMode("none");
        setClearInspectSignal(value => value + 1);
      }
      return next;
    });
  }, []);

  const handleInspectSelection = useCallback((selection: IfcVisualInspectSelection | null) => {
    setInspectSelection(selection);
    setInspectGroupMode("none");
    if (selection) {
      setInspectPanelCollapsed(false);
      // Painel direito permanece fechado por padrão para não atrapalhar a navegação 3D.
      // O usuário abre manualmente pela pill "IFC" no topo.
    }
  }, [focusModeEnabled]);

  const handleClearInspectSelection = useCallback(() => {
    setInspectSelection(null);
    setInspectGroupMode("none");
    setInspectPanelCollapsed(false);
    setClearInspectSignal(value => value + 1);
  }, []);

  const handleToggleFocusMode = useCallback(() => {
    setFocusModeEnabled(prev => {
      const next = !prev;
      if (next) {
        setMinimized(true);
        setToolsOpen(false);
        setIfcPanelOpen(false);
        console.info("[IFC UI] inventory compact mode");
      } else {
        setToolsOpen(true);
        setIfcPanelOpen(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setItems([]);
    setExpandedRawLines(new Set());
    setSaveStatus("idle");
    setSaveMessage(null);
    setPersistDiagnostics(null);
    setPersistedElements([]);
    setIfc3dTestLinkedElements([]);
    setInspectSelection(null);
    setInspectGroupMode("none");
    setFocusModeEnabled(false);
    setToolsOpen(true);
    setIfcPanelOpen(false);
    setInspectPanelCollapsed(false);
    setIfc3dTestEnabled(false);
    setIfc3dTestToggles({
      "91-radier": false,
      "91-paredes": false,
      "92-radier": false,
      "92-paredes": false,
    });
    calledRef.current = false;
    persistedKeyRef.current = null;
    autoMinimizedInventoryRef.current = false;

    const loadIfcText = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const text = await response.text();
        if (cancelled) return;
        setItems(parseIfcText(text));
        setLoaded(true);
      } catch (err: any) {
        if (cancelled) return;
        setError(`Falha ao ler IFC: ${err?.message || "erro desconhecido"}`);
        setLoaded(true);
      }
    };

    void loadIfcText();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!loaded || calledRef.current) return;
    calledRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
  }, [loaded, onLoaded]);

  useEffect(() => {
    if (!loaded || error || !projectId || !companyId) return;

    const persistenceKey = `${projectId}:${companyId}:${url}:${items.length}`;
    if (persistedKeyRef.current === persistenceKey) return;
    persistedKeyRef.current = persistenceKey;

    let cancelled = false;

    const persistInventory = async () => {
      setSaveStatus("saving");
      setSaveMessage("Salvando inventário como sugestões...");
      setPersistDiagnostics(null);
      let persistStage = "initial";
      const diagnostics: PersistDiagnostics = {
        authUserId: null,
        authUserEmail: null,
        projectId: projectId || null,
        companyId: companyId || null,
        profileCompanyId: null,
        projectCompanyId: null,
        companyMatches: null,
        effectiveCompanyId: null,
        modelPayloadCompanyId: null,
        modelPayloadProjectId: null,
        stage: persistStage,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
        errorHint: null,
        nonFatal: false,
      };

      try {
        const modelTable = supabase.from("project_3d_models" as any);
        const elementsTable = supabase.from("project_ifc_elements" as any);

        persistStage = "get_auth_user";
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        const authUser = authData.user;
        diagnostics.authUserId = authUser?.id || null;
        diagnostics.authUserEmail = authUser?.email || null;
        diagnostics.stage = persistStage;

        console.info("[IFC][RLS diagnostics] Auth user", {
          authUserId: authUser?.id || null,
          authUserEmail: authUser?.email || null,
          projectId,
          companyId,
          url,
        });

        persistStage = "load_profile";
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, user_id, email, company_id, system_role")
          .eq("user_id", authUser?.id || "")
          .maybeSingle();
        if (profileError) throw profileError;
        diagnostics.profileCompanyId = profileData?.company_id || null;
        diagnostics.stage = persistStage;

        persistStage = "load_project";
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("id, name, company_id")
          .eq("id", projectId)
          .maybeSingle();
        if (projectError) throw projectError;
        diagnostics.projectCompanyId = projectData?.company_id || null;
        diagnostics.companyMatches = Boolean(profileData?.company_id && projectData?.company_id && profileData.company_id === projectData.company_id);
        const effectiveCompanyId = projectData?.company_id || profileData?.company_id || companyId;
        diagnostics.effectiveCompanyId = effectiveCompanyId || null;
        diagnostics.stage = persistStage;

        console.info("[IFC][RLS diagnostics] Profile/project company check", {
          profileCompanyId: profileData?.company_id || null,
          projectCompanyId: projectData?.company_id || null,
          effectiveCompanyId,
          companyMatches: Boolean(profileData?.company_id && projectData?.company_id && profileData.company_id === projectData.company_id),
          profile: profileData,
          project: projectData,
        });

        persistStage = "find_existing_model";
        let existingModelQuery = modelTable
          .select("id")
          .eq("project_id", projectId)
          .eq("storage_path", url)
          .eq("model_type", "ifc")
          .limit(1);
        if (effectiveCompanyId) existingModelQuery = existingModelQuery.eq("company_id", effectiveCompanyId);
        const { data: existingModelData, error: findModelError } = await existingModelQuery.maybeSingle();
        if (findModelError) throw findModelError;

        const existingModel = asProject3DModelIdRow(existingModelData as unknown);
        let modelId = existingModel?.id as string | undefined;
        let createdNewModel = false;

        if (!modelId) {
          persistStage = "insert_project_3d_model";
          const modelPayload = {
            company_id: companyId,
            project_id: projectId,
            model_type: "ifc",
            storage_path: url,
            file_name: getIfcFileName(url),
            status: "inventory_ready",
          };
          diagnostics.modelPayloadCompanyId = modelPayload.company_id || null;
          diagnostics.modelPayloadProjectId = modelPayload.project_id || null;
          diagnostics.stage = persistStage;

          console.info("[IFC][RLS diagnostics] project_3d_models insert payload", modelPayload);

          const { data: insertedModelData, error: insertModelError } = await modelTable
            .insert([modelPayload])
            .select("id")
            .single();
          if (insertModelError) throw insertModelError;
          const insertedModel = asProject3DModelIdRow(insertedModelData as unknown);
          if (!insertedModel?.id) throw new Error("Modelo IFC criado sem id retornado.");
          modelId = insertedModel.id;
          createdNewModel = true;
        }

        persistStage = "delete_old_suggestions";
        const { error: deleteSuggestedError } = await elementsTable
          .delete()
          .eq("model_id", modelId)
          .eq("status", "suggested");
        if (deleteSuggestedError) throw deleteSuggestedError;

        persistStage = "load_protected_elements";
        const { data: protectedElementsData, error: protectedError } = await elementsTable
          .select("ifc_global_id, ifc_entity_id")
          .eq("model_id", modelId)
          .in("status", ["confirmed", "ignored"]);
        if (protectedError) throw protectedError;

        const protectedElements = asProtectedIfcElementRows(protectedElementsData as unknown);
        const protectedGlobalIds = new Set(
          protectedElements
            .map(item => item.ifc_global_id)
            .filter((value): value is string => Boolean(value))
        );
        const protectedEntityIds = new Set(
          protectedElements
            .map(item => item.ifc_entity_id)
            .filter((value): value is string => Boolean(value))
        );
        const rows = items
          .filter(item => {
            if (item.globalId && protectedGlobalIds.has(item.globalId)) return false;
            if (!item.globalId && protectedEntityIds.has(item.id)) return false;
            return true;
          })
          .map(item => buildIfcElementPayload(item, projectId, companyId, modelId!));

        if (rows.length > 0) {
          persistStage = "insert_ifc_elements";
          const { error: insertElementsError } = await elementsTable.insert(rows);
          if (insertElementsError) throw insertElementsError;
        }

        console.info("[IFC][RLS diagnostics] update_model_status ignorado; status do modelo é definido no insert", {
          modelId,
          projectId,
          companyId,
          effectiveCompanyId,
          createdNewModel,
          status: "inventory_ready",
        });

        if (cancelled) return;
        setSaveStatus("saved");
        setSaveMessage("Inventário salvo como sugestões");
        setPersistDiagnostics(null);
      } catch (err: any) {
        const code = err?.code ? ` [${err.code}]` : "";
        const detail = err?.message || err?.details || err?.hint || "erro desconhecido";
        diagnostics.stage = persistStage;
        diagnostics.errorCode = err?.code || null;
        diagnostics.errorMessage = err?.message || null;
        diagnostics.errorDetails = err?.details || null;
        diagnostics.errorHint = err?.hint || null;
        console.error("[IFC] Falha ao salvar inventário", {
          stage: persistStage,
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          raw: err,
        });
        if (cancelled) return;
        persistedKeyRef.current = null;
        setSaveStatus("error");
        setSaveMessage(`Falha ao salvar inventário${code}: ${detail}`);
        setPersistDiagnostics(diagnostics);
      }
    };

    void persistInventory();

    return () => {
      cancelled = true;
    };
  }, [companyId, error, items, loaded, projectId, url]);

  useEffect(() => {
    if (!loaded || error || !projectId) {
      setPersistedElements([]);
      setIfc3dTestLinkedElements([]);
      return;
    }

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadPersistedElements = async () => {
      try {
        const modelTable = supabase.from("project_3d_models" as any);
        const elementsTable = supabase.from("project_ifc_elements" as any);
        const linksTable = supabase.from("project_ifc_element_links" as any);

        // Resolve all model rows matching this storage_path (re-uploads create
        // multiple rows). Ordered newest first so we mirror the Suggestions
        // Panel and can fall back across siblings if confirmed links live on
        // another row id.
        let existingModelQuery = modelTable
          .select("id, created_at")
          .eq("project_id", projectId)
          .eq("storage_path", url)
          .eq("model_type", "ifc")
          .order("created_at", { ascending: false });

        if (companyId) {
          existingModelQuery = existingModelQuery.eq("company_id", companyId);
        }

        const { data: modelRowsData, error: modelError } = await existingModelQuery;
        if (modelError) throw modelError;

        const modelRows = (Array.isArray(modelRowsData) ? modelRowsData : []) as unknown as Array<Record<string, unknown>>;
        const candidateModelIds = modelRows
          .map(row => normalizeNullableString(row?.id))
          .filter((value): value is string => !!value);

        if (import.meta.env.DEV) {
          console.log("[IFC Test] model resolved", {
            projectId,
            companyId: companyId ?? null,
            primaryModelId: candidateModelIds[0] ?? null,
            candidateCount: candidateModelIds.length,
            candidateModelIds,
          });
        }
        if (candidateModelIds.length === 0) {
          if (!cancelled) {
            setPersistedElements([]);
            setIfc3dTestLinkedElements([]);
          }
          return;
        }

        // Look up confirmed links across ALL candidate model rows for this
        // storage_path. The "Teste 3D Real IFC" only needs the union of
        // confirmed links to enable the overlay; using the union avoids the
        // bug where the picked model id has zero links because confirmations
        // were performed against a sibling row.
        const { data: linksData, error: linksError } = await linksTable
          .select("id, model_id, ifc_element_id, house_id, house_number, trigger_service_key, trigger_service_label, status")
          .eq("project_id", projectId)
          .in("model_id", candidateModelIds)
          .eq("status", "confirmed");
        if (linksError) throw linksError;

        const finalLinkRows = asIfcFinalLinkRows(linksData as unknown);

        // Pick the model id that actually owns the confirmed links; fall back
        // to the newest row when none have links yet.
        const linkModelIds = Array.from(
          new Set(finalLinkRows.map(link => link.model_id).filter((value): value is string => !!value)),
        );
        const elementModelIds = linkModelIds.length > 0 ? linkModelIds : [candidateModelIds[0]];

        const { data: elementsData, error: elementsError } = await elementsTable
          .select("id, model_id, ifc_global_id, ifc_entity_id, ifc_type, ifc_layer_name, name, detected_service_key, detected_service_label, detected_house_number, category, confidence, needs_review, status, raw_properties")
          .eq("project_id", projectId)
          .in("model_id", elementModelIds);
        if (elementsError) throw elementsError;

        if (import.meta.env.DEV) {
          console.log("[IFC Test] persisted elements loaded", {
            projectId,
            companyId: companyId ?? null,
            modelIds: elementModelIds,
            count: Array.isArray(elementsData) ? elementsData.length : 0,
            sample: asIfcPersistedElementRows(elementsData as unknown).slice(0, 3).map(element => ({
              id: element.id,
              ifc_entity_id: element.ifc_entity_id,
              ifc_global_id: element.ifc_global_id,
              detected_house_number: element.detected_house_number,
              detected_service_key: element.detected_service_key,
              status: element.status,
              category: element.category,
            })),
            error: elementsError,
          });
          console.log("[IFC Test] links loaded", {
            projectId,
            modelIds: candidateModelIds,
            count: Array.isArray(linksData) ? linksData.length : 0,
            sample: asIfcFinalLinkRows(linksData as unknown).slice(0, 3).map(link => ({
              id: link.id,
              model_id: link.model_id,
              ifc_element_id: link.ifc_element_id,
              house_id: link.house_id,
              house_number: link.house_number,
              trigger_service_key: link.trigger_service_key,
              trigger_service_label: link.trigger_service_label,
              status: link.status,
            })),
            error: linksError,
          });
        }

        if (elementsError) throw elementsError;
        if (linksError) throw linksError;
        const nextPersistedElements = asIfcPersistedElementRows(elementsData as unknown);
        const nextFinalLinks = asIfcFinalLinkRows(linksData as unknown);
        if (!cancelled) {
          setPersistedElements(nextPersistedElements);
          setIfc3dTestLinkedElements(buildIfc3DTestLinkedElements(nextPersistedElements, nextFinalLinks));
        }
      } catch (err) {
        console.warn("[IFC Inspect] Falha ao carregar inventario persistido", err);
        if (!cancelled) {
          setPersistedElements([]);
          setIfc3dTestLinkedElements([]);
        }
      }
    };

    void loadPersistedElements();
    const handleIfcLinksUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string | null; modelId?: string | null }>).detail;
      if (detail?.projectId !== projectId) return;
      if (import.meta.env.DEV) {
        console.log("[IFC Test] links updated event received", {
          projectId,
          eventModelId: detail?.modelId ?? null,
        });
      }
      void loadPersistedElements();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("obramap:ifc-links-updated", handleIfcLinksUpdated);
    }
    channel = supabase
      .channel(`ifc-final-links-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_ifc_element_links", filter: `project_id=eq.${projectId}` },
        () => { void loadPersistedElements(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("obramap:ifc-links-updated", handleIfcLinksUpdated);
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [companyId, error, loaded, projectId, saveStatus, url]);

  const countsByType = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const inventoryCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalElements += 1;
        if (item.category === "production") acc.productionElements += 1;
        if (item.category === "text") acc.textElements += 1;
        if (item.category === "unnamed") acc.unnamedElements += 1;
        return acc;
      },
      { totalElements: 0, productionElements: 0, textElements: 0, unnamedElements: 0 }
    );
  }, [items]);

  const semanticCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        if (item.detectedServiceKey && item.detectedHouseNumber != null) acc.withServiceAndHouse += 1;
        else if (item.detectedServiceKey) acc.withServiceWithoutHouse += 1;
        else acc.withoutService += 1;
        if (item.semanticNeedsReview) acc.referencesOrLots += 1;
        return acc;
      },
      { withServiceAndHouse: 0, withServiceWithoutHouse: 0, withoutService: 0, referencesOrLots: 0 }
    );
  }, [items]);

  const anchorCounts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        if (item.category === "text" && contains3dText(item.name)) acc.threeDTexts += 1;
        if (item.category === "text" && item.anchorHouseNumber != null) acc.numberedAnchors += 1;
        if (item.category === "production" && item.detectedServiceKey) acc.productionWithService += 1;
        if (item.houseDetectionSource === "3dtext_proximity") acc.productionWithHouseByAnchor += 1;
        if (item.category === "production" && item.reachableRefs.length > 0) acc.productionWithRefs += 1;
        if (item.category === "production" && item.refDiagnostics.cartesianPointCount > 0) acc.productionWithCartesianPoint += 1;
        if (item.category === "production" && item.refDiagnostics.hasLocalPlacement) acc.productionWithLocalPlacement += 1;
        if (item.category === "production" && item.refDiagnostics.hasAxis2Placement3D) acc.productionWithAxisPlacement += 1;
        if (item.category === "production" && item.refDiagnostics.hasProductDefinitionShape) acc.productionWithProductShape += 1;
        if (item.category === "production" && item.refDiagnostics.hasExtrudedAreaSolid) acc.productionWithExtrudedSolid += 1;
        if (item.category === "production" && item.position) acc.productionWithCoordinates += 1;
        if (item.category === "production" && item.placementPosition) acc.productionWithPlacementPosition += 1;
        if (item.category === "production" && item.placementPositionIgnored) acc.productionWithIgnoredGlobalPlacement += 1;
        if (item.category === "text" && item.position) acc.textsWithCoordinates += 1;
        return acc;
      },
      {
        threeDTexts: 0,
        numberedAnchors: 0,
        productionWithService: 0,
        productionWithHouseByAnchor: 0,
        productionWithRefs: 0,
        productionWithCartesianPoint: 0,
        productionWithLocalPlacement: 0,
        productionWithAxisPlacement: 0,
        productionWithProductShape: 0,
        productionWithExtrudedSolid: 0,
        productionWithCoordinates: 0,
        productionWithPlacementPosition: 0,
        productionWithIgnoredGlobalPlacement: 0,
        textsWithCoordinates: 0,
      }
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const base = filter === "all" ? items : items.filter(item => item.category === filter);
    const query = search.trim().toLowerCase();
    if (!query) return base;

    return base.filter(item => {
      const haystack = [
        item.id,
        item.type,
        item.globalId,
        item.name,
        item.primaryLayerName,
        item.layerNames.join(" "),
        item.detectedServiceLabel,
        item.detectedServiceKey,
        item.detectedHouseNumber != null ? String(item.detectedHouseNumber) : "",
        item.anchorHouseNumber != null ? String(item.anchorHouseNumber) : "",
        item.anchorElementName,
        item.houseDetectionSource,
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [filter, items, search]);

  const inspectedPersistedElement = useMemo(() => {
    return findIfcPersistedElementMatch(inspectSelection, persistedElements);
  }, [inspectSelection, persistedElements]);

  const finalLinkedElementIds = useMemo(() => {
    return new Set(ifc3dTestLinkedElements.map(element => element.ifc_element_id));
  }, [ifc3dTestLinkedElements]);

  const sameHouseElements = useMemo(() => {
    const houseNumber = inspectedPersistedElement?.detected_house_number;
    if (houseNumber == null) return [];
    return persistedElements.filter(element => element.detected_house_number === houseNumber);
  }, [inspectedPersistedElement, persistedElements]);

  const sameServiceElements = useMemo(() => {
    const serviceKey = inspectedPersistedElement?.detected_service_key;
    if (!serviceKey) return [];
    return persistedElements.filter(element => element.detected_service_key === serviceKey);
  }, [inspectedPersistedElement, persistedElements]);

  const handleSaveInspectedIfcLinkSuggestion = useCallback(async (
    element: IfcPersistedElementRow,
    houseNumber: number,
    serviceOptionId: string,
  ) => {
    if (!projectId) {
      toast.error("Projeto nao identificado para editar sugestao IFC");
      return;
    }
    if (!element?.id) {
      toast.error("Elemento IFC nao identificado para editar sugestao");
      return;
    }
    if (finalLinkedElementIds.has(element.id)) {
      toast.warning("Este elemento ja possui vinculo final. Use o painel Sugestoes IFC para revisar antes de alterar.");
      return;
    }

    const serviceOption = serviceOptions.find(option => option.id === serviceOptionId);
    if (!serviceOption || houseNumber == null) {
      toast.error("Selecione casa e servico para salvar a sugestao");
      return;
    }

    setIfcLinkEditSavingId(element.id);
    try {
      const now = new Date().toISOString();
      const rawProperties = {
        ...(element.raw_properties || {}),
        houseDetectionSource: "manual_review",
        serviceDetectionSource: "manual_review",
        manualHouseAssignment: true,
        manualServiceAssignment: true,
        manualLinkEditedAt: now,
        manualServiceMacroId: serviceOption.macro_id,
        manualServiceScopeId: serviceOption.scope_id,
        manualServiceLabel: serviceOption.label,
        previousDetectedHouseNumber: element.detected_house_number,
        previousDetectedServiceKey: element.detected_service_key,
        previousDetectedServiceLabel: element.detected_service_label,
      };
      const updatePayload = {
        detected_house_number: houseNumber,
        detected_service_key: serviceOption.scope_id,
        detected_service_label: serviceOption.label,
        category: "production",
        confidence: "manual",
        needs_review: true,
        status: "suggested",
        raw_properties: rawProperties,
      };

      const elementsTable = supabase.from("project_ifc_elements" as any) as any;
      const { error: updateError } = await elementsTable
        .update(updatePayload)
        .eq("id", element.id)
        .eq("project_id", projectId);

      if (updateError) throw updateError;

      setPersistedElements(prev => prev.map(row => (
        row.id === element.id
          ? {
              ...row,
              detected_house_number: houseNumber,
              detected_service_key: serviceOption.scope_id,
              detected_service_label: serviceOption.label,
              category: "production",
              confidence: "manual",
              needs_review: true,
              status: "suggested",
              raw_properties: rawProperties,
            }
          : row
      )));

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("obramap:ifc-elements-updated", {
          detail: {
            projectId,
            modelId: element.model_id,
            elementId: element.id,
          },
        }));
      }
      toast.success("Sugestao IFC salva. Proximo passo: confirmar e gerar vinculo final.");
    } catch (err) {
      console.error("[IFC Inspect] Falha ao salvar sugestao manual", err);
      toast.error("Falha ao salvar sugestao IFC");
    } finally {
      setIfcLinkEditSavingId(null);
    }
  }, [finalLinkedElementIds, projectId, serviceOptions]);

  const ifc3dTestElementsByControl = useMemo(() => {
    const map = new Map<Ifc3DTestControlKey, Ifc3DTestLinkedElementRow[]>();
    IFC_3D_TEST_CONTROLS.forEach(control => {
      map.set(control.key, ifc3dTestLinkedElements.filter(element => (
        element.status === "confirmed" &&
        element.house_number === control.houseNumber &&
        element.trigger_service_key === control.serviceKey &&
        !!element.ifc_entity_id
      )));
    });
    if (import.meta.env.DEV) {
      const countsByControl = IFC_3D_TEST_CONTROLS.reduce<Record<Ifc3DTestControlKey, number>>((acc, control) => {
        acc[control.key] = map.get(control.key)?.length || 0;
        return acc;
      }, {} as Record<Ifc3DTestControlKey, number>);
      const confirmedTotal = IFC_3D_TEST_CONTROLS.reduce((total, control) => total + (map.get(control.key)?.length || 0), 0);
      console.log("[IFC Test] controls diagnostics", {
        finalLinksCount: ifc3dTestLinkedElements.length,
        houses: Array.from(new Set(ifc3dTestLinkedElements.map(element => element.house_number))),
        services: Array.from(new Set(ifc3dTestLinkedElements.map(element => element.trigger_service_key))),
        countsByControl,
        confirmedTotal,
      });
    }
    return map;
  }, [ifc3dTestLinkedElements]);

  const ifc3dTestConfirmedTotal = useMemo(() => {
    return IFC_3D_TEST_CONTROLS.reduce((total, control) => total + (ifc3dTestElementsByControl.get(control.key)?.length || 0), 0);
  }, [ifc3dTestElementsByControl]);

  const activeIfc3dTestOverlays = useMemo<Ifc3DTestOverlay[]>(() => {
    if (!ifc3dTestEnabled) return [];
    return IFC_3D_TEST_CONTROLS.flatMap(control => {
      if (!ifc3dTestToggles[control.key]) return [];
      return (ifc3dTestElementsByControl.get(control.key) || []).flatMap(element => (
        element.ifc_entity_id
          ? [{
              key: control.key,
              label: control.label,
              entityId: element.ifc_entity_id,
            }]
          : []
      ));
    });
  }, [ifc3dTestElementsByControl, ifc3dTestEnabled, ifc3dTestToggles]);

  const activeIfcProductionOverlays = useMemo<IfcProductionOverlay[]>(() => {
    if (!ifcRealModeActive) return [];

    const elementById = new Map(persistedElements.map(element => [element.id, element]));
    const seenEntityIds = new Set<string>();
    const overlays: IfcProductionOverlay[] = [];
    const linkedElementIds = new Set(productionActivationDiagnostics.items.map(item => item.ifc_element_id).filter(Boolean));
    const contextCandidates: IfcPersistedElementRow[] = [];
    const productionCandidates: IfcPersistedElementRow[] = [];
    const contextSkipped: Array<{
      id: string;
      ifc_entity_id: string | null;
      ifc_global_id: string | null;
      category: string | null;
      detected_service_key: string | null;
      status: IfcPersistedStatus;
      layer: string | null;
      name: string | null;
      ifc_type: string | null;
      contextReason: string;
      skipReason: string;
    }> = [];

    persistedElements.forEach(element => {
      const contextReason = getIfcRealContextDiagnosticReason(element, linkedElementIds);
      const isContext = isIfcRealContextElement(element, linkedElementIds);
      if (isContext) contextCandidates.push(element);
      else productionCandidates.push(element);
      if (!isContext) return;
      const entityId = normalizeIfcEntityId(element.ifc_entity_id);
      if (!entityId || seenEntityIds.has(entityId)) {
        contextSkipped.push({
          id: element.id,
          ifc_entity_id: element.ifc_entity_id,
          ifc_global_id: element.ifc_global_id,
          category: element.category,
          detected_service_key: element.detected_service_key,
          status: element.status,
          layer: element.ifc_layer_name,
          name: element.name,
          ifc_type: element.ifc_type,
          contextReason,
          skipReason: !entityId ? "missing_or_invalid_ifc_entity_id" : "duplicate_entity_id",
        });
        return;
      }

      seenEntityIds.add(entityId);
      overlays.push({
        key: `context:${element.id}`,
        label: element.name || element.ifc_layer_name || element.ifc_type || "Contexto IFC",
        entityId,
        progressPercent: 100,
        role: "context",
      });
    });

    if (import.meta.env.DEV) {
      const contextRenderedIds = new Set(overlays.filter(item => item.role === "context").map(item => item.key.replace(/^context:/, "")));
      const relevantElements = persistedElements.filter(isIfcRealContextSearchHit);
      console.log("[IFC Real Context] candidates built", {
        totalPersistedElements: persistedElements.length,
        totalContextCandidates: contextCandidates.length,
        totalProductionCandidates: productionCandidates.length,
        totalContextRendered: overlays.filter(item => item.role === "context").length,
        totalProductionRendered: overlays.filter(item => item.role === "production").length,
        nonProductiveSample: persistedElements
          .filter(element => element.category !== "production")
          .slice(0, 12)
          .map(element => ({
            id: element.id,
            ifc_entity_id: element.ifc_entity_id,
            ifc_global_id: element.ifc_global_id,
            category: element.category,
            detected_service_key: element.detected_service_key,
            status: element.status,
            layer: element.ifc_layer_name,
            name: element.name,
            ifc_type: element.ifc_type,
            contextReason: getIfcRealContextDiagnosticReason(element, linkedElementIds),
            rendered: contextRenderedIds.has(element.id),
          })),
        relevantContextTerms: relevantElements.slice(0, 30).map(element => {
          const isContext = isIfcRealContextElement(element, linkedElementIds);
          return {
            id: element.id,
            ifc_entity_id: element.ifc_entity_id,
            ifc_global_id: element.ifc_global_id,
            category: element.category,
            classifiedAs: isContext ? "context" : "production",
            inContextCandidates: isContext,
            rendered: contextRenderedIds.has(element.id),
            detected_service_key: element.detected_service_key,
            status: element.status,
            layer: element.ifc_layer_name,
            name: element.name,
            ifc_type: element.ifc_type,
            contextReason: getIfcRealContextDiagnosticReason(element, linkedElementIds),
          };
        }),
        contextSkipped: contextSkipped.slice(0, 30),
      });
    }

    productionActivationDiagnostics.items.forEach(item => {
      if (!item.ifc_element_id) return;
      const element = elementById.get(item.ifc_element_id);
      const entityId = normalizeIfcEntityId(element?.ifc_entity_id);
      if (!entityId || seenEntityIds.has(entityId)) return;
      const progressPercent = Math.max(0, Math.min(100, Number(item.progress_percent ?? 0)));
      if (progressPercent <= 0) return;

      seenEntityIds.add(entityId);
      overlays.push({
        key: `production:${item.ifc_element_id}`,
        label: `Casa ${item.house_number ?? "-"} | ${item.trigger_service_label || item.trigger_service_key || "serviço IFC"}`,
        entityId,
        progressPercent,
        role: "production",
      });
    });

    if (import.meta.env.DEV) {
      console.log("[IFC Real Context] final overlay list", {
        totalPersistedElements: persistedElements.length,
        totalContextCandidates: contextCandidates.length,
        totalProductionCandidates: productionCandidates.length,
        totalContextRendered: overlays.filter(item => item.role === "context").length,
        totalProductionRendered: overlays.filter(item => item.role === "production").length,
      });
    }

    return overlays;
  }, [ifcRealModeActive, persistedElements, productionActivationDiagnostics.items]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const elementById = new Map(persistedElements.map(element => [element.id, element]));
    const linkedElementIds = new Set(productionActivationDiagnostics.items.map(item => item.ifc_element_id).filter(Boolean));
    const contextCandidates = persistedElements.filter(element => isIfcRealContextElement(element, linkedElementIds));
    const productionCandidates = persistedElements.filter(element => !isIfcRealContextElement(element, linkedElementIds));
    const evaluated = productionActivationDiagnostics.items.filter(item => !!item.ifc_element_id && !!normalizeIfcEntityId(elementById.get(item.ifc_element_id)?.ifc_entity_id));
    const visibleItems = evaluated.filter(item => (item.progress_percent ?? 0) > 0);
    const contextItems = activeIfcProductionOverlays.filter(item => item.role === "context");
    const productionItems = activeIfcProductionOverlays.filter(item => item.role === "production");
    const completeItems = visibleItems.filter(item => (item.progress_percent ?? 0) >= 100);
    const partialItems = visibleItems.filter(item => {
      const progress = item.progress_percent ?? 0;
      return progress > 0 && progress < 100;
    });
    console.log("[IFC Real Visual] diagnostics", {
      ifcRealModeActive,
      totalPersistedElements: persistedElements.length,
      totalContextCandidates: contextCandidates.length,
      totalProductionCandidates: productionCandidates.length,
      totalEvaluated: evaluated.length,
      totalVisible: visibleItems.length,
      totalHidden: Math.max(0, evaluated.length - visibleItems.length),
      totalContextKept: contextItems.length,
      totalProductionVisuals: productionItems.length,
      totalPartial: partialItems.length,
      totalComplete: completeItems.length,
      basePreserved: false,
      sample: activeIfcProductionOverlays.slice(0, 6).map(item => ({
        entityId: item.entityId,
        role: item.role,
        progressPercent: item.progressPercent,
        opacity: getIfcRealOpacity(item.progressPercent, item.role),
      })),
      contextSample: contextCandidates.slice(0, 6).map(element => ({
        id: element.id,
        category: element.category,
        layer: element.ifc_layer_name,
        name: element.name,
        type: element.ifc_type,
        service: element.detected_service_key,
      })),
    });
  }, [activeIfcProductionOverlays, ifcRealModeActive, persistedElements, productionActivationDiagnostics.items]);

  const handleToggleIfc3dTestMode = useCallback(() => {
    setIfc3dTestEnabled(prev => {
      const next = !prev;
      if (next) {
        setPaintModeEnabled(false);
        setInspectModeEnabled(false);
        setInspectSelection(null);
        setInspectGroupMode("none");
        setClearInspectSignal(value => value + 1);
        setIfc3dTestToggles(current => {
          const nextToggles = { ...current };
          IFC_3D_TEST_CONTROLS.forEach(control => {
            nextToggles[control.key] = (ifc3dTestElementsByControl.get(control.key)?.length || 0) > 0;
          });
          return nextToggles;
        });
      } else {
        setIfc3dTestToggles({
          "91-radier": false,
          "91-paredes": false,
          "92-radier": false,
          "92-paredes": false,
        });
      }
      return next;
    });
  }, [ifc3dTestElementsByControl]);

  const handleToggleIfc3dTestControl = useCallback((control: typeof IFC_3D_TEST_CONTROLS[number]) => {
    setIfc3dTestToggles(prev => {
      const next = { ...prev, [control.key]: !prev[control.key] };
      if (import.meta.env.DEV) {
        console.log("[IFC Test] toggle house/service", {
          key: control.key,
          houseNumber: control.houseNumber,
          serviceKey: control.serviceKey,
          enabled: next[control.key],
          entityIds: (ifc3dTestElementsByControl.get(control.key) || []).map(element => element.ifc_entity_id),
        });
      }
      return next;
    });
  }, [ifc3dTestElementsByControl]);

  const inspectGroupElements = inspectGroupMode === "house"
    ? sameHouseElements
    : inspectGroupMode === "service"
      ? sameServiceElements
      : [];

  useEffect(() => {
    if (!inspectSelection) return;
    if (inspectedPersistedElement) {
      console.info("[IFC Inspect] matched inventory element", {
        entityId: inspectedPersistedElement.ifc_entity_id,
        globalId: inspectedPersistedElement.ifc_global_id,
        houseNumber: inspectedPersistedElement.detected_house_number,
        serviceKey: inspectedPersistedElement.detected_service_key,
        status: inspectedPersistedElement.status,
      });
    } else {
      console.info("[IFC Inspect] no inventory match", {
        entityId: inspectSelection.entityId,
        globalId: inspectSelection.globalId,
        uuid: inspectSelection.uuid,
      });
    }
  }, [inspectSelection, inspectedPersistedElement]);

  useEffect(() => {
    if (inspectGroupMode === "house") {
      console.info("[IFC Inspect] same house elements count", { count: sameHouseElements.length });
    }
  }, [inspectGroupMode, sameHouseElements.length]);

  useEffect(() => {
    if (!ifc3dTestEnabled) return;
    if (import.meta.env.DEV) {
      console.log("[IFC Test] confirmed elements loaded", {
        total: ifc3dTestConfirmedTotal,
        controls: IFC_3D_TEST_CONTROLS.map(control => ({
          key: control.key,
          label: control.label,
          count: ifc3dTestElementsByControl.get(control.key)?.length || 0,
          entityIds: (ifc3dTestElementsByControl.get(control.key) || []).map(element => element.ifc_entity_id),
        })),
      });
    }
  }, [ifc3dTestConfirmedTotal, ifc3dTestElementsByControl, ifc3dTestEnabled]);

  useEffect(() => {
    if (!inspectSelection) {
      inspectPanelOpenLoggedRef.current = false;
      return;
    }
    if (inspectPanelOpenLoggedRef.current) return;

    inspectPanelOpenLoggedRef.current = true;
    console.info("[IFC UI] inspector panel opened");
  }, [inspectSelection]);

  useEffect(() => {
    if (autoMinimizedInventoryRef.current) return;
    if (visualStatus !== "ready" || saveStatus !== "saved") return;

    autoMinimizedInventoryRef.current = true;
    setMinimized(true);
    console.info("[IFC UI] inventory compact mode");
  }, [saveStatus, visualStatus]);

  const toggleRawLine = (id: string) => {
    setExpandedRawLines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const copyRawLine = async (rawLine: string) => {
    await copyText(rawLine);
  };

  const formatItemLine = (item: IfcInventoryItem) => {
    return [
      item.id,
      item.type,
      `GlobalId: ${item.globalId || "-"}`,
      `Camada: ${item.primaryLayerName || "-"}`,
      `Serviço: ${item.detectedServiceLabel || "-"}`,
      `Casa: ${item.detectedHouseNumber ?? "-"}`,
      `Origem da casa: ${item.houseDetectionSource}`,
      `Confiança: ${item.semanticConfidence}`,
    ].join(" | ");
  };

  const formatSummary = (list: IfcInventoryItem[]) => {
    return [
      "Inventário IFC",
      `Total: ${inventoryCounts.totalElements}`,
      `Produtivos: ${inventoryCounts.productionElements}`,
      `Textos/anotações: ${inventoryCounts.textElements}`,
      `Sem nome: ${inventoryCounts.unnamedElements}`,
      `Com serviço e casa: ${semanticCounts.withServiceAndHouse}`,
      `Com serviço sem casa: ${semanticCounts.withServiceWithoutHouse}`,
      `Sem serviço detectado: ${semanticCounts.withoutService}`,
      `Referência/lote: ${semanticCounts.referencesOrLots}`,
      `Textos 3D detectados: ${anchorCounts.threeDTexts}`,
      `Âncoras com número: ${anchorCounts.numberedAnchors}`,
      `Produtivos com serviço: ${anchorCounts.productionWithService}`,
      `Produtivos com casa por proximidade: ${anchorCounts.productionWithHouseByAnchor}`,
      `Produtivos com refs: ${anchorCounts.productionWithRefs}`,
      `Produtivos com placementPosition: ${anchorCounts.productionWithPlacementPosition}`,
      `Produtivos com placement global ignorado: ${anchorCounts.productionWithIgnoredGlobalPlacement}`,
      `Produtivos com IFCCARTESIANPOINT: ${anchorCounts.productionWithCartesianPoint}`,
      `Produtivos com IFCLOCALPLACEMENT: ${anchorCounts.productionWithLocalPlacement}`,
      `Produtivos com IFCAXIS2PLACEMENT3D: ${anchorCounts.productionWithAxisPlacement}`,
      `Produtivos com IFCPRODUCTDEFINITIONSHAPE: ${anchorCounts.productionWithProductShape}`,
      `Produtivos com IFCEXTRUDEDAREASOLID: ${anchorCounts.productionWithExtrudedSolid}`,
      "",
      ...list.map(formatItemLine),
    ].join("\n");
  };

  const ifcToolbarSlot =
    typeof document !== "undefined"
      ? document.getElementById("map3d-ifc-toolbar-slot")
      : null;
  const ifcPanelSlot =
    typeof document !== "undefined"
      ? document.getElementById("map3d-ifc-panel-slot")
      : null;

  return (
    <>
      <IFCVisualModel
        url={url}
        visible={showVisualIfc}
        paintEnabled={paintModeEnabled}
        inspectEnabled={inspectModeEnabled}
        selectedPaintTexture={selectedPaintTexture}
        undoPaintSignal={undoPaintSignal}
        clearPaintSignal={clearPaintSignal}
        clearInspectSignal={clearInspectSignal}
        testOverlays={activeIfc3dTestOverlays}
        productionOverlays={activeIfcProductionOverlays}
        productionRealModeActive={ifcRealModeActive}
        onInspectSelection={handleInspectSelection}
        onStatusChange={handleVisualStatusChange}
      />
      <Html fullscreen>
      {showVisualIfc && visualStatus === "ready" && ifcToolbarSlot && createPortal(
          <div
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-background/95 px-2 py-1.5 text-xs shadow-sm backdrop-blur"
            onWheel={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
              IFC
            </span>
            <button
              type="button"
              onClick={handleToggleInspectMode}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                inspectModeEnabled
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              Inspecionar
            </button>
            <button
              type="button"
              onClick={handleTogglePaintMode}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                paintModeEnabled
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              Pintar Textura
            </button>
            <button
              type="button"
              onClick={handleToggleFocusMode}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
              title="Esconde toda a UI do IFC sobre o canvas"
            >
              {focusModeEnabled ? "Mostrar UI" : "Tela limpa"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIfcPanelOpen(prev => !prev);
                if (focusModeEnabled) setFocusModeEnabled(false);
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                ifcPanelOpen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
              title="Painel lateral de inventário e diagnósticos IFC"
            >
              {ifcPanelOpen ? "Fechar painel" : "Inventário"}
            </button>
          </div>,
        ifcToolbarSlot,
      )}
      {false && !focusModeEnabled && (
      <div className="pointer-events-none absolute left-4 bottom-4 z-20 w-[min(340px,calc(100vw-2rem))]">
        <div
          className="pointer-events-auto flex max-h-[min(360px,calc(100vh-160px))] flex-col overflow-hidden overscroll-contain rounded-lg border border-border bg-background/95 shadow-xl"
          onWheel={(e) => e.stopPropagation()}
          onWheelCapture={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          style={minimized ? { height: "auto", maxHeight: "auto" } : undefined}
        >
          <div className="flex-shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">Inventário IFC</h3>
              <button
                type="button"
                onClick={() => setShowVisualIfc(prev => !prev)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
              >
                {showVisualIfc ? "Ocultar IFC visual" : "Mostrar IFC visual"}
              </button>
              <button
                type="button"
                onClick={() => setMinimized(prev => !prev)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
              >
                {minimized ? "Expandir" : "Minimizar"}
              </button>
            </div>
            {!minimized && (
              <p className="mt-1 text-xs text-muted-foreground">
                Renderização IFC 3D será ativada em etapa futura. Nesta etapa o arquivo foi lido para validar entidades e nomes.
              </p>
            )}
            {!minimized && (
              <p className={`mt-2 rounded-md px-2 py-1 text-xs ${
                visualStatus === "ready"
                  ? "bg-emerald-100 text-emerald-800"
                  : visualStatus === "error"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-muted text-muted-foreground"
              }`}>
                {showVisualIfc
                  ? visualStatus === "ready"
                    ? "IFC visual carregado para inspecao."
                    : visualStatus === "error"
                      ? `IFC visual indisponivel: ${visualMessage || "erro ao carregar"}. Inventario textual mantido.`
                      : "Carregando IFC visual..."
                  : "IFC visual oculto. Inventario textual mantido."}
              </p>
            )}
            {false && !minimized && showVisualIfc && visualStatus === "ready" && (
              <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleInspectMode}
                    className={`rounded border px-2 py-1 text-[11px] font-medium ${
                      inspectModeEnabled
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    Inspecionar IFC
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePaintMode}
                    className={`rounded border px-2 py-1 text-[11px] font-medium ${
                      paintModeEnabled
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    Pintar Textura
                  </button>
                  <select
                    value={selectedPaintTexture}
                    onChange={(event) => handleSelectPaintTexture(event.target.value as IfcVisualTextureKind)}
                    className="rounded border border-border bg-background px-2 py-1 text-[11px]"
                    disabled={!paintModeEnabled}
                  >
                    {IFC_PAINT_TEXTURE_OPTIONS.map(option => (
                      <option key={option.kind} value={option.kind}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setUndoPaintSignal(value => value + 1)}
                    className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    Desfazer última pintura
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearPaintSignal(value => value + 1)}
                    className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    Limpar pinturas locais
                  </button>
                </div>
                {paintModeEnabled && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Escolha uma textura e clique em um elemento IFC para aplicar localmente. Esta pintura nao e salva no banco.
                  </p>
                )}
                {inspectModeEnabled && (
                  <p className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Modo inspeção ativo - clique em um elemento
                  </p>
                )}
              </div>
            )}
            {saveMessage && (
              <p className={`mt-2 rounded-md px-2 py-1 text-xs break-words ${
                saveStatus === "saved"
                  ? "bg-emerald-100 text-emerald-800"
                  : saveStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}>
                {saveMessage}
              </p>
            )}
            {persistDiagnostics && (saveStatus === "error" || persistDiagnostics.nonFatal) && (
              <div className={`mt-2 rounded-md border p-2 text-xs ${
                persistDiagnostics.nonFatal
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-destructive/30 bg-destructive/5"
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-medium ${persistDiagnostics.nonFatal ? "text-amber-900" : "text-destructive"}`}>
                    {persistDiagnostics.nonFatal ? "Diagnóstico técnico não fatal" : "Diagnóstico técnico do salvamento"}
                  </p>
                  <CopyButton onClick={() => copyText(JSON.stringify(persistDiagnostics, null, 2))}>Copiar diagnóstico</CopyButton>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                  <DiagnosticItem label="authUserId" value={persistDiagnostics.authUserId} />
                  <DiagnosticItem label="authUserEmail" value={persistDiagnostics.authUserEmail} />
                  <DiagnosticItem label="projectId" value={persistDiagnostics.projectId} />
                  <DiagnosticItem label="companyId recebido" value={persistDiagnostics.companyId} />
                  <DiagnosticItem label="profile.company_id" value={persistDiagnostics.profileCompanyId} />
                  <DiagnosticItem label="project.company_id" value={persistDiagnostics.projectCompanyId} />
                  <DiagnosticItem label="companyMatches" value={persistDiagnostics.companyMatches == null ? null : String(persistDiagnostics.companyMatches)} />
                  <DiagnosticItem label="effectiveCompanyId" value={persistDiagnostics.effectiveCompanyId} />
                  <DiagnosticItem label="payload.company_id" value={persistDiagnostics.modelPayloadCompanyId} />
                  <DiagnosticItem label="payload.project_id" value={persistDiagnostics.modelPayloadProjectId} />
                  <DiagnosticItem label="stage" value={persistDiagnostics.stage} />
                  <DiagnosticItem label="error code" value={persistDiagnostics.errorCode} />
                  <DiagnosticItem label="error message" value={persistDiagnostics.errorMessage} />
                  <DiagnosticItem label="error details" value={persistDiagnostics.errorDetails} />
                  <DiagnosticItem label="error hint" value={persistDiagnostics.errorHint} />
                  <DiagnosticItem label="não fatal" value={String(persistDiagnostics.nonFatal)} />
                </dl>
              </div>
            )}
          </div>

          {minimized ? null : error ? (
            <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-2 gap-2 p-3 text-sm md:grid-cols-4">
                <InventoryMetric label="Elementos detectados" value={inventoryCounts.totalElements} />
                <InventoryMetric label="Produtivos" value={inventoryCounts.productionElements} />
                <InventoryMetric label="Textos/anotações" value={inventoryCounts.textElements} />
                <InventoryMetric label="Sem nome" value={inventoryCounts.unnamedElements} />
                <InventoryMetric label="Tipos detectados" value={Object.keys(countsByType).length} />
                <InventoryMetric label="Com serviço e casa" value={semanticCounts.withServiceAndHouse} />
                <InventoryMetric label="Com serviço sem casa" value={semanticCounts.withServiceWithoutHouse} />
                <InventoryMetric label="Sem serviço detectado" value={semanticCounts.withoutService} />
                <InventoryMetric label="Referência/lote" value={semanticCounts.referencesOrLots} />
                <InventoryMetric label="Textos 3D" value={anchorCounts.threeDTexts} />
                <InventoryMetric label="Âncoras numeradas" value={anchorCounts.numberedAnchors} />
                <InventoryMetric label="Produtivos com placementPosition" value={anchorCounts.productionWithPlacementPosition} />
                <InventoryMetric label="Placement global ignorado" value={anchorCounts.productionWithIgnoredGlobalPlacement} />
                <InventoryMetric label="Produtivos com coordenadas" value={anchorCounts.productionWithCoordinates} />
                <InventoryMetric label="Textos com coordenadas" value={anchorCounts.textsWithCoordinates} />
                <InventoryMetric label="Casa por proximidade" value={anchorCounts.productionWithHouseByAnchor} />
                <InventoryMetric label="Produtivos com refs" value={anchorCounts.productionWithRefs} />
                <InventoryMetric label="Com IFCCARTESIANPOINT" value={anchorCounts.productionWithCartesianPoint} />
                <InventoryMetric label="Com IFCLOCALPLACEMENT" value={anchorCounts.productionWithLocalPlacement} />
                <InventoryMetric label="Com IFCAXIS2PLACEMENT3D" value={anchorCounts.productionWithAxisPlacement} />
                <InventoryMetric label="Com IFCPRODUCTDEFINITIONSHAPE" value={anchorCounts.productionWithProductShape} />
                <InventoryMetric label="Com IFCEXTRUDEDAREASOLID" value={anchorCounts.productionWithExtrudedSolid} />
              </div>
              {anchorCounts.numberedAnchors > 0 && anchorCounts.productionWithHouseByAnchor === 0 && (
                <p className="mx-3 mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Textos 3D numerados foram detectados, mas ainda não há coordenadas suficientes para associar elementos produtivos por proximidade.
                </p>
              )}

              {items.length === 0 ? (
                <div className="mx-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Nenhuma entidade IFC compatível detectada.
                </div>
              ) : (
                <>
                  <div className="space-y-2 border-y border-border bg-muted/20 px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(countsByType).map(([type, count]) => (
                        <span key={type} className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                          {type}: {count}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row">
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar por GlobalId, nome, camada, serviço, casa ou tipo..."
                        className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs outline-none ring-offset-background focus:ring-2 focus:ring-ring"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <CopyButton onClick={() => copyText(formatSummary(items))}>Copiar resumo</CopyButton>
                        <CopyButton onClick={() => copyText(formatSummary(filteredItems))}>Copiar elementos filtrados</CopyButton>
                        <CopyButton onClick={() => copyText(formatSummary(items.filter(item => item.category === "production")))}>Copiar produtivos</CopyButton>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ["all", "Todos"],
                        ["production", "Produtivos"],
                        ["text", "Textos/anotações"],
                        ["unnamed", "Sem nome"],
                      ] as Array<[IfcInventoryFilter, string]>).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setFilter(value)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            filter === value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] text-muted-foreground">{filteredItems.length} elemento(s)</span>
                    </div>
                  </div>

                  <div className="p-3">
                    <div className="space-y-2">
                      {filteredItems.map(item => (
                        <IfcItemCard
                          key={item.id}
                          item={item}
                          filter={filter}
                          expanded={expandedRawLines.has(item.id)}
                          onToggleRaw={() => toggleRawLine(item.id)}
                          onCopyRaw={() => copyRawLine(item.rawLine)}
                          onCopyGlobalId={() => copyText(item.globalId)}
                        />
                      ))}
                    </div>
                    {filteredItems.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Nenhum elemento nesta categoria.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}
      {showVisualIfc && visualStatus === "ready" && ifcPanelOpen && !focusModeEnabled && ifcPanelSlot && createPortal(
        <div
          className="pointer-events-auto absolute bottom-0 right-0 top-0 z-40 flex max-h-full w-[min(420px,calc(100vw-1rem))] flex-col overflow-hidden border-l border-border bg-background/95 text-xs shadow-2xl backdrop-blur max-md:left-2 max-md:right-2 max-md:top-auto max-md:bottom-2 max-md:h-[48vh] max-md:w-auto max-md:rounded-lg max-md:border"
          onWheel={(e) => e.stopPropagation()}
          onWheelCapture={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-semibold">IFC</p>
              <p className="text-[10px] text-muted-foreground">
                {visualStatus === "ready" ? "Visual carregado" : visualStatus}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={handleToggleFocusMode} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">
                Tela limpa
              </button>
              <button type="button" onClick={() => setIfcPanelOpen(false)} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">
                Fechar painel
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <div className="rounded-md border border-border bg-muted/20 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleInspectMode}
                  className={`rounded border px-2.5 py-1 text-[11px] font-medium ${
                    inspectModeEnabled
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  Inspecionar IFC
                </button>
                <button
                  type="button"
                  onClick={handleTogglePaintMode}
                  className={`rounded border px-2.5 py-1 text-[11px] font-medium ${
                    paintModeEnabled
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  Pintar Textura
                </button>
                <select
                  value={selectedPaintTexture}
                  onChange={(event) => handleSelectPaintTexture(event.target.value as IfcVisualTextureKind)}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-[11px]"
                  disabled={!paintModeEnabled}
                >
                  {IFC_PAINT_TEXTURE_OPTIONS.map(option => (
                    <option key={option.kind} value={option.kind}>{option.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setUndoPaintSignal(value => value + 1)} className="rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
                  Desfazer
                </button>
                <button type="button" onClick={() => setClearPaintSignal(value => value + 1)} className="rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
                  Limpar pinturas
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">Teste 3D Real IFC</p>
                  <p className="text-[10px] text-amber-800">
                    Usa somente elementos confirmed das casas 91/92 para teste visual local.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleIfc3dTestMode}
                  disabled={ifc3dTestConfirmedTotal === 0}
                  className={`rounded border px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                    ifc3dTestEnabled
                      ? "border-amber-700 bg-amber-600 text-white"
                      : "border-amber-400 bg-background hover:bg-amber-100"
                  }`}
                >
                  {ifc3dTestEnabled ? "Desligar teste" : "Teste 3D Real IFC"}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-amber-800">
                Confirmados encontrados: {ifc3dTestConfirmedTotal}. ON cria overlay forte; OFF remove apenas o overlay.
              </p>
              {ifc3dTestEnabled && (
                <div className="mt-2 grid gap-1.5">
                  {IFC_3D_TEST_CONTROLS.map(control => {
                    const count = ifc3dTestElementsByControl.get(control.key)?.length || 0;
                    const enabled = ifc3dTestToggles[control.key];
                    return (
                      <button
                        key={control.key}
                        type="button"
                        onClick={() => handleToggleIfc3dTestControl(control)}
                        disabled={count === 0}
                        className={`flex items-center justify-between rounded border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 ${
                          enabled
                            ? "border-emerald-600 bg-emerald-100 text-emerald-900"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        <span>{control.label}</span>
                        <span className="font-semibold">{enabled ? "ON" : "OFF"} · {count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <InventoryMetric label="Elementos" value={inventoryCounts.totalElements} />
              <InventoryMetric label="Produtivos" value={inventoryCounts.productionElements} />
              <InventoryMetric label="Com casa/serviço" value={semanticCounts.withServiceAndHouse} />
              <InventoryMetric label="Sem casa" value={semanticCounts.withServiceWithoutHouse} />
            </div>
            {saveMessage && (
              <p className={`mt-3 rounded-md px-2 py-1 text-xs break-words ${
                saveStatus === "saved"
                  ? "bg-emerald-100 text-emerald-800"
                  : saveStatus === "error"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
              }`}>
                {saveMessage}
              </p>
            )}

            {inspectSelection ? (
              <IfcInspectPanelEmbedded
                selection={inspectSelection}
                element={inspectedPersistedElement}
                groupMode={inspectGroupMode}
                groupElements={inspectGroupElements}
                sameHouseCount={sameHouseElements.length}
                sameServiceCount={sameServiceElements.length}
                houseOptions={houseOptions}
                serviceOptions={serviceOptions}
                hasFinalLink={!!inspectedPersistedElement && finalLinkedElementIds.has(inspectedPersistedElement.id)}
                savingLinkEdit={!!inspectedPersistedElement && ifcLinkEditSavingId === inspectedPersistedElement.id}
                onShowHouse={() => setInspectGroupMode("house")}
                onShowService={() => setInspectGroupMode("service")}
                onSaveLinkSuggestion={handleSaveInspectedIfcLinkSuggestion}
                onClear={handleClearInspectSelection}
              />
            ) : (
              <p className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Clique em um elemento IFC para inspecionar Casa, Serviço e status.
              </p>
            )}
          </div>
        </div>,
        ifcPanelSlot,
      )}
      {false && showVisualIfc && visualStatus === "ready" && inspectSelection && (
        <IfcInspectPanelCompact
          selection={inspectSelection}
          element={inspectedPersistedElement}
          collapsed={inspectPanelCollapsed}
          groupMode={inspectGroupMode}
          groupElements={inspectGroupElements}
          sameHouseCount={sameHouseElements.length}
          sameServiceCount={sameServiceElements.length}
          onToggleCollapsed={() => setInspectPanelCollapsed(prev => !prev)}
          onShowHouse={() => setInspectGroupMode("house")}
          onShowService={() => setInspectGroupMode("service")}
          onClear={handleClearInspectSelection}
        />
      )}
      {showVisualIfc && visualStatus === "ready" && inspectModeEnabled && !inspectSelection && (
        <div className="pointer-events-none absolute right-4 bottom-4 z-30 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] font-medium text-primary shadow-lg">
          Inspeção IFC ativa
        </div>
      )}
      </Html>
    </>
  );
}

function IfcInspectPanelEmbedded({
  selection,
  element,
  groupMode,
  groupElements,
  sameHouseCount,
  sameServiceCount,
  houseOptions,
  serviceOptions,
  hasFinalLink,
  savingLinkEdit,
  onShowHouse,
  onShowService,
  onSaveLinkSuggestion,
  onClear,
}: {
  selection: IfcVisualInspectSelection;
  element: IfcPersistedElementRow | null;
  groupMode: IfcInspectGroupMode;
  groupElements: IfcPersistedElementRow[];
  sameHouseCount: number;
  sameServiceCount: number;
  houseOptions: number[];
  serviceOptions: IfcServiceOption[];
  hasFinalLink: boolean;
  savingLinkEdit: boolean;
  onShowHouse: () => void;
  onShowService: () => void;
  onSaveLinkSuggestion: (element: IfcPersistedElementRow, houseNumber: number, serviceOptionId: string) => Promise<void>;
  onClear: () => void;
}) {
  const houseSource = getPersistedHouseDetectionSource(element);
  const [editingLink, setEditingLink] = useState(false);
  const [editHouseValue, setEditHouseValue] = useState("");
  const [editServiceValue, setEditServiceValue] = useState("");
  const groupTitle = groupMode === "house"
    ? "Elementos da mesma casa"
    : groupMode === "service"
      ? "Elementos do mesmo serviço"
      : null;
  const matchedCurrentService = useMemo(() => {
    if (!element) return null;
    return serviceOptions.find(option => (
      option.scope_id === element.detected_service_key ||
      option.id === element.detected_service_key ||
      option.label === element.detected_service_label
    )) || null;
  }, [element, serviceOptions]);
  const canSaveLinkEdit = !!element && !hasFinalLink && !!editHouseValue && !!editServiceValue && !savingLinkEdit;

  useEffect(() => {
    setEditingLink(false);
    setEditHouseValue(element?.detected_house_number == null ? "" : String(element.detected_house_number));
    setEditServiceValue(matchedCurrentService?.id || "");
  }, [element?.id, element?.detected_house_number, matchedCurrentService?.id]);

  return (
    <div className="mt-3 rounded-md border border-primary/30 bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Elemento IFC selecionado</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{selection.entityId || "Elemento individual não identificado"}</p>
        </div>
        <button type="button" onClick={onClear} className="shrink-0 rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">
          Limpar
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <InspectPrimaryField label="Entity ID" value={selection.entityId || "-"} />
        <InspectPrimaryField label="Casa" value={element?.detected_house_number == null ? "-" : String(element.detected_house_number)} />
        <InspectPrimaryField label="Serviço" value={element?.detected_service_label || element?.detected_service_key || "-"} />
        <InspectPrimaryField label="Status" value={element?.status || "-"} />
        <InspectPrimaryField label="Origem" value={element ? getPersistedHouseDetectionLabel(houseSource) : "-"} />
        <InspectPrimaryField label="Confidence" value={element?.confidence || "-"} />
      </div>

      {selection.identificationError && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {selection.identificationError}
        </p>
      )}

      {element ? (
        <div className="mt-3 rounded-md bg-muted/40 p-2">
          <p className="mb-1 text-xs font-semibold">Sugestão encontrada</p>
          <div className="grid grid-cols-2 gap-2">
            <InspectPrimaryField label="Casa atribuída" value={element.detected_house_number == null ? "-" : String(element.detected_house_number)} />
            <InspectPrimaryField label="Serviço detectado" value={element.detected_service_label || element.detected_service_key || "-"} />
            <InspectPrimaryField label="Needs review" value={element.needs_review == null ? "-" : String(element.needs_review)} />
            <InspectPrimaryField label="Categoria" value={element.category || "-"} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={onShowHouse} disabled={element.detected_house_number == null} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
              Mesma casa ({sameHouseCount})
            </button>
            <button type="button" onClick={onShowService} disabled={!element.detected_service_key} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
              Mesmo serviço ({sameServiceCount})
            </button>
            <button type="button" onClick={() => setEditingLink(prev => !prev)} disabled={hasFinalLink} className="rounded border border-primary/40 bg-background px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50">
              {editingLink ? "Fechar edição" : "Editar vínculo"}
            </button>
          </div>
          {hasFinalLink && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
              Este elemento já possui vínculo final. Alterar a sugestão não altera o vínculo final existente; revise pelo painel Sugestões IFC.
            </p>
          )}
          {editingLink && !hasFinalLink && (
            <div className="mt-3 rounded-md border border-border bg-background p-2">
              <p className="text-xs font-semibold">Editar vínculo como sugestão</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Salva somente a sugestão deste elemento. Depois confirme e gere o vínculo final.
              </p>
              <div className="mt-2 grid gap-2">
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  Casa
                  <select
                    value={editHouseValue}
                    onChange={event => setEditHouseValue(event.target.value)}
                    className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground"
                  >
                    <option value="">Selecionar casa...</option>
                    {houseOptions.map(houseNumber => (
                      <option key={houseNumber} value={houseNumber}>Casa {houseNumber}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                  Serviço
                  <select
                    value={editServiceValue}
                    onChange={event => setEditServiceValue(event.target.value)}
                    className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground"
                  >
                    <option value="">Selecionar serviço...</option>
                    {serviceOptions.map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!canSaveLinkEdit}
                  onClick={() => {
                    const houseNumber = Number(editHouseValue);
                    if (!element || !Number.isFinite(houseNumber)) return;
                    void onSaveLinkSuggestion(element, houseNumber, editServiceValue).then(() => {
                      setEditingLink(false);
                    });
                  }}
                  className="rounded border border-primary bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingLinkEdit ? "Salvando..." : "Salvar como sugestão"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          Elemento visual identificado, mas sem correspondência no inventário IFC.
        </p>
      )}

      <details className="mt-3 rounded-md border border-border bg-muted/20 p-2">
        <summary className="cursor-pointer text-xs font-semibold">Detalhes técnicos</summary>
        <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
          <DiagnosticItem label="GlobalId visual" value={selection.globalId} />
          <DiagnosticItem label="Object name" value={selection.objectName || "(sem nome)"} />
          <DiagnosticItem label="UUID" value={selection.uuid} />
          <DiagnosticItem label="Parent" value={selection.parentName || selection.parentUuid} />
          <DiagnosticItem label="Face index" value={selection.faceIndex == null ? null : String(selection.faceIndex)} />
          <DiagnosticItem label="Geometry attrs" value={selection.geometryAttributes.length > 0 ? selection.geometryAttributes.join(", ") : null} />
          <DiagnosticItem label="Centro" value={formatIfcPoint(selection.center)} />
          <DiagnosticItem label="Tamanho" value={formatIfcPoint(selection.size)} />
        </div>
      </details>

      {groupTitle && (
        <div className="mt-3 rounded-md border border-border bg-muted/20 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-medium">{groupTitle}</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {groupElements.length} elemento(s)
            </span>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {groupElements.slice(0, 40).map(item => (
              <div key={item.id} className="rounded bg-background px-2 py-1">
                <p className="truncate font-mono text-[10px]">{item.ifc_entity_id || "-"} | {item.ifc_global_id || "-"}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Casa {item.detected_house_number ?? "-"} | {item.detected_service_label || item.detected_service_key || "-"} | {item.status}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IfcInspectPanelCompact({
  selection,
  element,
  collapsed,
  groupMode,
  groupElements,
  sameHouseCount,
  sameServiceCount,
  onToggleCollapsed,
  onShowHouse,
  onShowService,
  onClear,
}: {
  selection: IfcVisualInspectSelection;
  element: IfcPersistedElementRow | null;
  collapsed: boolean;
  groupMode: IfcInspectGroupMode;
  groupElements: IfcPersistedElementRow[];
  sameHouseCount: number;
  sameServiceCount: number;
  onToggleCollapsed: () => void;
  onShowHouse: () => void;
  onShowService: () => void;
  onClear: () => void;
}) {
  const houseSource = getPersistedHouseDetectionSource(element);
  const groupTitle = groupMode === "house"
    ? "Elementos da mesma casa"
    : groupMode === "service"
      ? "Elementos do mesmo serviço"
      : null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="pointer-events-auto absolute bottom-4 right-4 z-30 max-w-[min(360px,calc(100vw-2rem))] rounded-lg border border-primary/30 bg-background/95 px-3 py-2 text-left text-[11px] shadow-2xl backdrop-blur"
      >
        <span className="block text-xs font-semibold">{selection.entityId || "Elemento IFC"}</span>
        <span className="block truncate text-muted-foreground">
          Casa {element?.detected_house_number ?? "-"} | {element?.detected_service_label || element?.detected_service_key || "-"}
        </span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-30 flex max-h-[45vh] flex-col overflow-hidden rounded-lg border border-primary/30 bg-background/95 text-[11px] shadow-2xl backdrop-blur md:left-auto md:right-4 md:top-16 md:bottom-4 md:w-[390px] md:max-h-none">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Elemento selecionado</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{selection.entityId || "Elemento individual não identificado"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onToggleCollapsed} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">
            Recolher
          </button>
          <button type="button" onClick={onClear} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">
            Limpar
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <InspectPrimaryField label="Entity ID" value={selection.entityId || "-"} />
          <InspectPrimaryField label="Casa" value={element?.detected_house_number == null ? "-" : String(element.detected_house_number)} />
          <InspectPrimaryField label="Serviço" value={element?.detected_service_label || element?.detected_service_key || "-"} />
          <InspectPrimaryField label="Status" value={element?.status || "-"} />
          <InspectPrimaryField label="Origem" value={element ? getPersistedHouseDetectionLabel(houseSource) : "-"} />
          <InspectPrimaryField label="Confidence" value={element?.confidence || "-"} />
        </div>

        {selection.identificationError && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            {selection.identificationError}
          </p>
        )}

        {element ? (
          <div className="mt-3 rounded-md bg-muted/40 p-2">
            <p className="mb-1 text-xs font-semibold">Sugestão encontrada</p>
            <div className="grid grid-cols-2 gap-2">
              <InspectPrimaryField label="Casa atribuída" value={element.detected_house_number == null ? "-" : String(element.detected_house_number)} />
              <InspectPrimaryField label="Serviço detectado" value={element.detected_service_label || element.detected_service_key || "-"} />
              <InspectPrimaryField label="Needs review" value={element.needs_review == null ? "-" : String(element.needs_review)} />
              <InspectPrimaryField label="Categoria" value={element.category || "-"} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onShowHouse}
                disabled={element.detected_house_number == null}
                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mesma casa ({sameHouseCount})
              </button>
              <button
                type="button"
                onClick={onShowService}
                disabled={!element.detected_service_key}
                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mesmo serviço ({sameServiceCount})
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            Elemento visual identificado, mas sem correspondência no inventário IFC.
          </p>
        )}

        <details className="mt-3 rounded-md border border-border bg-muted/20 p-2">
          <summary className="cursor-pointer text-xs font-semibold">Detalhes técnicos</summary>
          <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            <DiagnosticItem label="GlobalId visual" value={selection.globalId} />
            <DiagnosticItem label="Object name" value={selection.objectName || "(sem nome)"} />
            <DiagnosticItem label="UUID" value={selection.uuid} />
            <DiagnosticItem label="Parent" value={selection.parentName || selection.parentUuid} />
            <DiagnosticItem label="Face index" value={selection.faceIndex == null ? null : String(selection.faceIndex)} />
            <DiagnosticItem label="Geometry attrs" value={selection.geometryAttributes.length > 0 ? selection.geometryAttributes.join(", ") : null} />
            <DiagnosticItem label="Centro" value={formatIfcPoint(selection.center)} />
            <DiagnosticItem label="Tamanho" value={formatIfcPoint(selection.size)} />
            <DiagnosticItem label="Hit root/group" value={String(selection.hitRootOrGroup)} />
            {element && (
              <>
                <DiagnosticItem label="Entity ID salvo" value={element.ifc_entity_id} />
                <DiagnosticItem label="GlobalId salvo" value={element.ifc_global_id} />
                <DiagnosticItem label="Camada" value={element.ifc_layer_name} />
                <DiagnosticItem label="Nome" value={element.name} />
              </>
            )}
          </div>
        </details>

        {groupTitle && (
          <div className="mt-3 rounded-md border border-border bg-muted/20 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-medium">{groupTitle}</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {groupElements.length} elemento(s)
              </span>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {groupElements.slice(0, 40).map(item => (
                <div key={item.id} className="rounded bg-background px-2 py-1">
                  <p className="truncate font-mono text-[10px]">{item.ifc_entity_id || "-"} | {item.ifc_global_id || "-"}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    Casa {item.detected_house_number ?? "-"} | {item.detected_service_label || item.detected_service_key || "-"} | {item.status}
                  </p>
                </div>
              ))}
              {groupElements.length > 40 && (
                <p className="text-[10px] text-muted-foreground">Mostrando 40 de {groupElements.length} elementos.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InspectPrimaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-2 py-1.5">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold" title={value}>{value}</p>
    </div>
  );
}

function IfcInspectPanel({
  selection,
  element,
  groupMode,
  groupElements,
  sameHouseCount,
  sameServiceCount,
  onShowHouse,
  onShowService,
  onClear,
}: {
  selection: IfcVisualInspectSelection;
  element: IfcPersistedElementRow | null;
  groupMode: IfcInspectGroupMode;
  groupElements: IfcPersistedElementRow[];
  sameHouseCount: number;
  sameServiceCount: number;
  onShowHouse: () => void;
  onShowService: () => void;
  onClear: () => void;
}) {
  const houseSource = getPersistedHouseDetectionSource(element);
  const groupTitle = groupMode === "house"
    ? "Elementos da mesma casa"
    : groupMode === "service"
      ? "Elementos do mesmo serviço"
      : null;

  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-background p-2 text-[11px] shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Elemento IFC selecionado</p>
        <button type="button" onClick={onClear} className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-medium hover:bg-muted">
          Limpar seleção
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        <DiagnosticItem label="Entity ID" value={selection.entityId} />
        <DiagnosticItem label="GlobalId visual" value={selection.globalId} />
        <DiagnosticItem label="Objeto" value={selection.objectName || "(sem nome)"} />
        <DiagnosticItem label="UUID" value={selection.uuid} />
        <DiagnosticItem label="Parent" value={selection.parentName || selection.parentUuid} />
        <DiagnosticItem label="Face index" value={selection.faceIndex == null ? null : String(selection.faceIndex)} />
        <DiagnosticItem label="Atributos geometry" value={selection.geometryAttributes.length > 0 ? selection.geometryAttributes.join(", ") : null} />
        <DiagnosticItem label="Centro" value={formatIfcPoint(selection.center)} />
        <DiagnosticItem label="Tamanho" value={formatIfcPoint(selection.size)} />
        <DiagnosticItem label="Hit root/group" value={String(selection.hitRootOrGroup)} />
      </div>

      {selection.identificationError && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {selection.identificationError}
        </p>
      )}

      {element ? (
        <div className="mt-2 rounded-md bg-muted/40 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            <DiagnosticItem label="Entity ID salvo" value={element.ifc_entity_id} />
            <DiagnosticItem label="GlobalId salvo" value={element.ifc_global_id} />
            <DiagnosticItem label="Camada" value={element.ifc_layer_name} />
            <DiagnosticItem label="Nome" value={element.name} />
            <DiagnosticItem label="Serviço" value={element.detected_service_label || element.detected_service_key} />
            <DiagnosticItem label="Casa" value={element.detected_house_number == null ? null : String(element.detected_house_number)} />
            <DiagnosticItem label="Origem da casa" value={getPersistedHouseDetectionLabel(houseSource)} />
            <DiagnosticItem label="Status" value={element.status} />
            <DiagnosticItem label="Confidence" value={element.confidence} />
            <DiagnosticItem label="Needs review" value={element.needs_review == null ? null : String(element.needs_review)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onShowHouse}
              disabled={element.detected_house_number == null}
              className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ver elementos da mesma casa ({sameHouseCount})
            </button>
            <button
              type="button"
              onClick={onShowService}
              disabled={!element.detected_service_key}
              className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ver elementos do mesmo serviço ({sameServiceCount})
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          Sem correspondência no inventário salvo. O clique foi registrado, mas não houve match por Entity ID ou GlobalId.
        </p>
      )}

      {groupTitle && (
        <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="font-medium">{groupTitle}</p>
            <span className="text-muted-foreground">{groupElements.length} elemento(s)</span>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {groupElements.slice(0, 40).map(item => (
              <div key={item.id} className="rounded bg-background px-2 py-1">
                <p className="truncate font-mono text-[10px]">{item.ifc_entity_id || "-"} | {item.ifc_global_id || "-"}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  Casa {item.detected_house_number ?? "-"} | {item.detected_service_label || item.detected_service_key || "-"} | {item.status}
                </p>
              </div>
            ))}
            {groupElements.length > 40 && (
              <p className="text-[10px] text-muted-foreground">Mostrando 40 de {groupElements.length} elementos.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold leading-tight">{value}</p>
    </div>
  );
}

function DiagnosticItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[11px]" title={value || "-"}>
        {value || "-"}
      </dd>
    </div>
  );
}

function CopyButton({ children, onClick }: { children: string; onClick: () => Promise<void> }) {
  return (
    <button type="button" onClick={() => void onClick()} className="rounded border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted">
      {children}
    </button>
  );
}

function IfcItemCard({
  item,
  filter,
  expanded,
  onToggleRaw,
  onCopyRaw,
  onCopyGlobalId,
}: {
  item: IfcInventoryItem;
  filter: IfcInventoryFilter;
  expanded: boolean;
  onToggleRaw: () => void;
  onCopyRaw: () => Promise<void>;
  onCopyGlobalId: () => Promise<void>;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.primaryLayerName || item.name || item.type}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{item.id} | {item.type}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
          item.semanticConfidence === "high"
            ? "bg-emerald-100 text-emerald-800"
            : item.semanticConfidence === "medium"
              ? "bg-blue-100 text-blue-800"
              : "bg-slate-100 text-slate-700"
        }`}>
          {item.semanticConfidence}
        </span>
      </div>

      {item.category === "text" && (
        <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Texto / anotação - não vincular
        </span>
      )}
      {item.category === "unnamed" && (
        <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          Sem nome - revisar exportação
        </span>
      )}

      <p className="mt-1 truncate text-[11px]">
        <span className="text-muted-foreground">GlobalId: </span>
        {item.globalId || "-"}
        {item.globalId && (
          <button type="button" onClick={() => void onCopyGlobalId()} className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-muted">
            Copiar
          </button>
        )}
      </p>
      <p className="truncate text-[11px]"><span className="text-muted-foreground">Nome IFC: </span>{item.name || "-"}</p>
      <p className="truncate text-[11px]"><span className="text-muted-foreground">Camada IFC principal: </span>{item.primaryLayerName || "-"}</p>
      <p className="text-[11px]"><span className="text-muted-foreground">Todas as camadas encontradas: </span>{item.layerNames.length > 0 ? item.layerNames.join(", ") : "-"}</p>

      {item.category === "production" && (
        <div className="mt-1 grid gap-1 rounded bg-muted/40 px-2 py-1 text-[11px] md:grid-cols-3">
          <p className="truncate"><span className="text-muted-foreground">Serviço detectado: </span>{item.detectedServiceLabel || "-"}</p>
          <p><span className="text-muted-foreground">Casa detectada: </span>{item.detectedHouseNumber != null ? item.detectedHouseNumber : "-"}</p>
          <p><span className="text-muted-foreground">Confiança: </span>{item.semanticConfidence}</p>
          <p><span className="text-muted-foreground">Origem da casa: </span>{item.houseDetectionSource === "3dtext_proximity" ? "3Dtext próximo" : item.houseDetectionSource}</p>
          <p><span className="text-muted-foreground">Âncora: </span>{item.anchorElementName || "-"}</p>
          <p><span className="text-muted-foreground">Distância: </span>{item.anchorDistance != null ? item.anchorDistance.toFixed(2) : "-"}</p>
          <p><span className="text-muted-foreground">positionSource: </span>{item.positionSource}</p>
          <p><span className="text-muted-foreground">placement ignorado: </span>{item.placementPositionIgnored ? "sim" : "nÃ£o"}</p>
          <p><span className="text-muted-foreground">motivo: </span>{item.placementPositionIgnoreReason || "-"}</p>
          <p><span className="text-muted-foreground">sharedPlacementKey: </span>{item.sharedPlacementKey || "-"}</p>
          <p><span className="text-muted-foreground">placementPosition: </span>{item.placementPosition ? `${item.placementPosition.x.toFixed(2)}, ${item.placementPosition.y.toFixed(2)}, ${item.placementPosition.z.toFixed(2)}` : "-"}</p>
          <p><span className="text-muted-foreground">placement refs: </span>{[item.placementRefId, item.axisPlacementRefId, item.cartesianPointRefId].filter(Boolean).join(" -> ") || "-"}</p>
          <p><span className="text-muted-foreground">parse IFCCARTESIANPOINT: </span>{item.cartesianPointParseFailed ? "falhou" : item.parsedCartesianPoint ? "ok" : "-"}</p>
          <p className="md:col-span-3"><span className="text-muted-foreground">Linha IFCCARTESIANPOINT: </span>{item.cartesianPointLinePreview || "-"}</p>
          <p><span className="text-muted-foreground">IFCCARTESIANPOINT: </span>{item.refDiagnostics.cartesianPointCount}</p>
          <p><span className="text-muted-foreground">IFCLOCALPLACEMENT: </span>{item.refDiagnostics.hasLocalPlacement ? "sim" : "não"}</p>
          <p><span className="text-muted-foreground">IFCAXIS2PLACEMENT3D: </span>{item.refDiagnostics.hasAxis2Placement3D ? "sim" : "não"}</p>
          <p><span className="text-muted-foreground">IFCPRODUCTDEFINITIONSHAPE: </span>{item.refDiagnostics.hasProductDefinitionShape ? "sim" : "não"}</p>
          <p><span className="text-muted-foreground">IFCEXTRUDEDAREASOLID: </span>{item.refDiagnostics.hasExtrudedAreaSolid ? "sim" : "não"}</p>
          <p className="md:col-span-3"><span className="text-muted-foreground">Primeiros tipos alcançados: </span>{item.refDiagnostics.firstReachedTypes.join(", ") || "-"}</p>
          {item.semanticNeedsReview && (
            <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Revisar
            </span>
          )}
        </div>
      )}

      {item.category === "text" && (
        <div className="mt-1 grid gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] md:grid-cols-3">
          <p><span className="text-muted-foreground">Número da âncora: </span>{item.anchorHouseNumber != null ? item.anchorHouseNumber : "-"}</p>
          <p><span className="text-muted-foreground">Coordenada: </span>{item.position ? `${item.position.x.toFixed(2)}, ${item.position.y.toFixed(2)}, ${item.position.z.toFixed(2)}` : "-"}</p>
          <p><span className="text-muted-foreground">positionSource: </span>{item.positionSource}</p>
          <p><span className="text-muted-foreground">Pontos lidos: </span>{item.positionPointCount}</p>
          <p className="md:col-span-3"><span className="text-muted-foreground">Tipos alcançados: </span>{item.refDiagnostics.firstReachedTypes.join(", ") || "-"}</p>
        </div>
      )}

      {(filter === "all" || filter === "unnamed") && (
        <div className="mt-1 rounded bg-muted/40 px-2 py-1 text-[10px]">
          <p><span className="text-muted-foreground">Refs alcançadas: </span>{item.reachableRefs.length}</p>
          <p className="break-words font-mono text-muted-foreground">{item.reachableRefs.slice(0, 10).join(", ") || "-"}</p>
        </div>
      )}

      <div className="mt-1 text-[11px]">
        <span className="text-muted-foreground">Valores textuais encontrados: </span>
        {item.quotedValues.length > 0 ? (
          <span className="break-words">
            {item.quotedValues.map((value, index) => (
              <span key={`${item.id}-quoted-${index}`} className="mr-1">{index + 1}. {value || "-"}</span>
            ))}
          </span>
        ) : (
          <span>-</span>
        )}
      </div>

      {item.category === "unnamed" && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={onToggleRaw} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">Ver linha bruta</button>
            <button type="button" onClick={() => void onCopyRaw()} className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium hover:bg-muted">Copiar linha IFC</button>
          </div>
          {expanded && (
            <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[10px] leading-relaxed">
              {item.rawLine}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
