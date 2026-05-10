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
  currentAssignedHouseNumber: number | null;
  suggestedHouseNumber: number | null;
  suggestionReason: string;
  suggestionConfidence: "alta" | "media" | "baixa" | "nenhuma";
  suggestionDistance?: number;
  suggestionSource: "linked_neighbor" | "text_anchor" | "house_position" | "none";
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

function diagonal(info: GlbMeshRuntimeInfo) {
  return Math.sqrt(info.size.x ** 2 + info.size.y ** 2 + info.size.z ** 2);
}

function parseTextAnchorHouseNumber(mesh: GlbMeshRuntimeInfo) {
  const text = `${mesh.meshName} ${mesh.materialName}`.toLowerCase();
  if (!/(3dtext|text|texto|numero|numeracao|number)/i.test(text)) return null;
  const matches = text.match(/\d{1,4}/g) ?? [];
  for (const value of matches) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 10000) return parsed;
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

    const textHouse = saved?.detected_house_number ?? parseTextAnchorHouseNumber(mesh);
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
  const highLimit = source === "linked_neighbor" ? Math.max(3, scale * 2.5) : Math.max(5, scale * 4);
  const mediumLimit = source === "linked_neighbor" ? Math.max(8, scale * 5) : Math.max(12, scale * 8);
  const ambiguous = !!secondDifferentHouse && secondDifferentHouse.distance <= nearest.distance * 1.2;

  let confidence: GlbSmartLinkCandidate["suggestionConfidence"] = "nenhuma";
  if (!ambiguous && nearest.distance <= highLimit) confidence = "alta";
  else if (!ambiguous && nearest.distance <= mediumLimit) confidence = "media";
  else if (nearest.distance <= mediumLimit * 1.5) confidence = "baixa";

  return {
    houseNumber: nearest.anchor.houseNumber,
    confidence,
    distance: nearest.distance,
    source,
  };
}

function suggestHouse(mesh: GlbMeshRuntimeInfo, anchors: ReturnType<typeof buildHouseAnchors>) {
  const linked = nearestAnchor(mesh, anchors.linkedAnchors, "linked_neighbor", mesh.layerKey);
  if (linked && linked.confidence !== "nenhuma") return linked;

  const text = nearestAnchor(mesh, anchors.textAnchors, "text_anchor", mesh.layerKey);
  if (text && text.confidence !== "nenhuma") return text;

  return {
    houseNumber: null,
    confidence: "nenhuma" as const,
    distance: undefined,
    source: "none" as const,
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
  options?: { validHouseNumbers?: number[] },
) {
  const baseDims = sortedDimensions(base);
  const basePrefix = prefixOf(base.meshName);
  const baseMaterial = base.materialName.toLowerCase();
  const validHouseNumbers = options?.validHouseNumbers?.length
    ? new Set(options.validHouseNumbers.map(Number).filter(Number.isFinite))
    : undefined;
  const houseAnchors = buildHouseAnchors(meshes, validHouseNumbers);

  return meshes
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
      const currentAssignedHouseNumber = saved?.assigned_house_number ?? null;
      const parsedHouseNumber = parseHouseNumberFromMesh(mesh.meshName);
      const inferredHouse = suggestHouse(mesh, houseAnchors);
      const directSuggestedHouse = currentAssignedHouseNumber ?? saved?.detected_house_number ?? parsedHouseNumber;
      const suggestedHouseNumber = directSuggestedHouse ?? (
        inferredHouse.confidence === "alta" || inferredHouse.confidence === "media"
          ? inferredHouse.houseNumber
          : null
      );
      const suggestionConfidence: GlbSmartLinkCandidate["suggestionConfidence"] = currentAssignedHouseNumber != null || saved?.detected_house_number != null || parsedHouseNumber != null
        ? "alta"
        : inferredHouse.confidence;
      const suggestionSource: GlbSmartLinkCandidate["suggestionSource"] = currentAssignedHouseNumber != null
        ? "linked_neighbor"
        : saved?.detected_house_number != null || parsedHouseNumber != null
          ? "text_anchor"
          : inferredHouse.source;
      const suggestionDistance = inferredHouse.distance;
      const suggestionReason = currentAssignedHouseNumber != null
        ? "casa ja vinculada nesta mesh"
        : saved?.detected_house_number != null
          ? "casa detectada salva"
          : parsedHouseNumber != null
            ? "numero encontrado no nome da mesh"
            : inferredHouse.houseNumber != null && (inferredHouse.confidence === "alta" || inferredHouse.confidence === "media")
              ? inferredHouse.source === "linked_neighbor"
                ? "sugerida por mesh vizinha"
                : "sugerida por texto/numero proximo"
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
              : suggestedHouseNumber == null || suggestionConfidence === "baixa" || suggestionConfidence === "nenhuma"
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
        currentAssignedHouseNumber,
        suggestedHouseNumber,
        suggestionReason,
        suggestionConfidence,
        suggestionDistance,
        suggestionSource,
        selectedByDefault: status === "applicable" && score >= 70,
      };
    })
    .filter((item) => item.score >= 58)
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);
}
