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
  matchStrength: "strong" | "other";
  currentAssignedHouseNumber: number | null;
  suggestedHouseNumber: number | null;
  suggestionReason: string;
  suggestionConfidence: "alta" | "media" | "baixa" | "nenhuma";
  suggestionDistance?: number;
  secondSuggestionDistance?: number;
  suggestionDistanceGap?: number;
  suggestionDistanceRatio?: number;
  acceptedDominantAnchor?: boolean;
  suggestionSource: "linked_neighbor" | "text_anchor" | "house_position" | "none";
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

function confidenceFromScore(score: number): GlbSmartLinkCandidate["confidence"] {
  if (score >= 78) return "alta";
  if (score >= 62) return "media";
  return "baixa";
}

function distance(a: GlbMeshRuntimeInfo["center"], b: GlbMeshRuntimeInfo["center"]) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
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

function parseTextAnchorHouseNumber(mesh: GlbMeshRuntimeInfo, validHouseNumbers?: Set<number>) {
  const rawText = `${mesh.meshName} ${mesh.materialName}`;
  if (!/(3dtext|text|texto|numero|numeracao|number)/i.test(rawText)) return null;
  const sanitized = rawText
    .toLowerCase()
    .replace(/geom3d/gi, " ")
    .replace(/3dtext/gi, " ")
    .replace(/\b3d\b/gi, " ");
  const explicitTextNumber = rawText.match(/(?:3dtext|text|texto|numero|numeracao|number)[_\-\s]*(\d{1,4})(?:\D*$|$)/i);
  const matches = explicitTextNumber?.[1]
    ? [explicitTextNumber[1]]
    : sanitized.match(/\d{1,4}/g) ?? [];

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const valid = validHouseOrNull(matches[index], validHouseNumbers);
    if (valid != null) return valid;
  }
  return null;
}

interface HouseAnchor {
  houseNumber: number;
  center: GlbMeshRuntimeInfo["center"];
  source: "linked_neighbor" | "text_anchor";
  layerKey: string;
}

function buildHouseAnchors(meshes: GlbMeshRuntimeInfo[], validHouseNumbers?: Set<number>) {
  const isValidHouse = (houseNumber: number) => !validHouseNumbers || validHouseNumbers.has(houseNumber);
  const linkedAnchors: HouseAnchor[] = [];
  const textAnchors: HouseAnchor[] = [];

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
      linkedAnchors.push({
        houseNumber: Number(linkedHouse),
        center: mesh.center,
        source: "linked_neighbor",
        layerKey: mesh.layerKey,
      });
    }

    const textHouse = validHouseOrNull(saved?.detected_house_number, validHouseNumbers)
      ?? parseTextAnchorHouseNumber(mesh, validHouseNumbers);
    if (textHouse != null && isValidHouse(Number(textHouse))) {
      textAnchors.push({
        houseNumber: Number(textHouse),
        center: mesh.center,
        source: "text_anchor",
        layerKey: mesh.layerKey,
      });
    }
  });

  return { linkedAnchors, textAnchors };
}

