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
  suggestedHouseNumber: number | null;
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

export function scoreGlbSimilarCandidates(base: GlbMeshRuntimeInfo, meshes: GlbMeshRuntimeInfo[]) {
  const baseDims = sortedDimensions(base);
  const basePrefix = prefixOf(base.meshName);
  const baseMaterial = base.materialName.toLowerCase();

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
      const suggestedHouseNumber = saved?.detected_house_number ?? parseHouseNumberFromMesh(mesh.meshName);
      const status: GlbSmartLinkStatus = mesh.layerKey === base.layerKey
        ? "self"
        : saved?.ignored
          ? "ignored"
          : isContextProjectModelMesh(saved)
            ? "context"
            : hasLink
              ? "linked"
              : suggestedHouseNumber == null
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
        suggestedHouseNumber,
        selectedByDefault: status === "applicable" && score >= 70,
      };
    })
    .filter((item) => item.score >= 58)
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);
}
