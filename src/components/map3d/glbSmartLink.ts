import * as THREE from "three";
import {
  isContextProjectModelMesh,
  type ProjectModelMesh,
} from "@/hooks/useProjectModelMeshes";
import { parseHouseNumberFromMesh } from "./parseHouseFromMeshName";

export type GlbSmartLinkStatus = "applicable" | "missing_house" | "linked" | "context" | "ignored" | "self";

export interface GlbMeshRuntimeInfo {
  layerKey: string;
  meshName: string;
  materialName: string;
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  volume: number;
  saved: ProjectModelMesh | null;
}

export interface GlbSmartLinkCandidate extends GlbMeshRuntimeInfo {
  score: number;
  confidence: "alta" | "media" | "baixa";
  reasons: string[];
  status: GlbSmartLinkStatus;
  matchStrength: "strong" | "group" | "other";
  currentAssignedHouseNumber: number | null;
  suggestedHouseNumber: number | null;
  suggestionReason: string;
  suggestionConfidence: "alta" | "media" | "baixa" | "nenhuma";
  suggestionDistance?: number;
  suggestionHorizontalDistance?: number;
  suggestion3dDistance?: number;
  secondSuggestionDistance?: number;
  suggestionDistanceGap?: number;
  suggestionDistanceRatio?: number;
  acceptedDominantAnchor?: boolean;
  suggestionSource: "confirmed_link_anchor" | "linked_neighbor" | "text_anchor" | "main_model_text_anchor" | "house_position" | "none";
  suggestionIgnoredLinkedNeighbor?: boolean;
  suggestionAnchorLayerKey?: string;
  suggestionAnchorName?: string;
  suggestionAnchorCenter?: GlbMeshRuntimeInfo["center"];
  suggestionTopTextAnchors?: Array<{
    houseNumber: number;
    layerKey: string;
    meshName: string;
    source: HouseAnchor["source"];
    center: GlbMeshRuntimeInfo["center"];
    horizontalDistance: number;
    distance3d: number;
    weightedDistance: number;
  }>;
  suggestionTopConfirmedAnchors?: Array<{
    houseNumber: number;
    layerKey: string;
    meshName: string;
    center: GlbMeshRuntimeInfo["center"];
    horizontalDistance: number;
    distance3d: number;
    weightedDistance: number;
  }>;
  houseSuggestionRejectReason?: string;
  selectedByDefault: boolean;
}

const EPSILON = 0.0001;

function materialNameOf(mesh: THREE.Mesh) {
  const material = mesh.material;
  if (!material) return "";
  if (Array.isArray(material)) return material.map((item: any) => item?.name).filter(Boolean).join(", ");
  return (material as any).name || "";
}

function similarity(a: number, b: number) {
  return Math.max(0, 1 - Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), EPSILON));
}

function sortedDimensions(info: GlbMeshRuntimeInfo) {
  return [info.size.x, info.size.y, info.size.z].sort((a, b) => a - b);
}