function nearestAnchor(
  mesh: GlbMeshRuntimeInfo,
  anchors: HouseAnchor[],
  source: HouseAnchor["source"],
  excludeLayerKey?: string,
) {
  const ranked = anchors
    .filter((anchor) => anchor.layerKey !== excludeLayerKey)
    .map((anchor) => ({ anchor, distance: distance(mesh.center, anchor.center) }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = ranked[0];
  if (!nearest) return null;

  const secondDifferentHouse = ranked.find((item) => item.anchor.houseNumber !== nearest.anchor.houseNumber);
  const scale = Math.max(diagonal(mesh), 1);
  const secondDistance = secondDifferentHouse?.distance;
  const distanceGap = secondDistance != null ? secondDistance - nearest.distance : undefined;
  const distanceRatio = secondDistance != null && secondDistance > 0
    ? nearest.distance / secondDistance
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
    : textHighDistanceLimit;
  const mediumLimit = source === "linked_neighbor"
    ? Math.max(5, Math.min(14, scale * 1.4))
    : textDiscardDistanceLimit;

  let confidence: GlbSmartLinkCandidate["suggestionConfidence"] = "nenhuma";
  let rejectReason: string | undefined;
  if (source === "text_anchor") {
    if (nearest.distance > textDiscardDistanceLimit) {
      confidence = "nenhuma";
      rejectReason = "distancia excessiva";
    } else if (ambiguous) {
      confidence = "baixa";
      rejectReason = "segundo numero muito proximo";
    } else if (nearest.distance <= textHighDistanceLimit && highDominance) {
      confidence = "alta";
    } else if (mediumDominance) {
      confidence = "media";
      rejectReason = nearest.distance > textHighDistanceLimit
        ? "distancia alta mas ancora dominante"
        : "ancora dominante media";
    } else {
      confidence = "baixa";
      rejectReason = "ancora ambigua";
    }
  } else if (!ambiguous && nearest.distance <= highLimit) {
    confidence = "alta";
  } else if (!ambiguous && nearest.distance <= mediumLimit) {
    confidence = "media";
  } else if (nearest.distance <= mediumLimit * 1.5) {
    confidence = "baixa";
    rejectReason = "ancora com baixa confianca";
  } else {
    rejectReason = "ancora distante";
  }

  return {
    houseNumber: nearest.anchor.houseNumber,
    confidence,
    distance: nearest.distance,
    source,
    ambiguous,
    nearestLayerKey: nearest.anchor.layerKey,
    secondDistance,
    distanceGap,
    distanceRatio,
    acceptedDominantAnchor: !ambiguous && mediumDominance,
    rejectReason: rejectReason ?? (ambiguous
      ? "ancora ambigua"
      : confidence === "nenhuma"
        ? "ancora distante"
        : confidence === "baixa"
          ? "ancora com baixa confianca"
          : undefined),
  };
}

function suggestHouse(mesh: GlbMeshRuntimeInfo, anchors: ReturnType<typeof buildHouseAnchors>) {
  const text = nearestAnchor(mesh, anchors.textAnchors, "text_anchor", mesh.layerKey);
  if (text && (text.confidence === "alta" || text.confidence === "media")) return text;

  const linked = nearestAnchor(mesh, anchors.linkedAnchors, "linked_neighbor", mesh.layerKey);
  if (linked && (linked.confidence === "alta" || linked.confidence === "media")) return linked;
  if (text) return text;
  if (linked) return linked;

  return {
    houseNumber: null,
    confidence: "nenhuma" as const,
    distance: undefined,
    source: "none" as const,
    rejectReason: anchors.textAnchors.length === 0 && anchors.linkedAnchors.length === 0
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
  options?: { validHouseNumbers?: number[]; includeOtherPossible?: boolean },
) {
  const baseDims = sortedDimensions(base);
  const basePrefix = prefixOf(base.meshName);
  const baseMaterial = base.materialName.toLowerCase();
  const validHouseNumbers = Array.isArray(options?.validHouseNumbers)
    ? new Set(options.validHouseNumbers.map(Number).filter(Number.isFinite))
    : undefined;
  const houseAnchors = buildHouseAnchors(meshes, validHouseNumbers);

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
      const score = Math.round((
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
      const currentAssignedHouseNumber = validHouseOrNull(rawAssignedHouseNumber, validHouseNumbers);
      const detectedHouseNumber = validHouseOrNull(saved?.detected_house_number, validHouseNumbers);
      const parsedHouseNumber = validHouseOrNull(parseHouseNumberFromMesh(mesh.meshName), validHouseNumbers);
      const directHouseWasDiscarded = (
        (saved?.detected_house_number != null && detectedHouseNumber == null)
        || (parseHouseNumberFromMesh(mesh.meshName) != null && parsedHouseNumber == null)
        || (rawAssignedHouseNumber != null && currentAssignedHouseNumber == null)
      );
      const inferredHouse = suggestHouse(mesh, houseAnchors);
      const directSuggestedHouse = currentAssignedHouseNumber ?? detectedHouseNumber ?? parsedHouseNumber;
      const suggestedHouseNumber = directSuggestedHouse ?? (
        inferredHouse.confidence === "alta" || inferredHouse.confidence === "media"
          ? inferredHouse.houseNumber
          : null
      );
      const suggestionConfidence: GlbSmartLinkCandidate["suggestionConfidence"] = currentAssignedHouseNumber != null || detectedHouseNumber != null || parsedHouseNumber != null
        ? "alta"
        : inferredHouse.confidence;
      const suggestionSource: GlbSmartLinkCandidate["suggestionSource"] = currentAssignedHouseNumber != null
        ? "linked_neighbor"
        : detectedHouseNumber != null || parsedHouseNumber != null
          ? "text_anchor"
          : inferredHouse.source;
      const suggestionDistance = inferredHouse.distance;
      const secondSuggestionDistance = inferredHouse.secondDistance;
      const suggestionDistanceGap = inferredHouse.distanceGap;
      const suggestionDistanceRatio = inferredHouse.distanceRatio;
      const acceptedDominantAnchor = inferredHouse.acceptedDominantAnchor;
      const isStrongMatch = score >= 90
        && dimensionScore >= 0.96
        && heightScore >= 0.90
        && volumeScore >= 0.90
        && materialCompatible;
      const matchStrength: GlbSmartLinkCandidate["matchStrength"] = isStrongMatch ? "strong" : "other";
      const houseSuggestionRejectReason = suggestedHouseNumber == null
        ? directHouseWasDiscarded
          ? "casa fora do projeto"
          : inferredHouse.rejectReason ?? (
          houseAnchors.textAnchors.length === 0 && houseAnchors.linkedAnchors.length === 0
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
              ? inferredHouse.source === "linked_neighbor"
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
        secondSuggestionDistance,
        suggestionDistanceGap,
        suggestionDistanceRatio,
        acceptedDominantAnchor,
        suggestionSource,
        houseSuggestionRejectReason,
        selectedByDefault: false,
      };
    })
    .filter((item) => options?.includeOtherPossible || item.matchStrength === "strong")
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

  return scored.map((candidate) => {
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
}
