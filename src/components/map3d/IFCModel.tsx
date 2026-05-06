import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  url: string;
  projectId?: string | null;
  companyId?: string | null;
  onLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  onMeshClick?: (mesh: THREE.Object3D) => void;
  selectedMeshKey?: string | null;
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
type Project3DModelIdRow = { id: string };
type ProtectedIfcElementRow = { ifc_global_id: string | null; ifc_entity_id: string | null };
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

function asProtectedIfcElementRows(data: unknown): ProtectedIfcElementRow[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row): ProtectedIfcElementRow => ({
      ifc_global_id: normalizeNullableString(row.ifc_global_id),
      ifc_entity_id: normalizeNullableString(row.ifc_entity_id),
    }));
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

export function IFCModel({ url, projectId, companyId, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: Props) {
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
  const calledRef = useRef(false);
  const persistedKeyRef = useRef<string | null>(null);

  void onSceneReady;
  void onMeshClick;
  void selectedMeshKey;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setItems([]);
    setExpandedRawLines(new Set());
    setSaveStatus("idle");
    setSaveMessage(null);
    setPersistDiagnostics(null);
    calledRef.current = false;
    persistedKeyRef.current = null;

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

  return (
    <Html fullscreen>
      <div className="pointer-events-none absolute right-4 top-4 bottom-24 w-[min(760px,calc(100vw-2rem))]">
        <div
          className="pointer-events-auto flex h-full max-h-[calc(100vh-160px)] flex-col overflow-hidden overscroll-contain rounded-lg border border-border bg-background/95 shadow-2xl"
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
    </Html>
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
