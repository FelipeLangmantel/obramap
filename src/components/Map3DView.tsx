import { useState, useRef, Suspense, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls, useGLTF, Html, PerspectiveCamera } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, RotateCcw, Move3D, X, ChevronDown, ChevronRight, Save, Loader2, Home, AlertTriangle, Target, Layers, Camera, MousePointerClick, ScanSearch, RefreshCw, Eye, EyeOff, Boxes, Sparkles, SlidersHorizontal } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useModelLayers } from "./map3d/useModelLayers";
import { LayersPanel } from "./map3d/LayersPanel";
import { LinkLayersDialog } from "./map3d/LinkLayersDialog";
import { AssignHousePopover } from "./map3d/AssignHousePopover";
import { useMeshHouseAssignments } from "@/hooks/useMeshHouseAssignments";
import { IFCModel } from "./map3d/IFCModel";
import { IfcSuggestionsPanel } from "./map3d/IfcSuggestionsPanel";
import { GLB_CONTEXT_MESH_MARKER, isCompleteProductionLink, isContextProjectModelMesh, useProjectModelMeshes, type ProjectModelMesh } from "@/hooks/useProjectModelMeshes";
import { MeshReviewPanel, type ServiceOption } from "./map3d/MeshReviewPanel";
import { GlbSmartLinkDialog } from "./map3d/GlbSmartLinkDialog";
import {
  getGlbHouseSuggestionDiagnostics,
  getGlbTextHouseAnchors,
  getSceneMeshInfo,
  scoreGlbSimilarCandidates,
  type GlbMeshRuntimeInfo,
  type GlbSmartLinkCandidate,
} from "./map3d/glbSmartLink";
import { parseHouseNumberFromMesh } from "./map3d/parseHouseFromMeshName";
import { HouseFotoHistoryDrawer } from "@/components/diario/HouseFotoHistoryDrawer";
import { canDelete3DAssets, canManage3DMap, canUseMap3DAction } from "@/lib/accessControl";
import { calculateHouseProgress } from "@/data/constructionData";

interface ModelData {
  url: string;
  type: "gltf" | "obj" | "ifc";
  mtlUrl?: string;
}

type SupplementalGlbPart = {
  id: string;
  name: string;
  url: string;
  visible: boolean;
  persisted: boolean;
  fileName?: string | null;
  storagePath?: string | null;
  partOrder?: number;
};

type GlbMeshInventoryInput = {
  layer_key: string;
  mesh_name: string;
  material_name: string;
  detected_house_number: number | null;
};

const MAP3D_STORAGE_BUCKET = "3d-models";
const MAP3D_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Extract the storage object path from a stored Supabase Storage URL
 * (public or signed). Returns null if the URL doesn't look like one.
 */
function extractMap3DStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return url.startsWith("http") ? null : url; // assume already a path
  let tail = url.slice(idx + marker.length);
  // strip 'public/' or 'sign/'
  tail = tail.replace(/^(public|sign|authenticated)\//, "");
  // strip bucket prefix
  const bucketPrefix = `${MAP3D_STORAGE_BUCKET}/`;
  if (tail.startsWith(bucketPrefix)) tail = tail.slice(bucketPrefix.length);
  // drop query (e.g. ?token=...)
  const q = tail.indexOf("?");
  if (q !== -1) tail = tail.slice(0, q);
  return tail || null;
}

async function resolveMap3DSignedUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = extractMap3DStoragePath(url);
  if (!path) return url ?? null;
  const { data, error } = await supabase.storage
    .from(MAP3D_STORAGE_BUCKET)
    .createSignedUrl(path, MAP3D_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[3D] Failed to sign URL for", path, error);
    return null;
  }
  return data.signedUrl;
}
const MAP3D_ZOOM_SENSITIVITY_KEY = "obramap:map3d:zoom-sensitivity";
const MAP3D_WALK_HELP_HIDDEN_KEY = "obramap:map3d:walk-help-hidden";

type ZoomSensitivity = "low" | "normal" | "high" | "very_high";
type LightingMode = "day" | "night";

function getRealServiceFilterKey(mesh: ProjectModelMesh | null | undefined) {
  if (!mesh?.service_macro_id || !mesh.service_scope_id) return null;
  return `${mesh.service_macro_id}::${mesh.service_scope_id}`;
}

const ZOOM_SENSITIVITY_OPTIONS: Array<{ value: ZoomSensitivity; label: string; multiplier: number }> = [
  { value: "low", label: "Baixa", multiplier: 0.7 },
  { value: "normal", label: "Normal", multiplier: 1 },
  { value: "high", label: "Alta", multiplier: 1.4 },
  { value: "very_high", label: "Muito alta", multiplier: 1.8 },
];

function sanitize3DStorageFileName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "glb";
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "modelo";
  return `${baseName}.${extension}`;
}

interface HouseMarker {
  id: number;
  houseNumber: number;
  position: [number, number, number];
  progress: number;
  macros: any[];
}

function getMeshLayerKey(mesh: THREE.Mesh): string {
  return typeof mesh.userData?.obramapLayerKey === "string" && mesh.userData.obramapLayerKey
    ? mesh.userData.obramapLayerKey
    : mesh.uuid;
}

function getLocalGlbLayerKey(meshName: string, occurrence: number): string {
  return `glb:${meshName || "mesh"}:${occurrence}`;
}

function getSupplementalPartLayerKey(partId: string, localLayerKey: string): string {
  return `glbpart:${partId}:${localLayerKey}`;
}

function getGlbPartIdFromLayerKey(layerKey: string): string | null {
  if (!layerKey.startsWith("glbpart:")) return null;
  const [, partId] = layerKey.split(":");
  return partId || null;
}

const GLB_REAL_SYNC_WATCH_KEYS = [
  "glb:Geom3D_300:0",
  "glb:Geom3D_302:0",
  "glb:Geom3D_303:0",
];

const GLB_CONTEXT_PRESETS = [
  {
    key: "grass",
    label: "Marcar grama/terreno como Contexto",
    terms: ["grass", "grama", "vegetation", "vegetacao", "vegetação", "veget", "terrain", "terreno", "soil", "solo"],
  },
  {
    key: "text",
    label: "Marcar textos/números como Contexto",
    terms: ["3dtext", "text", "texto", "numero", "número", "numeracao", "numeração"],
  },
] as const;

type GlbContextPresetKey = typeof GLB_CONTEXT_PRESETS[number]["key"];

type SmartLinkIsolationFilter = "all" | "applicable" | "selected" | "missing_house" | "medium" | "linked";

type GlbContextPreview = {
  presetKey: GlbContextPresetKey | "clear";
  title: string;
  found: number;
  alreadyContext: number;
  skippedLinked: number;
  wouldMark: Array<Partial<ProjectModelMesh> & { project_id: string; layer_key: string }>;
  materialNames: string[];
  meshNames: string[];
  sample: Array<{ layer_key: string; mesh_name: string; material_name: string }>;
};

type WalkInspection = {
  layerKey: string;
  meshName: string;
  materialName: string;
};

type SmartLinkHoverTooltip = {
  candidate: GlbSmartLinkCandidate;
  x: number;
  y: number;
} | null;

type ReviewLinksFilter = "all" | "linked" | "pending";

type ReviewLinkHoverTooltip = {
  x: number;
  y: number;
  layerKey: string;
  meshName: string;
  materialName: string;
  houseLabel: string;
  serviceLabel: string;
  statusLabel: string;
  meshTypeLabel: string;
  originLabel: string;
} | null;

const SMART_LINK_STATUS_LABEL: Record<GlbSmartLinkCandidate["status"], string> = {
  applicable: "aplicavel",
  missing_house: "sem casa",
  linked: "ja vinculada",
  context: "contexto",
  ignored: "ignorada",
  self: "mesh base",
};

const GLB_CONTEXT_SUSPECT_TERMS = [
  "laje",
  "slab",
  "telhado",
  "roof",
  "parede",
  "wall",
  "radier",
  "fundacao",
  "fundação",
  "foundation",
  "concrete",
];

function getMeshMaterialName(mesh: THREE.Mesh): string {
  const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
  if (!material) return "";
  if (Array.isArray(material)) return material.map((m: any) => m?.name).filter(Boolean).join(" ");
  return (material as any).name || "";
}

function isMeshSelectableFromRaycast(mesh: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = mesh;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  const material = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  const materials = Array.isArray(material) ? material : material ? [material] : [];
  if (materials.length > 0 && materials.every((mat: any) => mat.transparent && Number(mat.opacity ?? 1) <= 0.02)) {
    return false;
  }
  return true;
}

function getSelectableRaycastHit(event: any): { object: THREE.Object3D; point?: THREE.Vector3 } | null {
  const intersections = Array.isArray(event?.intersections) ? event.intersections : [];
  const hit = intersections.find((item: any) => {
    const object = item?.object as THREE.Object3D | undefined;
    return !!object && (object as THREE.Mesh).isMesh && isMeshSelectableFromRaycast(object);
  });
  if (hit?.object) return { object: hit.object, point: hit.point?.clone?.() };
  if (event?.object && (event.object as THREE.Mesh).isMesh && isMeshSelectableFromRaycast(event.object)) {
    return { object: event.object, point: event.point?.clone?.() };
  }
  return null;
}

function isContextMesh(saved: ProjectModelMesh | null | undefined, mesh: THREE.Mesh): boolean {
  const text = [
    saved?.mesh_name,
    saved?.material_name,
    mesh.name,
    getMeshMaterialName(mesh),
  ].filter(Boolean).join(" ").toLowerCase();

  return [
    "3dtext",
    "text",
    "texto",
    "rua",
    "street",
    "via",
    "lote",
    "terreno",
    "terrain",
    "site",
    "calçada",
    "calcada",
    "sidewalk",
    "guia",
    "meio fio",
    "meio-fio",
    "asfalto",
    "asphalt",
    "grama",
    "grass",
    "vegetation",
    "soil",
    "paver",
    "concrete_scored",
    "entorno",
    "implantação",
    "implantacao",
  ].some((term) => text.includes(term));
}

// Aplica highlight temporario na mesh selecionada (modo Revisar).
function useSelectionHighlight(scene: THREE.Object3D | null, selectedKey: string | null, selectedKeys?: Set<string>) {
  const highlightedRef = useRef<Array<{ mesh: THREE.Mesh; originalMaterial: THREE.Material | THREE.Material[] }>>([]);
  const selectedKeysSignature = selectedKeys ? Array.from(selectedKeys).sort().join("|") : "";

  useEffect(() => {
    const resolveRestoredMaterial = (material: THREE.Material): THREE.Material => {
      const previewOriginal = (material.userData as any)?.__obramapSmartPreviewOriginalMaterial;
      return previewOriginal && typeof previewOriginal.dispose === "function" ? previewOriginal : material;
    };

    const resolveRestoredMaterials = (material: THREE.Material | THREE.Material[]) =>
      Array.isArray(material) ? material.map(resolveRestoredMaterial) : resolveRestoredMaterial(material);

    const disposeSelectionHighlightMaterials = (material: THREE.Material | THREE.Material[]) => {
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((item) => {
        if ((item.userData as any)?.__obramapSelectionHighlightMaterial) {
          item.dispose();
        }
      });
    };

    const restoreHighlighted = () => {
      highlightedRef.current.forEach(({ mesh, originalMaterial }) => {
        const currentMaterial = mesh.material as THREE.Material | THREE.Material[];
        const restoredMaterial = resolveRestoredMaterials(originalMaterial);
        mesh.material = restoredMaterial;
        disposeSelectionHighlightMaterials(currentMaterial);
        const materials = Array.isArray(restoredMaterial) ? restoredMaterial : [restoredMaterial];
        materials.forEach(material => {
          material.needsUpdate = true;
        });
        if (import.meta.env.DEV) {
          console.log("[GLB Review Highlight] restored", { uuid: mesh.uuid, name: mesh.name || null });
        }
      });
      highlightedRef.current = [];
    };

    restoreHighlighted();
    const targetKeys = new Set<string>();
    if (selectedKey) targetKeys.add(selectedKey);
    selectedKeys?.forEach((key) => targetKeys.add(key));
    if (!scene || targetKeys.size === 0) return restoreHighlighted;

    const selectedMeshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (targetKeys.has(getMeshLayerKey(mesh))) selectedMeshes.push(mesh);
    });

    if (selectedMeshes.length === 0) return restoreHighlighted;
    const highlightMaterial = (material: THREE.Material) => {
      const clone = material.clone();
      clone.userData = {
        ...clone.userData,
        __obramapSelectionHighlightMaterial: true,
      };
      const anyClone = clone as any;
      if (anyClone.emissive?.set) {
        anyClone.emissive.set(0xffffff);
        anyClone.emissiveIntensity = Math.max(Number(anyClone.emissiveIntensity || 0), 0.32);
      } else if (anyClone.color?.lerp) {
        anyClone.color.lerp(new THREE.Color(0xffffff), 0.28);
      }
      if ("opacity" in anyClone) {
        anyClone.transparent = anyClone.transparent || anyClone.opacity < 1;
      }
      clone.needsUpdate = true;
      return clone;
    };

    highlightedRef.current = selectedMeshes.map((selectedMesh) => {
      const originalMaterial = selectedMesh.material as THREE.Material | THREE.Material[];
      selectedMesh.material = Array.isArray(originalMaterial)
        ? originalMaterial.map(highlightMaterial)
        : highlightMaterial(originalMaterial);
      return { mesh: selectedMesh, originalMaterial };
    });
    if (import.meta.env.DEV) {
      console.log("[GLB Review Highlight] selected", { count: selectedMeshes.length, selectedKeys: Array.from(targetKeys) });
    }

    return restoreHighlighted;
  }, [scene, selectedKey, selectedKeysSignature]);
}

// GLTF model - calls onLoaded after it's in the scene
function GLTFModel({ url, onLoaded, onSceneReady, onMeshClick, onMeshDoubleClick, onMeshHover, onMeshHoverEnd, selectedMeshKey, selectedMeshKeys }: { url: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void; onMeshClick?: (mesh: THREE.Object3D, point?: THREE.Vector3, event?: any) => void; onMeshDoubleClick?: (mesh: THREE.Object3D, point?: THREE.Vector3) => void; onMeshHover?: (mesh: THREE.Object3D, event: any) => void; onMeshHoverEnd?: () => void; selectedMeshKey?: string | null; selectedMeshKeys?: Set<string> }) {
  const { scene } = useGLTF(url);
  const calledRef = useRef(false);
  useSelectionHighlight(scene, selectedMeshKey ?? null, selectedMeshKeys);

  useEffect(() => {
    if (scene && !calledRef.current) {
      calledRef.current = true;
      onSceneReady?.(scene);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          onLoaded();
        });
      });
    }
  }, [scene, onLoaded, onSceneReady]);

  return (
    <primitive
      object={scene}
      onClick={(e: any) => {
        if (!onMeshClick) return;
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshClick(hit.object, hit.point, e);
      }}
      onDoubleClick={(e: any) => {
        if (!onMeshDoubleClick) return;
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshDoubleClick(hit.object, hit.point);
      }}
      onPointerMove={(e: any) => {
        if (!onMeshHover) return;
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshHover(hit.object, e);
      }}
      onPointerOut={() => onMeshHoverEnd?.()}
    />
  );
}

function SupplementalGLTFPart({
  part,
  onMeshClick,
  onMeshDoubleClick,
  onMeshHover,
  onMeshHoverEnd,
  onSceneReady,
  onInventoryReady,
  selectedMeshKey,
  selectedMeshKeys,
}: {
  part: SupplementalGlbPart;
  onMeshClick?: (part: SupplementalGlbPart, mesh: THREE.Object3D, point?: THREE.Vector3, event?: any) => void;
  onMeshDoubleClick?: (part: SupplementalGlbPart, mesh: THREE.Object3D, point?: THREE.Vector3) => void;
  onMeshHover?: (part: SupplementalGlbPart, mesh: THREE.Object3D, event: any) => void;
  onMeshHoverEnd?: () => void;
  onSceneReady?: (part: SupplementalGlbPart, scene: THREE.Object3D) => void;
  onInventoryReady?: (part: SupplementalGlbPart, meshes: GlbMeshInventoryInput[]) => void;
  selectedMeshKey?: string | null;
  selectedMeshKeys?: Set<string>;
}) {
  const { scene } = useGLTF(part.url);

  useEffect(() => {
    const nameCounts = new Map<string, number>();
    const meshesToUpsert: GlbMeshInventoryInput[] = [];
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const meshName = mesh.name || "mesh";
      const occurrence = nameCounts.get(meshName) ?? 0;
      nameCounts.set(meshName, occurrence + 1);
      const localLayerKey = getLocalGlbLayerKey(meshName, occurrence);
      const partLayerKey = getSupplementalPartLayerKey(part.id, localLayerKey);
      mesh.userData.obramapSupplementalPart = true;
      mesh.userData.obramapSupplementalPartId = part.id;
      mesh.userData.obramapPartLocalLayerKey = localLayerKey;
      mesh.userData.obramapPartLayerKey = partLayerKey;
      if (part.persisted) {
        mesh.userData.obramapLayerKey = partLayerKey;
        meshesToUpsert.push({
          layer_key: partLayerKey,
          mesh_name: meshName,
          material_name: getMeshMaterialName(mesh),
          detected_house_number: parseHouseNumberFromMesh(meshName),
        });
      } else {
        delete mesh.userData.obramapLayerKey;
      }
    });
    onSceneReady?.(part, scene);
    if (part.persisted) onInventoryReady?.(part, meshesToUpsert);
  }, [onInventoryReady, onSceneReady, part, scene]);
  useSelectionHighlight(scene, selectedMeshKey ?? null, selectedMeshKeys);

  return (
    <primitive
      object={scene}
      onClick={(e: any) => {
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshClick?.(part, hit.object, hit.point, e);
      }}
      onDoubleClick={(e: any) => {
        if (!onMeshDoubleClick) return;
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshDoubleClick(part, hit.object, hit.point);
      }}
      onPointerMove={(e: any) => {
        if (!onMeshHover) return;
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshHover(part, hit.object, e);
      }}
      onPointerOut={() => onMeshHoverEnd?.()}
    />
  );
}

// OBJ model - calls onLoaded after it's in the scene
function OBJModel({ url, mtlUrl, onLoaded, onSceneReady, onMeshClick, onMeshDoubleClick, onMeshHover, onMeshHoverEnd, selectedMeshKey, selectedMeshKeys }: { url: string; mtlUrl?: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void; onMeshClick?: (mesh: THREE.Object3D, point?: THREE.Vector3, event?: any) => void; onMeshDoubleClick?: (mesh: THREE.Object3D, point?: THREE.Vector3) => void; onMeshHover?: (mesh: THREE.Object3D, event: any) => void; onMeshHoverEnd?: () => void; selectedMeshKey?: string | null; selectedMeshKeys?: Set<string> }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null;
  const obj = useLoader(OBJLoader, url, (loader) => {
    if (materials) { materials.preload(); loader.setMaterials(materials); }
  });
  const calledRef = useRef(false);
  useSelectionHighlight(obj, selectedMeshKey ?? null, selectedMeshKeys);

  useEffect(() => {
    if (obj && !calledRef.current) {
      calledRef.current = true;
      onSceneReady?.(obj);
      requestAnimationFrame(() => { requestAnimationFrame(() => { onLoaded(); }); });
    }
  }, [obj, onLoaded, onSceneReady]);

  return (
    <primitive
      object={obj}
      onClick={(e: any) => {
        if (!onMeshClick) return;
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshClick(hit.object, hit.point, e);
      }}
      onDoubleClick={(e: any) => {
        if (!onMeshDoubleClick) return;
        e.stopPropagation();
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshDoubleClick(hit.object, hit.point);
      }}
      onPointerMove={(e: any) => {
        if (!onMeshHover) return;
        const hit = getSelectableRaycastHit(e);
        if (hit) onMeshHover(hit.object, e);
      }}
      onPointerOut={() => onMeshHoverEnd?.()}
    />
  );
}

// House marker
function HouseMarker3D({ marker, onClick, isSelected, customLegendItems }: { 
  marker: HouseMarker; onClick: () => void; isSelected: boolean; customLegendItems: any[];
}) {
  const getColor = (p: number) => {
    if (p === 0) return "#6b7280";
    for (const item of [...customLegendItems].sort((a, b) => a.minPercent - b.minPercent)) {
      if (p >= item.minPercent && p <= item.maxPercent) return item.color;
    }
    return p < 50 ? "#ef4444" : p < 100 ? "#eab308" : "#22c55e";
  };
  return (
    <group position={marker.position}>
      <mesh onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <boxGeometry args={[0.5, 0.3, 0.5]} />
        <meshStandardMaterial color={getColor(marker.progress)} emissive={isSelected ? getColor(marker.progress) : "#000000"} emissiveIntensity={isSelected ? 0.3 : 0} />
      </mesh>
      <Html position={[0, 0.4, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="bg-background/90 px-2 py-1 rounded text-xs font-medium whitespace-nowrap border border-border">
          Casa {marker.houseNumber} - {marker.progress.toFixed(0)}%
        </div>
      </Html>
    </group>
  );
}

// Zoom to mouse position controls
function ZoomToMouseControls({ focusPoint, zoomSpeed }: { focusPoint?: [number, number, number] | null; zoomSpeed: number }) {
  const { gl, invalidate } = useThree();
  const controlsRef = useRef<any>(null);

  // Wheel: normaliza delta entre mouse/trackpad e faz throttle por rAF
  // para evitar surtos de eventos que travam o render com muitas meshes.
  useEffect(() => {
    const domElement = gl.domElement;
    let queuedDelta = 0;
    let rafId: number | null = null;

    const flush = () => {
      rafId = null;
      if (queuedDelta === 0) return;
      const ctrl = controlsRef.current;
      queuedDelta = 0;
      if (ctrl) invalidate();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Normaliza: linhas/páginas viram px aproximados
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= 100;
      // Limita o passo por tick — evita "saltos" longos que travam
      queuedDelta += Math.max(-120, Math.min(120, dy));
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    domElement.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      domElement.removeEventListener('wheel', onWheel);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [gl, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !focusPoint) return;
    controls.target.set(focusPoint[0], focusPoint[1], focusPoint[2]);
    controls.update();
    invalidate();
  }, [focusPoint, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault enablePan enableRotate
      enableZoom={true}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={0.05}
      maxDistance={2000}
      panSpeed={1.2}
      rotateSpeed={0.9}
      // zoom mais suave: menos "salto" + damping curto = sensação fluida
      zoomSpeed={zoomSpeed}
      enableDamping
      dampingFactor={0.06}
      zoomToCursor
      screenSpacePanning
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}

function WalkControls({ onExit, height = 1.7, startPoint = null }: { onExit: () => void; height?: number; startPoint?: [number, number, number] | null }) {
  const { camera, scene } = useThree();
  const controlsRef = useRef<any>(null);
  const floorRaycasterRef = useRef(new THREE.Raycaster());
  const keysRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });
  const moveRef = useRef({
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  });

  useEffect(() => {
    const before = camera.position.clone();
    const basePoint = startPoint ? new THREE.Vector3(startPoint[0], startPoint[1], startPoint[2]) : camera.position.clone();
    const floorOrigin = new THREE.Vector3(basePoint.x, basePoint.y + 30, basePoint.z);
    floorRaycasterRef.current.set(floorOrigin, new THREE.Vector3(0, -1, 0));
    const floorHit = floorRaycasterRef.current
      .intersectObjects(scene.children, true)
      .find((hit) => hit.object.visible && hit.point.y <= basePoint.y + 0.5);
    camera.position.x = basePoint.x;
    camera.position.z = basePoint.z;
    camera.position.y = floorHit ? floorHit.point.y + height : Math.max(basePoint.y + height, height);
    console.log("[Walk Mode Check] walk controls mounted", {
      before: before.toArray(),
      after: camera.position.toArray(),
      observerHeight: height,
      startPoint,
      floorY: floorHit?.point.y ?? null,
      pointerLockActive: typeof document !== "undefined" ? !!document.pointerLockElement : false,
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const keys = keysRef.current;
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.forward = true;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.backward = true;
      if (event.code === "KeyA" || event.code === "ArrowLeft") keys.left = true;
      if (event.code === "KeyD" || event.code === "ArrowRight") keys.right = true;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.sprint = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const keys = keysRef.current;
      if (event.code === "KeyW" || event.code === "ArrowUp") keys.forward = false;
      if (event.code === "KeyS" || event.code === "ArrowDown") keys.backward = false;
      if (event.code === "KeyA" || event.code === "ArrowLeft") keys.left = false;
      if (event.code === "KeyD" || event.code === "ArrowRight") keys.right = false;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") keys.sprint = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [camera, height, scene, startPoint]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls?.isLocked) return;

    const keys = keysRef.current;
    const { forward, right, velocity } = moveRef.current;
    velocity.set(0, 0, 0);

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    if (keys.forward) velocity.add(forward);
    if (keys.backward) velocity.sub(forward);
    if (keys.right) velocity.add(right);
    if (keys.left) velocity.sub(right);
    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar((keys.sprint ? 8 : 4) * delta);
      camera.position.add(velocity);
      camera.position.y = Math.max(height, camera.position.y);
    }
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      makeDefault
      selector=".map3d-walk-lock-target"
      onLock={() => console.log("[Walk Mode Check] pointer lock captured", {
        cameraPosition: camera.position.toArray(),
      })}
      onUnlock={() => {
        console.log("[Walk Mode Check] pointer lock released", {
          cameraPosition: camera.position.toArray(),
        });
        onExit();
      }}
    />
  );
}

function WalkMeshInspector({
  enabled,
  panelOpen,
  onClosePanel,
  onInspect,
}: {
  enabled: boolean;
  panelOpen: boolean;
  onClosePanel: () => void;
  onInspect: (mesh: THREE.Mesh) => void;
}) {
  const { camera, scene } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const centerRef = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || event.repeat) return;
      const pointerLockActive = typeof document !== "undefined" && !!document.pointerLockElement;
      console.log("[Walk Inspect Check] key E pressed", { pointerLockActive });
      if (!pointerLockActive) {
        return;
      }
      event.preventDefault();

      if (panelOpen) {
        console.log("[Walk Inspect Check] key E closed panel");
        onClosePanel();
        return;
      }

      const visibleMeshes: THREE.Object3D[] = [];
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.visible) {
          visibleMeshes.push(child);
        }
      });

      raycasterRef.current.setFromCamera(centerRef.current, camera);
      const [hit] = raycasterRef.current.intersectObjects(visibleMeshes, true);
      console.log("[Walk Inspect Check] raycast executed", {
        visibleMeshes: visibleMeshes.length,
        hit: hit?.object ? {
          name: hit.object.name,
          layerKey: (hit.object as any).userData?.obramapLayerKey,
        } : null,
      });
      if (!hit?.object || !(hit.object as THREE.Mesh).isMesh) return;

      onInspect(hit.object as THREE.Mesh);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [camera, enabled, onClosePanel, onInspect, panelOpen, scene]);

  return null;
}