function prefixOf(name: string) {
  return name.toLowerCase().replace(/\d+/g, "").replace(/[_\-.]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizedTokens(info: Pick<GlbMeshRuntimeInfo, "meshName" | "materialName">) {
  const normalized = `${info.meshName} ${info.materialName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return new Set(normalized.split(/\s+/).filter((token) => token.length >= 3));
}

function hasAnyToken(tokens: Set<string>, options: string[]) {
  return options.some((option) => tokens.has(option));
}

function horizontalGap(a: GlbMeshRuntimeInfo, b: GlbMeshRuntimeInfo) {
  const gapX = Math.max(0, Math.abs(a.center.x - b.center.x) - (a.size.x + b.size.x) / 2);
  const gapZ = Math.max(0, Math.abs(a.center.z - b.center.z) - (a.size.z + b.size.z) / 2);
  return Math.sqrt(gapX ** 2 + gapZ ** 2);
}

function horizontalCenterDistance(a: GlbMeshRuntimeInfo, b: GlbMeshRuntimeInfo) {
  return Math.sqrt((a.center.x - b.center.x) ** 2 + (a.center.z - b.center.z) ** 2);
}

function getLocalGroupMatch(
  base: GlbMeshRuntimeInfo,
  mesh: GlbMeshRuntimeInfo,
  baseTokens: Set<string>,
  baseHouseNumber: number | null,
  candidateHouseNumber: number | null,
) {
  if (base.layerKey === mesh.layerKey) return { grouped: false, bonus: 0, reasons: [] as string[] };
  const candidateTokens = normalizedTokens(mesh);
  const sharedUsefulToken = Array.from(baseTokens).some((token) => token.length >= 4 && candidateTokens.has(token));
  const groupGap = horizontalGap(base, mesh);
  const centerDistance = horizontalCenterDistance(base, mesh);
  const baseScale = Math.max(diagonal(base), 0.5);
  const candidateScale = Math.max(diagonal(mesh), 0.5);
  const closeByBox = groupGap <= Math.max(0.25, Math.min(2.5, Math.max(baseScale, candidateScale) * 0.22));
  const closeByCenter = centerDistance <= Math.max(0.6, Math.min(3.5, (baseScale + candidateScale) * 0.45));
  const houseCompatible = baseHouseNumber == null || candidateHouseNumber == null || baseHouseNumber === candidateHouseNumber;
  const openingTokens = ["esquadria", "janela", "porta", "vidro", "glass", "aluminio", "aluminum", "metal", "marco", "folha"];
  const utilityTokens = ["prumada", "caixa", "barrilete", "tubo", "tubulacao", "hidraulica", "shaft"];
  const hasComplementaryUse = (
    hasAnyToken(baseTokens, openingTokens) && hasAnyToken(candidateTokens, openingTokens)
  ) || (
    hasAnyToken(baseTokens, utilityTokens) && hasAnyToken(candidateTokens, utilityTokens)
  );
  const grouped = houseCompatible && (closeByBox || (closeByCenter && (sharedUsefulToken || hasComplementaryUse)));
  const reasons: string[] = [];
  if (grouped) {
    reasons.push("grupo proximo");
    if (hasComplementaryUse) reasons.push("mesh complementar");
    if (sharedUsefulToken) reasons.push("mesmo conjunto visual");
    if (baseHouseNumber != null && candidateHouseNumber === baseHouseNumber) reasons.push("mesma casa sugerida");
  }
  return {
    grouped,
    bonus: grouped ? (hasComplementaryUse || sharedUsefulToken ? 12 : 8) : 0,
    reasons,
  };
}

function confidenceFromScore(score: number): GlbSmartLinkCandidate["confidence"] {
  if (score >= 78) return "alta";
  if (score >= 62) return "media";
  return "baixa";
}

function distance(a: GlbMeshRuntimeInfo["center"], b: GlbMeshRuntimeInfo["center"]) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function anchorDistanceDetails(mesh: GlbMeshRuntimeInfo, anchor: HouseAnchor, source: HouseAnchor["source"]) {
  const dx = mesh.center.x - anchor.center.x;
  const dz = mesh.center.z - anchor.center.z;
  const dy = Math.abs(mesh.center.y - anchor.center.y);
  const horizontalDistance = Math.sqrt(dx ** 2 + dz ** 2);
  const distance3d = distance(mesh.center, anchor.center);
  if (source === "linked_neighbor") {
    return { horizontalDistance, distance3d, weightedDistance: distance3d };
  }
  // Textos de casa costumam estar na frente/divisa do lote; use X/Z como
  // criterio principal. Vinculos confirmados tambem sao referencia espacial
  // local de lote, entao o Y deve pesar pouco na decisao.
  return { horizontalDistance, distance3d, weightedDistance: horizontalDistance + dy * (isTextAnchorSource(source) ? 0.15 : 0.10) };
}

function validHouseOrNull(value: unknown, validHouseNumbers?: Set<number>) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 10000) return null;
  if (validHouseNumbers && !validHouseNumbers.has(parsed)) return null;
  return parsed;
}

function diagonal(info: GlbMeshRuntimeInfo) {
  return Math.sqrt(info.size.x ** 2 + info.size.y ** 2 + info.size.z ** 2);
}

function exactNumberTokens(text: string) {
  return Array.from(text.matchAll(/(^|[^a-z0-9])0*(\d{1,4})(?=[^a-z0-9]|$)/gi)).map((match) => match[2]);
}

function hasHouseTextMarker(text: string) {
  return /(^|[^a-z0-9])(3dtext|text|texto|label|number|numero|numeracao|casa|house)(?=[^a-z0-9]|$)/i.test(text);
}

function parseTextAnchorHouseNumber(mesh: GlbMeshRuntimeInfo, validHouseNumbers?: Set<number>) {
  const rawText = `${mesh.meshName} ${mesh.materialName}`;
  const hasTextMarker = hasHouseTextMarker(rawText);
  const dims = sortedDimensions(mesh);
  const isSmallFlatGeometry = dims[0] <= 0.25 && dims[2] <= 4.5 && mesh.volume <= 2.5;
  const exactNumber = [mesh.meshName, mesh.materialName]
    .map((value) => value.trim().match(/^(\d{1,4})$/)?.[1])
    .find(Boolean);
  if (exactNumber && (hasTextMarker || isSmallFlatGeometry)) {
    const valid = validHouseOrNull(exactNumber, validHouseNumbers);
    if (valid != null) return valid;
  }

  if (!hasTextMarker) return null;

  const sanitized = rawText
    .toLowerCase()
    .replace(/geom3d/gi, " ")
    .replace(/3dtext/gi, " ")
    .replace(/\b3d\b/gi, " ");
  const explicitTextNumber = rawText.match(/(?:^|[^a-z0-9])(?:3dtext|text|texto|label|numero|numeracao|number|casa|house)[_\-\s]*0*(\d{1,4})(?=[^a-z0-9]|$)/i);
  const matches = explicitTextNumber?.[1]
    ? [explicitTextNumber[1]]
    : exactNumberTokens(sanitized);

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const token = matches[index];
    const valid = validHouseOrNull(token, validHouseNumbers);
    if (valid != null) return valid;
  }
  return null;
}

export interface HouseAnchor {
  houseNumber: number;
  center: GlbMeshRuntimeInfo["center"];
  source: "confirmed_link_anchor" | "linked_neighbor" | "text_anchor" | "main_model_text_anchor";
  layerKey: string;
  meshName: string;
  materialName: string;
  serviceName?: string;
}

function isTextAnchorSource(source: HouseAnchor["source"]) {
  return source === "text_anchor" || source === "main_model_text_anchor";
}

function buildHouseAnchors(
  meshes: GlbMeshRuntimeInfo[],
  validHouseNumbers?: Set<number>,
  extraAnchors: HouseAnchor[] = [],
) {
  const isValidHouse = (houseNumber: number) => !validHouseNumbers || validHouseNumbers.has(houseNumber);
  const confirmedLinkAnchors: HouseAnchor[] = [];
  const linkedAnchors: HouseAnchor[] = [];
  const textAnchors: HouseAnchor[] = [];
  const mainModelTextAnchors: HouseAnchor[] = [];
  const rejectedNumericNames: Array<{ layerKey: string; meshName: string; materialName: string; reason: string }> = [];

  meshes.forEach((mesh) => {
    const saved = mesh.saved;
    const linkedHouse = saved?.assigned_house_number;
    const hasProductiveLink = !!saved
      && linkedHouse != null
      && saved.service_macro_id != null
      && saved.service_scope_id != null
      && !saved.ignored
      && !isContextProjectModelMesh(saved);
    if (hasProductiveLink && isValidHouse(Number(linkedHouse))) {
      const anchor = {
        houseNumber: Number(linkedHouse),
        center: mesh.center,
        source: "confirmed_link_anchor" as const,
        layerKey: mesh.layerKey,
        meshName: mesh.meshName,
        materialName: mesh.materialName,
        serviceName: [saved.service_macro_id, saved.service_scope_id].filter(Boolean).join(" > "),
      };
      confirmedLinkAnchors.push(anchor);
      linkedAnchors.push({ ...anchor, source: "linked_neighbor" });
    }

    const parsedTextHouse = parseTextAnchorHouseNumber(mesh, validHouseNumbers);
    const savedTextHouse = hasHouseTextMarker(`${mesh.meshName} ${mesh.materialName}`)
      ? validHouseOrNull(saved?.detected_house_number, validHouseNumbers)
      : null;
    const textHouse = parsedTextHouse ?? savedTextHouse;
    if (textHouse != null && isValidHouse(Number(textHouse))) {
      textAnchors.push({
        houseNumber: Number(textHouse),
        center: mesh.center,
        source: "text_anchor",
        layerKey: mesh.layerKey,
        meshName: mesh.meshName,
        materialName: mesh.materialName,
      });
    } else {
      const rawText = `${mesh.meshName} ${mesh.materialName}`;
      if (!hasHouseTextMarker(rawText) && exactNumberTokens(rawText).length > 0) {
        rejectedNumericNames.push({
          layerKey: mesh.layerKey,
          meshName: mesh.meshName,
          materialName: mesh.materialName,
          reason: "nome numerado sem marcador de texto/label/casa",
        });
      }
    }
  });

  extraAnchors.forEach((anchor) => {
    if (!isValidHouse(Number(anchor.houseNumber))) return;
    if (anchor.source === "main_model_text_anchor") mainModelTextAnchors.push(anchor);
    else if (anchor.source === "text_anchor") textAnchors.push(anchor);
    else if (anchor.source === "confirmed_link_anchor") confirmedLinkAnchors.push(anchor);
    else if (anchor.source === "linked_neighbor") linkedAnchors.push(anchor);
  });

  return { confirmedLinkAnchors, linkedAnchors, textAnchors, mainModelTextAnchors, rejectedNumericNames };
}

export function getGlbTextHouseAnchors(
  meshes: GlbMeshRuntimeInfo[],
  validHouseNumbers?: number[],
  source: Extract<HouseAnchor["source"], "text_anchor" | "main_model_text_anchor"> = "main_model_text_anchor",
) {
  const validSet = Array.isArray(validHouseNumbers)
    ? new Set(validHouseNumbers.map(Number).filter(Number.isFinite))
    : undefined;
  const isValidHouse = (houseNumber: number) => !validSet || validSet.has(houseNumber);
  const anchors: HouseAnchor[] = [];

  meshes.forEach((mesh) => {
    const parsedTextHouse = parseTextAnchorHouseNumber(mesh, validSet);
    const savedTextHouse = hasHouseTextMarker(`${mesh.meshName} ${mesh.materialName}`)
      ? validHouseOrNull(mesh.saved?.detected_house_number, validSet)
      : null;
    const textHouse = parsedTextHouse ?? savedTextHouse;
    if (textHouse == null || !isValidHouse(Number(textHouse))) return;

    anchors.push({
      houseNumber: Number(textHouse),
      center: mesh.center,
      source,
      layerKey: mesh.layerKey,
      meshName: mesh.meshName,
      materialName: mesh.materialName,
    });
  });

  return anchors;
}

function nearestAnchor(
  mesh: GlbMeshRuntimeInfo,
  anchors: HouseAnchor[],
  source: HouseAnchor["source"],
  excludeLayerKey?: string,
) {
  const useHorizontalCompetition = isTextAnchorSource(source) || source === "confirmed_link_anchor";
  const ranked = anchors
    .filter((anchor) => anchor.layerKey !== excludeLayerKey)
    .map((anchor) => {
      const distances = anchorDistanceDetails(mesh, anchor, source);
      return {
        anchor,
        distance: distances.weightedDistance,
        horizontalDistance: distances.horizontalDistance,
        distance3d: distances.distance3d,
      };
    })
    .sort((a, b) => (useHorizontalCompetition ? a.horizontalDistance - b.horizontalDistance : a.distance - b.distance));
  const nearest = ranked[0];
  if (!nearest) return null;

  const secondDifferentHouse = ranked.find((item) => item.anchor.houseNumber !== nearest.anchor.houseNumber);
  const scale = Math.max(diagonal(mesh), 1);
  const nearestComparisonDistance = useHorizontalCompetition ? nearest.horizontalDistance : nearest.distance;
  const secondDistance = secondDifferentHouse
    ? useHorizontalCompetition
      ? secondDifferentHouse.horizontalDistance
      : secondDifferentHouse.distance
    : undefined;
  const distanceGap = secondDistance != null ? secondDistance - nearestComparisonDistance : undefined;
  const distanceRatio = secondDistance != null && secondDistance > 0
    ? nearestComparisonDistance / secondDistance
    : undefined;
  const hasCompetingAnchor = secondDistance != null;
  const highDominance = !hasCompetingAnchor
    || (distanceGap != null && distanceGap >= 2)
    || (distanceRatio != null && distanceRatio <= 0.75);
  const mediumDominance = highDominance
    || (distanceGap != null && distanceGap >= 1)
    || (distanceRatio != null && distanceRatio <= 0.85);
  const ambiguous = hasCompetingAnchor && !mediumDominance;
  const textHighDistanceLimit = 12;
  const textDiscardDistanceLimit = 15;
  const highLimit = source === "linked_neighbor"
    ? Math.max(3, Math.min(8, scale * 0.9))
    : source === "confirmed_link_anchor"
      ? 12
      : textHighDistanceLimit;
  const mediumLimit = source === "linked_neighbor"
    ? Math.max(5, Math.min(14, scale * 1.4))
    : source === "confirmed_link_anchor"
      ? 16
      : textDiscardDistanceLimit;

  let confidence: GlbSmartLinkCandidate["suggestionConfidence"] = "nenhuma";
  let rejectReason: string | undefined;
  if (isTextAnchorSource(source)) {
    if (nearestComparisonDistance > textDiscardDistanceLimit) {
      confidence = "nenhuma";
      rejectReason = "distancia excessiva";
    } else if (ambiguous) {
      confidence = "baixa";
      rejectReason = "segundo numero muito proximo";
    } else if (nearestComparisonDistance <= textHighDistanceLimit && highDominance) {
      confidence = "alta";
    } else if (mediumDominance) {
      confidence = "media";
      rejectReason = nearestComparisonDistance > textHighDistanceLimit
        ? "distancia alta mas ancora dominante"
        : "ancora dominante media";
    } else {
      confidence = "baixa";
      rejectReason = "ancora ambigua";
    }
  } else if (source === "confirmed_link_anchor") {
    if (nearestComparisonDistance > mediumLimit) {
      confidence = "nenhuma";
      rejectReason = "vinculo confirmado distante";
    } else if (ambiguous) {
      confidence = "baixa";
      rejectReason = "vinculos confirmados concorrentes";
    } else if (nearestComparisonDistance <= highLimit && highDominance) {
      confidence = "alta";
    } else if (mediumDominance) {
      confidence = "media";
      rejectReason = "vinculo confirmado proximo";
    } else {
      confidence = "baixa";
      rejectReason = "vinculo confirmado ambiguo";
    }
  } else if (!ambiguous && nearestComparisonDistance <= highLimit) {
    confidence = "alta";
  } else if (!ambiguous && nearestComparisonDistance <= mediumLimit) {
    confidence = "media";
  } else if (nearestComparisonDistance <= mediumLimit * 1.5) {
    confidence = "baixa";
    rejectReason = "ancora com baixa confianca";
  } else {
    rejectReason = "ancora distante";
  }

  return {
    houseNumber: nearest.anchor.houseNumber,
    confidence,
    distance: nearest.distance,
    horizontalDistance: nearest.horizontalDistance,
    distance3d: nearest.distance3d,
    source,
    ambiguous,
    nearestLayerKey: nearest.anchor.layerKey,
    nearestAnchorName: nearest.anchor.meshName,
    nearestAnchorCenter: nearest.anchor.center,
    secondDistance,
    distanceGap,
    distanceRatio,
    acceptedDominantAnchor: !ambiguous && mediumDominance,
    topTextAnchors: isTextAnchorSource(source)
      ? ranked.slice(0, 5).map((item) => ({
        houseNumber: item.anchor.houseNumber,
        layerKey: item.anchor.layerKey,
        meshName: item.anchor.meshName,
        source: item.anchor.source,
        center: item.anchor.center,
        horizontalDistance: item.horizontalDistance,
        distance3d: item.distance3d,
        weightedDistance: item.distance,
      }))
      : undefined,
    topConfirmedAnchors: source === "confirmed_link_anchor"
      ? ranked.slice(0, 5).map((item) => ({
        houseNumber: item.anchor.houseNumber,
        layerKey: item.anchor.layerKey,
        meshName: item.anchor.meshName,
        center: item.anchor.center,
        horizontalDistance: item.horizontalDistance,
        distance3d: item.distance3d,
        weightedDistance: item.distance,
      }))
      : undefined,
    rejectReason: rejectReason ?? (ambiguous
      ? "ancora ambigua"
      : confidence === "nenhuma"
        ? "ancora distante"
        : confidence === "baixa"
          ? "ancora com baixa confianca"
          : undefined),
  };
}

function nearestTextAnchorDecision(mesh: GlbMeshRuntimeInfo, anchors: HouseAnchor[], excludeLayerKey?: string) {
  const ranked = anchors
    .filter((anchor) => anchor.layerKey !== excludeLayerKey)
    .map((anchor) => {
      const distances = anchorDistanceDetails(mesh, anchor, "text_anchor");
      return {
        anchor,
        distance: distances.weightedDistance,
        horizontalDistance: distances.horizontalDistance,
        distance3d: distances.distance3d,
      };
    })
    .sort((a, b) => a.horizontalDistance - b.horizontalDistance);
  const nearest = ranked[0];
  if (!nearest) return null;

  const secondDifferentHouse = ranked.find((item) => item.anchor.houseNumber !== nearest.anchor.houseNumber);
  const distanceGap = secondDifferentHouse ? secondDifferentHouse.horizontalDistance - nearest.horizontalDistance : undefined;
  const distanceRatio = secondDifferentHouse && secondDifferentHouse.horizontalDistance > 0
    ? nearest.horizontalDistance / secondDifferentHouse.horizontalDistance
    : undefined;
  const highRadius = 10;
  const maxRadius = 14;
  const highDominance = !secondDifferentHouse
    || (distanceGap != null && distanceGap >= 1.6)
    || (distanceRatio != null && distanceRatio <= 0.78);
  const mediumDominance = highDominance
    || (distanceGap != null && distanceGap >= 0.8)
    || (distanceRatio != null && distanceRatio <= 0.88);

  let confidence: GlbSmartLinkCandidate["suggestionConfidence"] = "nenhuma";
  let rejectReason: string | undefined;
  if (nearest.horizontalDistance > maxRadius) {
    rejectReason = "texto ancora distante";
  } else if (!mediumDominance) {
    confidence = "baixa";
    rejectReason = "texto ancora ambiguo";
  } else if (nearest.horizontalDistance <= highRadius && highDominance) {
    confidence = "alta";
  } else {
    confidence = "media";
    rejectReason = "texto ancora dominante media";
  }

  return {
    houseNumber: nearest.anchor.houseNumber,
    confidence,
    distance: nearest.distance,
    horizontalDistance: nearest.horizontalDistance,
    distance3d: nearest.distance3d,
    source: "text_anchor" as const,
    ambiguous: !!secondDifferentHouse && !mediumDominance,
    nearestLayerKey: nearest.anchor.layerKey,
    nearestAnchorName: nearest.anchor.meshName,
    nearestAnchorCenter: nearest.anchor.center,
    secondDistance: secondDifferentHouse?.horizontalDistance,
    distanceGap,
    distanceRatio,
    acceptedDominantAnchor: mediumDominance,
    topTextAnchors: ranked.slice(0, 5).map((item) => ({
      houseNumber: item.anchor.houseNumber,
      layerKey: item.anchor.layerKey,
      meshName: item.anchor.meshName,
      source: item.anchor.source,
      center: item.anchor.center,
      horizontalDistance: item.horizontalDistance,
      distance3d: item.distance3d,
      weightedDistance: item.distance,
    })),
    rejectReason,
  };
}

function suggestHouse(mesh: GlbMeshRuntimeInfo, anchors: ReturnType<typeof buildHouseAnchors>) {
  const text = nearestTextAnchorDecision(mesh, anchors.textAnchors, mesh.layerKey);
  if (text && (text.confidence === "alta" || text.confidence === "media")) return text;

  const mainModelText = nearestAnchor(mesh, anchors.mainModelTextAnchors, "main_model_text_anchor", mesh.layerKey);
  if (mainModelText && (mainModelText.confidence === "alta" || mainModelText.confidence === "media")) return mainModelText;

  const confirmed = nearestAnchor(mesh, anchors.confirmedLinkAnchors, "confirmed_link_anchor", mesh.layerKey);
  if (confirmed && (confirmed.confidence === "alta" || confirmed.confidence === "media")) return confirmed;

  const linked = nearestAnchor(mesh, anchors.linkedAnchors, "linked_neighbor", mesh.layerKey);
  if (linked && (linked.confidence === "alta" || linked.confidence === "media")) return linked;
  if (text) return text;
  if (confirmed) return confirmed;
  if (linked) return linked;

  return {
    houseNumber: null,
    confidence: "nenhuma" as const,
    distance: undefined,
    source: "none" as const,
    rejectReason: anchors.textAnchors.length === 0 && anchors.confirmedLinkAnchors.length === 0 && anchors.linkedAnchors.length === 0
      ? "sem ancoras de casa"
      : "sem ancora proxima confiavel",
  };
}

export function getGlbHouseSuggestionDiagnostics(
  meshes: GlbMeshRuntimeInfo[],
  validHouseNumbers?: number[],
) {
  const validSet = Array.isArray(validHouseNumbers)
    ? new Set(validHouseNumbers.map(Number).filter(Number.isFinite))
    : undefined;
  const anchors = buildHouseAnchors(meshes, validSet);
  return {
    linkedAnchors: anchors.linkedAnchors,
    textAnchors: anchors.textAnchors,
  };
}

export function getSceneMeshInfo(
  scene: THREE.Object3D,
  meshMap: Map<string, ProjectModelMesh>,
  getLayerKey: (mesh: THREE.Mesh) => string,
) {
  const rows: GlbMeshRuntimeInfo[] = [];
  const seen = new Set<string>();

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const layerKey = getLayerKey(mesh);
    if (seen.has(layerKey)) return;
    seen.add(layerKey);

    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const saved = meshMap.get(layerKey) ?? null;

    rows.push({
      layerKey,
      meshName: saved?.mesh_name || mesh.name || "",
      materialName: saved?.material_name || materialNameOf(mesh),
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      volume: Math.max(size.x * size.y * size.z, 0),
      saved,
    });
  });

  return rows;
}

export function scoreGlbSimilarCandidates(
  base: GlbMeshRuntimeInfo,
  meshes: GlbMeshRuntimeInfo[],
  options?: { validHouseNumbers?: number[]; includeOtherPossible?: boolean; additionalHouseAnchors?: HouseAnchor[] },
) {
  const baseDims = sortedDimensions(base);
  const basePrefix = prefixOf(base.meshName);
  const baseMaterial = base.materialName.toLowerCase();
  const baseTokens = normalizedTokens(base);
  const validHouseNumbers = Array.isArray(options?.validHouseNumbers)
    ? new Set(options.validHouseNumbers.map(Number).filter(Number.isFinite))
    : undefined;
  const houseAnchors = buildHouseAnchors(meshes, validHouseNumbers, options?.additionalHouseAnchors);
  const baseDirectHouse = validHouseOrNull(base.saved?.assigned_house_number, validHouseNumbers)
    ?? validHouseOrNull(base.saved?.detected_house_number, validHouseNumbers)
    ?? validHouseOrNull(parseTextAnchorHouseNumber(base, validHouseNumbers), validHouseNumbers);
  const baseInferredHouse = suggestHouse(base, houseAnchors);
  const baseHouseForGrouping = baseDirectHouse ?? (
    baseInferredHouse.confidence === "alta" || baseInferredHouse.confidence === "media"
      ? baseInferredHouse.houseNumber
      : null
  );

  const scored = meshes
    .map<GlbSmartLinkCandidate>((mesh) => {
      const dims = sortedDimensions(mesh);
      const dimensionScore = (
        similarity(baseDims[0], dims[0])
        + similarity(baseDims[1], dims[1])
        + similarity(baseDims[2], dims[2])
      ) / 3;
      const heightScore = similarity(base.center.y, mesh.center.y);
      const volumeScore = similarity(base.volume, mesh.volume);
      const materialScore = baseMaterial && mesh.materialName.toLowerCase() === baseMaterial ? 1 : 0;
      const materialCompatible = materialScore > 0 || !baseMaterial;
      const nameScore = basePrefix && prefixOf(mesh.meshName) === basePrefix ? 1 : 0;
      const baseScore = Math.round((
        dimensionScore * 0.45
        + heightScore * 0.20
        + volumeScore * 0.18
        + materialScore * 0.10
        + nameScore * 0.07
      ) * 100);

      const saved = mesh.saved;
      const hasLink = !!saved
        && saved.assigned_house_number != null
        && saved.service_macro_id != null
        && saved.service_scope_id != null
        && !isContextProjectModelMesh(saved);
      const rawAssignedHouseNumber = saved?.assigned_house_number ?? null;
      const rawMeshText = `${mesh.meshName} ${mesh.materialName}`;
      const hasRealTextMarker = hasHouseTextMarker(rawMeshText);
      const currentAssignedHouseNumber = validHouseOrNull(rawAssignedHouseNumber, validHouseNumbers);
      const parsedHouseNumber = validHouseOrNull(parseTextAnchorHouseNumber(mesh, validHouseNumbers), validHouseNumbers);
      const detectedHouseNumber = parsedHouseNumber != null || hasRealTextMarker
        ? validHouseOrNull(saved?.detected_house_number, validHouseNumbers)
        : null;
      const directHouseWasDiscarded = (
        (saved?.detected_house_number != null && hasRealTextMarker && detectedHouseNumber == null)
        || (hasRealTextMarker && parseHouseNumberFromMesh(mesh.meshName) != null && parseTextAnchorHouseNumber(mesh, validHouseNumbers) == null)
        || (rawAssignedHouseNumber != null && currentAssignedHouseNumber == null)
      );
      const inferredHouse = suggestHouse(mesh, houseAnchors);
      const directSuggestedHouse = currentAssignedHouseNumber ?? detectedHouseNumber ?? parsedHouseNumber;
      const textAnchorBlockedLinkedNeighbor = (inferredHouse.source === "text_anchor" || inferredHouse.source === "confirmed_link_anchor")
        && inferredHouse.houseNumber != null;
      const suggestedHouseNumber = directSuggestedHouse ?? (
        inferredHouse.confidence === "alta" || inferredHouse.confidence === "media"
          ? inferredHouse.houseNumber
          : null
      );
      const suggestionConfidence: GlbSmartLinkCandidate["suggestionConfidence"] = currentAssignedHouseNumber != null || detectedHouseNumber != null || parsedHouseNumber != null
        ? "alta"
        : inferredHouse.confidence;
      const suggestionSource: GlbSmartLinkCandidate["suggestionSource"] = currentAssignedHouseNumber != null
        ? "confirmed_link_anchor"
        : detectedHouseNumber != null || parsedHouseNumber != null
          ? "text_anchor"
          : inferredHouse.source;
      const inferredAny = inferredHouse as any;
      const suggestionDistance = inferredAny.distance;
      const suggestionHorizontalDistance = inferredAny.horizontalDistance;
      const suggestion3dDistance = inferredAny.distance3d;
      const secondSuggestionDistance = inferredAny.secondDistance;
      const suggestionDistanceGap = inferredAny.distanceGap;
      const suggestionDistanceRatio = inferredAny.distanceRatio;
      const acceptedDominantAnchor = inferredAny.acceptedDominantAnchor;
      const groupMatch = getLocalGroupMatch(base, mesh, baseTokens, baseHouseForGrouping, suggestedHouseNumber);
      const score = Math.min(100, baseScore + groupMatch.bonus);
      const isStrongMatch = score >= 90
        && dimensionScore >= 0.96
        && heightScore >= 0.90
        && volumeScore >= 0.90
        && materialCompatible;
      const isGroupedMatch = !isStrongMatch && groupMatch.grouped;
      const matchStrength: GlbSmartLinkCandidate["matchStrength"] = isStrongMatch ? "strong" : isGroupedMatch ? "group" : "other";
      const houseSuggestionRejectReason = suggestedHouseNumber == null
        ? directHouseWasDiscarded
          ? "casa fora do projeto"
          : inferredHouse.rejectReason ?? (
          houseAnchors.textAnchors.length === 0 && houseAnchors.confirmedLinkAnchors.length === 0 && houseAnchors.linkedAnchors.length === 0
            ? "sem ancoras de casa"
            : "sem ancora proxima confiavel"
        )
        : currentAssignedHouseNumber == null && suggestionConfidence === "media"
          ? inferredHouse.rejectReason ?? "confianca media sem aplicacao automatica"
        : undefined;
      const suggestionReason = currentAssignedHouseNumber != null
        ? "casa ja vinculada nesta mesh"
        : detectedHouseNumber != null
          ? "casa detectada salva"
        : parsedHouseNumber != null
          ? "numero encontrado no nome da mesh"
            : inferredHouse.houseNumber != null && (inferredHouse.confidence === "alta" || inferredHouse.confidence === "media")
              ? inferredHouse.source === "confirmed_link_anchor"
                ? "sugerida por vinculo confirmado proximo"
                : inferredHouse.source === "linked_neighbor"
                  ? "sugerida por mesh vizinha"
                : inferredHouse.confidence === "alta" && inferredHouse.distance != null && inferredHouse.distance > 8
                  ? "distancia alta mas ancora dominante"
                  : inferredHouse.acceptedDominantAnchor
                    ? "ancora dominante"
                    : "sugerida por texto/numero proximo"
              : directHouseWasDiscarded
                ? "casa descartada por estar fora do projeto"
              : inferredHouse.confidence === "baixa"
                ? "hipotese fraca por proximidade"
                : "sem casa sugerida confiavel";
      const status: GlbSmartLinkStatus = mesh.layerKey === base.layerKey
        ? "self"
        : saved?.ignored
          ? "ignored"
          : isContextProjectModelMesh(saved)
            ? "context"
            : hasLink
              ? "linked"
              : suggestedHouseNumber == null || suggestionConfidence !== "alta"
                ? "missing_house"
                : "applicable";

      const reasons = [
        `dimensoes ${Math.round(dimensionScore * 100)}%`,
        `altura ${Math.round(heightScore * 100)}%`,
        `volume ${Math.round(volumeScore * 100)}%`,
      ];
      if (materialScore > 0) reasons.push("material igual");
      if (nameScore > 0) reasons.push("nome/prefixo parecido");
      groupMatch.reasons.forEach((reason) => {
        if (!reasons.includes(reason)) reasons.push(reason);
      });

      return {
        ...mesh,
        score,
        confidence: confidenceFromScore(score),
        reasons,
        status,
        matchStrength,
        currentAssignedHouseNumber,
        suggestedHouseNumber,
        suggestionReason,
        suggestionConfidence,
        suggestionDistance,
        suggestionHorizontalDistance,
        suggestion3dDistance,
        secondSuggestionDistance,
        suggestionDistanceGap,
        suggestionDistanceRatio,
        acceptedDominantAnchor,
        suggestionSource,
        suggestionIgnoredLinkedNeighbor: textAnchorBlockedLinkedNeighbor,
        suggestionAnchorLayerKey: inferredAny.nearestLayerKey,
        suggestionAnchorName: inferredAny.nearestAnchorName,
        suggestionAnchorCenter: inferredAny.nearestAnchorCenter,
        suggestionTopTextAnchors: inferredAny.topTextAnchors,
        suggestionTopConfirmedAnchors: inferredAny.topConfirmedAnchors,
        houseSuggestionRejectReason,
        selectedByDefault: false,
      };
    })
    .filter((item) => options?.includeOtherPossible || item.matchStrength === "strong" || item.matchStrength === "group")
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);

  const bestApplicableByHouse = new Map<number, GlbSmartLinkCandidate>();
  scored.forEach((candidate) => {
    if (candidate.status !== "applicable" || candidate.suggestedHouseNumber == null) return;
    const current = bestApplicableByHouse.get(candidate.suggestedHouseNumber);
    if (
      !current
      || candidate.score > current.score
      || (
        candidate.score === current.score
        && (candidate.suggestionDistance ?? Number.POSITIVE_INFINITY) < (current.suggestionDistance ?? Number.POSITIVE_INFINITY)
      )
    ) {
      bestApplicableByHouse.set(candidate.suggestedHouseNumber, candidate);
    }
  });

  const result = scored.map((candidate) => {
    if (candidate.status !== "applicable" || candidate.suggestedHouseNumber == null) return candidate;
    const best = bestApplicableByHouse.get(candidate.suggestedHouseNumber);
    if (best && best.layerKey !== candidate.layerKey) {
      return {
        ...candidate,
        status: "missing_house",
        suggestionReason: "casa duplicada em outra candidata melhor",
        suggestionConfidence: "baixa",
        houseSuggestionRejectReason: "duplicada para o mesmo servico",
        selectedByDefault: false,
      };
    }

    return {
      ...candidate,
      selectedByDefault: candidate.matchStrength === "strong"
        && candidate.score >= 90
        && candidate.suggestionConfidence === "alta"
        && candidate.acceptedDominantAnchor !== false,
    };
  });

  if (import.meta.env.DEV) {
    console.log("[SmartLink Anchor Decision V2]", result.slice(0, 10).map((candidate) => ({
      layer_key: candidate.layerKey,
      meshName: candidate.meshName,
      candidateCenterWorld: candidate.center,
      suggestedHouse: candidate.suggestedHouseNumber,
      serviceSource: candidate.suggestionSource,
      linkedNeighborIgnored: candidate.suggestionIgnoredLinkedNeighbor,
      anchorLayerKey: candidate.suggestionAnchorLayerKey,
      anchorName: candidate.suggestionAnchorName,
      anchorCenterWorld: candidate.suggestionAnchorCenter,
      horizontalDistance: candidate.suggestionHorizontalDistance,
      distance3d: candidate.suggestion3dDistance,
      weightedDistance: candidate.suggestionDistance,
      secondDistance: candidate.secondSuggestionDistance,
      gap: candidate.suggestionDistanceGap,
      ratio: candidate.suggestionDistanceRatio,
      score: candidate.score,
      confidence: candidate.suggestionConfidence,
      reason: candidate.houseSuggestionRejectReason || candidate.suggestionReason,
      topTextAnchors: candidate.suggestionTopTextAnchors,
      topConfirmedLinkedAnchors: candidate.suggestionTopConfirmedAnchors,
      rejectedNumericNames: houseAnchors.rejectedNumericNames.slice(0, 10),
    })));
    const groupedSample = result.filter((candidate) => candidate.matchStrength === "group").slice(0, 10);
    if (groupedSample.length > 0) {
      console.log("[SmartLink Group Similar Debug]", groupedSample.map((candidate) => ({
        baseLayerKey: base.layerKey,
        candidateLayerKey: candidate.layerKey,
        groupReason: candidate.reasons.filter((reason) =>
          reason === "grupo proximo"
          || reason === "mesh complementar"
          || reason === "mesmo conjunto visual"
          || reason === "mesma casa sugerida"
        ),
        distance: horizontalCenterDistance(base, candidate),
        material: candidate.materialName,
        name: candidate.meshName,
        houseSuggestion: candidate.suggestedHouseNumber,
      })));
    }
  }

  return result;
}