// Camera auto-fit
function AutoFitCamera({ 
  fitTrigger, resetTrigger, savedPosition, savedTarget, onCameraChange, sceneReady, enabled = true
}: {
  fitTrigger: number; resetTrigger: number;
  savedPosition?: [number, number, number] | null; savedTarget?: [number, number, number] | null;
  onCameraChange?: (pos: [number, number, number], tgt: [number, number, number]) => void;
  sceneReady: boolean;
  enabled?: boolean;
}) {
  const { camera, scene } = useThree();
  const controls = useThree((s) => s.controls) as any;
  const hasAutoFitRef = useRef(false);

  const doFit = useCallback(() => {
    if (!controls) return false;
    const box = new THREE.Box3();
    let found = false;
    scene.traverse((child: any) => {
      if ((child as THREE.Mesh).isMesh || (child as THREE.LineSegments).isLineSegments) {
        box.expandByObject(child);
        found = true;
      }
    });
    if (!found || box.isEmpty()) return false;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return false;
    
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6;
    
    camera.position.set(center.x + dist * 0.5, center.y + dist * 0.7, center.z + dist * 0.5);
    if (controls.target) {
      controls.target.copy(center);
      controls.minDistance = 0;
      controls.maxDistance = Infinity;
      controls.update();
    }
    
    onCameraChange?.([camera.position.x, camera.position.y, camera.position.z], [center.x, center.y, center.z]);
    console.log('[3D] Camera fit: dist=', dist, 'center=', center.toArray(), 'size=', size.toArray());
    return true;
  }, [camera, scene, controls, onCameraChange]);

  // Auto-fit when scene becomes ready - ALWAYS fit to model bounds
  useEffect(() => {
    if (!enabled || !sceneReady || hasAutoFitRef.current || !controls) return;
    hasAutoFitRef.current = true;
    
    // Always fit to model - saved positions may be stale/wrong
    let attempts = 0;
    const tryFit = () => {
      if (doFit()) return;
      attempts++;
      if (attempts < 30) requestAnimationFrame(tryFit);
    };
    tryFit();
  }, [enabled, sceneReady, controls, camera, doFit]);

  // Fit trigger
  useEffect(() => {
    if (!enabled || fitTrigger <= 0) return;
    let attempts = 0;
    const tryFit = () => { if (!doFit() && attempts++ < 15) requestAnimationFrame(tryFit); };
    tryFit();
  }, [enabled, fitTrigger, doFit]);

  // Reset trigger
  useEffect(() => {
    if (!enabled || resetTrigger <= 0 || !controls) return;
    if (savedPosition && savedTarget) {
      camera.position.set(savedPosition[0], savedPosition[1], savedPosition[2]);
      controls.target?.set(savedTarget[0], savedTarget[1], savedTarget[2]);
      controls.update();
    } else { doFit(); }
  }, [enabled, resetTrigger, savedPosition, savedTarget, controls, camera, doFit]);

  // Track camera changes
  useEffect(() => {
    if (!controls) return;
    const h = () => {
      if (onCameraChange && controls.target) {
        onCameraChange([camera.position.x, camera.position.y, camera.position.z], [controls.target.x, controls.target.y, controls.target.z]);
      }
    };
    controls.addEventListener?.('end', h);
    return () => controls.removeEventListener?.('end', h);
  }, [camera, controls, onCameraChange]);

  return null;
}

// Scene
function Scene({ modelData, markers, selectedMarkerId, onMarkerClick, customLegendItems,
  resetTrigger, fitTrigger, savedPosition, savedTarget, onCameraChange, sceneReady, onModelLoaded, onSceneReady,
  orbitFocusPoint, onMeshClick, onMeshDoubleClick, onMeshHover, onMeshHoverEnd, selectedMeshKey, selectedMeshKeys, projectId, companyId, ifcRealModeActive, ifcHouseOptions, ifcServiceOptions,
  cameraMode, walkInspectOpen, onWalkExit, onWalkInspectClose, onWalkMeshInspect,
  supplementalGlbParts, onSupplementalMeshClick, onSupplementalMeshDoubleClick, onSupplementalMeshHover, onSupplementalMeshHoverEnd, onSupplementalSceneReady, onSupplementalInventoryReady,
  observerHeight, walkStartPoint, performanceMode, zoomSpeed,
  lightingMode,
}: {
  modelData: ModelData | null; markers: HouseMarker[]; selectedMarkerId: number | null;
  onMarkerClick: (m: HouseMarker) => void; customLegendItems: any[];
  resetTrigger: number; fitTrigger: number;
  savedPosition?: [number, number, number] | null; savedTarget?: [number, number, number] | null;
  onCameraChange?: (p: [number, number, number], t: [number, number, number]) => void;
  sceneReady: boolean; onModelLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  orbitFocusPoint?: [number, number, number] | null;
  zoomSpeed: number;
  onMeshClick?: (mesh: THREE.Object3D, point?: THREE.Vector3, event?: any) => void;
  onMeshDoubleClick?: (mesh: THREE.Object3D, point?: THREE.Vector3) => void;
  onMeshHover?: (mesh: THREE.Object3D, event: any) => void;
  onMeshHoverEnd?: () => void;
  selectedMeshKey?: string | null;
  selectedMeshKeys?: Set<string>;
  projectId?: string | null;
  companyId?: string | null;
  ifcRealModeActive?: boolean;
  ifcHouseOptions?: number[];
  ifcServiceOptions?: ServiceOption[];
  cameraMode: "orbit" | "walk";
  walkInspectOpen: boolean;
  onWalkExit: () => void;
  onWalkInspectClose: () => void;
  onWalkMeshInspect?: (mesh: THREE.Mesh) => void;
  supplementalGlbParts: SupplementalGlbPart[];
  onSupplementalMeshClick?: (part: SupplementalGlbPart, mesh: THREE.Object3D, point?: THREE.Vector3, event?: any) => void;
  onSupplementalMeshDoubleClick?: (part: SupplementalGlbPart, mesh: THREE.Object3D, point?: THREE.Vector3) => void;
  onSupplementalMeshHover?: (part: SupplementalGlbPart, mesh: THREE.Object3D, event: any) => void;
  onSupplementalMeshHoverEnd?: () => void;
  onSupplementalSceneReady?: (part: SupplementalGlbPart, scene: THREE.Object3D) => void;
  onSupplementalInventoryReady?: (part: SupplementalGlbPart, meshes: GlbMeshInventoryInput[]) => void;
  observerHeight: number;
  walkStartPoint?: [number, number, number] | null;
  performanceMode: boolean;
  lightingMode: LightingMode;
}) {
  const isNight = lightingMode === "night";
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={50} near={0.05} far={5000} />
      <AutoFitCamera fitTrigger={fitTrigger} resetTrigger={resetTrigger}
        savedPosition={savedPosition} savedTarget={savedTarget}
        onCameraChange={onCameraChange} sceneReady={sceneReady} enabled={cameraMode === "orbit"} />
      {cameraMode === "orbit" ? <ZoomToMouseControls focusPoint={orbitFocusPoint} zoomSpeed={zoomSpeed} /> : <WalkControls onExit={onWalkExit} height={observerHeight} startPoint={walkStartPoint} />}
      <WalkMeshInspector
        enabled={cameraMode === "walk"}
        panelOpen={walkInspectOpen}
        onClosePanel={onWalkInspectClose}
        onInspect={(mesh) => onWalkMeshInspect?.(mesh)}
      />
      <color attach="background" args={[isNight ? "#07111f" : "#d8ecff"]} />
      <ambientLight intensity={isNight ? 0.82 : 0.72} color={isNight ? "#d8e8ff" : "#ffffff"} />
      <directionalLight
        position={isNight ? [-12, 18, -8] : [10, 10, 5]}
        intensity={isNight ? 0.52 : 0.9}
        color={isNight ? "#b8d6ff" : "#ffffff"}
        castShadow={!performanceMode && !isNight}
      />
      <directionalLight
        position={isNight ? [8, 8, 10] : [-10, 10, -5]}
        intensity={isNight ? 0.32 : 0.45}
        color={isNight ? "#eef6ff" : "#ffffff"}
      />
      <hemisphereLight
        args={isNight ? ["#92bfff", "#35435c", 0.78] : ["#bfe3ff", "#6f8f6b", 0.55]}
      />

      {modelData && (
        <Suspense fallback={<Html center><div className="bg-background/90 px-4 py-2 rounded-lg border border-border">Carregando modelo...</div></Html>}>
          {modelData.type === "gltf" ? (
            <GLTFModel url={modelData.url} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} onMeshDoubleClick={onMeshDoubleClick} onMeshHover={onMeshHover} onMeshHoverEnd={onMeshHoverEnd} selectedMeshKey={selectedMeshKey} selectedMeshKeys={selectedMeshKeys} />
          ) : modelData.type === "ifc" ? (
            <IFCModel url={modelData.url} projectId={projectId} companyId={companyId} ifcRealModeActive={ifcRealModeActive} houseOptions={ifcHouseOptions} serviceOptions={ifcServiceOptions} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
          ) : (
            <OBJModel url={modelData.url} mtlUrl={modelData.mtlUrl} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} onMeshDoubleClick={onMeshDoubleClick} onMeshHover={onMeshHover} onMeshHoverEnd={onMeshHoverEnd} selectedMeshKey={selectedMeshKey} selectedMeshKeys={selectedMeshKeys} />
          )}
        </Suspense>
      )}

      {supplementalGlbParts.filter((part) => part.visible).map((part) => (
        <Suspense key={part.id} fallback={null}>
          <SupplementalGLTFPart
            part={part}
            onMeshClick={onSupplementalMeshClick}
            onMeshDoubleClick={onSupplementalMeshDoubleClick}
            onMeshHover={onSupplementalMeshHover}
            onMeshHoverEnd={onSupplementalMeshHoverEnd}
            onSceneReady={onSupplementalSceneReady}
            onInventoryReady={onSupplementalInventoryReady}
            selectedMeshKey={selectedMeshKey}
            selectedMeshKeys={selectedMeshKeys}
          />
        </Suspense>
      ))}

      {markers.map((m) => (
        <HouseMarker3D key={m.id} marker={m} onClick={() => onMarkerClick(m)}
          isSelected={selectedMarkerId === m.id} customLegendItems={customLegendItems} />
      ))}
    </>
  );
}

// House details panel
function HouseDetailsPanel({ marker, onClose, customLegendItems, onOpenPhotoHistory }: { marker: HouseMarker; onClose: () => void; customLegendItems: any[]; onOpenPhotoHistory?: () => void }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggle = (id: string) => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const color = (p: number) => {
    if (p === 0) return "hsl(var(--muted))";
    for (const i of [...customLegendItems].sort((a, b) => a.minPercent - b.minPercent))
      if (p >= i.minPercent && p <= i.maxPercent) return i.color;
    return p < 50 ? "hsl(0,84%,60%)" : p < 100 ? "hsl(45,93%,47%)" : "hsl(142,71%,45%)";
  };
  return (
    <Card className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-hidden z-10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Casa {marker.houseNumber}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto max-h-[400px]">
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Progresso Geral</span><span className="font-medium">{marker.progress.toFixed(1)}%</span></div>
          <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${marker.progress}%`, backgroundColor: color(marker.progress) }} /></div>
        </div>
        {marker.macros?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Etapas</h4>
            {marker.macros.map((macro: any) => (
              <Collapsible key={macro.id} open={expanded.includes(macro.id)} onOpenChange={() => toggle(macro.id)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    {expanded.includes(macro.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div className="flex-1 text-left">
                      <div className="flex justify-between items-center"><span className="text-sm font-medium">{macro.name}</span><span className="text-xs text-muted-foreground">{macro.progress?.toFixed(0) || 0}%</span></div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1"><div className="h-full rounded-full transition-all" style={{ width: `${macro.progress || 0}%`, backgroundColor: color(macro.progress || 0) }} /></div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-6 space-y-1">
                    {macro.scopes?.map((s: any) => (
                      <div key={s.id} className="p-2 rounded-lg bg-muted/30">
                        <div className="flex justify-between items-center"><span className="text-xs">{s.name}</span><span className="text-xs text-muted-foreground">{s.percentage || 0}%</span></div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden mt-1"><div className="h-full rounded-full transition-all" style={{ width: `${s.percentage || 0}%`, backgroundColor: color(s.percentage || 0) }} /></div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
        {onOpenPhotoHistory && (
          <Button variant="outline" size="sm" className="w-full" onClick={onOpenPhotoHistory}>
            <Camera className="h-4 w-4 mr-1.5" />
            Histórico fotográfico
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function HouseWalkInspectPanel({
  inspection,
  meshData,
  house,
  macrosTemplate,
  customLegendItems,
  onClose,
  onOpenDiary,
  onOpenProduction,
  onOpenHistory,
}: {
  inspection: WalkInspection;
  meshData: ProjectModelMesh | null;
  house: any | null;
  macrosTemplate?: any[];
  customLegendItems: any[];
  onClose: () => void;
  onOpenDiary: () => void;
  onOpenProduction: () => void;
  onOpenHistory: () => void;
}) {
  const color = (progress: number) => {
    if (progress === 0) return "hsl(var(--muted))";
    for (const item of [...customLegendItems].sort((a, b) => a.minPercent - b.minPercent)) {
      if (progress >= item.minPercent && progress <= item.maxPercent) return item.color;
    }
    return progress < 50 ? "hsl(0,84%,60%)" : progress < 100 ? "hsl(45,93%,47%)" : "hsl(142,71%,45%)";
  };

  const macroSummaries = useMemo(() => {
    if (!house?.macros?.length) return [];
    return house.macros.map((macro: any) => {
      const scopes = Array.isArray(macro.scopes) ? macro.scopes : [];
      const totalWeight = scopes.reduce((sum: number, scope: any) => sum + (Number(scope.weight) || 0), 0);
      const progress = totalWeight > 0
        ? Math.round(scopes.reduce((sum: number, scope: any) => sum + (Number(scope.progress) || 0) * (Number(scope.weight) || 0), 0) / totalWeight)
        : Math.round(scopes.reduce((sum: number, scope: any) => sum + (Number(scope.progress) || 0), 0) / (scopes.length || 1));
      return { ...macro, progress };
    });
  }, [house]);

  const overallProgress = house ? calculateHouseProgress(house, macrosTemplate) : 0;
  const currentMacro = macroSummaries.find((macro: any) => macro.progress > 0 && macro.progress < 100)
    ?? [...macroSummaries].reverse().find((macro: any) => macro.progress > 0)
    ?? macroSummaries[0]
    ?? null;
  const clickedMacro = macroSummaries.find((macro: any) => macro.id === meshData?.service_macro_id) ?? null;
  const clickedScope = clickedMacro?.scopes?.find((scope: any) => scope.id === meshData?.service_scope_id) ?? null;
  const serviceRows = macroSummaries
    .flatMap((macro: any) => (macro.scopes ?? []).map((scope: any) => ({ macro, scope })))
    .filter(({ scope }: any) => Number(scope.progress) > 0 || scope.id === meshData?.service_scope_id)
    .slice(0, 8);

  return (
    <Card className="absolute right-4 top-4 z-30 w-[360px] max-h-[calc(100%-2rem)] overflow-hidden border-primary/20 bg-background/95 shadow-xl backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{house ? `Casa ${house.id}` : "Mesh sem vínculo de casa"}</CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {house ? "Inspeção no modo Caminhar" : "Vincule esta mesh no modo Revisão"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[70vh] space-y-4 overflow-y-auto">
        {!house ? (
          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium text-foreground">Mesh sem vínculo de casa</p>
            <p className="mt-1 text-xs text-muted-foreground">Vincule esta mesh no modo Revisão para que ela abra o painel da casa.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso geral</span>
                <span className="font-semibold">{overallProgress}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all" style={{ width: `${overallProgress}%`, backgroundColor: color(overallProgress) }} />
              </div>
              {currentMacro && (
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                  <span className="text-muted-foreground">Etapa atual</span>
                  <span className="font-medium">{currentMacro.name} · {currentMacro.progress}%</span>
                </div>
              )}
            </div>

            {clickedMacro && clickedScope && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Serviço clicado</p>
                <p className="mt-1 font-medium">{clickedMacro.name} → {clickedScope.name}</p>
                <p className="text-xs text-muted-foreground">{Number(clickedScope.progress) || 0}% concluído</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Resumo de serviços</p>
              {serviceRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum serviço com avanço registrado nesta casa.</p>
              ) : (
                serviceRows.map(({ macro, scope }: any) => (
                  <div key={`${macro.id}:${scope.id}`} className="space-y-1 rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">{macro.name} → {scope.name}</span>
                      <span className="font-medium">{Number(scope.progress) || 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${Number(scope.progress) || 0}%`, backgroundColor: color(Number(scope.progress) || 0) }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onOpenDiary}>Ver diário</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onOpenProduction}>Ver produção</Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]" onClick={onOpenHistory}>Ver histórico</Button>
            </div>
          </>
        )}

        <div className="space-y-1 rounded-md bg-muted/40 p-2 text-[10px] text-muted-foreground">
          <p className="font-mono">layer_key: {inspection.layerKey}</p>
          <p>mesh: {meshData?.mesh_name || inspection.meshName || "—"}</p>
          <p>material: {meshData?.material_name || inspection.materialName || "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function Map3DView() {
  const { currentProject, refreshHousesFromDB } = useConstruction();
  const navigate = useNavigate();
  const { profile, user, canEdit, canAccessManagement } = useAuth();
  const projectId = currentProject?.id;
  const companyId = (currentProject as any)?.company_id || profile?.company_id || null;
  const canUseMap3D = useCallback((action: Parameters<typeof canUseMap3DAction>[1]) => (
    canUseMap3DAction(profile, action, canAccessManagement)
  ), [canAccessManagement, profile]);
  const canImportMainModel = canUseMap3D("map3d.import_main_model");
  const canAddGlbPart = canUseMap3D("map3d.add_glb_part");
  const canManageLayers = canUseMap3D("map3d.manage_layers");
  const canLinkServices = canUseMap3D("map3d.link_services");
  const canAssignHouses = canUseMap3D("map3d.assign_houses");
  const canReviewModel = canUseMap3D("map3d.review_model");
  const canUseSmartLink = canUseMap3D("map3d.smartlink");
  const canSync3DReal = canUseMap3D("map3d.sync_real");
  const canView3DReal = canUseMap3D("map3d.view_real");
  const canViewSimulation = canUseMap3D("map3d.view_simulation");
  const canResetMap = canUseMap3D("map3d.reset_map");
  const canSaveMap = canUseMap3D("map3d.save_map");
  const canManageGlbParts = canUseMap3D("map3d.manage_glb_parts");
  const canUseWalkMode = canUseMap3D("map3d.walk_mode");
  const canChangeZoomSensitivity = canUseMap3D("map3d.change_zoom_sensitivity");
  const canUsePerformanceMode = canUseMap3D("map3d.performance_mode");
  const canManage3D = canReviewModel;
  const canDelete3D = canDelete3DAssets(profile) || canResetMap || canManageGlbParts;
  
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [supplementalGlbParts, setSupplementalGlbParts] = useState<SupplementalGlbPart[]>([]);
  const [markers, setMarkers] = useState<HouseMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<HouseMarker | null>(null);
  const [photoHistoryOpen, setPhotoHistoryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [savedPos, setSavedPos] = useState<[number, number, number] | null>(null);
  const [savedTgt, setSavedTgt] = useState<[number, number, number] | null>(null);
  const [pendingPos, setPendingPos] = useState<[number, number, number] | null>(null);
  const [pendingTgt, setPendingTgt] = useState<[number, number, number] | null>(null);
  const [orbitFocusPoint, setOrbitFocusPoint] = useState<[number, number, number] | null>(null);
  const [observerHeight, setObserverHeight] = useState(() => {
    const saved = Number(localStorage.getItem("obramap:map3d:observer-height"));
    return Number.isFinite(saved) && saved >= 1.2 && saved <= 2.2 ? saved : 1.7;
  });
  const [performanceMode, setPerformanceMode] = useState(() => localStorage.getItem("obramap:map3d:performance-mode") !== "false");
  const [lightingMode, setLightingMode] = useState<LightingMode>("day");
  const [zoomSensitivity, setZoomSensitivity] = useState<ZoomSensitivity>(() => {
    const saved = localStorage.getItem(MAP3D_ZOOM_SENSITIVITY_KEY);
    return ZOOM_SENSITIVITY_OPTIONS.some((option) => option.value === saved) ? saved as ZoomSensitivity : "normal";
  });
  const [supplementalPartsExpanded, setSupplementalPartsExpanded] = useState(() => localStorage.getItem("obramap:map3d:parts-expanded") === "true");
  const [walkStartPoint, setWalkStartPoint] = useState<[number, number, number] | null>(null);
  const [walkStartPickMode, setWalkStartPickMode] = useState(false);
  const [walkHelpVisible, setWalkHelpVisible] = useState(() => localStorage.getItem(MAP3D_WALK_HELP_HIDDEN_KEY) !== "true");
  const [walkHelpExpanded, setWalkHelpExpanded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [ifcSuggestionsOpen, setIfcSuggestionsOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  // Modo "Atribuir Casas" — clicar numa malha abre popover para batizá-la.
  const [assignMode, setAssignMode] = useState(false);
  const [pickedMesh, setPickedMesh] = useState<{
    name: string;
    groupName?: string;
    childMeshes: string[];
  } | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  // Modo "Revisar Modelo"
  const [reviewMode, setReviewMode] = useState(false);
  const [selectedMeshKey, setSelectedMeshKey] = useState<string | null>(null);
  const [multiSelectedMeshKeys, setMultiSelectedMeshKeys] = useState<Set<string>>(new Set());
  const [reviewLinksMode, setReviewLinksMode] = useState(false);
  const [reviewLinksFilter, setReviewLinksFilter] = useState<ReviewLinksFilter>("all");
  const [reviewLinkHoverTooltip, setReviewLinkHoverTooltip] = useState<ReviewLinkHoverTooltip>(null);
  const [hideLinkedInReview, setHideLinkedInReview] = useState(false);
  const [isolatedKeys, setIsolatedKeys] = useState<Set<string> | null>(null);
  const [meshReviewOverrides, setMeshReviewOverrides] = useState<Map<string, ProjectModelMesh>>(new Map());
  const [contextBulkAction, setContextBulkAction] = useState<GlbContextPresetKey | null>(null);
  const [contextPreview, setContextPreview] = useState<GlbContextPreview | null>(null);
  const [quickContextPanelOpen, setQuickContextPanelOpen] = useState(false);
  const [pendingGlbImport, setPendingGlbImport] = useState<{ file: File; existingGlbRecords: number } | null>(null);
  const [glbLinkScope, setGlbLinkScope] = useState<"preserve" | "fresh">("preserve");
  const [trustedGlbLinkKeys, setTrustedGlbLinkKeys] = useState<Set<string>>(new Set());
  const [smartLinkOpen, setSmartLinkOpen] = useState(false);
  const [smartLinkBase, setSmartLinkBase] = useState<GlbMeshRuntimeInfo | null>(null);
  const [smartLinkBaseKey, setSmartLinkBaseKey] = useState<string | null>(null);
  const [smartLinkCandidates, setSmartLinkCandidates] = useState<GlbSmartLinkCandidate[]>([]);
  const [smartLinkSelectedKeys, setSmartLinkSelectedKeys] = useState<Set<string>>(new Set());
  const [smartLinkPreviewEnabled, setSmartLinkPreviewEnabled] = useState(false);
  const [smartLinkPreviewBarOpen, setSmartLinkPreviewBarOpen] = useState(false);
  const [smartLinkPreviewMode, setSmartLinkPreviewMode] = useState<"show" | "isolate" | null>(null);
  const [smartLinkIsolationFilter, setSmartLinkIsolationFilter] = useState<SmartLinkIsolationFilter>("all");
  const [smartLinkFocusedCandidateKey, setSmartLinkFocusedCandidateKey] = useState<string | null>(null);
  const [smartLinkHoverTooltip, setSmartLinkHoverTooltip] = useState<SmartLinkHoverTooltip>(null);
  const [smartLinkApplying, setSmartLinkApplying] = useState(false);
  const reviewLinksHighlightRef = useRef<Array<{ mesh: THREE.Mesh; originalMaterial: THREE.Material | THREE.Material[] }>>([]);
  const smartLinkPreviewMaterialsRef = useRef<Array<{ mesh: THREE.Mesh; originalMaterial: THREE.Material | THREE.Material[] }>>([]);
  const smartLinkPreviewStateRef = useRef({
    isLoading: false,
    previewEnabled: false,
    previewBarOpen: false,
    dialogOpen: false,
    applying: false,
    selectedCount: 0,
    isolatedCount: 0,
    candidateCount: 0,
  });

  // Modo de visualização
  type ViewMode = "complete" | "real" | "simulation";
  const [viewMode, setViewMode] = useState<ViewMode>("complete");
  const [realServiceFilterOpen, setRealServiceFilterOpen] = useState(false);
  const [hiddenRealServiceKeys, setHiddenRealServiceKeys] = useState<Set<string>>(new Set());
  const [completeVisualResetNonce, setCompleteVisualResetNonce] = useState(0);
  type CameraMode = "orbit" | "walk";
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [walkInspection, setWalkInspection] = useState<WalkInspection | null>(null);
  const [walkHistoryOpen, setWalkHistoryOpen] = useState(false);
  const [walkHistoryHouseNumber, setWalkHistoryHouseNumber] = useState<number | null>(null);

  // Sincronização 3D Real
  const [isSyncing, setIsSyncing] = useState(false);
  interface SyncResult { total: number; visible: number; hidden: number; unlinked: number; syncedAt: Date; }
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cena ref para aplicar visibilidade fora do JSX
  const [sceneObj, setSceneObj] = useState<THREE.Object3D | null>(null);

  const clearMeshSelection = useCallback((reason = "manual") => {
    setSelectedMeshKey(null);
    setMultiSelectedMeshKeys(new Set());
    setIsolatedKeys(null);
    setSmartLinkFocusedCandidateKey(null);
    setSmartLinkHoverTooltip(null);
    setReviewLinkHoverTooltip(null);
    if (import.meta.env.DEV) {
      console.log("[Map3D Selection] cleared", { reason });
    }
  }, []);

  useEffect(() => {
    smartLinkPreviewStateRef.current = {
      isLoading,
      previewEnabled: smartLinkPreviewEnabled,
      previewBarOpen: smartLinkPreviewBarOpen,
      dialogOpen: smartLinkOpen,
      applying: smartLinkApplying,
      selectedCount: smartLinkSelectedKeys.size,
      isolatedCount: isolatedKeys?.size ?? 0,
      candidateCount: smartLinkCandidates.length,
    };
  }, [
    isLoading,
    isolatedKeys,
    smartLinkApplying,
    smartLinkOpen,
    smartLinkPreviewBarOpen,
    smartLinkPreviewEnabled,
    smartLinkCandidates.length,
    smartLinkSelectedKeys,
  ]);

  // Atribuição manual mesh→casa (persistida no banco) — fonte da verdade.
  const meshAssignments = useMeshHouseAssignments(projectId);
  const layerManager = useModelLayers(projectId, meshAssignments.assignmentMap);

  // Inventário de meshes do modelo
  const meshHooks = useProjectModelMeshes(projectId, {
    canWrite: canEdit && (
      canImportMainModel ||
      canManage3D ||
      canManageLayers ||
      canLinkServices ||
      canAssignHouses ||
      canSync3DReal
    ),
  });

  const sanitizeGlbMeshForCurrentModel = useCallback((mesh: ProjectModelMesh | null | undefined): ProjectModelMesh | null => {
    if (!mesh) return null;
    if (mesh.layer_key.startsWith("glbpart:")) return mesh;
    if (modelData?.type !== "gltf" || glbLinkScope === "preserve" || trustedGlbLinkKeys.has(mesh.layer_key)) return mesh;
    const hasPossiblyStaleState = mesh.assigned_house_number != null
      || mesh.service_macro_id != null
      || mesh.service_scope_id != null
      || mesh.ignored
      || mesh.production_visible
      || Number(mesh.progress_percent ?? 0) > 0;
    if (!hasPossiblyStaleState) return mesh;
    return {
      ...mesh,
      assigned_house_number: null,
      service_macro_id: null,
      service_scope_id: null,
      ignored: false,
      visible: true,
      production_visible: false,
      progress_percent: 0,
    };
  }, [glbLinkScope, modelData?.type, trustedGlbLinkKeys]);

  const getCurrentMeshRecord = useCallback((layerKey: string) => {
    const sessionSaved = meshReviewOverrides.get(layerKey);
    if (sessionSaved) return sessionSaved;
    return sanitizeGlbMeshForCurrentModel(meshHooks.meshMap.get(layerKey) ?? null);
  }, [meshHooks.meshMap, meshReviewOverrides, sanitizeGlbMeshForCurrentModel]);

  const multiReviewSelection = useMemo(() => (
    Array.from(multiSelectedMeshKeys).map((layerKey) => {
      const meshData = getCurrentMeshRecord(layerKey);
      return {
        layerKey,
        meshData,
        meshName: meshData?.mesh_name || layerKey,
      };
    })
  ), [getCurrentMeshRecord, multiSelectedMeshKeys]);

  const buildCurrentMeshMap = useCallback((sourceMap: Map<string, ProjectModelMesh>, includeSessionOverrides = true) => {
    const next = new Map<string, ProjectModelMesh>();
    sourceMap.forEach((mesh, key) => {
      const sanitized = sanitizeGlbMeshForCurrentModel(mesh);
      if (sanitized) next.set(key, sanitized);
    });
    if (includeSessionOverrides) {
      meshReviewOverrides.forEach((mesh, key) => {
        const fresh = next.get(key);
        if (!fresh) {
          next.set(key, mesh);
          return;
        }
        next.set(key, {
          ...mesh,
          production_visible: fresh.production_visible,
          progress_percent: fresh.progress_percent,
          last_synced_at: fresh.last_synced_at ?? mesh.last_synced_at,
        });
      });
    }
    return next;
  }, [meshReviewOverrides, sanitizeGlbMeshForCurrentModel]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supplementalGlbInputRef = useRef<HTMLInputElement>(null);
  const mtlInputRef = useRef<HTMLInputElement>(null);
  const [pendingObjFile, setPendingObjFile] = useState<File | null>(null);
  const supplementalGlbPartsRef = useRef<SupplementalGlbPart[]>([]);
  const supplementalGlbScenesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const supplementalInventoriedPartIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    supplementalGlbPartsRef.current = supplementalGlbParts;
  }, [supplementalGlbParts]);

  useEffect(() => {
    setOrbitFocusPoint(null);
  }, [modelData?.url, projectId]);

  useEffect(() => {
    localStorage.setItem("obramap:map3d:observer-height", observerHeight.toFixed(2));
  }, [observerHeight]);

  useEffect(() => {
    localStorage.setItem("obramap:map3d:performance-mode", String(performanceMode));
  }, [performanceMode]);

  const lightingModeStorageKey = useMemo(() => (
    projectId ? `obramap:map3d:${projectId}:lighting-mode` : "obramap:map3d:lighting-mode"
  ), [projectId]);

  useEffect(() => {
    const saved = localStorage.getItem(lightingModeStorageKey);
    setLightingMode(saved === "night" ? "night" : "day");
  }, [lightingModeStorageKey]);

  useEffect(() => {
    localStorage.setItem(lightingModeStorageKey, lightingMode);
  }, [lightingMode, lightingModeStorageKey]);

  useEffect(() => {
    localStorage.setItem(MAP3D_ZOOM_SENSITIVITY_KEY, zoomSensitivity);
  }, [zoomSensitivity]);

  useEffect(() => {
    localStorage.setItem("obramap:map3d:parts-expanded", String(supplementalPartsExpanded));
  }, [supplementalPartsExpanded]);

  useEffect(() => {
    if (!projectId) {
      setWalkStartPoint(null);
      return;
    }
    const raw = localStorage.getItem(`obramap:map3d:${projectId}:walk-start`);
    if (!raw) {
      setWalkStartPoint(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((value) => Number.isFinite(Number(value)))) {
        setWalkStartPoint([Number(parsed[0]), Number(parsed[1]), Number(parsed[2])]);
      } else {
        setWalkStartPoint(null);
      }
    } catch {
      setWalkStartPoint(null);
    }
  }, [projectId]);

  useEffect(() => {
    return () => {
      supplementalGlbPartsRef.current
        .filter((part) => !part.persisted)
        .forEach((part) => URL.revokeObjectURL(part.url));
      supplementalGlbPartsRef.current = [];
      supplementalGlbScenesRef.current.clear();
      supplementalInventoriedPartIdsRef.current.clear();
    };
  }, []);

  const clearSupplementalGlbPartsFromState = useCallback(() => {
    setSupplementalGlbParts((current) => {
      if (current.length === 0) return current;
      current
        .filter((part) => !part.persisted)
        .forEach((part) => URL.revokeObjectURL(part.url));
      supplementalGlbScenesRef.current.clear();
      supplementalInventoriedPartIdsRef.current.clear();
      return [];
    });
  }, []);

  const toSupplementalGlbPart = useCallback((row: any): SupplementalGlbPart => ({
    id: row.id,
    name: row.name || row.file_name || "Parte GLB",
    url: row.public_url,
    visible: true,
    persisted: true,
    fileName: row.file_name ?? null,
    storagePath: row.storage_path ?? null,
    partOrder: row.part_order ?? 0,
  }), []);

  const loadSupplementalGlbParts = useCallback(async () => {
    if (!projectId) {
      clearSupplementalGlbPartsFromState();
      return;
    }
    const { data, error } = await supabase
      .from("project_model_parts" as any)
      .select("id, name, file_name, storage_path, public_url, part_order, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("part_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GLB Parts] load error", error);
      toast.error("Nao foi possivel carregar partes GLB complementares.");
      return;
    }

    setSupplementalGlbParts((current) => {
      current
        .filter((part) => !part.persisted)
        .forEach((part) => URL.revokeObjectURL(part.url));
      const currentVisibility = new Map(current.map((part) => [part.id, part.visible]));
      supplementalGlbScenesRef.current.clear();
      supplementalInventoriedPartIdsRef.current.clear();
      return ((data || []) as any[]).map((row) => {
        const part = toSupplementalGlbPart(row);
        return { ...part, visible: currentVisibility.get(part.id) ?? true };
      });
    });
  }, [clearSupplementalGlbPartsFromState, projectId, toSupplementalGlbPart]);

  useEffect(() => {
    void loadSupplementalGlbParts();
  }, [loadSupplementalGlbParts]);

  const uploadFileTo3DStorage = async (file: File, folder: string): Promise<{ publicUrl: string; storagePath: string } | null> => {
    if (!projectId) return null;
    const companyId = profile?.company_id;
    if (!companyId) { toast.error("Empresa nao identificada para upload."); return null; }
    const safeName = sanitize3DStorageFileName(file.name);
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `${companyId}/${projectId}/${folder}/${uniquePrefix}-${safeName}`;

    if (import.meta.env.DEV) {
      console.info(folder === "gltf-parts" ? "[GLB Part Upload]" : "[3D Import]", {
        action: "upload-start",
        bucket: MAP3D_STORAGE_BUCKET,
        fileName: file.name,
        sanitizedName: safeName,
        storagePath: path,
      });
    }

    try {
      const { data, error } = await supabase.storage
        .from(MAP3D_STORAGE_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) {
        if (import.meta.env.DEV) {
          console.error(folder === "gltf-parts" ? "[GLB Part Upload]" : "[3D Import]", {
            action: "upload-error",
            bucket: MAP3D_STORAGE_BUCKET,
            storagePath: path,
            error,
          });
        }
        toast.error(`Upload falhou: ${error.message}`);
        return null;
      }

      const publicUrl = supabase.storage.from(MAP3D_STORAGE_BUCKET).getPublicUrl(data.path).data.publicUrl;
      if (!publicUrl) {
        toast.error("Upload concluido, mas nao foi possivel gerar a URL publica do modelo.");
        return null;
      }

      if (import.meta.env.DEV) {
        console.info(folder === "gltf-parts" ? "[GLB Part Upload]" : "[3D Import]", {
          action: "upload-success",
          bucket: MAP3D_STORAGE_BUCKET,
          storagePath: data.path,
          publicUrl,
        });
      }

      return { publicUrl, storagePath: data.path };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(folder === "gltf-parts" ? "[GLB Part Upload]" : "[3D Import]", {
          action: "upload-fetch-error",
          bucket: MAP3D_STORAGE_BUCKET,
          storagePath: path,
          error,
        });
      }
      toast.error("Upload falhou por erro de rede/CORS no Supabase Storage.");
      return null;
    }
  };

  const handleSupplementalGlbUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!canAddGlbPart) {
      toast.error("Sem permissao para adicionar parte GLB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".glb")) {
      toast.error("Selecione um arquivo .glb para adicionar como parte complementar.");
      return;
    }
    if (!projectId || !companyId) {
      toast.error("Projeto ou empresa nao identificados.");
      return;
    }

    setIsLoading(true);
    try {
      const upload = await uploadFileTo3DStorage(file, "gltf-parts");
      if (!upload) return;

      const nextOrder = supplementalGlbPartsRef.current.length > 0
        ? Math.max(...supplementalGlbPartsRef.current.map((part) => part.partOrder ?? 0)) + 1
        : 0;
      const displayName = file.name.replace(/\.[^/.]+$/, "") || file.name;

      const { data, error } = await supabase
        .from("project_model_parts" as any)
        .insert({
          project_id: projectId,
          company_id: companyId,
          name: displayName,
          file_name: file.name,
          storage_path: upload.storagePath,
          public_url: upload.publicUrl,
          model_type: "glb",
          part_order: nextOrder,
          is_active: true,
          is_primary: false,
          metadata: { source: "map3d_supplemental_part" },
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();

      if (error) {
        if (import.meta.env.DEV) {
          console.error("[GLB Part Upload]", {
            action: "insert-error",
            fileName: file.name,
            storagePath: upload.storagePath,
            publicUrl: upload.publicUrl,
            error,
          });
        }
        throw error;
      }

      const part = toSupplementalGlbPart(data);
      setSupplementalGlbParts((current) => [...current, part]);
      toast.success("Parte GLB complementar salva e carregada.");
    } catch (error) {
      console.error("[GLB Parts] add error", error);
      toast.error("Erro ao salvar parte GLB complementar.");
    } finally {
      setIsLoading(false);
    }
  }, [canAddGlbPart, companyId, projectId, toSupplementalGlbPart, user?.id]);

  const toggleSupplementalGlbPart = useCallback((id: string) => {
    if (!canManageGlbParts) {
      toast.error("Sem permissao para gerenciar partes GLB.");
      return;
    }
    if (selectedMeshKey?.startsWith(`glbpart:${id}:`)) {
      clearMeshSelection("supplemental part visibility toggled");
    }
    setSupplementalGlbParts((current) =>
      current.map((part) => part.id === id ? { ...part, visible: !part.visible } : part),
    );
  }, [canManageGlbParts, clearMeshSelection, selectedMeshKey]);

  const removeSupplementalGlbPart = useCallback(async (id: string) => {
    if (!canManageGlbParts) {
      toast.error("Sem permissao para gerenciar partes GLB.");
      return;
    }
    const part = supplementalGlbPartsRef.current.find((item) => item.id === id);
    if (!part) return;

    if (part.persisted) {
      const { error } = await supabase
        .from("project_model_parts" as any)
        .update({ is_active: false })
        .eq("id", id);
      if (error) {
        console.error("[GLB Parts] remove error", error);
        toast.error("Erro ao remover parte GLB complementar.");
        return;
      }
    } else {
      URL.revokeObjectURL(part.url);
    }

    if (selectedMeshKey?.startsWith(`glbpart:${id}:`)) {
      clearMeshSelection("supplemental part removed");
    }
    supplementalGlbScenesRef.current.delete(id);
    supplementalInventoriedPartIdsRef.current.delete(id);
    setSupplementalGlbParts((current) => current.filter((item) => item.id !== id));
    toast.success("Parte GLB complementar removida.");
  }, [canManageGlbParts, clearMeshSelection, selectedMeshKey]);

  const removeAllSupplementalGlbParts = useCallback(async () => {
    if (!canManageGlbParts) {
      toast.error("Sem permissao para gerenciar partes GLB.");
      return;
    }
    const parts = supplementalGlbPartsRef.current;
    if (parts.length === 0) return;

    const persistedIds = parts.filter((part) => part.persisted).map((part) => part.id);
    if (persistedIds.length > 0) {
      const { error } = await supabase
        .from("project_model_parts" as any)
        .update({ is_active: false })
        .in("id", persistedIds);
      if (error) {
        console.error("[GLB Parts] remove all error", error);
        toast.error("Erro ao remover partes GLB complementares.");
        return;
      }
    }

    parts
      .filter((part) => !part.persisted)
      .forEach((part) => URL.revokeObjectURL(part.url));
    supplementalGlbScenesRef.current.clear();
    supplementalInventoriedPartIdsRef.current.clear();
    clearMeshSelection("all supplemental parts removed");
    setSupplementalGlbParts([]);
    toast.success("Partes GLB complementares removidas.");
  }, [clearMeshSelection]);

  const handleSupplementalSceneReady = useCallback((part: SupplementalGlbPart, scene: THREE.Object3D) => {
    supplementalGlbScenesRef.current.set(part.id, scene);
  }, []);

  const handleSupplementalInventoryReady = useCallback((part: SupplementalGlbPart, meshes: GlbMeshInventoryInput[]) => {
    if (!part.persisted || meshes.length === 0) return;
    if (supplementalInventoriedPartIdsRef.current.has(part.id)) return;
    supplementalInventoriedPartIdsRef.current.add(part.id);
    if (import.meta.env.DEV) {
      console.log("[GLB Part Link Persistence Debug]", {
        action: "inventory-ready",
        part_id: part.id,
        file_name: part.fileName ?? part.name,
        meshCount: meshes.length,
        sample: meshes.slice(0, 10),
      });
    }
    void meshHooks.bulkUpsertMeshes(meshes).catch((error) => {
      supplementalInventoriedPartIdsRef.current.delete(part.id);
      console.error("[GLB Parts] inventory error", error);
      toast.error("Erro ao inventariar parte GLB complementar.");
    });
  }, [meshHooks.bulkUpsertMeshes]);

  const auditGlbMeshParts = useCallback(() => {
    type MeshAuditRow = {
      originId: string;
      originLabel: string;
      meshName: string;
      materialName: string;
      localLayerKey: string;
    };

    const rows: MeshAuditRow[] = [];
    const collectMeshes = (originId: string, originLabel: string, root: THREE.Object3D | null | undefined) => {
      if (!root) return;
      const nameCounts = new Map<string, number>();
      root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const meshName = mesh.name || "mesh";
        const occurrence = nameCounts.get(meshName) ?? 0;
        nameCounts.set(meshName, occurrence + 1);
        rows.push({
          originId,
          originLabel,
          meshName,
          materialName: getMeshMaterialName(mesh),
          localLayerKey: `glb:${meshName}:${occurrence}`,
        });
      });
    };

    collectMeshes("principal", "principal", sceneObj);
    supplementalGlbParts
      .filter((part) => part.visible)
      .forEach((part) => {
        collectMeshes(part.id, part.name, supplementalGlbScenesRef.current.get(part.id));
      });

    const byOrigin = new Map<string, { label: string; totalMeshes: number; materialCounts: Map<string, number>; nameCounts: Map<string, number> }>();
    const localKeyOrigins = new Map<string, Set<string>>();
    const localKeyRows = new Map<string, MeshAuditRow[]>();

    rows.forEach((row) => {
      const origin = byOrigin.get(row.originId) ?? {
        label: row.originLabel,
        totalMeshes: 0,
        materialCounts: new Map<string, number>(),
        nameCounts: new Map<string, number>(),
      };
      origin.totalMeshes += 1;
      origin.materialCounts.set(row.materialName || "(sem material)", (origin.materialCounts.get(row.materialName || "(sem material)") ?? 0) + 1);
      origin.nameCounts.set(row.meshName || "(sem nome)", (origin.nameCounts.get(row.meshName || "(sem nome)") ?? 0) + 1);
      byOrigin.set(row.originId, origin);

      const origins = localKeyOrigins.get(row.localLayerKey) ?? new Set<string>();
      origins.add(row.originId);
      localKeyOrigins.set(row.localLayerKey, origins);
      const keyRows = localKeyRows.get(row.localLayerKey) ?? [];
      keyRows.push(row);
      localKeyRows.set(row.localLayerKey, keyRows);
    });

    const duplicatedNamesByOrigin = Array.from(byOrigin.entries()).map(([originId, data]) => ({
      originId,
      origin: data.label,
      duplicatedNames: Array.from(data.nameCounts.entries())
        .filter(([, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count })),
    }));

    const localLayerKeyCollisionsAcrossOrigins = Array.from(localKeyOrigins.entries())
      .filter(([, origins]) => origins.size > 1)
      .map(([localLayerKey, origins]) => ({
        localLayerKey,
        origins: Array.from(origins).map((originId) => byOrigin.get(originId)?.label ?? originId),
        count: localKeyRows.get(localLayerKey)?.length ?? 0,
      }));

    const materialCounts = new Map<string, number>();
    rows.forEach((row) => {
      const material = row.materialName || "(sem material)";
      materialCounts.set(material, (materialCounts.get(material) ?? 0) + 1);
    });

    const auditResult = {
      totalMeshes: rows.length,
      byOrigin: Array.from(byOrigin.entries()).map(([originId, data]) => ({
        originId,
        origin: data.label,
        totalMeshes: data.totalMeshes,
        topMaterials: Array.from(data.materialCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([materialName, count]) => ({ materialName, count })),
      })),
      duplicatedNamesByOrigin,
      localLayerKeyCollisionsAcrossOrigins,
      topMaterials: Array.from(materialCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([materialName, count]) => ({ materialName, count })),
      sampleCollisions: localLayerKeyCollisionsAcrossOrigins.slice(0, 20).map((collision) => ({
        ...collision,
        samples: (localKeyRows.get(collision.localLayerKey) ?? []).map((row) => ({
          origin: row.originLabel,
          meshName: row.meshName,
          materialName: row.materialName,
        })),
      })),
      productiveKeyPolicy: "Partes persistidas usam glbpart:<part_id>:<localLayerKey>, eliminando colisao produtiva para vinculos manuais e 3D Real basico.",
      warning: "Conflitos locais ainda impedem SmartLink entre partes diferentes; o SmartLink fica limitado a mesma parte GLB.",
    };

    console.log("[GLB Parts Mesh Audit]", auditResult);
    console.table(auditResult.localLayerKeyCollisionsAcrossOrigins.slice(0, 30));
    toast.info(
      auditResult.localLayerKeyCollisionsAcrossOrigins.length > 0
        ? `Auditoria concluida: ${auditResult.totalMeshes} meshes, ${auditResult.localLayerKeyCollisionsAcrossOrigins.length} conflitos entre partes.`
        : `Auditoria concluida: ${auditResult.totalMeshes} meshes, nenhum conflito local encontrado.`,
    );
  }, [sceneObj, supplementalGlbParts]);

  const handleCameraChange = useCallback((p: [number, number, number], t: [number, number, number]) => {
    setPendingPos(p); setPendingTgt(t);
  }, []);

  useEffect(() => {
    if (canManage3D) return;
    setAssignMode(false);
    setReviewMode(false);
    setIfcSuggestionsOpen(false);
    setPickedMesh(null);
    clearMeshSelection("3D permission lost");
  }, [canManage3D, clearMeshSelection]);

  const handleModelLoaded = useCallback(() => {
    console.log('[3D] Model geometry loaded in scene');
    setSceneReady(true);
  }, []);

  // Inventário automático: extrai todas as meshes para o banco.
  const handleSceneReady = useCallback(async (scene: THREE.Object3D) => {
    setSceneObj(scene);
    layerManager.extractLayers(scene);
    console.log('[3D] Layers extracted from model');

    if (!projectId) return;
    const meshesToUpsert: { layer_key: string; mesh_name: string; material_name: string; detected_house_number: number | null }[] = [];
    const nameCounts = new Map<string, number>();
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const meshName = mesh.name || "mesh";
      const occurrence = nameCounts.get(meshName) ?? 0;
      nameCounts.set(meshName, occurrence + 1);
      const layerKey = getLocalGlbLayerKey(meshName, occurrence);
      mesh.userData.obramapLayerKey = layerKey;
      const materialName = Array.isArray(mesh.material)
        ? mesh.material.map((m: any) => m.name).filter(Boolean).join(", ")
        : (mesh.material as any)?.name || "";
      meshesToUpsert.push({
        layer_key: layerKey,
        mesh_name: mesh.name || "",
        material_name: materialName,
        detected_house_number: parseHouseNumberFromMesh(mesh.name || ""),
      });
    });
    if (import.meta.env.DEV) {
      const watchedKeys = meshesToUpsert.filter((mesh) =>
        mesh.layer_key.includes("Geom3D_302") || mesh.layer_key.includes("Geom3D_303"),
      );
      const duplicateNames = Array.from(nameCounts.entries())
        .filter(([, count]) => count > 1)
        .slice(0, 20)
        .map(([name, count]) => ({ name, count }));
      console.log("[GLB Mesh Link] scene keys registered", {
        count: meshesToUpsert.length,
        sample: meshesToUpsert.slice(0, 5),
      });
      console.log("[GLB Mesh Link Check] scene keys registered", {
        watchedKeys,
        duplicateNames,
      });
      console.log("[GLB Import Safety] current GLB inventory", {
        projectId,
        currentGlbMeshCount: meshesToUpsert.length,
        previousMeshMapRecords: meshHooks.meshMap.size,
      });
    }
    if (meshesToUpsert.length > 0) {
      void meshHooks.bulkUpsertMeshes(meshesToUpsert);
    }
  }, [layerManager.extractLayers, projectId, meshHooks.bulkUpsertMeshes]);

  // ====================================================
  // Modo "Revisar Modelo": clique destaca a mesh
  // ====================================================
  const focusOrbitOnPoint = useCallback((point?: THREE.Vector3 | null) => {
    if (!point) return;
    setOrbitFocusPoint([point.x, point.y, point.z]);
  }, []);

  const handleMeshDoubleClickFocus = useCallback((_obj: THREE.Object3D, point?: THREE.Vector3) => {
    focusOrbitOnPoint(point);
    if (point) toast.info("Ponto de rotacao fixado na peca.");
  }, [focusOrbitOnPoint]);

  const handleSupplementalMeshDoubleClickFocus = useCallback((_part: SupplementalGlbPart, _obj: THREE.Object3D, point?: THREE.Vector3) => {
    focusOrbitOnPoint(point);
    if (point) toast.info("Ponto de rotacao fixado na parte GLB.");
  }, [focusOrbitOnPoint]);

  const saveWalkStartPoint = useCallback((point: THREE.Vector3 | [number, number, number]) => {
    if (!projectId) return;
    const tuple: [number, number, number] = Array.isArray(point) ? point : [point.x, point.y, point.z];
    setWalkStartPoint(tuple);
    localStorage.setItem(`obramap:map3d:${projectId}:walk-start`, JSON.stringify(tuple));
    setWalkStartPickMode(false);
    toast.success("Ponto inicial do Caminhar definido.");
  }, [projectId]);

  const handleReviewMeshClick = useCallback((obj: THREE.Object3D, point?: THREE.Vector3, event?: any) => {
    if (!reviewMode) return;
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const supplementalLayerKey = typeof mesh.userData?.obramapLayerKey === "string" ? mesh.userData.obramapLayerKey : "";
    if (mesh.userData?.obramapSupplementalPart && !supplementalLayerKey.startsWith("glbpart:")) {
      toast.info("Parte complementar visual: vinculos serao suportados em etapa futura.");
      return;
    }
    const layerKey = getMeshLayerKey(mesh);
    if (import.meta.env.DEV) {
      const matchingKeys: string[] = [];
      sceneObj?.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const childMesh = child as THREE.Mesh;
        const childKey = getMeshLayerKey(childMesh);
        if (childKey.includes("Geom3D_302") || childKey.includes("Geom3D_303")) {
          matchingKeys.push(childKey);
        }
      });
      console.log("[GLB Mesh Link] review mesh selected", {
        selectedMeshKey: layerKey,
        meshUuid: mesh.uuid,
        meshName: obj.name || "",
        existingMesh: meshHooks.meshMap.get(layerKey) ?? null,
      });
      console.log("[GLB Mesh Link Check] review mesh selected", {
        selectedMeshKey: layerKey,
        meshUuid: mesh.uuid,
        meshName: obj.name || "",
        obramapLayerKey: mesh.userData?.obramapLayerKey ?? null,
        existingMesh: meshHooks.meshMap.get(layerKey) ?? null,
        watchedSceneKeys: matchingKeys,
        watchedMeshMap: Array.from(meshHooks.meshMap.values())
          .filter((item) => item.layer_key.includes("Geom3D_302") || item.layer_key.includes("Geom3D_303"))
          .map((item) => ({
            layer_key: item.layer_key,
            mesh_name: item.mesh_name,
            assigned_house_number: item.assigned_house_number,
            service_macro_id: item.service_macro_id,
            service_scope_id: item.service_scope_id,
            production_visible: item.production_visible,
            progress_percent: item.progress_percent,
          })),
      });
    }
    const sourceEvent = event?.nativeEvent ?? event;
    const isMultiSelectClick = !!(sourceEvent?.ctrlKey || sourceEvent?.metaKey);
    let nextSelectedKey: string | null = layerKey;
    if (isMultiSelectClick) {
      const next = new Set(multiSelectedMeshKeys);
      if (next.has(layerKey)) {
        next.delete(layerKey);
        nextSelectedKey = Array.from(next).at(-1) ?? null;
      } else {
        next.add(layerKey);
        nextSelectedKey = layerKey;
      }
      setMultiSelectedMeshKeys(next);
    } else {
      setMultiSelectedMeshKeys(new Set());
    }
    if (smartLinkPreviewEnabled) {
      const candidate = smartLinkCandidates.find((item) => item.layerKey === layerKey) ?? null;
      if (candidate) {
        setSmartLinkFocusedCandidateKey(layerKey);
        console.log("[GLB Smart Review]", {
          action: "focus-candidate",
          focusedCandidateKey: layerKey,
          status: candidate.status,
          suggestedHouseNumber: candidate.suggestedHouseNumber,
          selected: smartLinkSelectedKeys.has(layerKey),
          filterMode: smartLinkIsolationFilter,
        });
      } else {
        setSmartLinkFocusedCandidateKey(null);
      }
    }
    setSelectedMeshKey(nextSelectedKey);
  }, [meshHooks.meshMap, multiSelectedMeshKeys, reviewMode, sceneObj, smartLinkCandidates, smartLinkIsolationFilter, smartLinkPreviewEnabled, smartLinkSelectedKeys]);

  const handleSupplementalMeshClick = useCallback((part: SupplementalGlbPart, obj: THREE.Object3D, point?: THREE.Vector3, event?: any) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const layerKey = getMeshLayerKey(mesh);
    if (assignMode) {
      toast.info("Partes GLB complementares nao entram no modo Atribuir Casas nesta etapa.");
      return;
    }
    if (!reviewMode) return;
    if (!part.persisted || !layerKey.startsWith("glbpart:")) {
      toast.info("Parte complementar visual: vinculos serao suportados em etapa futura.");
      return;
    }
    if (import.meta.env.DEV) {
      console.log("[GLB Part Link Persistence Debug]", {
        action: "select-part-mesh",
        part_id: part.id,
        file_name: part.fileName ?? part.name,
        meshName: mesh.name || "",
        localLayerKey: mesh.userData?.obramapPartLocalLayerKey ?? null,
        layer_key: layerKey,
        meshMapFound: meshHooks.meshMap.has(layerKey),
        meshMapRecord: meshHooks.meshMap.get(layerKey) ?? null,
      });
    }
    const sourceEvent = event?.nativeEvent ?? event;
    const isMultiSelectClick = !!(sourceEvent?.ctrlKey || sourceEvent?.metaKey);
    let nextSelectedKey: string | null = layerKey;
    if (isMultiSelectClick) {
      const next = new Set(multiSelectedMeshKeys);
      if (next.has(layerKey)) {
        next.delete(layerKey);
        nextSelectedKey = Array.from(next).at(-1) ?? null;
      } else {
        next.add(layerKey);
        nextSelectedKey = layerKey;
      }
      setMultiSelectedMeshKeys(next);
    } else {
      setMultiSelectedMeshKeys(new Set());
    }
    setSmartLinkFocusedCandidateKey(null);
    setSelectedMeshKey(nextSelectedKey);
  }, [assignMode, meshHooks.meshMap, multiSelectedMeshKeys, reviewMode]);

  const handleSmartLinkCandidateHover = useCallback((obj: THREE.Object3D, event: any) => {
    if (!smartLinkPreviewEnabled || !(obj as THREE.Mesh).isMesh) return;
    const layerKey = getMeshLayerKey(obj as THREE.Mesh);
    const candidate = smartLinkCandidates.find((item) => item.layerKey === layerKey);
    if (!candidate) {
      setSmartLinkHoverTooltip(null);
      return;
    }
    const sourceEvent = event?.nativeEvent ?? event;
    setSmartLinkHoverTooltip({
      candidate,
      x: Number(sourceEvent?.clientX ?? 0),
      y: Number(sourceEvent?.clientY ?? 0),
    });
  }, [smartLinkCandidates, smartLinkPreviewEnabled]);

  const handleSupplementalSmartLinkCandidateHover = useCallback((_part: SupplementalGlbPart, obj: THREE.Object3D, event: any) => {
    handleSmartLinkCandidateHover(obj, event);
  }, [handleSmartLinkCandidateHover]);

  const clearSmartLinkCandidateHover = useCallback(() => {
    setSmartLinkHoverTooltip(null);
  }, []);

  const handleWalkStartPick = useCallback((obj: THREE.Object3D, point?: THREE.Vector3) => {
    if (!walkStartPickMode || !point) return;
    saveWalkStartPoint(point);
  }, [saveWalkStartPoint, walkStartPickMode]);

  const handleSupplementalWalkStartPick = useCallback((_part: SupplementalGlbPart, obj: THREE.Object3D, point?: THREE.Vector3) => {
    handleWalkStartPick(obj, point);
  }, [handleWalkStartPick]);

  const handleWalkMeshInspect = useCallback((mesh: THREE.Mesh) => {
    const layerKey = getMeshLayerKey(mesh);
    if (mesh.userData?.obramapSupplementalPart && !layerKey.startsWith("glbpart:")) {
      toast.info("Parte complementar visual: vinculos serao suportados em etapa futura.");
      return;
    }
    const meshData = getCurrentMeshRecord(layerKey);
    console.log("[Walk Inspect Check] mesh inspected", {
      meshName: mesh.name || "",
      layerKey,
      meshMapFound: !!meshData,
      assigned_house_number: meshData?.assigned_house_number ?? null,
      service_macro_id: meshData?.service_macro_id ?? null,
      service_scope_id: meshData?.service_scope_id ?? null,
      opensPanel: true,
      withoutHouseLink: meshData?.assigned_house_number == null,
    });
    setWalkInspection({
      layerKey,
      meshName: mesh.name || "",
      materialName: getMeshMaterialName(mesh),
    });
  }, [getCurrentMeshRecord]);

  const handleIsolate = useCallback((key: string) => {
    setIsolatedKeys(prev => (prev?.has(key) ? null : new Set([key])));
  }, []);

  const handleClearIsolation = useCallback(() => {
    setIsolatedKeys(null);
    clearMeshSelection("isolation cleared");
  }, [canManageGlbParts, clearMeshSelection]);

  // Lista de casas para o painel de revisão
  const exitWalkMode = useCallback(() => {
    setCameraMode("orbit");
    setWalkInspection(null);
    setWalkHelpExpanded(false);
  }, []);

  useEffect(() => {
    if (cameraMode !== "walk") {
      setWalkHelpExpanded(false);
      return;
    }
    if (!walkHelpVisible) return;
    setWalkHelpExpanded(true);
    const timer = window.setTimeout(() => {
      setWalkHelpExpanded(false);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [cameraMode, walkHelpVisible]);

  const hideWalkHelp = useCallback(() => {
    localStorage.setItem(MAP3D_WALK_HELP_HIDDEN_KEY, "true");
    setWalkHelpVisible(false);
    setWalkHelpExpanded(false);
  }, []);

  const showWalkHelp = useCallback(() => {
    localStorage.removeItem(MAP3D_WALK_HELP_HIDDEN_KEY);
    setWalkHelpVisible(true);
    setWalkHelpExpanded(true);
  }, []);

  const toggleWalkMode = useCallback(() => {
    setCameraMode((mode) => {
      const nextMode: CameraMode = mode === "walk" ? "orbit" : "walk";
      console.log("[Walk Mode Check] cameraMode toggle", { from: mode, to: nextMode });
      if (nextMode === "walk") {
        setAssignMode(false);
        setReviewMode(false);
        setPickedMesh(null);
        clearMeshSelection("walk mode entered");
        setSelectedMarker(null);
      } else {
        setWalkInspection(null);
      }
      return nextMode;
    });
  }, [clearMeshSelection]);

  const houseNumbers = useMemo(() => {
    const arr = (currentProject?.houses || [])
      .map((h: any) => h.houseNumber ?? h.house_number ?? h.number ?? h.id)
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isFinite(n));
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [currentProject?.houses]);

  const realServiceFilterStorageKey = useMemo(() => (
    projectId ? `map3d-real-service-filter:${projectId}` : null
  ), [projectId]);

  useEffect(() => {
    if (!realServiceFilterStorageKey) {
      setHiddenRealServiceKeys(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(realServiceFilterStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setHiddenRealServiceKeys(new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []));
    } catch {
      setHiddenRealServiceKeys(new Set());
    }
  }, [realServiceFilterStorageKey]);

  useEffect(() => {
    if (!realServiceFilterStorageKey) return;
    const values = Array.from(hiddenRealServiceKeys);
    if (values.length === 0) localStorage.removeItem(realServiceFilterStorageKey);
    else localStorage.setItem(realServiceFilterStorageKey, JSON.stringify(values));
  }, [hiddenRealServiceKeys, realServiceFilterStorageKey]);

  // Lista de serviços (macro→scope) do projeto
  const serviceOptions: ServiceOption[] = useMemo(() => {
    const tpl = (currentProject as any)?.macrosTemplate || [];
    const opts: ServiceOption[] = [];
    tpl.forEach((macro: any) => {
      (macro.scopes || []).forEach((scope: any) => {
        opts.push({
          id: `${macro.id}::${scope.id}`,
          label: `${macro.name} → ${scope.name}`,
          macro_id: macro.id,
          scope_id: scope.id,
        });
      });
    });
    return opts;
  }, [currentProject]);

  const getRealServiceLabel = useCallback((serviceKey: string) => {
    const [macroId, scopeId] = serviceKey.split("::");
    return serviceOptions.find((service) => service.macro_id === macroId && service.scope_id === scopeId)?.label
      ?? `${macroId || "Etapa"} → ${scopeId || "Serviço"}`;
  }, [serviceOptions]);

  // Aplica modo de visualização à cena
  const getReviewLinkTooltipData = useCallback((layerKey: string, mesh?: THREE.Mesh): Omit<NonNullable<ReviewLinkHoverTooltip>, "x" | "y"> => {
    const saved = getCurrentMeshRecord(layerKey);
    const meshName = saved?.mesh_name || mesh?.name || layerKey;
    const materialName = saved?.material_name || (mesh ? getMeshMaterialName(mesh) : "");
    const serviceKey = getRealServiceFilterKey(saved);
    const serviceLabel = serviceKey ? getRealServiceLabel(serviceKey) : "Sem servico";
    const houseLabel = saved?.assigned_house_number != null ? `Casa ${saved.assigned_house_number}` : "Sem casa";

    let statusLabel = "Sem vinculo";
    let meshTypeLabel = "Sem vinculo";
    if (saved?.ignored) {
      statusLabel = "Ignorada";
      meshTypeLabel = "Ignorar";
    } else if (isContextProjectModelMesh(saved)) {
      statusLabel = "Contexto";
      meshTypeLabel = "Contexto";
    } else if (isCompleteProductionLink(saved)) {
      statusLabel = "Vinculada";
      meshTypeLabel = "Producao";
    }

    return {
      layerKey,
      meshName,
      materialName,
      houseLabel,
      serviceLabel,
      statusLabel,
      meshTypeLabel,
      originLabel: "desconhecida",
    };
  }, [getCurrentMeshRecord, getRealServiceLabel, isCompleteProductionLink]);

  const handleReviewLinkHover = useCallback((obj: THREE.Object3D, event: any) => {
    if (!reviewMode || !reviewLinksMode || !(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const layerKey = getMeshLayerKey(mesh);
    const saved = getCurrentMeshRecord(layerKey);
    const isLinked = isCompleteProductionLink(saved);
    const isPending = !saved?.ignored && !isContextProjectModelMesh(saved) && !isLinked;
    if (reviewLinksFilter === "linked" && !isLinked) {
      setReviewLinkHoverTooltip(null);
      return;
    }
    if (reviewLinksFilter === "pending" && !isPending) {
      setReviewLinkHoverTooltip(null);
      return;
    }
    const sourceEvent = event?.nativeEvent ?? event;
    setReviewLinkHoverTooltip({
      ...getReviewLinkTooltipData(layerKey, mesh),
      x: Number(sourceEvent?.clientX ?? 0),
      y: Number(sourceEvent?.clientY ?? 0),
    });
  }, [getCurrentMeshRecord, getReviewLinkTooltipData, isCompleteProductionLink, reviewLinksFilter, reviewLinksMode, reviewMode]);

  const handleSupplementalReviewLinkHover = useCallback((_part: SupplementalGlbPart, obj: THREE.Object3D, event: any) => {
    handleReviewLinkHover(obj, event);
  }, [handleReviewLinkHover]);

  const clearReviewLinkHover = useCallback(() => {
    setReviewLinkHoverTooltip(null);
  }, []);

  const walkMeshData = useMemo(() => {
    if (!walkInspection) return null;
    return getCurrentMeshRecord(walkInspection.layerKey);
  }, [getCurrentMeshRecord, walkInspection]);

  const walkHouse = useMemo(() => {
    const houseNumber = walkMeshData?.assigned_house_number;
    if (houseNumber == null) return null;
    return currentProject?.houses?.find((house: any) => Number(house.id) === Number(houseNumber)) ?? null;
  }, [currentProject?.houses, walkMeshData?.assigned_house_number]);

  const selectedMeshSceneRoot = useMemo(() => {
    if (!selectedMeshKey) return sceneObj;
    if (!selectedMeshKey.startsWith("glbpart:")) return sceneObj;
    const partId = selectedMeshKey.split(":")[1];
    return supplementalGlbScenesRef.current.get(partId) ?? sceneObj;
  }, [selectedMeshKey, sceneObj, supplementalGlbParts]);

  const openDashboardView = useCallback((targetView: "diario-obra" | "production") => {
    navigate("/dashboard", { state: { targetView } });
  }, [navigate]);

  const smartLinkServiceLabel = useMemo(() => {
    const mesh = smartLinkBase?.saved;
    if (!mesh?.service_macro_id || !mesh?.service_scope_id) return "Serviço da mesh base";
    return serviceOptions.find((service) =>
      service.macro_id === mesh.service_macro_id && service.scope_id === mesh.service_scope_id
    )?.label ?? `${mesh.service_macro_id} → ${mesh.service_scope_id}`;
  }, [serviceOptions, smartLinkBase]);

  const clearSmartLinkPreviewHighlight = useCallback((reason = "manual") => {
    let restored = 0;
    let missingOriginals = 0;

    smartLinkPreviewMaterialsRef.current.forEach(({ mesh, originalMaterial }) => {
      if (!mesh || !originalMaterial) {
        missingOriginals += 1;
        return;
      }
      const currentMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = originalMaterial;
      const materials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
      materials.forEach((material) => {
        material.needsUpdate = true;
      });
      currentMaterials.forEach((material) => {
        if ((material as any)?.userData?.__obramapSmartPreviewMaterial) {
          material.dispose();
        }
      });
      restored += 1;
    });
    if (smartLinkPreviewMaterialsRef.current.length > 0) {
      console.log("[GLB Smart Preview] restored", {
        reason,
        restoreCount: restored,
        missingOriginals,
      });
    }
    smartLinkPreviewMaterialsRef.current = [];
  }, []);

  useEffect(() => {
    clearSmartLinkPreviewHighlight("reapply");
    if (!sceneObj || !smartLinkPreviewEnabled || !smartLinkBaseKey) return;

    const candidateKeys = new Set(smartLinkCandidates.map((candidate) => candidate.layerKey));
    const selectedKeys = smartLinkSelectedKeys;
    const targetKeys = new Set([smartLinkBaseKey, ...candidateKeys]);
    const previewed: Array<{ mesh: THREE.Mesh; originalMaterial: THREE.Material | THREE.Material[] }> = [];

    const tintMaterial = (material: THREE.Material, color: THREE.ColorRepresentation, intensity = 1) => {
      const clone = material.clone();
      clone.userData = {
        ...clone.userData,
        __obramapSmartPreviewMaterial: true,
        __obramapSmartPreviewOriginalMaterial: material,
      };
      const anyClone = clone as any;
      if (anyClone.emissive?.set) {
        anyClone.emissive.set(color);
        anyClone.emissiveIntensity = Math.max(Number(anyClone.emissiveIntensity || 0), 0.45 * intensity);
      }
      if (anyClone.color?.lerp) {
        anyClone.color.lerp(new THREE.Color(color), 0.22 * intensity);
      }
      clone.needsUpdate = true;
      return clone;
    };

    const traversePreviewRoots = (visitor: (child: THREE.Object3D) => void) => {
      sceneObj.traverse(visitor);
      supplementalGlbParts
        .filter((part) => part.visible)
        .forEach((part) => {
          supplementalGlbScenesRef.current.get(part.id)?.traverse(visitor);
        });
    };

    traversePreviewRoots((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const layerKey = getMeshLayerKey(mesh);
      if (!targetKeys.has(layerKey)) return;
      const originalMaterial = mesh.material as THREE.Material | THREE.Material[];
      const materials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
      if (materials.some((material) => (material as any)?.userData?.__obramapSmartPreviewMaterial)) {
        console.warn("[GLB Smart Preview] skipped mesh already using preview material", {
          layerKey,
          meshName: mesh.name,
        });
        return;
      }
      const color = layerKey === smartLinkBaseKey
        ? "#38bdf8"
        : layerKey === smartLinkFocusedCandidateKey
          ? "#fb7185"
        : selectedKeys.has(layerKey)
          ? "#f472b6"
          : "#facc15";
      const intensity = selectedKeys.has(layerKey) || layerKey === smartLinkBaseKey || layerKey === smartLinkFocusedCandidateKey ? 1.25 : 1;
      mesh.material = Array.isArray(originalMaterial)
        ? originalMaterial.map((material) => tintMaterial(material, color, intensity))
        : tintMaterial(originalMaterial, color, intensity);
      previewed.push({ mesh, originalMaterial });
    });

    smartLinkPreviewMaterialsRef.current = previewed;
    console.log("[GLB Smart Preview] applied", {
      baseKey: smartLinkBaseKey,
      candidates: candidateKeys.size,
      selected: selectedKeys.size,
      applyCount: previewed.length,
    });

    return () => clearSmartLinkPreviewHighlight("effect cleanup");
  }, [
    clearSmartLinkPreviewHighlight,
    sceneObj,
    smartLinkBaseKey,
    smartLinkCandidates,
    smartLinkFocusedCandidateKey,
    smartLinkPreviewEnabled,
    smartLinkSelectedKeys,
    supplementalGlbParts,
  ]);

  const openSmartLinkSimilar = useCallback((layerKey: string) => {
    const partId = getGlbPartIdFromLayerKey(layerKey);
    const analysisRoot = partId ? supplementalGlbScenesRef.current.get(partId) ?? null : sceneObj;

    if (!analysisRoot) {
      toast.error("Cena 3D ainda não está pronta.");
      return;
    }

    const sourceMap = buildCurrentMeshMap(meshHooks.meshMap);
    const runtimeMeshes = getSceneMeshInfo(analysisRoot, sourceMap, getMeshLayerKey)
      .filter((mesh) => partId
        ? getGlbPartIdFromLayerKey(mesh.layerKey) === partId
        : mesh.layerKey.startsWith("glb:"));
    const mainModelRuntimeMeshes = partId && sceneObj
      ? getSceneMeshInfo(sceneObj, sourceMap, getMeshLayerKey)
        .filter((mesh) => mesh.layerKey.startsWith("glb:"))
      : [];
    const mainModelTextAnchors = partId
      ? getGlbTextHouseAnchors(mainModelRuntimeMeshes, houseNumbers, "main_model_text_anchor")
      : [];
    const houseAnchorDiagnostics = getGlbHouseSuggestionDiagnostics(runtimeMeshes, houseNumbers);
    const base = runtimeMeshes.find((mesh) => mesh.layerKey === layerKey) ?? null;
    const baseSaved = sourceMap.get(layerKey) ?? null;
    const hasBaseLink = isCompleteProductionLink(baseSaved);

    if (!base || !baseSaved || !hasBaseLink) {
      toast.error("Selecione uma mesh com Casa e Serviço vinculados para buscar similares.");
      return;
    }

    const allSimilarCandidates = scoreGlbSimilarCandidates(
      { ...base, saved: baseSaved },
      runtimeMeshes,
      { validHouseNumbers: houseNumbers, includeOtherPossible: true, additionalHouseAnchors: mainModelTextAnchors },
    )
      .filter((candidate) => candidate.layerKey !== layerKey);
    const candidates = allSimilarCandidates.filter((candidate) =>
      candidate.matchStrength === "strong" || candidate.matchStrength === "group"
    );
    const selected = new Set(
      candidates
        .filter((candidate) => candidate.selectedByDefault)
        .map((candidate) => candidate.layerKey),
    );
    if (partId && import.meta.env.DEV) {
      console.log("[GLB Part SmartLink]", {
        baseLayerKey: layerKey,
        partId,
        runtimeMeshesInPart: runtimeMeshes.length,
        anchorsInPart: {
          text: houseAnchorDiagnostics.textAnchors.length,
          linked: houseAnchorDiagnostics.linkedAnchors.length,
          textSample: houseAnchorDiagnostics.textAnchors.slice(0, 10),
          linkedSample: houseAnchorDiagnostics.linkedAnchors.slice(0, 10),
        },
        mainModelTextAnchors: {
          total: mainModelTextAnchors.length,
          sample: mainModelTextAnchors.slice(0, 10),
        },
        candidatesInPart: candidates.length,
        selectedByDefault: selected.size,
      });
      console.log("[GLB Part Anchor Cross Source Debug]", candidates.slice(0, 10).map((candidate) => ({
        candidateLayerKey: candidate.layerKey,
        candidatePartId: getGlbPartIdFromLayerKey(candidate.layerKey),
        candidateCenterWorld: candidate.center,
        samePartTextAnchorsFound: houseAnchorDiagnostics.textAnchors.length,
        mainModelTextAnchorsNearby: candidate.suggestionTopTextAnchors
          ?.filter((anchor) => anchor.source === "main_model_text_anchor")
          .slice(0, 5) ?? [],
        chosenAnchor: candidate.suggestionAnchorLayerKey
          ? {
            layerKey: candidate.suggestionAnchorLayerKey,
            name: candidate.suggestionAnchorName,
            center: candidate.suggestionAnchorCenter,
          }
          : null,
        source: candidate.suggestionSource,
        distanceXZ: candidate.suggestionHorizontalDistance ?? null,
        top5TextAnchors: candidate.suggestionTopTextAnchors?.slice(0, 5) ?? [],
        decisionReason: candidate.houseSuggestionRejectReason || candidate.suggestionReason,
      })));
    }
    const officialHouseSet = new Set(houseNumbers);
    const invalidApplicableCandidates = candidates
      .filter((candidate) =>
        candidate.status === "applicable"
        && (
          candidate.suggestedHouseNumber == null
          || !officialHouseSet.has(candidate.suggestedHouseNumber)
        )
      )
      .map((candidate) => ({
        layerKey: candidate.layerKey,
        meshName: candidate.meshName,
        suggestedHouseNumber: candidate.suggestedHouseNumber,
        confidence: candidate.suggestionConfidence,
        source: candidate.suggestionSource,
        reason: candidate.suggestionReason,
        rejectReason: candidate.houseSuggestionRejectReason,
      }));

    console.log("[GLB Smart Link] preview built", {
      baseMesh: baseSaved,
      baseRuntime: base,
      totalAnalyzed: runtimeMeshes.length,
      allSimilarCandidates: allSimilarCandidates.length,
      hiddenOtherPossible: allSimilarCandidates.length - candidates.length,
      candidates: candidates.length,
      selectedByDefault: selected.size,
      statusCounts: candidates.reduce((acc, candidate) => {
        acc[candidate.status] = (acc[candidate.status] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sample: candidates.slice(0, 10),
    });
    console.log("[GLB Smart House Safety]", {
      projectId,
      projectName: currentProject?.name ?? null,
      housesCount: houseNumbers.length,
      validHouseNumbers: houseNumbers,
      hasCasa99: officialHouseSet.has(99),
      hasCasa71: officialHouseSet.has(71),
      baseKey: layerKey,
      baseMeshName: base.meshName,
      candidatesApplicable: candidates.filter((candidate) => candidate.status === "applicable").length,
      selectedByDefault: selected.size,
      invalidApplicableCandidates,
    });
    console.log("[GLB Smart House Suggestion]", {
      totalCandidates: candidates.length,
      officialHouseTotal: houseNumbers.length,
      officialHouseSample: houseNumbers.slice(0, 20),
      linkedAnchorTotal: houseAnchorDiagnostics.linkedAnchors.length,
      textAnchorTotal: houseAnchorDiagnostics.textAnchors.length,
      mainModelTextAnchorTotal: mainModelTextAnchors.length,
      linkedAnchorSample: houseAnchorDiagnostics.linkedAnchors.slice(0, 10),
      textAnchorSample: houseAnchorDiagnostics.textAnchors.slice(0, 10),
      mainModelTextAnchorSample: mainModelTextAnchors.slice(0, 10),
      strongCandidates: candidates.filter((candidate) => candidate.matchStrength === "strong").length,
      groupedCandidates: candidates.filter((candidate) => candidate.matchStrength === "group").length,
      existingHouse: candidates.filter((candidate) => candidate.currentAssignedHouseNumber != null).length,
      suggestedHigh: candidates.filter((candidate) => candidate.suggestionConfidence === "alta" && candidate.currentAssignedHouseNumber == null).length,
      suggestedMedium: candidates.filter((candidate) => candidate.suggestionConfidence === "media").length,
      suggestedLow: candidates.filter((candidate) => candidate.suggestionConfidence === "baixa").length,
      withoutSuggestion: candidates.filter((candidate) => candidate.suggestionConfidence === "nenhuma").length,
      rejectedOutsideProject: candidates.filter((candidate) => candidate.houseSuggestionRejectReason === "casa fora do projeto").length,
      rejectedAmbiguous: candidates.filter((candidate) =>
        candidate.houseSuggestionRejectReason === "ancora ambigua"
        || candidate.houseSuggestionRejectReason === "segundo numero muito proximo"
      ).length,
      rejectedDuplicate: candidates.filter((candidate) => candidate.houseSuggestionRejectReason === "duplicada para o mesmo servico").length,
      rejectedFar: candidates.filter((candidate) =>
        candidate.houseSuggestionRejectReason === "ancora distante"
        || candidate.houseSuggestionRejectReason === "distancia excessiva"
      ).length,
      acceptedDominantAnchor: candidates.filter((candidate) => candidate.acceptedDominantAnchor === true).length,
      downgradedByAnchorCompetition: candidates.filter((candidate) =>
        candidate.houseSuggestionRejectReason === "segundo numero muito proximo"
        || candidate.houseSuggestionRejectReason === "ancora ambigua"
        || candidate.houseSuggestionRejectReason === "ancora dominante media"
      ).length,
      applicableAfterAnchorFilter: candidates.filter((candidate) => candidate.status === "applicable").length,
      selectedAfterAnchorFilter: selected.size,
      sourceCounts: candidates.reduce((acc, candidate) => {
        acc[candidate.suggestionSource] = (acc[candidate.suggestionSource] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sample: candidates
        .filter((candidate) => candidate.suggestedHouseNumber != null)
        .slice(0, 10)
        .map((candidate) => ({
          layerKey: candidate.layerKey,
          meshName: candidate.meshName,
          house: candidate.suggestedHouseNumber,
          confidence: candidate.suggestionConfidence,
          source: candidate.suggestionSource,
          distance: candidate.suggestionDistance,
          secondDistance: candidate.secondSuggestionDistance,
          distanceGap: candidate.suggestionDistanceGap,
          distanceRatio: candidate.suggestionDistanceRatio,
          acceptedDominantAnchor: candidate.acceptedDominantAnchor,
          reason: candidate.suggestionReason,
        })),
      strongCandidateNearestAnchors: candidates.slice(0, 20).map((candidate) => ({
        layerKey: candidate.layerKey,
        meshName: candidate.meshName,
        score: candidate.score,
        house: candidate.suggestedHouseNumber,
        confidence: candidate.suggestionConfidence,
        source: candidate.suggestionSource,
        distance: candidate.suggestionDistance,
        secondDistance: candidate.secondSuggestionDistance,
        distanceGap: candidate.suggestionDistanceGap,
        distanceRatio: candidate.suggestionDistanceRatio,
        acceptedDominantAnchor: candidate.acceptedDominantAnchor,
        rejectReason: candidate.houseSuggestionRejectReason,
      })),
    });

    setSmartLinkBase({ ...base, saved: baseSaved });
    setSmartLinkBaseKey(layerKey);
    setSmartLinkCandidates(candidates as any);
    setSmartLinkSelectedKeys(selected);
    setSmartLinkFocusedCandidateKey(null);
    setSmartLinkPreviewEnabled(true);
    setSmartLinkPreviewBarOpen(false);
    setSmartLinkPreviewMode(null);
    setSmartLinkIsolationFilter("all");
    setSmartLinkOpen(true);
    setReviewLinksMode(false);
    setReviewLinkHoverTooltip(null);
  }, [buildCurrentMeshMap, currentProject?.name, houseNumbers, isCompleteProductionLink, meshHooks.meshMap, projectId, sceneObj]);

  const toggleSmartLinkCandidate = useCallback((layerKey: string, checked: boolean) => {
    setSmartLinkSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(layerKey);
      else next.delete(layerKey);
      const candidate = smartLinkCandidates.find((item) => item.layerKey === layerKey) ?? null;
      if (candidate && checked && candidate.status !== "applicable") {
        console.log("[SmartLink Selection Override]", {
          candidate: layerKey,
          status: candidate.status,
          selectedManually: true,
          reason: candidate.houseSuggestionRejectReason || candidate.suggestionReason,
        });
      }
      console.log("[GLB Smart Review]", {
        action: "toggle-candidate",
        focusedCandidateKey: smartLinkFocusedCandidateKey,
        layerKey,
        status: candidate?.status ?? null,
        suggestedHouseNumber: candidate?.suggestedHouseNumber ?? null,
        selected: checked,
        filterMode: smartLinkIsolationFilter,
      });
      return next;
    });
  }, [smartLinkCandidates, smartLinkFocusedCandidateKey, smartLinkIsolationFilter]);

  const smartLinkFocusedCandidate = useMemo(() => {
    if (!smartLinkFocusedCandidateKey) return null;
    return smartLinkCandidates.find((candidate) => candidate.layerKey === smartLinkFocusedCandidateKey) ?? null;
  }, [smartLinkCandidates, smartLinkFocusedCandidateKey]);

  const getSmartLinkIsolationKeys = useCallback((filter: SmartLinkIsolationFilter) => {
    const keys = new Set<string>();
    if (smartLinkBaseKey) keys.add(smartLinkBaseKey);
    smartLinkCandidates.forEach((candidate) => {
      const include = filter === "all"
        || (filter === "applicable" && candidate.status === "applicable")
        || (filter === "selected" && smartLinkSelectedKeys.has(candidate.layerKey))
        || (filter === "missing_house" && candidate.status === "missing_house")
        || (filter === "medium" && candidate.suggestionConfidence === "media")
        || (filter === "linked" && candidate.status === "linked");
      if (include) keys.add(candidate.layerKey);
    });
    return keys;
  }, [smartLinkBaseKey, smartLinkCandidates, smartLinkSelectedKeys]);

  const isolateSmartLinkByFilter = useCallback((filter: SmartLinkIsolationFilter) => {
    const keys = getSmartLinkIsolationKeys(filter);
    if (keys.size === 0) {
      toast.info("Nenhuma candidata neste filtro.");
      return;
    }
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Review]", {
      action: "isolate-filter",
      filterMode: filter,
      isolatedCount: keys.size,
      focusedCandidateKey: smartLinkFocusedCandidateKey,
      dialogOpenBefore: beforeState.dialogOpen,
    });
    setSmartLinkPreviewEnabled(true);
    clearSmartLinkCandidateHover();
    clearMeshSelection(`smartlink isolate filter: ${filter}`);
    setIsolatedKeys(keys);
    setSmartLinkIsolationFilter(filter);
    setSmartLinkPreviewMode("isolate");
    setSmartLinkPreviewBarOpen(true);
    setSmartLinkOpen(false);
    toast.info(`Isolando ${keys.size} mesh(es) do filtro SmartLink.`);
  }, [clearMeshSelection, clearSmartLinkCandidateHover, getSmartLinkIsolationKeys, smartLinkFocusedCandidateKey]);

  useEffect(() => {
    if (!smartLinkPreviewEnabled || smartLinkPreviewMode !== "isolate") return;
    setIsolatedKeys(getSmartLinkIsolationKeys(smartLinkIsolationFilter));
  }, [getSmartLinkIsolationKeys, smartLinkIsolationFilter, smartLinkPreviewEnabled, smartLinkPreviewMode]);

  const showSmartLinkCandidatesOnMap = useCallback(() => {
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: "minimize-dialog",
      reason: "show candidates on map",
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: false,
      previewActive: true,
      cleanupCalled: false,
      caller: "showSmartLinkCandidatesOnMap",
    });
    setSmartLinkPreviewEnabled(true);
    clearSmartLinkCandidateHover();
    clearMeshSelection("smartlink show candidates");
    setIsolatedKeys(null);
    setSmartLinkIsolationFilter("all");
    setSmartLinkPreviewMode("show");
    setSmartLinkPreviewBarOpen(true);
    setSmartLinkOpen(false);
    toast.info("Candidatas destacadas no mapa.");
  }, [clearMeshSelection, clearSmartLinkCandidateHover]);

  const isolateSmartLinkCandidates = useCallback(() => {
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: "minimize-dialog",
      reason: "isolate all candidates",
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: false,
      previewActive: true,
      cleanupCalled: false,
      caller: "isolateSmartLinkCandidates",
    });
    isolateSmartLinkByFilter("all");
  }, [isolateSmartLinkByFilter]);

  const clearSmartLinkPreviewVisual = useCallback((reason = "visual cleanup") => {
    const beforeState = smartLinkPreviewStateRef.current;
    const restoredMaterials = smartLinkPreviewMaterialsRef.current.length;
    console.log("[GLB Smart Preview State]", {
      action: "visual-clear-start",
      reason,
      loadingBefore: beforeState.isLoading,
      previewKeysCount: beforeState.candidateCount,
      selectedKeysCount: beforeState.selectedCount,
      isolatedKeysCount: beforeState.isolatedCount,
      restoredMaterialsCount: restoredMaterials,
      isDialogOpen: beforeState.dialogOpen,
      isPreviewBarOpen: beforeState.previewBarOpen,
      applyingBefore: beforeState.applying,
    });
    setSmartLinkPreviewEnabled(false);
    setSmartLinkPreviewBarOpen(false);
    setSmartLinkPreviewMode(null);
    setSmartLinkHoverTooltip(null);
    setIsolatedKeys(null);
    clearSmartLinkPreviewHighlight(reason);
    clearMeshSelection(`smartlink visual cleanup: ${reason}`);
    setIsLoading(false);
    console.log("[GLB Smart Preview State]", {
      action: "visual-clear-end",
      reason,
      loadingBefore: beforeState.isLoading,
      loadingAfter: false,
      previewKeysCount: beforeState.candidateCount,
      selectedKeysCount: beforeState.selectedCount,
      isolatedKeysCount: 0,
      restoredMaterialsCount: restoredMaterials,
      isDialogOpen: beforeState.dialogOpen,
      isPreviewBarOpen: false,
      applyingAfter: beforeState.applying,
    });
  }, [clearMeshSelection, clearSmartLinkPreviewHighlight]);

  const clearSmartLinkPreview = useCallback((reason = "user/action") => {
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: "close-flow-start",
      reason,
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: false,
      previewActive: beforeState.previewEnabled,
      cleanupCalled: true,
      caller: "clearSmartLinkPreview",
    });
    console.log("[GLB Smart Preview State]", {
      action: "clear-start",
      reason,
      loadingBefore: beforeState.isLoading,
      previewKeysCount: beforeState.candidateCount,
      selectedKeysCount: beforeState.selectedCount,
      isolatedKeysCount: beforeState.isolatedCount,
      restoredMaterialsCount: smartLinkPreviewMaterialsRef.current.length,
      isDialogOpen: beforeState.dialogOpen,
      isPreviewBarOpen: beforeState.previewBarOpen,
      applyingBefore: beforeState.applying,
    });
    setSmartLinkApplying(false);
    setSmartLinkOpen(false);
    setSmartLinkBase(null);
    setSmartLinkBaseKey(null);
    setSmartLinkCandidates([]);
    setSmartLinkSelectedKeys(new Set());
    setSmartLinkFocusedCandidateKey(null);
    setSmartLinkHoverTooltip(null);
    setSmartLinkIsolationFilter("all");
    clearSmartLinkPreviewVisual(reason);
    console.log("[GLB Smart Preview State]", {
      action: "clear-end",
      reason,
      loadingBefore: beforeState.isLoading,
      loadingAfter: false,
      previewKeysCount: 0,
      selectedKeysCount: 0,
      isolatedKeysCount: 0,
      restoredMaterialsCount: smartLinkPreviewMaterialsRef.current.length,
      isDialogOpen: false,
      isPreviewBarOpen: false,
      applyingAfter: false,
    });
    console.log("[GLB Smart Dialog State]", {
      action: "close-flow-end",
      reason,
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: false,
      previewActive: false,
      cleanupCalled: true,
      caller: "clearSmartLinkPreview",
    });
  }, [clearSmartLinkPreviewVisual]);

  const clearAll3DSelection = useCallback((reason = "manual") => {
    clearSmartLinkPreview(reason);
    clearMeshSelection(reason);
    setReviewLinksMode(false);
    setReviewLinksFilter("all");
    setReviewLinkHoverTooltip(null);
    setPickedMesh(null);
    setWalkInspection(null);
  }, [clearMeshSelection, clearSmartLinkPreview]);

  const returnToSmartLinkList = useCallback(() => {
    if (!smartLinkBase || smartLinkCandidates.length === 0) return;
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: "open-dialog",
      reason: "return to list",
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: true,
      previewActive: beforeState.previewEnabled,
      cleanupCalled: false,
      caller: "returnToSmartLinkList",
    });
    clearSmartLinkCandidateHover();
    clearMeshSelection("smartlink return to list");
    setSmartLinkOpen(true);
    setSmartLinkPreviewBarOpen(false);
  }, [clearMeshSelection, clearSmartLinkCandidateHover, smartLinkBase, smartLinkCandidates.length]);

  const handleSmartLinkOpenChange = useCallback((open: boolean) => {
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: open ? "open-dialog" : "request-close-dialog",
      reason: open ? "dialog open change" : "dialog closed",
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: open,
      previewActive: beforeState.previewEnabled,
      cleanupCalled: !open,
      caller: "handleSmartLinkOpenChange",
    });
    if (open) {
      setSmartLinkOpen(true);
    } else {
      clearSmartLinkPreview("dialog closed");
    }
  }, [clearSmartLinkPreview]);

  useEffect(() => {
    if (!reviewMode) {
      clearSmartLinkCandidateHover();
      clearAll3DSelection("review mode exited");
    }
  }, [clearAll3DSelection, clearSmartLinkCandidateHover, reviewMode]);

  const smartLinkModelUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const currentModelUrl = modelData?.url ?? null;
    if (smartLinkModelUrlRef.current && smartLinkModelUrlRef.current !== currentModelUrl) {
      console.log("[GLB Smart Preview] clear requested", { reason: "model changed" });
      clearSmartLinkPreview("model changed");
    }
    smartLinkModelUrlRef.current = currentModelUrl;
  }, [clearSmartLinkPreview, modelData?.url]);

  const applySmartLinkSelection = useCallback(async () => {
    if (!projectId || !smartLinkBase?.saved) return;
    const baseSaved = smartLinkBase.saved;
    if (!baseSaved.service_macro_id || !baseSaved.service_scope_id) return;
    const validHouseNumbers = new Set(houseNumbers);

    const selectedRawCandidates = smartLinkCandidates.filter((candidate) =>
      smartLinkSelectedKeys.has(candidate.layerKey)
    );
    const candidatesWithoutHouse = selectedRawCandidates.filter((candidate) =>
      candidate.suggestedHouseNumber == null || !validHouseNumbers.has(candidate.suggestedHouseNumber)
    );
    if (candidatesWithoutHouse.length > 0) {
      toast.error(`Defina Casa antes de aplicar ${candidatesWithoutHouse.length} candidata(s) selecionada(s).`);
      console.log("[SmartLink Selection Override]", {
        action: "apply-blocked-missing-house",
        candidates: candidatesWithoutHouse.slice(0, 10).map((candidate) => ({
          layerKey: candidate.layerKey,
          status: candidate.status,
          suggestedHouseNumber: candidate.suggestedHouseNumber,
          reason: candidate.houseSuggestionRejectReason || candidate.suggestionReason,
        })),
      });
      return;
    }
    const blockedByExistingState = selectedRawCandidates.filter((candidate) =>
      candidate.status === "linked"
      || candidate.status === "context"
      || candidate.status === "ignored"
      || candidate.status === "self"
    );
    if (blockedByExistingState.length > 0) {
      toast.error(`Remova da selecao ${blockedByExistingState.length} candidata(s) ja vinculada(s), contexto, ignorada(s) ou base.`);
      console.log("[SmartLink Selection Override]", {
        action: "apply-blocked-existing-state",
        candidates: blockedByExistingState.slice(0, 10).map((candidate) => ({
          layerKey: candidate.layerKey,
          status: candidate.status,
          suggestedHouseNumber: candidate.suggestedHouseNumber,
        })),
      });
      return;
    }
    const selectedCandidates = selectedRawCandidates.filter((candidate) =>
      candidate.suggestedHouseNumber != null
      && validHouseNumbers.has(candidate.suggestedHouseNumber)
    );
    if (selectedCandidates.length === 0) {
      toast.error("Nenhuma candidata aplicável com casa sugerida foi selecionada.");
      return;
    }

    setSmartLinkApplying(true);
    try {
      const updates = selectedCandidates.map((candidate) => ({
        project_id: projectId,
        layer_key: candidate.layerKey,
        mesh_name: candidate.meshName,
        material_name: candidate.materialName,
        detected_house_number: candidate.suggestedHouseNumber,
        assigned_house_number: candidate.suggestedHouseNumber,
        service_macro_id: baseSaved.service_macro_id,
        service_scope_id: baseSaved.service_scope_id,
        ignored: false,
        visible: true,
        production_visible: false,
        progress_percent: 0,
      }));
      const batchSize = 100;
      const errors: any[] = [];
      let sent = 0;
      for (let index = 0; index < updates.length; index += batchSize) {
        const batch = updates.slice(index, index + batchSize);
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(batch, { onConflict: "project_id,layer_key" });
        sent += batch.length;
        if (error) errors.push(error);
      }

      console.log("[GLB Smart Link] applied", {
        base: baseSaved,
        selected: smartLinkSelectedKeys.size,
        applicable: selectedCandidates.length,
        sent,
        skipped: smartLinkSelectedKeys.size - selectedCandidates.length,
        errors: errors.length,
        sample: updates.slice(0, 10),
      });

      if (errors.length > 0) throw errors[0];

      const refreshed = await meshHooks.refresh();
      const refreshedMap = new Map((refreshed || []).map((mesh) => [mesh.layer_key, mesh]));
      setTrustedGlbLinkKeys((prev) => {
        const next = new Set(prev);
        updates.forEach((update) => next.add(update.layer_key));
        return next;
      });
      setMeshReviewOverrides((prev) => {
        const next = new Map(prev);
        updates.forEach((update) => {
          const saved = refreshedMap.get(update.layer_key);
          if (saved) next.set(update.layer_key, saved);
        });
        return next;
      });
      toast.success(`Vínculos aplicados: ${sent}. Clique em Sincronizar 3D Real para atualizar a produção.`);
      clearSmartLinkPreview("apply completed");
    } catch (error) {
      console.error("[GLB Smart Link] apply error", error);
      clearSmartLinkPreview("apply error");
      toast.error("Falha ao aplicar vínculos inteligentes.");
    } finally {
      setSmartLinkApplying(false);
      setIsLoading(false);
    }
  }, [clearSmartLinkPreview, houseNumbers, meshHooks, projectId, smartLinkBase, smartLinkCandidates, smartLinkSelectedKeys]);

  const traverseActiveModelMeshes = useCallback((visitor: (mesh: THREE.Mesh) => void, options?: { includeHiddenParts?: boolean }) => {
    const traverseRoot = (root: THREE.Object3D | null | undefined) => {
      if (!root) return;
      root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        visitor(child as THREE.Mesh);
      });
    };
    traverseRoot(sceneObj);
    supplementalGlbParts
      .filter((part) => options?.includeHiddenParts || part.visible)
      .forEach((part) => traverseRoot(supplementalGlbScenesRef.current.get(part.id)));
  }, [sceneObj, supplementalGlbParts]);

  const restoreCompleteSceneVisibility = useCallback((reason: string) => {
    const roots: THREE.Object3D[] = [];
    if (sceneObj) roots.push(sceneObj);
    supplementalGlbParts.forEach((part) => {
      const root = supplementalGlbScenesRef.current.get(part.id);
      if (root) roots.push(root);
    });

    const audit = {
      reason,
      viewMode,
      totalMeshes: 0,
      invisibleBefore: 0,
      invisibleAfter: 0,
      translucentMaterialsBefore: 0,
      translucentMaterialsAfter: 0,
      invisibleParentsFound: 0,
      stillInvisible: [] as Array<{ layer_key: string; name: string | null; parent: string | null; material: string | null }>,
    };

    const isEffectivelyVisible = (object: THREE.Object3D) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };

    const inspectMaterials = (mesh: THREE.Mesh, phase: "before" | "after") => {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        const anyMaterial = material as any;
        if (!anyMaterial) return;
        const isTranslucent = Number(anyMaterial.opacity ?? 1) < 1 || anyMaterial.transparent === true;
        if (isTranslucent) {
          if (phase === "before") audit.translucentMaterialsBefore += 1;
          else audit.translucentMaterialsAfter += 1;
        }
      });
    };

    roots.forEach((root) => {
      root.traverse((child) => {
        if (child !== root && !child.visible && child.children.length > 0) {
          audit.invisibleParentsFound += 1;
        }
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          audit.totalMeshes += 1;
          if (!isEffectivelyVisible(mesh)) audit.invisibleBefore += 1;
          inspectMaterials(mesh, "before");
        }
      });
    });

    roots.forEach((root) => {
      root.traverse((child) => {
        child.visible = true;
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          const anyMaterial = material as any;
          if (!anyMaterial) return;
          if ("opacity" in anyMaterial) anyMaterial.opacity = 1;
          if ("transparent" in anyMaterial) anyMaterial.transparent = false;
          if ("depthWrite" in anyMaterial) anyMaterial.depthWrite = true;
          anyMaterial.needsUpdate = true;
        });
      });
    });

    roots.forEach((root) => {
      root.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        if (!isEffectivelyVisible(mesh)) {
          audit.invisibleAfter += 1;
          if (audit.stillInvisible.length < 20) {
            audit.stillInvisible.push({
              layer_key: getMeshLayerKey(mesh),
              name: mesh.name || null,
              parent: mesh.parent?.name || null,
              material: getMeshMaterialName(mesh) || null,
            });
          }
        }
        inspectMaterials(mesh, "after");
      });
    });

    console.log("[3D Reexibir Tudo Audit]", audit);
    return audit;
  }, [sceneObj, supplementalGlbParts, viewMode]);

  const collectActiveModelLayerKeys = useCallback(() => {
    const keys = new Set<string>();
    traverseActiveModelMeshes((mesh) => {
      keys.add(getMeshLayerKey(mesh));
    });
    return keys;
  }, [traverseActiveModelMeshes]);

  const realServiceRows = useMemo(() => {
    const sourceMap = buildCurrentMeshMap(meshHooks.meshMap);
    const rows = new Map<string, { key: string; label: string; meshCount: number; houses: Set<number> }>();
    traverseActiveModelMeshes((mesh) => {
      const saved = sourceMap.get(getMeshLayerKey(mesh));
      if (!isCompleteProductionLink(saved) || isContextProjectModelMesh(saved) || !saved?.production_visible || saved.ignored) return;
      const serviceKey = getRealServiceFilterKey(saved);
      if (!serviceKey) return;
      const current = rows.get(serviceKey) ?? {
        key: serviceKey,
        label: getRealServiceLabel(serviceKey),
        meshCount: 0,
        houses: new Set<number>(),
      };
      current.meshCount += 1;
      if (saved.assigned_house_number != null) current.houses.add(Number(saved.assigned_house_number));
      rows.set(serviceKey, current);
    }, { includeHiddenParts: true });
    return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [buildCurrentMeshMap, getRealServiceLabel, isCompleteProductionLink, meshHooks.meshMap, traverseActiveModelMeshes]);

  const reviewVisibilityStats = useMemo(() => {
    const stats = { total: 0, linked: 0, pending: 0, context: 0, ignored: 0 };
    const sourceMap = buildCurrentMeshMap(meshHooks.meshMap);
    traverseActiveModelMeshes((mesh) => {
      stats.total++;
      const saved = sourceMap.get(getMeshLayerKey(mesh));
      if (saved?.ignored) {
        stats.ignored++;
        return;
      }
      if (isContextProjectModelMesh(saved)) {
        stats.context++;
        return;
      }
      if (isCompleteProductionLink(saved)) {
        stats.linked++;
        return;
      }
      stats.pending++;
    });
    return stats;
  }, [buildCurrentMeshMap, isCompleteProductionLink, meshHooks.meshMap, supplementalGlbParts, traverseActiveModelMeshes]);

  useEffect(() => {
    const restoreReviewLinksHighlight = () => {
      reviewLinksHighlightRef.current.forEach(({ mesh, originalMaterial }) => {
        const currentMaterial = mesh.material as THREE.Material | THREE.Material[];
        mesh.material = originalMaterial;
        const currentMaterials = Array.isArray(currentMaterial) ? currentMaterial : [currentMaterial];
        currentMaterials.forEach((material) => {
          if ((material.userData as any)?.__obramapReviewLinksMaterial) {
            material.dispose();
          }
        });
        const restoredMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
        restoredMaterials.forEach((material) => {
          material.needsUpdate = true;
        });
      });
      reviewLinksHighlightRef.current = [];
    };

    restoreReviewLinksHighlight();
    if (!reviewMode || !reviewLinksMode) return restoreReviewLinksHighlight;

    const linkedMeshes: THREE.Mesh[] = [];
    traverseActiveModelMeshes((mesh) => {
      const saved = getCurrentMeshRecord(getMeshLayerKey(mesh));
      if (isCompleteProductionLink(saved)) linkedMeshes.push(mesh);
    });

    const makeReviewMaterial = (material: THREE.Material) => {
      const clone = material.clone();
      clone.userData = {
        ...clone.userData,
        __obramapReviewLinksMaterial: true,
      };
      const anyClone = clone as any;
      if (anyClone.emissive?.set) {
        anyClone.emissive.set(0x38bdf8);
        anyClone.emissiveIntensity = Math.max(Number(anyClone.emissiveIntensity || 0), 0.22);
      } else if (anyClone.color?.lerp) {
        anyClone.color.lerp(new THREE.Color(0x38bdf8), 0.22);
      }
      clone.transparent = true;
      clone.opacity = Math.max(Number((clone as any).opacity ?? 1), 0.82);
      clone.needsUpdate = true;
      return clone;
    };

    reviewLinksHighlightRef.current = linkedMeshes.map((mesh) => {
      const originalMaterial = mesh.material as THREE.Material | THREE.Material[];
      mesh.material = Array.isArray(originalMaterial)
        ? originalMaterial.map(makeReviewMaterial)
        : makeReviewMaterial(originalMaterial);
      return { mesh, originalMaterial };
    });

    if (import.meta.env.DEV) {
      console.log("[Review Links] highlight applied", { count: linkedMeshes.length });
    }

    return restoreReviewLinksHighlight;
  }, [getCurrentMeshRecord, isCompleteProductionLink, reviewLinksMode, reviewMode, traverseActiveModelMeshes]);

  const selectedZoomOption = ZOOM_SENSITIVITY_OPTIONS.find((option) => option.value === zoomSensitivity) ?? ZOOM_SENSITIVITY_OPTIONS[1];
  const orbitZoomSpeed = 2.8 * selectedZoomOption.multiplier;

  const applyViewMode = useCallback((
    mode: ViewMode,
    overrideMeshMap?: Map<string, ProjectModelMesh>,
    overrideHiddenRealServiceKeys?: Set<string>,
  ) => {
    setViewMode(mode);
    const hiddenServices = overrideHiddenRealServiceKeys ?? hiddenRealServiceKeys;
    const realStats = {
      contextVisible: 0,
      linkedVisible: 0,
      linkedHidden: 0,
      serviceFilteredHidden: 0,
      unlinkedHidden: 0,
      ignored: 0,
      contextExamples: [] as Array<{ layer_key: string; mesh_name: string | null; material_name: string | null }>,
    };
    const sourceMap = buildCurrentMeshMap(overrideMeshMap ?? meshHooks.meshMap);
    let visitedMeshes = 0;
    traverseActiveModelMeshes((mesh) => {
      visitedMeshes++;
      const saved = sourceMap.get(getMeshLayerKey(mesh));
      if (!saved) {
        mesh.visible = mode !== "real";
        if (mode === "real") realStats.unlinkedHidden++;
        return;
      }
      if (saved.ignored) {
        mesh.visible = false;
        if (mode === "real") realStats.ignored++;
        return;
      }
      if (mode !== "real" && reviewMode && hideLinkedInReview && isCompleteProductionLink(saved) && !isContextProjectModelMesh(saved)) {
        mesh.visible = false;
        return;
      }
      switch (mode) {
        case "complete":
          mesh.visible = saved.visible;
          break;
        case "real": {
          if (isContextProjectModelMesh(saved)) {
            mesh.visible = saved.visible;
            if (saved.visible) realStats.contextVisible++;
            if (realStats.contextExamples.length < 8) {
              realStats.contextExamples.push({
                layer_key: saved.layer_key,
                mesh_name: saved.mesh_name,
                material_name: saved.material_name,
              });
            }
            break;
          }
          const hasLink = isCompleteProductionLink(saved);
          const serviceKey = getRealServiceFilterKey(saved);
          const hiddenByServiceFilter = !!serviceKey && hiddenServices.has(serviceKey);
          mesh.visible = hasLink && !!saved.production_visible && !hiddenByServiceFilter;
          if (!hasLink) realStats.unlinkedHidden++;
          else if (saved.production_visible && hiddenByServiceFilter) realStats.serviceFilteredHidden++;
          else if (saved.production_visible) realStats.linkedVisible++;
          else realStats.linkedHidden++;
          break;
        }
        case "simulation":
          mesh.visible = saved.visible;
          break;
      }
    }, { includeHiddenParts: true });
    if (visitedMeshes === 0) return realStats;
    if (mode === "real") {
      console.log("[GLB Real Context]", realStats);
      if (import.meta.env.DEV) {
        console.log("[GLB Import Safety] real mode applied", {
          visibleInReal: realStats.linkedVisible + realStats.contextVisible,
          hiddenWithoutLink: realStats.unlinkedHidden,
          linkedHidden: realStats.linkedHidden,
          serviceFilteredHidden: realStats.serviceFilteredHidden,
          ignored: realStats.ignored,
        });
      }
    }
    return realStats;
  }, [buildCurrentMeshMap, hiddenRealServiceKeys, hideLinkedInReview, isCompleteProductionLink, meshHooks.meshMap, reviewMode, traverseActiveModelMeshes]);

  const reexibirTodasCamadas = useCallback(() => {
    const beforeState = smartLinkPreviewStateRef.current;
    layerManager.setAutoMode(false);
    layerManager.showAllLayers();
    setHideLinkedInReview(false);
    const clearedRealServiceFilter = new Set<string>();
    setHiddenRealServiceKeys(clearedRealServiceFilter);
    setSupplementalGlbParts((current) => current.map((part) => ({ ...part, visible: true })));
    clearAll3DSelection("layers show all");
    const resetAudit = restoreCompleteSceneVisibility("layers show all");
    if (viewMode === "complete") {
      setCompleteVisualResetNonce((value) => value + 1);
    } else {
      applyViewMode(viewMode, undefined, clearedRealServiceFilter);
    }
    console.log("[3D Reexibir Tudo Debug]", {
      viewMode,
      clearedPreview: beforeState.previewEnabled,
      clearedIsolation: beforeState.isolatedCount > 0,
      restoredMaterials: smartLinkPreviewMaterialsRef.current.length,
      layersRestored: true,
      realServiceFilterCleared: hiddenRealServiceKeys.size > 0,
      invisibleBefore: resetAudit.invisibleBefore,
      invisibleAfter: resetAudit.invisibleAfter,
      invisibleParentsFound: resetAudit.invisibleParentsFound,
      reappliedViewMode: viewMode,
    });
    toast.success("Visualização 3D reexibida.");
  }, [applyViewMode, clearAll3DSelection, hiddenRealServiceKeys.size, layerManager, restoreCompleteSceneVisibility, viewMode]);

  const updateHiddenRealServices = useCallback((next: Set<string>) => {
    setHiddenRealServiceKeys(next);
    if (viewMode === "real") applyViewMode("real", undefined, next);
  }, [applyViewMode, viewMode]);

  const toggleRealServiceVisibility = useCallback((serviceKey: string, visible: boolean) => {
    const next = new Set(hiddenRealServiceKeys);
    if (visible) next.delete(serviceKey);
    else next.add(serviceKey);
    updateHiddenRealServices(next);
  }, [hiddenRealServiceKeys, updateHiddenRealServices]);

  const diagnoseGlbPartRealMode = useCallback(() => {
    const sourceMap = buildCurrentMeshMap(meshHooks.meshMap);
    const samples: Array<{
      layer_key: string;
      mesh_name: string | null;
      material_name: string | null;
      assigned_house_number: number | null;
      service_macro_id: string | null;
      service_scope_id: string | null;
      production_visible: boolean;
      progress_percent: number | null;
      bucket: string;
      actual_visible: boolean;
    }> = [];
    let glbPartMeshesInScene = 0;
    let linkedComplete = 0;
    let unlinked = 0;
    let visibleInReal = 0;
    let hiddenInReal = 0;
    let contextVisible = 0;
    let ignored = 0;

    traverseActiveModelMeshes((mesh) => {
      const layerKey = getMeshLayerKey(mesh);
      if (!layerKey.startsWith("glbpart:")) return;
      glbPartMeshesInScene++;
      const saved = sourceMap.get(layerKey) ?? null;
      const isContext = isContextProjectModelMesh(saved);
      const hasCompleteLink = isCompleteProductionLink(saved);
      let bucket = "sem vinculo";
      let wouldBeVisibleInReal = false;

      if (!saved) {
        unlinked++;
      } else if (saved.ignored) {
        ignored++;
        bucket = "ignorada";
      } else if (isContext) {
        contextVisible += saved.visible ? 1 : 0;
        wouldBeVisibleInReal = saved.visible;
        bucket = saved.visible ? "contexto visivel" : "contexto oculto";
      } else if (hasCompleteLink) {
        linkedComplete++;
        wouldBeVisibleInReal = !!saved.production_visible;
        bucket = saved.production_visible ? "producao visivel" : "producao oculta";
      } else {
        unlinked++;
      }

      if (wouldBeVisibleInReal) visibleInReal++;
      else hiddenInReal++;

      if (samples.length < 10) {
        samples.push({
          layer_key: layerKey,
          mesh_name: saved?.mesh_name ?? mesh.name ?? null,
          material_name: saved?.material_name ?? getMeshMaterialName(mesh) ?? null,
          assigned_house_number: saved?.assigned_house_number ?? null,
          service_macro_id: saved?.service_macro_id ?? null,
          service_scope_id: saved?.service_scope_id ?? null,
          production_visible: !!saved?.production_visible,
          progress_percent: saved?.progress_percent ?? null,
          bucket,
          actual_visible: mesh.visible,
        });
      }
    });

    const result = {
      activeLoadedParts: supplementalGlbParts.filter((part) => part.visible && supplementalGlbScenesRef.current.has(part.id)).length,
      totalPersistedParts: supplementalGlbParts.filter((part) => part.persisted).length,
      glbPartMeshesInScene,
      linkedComplete,
      unlinked,
      contextVisible,
      ignored,
      visibleInReal,
      hiddenInReal,
      viewMode,
      sample: samples,
    };

    console.log("[GLB Parts Real Diagnostic]", result);
    toast.info(`Diagnostico 3D Real: ${glbPartMeshesInScene} meshes de partes, ${linkedComplete} vinculadas, ${visibleInReal} visiveis no Real.`);
  }, [buildCurrentMeshMap, meshHooks.meshMap, supplementalGlbParts, traverseActiveModelMeshes, viewMode]);

  // Re-aplica modo quando meshMap chega/atualiza ou cena fica pronta
  useEffect(() => {
    if (meshHooks.meshMap.size > 0 && (sceneObj || supplementalGlbParts.length > 0)) applyViewMode(viewMode);
  }, [meshHooks.meshMap, sceneObj, supplementalGlbParts.length, viewMode, applyViewMode]);

  // Aplica isolamento (sobrepõe modo de visão)
  useEffect(() => {
    if (!isolatedKeys) { applyViewMode(viewMode); return; }
    traverseActiveModelMeshes((mesh) => {
      mesh.visible = isolatedKeys.has(getMeshLayerKey(mesh));
    });
  }, [isolatedKeys, applyViewMode, viewMode, traverseActiveModelMeshes]);

  useEffect(() => {
    if (completeVisualResetNonce === 0 || viewMode !== "complete") return;
    restoreCompleteSceneVisibility("layers show all post-state");
  }, [completeVisualResetNonce, restoreCompleteSceneVisibility, viewMode]);

  useEffect(() => {
    if (!hideLinkedInReview || !selectedMeshKey) return;
    const saved = getCurrentMeshRecord(selectedMeshKey);
    if (isCompleteProductionLink(saved) && !isContextProjectModelMesh(saved)) {
      clearMeshSelection("review linked filter");
    }
  }, [clearMeshSelection, getCurrentMeshRecord, hideLinkedInReview, isCompleteProductionLink, selectedMeshKey]);

  // Desabilita autoMode (LayersPanel) fora do modo simulação
  useEffect(() => {
    if (viewMode !== "simulation" && layerManager.autoMode) {
      layerManager.setAutoMode(false);
    }
  }, [viewMode, layerManager]);

  const pendingMeshCount = useMemo(() => {
    let n = 0;
    buildCurrentMeshMap(meshHooks.meshMap).forEach((m) => {
      if (m.ignored) return;
      if (m.assigned_house_number == null || m.service_macro_id == null) n++;
    });
    return n;
  }, [buildCurrentMeshMap, meshHooks.meshMap]);

  const handleBulkMarkContext = useCallback(async (presetKey: GlbContextPresetKey) => {
    if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return; }
    if (!projectId || !sceneObj) return;
    const preset = GLB_CONTEXT_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;

    setContextBulkAction(presetKey);
    try {
      const seen = new Set<string>();
      const updates: Array<Partial<ProjectModelMesh> & { project_id: string; layer_key: string }> = [];
      let found = 0;
      let skippedLinked = 0;
      let alreadyContext = 0;

      sceneObj.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        const layerKey = getMeshLayerKey(mesh);
        if (seen.has(layerKey)) return;
        seen.add(layerKey);

        const saved = getCurrentMeshRecord(layerKey);
        const searchText = [
          saved?.mesh_name,
          saved?.material_name,
          mesh.name,
          getMeshMaterialName(mesh),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!preset.terms.some((term) => searchText.includes(term.toLowerCase()))) return;

        found++;
        if (isContextProjectModelMesh(saved)) {
          alreadyContext++;
          return;
        }
        const hasProductiveLink = isCompleteProductionLink(saved);
        if (hasProductiveLink) {
          skippedLinked++;
          return;
        }

        updates.push({
          project_id: projectId,
          layer_key: layerKey,
          mesh_name: saved?.mesh_name || mesh.name || "",
          material_name: saved?.material_name || getMeshMaterialName(mesh),
          detected_house_number: saved?.detected_house_number ?? parseHouseNumberFromMesh(mesh.name || ""),
          assigned_house_number: null,
          service_macro_id: GLB_CONTEXT_MESH_MARKER,
          service_scope_id: GLB_CONTEXT_MESH_MARKER,
          production_visible: false,
          progress_percent: 0,
          visible: true,
        });
      });

      const batchSize = 100;
      const errors: any[] = [];
      let sent = 0;
      for (let index = 0; index < updates.length; index += batchSize) {
        const batch = updates.slice(index, index + batchSize);
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(batch, { onConflict: "project_id,layer_key" });
        sent += batch.length;
        if (error) errors.push(error);
      }

      console.log("[GLB Real Context] bulk mark", {
        preset: preset.key,
        found,
        marked: updates.length,
        alreadyContext,
        skippedLinked,
        sent,
        batchSize,
        errors: errors.length,
        sample: updates.slice(0, 8).map((mesh) => ({
          layer_key: mesh.layer_key,
          mesh_name: mesh.mesh_name,
          material_name: mesh.material_name,
        })),
      });

      if (errors.length > 0) throw errors[0];

      setTrustedGlbLinkKeys((prev) => {
        const next = new Set(prev);
        updates.forEach((update) => next.add(update.layer_key));
        return next;
      });
      const refreshed = await meshHooks.refresh();
      if (refreshed?.length) {
        const refreshedMap = new Map(refreshed.map((mesh) => [mesh.layer_key, mesh]));
        applyViewMode(viewMode, refreshedMap);
      }
      toast.success(`${preset.label}: ${updates.length} marcadas · ${skippedLinked} puladas por vínculo produtivo · ${alreadyContext} já eram contexto · ${found} encontradas`);
    } catch (error) {
      console.error("[GLB Real Context] bulk mark error", error);
      toast.error("Falha ao marcar contexto em lote.");
    } finally {
      setContextBulkAction(null);
    }
  }, [applyViewMode, canManage3D, getCurrentMeshRecord, isCompleteProductionLink, meshHooks, projectId, sceneObj, viewMode]);

  const buildContextPreview = useCallback((presetKey: GlbContextPresetKey): GlbContextPreview | null => {
    if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return null; }
    if (!projectId || !sceneObj) return null;
    const preset = GLB_CONTEXT_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return null;

    const seen = new Set<string>();
    const materialCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();
    const updates: Array<Partial<ProjectModelMesh> & { project_id: string; layer_key: string }> = [];
    let found = 0;
    let skippedLinked = 0;
    let alreadyContext = 0;

    sceneObj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const layerKey = getMeshLayerKey(mesh);
      if (seen.has(layerKey)) return;
      seen.add(layerKey);

      const saved = getCurrentMeshRecord(layerKey);
      const meshName = saved?.mesh_name || mesh.name || "";
      const materialName = saved?.material_name || getMeshMaterialName(mesh);
      const searchText = [meshName, materialName].filter(Boolean).join(" ").toLowerCase();
      if (!preset.terms.some((term) => searchText.includes(term.toLowerCase()))) return;

      found++;
      materialCounts.set(materialName || "(sem material)", (materialCounts.get(materialName || "(sem material)") ?? 0) + 1);
      nameCounts.set(meshName || "(sem nome)", (nameCounts.get(meshName || "(sem nome)") ?? 0) + 1);

      if (isContextProjectModelMesh(saved)) {
        alreadyContext++;
        return;
      }
      const hasProductiveLink = isCompleteProductionLink(saved);
      if (hasProductiveLink) {
        skippedLinked++;
        return;
      }

      updates.push({
        project_id: projectId,
        layer_key: layerKey,
        mesh_name: meshName,
        material_name: materialName,
        detected_house_number: saved?.detected_house_number ?? parseHouseNumberFromMesh(mesh.name || ""),
        assigned_house_number: null,
        service_macro_id: GLB_CONTEXT_MESH_MARKER,
        service_scope_id: GLB_CONTEXT_MESH_MARKER,
        production_visible: false,
        progress_percent: 0,
        visible: true,
      });
    });

    return {
      presetKey,
      title: preset.label,
      found,
      alreadyContext,
      skippedLinked,
      wouldMark: updates,
      materialNames: Array.from(materialCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => `${name} (${count})`),
      meshNames: Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => `${name} (${count})`),
      sample: updates.slice(0, 10).map((mesh) => ({
        layer_key: mesh.layer_key,
        mesh_name: String(mesh.mesh_name ?? ""),
        material_name: String(mesh.material_name ?? ""),
      })),
    };
  }, [canManage3D, getCurrentMeshRecord, isCompleteProductionLink, projectId, sceneObj]);

  const openContextPreview = useCallback((presetKey: GlbContextPresetKey) => {
    const preview = buildContextPreview(presetKey);
    if (preview) setContextPreview(preview);
  }, [buildContextPreview]);

  const applyContextPreview = useCallback(async () => {
    if (!contextPreview || contextPreview.presetKey === "clear") return;
    setContextBulkAction(contextPreview.presetKey);
    try {
      const batchSize = 100;
      const errors: any[] = [];
      let sent = 0;
      for (let index = 0; index < contextPreview.wouldMark.length; index += batchSize) {
        const batch = contextPreview.wouldMark.slice(index, index + batchSize);
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(batch, { onConflict: "project_id,layer_key" });
        sent += batch.length;
        if (error) errors.push(error);
      }
      console.log("[GLB Real Context] bulk mark confirmed", {
        preset: contextPreview.presetKey,
        found: contextPreview.found,
        marked: contextPreview.wouldMark.length,
        alreadyContext: contextPreview.alreadyContext,
        skippedLinked: contextPreview.skippedLinked,
        sent,
        batchSize,
        errors: errors.length,
        sample: contextPreview.sample,
      });
      if (errors.length > 0) throw errors[0];

      setTrustedGlbLinkKeys((prev) => {
        const next = new Set(prev);
        contextPreview.wouldMark.forEach((mesh) => next.add(mesh.layer_key));
        return next;
      });
      const refreshed = await meshHooks.refresh();
      if (refreshed?.length) {
        const refreshedMap = new Map(refreshed.map((mesh) => [mesh.layer_key, mesh]));
        applyViewMode(viewMode, refreshedMap);
      }
      toast.success(`${contextPreview.title}: ${sent} marcadas · ${contextPreview.skippedLinked} puladas por vínculo produtivo · ${contextPreview.alreadyContext} já eram contexto`);
      setContextPreview(null);
    } catch (error) {
      console.error("[GLB Real Context] bulk mark confirmed error", error);
      toast.error("Falha ao marcar contexto em lote.");
    } finally {
      setContextBulkAction(null);
    }
  }, [applyViewMode, contextPreview, meshHooks, viewMode]);

  const handleClearQuickContexts = useCallback(async () => {
    if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return; }
    if (!projectId) return;
    setContextBulkAction("grass");
    try {
      const contexts = Array.from(buildCurrentMeshMap(meshHooks.meshMap).values()).filter((mesh) =>
        isContextProjectModelMesh(mesh) && mesh.assigned_house_number == null,
      );
      const batchSize = 100;
      const errors: any[] = [];
      let sent = 0;
      for (let index = 0; index < contexts.length; index += batchSize) {
        const batch = contexts.slice(index, index + batchSize).map((mesh) => ({
          project_id: projectId,
          layer_key: mesh.layer_key,
          service_macro_id: null,
          service_scope_id: null,
          production_visible: false,
          progress_percent: 0,
        }));
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(batch, { onConflict: "project_id,layer_key" });
        sent += batch.length;
        if (error) errors.push(error);
      }
      if (errors.length > 0) throw errors[0];
      const refreshed = await meshHooks.refresh();
      if (refreshed?.length) {
        const refreshedMap = new Map(refreshed.map((mesh) => [mesh.layer_key, mesh]));
        applyViewMode(viewMode, refreshedMap);
      }
      toast.success(`Contextos sem vínculo produtivo limpos: ${sent}.`);
    } catch (error) {
      console.error("[GLB Real Context] clear contexts error", error);
      toast.error("Falha ao limpar contextos.");
    } finally {
      setContextBulkAction(null);
    }
  }, [applyViewMode, buildCurrentMeshMap, canManage3D, meshHooks, projectId, viewMode]);

  const logContextAudit = useCallback(() => {
    const contexts = Array.from(buildCurrentMeshMap(meshHooks.meshMap).values()).filter((mesh) => isContextProjectModelMesh(mesh));
    const materialCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();
    const suspects: ProjectModelMesh[] = [];
    contexts.forEach((mesh) => {
      const material = mesh.material_name || "(sem material)";
      const name = mesh.mesh_name || "(sem nome)";
      const text = `${name} ${material}`.toLowerCase();
      materialCounts.set(material, (materialCounts.get(material) ?? 0) + 1);
      nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
      if (GLB_CONTEXT_SUSPECT_TERMS.some((term) => text.includes(term))) {
        suspects.push(mesh);
      }
    });
    console.log("[GLB Context Audit]", {
      totalContexts: contexts.length,
      byMaterial: Array.from(materialCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30),
      byMeshName: Array.from(nameCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30),
      sample: contexts.slice(0, 20).map((mesh) => ({
        layer_key: mesh.layer_key,
        mesh_name: mesh.mesh_name,
        material_name: mesh.material_name,
      })),
      suspects: suspects.slice(0, 30).map((mesh) => ({
        layer_key: mesh.layer_key,
        mesh_name: mesh.mesh_name,
        material_name: mesh.material_name,
      })),
    });
    toast.info(`Auditoria enviada ao console: ${contexts.length} contextos, ${suspects.length} suspeitos.`);
  }, [buildCurrentMeshMap, meshHooks.meshMap]);

  // Sincronização 3D Real
  const handleSync3DReal = useCallback(async (options?: { silent?: boolean }) => {
    if (!canSync3DReal) { toast.error("Você precisa ter permissão de edição para sincronizar o 3D Real."); return; }
    if (!projectId) return;
    setIsSyncing(true);
    clearMeshSelection("3D Real sync started");
    try {
      const meshMapBeforeRefresh = buildCurrentMeshMap(meshHooks.meshMap);
      const refreshedAtSync = await meshHooks.refresh();
      const refreshedMeshMap = buildCurrentMeshMap(new Map((refreshedAtSync || []).map((mesh) => [mesh.layer_key, mesh])));
      const sourceMeshMap = refreshedAtSync ? refreshedMeshMap : meshMapBeforeRefresh;
      console.log("[GLB MeshMap Consistency] sync source", {
        projectId,
        beforeCount: meshMapBeforeRefresh.size,
        refreshedCount: refreshedAtSync?.length ?? null,
        watched: GLB_REAL_SYNC_WATCH_KEYS.map((layerKey) => ({
          layer_key: layerKey,
          meshMapBeforeHas: meshMapBeforeRefresh.has(layerKey),
          refreshedMapHas: refreshedMeshMap.has(layerKey),
          overrideHas: meshReviewOverrides.has(layerKey),
          before: meshMapBeforeRefresh.get(layerKey) ?? null,
          refreshed: refreshedMeshMap.get(layerKey) ?? null,
          override: sanitizeGlbMeshForCurrentModel(meshReviewOverrides.get(layerKey) ?? null),
        })),
      });

      const activeSceneLayerKeys = collectActiveModelLayerKeys();
      const allMeshes = Array.from(sourceMeshMap.values())
        .filter((mesh) => activeSceneLayerKeys.has(mesh.layer_key));
      const meshes = allMeshes.filter(m => !m.ignored);
      if (meshes.length === 0) {
        if (!options?.silent) toast.info("Nenhuma mesh registrada.");
        return;
      }

      let housesForSync: any[] = currentProject?.houses || [];
      const { data: housesData, error: housesError } = await supabase
        .from("houses")
        .select("house_number, macros")
        .eq("project_id", projectId)
        .order("house_number", { ascending: true });
      if (housesError) {
        console.error("[GLB Real Sync] houses load error", housesError);
      } else if (housesData?.length) {
        housesForSync = housesData.map((house: any) => ({
          id: house.house_number,
          houseNumber: house.house_number,
          house_number: house.house_number,
          macros: Array.isArray(house.macros) ? house.macros : [],
        }));
      }

      const progressMap = new Map<string, number>();
      const progressSourceMap = new Map<string, "houses.macros" | "weekly_productions">();
      housesForSync.forEach((h: any) => {
        const hn = h.houseNumber ?? h.house_number ?? h.number ?? h.id;
        (h.macros || []).forEach((macro: any) => {
          (macro.scopes || []).forEach((scope: any) => {
            const progressKey = `${hn}::${macro.id}::${scope.id}`;
            const progress = Number(scope.progress || 0);
            progressMap.set(progressKey, progress);
            if (progress > 0) progressSourceMap.set(progressKey, "houses.macros");
          });
        });
      });

      const { data: weeklyProductionRows, error: weeklyProductionError } = await supabase
        .from("weekly_productions")
        .select("macro_id, scope_id, house_ids")
        .eq("project_id", projectId)
        .is("deleted_at", null);

      if (weeklyProductionError) {
        console.error("[GLB Real Sync] weekly productions load error", weeklyProductionError);
      } else {
        (weeklyProductionRows || []).forEach((row: any) => {
          const houseIds = ((row.house_ids as number[]) || []);
          houseIds.forEach((houseId) => {
            const progressKey = `${houseId}::${row.macro_id}::${row.scope_id}`;
            const currentProgress = progressMap.get(progressKey) ?? 0;
            if (currentProgress <= 0) {
              progressMap.set(progressKey, 100);
              progressSourceMap.set(progressKey, "weekly_productions");
            }
          });
        });
      }

      const ignoredCount = allMeshes.filter((mesh) => mesh.ignored).length;
      const contextCount = allMeshes.filter((mesh) => !mesh.ignored && isContextProjectModelMesh(mesh)).length;
      const linkedProductionMeshes = allMeshes.filter((mesh) => isCompleteProductionLink(mesh));
      const linkedCount = linkedProductionMeshes.length;
      const unlinkedCount = Math.max(0, allMeshes.length - linkedCount - ignoredCount - contextCount);
      const watchedDiagnostics = GLB_REAL_SYNC_WATCH_KEYS.map((layerKey) => {
        const mesh = sourceMeshMap.get(layerKey);
        if (!mesh) {
          return {
            layer_key: layerKey,
            status: "NOT_FOUND_IN_MESH_MAP",
            meshMapBeforeHas: meshMapBeforeRefresh.has(layerKey),
            refreshedMapHas: refreshedMeshMap.has(layerKey),
            overrideHas: meshReviewOverrides.has(layerKey),
          };
        }
        const isContextMesh = isContextProjectModelMesh(mesh);
        const missingFields = isContextMesh ? [] : [
          mesh.assigned_house_number == null ? "missing assigned_house_number" : null,
          mesh.service_macro_id == null ? "missing service_macro_id" : null,
          mesh.service_scope_id == null ? "missing service_scope_id" : null,
        ].filter(Boolean);
        const progressKey = !isContextMesh && missingFields.length === 0
          ? `${mesh.assigned_house_number}::${mesh.service_macro_id}::${mesh.service_scope_id}`
          : null;
        const progress = progressKey ? (progressMap.get(progressKey) ?? 0) : 0;
        const progressSource = progressKey ? (progressSourceMap.get(progressKey) ?? "none") : "none";
        const calculatedProductionVisible = progress > 0;
        const counterBucket = mesh.ignored
          ? "ignored"
          : missingFields.length > 0
            ? "sem vínculo"
            : calculatedProductionVisible
              ? "visíveis"
              : "ocultas";
        return {
          layer_key: mesh.layer_key,
          mesh_name: mesh.mesh_name,
          material_name: mesh.material_name,
          assigned_house_number: mesh.assigned_house_number,
          service_macro_id: mesh.service_macro_id,
          service_scope_id: mesh.service_scope_id,
          ignored: mesh.ignored,
          production_visible_before_sync: mesh.production_visible,
          progress_percent_before_sync: mesh.progress_percent,
          progress_key: progressKey,
          progress_found_in_houses_macros: progress,
          progress_source: progressSource,
          calculated_production_visible: calculatedProductionVisible,
          calculated_progress_percent: progress,
          counter_bucket: counterBucket,
          is_context: isContextMesh,
          missing_fields: missingFields,
        };
      });
      console.log("[GLB Real Sync Check] start", {
        projectId,
        meshMapTotal: allMeshes.length,
        linkedCompleteTotal: linkedCount,
        unlinkedTotal: unlinkedCount,
        ignoredTotal: ignoredCount,
        watchedDiagnostics,
      });

      if (import.meta.env.DEV) {
        const house20 = housesForSync.find((h: any) => (h.houseNumber ?? h.house_number ?? h.number ?? h.id) === 20) ?? null;
        const linkedMeshes = meshes
          .filter((mesh) => isCompleteProductionLink(mesh))
          .map((mesh) => ({
            layer_key: mesh.layer_key,
            mesh_name: mesh.mesh_name,
            assigned_house_number: mesh.assigned_house_number,
            service_macro_id: mesh.service_macro_id,
            service_scope_id: mesh.service_scope_id,
            ignored: mesh.ignored,
          }));
        console.log("[GLB Real Sync] inputs", {
          projectId,
          totalHouses: housesForSync.length,
          weeklyProductionsForFallback: weeklyProductionRows?.length ?? 0,
          house20Found: !!house20,
          house20Scopes: house20
            ? (house20.macros || []).flatMap((macro: any) =>
                (macro.scopes || []).map((scope: any) => ({
                  macro_id: macro.id,
                  macro_name: macro.name,
                  scope_id: scope.id,
                  scope_name: scope.name,
                  progress: Number(scope.progress || 0),
                })),
              )
            : [],
          linkedCasa20: linkedMeshes.filter((mesh) => mesh.assigned_house_number === 20),
          linkedMeshes: linkedMeshes.slice(0, 20),
        });
      }

      let visible = 0, hidden = 0;
      const now = new Date().toISOString();
      const updates: Array<Partial<ProjectModelMesh> & { project_id: string; layer_key: string }> = [];

      linkedProductionMeshes.forEach((mesh) => {
        const progressKey = `${mesh.assigned_house_number}::${mesh.service_macro_id}::${mesh.service_scope_id}`;
        const progress = progressMap.get(progressKey) ?? 0;
        const progressSource = progressSourceMap.get(progressKey) ?? "none";
        const pv = progress > 0;
        if (pv) visible++; else hidden++;
        if (import.meta.env.DEV && mesh.assigned_house_number === 20) {
          console.log("[GLB Real Sync] mesh decision", {
            layer_key: mesh.layer_key,
            mesh_name: mesh.mesh_name,
            assigned_house_number: mesh.assigned_house_number,
            service_macro_id: mesh.service_macro_id,
            service_scope_id: mesh.service_scope_id,
            progressKey,
            progress,
            progressSource,
            production_visible: pv,
          });
        }
        const currentProgress = Number(mesh.progress_percent ?? 0);
        if (mesh.production_visible !== pv || currentProgress !== progress) {
          updates.push({
            project_id: projectId,
            layer_key: mesh.layer_key,
            production_visible: pv,
            progress_percent: progress,
            last_synced_at: now,
          });
        }
      });

      const batchSize = 100;
      const syncErrors: any[] = [];
      let updatesSent = 0;
      for (let index = 0; index < updates.length; index += batchSize) {
        const batch = updates.slice(index, index + batchSize);
        const { error } = await supabase
          .from("project_model_meshes" as any)
          .upsert(batch, { onConflict: "project_id,layer_key" });
        updatesSent += batch.length;
        if (error) syncErrors.push(error);
      }
      console.log("[GLB Real Sync Optimized]", {
        projectId,
        totalMeshMap: allMeshes.length,
        totalContext: contextCount,
        totalLinkedProduction: linkedCount,
        totalUnlinkedIgnoredInSync: unlinkedCount,
        totalIgnored: ignoredCount,
        totalUpdatesNeeded: updates.length,
        totalUpdatesSent: updatesSent,
        batchSize,
        errors: syncErrors.length,
      });
      if (import.meta.env.DEV) {
        console.log("[GLB Real Visibility Debug]", linkedProductionMeshes.slice(0, 10).map((mesh) => {
          const progressKey = `${mesh.assigned_house_number}::${mesh.service_macro_id}::${mesh.service_scope_id}`;
          const progress = progressMap.get(progressKey) ?? 0;
          const progressSource = progressSourceMap.get(progressKey) ?? "none";
          return {
            layer_key: mesh.layer_key,
            house_number: mesh.assigned_house_number,
            macro_id: mesh.service_macro_id,
            scope_id: mesh.service_scope_id,
            progress,
            progressSource,
            production_visible: progress > 0,
            hidden_reason: progress > 0 ? null : "sem progresso para este servico/casa",
          };
        }));
      }
      if (syncErrors.length > 0) {
        console.error("[GLB Real Sync Optimized] update errors", syncErrors);
        throw syncErrors[0];
      }

      const refreshedMeshes = await meshHooks.refresh();
      let contextApplied = contextCount;
      let unlinkedApplied = unlinkedCount;
      if (viewMode === "real") {
        setIsolatedKeys(null);
      }
      if (refreshedMeshes?.length) {
        const refreshedMap = buildCurrentMeshMap(new Map(refreshedMeshes.map((mesh) => [mesh.layer_key, mesh])));
        const appliedStats = applyViewMode(viewMode === "real" ? "real" : viewMode, refreshedMap);
        if (viewMode === "real") {
          visible = appliedStats.linkedVisible;
          hidden = appliedStats.linkedHidden;
          contextApplied = appliedStats.contextVisible;
          unlinkedApplied = appliedStats.unlinkedHidden;
        }
      } else {
        const appliedStats = applyViewMode(viewMode);
        if (viewMode === "real") {
          visible = appliedStats.linkedVisible;
          hidden = appliedStats.linkedHidden;
          contextApplied = appliedStats.contextVisible;
          unlinkedApplied = appliedStats.unlinkedHidden;
        }
      }
      setLastSyncResult({ total: linkedCount, visible, hidden, unlinked: unlinkedApplied, syncedAt: new Date() });
      if (!options?.silent) toast.success(`Sincronizado: ${visible} produção visíveis · ${hidden} produção ocultas · ${contextApplied} contextos · ${unlinkedApplied} sem vínculo ignoradas`);
    } catch (err) {
      console.error("[Sync3D]", err);
      toast.error("Erro ao sincronizar");
    } finally { setIsSyncing(false); }
  }, [buildCurrentMeshMap, canSync3DReal, projectId, meshHooks, currentProject, applyViewMode, viewMode, meshReviewOverrides, sanitizeGlbMeshForCurrentModel, isCompleteProductionLink, collectActiveModelLayerKeys, clearMeshSelection]);

  // Auto-sync após realtime, debounced (somente se já sincronizou ao menos 1x)
  const autoSync = useCallback(() => {
    if (!lastSyncResult) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => { void handleSync3DReal({ silent: true }); }, 800);
  }, [lastSyncResult, handleSync3DReal]);
  const autoSyncRef = useRef(autoSync);
  useEffect(() => { autoSyncRef.current = autoSync; }, [autoSync]);

  const handleMeshClick = useCallback((obj: THREE.Object3D) => {
    if (!assignMode) return;
    if (!(obj as THREE.Mesh).isMesh) return;

    const meshName = obj.name || `Mesh_${obj.id}`;

    // Sobe até o "componente raiz" da casa: no SketchUp cada casa é um
    // Component/Group; ao exportar para GLB vira um Object3D filho direto
    // da Scene (ou de um wrapper raiz). Subimos enquanto houver pai que
    // NÃO seja a Scene nem o wrapper raiz, para pegar a casa inteira em
    // vez de apenas o subgrupo (ex.: "Telhado") clicado.
    let rootGroup: THREE.Object3D | null = null;
    let cursor: THREE.Object3D | null = obj.parent ?? null;
    while (cursor && cursor.parent && cursor.parent.type !== "Scene") {
      cursor = cursor.parent;
    }
    // cursor agora é o filho direto da Scene (ou null se obj era topo).
    rootGroup = cursor && cursor.type !== "Scene" ? cursor : (obj.parent ?? null);

    const isRealGroup = !!rootGroup && rootGroup.type !== "Scene" && (rootGroup.children?.length ?? 0) > 0;
    const groupName = isRealGroup ? (rootGroup?.name || undefined) : undefined;

    const childMeshes: string[] = [];
    if (isRealGroup && rootGroup) {
      rootGroup.traverse(c => {
        if ((c as THREE.Mesh).isMesh) {
          const n = c.name || `Mesh_${c.id}`;
          if (n !== meshName) childMeshes.push(n);
        }
      });
    }

    setPickedMesh({ name: meshName, groupName, childMeshes });
  }, [assignMode]);

  const confirmAssignment = useCallback(async (houseNumber: number, includeChildren: boolean) => {
    if (!canAssignHouses) { toast.error("Sem permissão para atribuir casas no Mapa 3D."); return; }
    if (!pickedMesh) return;
    setAssignSaving(true);
    const targets = includeChildren
      ? [pickedMesh.name, ...pickedMesh.childMeshes]
      : [pickedMesh.name];
    const { error } = await meshAssignments.assignMeshes(targets, houseNumber);
    setAssignSaving(false);
    if (error) {
      toast.error("Erro ao atribuir casa: " + error.message);
      return;
    }
    toast.success(
      `${targets.length} mesh(es) atribuído(s) à Casa ${String(houseNumber).padStart(2, "0")}`
    );
    setPickedMesh(null);
  }, [canAssignHouses, pickedMesh, meshAssignments]);

  const clearAssignment = useCallback(async () => {
    if (!canDelete3D) { toast.error("Sem permissão para remover atribuições do Mapa 3D."); return; }
    if (!pickedMesh) return;
    if (!window.confirm("Remover esta atribuição de casa? Esta ação não poderá ser desfeita.")) return;
    setAssignSaving(true);
    await meshAssignments.clearMesh(pickedMesh.name);
    setAssignSaving(false);
    toast.success("Atribuição removida");
    setPickedMesh(null);
  }, [canDelete3D, pickedMesh, meshAssignments]);

  // ============================================================
  // Integração 3D ⇄ Produção em tempo real
  // ============================================================
  // Constrói DOIS mapas a partir de currentProject.houses:
  //   1) progressMap (agregado): média da obra por macro / macro::scope
  //      → alimenta camadas SEM house_number (vínculo geral)
  //   2) perHouseProgress: progresso individual da casa
  //      chave: `houseNumber::macro_id::scope_id` (ou `houseNumber::macro_id`)
  //      → alimenta camadas COM house_number (cada casa acende sozinha)
  //
  // As casas já são mantidas atualizadas em tempo real pelo canal
  // `houses-realtime-*` do ConstructionContext (recompute roda no backend
  // a cada item de diário/produção). Assim, ao lançar produção em UMA casa,
  // só os meshes daquela casa atualizam.
  useEffect(() => {
    if (!currentProject || !layerManager.autoMode || layerManager.links.length === 0) return;

    const houses = currentProject.houses || [];
    if (houses.length === 0) return;

    const totalHouses = houses.length;
    const sumByScope = new Map<string, number>();
    const sumByMacro = new Map<string, number>();
    const countByMacro = new Map<string, number>();
    const perHouseProgress = new Map<string, number>();

    houses.forEach(h => {
      const houseNum = (h as any).houseNumber ?? (h as any).house_number ?? (h as any).number;
      (h.macros || []).forEach((m: any) => {
        let macroSum = 0;
        let macroCount = 0;
        (m.scopes || []).forEach((s: any) => {
          const progress = s.progress || 0;
          const aggKey = `${m.id}::${s.id}`;
          sumByScope.set(aggKey, (sumByScope.get(aggKey) || 0) + progress);
          macroSum += progress;
          macroCount += 1;

          // Mapa POR CASA
          if (houseNum != null) {
            perHouseProgress.set(`${houseNum}::${m.id}::${s.id}`, progress);
          }
        });
        if (macroCount > 0) {
          const macroAvg = macroSum / macroCount;
          sumByMacro.set(m.id, (sumByMacro.get(m.id) || 0) + macroAvg);
          countByMacro.set(m.id, (countByMacro.get(m.id) || 0) + 1);
          if (houseNum != null) {
            perHouseProgress.set(`${houseNum}::${m.id}`, macroAvg);
          }
        }
      });
    });

    const progressMap = new Map<string, number>();
    sumByScope.forEach((sum, key) => progressMap.set(key, sum / totalHouses));
    sumByMacro.forEach((sum, macroId) => {
      const n = countByMacro.get(macroId) || totalHouses;
      progressMap.set(macroId, sum / n);
    });

    layerManager.updateFromMacroProgress(progressMap);
    layerManager.updateFromHousesProgress(perHouseProgress);
  }, [
    currentProject?.id,
    currentProject?.houses,
    layerManager.autoMode,
    layerManager.links,
    layerManager.updateFromMacroProgress,
    layerManager.updateFromHousesProgress,
  ]);

  // Realtime: lançamentos no Diário/Produção disparam refresh das casas,
  // que por sua vez recalcula o progresso por camada acima.
  useEffect(() => {
    if (!projectId || !layerManager.autoMode) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // diary_items não tem project_id — filtramos pelo lado do cliente
    // comparando com o conjunto de house_id do projeto atual.
    const houseIdSet = new Set(
      (currentProject?.houses || []).map((h: any) => h.id).filter(Boolean)
    );

    const subscribe = () => {
      channel = supabase
        .channel(`map3d-production-${projectId}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "productions",
          filter: `project_id=eq.${projectId}`,
        }, () => { void refreshHousesFromDB(); autoSyncRef.current(); })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "weekly_productions",
          filter: `project_id=eq.${projectId}`,
        }, () => { void refreshHousesFromDB(); autoSyncRef.current(); })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "diary_items",
        }, (payload: any) => {
          // Só refazemos se o item alterado pertence a uma casa deste projeto
          const houseId = payload?.new?.house_id ?? payload?.old?.house_id;
          if (!houseId || houseIdSet.has(houseId)) {
            void refreshHousesFromDB();
            autoSyncRef.current();
          }
        })
        .subscribe();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (channel) { supabase.removeChannel(channel); channel = null; }
      } else if (!channel) {
        subscribe();
        void refreshHousesFromDB();
      }
    };

    subscribe();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId, layerManager.autoMode, refreshHousesFromDB, currentProject?.houses]);

  // Also mark ready for markers
  useEffect(() => {
    if (markers.length > 0 && !modelData) setSceneReady(true);
  }, [markers.length, modelData]);

  const centerCamera = () => { clearAll3DSelection("camera centered"); setOrbitFocusPoint(null); setFitTrigger(p => p + 1); toast.success("Centralizado"); };
  const resetCameraView = () => { setOrbitFocusPoint(null); setResetTrigger(p => p + 1); toast.success("Visão resetada"); };

  const customLegendItems = currentProject?.customLegendItems || [
    { minPercent: 0, maxPercent: 49, color: "#ef4444" },
    { minPercent: 50, maxPercent: 99, color: "#eab308" },
    { minPercent: 100, maxPercent: 100, color: "#22c55e" }
  ];

  const loadSaved3DMap = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('map_layouts')
        .select('model_3d_url, model_3d_type, model_mtl_url, house_markers_3d, camera_position, camera_target')
        .eq('project_id', projectId).maybeSingle();
      if (error) { console.error('[3D] Load error:', error); return; }
      if (data) {
        if (data.model_3d_url && data.model_3d_type) {
          setGlbLinkScope("preserve");
          setTrustedGlbLinkKeys(new Set());
          const [signedModel, signedMtl] = await Promise.all([
            resolveMap3DSignedUrl(data.model_3d_url),
            resolveMap3DSignedUrl(data.model_mtl_url),
          ]);
          if (signedModel) {
            setModelData({ url: signedModel, type: data.model_3d_type as "gltf" | "obj", mtlUrl: signedMtl || undefined });
          }
        }
        if (data.house_markers_3d && Array.isArray(data.house_markers_3d) && data.house_markers_3d.length > 0)
          setMarkers(data.house_markers_3d as unknown as HouseMarker[]);
        if (data.camera_position && Array.isArray(data.camera_position))
          setSavedPos(data.camera_position as [number, number, number]);
        if (data.camera_target && Array.isArray(data.camera_target))
          setSavedTgt(data.camera_target as [number, number, number]);
      }
    } catch (err) { console.error('[3D] Load error:', err); }
    finally { setIsLoading(false); }
  }, [projectId]);

  useEffect(() => { loadSaved3DMap(); }, [loadSaved3DMap]);

  const save3DMap = async () => {
    if (!canSaveMap) { toast.error("Sem permissão para salvar o Mapa 3D."); return; }
    if (!projectId) { toast.error("Selecione um projeto"); return; }
    setIsSaving(true);
    try {
      const { data: existing } = await supabase.from('map_layouts').select('id').eq('project_id', projectId).maybeSingle();
      const d = {
        model_3d_url: modelData?.url || null, model_3d_type: modelData?.type || null,
        model_mtl_url: modelData?.mtlUrl || null, house_markers_3d: markers as unknown as any[],
        camera_position: pendingPos || savedPos, camera_target: pendingTgt || savedTgt
      };
      const { error } = existing
        ? await supabase.from('map_layouts').update(d).eq('project_id', projectId)
        : await supabase.from('map_layouts').insert([{ project_id: projectId, ...d }]);
      if (error) throw error;
      if (pendingPos) setSavedPos(pendingPos);
      if (pendingTgt) setSavedTgt(pendingTgt);
      setHasChanges(false);
      toast.success("Mapa 3D salvo!");
    } catch (err) { console.error('[3D] Save error:', err); toast.error("Erro ao salvar"); }
    finally { setIsSaving(false); }
  };

  const applyMeshReviewBatchUpdate = useCallback(async (keys: string[], data: Partial<ProjectModelMesh>) => {
    if (!canReviewModel) {
      toast.error("Sem permissao para revisar o modelo 3D.");
      return { applied: 0, failed: keys.length };
    }
    let applied = 0;
    let failed = 0;
    const savedByKey = new Map<string, ProjectModelMesh>();
    for (const key of keys) {
      try {
        const existing = getCurrentMeshRecord(key);
        const saved = await meshHooks.upsertMesh({
          layer_key: key,
          mesh_name: existing?.mesh_name || data.mesh_name || "",
          material_name: existing?.material_name || data.material_name || "",
          detected_house_number: existing?.detected_house_number ?? data.detected_house_number ?? null,
          ...data,
        });
        savedByKey.set(key, saved);
        applied++;
      } catch (error) {
        failed++;
        console.error("[GLB Mesh Batch Link] apply error", { key, error });
      }
    }
    const refreshed = await meshHooks.refresh();
    const refreshedMap = new Map((refreshed || []).map((mesh) => [mesh.layer_key, mesh]));
    setTrustedGlbLinkKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.add(key));
      return next;
    });
    setMeshReviewOverrides((prev) => {
      const next = new Map(prev);
      keys.forEach((key) => {
        const saved = refreshedMap.get(key) ?? savedByKey.get(key);
        if (saved) next.set(key, saved);
      });
      return next;
    });
    return { applied, failed };
  }, [canReviewModel, getCurrentMeshRecord, meshHooks]);

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    const uploaded = await uploadFileTo3DStorage(file, folder);
    return uploaded?.publicUrl ?? null;
  };

  const importGltfFile = async (
    file: File,
    mode: "preserve" | "new",
    existingGlbRecords = 0,
  ) => {
    setIsLoading(true);
    setSceneReady(false);
    clearSmartLinkPreview("new GLB import");
    clearMeshSelection("new GLB import");
    setPickedMesh(null);
    setWalkInspection(null);
    setMeshReviewOverrides(new Map());
    try {
      const url = await uploadFile(file, 'gltf');
      if (!url) return;
      if (supplementalGlbPartsRef.current.length > 0) {
        toast.info("As partes GLB complementares permanecem salvas e podem ser removidas separadamente.");
      }
      setTrustedGlbLinkKeys(new Set());
      setGlbLinkScope(mode === "new" ? "fresh" : "preserve");
      let clearedGlbRecords = 0;
      if (mode === "new") {
        clearedGlbRecords = await meshHooks.clearGlbMeshes();
        setMeshReviewOverrides(new Map());
      }
      if (import.meta.env.DEV) {
        console.log("[GLB Import Safety]", {
          projectId,
          fileName: file.name,
          mode,
          oldRecordsFound: existingGlbRecords,
          preservedRecords: mode === "preserve" ? existingGlbRecords : 0,
          clearedGlbRecords,
        });
      }
      setModelData({ url, type: "gltf" });
      setHasChanges(true);
      toast.success(
        mode === "new"
          ? `Modelo carregado. ${clearedGlbRecords} vínculos GLB anteriores foram limpos.`
          : "Modelo carregado preservando vínculos GLB existentes.",
      );
    } finally {
      setPendingGlbImport(null);
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!canImportMainModel) {
      toast.error("Sem permissão para importar modelo 3D.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".gltf") || name.endsWith(".glb")) {
      try {
        const existingGlbRecords = await meshHooks.countGlbMeshes();
        if (existingGlbRecords > 0) {
          setPendingGlbImport({ file, existingGlbRecords });
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
        await importGltfFile(file, "preserve", existingGlbRecords);
      } catch (error) {
        console.error("[GLB Import Safety] import check error", error);
        toast.error("Erro ao preparar importação GLB.");
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else if (name.endsWith(".ifc")) {
      setIsLoading(true); setSceneReady(false);
      try {
        const url = await uploadFile(file, 'ifc');
        if (url) {
          if (supplementalGlbPartsRef.current.length > 0) toast.info("As partes GLB complementares permanecem salvas e podem ser removidas separadamente.");
          setModelData({ url, type: "ifc" }); setHasChanges(true); toast.success("Modelo IFC carregado!");
        }
      } finally { setIsLoading(false); }
    } else if (name.endsWith(".obj")) {
      setPendingObjFile(file); toast.info("OBJ selecionado. Selecione MTL ou 'Sem MTL'");
    } else { toast.error("Use .gltf, .glb, .ifc ou .obj"); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMtlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportMainModel) { toast.error("Sem permissão para importar modelo 3D."); return; }
    const file = e.target.files?.[0]; if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const objUrl = await uploadFile(pendingObjFile, 'obj');
      const mtlUrl = file ? await uploadFile(file, 'mtl') : undefined;
      if (objUrl) {
        if (supplementalGlbPartsRef.current.length > 0) toast.info("As partes GLB complementares permanecem salvas e podem ser removidas separadamente.");
        setModelData({ url: objUrl, type: "obj", mtlUrl }); setHasChanges(true); toast.success("Modelo OBJ carregado!");
      }
    } finally { setPendingObjFile(null); setIsLoading(false); if (mtlInputRef.current) mtlInputRef.current.value = ''; }
  };

  const loadObjWithoutMtl = async () => {
    if (!canImportMainModel) { toast.error("Sem permissão para importar modelo 3D."); return; }
    if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const url = await uploadFile(pendingObjFile, 'obj');
      if (url) {
        if (supplementalGlbPartsRef.current.length > 0) toast.info("As partes GLB complementares permanecem salvas e podem ser removidas separadamente.");
        setModelData({ url, type: "obj" }); setHasChanges(true); toast.success("OBJ carregado sem materiais");
      }
    } finally { setPendingObjFile(null); setIsLoading(false); }
  };

  const resetView = () => {
    if (!canResetMap) { toast.error("Sem permissão para resetar o Mapa 3D."); return; }
    if (!projectId) return;
    setModelData(null); setMarkers([]); setSelectedMarker(null); setPendingObjFile(null);
    clearAll3DSelection("map reset");
    setMeshReviewOverrides(new Map()); setTrustedGlbLinkKeys(new Set()); setGlbLinkScope("fresh");
    setCameraMode("orbit");
    setSavedPos(null); setSavedTgt(null); setPendingPos(null); setPendingTgt(null); setOrbitFocusPoint(null);
    setSceneReady(false); setHasChanges(true);
    toast.success("Mapa resetado. Salve para confirmar.");
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            {canImportMainModel && (
              <>
                <Input ref={fileInputRef} type="file" accept=".gltf,.glb,.obj,.ifc" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!fileInputRef.current) return;
                    fileInputRef.current.value = "";
                    fileInputRef.current.click();
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}Importar 3D
                </Button>
              </>
            )}
            {canAddGlbPart && modelData && (
              <>
                <Input ref={supplementalGlbInputRef} type="file" accept=".glb" onChange={handleSupplementalGlbUpload} className="hidden" disabled={isLoading} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!supplementalGlbInputRef.current) return;
                    supplementalGlbInputRef.current.value = "";
                    supplementalGlbInputRef.current.click();
                  }}
                  disabled={isLoading}
                  title="Adicionar GLB complementar apenas visual nesta sessao"
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Adicionar parte GLB
                </Button>
              </>
            )}
            {canImportMainModel && pendingObjFile && (<>
              <Input ref={mtlInputRef} type="file" accept=".mtl" onChange={handleMtlUpload} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => mtlInputRef.current?.click()} disabled={isLoading}>MTL</Button>
              <Button variant="secondary" size="sm" onClick={loadObjWithoutMtl} disabled={isLoading}>Sem MTL</Button>
            </>)}
            <Button variant="outline" size="sm" onClick={centerCamera} disabled={isLoading}><Target className="h-4 w-4 mr-1.5" />Centralizar</Button>
            <Button variant="outline" size="sm" onClick={resetCameraView} disabled={isLoading}><Home className="h-4 w-4 mr-1.5" />Resetar Visão</Button>
            {canUseWalkMode && modelData && (
              <Button
                variant={cameraMode === "walk" ? "default" : "outline"}
                size="sm"
                onClick={toggleWalkMode}
                disabled={isLoading}
                title="Use Caminhar para entrar nas casas e olhar ao redor"
              >
                <Move3D className="h-4 w-4 mr-1.5" />
                {cameraMode === "walk" ? "Sair do caminhar" : "Caminhar"}
              </Button>
            )}
            {canUseWalkMode && modelData && (
              <label className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
                <span className="text-muted-foreground">Altura do observador</span>
                <Input
                  type="number"
                  min={1.2}
                  max={2.2}
                  step={0.05}
                  value={observerHeight}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setObserverHeight(Math.min(2.2, Math.max(1.2, value)));
                  }}
                  className="h-7 w-16 px-2 text-xs"
                />
                <span className="text-muted-foreground">m</span>
              </label>
            )}
            {canUsePerformanceMode && modelData && (
              <Button
                variant={performanceMode ? "default" : "outline"}
                size="sm"
                onClick={() => setPerformanceMode((value) => !value)}
                disabled={isLoading}
                title="Reduz custo visual para navegar melhor em modelos pesados"
              >
                Modo desempenho
              </Button>
            )}
            {modelData && (
              <Button
                variant={lightingMode === "night" ? "default" : "outline"}
                size="sm"
                onClick={() => setLightingMode((mode) => mode === "night" ? "day" : "night")}
                disabled={isLoading}
                title={lightingMode === "night" ? "Voltar para iluminação de dia" : "Usar visualização noturna legível"}
              >
                {lightingMode === "night" ? "Noite" : "Dia"}
              </Button>
            )}
            {canChangeZoomSensitivity && modelData && (
              <div className="flex items-center gap-1 rounded-md border border-input bg-background px-1 py-1">
                <span className="hidden items-center gap-1 px-1 text-xs text-muted-foreground sm:flex">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Zoom
                </span>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={zoomSensitivity}
                  onValueChange={(value) => {
                    if (ZOOM_SENSITIVITY_OPTIONS.some((option) => option.value === value)) {
                      setZoomSensitivity(value as ZoomSensitivity);
                    }
                  }}
                  className="gap-0"
                >
                  {ZOOM_SENSITIVITY_OPTIONS.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value} className="h-7 px-2 text-[11px]" title={`Sensibilidade do zoom: ${option.label}`}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}
            {canManageLayers && layerManager.layers.length > 0 && (
              <Button
                variant={showLayers ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  clearAll3DSelection("layers panel toggled");
                  setShowLayers(p => !p);
                }}
                disabled={isLoading}
              >
                <Layers className="h-4 w-4 mr-1.5" />Camadas ({layerManager.layers.length})
              </Button>
            )}
            {canAssignHouses && layerManager.layers.length > 0 && (currentProject?.houses?.length ?? 0) > 0 && (
              <Button
                variant={assignMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setCameraMode("orbit"); setAssignMode(p => !p); clearAll3DSelection("assign mode toggled"); }}
                disabled={isLoading}
                title="Clique nas malhas do modelo para batizar cada casa"
              >
                <MousePointerClick className="h-4 w-4 mr-1.5" />
                {assignMode ? "Sair do modo Atribuir" : "Atribuir Casas"}
                {meshAssignments.assignments.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 text-[10px] px-1">
                    {meshAssignments.assignments.length}
                  </Badge>
                )}
              </Button>
            )}
            {canReviewModel && modelData && (
              <Button
                variant={reviewMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCameraMode("orbit");
                  setReviewMode(p => !p);
                  clearAll3DSelection("review mode toggled");
                  setQuickContextPanelOpen(false);
                  if (!reviewMode) {
                    setAssignMode(false);
                    applyViewMode("complete");
                  }
                }}
                disabled={isLoading}
                title="Clique numa mesh para revisar UUID, geometria e vínculos"
              >
                <ScanSearch className="h-4 w-4 mr-1.5" />
                {reviewMode ? "Sair da Revisão" : "Revisar Modelo"}
                {pendingMeshCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 text-[10px] px-1">
                    {pendingMeshCount} pend.
                  </Badge>
                )}
              </Button>
            )}
            {canReviewModel && reviewMode && (
              <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1 text-xs">
                <Button
                  type="button"
                  variant={hideLinkedInReview ? "default" : "outline"}
                  size="sm"
                  className="h-7"
                  onClick={() => setHideLinkedInReview((value) => !value)}
                  disabled={isLoading}
                  title="Filtro visual local: esconde meshes com Casa e Servico completos"
                >
                  {hideLinkedInReview ? <Eye className="h-3.5 w-3.5 mr-1.5" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
                  {hideLinkedInReview ? "Mostrar vinculadas" : "Ocultar vinculadas"}
                </Button>
                <Button
                  type="button"
                  variant={reviewLinksMode ? "default" : "outline"}
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    if (!reviewLinksMode && smartLinkPreviewEnabled) {
                      clearSmartLinkPreview("review links mode enabled");
                    }
                    setReviewLinksMode((value) => !value);
                    setReviewLinksFilter("all");
                    setReviewLinkHoverTooltip(null);
                  }}
                  disabled={isLoading}
                  title="Auditar visualmente Casa e Servico das meshes vinculadas"
                >
                  <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
                  {reviewLinksMode ? "Ocultar vinculos" : "Revisar vinculos"}
                </Button>
                {reviewLinksMode && ([
                  ["all", "Todas"],
                  ["linked", "Vinculadas"],
                  ["pending", "Sem vinculo"],
                ] as Array<[ReviewLinksFilter, string]>).map(([filter, label]) => (
                  <Button
                    key={filter}
                    type="button"
                    variant={reviewLinksFilter === filter ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setReviewLinksFilter(filter);
                      setReviewLinkHoverTooltip(null);
                    }}
                    disabled={isLoading}
                  >
                    {label}
                  </Button>
                ))}
                <span className="whitespace-nowrap text-muted-foreground">
                  {reviewVisibilityStats.total} total · {reviewVisibilityStats.linked} vinc. · {reviewVisibilityStats.pending} pend. · {reviewVisibilityStats.context} ctx · {reviewVisibilityStats.ignored} ign.
                </span>
              </div>
            )}
            {canReviewModel && reviewMode && sceneObj && (
              <Button
                type="button"
                variant={quickContextPanelOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setQuickContextPanelOpen((open) => !open)}
                disabled={isLoading}
                title="Abrir ferramentas manuais de contexto do 3D Real"
              >
                <Layers className="h-4 w-4 mr-1.5" />
                Contexto rápido
              </Button>
            )}
            {canReviewModel && modelData?.type === "ifc" && projectId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIfcSuggestionsOpen(true)}
                disabled={isLoading}
                title="Revisar sugestões IFC persistidas"
              >
                <ScanSearch className="h-4 w-4 mr-1.5" />
                Sugestões IFC
              </Button>
            )}
            <div id="map3d-ifc-toolbar-slot" className="flex items-center gap-2" />
            {modelData && (
              <ToggleGroup
                type="single"
                size="sm"
                value={viewMode}
                onValueChange={(v) => {
                  if (!v) return;
                  if (v === "real" && !canView3DReal) {
                    toast.error("Sem permissao para visualizar o 3D Real.");
                    return;
                  }
                  if (v === "simulation" && !canViewSimulation) {
                    toast.error("Sem permissao para visualizar a simulacao.");
                    return;
                  }
                  clearAll3DSelection("view mode changed");
                  applyViewMode(v as ViewMode);
                }}
                className="border border-input rounded-md p-0.5 bg-background"
              >
                <ToggleGroupItem value="complete" className="h-7 px-2 text-xs gap-1" title="Mostrar todo o modelo">
                  <Boxes className="h-3.5 w-3.5" />Completa
                </ToggleGroupItem>
                <ToggleGroupItem value="real" className="h-7 px-2 text-xs gap-1" title="Apenas meshes em produção">
                  <Eye className="h-3.5 w-3.5" />3D Real
                </ToggleGroupItem>
                <ToggleGroupItem value="simulation" className="h-7 px-2 text-xs gap-1" title="Modo simulação por camadas">
                  <Sparkles className="h-3.5 w-3.5" />Simulação
                </ToggleGroupItem>
              </ToggleGroup>
            )}
            {modelData && viewMode === "real" && canView3DReal && (
              <div className="relative">
                <Button
                  type="button"
                  variant={realServiceFilterOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRealServiceFilterOpen((open) => !open)}
                  disabled={isLoading}
                  title="Filtro visual temporário dos serviços visíveis no 3D Real"
                >
                  <EyeOff className="h-4 w-4 mr-1.5" />
                  Serviços visíveis
                  {hiddenRealServiceKeys.size > 0 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 text-[10px] px-1">
                      -{hiddenRealServiceKeys.size}
                    </Badge>
                  )}
                </Button>
                {realServiceFilterOpen && (
                  <div className="fixed right-6 top-28 z-[90] flex max-h-[min(70vh,640px)] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-background p-3 text-xs shadow-2xl max-md:left-4 max-md:right-4 max-md:top-24 max-md:w-auto">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Serviços visíveis no 3D Real</p>
                        <p className="text-muted-foreground">Filtro local: só oculta temporariamente, sem salvar no banco.</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setRealServiceFilterOpen(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => updateHiddenRealServices(new Set())}>
                        Mostrar todos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => updateHiddenRealServices(new Set(realServiceRows.map((row) => row.key)))}
                        disabled={realServiceRows.length === 0}
                      >
                        Ocultar todos
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateHiddenRealServices(new Set())}>
                        Limpar filtro
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                      {realServiceRows.length === 0 ? (
                        <p className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
                          Nenhum serviço com produção visível no 3D Real.
                        </p>
                      ) : realServiceRows.map((row) => {
                        const visible = !hiddenRealServiceKeys.has(row.key);
                        return (
                          <div key={row.key} className="rounded-md border p-2">
                            <label className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={visible}
                                onChange={(event) => toggleRealServiceVisibility(row.key, event.target.checked)}
                                className="mt-0.5 h-4 w-4"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium" title={row.label}>{row.label}</span>
                                <span className="text-muted-foreground">
                                  {row.meshCount} mesh(es) / {row.houses.size} casa(s)
                                </span>
                              </span>
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-6 px-2 text-[11px]"
                              onClick={() => updateHiddenRealServices(new Set(realServiceRows.filter((item) => item.key !== row.key).map((item) => item.key)))}
                            >
                              Somente este serviço
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {canSync3DReal && modelData && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync3DReal()}
                disabled={!canSync3DReal || isLoading || isSyncing || meshHooks.meshMap.size === 0}
                title={canSync3DReal ? "Atualiza a visibilidade das meshes a partir da produção real" : "Você precisa ter permissão de edição para sincronizar o 3D Real."}
              >
                {isSyncing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Sincronizar 3D Real
                {lastSyncResult && (
                  <Badge variant="secondary" className="ml-1.5 h-4 text-[10px] px-1">
                    {lastSyncResult.visible}/{lastSyncResult.total}
                  </Badge>
                )}
              </Button>
            )}
            {canResetMap && (
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={isLoading}><RotateCcw className="h-4 w-4 mr-1.5" />Resetar Mapa</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Confirmar Reset</AlertDialogTitle>
                    <AlertDialogDescription>Remove modelo, marcadores e câmera. <strong>Não pode ser desfeita.</strong></AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={resetView} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Resetar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canSaveMap && (
              <Button variant={hasChanges ? "default" : "outline"} size="sm" onClick={save3DMap} disabled={isSaving || isLoading}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Salvar
              </Button>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground hidden lg:inline">
              <strong>Arrastar</strong> rotacionar | <strong>Scroll</strong> zoom | <strong>Direito</strong> mover | <strong>Duplo clique</strong> fixa ponto de rotacao | <strong>Centralizar</strong> ajusta a obra inteira
            </span>
          </div>
          {canManageGlbParts && supplementalGlbParts.length > 0 && (
            <Collapsible open={supplementalPartsExpanded} onOpenChange={setSupplementalPartsExpanded}>
              <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30">
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Boxes className="h-4 w-4" />
                      Partes GLB complementares
                      <Badge variant="secondary">{supplementalGlbParts.length}</Badge>
                    </span>
                    {supplementalPartsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 border-t px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Partes GLB complementares sao persistidas para visualizacao. Vinculo manual, 3D Real basico e SmartLink limitado a mesma parte usam identidade por parte.
                      </p>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={auditGlbMeshParts}>
                          Auditar meshes
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={diagnoseGlbPartRealMode}>
                          Diagnosticar 3D Real
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void removeAllSupplementalGlbParts()}>
                          Remover todas
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {supplementalGlbParts.map((part) => (
                        <div key={part.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1">
                          <span className="max-w-[220px] truncate text-xs" title={part.name}>{part.name}</span>
                          <Badge variant={part.persisted ? "secondary" : "outline"} className="h-5 text-[10px]">
                            {part.persisted ? "Persistida" : "Sessao"}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => toggleSupplementalGlbPart(part.id)}
                          >
                            {part.visible ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                            {part.visible ? "Ocultar" : "Mostrar"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Remover parte complementar"
                            onClick={() => void removeSupplementalGlbPart(part.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      <Card className="flex-1 relative overflow-hidden" style={{ minHeight: "calc(100vh - 220px)" }}>
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /><span>Carregando...</span>
          </div>
        )}
        <div
          className="map3d-walk-lock-target absolute inset-0"
          style={assignMode ? { cursor: "crosshair", overscrollBehavior: "contain" } : { overscrollBehavior: "contain" }}
        >
          <Canvas shadows={!performanceMode} dpr={[1, performanceMode ? 1 : 1.25]} frameloop="always"
            gl={{ antialias: !performanceMode, powerPreference: "high-performance", stencil: false, depth: true }}
            onPointerMissed={() => {
              clearSmartLinkCandidateHover();
              if (reviewMode && (selectedMeshKey || smartLinkPreviewEnabled)) clearAll3DSelection("canvas empty click");
            }}
            style={{ width: "100%", height: "100%", background: "#d8ecff" }}
          >
            <Scene modelData={modelData} markers={markers} selectedMarkerId={selectedMarker?.id || null}
              onMarkerClick={setSelectedMarker} customLegendItems={customLegendItems}
              resetTrigger={resetTrigger} fitTrigger={fitTrigger}
              savedPosition={savedPos} savedTarget={savedTgt}
              onCameraChange={handleCameraChange} sceneReady={sceneReady}
              onModelLoaded={handleModelLoaded} onSceneReady={handleSceneReady}
              orbitFocusPoint={orbitFocusPoint}
              onMeshClick={cameraMode === "walk" ? undefined : reviewMode ? handleReviewMeshClick : assignMode ? handleMeshClick : undefined}
              onMeshDoubleClick={cameraMode === "orbit" ? handleMeshDoubleClickFocus : undefined}
              onMeshHover={smartLinkPreviewEnabled ? handleSmartLinkCandidateHover : reviewLinksMode ? handleReviewLinkHover : undefined}
              onMeshHoverEnd={smartLinkPreviewEnabled ? clearSmartLinkCandidateHover : reviewLinksMode ? clearReviewLinkHover : undefined}
              selectedMeshKey={cameraMode === "walk" ? null : reviewMode ? selectedMeshKey : null}
              selectedMeshKeys={cameraMode === "walk" || !reviewMode ? undefined : multiSelectedMeshKeys}
              projectId={projectId}
              companyId={companyId}
              ifcRealModeActive={modelData?.type === "ifc" && viewMode === "real"}
              ifcHouseOptions={houseNumbers}
              ifcServiceOptions={serviceOptions}
              cameraMode={cameraMode}
              walkInspectOpen={!!walkInspection}
              onWalkExit={exitWalkMode}
              onWalkInspectClose={() => setWalkInspection(null)}
              onWalkMeshInspect={handleWalkMeshInspect}
              supplementalGlbParts={supplementalGlbParts}
              onSupplementalMeshClick={handleSupplementalMeshClick}
              onSupplementalMeshDoubleClick={cameraMode === "orbit" ? handleSupplementalMeshDoubleClickFocus : undefined}
              onSupplementalMeshHover={smartLinkPreviewEnabled ? handleSupplementalSmartLinkCandidateHover : reviewLinksMode ? handleSupplementalReviewLinkHover : undefined}
              onSupplementalMeshHoverEnd={smartLinkPreviewEnabled ? clearSmartLinkCandidateHover : reviewLinksMode ? clearReviewLinkHover : undefined}
              onSupplementalSceneReady={handleSupplementalSceneReady}
              onSupplementalInventoryReady={handleSupplementalInventoryReady}
              observerHeight={observerHeight}
              zoomSpeed={orbitZoomSpeed}
              performanceMode={performanceMode}
              lightingMode={lightingMode} />
          </Canvas>
        </div>
        <div id="map3d-ifc-panel-slot" className="pointer-events-none absolute bottom-3 left-0 right-3 top-3 z-40 overflow-hidden" />
        {cameraMode === "walk" && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 opacity-80">
            <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 rounded bg-white shadow-[0_0_3px_rgba(0,0,0,0.85)]" />
            <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 rounded bg-white shadow-[0_0_3px_rgba(0,0,0,0.85)]" />
            <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-900/70 bg-white/80" />
          </div>
        )}
        {cameraMode === "walk" && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex max-w-[min(360px,calc(100%-2rem))] items-end gap-2 text-xs">
            {walkHelpVisible ? (
              <div className="pointer-events-auto rounded-lg border border-primary/20 bg-background/90 px-3 py-2 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-primary">WASD mover · Mouse olhar · Shift acelerar · Esc sair</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setWalkHelpExpanded((value) => !value)}
                    >
                      ?
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={hideWalkHelp}
                    >
                      Ocultar
                    </Button>
                  </div>
                </div>
                {walkHelpExpanded && (
                  <p className="mt-1 text-muted-foreground">
                    Clique no mapa para capturar o mouse · E inspecionar/fechar · Esc sair
                  </p>
                )}
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="pointer-events-auto h-8 w-8 rounded-full p-0 shadow-lg"
                onClick={showWalkHelp}
                title="Mostrar ajuda do Caminhar"
              >
                ?
              </Button>
            )}
          </div>
        )}
        {smartLinkPreviewBarOpen && smartLinkPreviewEnabled && (
          <div className="absolute top-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <div>
              <p className="font-semibold text-primary">Previa de similares ativa</p>
              <p className="text-muted-foreground">
                {smartLinkPreviewMode === "isolate" ? `Isolando filtro: ${smartLinkIsolationFilter}` : "Candidatas destacadas no mapa"}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={returnToSmartLinkList}>
              Voltar para lista
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={showSmartLinkCandidatesOnMap}>
              Mostrar tudo
            </Button>
            {([
              ["all", "Todas"],
              ["applicable", "Aplicaveis"],
              ["selected", "Selecionadas"],
              ["missing_house", "Sem casa"],
              ["medium", "Confianca media"],
              ["linked", "Ja vinculadas"],
            ] as Array<[SmartLinkIsolationFilter, string]>).map(([filter, label]) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={smartLinkPreviewMode === "isolate" && smartLinkIsolationFilter === filter ? "default" : "outline"}
                onClick={() => isolateSmartLinkByFilter(filter)}
              >
                {label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={() => clearSmartLinkPreview("preview bar clear")}>
              Limpar destaque
            </Button>
          </div>
        )}
        {smartLinkHoverTooltip && (
          <div
            className="pointer-events-none fixed z-[80] max-w-xs rounded-md border border-primary/30 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{
              left: Math.min(smartLinkHoverTooltip.x + 14, window.innerWidth - 280),
              top: Math.min(smartLinkHoverTooltip.y + 14, window.innerHeight - 180),
            }}
          >
            <p className="font-semibold text-primary">{smartLinkHoverTooltip.candidate.meshName || "Candidata SmartLink"}</p>
            <p>
              Casa: {smartLinkHoverTooltip.candidate.suggestedHouseNumber != null
                ? `Casa ${smartLinkHoverTooltip.candidate.suggestedHouseNumber}`
                : "sem sugestao confiavel"}
            </p>
            <p>Servico: {smartLinkServiceLabel}</p>
            <p>Status: {SMART_LINK_STATUS_LABEL[smartLinkHoverTooltip.candidate.status]}</p>
            <p>
              Confianca: {smartLinkHoverTooltip.candidate.suggestionConfidence}
              {smartLinkHoverTooltip.candidate.suggestionDistance != null
                ? ` | ${smartLinkHoverTooltip.candidate.suggestionDistance.toFixed(1)}m`
                : ""}
            </p>
            <p>Fonte: {smartLinkHoverTooltip.candidate.suggestionSource}</p>
            {smartLinkHoverTooltip.candidate.suggestionAnchorName && (
              <p>Ancora: {smartLinkHoverTooltip.candidate.suggestionAnchorName}</p>
            )}
            {smartLinkHoverTooltip.candidate.suggestionSource === "main_model_text_anchor" && (
              <p>Origem da ancora: modelo principal</p>
            )}
            {smartLinkHoverTooltip.candidate.suggestionSource === "text_anchor" && (
              <p>Origem da ancora: mesma origem GLB</p>
            )}
            {smartLinkHoverTooltip.candidate.suggestionHorizontalDistance != null && (
              <p>Dist. X/Z: {smartLinkHoverTooltip.candidate.suggestionHorizontalDistance.toFixed(1)}m</p>
            )}
            {smartLinkHoverTooltip.candidate.suggestionIgnoredLinkedNeighbor && (
              <p className="text-amber-600">Fallback por vizinho não usado: decisão por texto âncora.</p>
            )}
            <p className="text-muted-foreground">
              {smartLinkHoverTooltip.candidate.houseSuggestionRejectReason || smartLinkHoverTooltip.candidate.suggestionReason}
            </p>
          </div>
        )}
        {reviewLinkHoverTooltip && (
          <div
            className="pointer-events-none fixed z-[80] max-w-xs rounded-md border border-sky-400/40 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{
              left: Math.min(reviewLinkHoverTooltip.x + 14, window.innerWidth - 300),
              top: Math.min(reviewLinkHoverTooltip.y + 14, window.innerHeight - 190),
            }}
          >
            <p className="font-semibold text-sky-500">{reviewLinkHoverTooltip.houseLabel}</p>
            <p>{reviewLinkHoverTooltip.serviceLabel}</p>
            <p className="mt-1 text-muted-foreground">Mesh: {reviewLinkHoverTooltip.meshName || reviewLinkHoverTooltip.layerKey}</p>
            {reviewLinkHoverTooltip.materialName && (
              <p className="text-muted-foreground">Material: {reviewLinkHoverTooltip.materialName}</p>
            )}
            <p>Status: {reviewLinkHoverTooltip.statusLabel}</p>
            <p>Tipo: {reviewLinkHoverTooltip.meshTypeLabel}</p>
            <p>Origem: {reviewLinkHoverTooltip.originLabel}</p>
          </div>
        )}
        {assignMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-1.5 pointer-events-none">
            <MousePointerClick className="h-3.5 w-3.5" />
            Clique numa parte do modelo para atribuir a uma casa
          </div>
        )}
        {canManage3D && (
          <AssignHousePopover
            picked={pickedMesh}
            totalHouses={currentProject?.houses?.length ?? 0}
            currentHouse={pickedMesh ? meshAssignments.assignmentMap.get(pickedMesh.name) ?? null : null}
            saving={assignSaving}
            onConfirm={confirmAssignment}
            onClear={clearAssignment}
            onClose={() => setPickedMesh(null)}
          />
        )}
        {reviewMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium shadow-lg flex items-center gap-1.5 pointer-events-none">
            <ScanSearch className="h-3.5 w-3.5" />
            Modo Revisão — clique em qualquer mesh do modelo
          </div>
        )}
        {reviewMode && isolatedKeys && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-primary/30 bg-background/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur">
            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px]">
              Isolando {isolatedKeys.size} mesh
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-[11px]"
              onClick={handleClearIsolation}
            >
              Mostrar tudo
            </Button>
          </div>
        )}
        {canManage3D && reviewMode && sceneObj && quickContextPanelOpen && (
          <Card className="absolute bottom-4 left-4 z-20 w-80 border-primary/20 bg-background/95 shadow-xl backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 pb-2 pt-3">
              <CardTitle className="text-sm">Classificação rápida 3D Real</CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setQuickContextPanelOpen(false)}
              >
                Fechar
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5 px-3 pb-3">
              <p className="text-[11px] leading-snug text-muted-foreground">
                Para ruas, calçadas, paver, lotes e entorno, clique diretamente na peça desejada e marque como Contexto. A classificação automática por material pode marcar peças erradas.
              </p>
              <div className="grid gap-1.5">
                {GLB_CONTEXT_PRESETS.map((preset) => (
                  <Button
                    key={preset.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 justify-start text-[11px]"
                    disabled={!!contextBulkAction}
                    onClick={() => openContextPreview(preset.key)}
                  >
                    {contextBulkAction === preset.key && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start text-[11px]"
                  disabled={!!contextBulkAction}
                  onClick={() => void handleClearQuickContexts()}
                >
                  Limpar contextos sem vínculo produtivo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-[11px]"
                  onClick={logContextAudit}
                >
                  Auditar contextos no console
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        <AlertDialog open={!!contextPreview} onOpenChange={(open) => { if (!open) setContextPreview(null); }}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar contexto rápido</AlertDialogTitle>
              <AlertDialogDescription>
                Confirme antes de marcar como contexto. Produções já vinculadas serão puladas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {contextPreview && (
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm">
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">Encontradas</p>
                    <p className="text-base font-semibold">{contextPreview.found}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">Já contexto</p>
                    <p className="text-base font-semibold">{contextPreview.alreadyContext}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">Puladas</p>
                    <p className="text-base font-semibold">{contextPreview.skippedLinked}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-muted-foreground">Seriam marcadas</p>
                    <p className="text-base font-semibold">{contextPreview.wouldMark.length}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Materiais encontrados</p>
                  <p className="text-xs leading-relaxed">{contextPreview.materialNames.join(" · ") || "Nenhum"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nomes encontrados</p>
                  <p className="text-xs leading-relaxed">{contextPreview.meshNames.join(" · ") || "Nenhum"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Amostra</p>
                  <div className="space-y-1">
                    {contextPreview.sample.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma mesh nova seria marcada.</p>
                    ) : contextPreview.sample.map((mesh) => (
                      <div key={mesh.layer_key} className="rounded border bg-muted/30 px-2 py-1 text-xs">
                        <p className="font-mono">{mesh.layer_key}</p>
                        <p>{mesh.mesh_name || "sem nome"} · {mesh.material_name || "sem material"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void applyContextPreview()}>
                Confirmar marcação
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {canManage3D && reviewMode && selectedMeshKey && (
          <MeshReviewPanel
            meshKey={selectedMeshKey}
            meshData={getCurrentMeshRecord(selectedMeshKey)}
            multiSelection={multiReviewSelection}
            sceneRef={selectedMeshSceneRoot}
            houses={houseNumbers}
            services={serviceOptions}
            isolated={!!isolatedKeys?.has(selectedMeshKey)}
            smartLinkCandidate={smartLinkFocusedCandidate?.layerKey === selectedMeshKey ? smartLinkFocusedCandidate : null}
            smartLinkSelected={selectedMeshKey ? smartLinkSelectedKeys.has(selectedMeshKey) : false}
            onSmartLinkToggleCandidate={toggleSmartLinkCandidate}
            onSmartLinkClearFocus={() => setSmartLinkFocusedCandidateKey(null)}
            onSmartLinkReturnToList={returnToSmartLinkList}
            onClose={() => clearAll3DSelection("review panel closed")}
            onClearMultiSelection={() => setMultiSelectedMeshKeys(new Set())}
            onIsolate={handleIsolate}
            onShowAll={handleClearIsolation}
            onFindSimilar={canUseSmartLink ? openSmartLinkSimilar : undefined}
            onBatchUpdate={applyMeshReviewBatchUpdate}
            onUpdate={async (key, data) => {
              if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return; }
              const payload = { layer_key: key, ...data };
              const glbPartId = getGlbPartIdFromLayerKey(key);
              const glbPart = glbPartId ? supplementalGlbPartsRef.current.find((part) => part.id === glbPartId) ?? null : null;
              if (import.meta.env.DEV) {
                console.log("[GLB Mesh Link] map onUpdate", {
                  selectedMeshKey,
                  key,
                  payload,
                  before: meshHooks.meshMap.get(key) ?? null,
                });
                if (glbPartId) {
                  console.log("[GLB Part Link Persistence Debug]", {
                    action: "apply-link-start",
                    part_id: glbPartId,
                    file_name: glbPart?.fileName ?? glbPart?.name ?? null,
                    layer_key: key,
                    selectedMeshKey,
                    payload,
                    meshMapFoundBefore: meshHooks.meshMap.has(key),
                    meshMapBefore: meshHooks.meshMap.get(key) ?? null,
                  });
                }
              }
              const meshMapBeforeUpdate = meshHooks.meshMap;
              const saved = await meshHooks.upsertMesh(payload);
              const { data: directRead, error: directReadError } = await supabase
                .from("project_model_meshes" as any)
                .select("*")
                .eq("project_id", projectId)
                .eq("layer_key", key)
                .maybeSingle();
              if (directReadError) {
                console.error("[GLB MeshMap Consistency] direct read after upsert error", directReadError);
              }
              const refreshedAfterUpdate = await meshHooks.refresh();
              const refreshedAfterUpdateMap = new Map((refreshedAfterUpdate || []).map((mesh) => [mesh.layer_key, mesh]));
              const effectiveSaved = (refreshedAfterUpdateMap.get(key) ?? directRead ?? saved) as ProjectModelMesh;
              setTrustedGlbLinkKeys((prev) => {
                const next = new Set(prev);
                next.add(key);
                return next;
              });
              setMeshReviewOverrides((prev) => {
                const next = new Map(prev);
                next.set(key, effectiveSaved);
                return next;
              });
              if (data.visible === false) {
                clearAll3DSelection("mesh hidden from review panel");
              }
              console.log("[GLB MeshMap Consistency] apply link", {
                layer_key: key,
                returnedByUpsert: saved,
                directRead,
                directReadError,
                refreshMapHasLayerKey: refreshedAfterUpdateMap.has(key),
                refreshedMesh: refreshedAfterUpdateMap.get(key) ?? null,
                meshMapBeforeHasLayerKey: meshMapBeforeUpdate.has(key),
                meshMapCurrentHasLayerKey: meshHooks.meshMap.has(key),
                overrideWillUse: effectiveSaved,
                watched: GLB_REAL_SYNC_WATCH_KEYS.map((layerKey) => ({
                  layer_key: layerKey,
                  meshMapBeforeHas: meshMapBeforeUpdate.has(layerKey),
                  refreshMapHas: refreshedAfterUpdateMap.has(layerKey),
                  overrideHas: meshReviewOverrides.has(layerKey),
                  refreshed: refreshedAfterUpdateMap.get(layerKey) ?? null,
                })),
              });
              if (import.meta.env.DEV) {
                console.log("[GLB Mesh Link] map onUpdate saved", {
                  selectedMeshKey,
                  key,
                  saved: effectiveSaved,
                  after: meshHooks.meshMap.get(key) ?? null,
                });
                if (glbPartId) {
                  console.log("[GLB Part Link Persistence Debug]", {
                    action: "apply-link-saved",
                    part_id: glbPartId,
                    file_name: glbPart?.fileName ?? glbPart?.name ?? null,
                    layer_key: key,
                    saved,
                    directRead,
                    refreshMapHasLayerKey: refreshedAfterUpdateMap.has(key),
                    refreshedMesh: refreshedAfterUpdateMap.get(key) ?? null,
                    overrideApplied: true,
                    layerKeyChanged: selectedMeshKey !== key,
                  });
                }
                console.log("[GLB Mesh Link Check] map onUpdate saved", {
                  key,
                  saved,
                  overrideApplied: true,
                  watchedMeshMap: Array.from(meshHooks.meshMap.values())
                    .filter((item) => item.layer_key.includes("Geom3D_302") || item.layer_key.includes("Geom3D_303"))
                    .map((item) => ({
                      layer_key: item.layer_key,
                      mesh_name: item.mesh_name,
                      assigned_house_number: item.assigned_house_number,
                      service_macro_id: item.service_macro_id,
                      service_scope_id: item.service_scope_id,
                    })),
                });
              }
            }}
            onIgnore={async (key) => {
              if (!canDelete3D) { toast.error("Sem permissão para remover ou ignorar itens do Mapa 3D."); return; }
              await meshHooks.setIgnored(key, true);
              clearAll3DSelection("mesh ignored");
              toast.success("Mesh marcada como ignorada");
            }}
          />
        )}
        {canManageLayers && showLayers && layerManager.layers.length > 0 && (
          <LayersPanel
            layers={layerManager.layers}
            links={layerManager.links}
            autoMode={layerManager.autoMode}
            onAutoModeChange={layerManager.setAutoMode}
            onToggleLayer={(name) => {
              layerManager.toggleLayer(name);
              clearAll3DSelection("layer toggled");
            }}
            onOpacityChange={layerManager.setLayerOpacity}
            onShowAllLayers={reexibirTodasCamadas}
            onOpenLinkDialog={() => setLinkDialogOpen(true)}
            onRenameLayer={layerManager.renameLayer}
          />
        )}
        {selectedMarker && (
          <HouseDetailsPanel
            marker={selectedMarker}
            onClose={() => setSelectedMarker(null)}
            customLegendItems={customLegendItems}
            onOpenPhotoHistory={() => setPhotoHistoryOpen(true)}
          />
        )}
        {cameraMode === "walk" && walkInspection && (
          <HouseWalkInspectPanel
            inspection={walkInspection}
            meshData={walkMeshData}
            house={walkHouse}
            macrosTemplate={currentProject?.macrosTemplate}
            customLegendItems={customLegendItems}
            onClose={() => setWalkInspection(null)}
            onOpenDiary={() => openDashboardView("diario-obra")}
            onOpenProduction={() => openDashboardView("production")}
            onOpenHistory={() => {
              const houseNumber = walkMeshData?.assigned_house_number ?? null;
              setWalkHistoryHouseNumber(houseNumber);
              setWalkHistoryOpen(houseNumber != null);
            }}
          />
        )}
        <HouseFotoHistoryDrawer
          open={photoHistoryOpen}
          onOpenChange={setPhotoHistoryOpen}
          houseId={selectedMarker?.houseNumber ?? null}
          projectId={projectId ?? null}
          houseLabel={selectedMarker ? `Casa ${String(selectedMarker.houseNumber).padStart(2, "0")}` : undefined}
        />
        <HouseFotoHistoryDrawer
          open={walkHistoryOpen}
          onOpenChange={setWalkHistoryOpen}
          houseId={walkHistoryHouseNumber}
          projectId={projectId ?? null}
          houseLabel={walkHistoryHouseNumber != null ? `Casa ${String(walkHistoryHouseNumber).padStart(2, "0")}` : undefined}
        />
        {!modelData && markers.length === 0 && supplementalGlbParts.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-4 p-8 bg-background/80 rounded-xl border border-border">
              <Move3D className="h-16 w-16 mx-auto text-muted-foreground" />
              <h3 className="text-lg font-semibold">Mapa 3D</h3>
              <p className="text-sm text-muted-foreground">Importe um modelo 3D (.glTF, .glb, .ifc ou .obj)</p>
            </div>
          </div>
        )}
      </Card>

      <GlbSmartLinkDialog
        open={smartLinkOpen}
        base={smartLinkBase}
        candidates={smartLinkCandidates}
        selectedKeys={smartLinkSelectedKeys}
        applying={smartLinkApplying}
        serviceLabel={smartLinkServiceLabel}
        onOpenChange={handleSmartLinkOpenChange}
        onToggle={toggleSmartLinkCandidate}
        onShowCandidates={showSmartLinkCandidatesOnMap}
        onIsolateCandidates={isolateSmartLinkCandidates}
        onClearPreview={() => clearSmartLinkPreview("dialog clear preview")}
        onApply={applySmartLinkSelection}
      />

      <AlertDialog open={!!pendingGlbImport} onOpenChange={(open) => {
        if (!open) {
          setPendingGlbImport(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar novo modelo GLB?</AlertDialogTitle>
            <AlertDialogDescription>
              Este projeto já possui {pendingGlbImport?.existingGlbRecords ?? 0} registro(s) GLB em project_model_meshes.
              Escolha se deseja reaproveitar vínculos existentes ou iniciar o inventário GLB limpo para este novo arquivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
            <AlertDialogCancel
              onClick={() => {
                setPendingGlbImport(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || !pendingGlbImport}
              onClick={() => pendingGlbImport && void importGltfFile(pendingGlbImport.file, "preserve", pendingGlbImport.existingGlbRecords)}
            >
              Atualizar modelo atual e preservar vínculos
            </Button>
            <AlertDialogAction
              disabled={isLoading || !pendingGlbImport}
              onClick={() => pendingGlbImport && void importGltfFile(pendingGlbImport.file, "new", pendingGlbImport.existingGlbRecords)}
            >
              Importar como novo modelo e limpar vínculos GLB anteriores
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canLinkServices && projectId && (
        <LinkLayersDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          layers={layerManager.layers}
          links={layerManager.links}
          projectId={projectId}
          onSaveLink={layerManager.saveLink}
          onRemoveLink={layerManager.removeLink}
        />
      )}
      {canReviewModel && projectId && (
        <IfcSuggestionsPanel
          open={ifcSuggestionsOpen}
          onOpenChange={setIfcSuggestionsOpen}
          projectId={projectId}
          modelUrl={modelData?.type === "ifc" ? modelData.url : null}
          houses={currentProject?.houses || []}
        />
      )}
    </div>
  );
}
