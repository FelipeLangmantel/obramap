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
import { Upload, RotateCcw, Move3D, X, ChevronDown, ChevronRight, Save, Loader2, Home, AlertTriangle, Target, Layers, Camera, MousePointerClick, ScanSearch, RefreshCw, Eye, Boxes, Sparkles } from "lucide-react";
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
import { GLB_CONTEXT_MESH_MARKER, isContextProjectModelMesh, useProjectModelMeshes, type ProjectModelMesh } from "@/hooks/useProjectModelMeshes";
import { MeshReviewPanel, type ServiceOption } from "./map3d/MeshReviewPanel";
import { GlbSmartLinkDialog } from "./map3d/GlbSmartLinkDialog";
import {
  getGlbHouseSuggestionDiagnostics,
  getSceneMeshInfo,
  scoreGlbSimilarCandidates,
  type GlbMeshRuntimeInfo,
  type GlbSmartLinkCandidate,
} from "./map3d/glbSmartLink";
import { parseHouseNumberFromMesh } from "./map3d/parseHouseFromMeshName";
import { HouseFotoHistoryDrawer } from "@/components/diario/HouseFotoHistoryDrawer";
import { canDelete3DAssets, canManage3DMap } from "@/lib/accessControl";
import { calculateHouseProgress } from "@/data/constructionData";

interface ModelData {
  url: string;
  type: "gltf" | "obj" | "ifc";
  mtlUrl?: string;
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
function useSelectionHighlight(scene: THREE.Object3D | null, selectedKey: string | null) {
  const highlightedRef = useRef<Array<{ mesh: THREE.Mesh; originalMaterial: THREE.Material | THREE.Material[] }>>([]);

  useEffect(() => {
    const restoreHighlighted = () => {
      highlightedRef.current.forEach(({ mesh, originalMaterial }) => {
        mesh.material = originalMaterial;
        const materials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
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
    if (!scene || !selectedKey) return restoreHighlighted;

    let selectedMesh: THREE.Mesh | null = null;
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (getMeshLayerKey(mesh) === selectedKey) selectedMesh = mesh;
    });

    if (!selectedMesh) return restoreHighlighted;

    const originalMaterial = selectedMesh.material as THREE.Material | THREE.Material[];
    const highlightMaterial = (material: THREE.Material) => {
      const clone = material.clone();
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

    selectedMesh.material = Array.isArray(originalMaterial)
      ? originalMaterial.map(highlightMaterial)
      : highlightMaterial(originalMaterial);
    highlightedRef.current = [{ mesh: selectedMesh, originalMaterial }];
    if (import.meta.env.DEV) {
      console.log("[GLB Review Highlight] selected", { uuid: selectedMesh.uuid, name: selectedMesh.name || null });
    }

    return restoreHighlighted;
  }, [scene, selectedKey]);
}

// GLTF model - calls onLoaded after it's in the scene
function GLTFModel({ url, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: { url: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void; onMeshClick?: (mesh: THREE.Object3D) => void; selectedMeshKey?: string | null }) {
  const { scene } = useGLTF(url);
  const calledRef = useRef(false);
  useSelectionHighlight(scene, selectedMeshKey ?? null);

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
        if (e.object) onMeshClick(e.object);
      }}
    />
  );
}

// OBJ model - calls onLoaded after it's in the scene
function OBJModel({ url, mtlUrl, onLoaded, onSceneReady, onMeshClick, selectedMeshKey }: { url: string; mtlUrl?: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void; onMeshClick?: (mesh: THREE.Object3D) => void; selectedMeshKey?: string | null }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null;
  const obj = useLoader(OBJLoader, url, (loader) => {
    if (materials) { materials.preload(); loader.setMaterials(materials); }
  });
  const calledRef = useRef(false);
  useSelectionHighlight(obj, selectedMeshKey ?? null);

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
        if (e.object) onMeshClick(e.object);
      }}
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
function ZoomToMouseControls() {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef<any>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    const domElement = gl.domElement;
    
    const onWheel = (event: WheelEvent) => {
      if (!controlsRef.current) return;
      
      event.preventDefault();
      
      const rect = domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.current.setFromCamera(mouse.current, camera);
      
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      const target = controlsRef.current.target as THREE.Vector3;
      
      let zoomPoint: THREE.Vector3;
      if (intersects.length > 0) {
        zoomPoint = intersects[0].point.clone();
      } else {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        raycaster.current.ray.intersectPlane(plane, intersection);
        zoomPoint = intersection || target.clone();
      }
      
      const zoomFactor = event.deltaY > 0 ? 1.12 : 0.89;
      const direction = new THREE.Vector3().subVectors(camera.position, zoomPoint);
      
      camera.position.copy(zoomPoint).add(direction.multiplyScalar(zoomFactor));
      
      // Move target toward zoom point for smooth entry into houses
      const targetShift = new THREE.Vector3().subVectors(zoomPoint, target).multiplyScalar(0.08 * (event.deltaY > 0 ? -1 : 1));
      target.add(targetShift);
      
      controlsRef.current.update();
    };
    
    domElement.addEventListener('wheel', onWheel, { passive: false });
    return () => domElement.removeEventListener('wheel', onWheel);
  }, [camera, gl, scene]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault enablePan enableRotate
      enableZoom={true}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={0.1}
      maxDistance={Infinity}
      panSpeed={1.5}
      rotateSpeed={1.0}
      zoomSpeed={1.0}
      enableDamping
      dampingFactor={0.08}
      zoomToCursor
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
    />
  );
}

function WalkControls({ onExit, height = 1.7 }: { onExit: () => void; height?: number }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
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
    camera.position.y = Math.max(camera.position.y, height);
    console.log("[Walk Mode Check] walk controls mounted", {
      before: before.toArray(),
      after: camera.position.toArray(),
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
  }, [camera, height]);

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
  onMeshClick, selectedMeshKey, projectId, companyId, ifcRealModeActive, ifcHouseOptions, ifcServiceOptions,
  cameraMode, walkInspectOpen, onWalkExit, onWalkInspectClose, onWalkMeshInspect,
}: {
  modelData: ModelData | null; markers: HouseMarker[]; selectedMarkerId: number | null;
  onMarkerClick: (m: HouseMarker) => void; customLegendItems: any[];
  resetTrigger: number; fitTrigger: number;
  savedPosition?: [number, number, number] | null; savedTarget?: [number, number, number] | null;
  onCameraChange?: (p: [number, number, number], t: [number, number, number]) => void;
  sceneReady: boolean; onModelLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
  onMeshClick?: (mesh: THREE.Object3D) => void;
  selectedMeshKey?: string | null;
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
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={50} />
      <AutoFitCamera fitTrigger={fitTrigger} resetTrigger={resetTrigger}
        savedPosition={savedPosition} savedTarget={savedTarget}
        onCameraChange={onCameraChange} sceneReady={sceneReady} enabled={cameraMode === "orbit"} />
      {cameraMode === "orbit" ? <ZoomToMouseControls /> : <WalkControls onExit={onWalkExit} />}
      <WalkMeshInspector
        enabled={cameraMode === "walk"}
        panelOpen={walkInspectOpen}
        onClosePanel={onWalkInspectClose}
        onInspect={(mesh) => onWalkMeshInspect?.(mesh)}
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <hemisphereLight args={["#87ceeb", "#4a7c59", 0.4]} />

      {modelData && (
        <Suspense fallback={<Html center><div className="bg-background/90 px-4 py-2 rounded-lg border border-border">Carregando modelo...</div></Html>}>
          {modelData.type === "gltf" ? (
            <GLTFModel url={modelData.url} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
          ) : modelData.type === "ifc" ? (
            <IFCModel url={modelData.url} projectId={projectId} companyId={companyId} ifcRealModeActive={ifcRealModeActive} houseOptions={ifcHouseOptions} serviceOptions={ifcServiceOptions} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
          ) : (
            <OBJModel url={modelData.url} mtlUrl={modelData.mtlUrl} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
          )}
        </Suspense>
      )}

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
  const { profile } = useAuth();
  const projectId = currentProject?.id;
  const companyId = (currentProject as any)?.company_id || profile?.company_id || null;
  const canManage3D = canManage3DMap(profile);
  const canDelete3D = canDelete3DAssets(profile);
  
  const [modelData, setModelData] = useState<ModelData | null>(null);
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
  const [isolatedKeys, setIsolatedKeys] = useState<Set<string> | null>(null);
  const [meshReviewOverrides, setMeshReviewOverrides] = useState<Map<string, ProjectModelMesh>>(new Map());
  const [contextBulkAction, setContextBulkAction] = useState<GlbContextPresetKey | null>(null);
  const [contextPreview, setContextPreview] = useState<GlbContextPreview | null>(null);
  const [quickContextPanelOpen, setQuickContextPanelOpen] = useState(false);
  const [smartLinkOpen, setSmartLinkOpen] = useState(false);
  const [smartLinkBase, setSmartLinkBase] = useState<GlbMeshRuntimeInfo | null>(null);
  const [smartLinkBaseKey, setSmartLinkBaseKey] = useState<string | null>(null);
  const [smartLinkCandidates, setSmartLinkCandidates] = useState<GlbSmartLinkCandidate[]>([]);
  const [smartLinkSelectedKeys, setSmartLinkSelectedKeys] = useState<Set<string>>(new Set());
  const [smartLinkPreviewEnabled, setSmartLinkPreviewEnabled] = useState(false);
  const [smartLinkPreviewBarOpen, setSmartLinkPreviewBarOpen] = useState(false);
  const [smartLinkPreviewMode, setSmartLinkPreviewMode] = useState<"show" | "isolate" | null>(null);
  const [smartLinkApplying, setSmartLinkApplying] = useState(false);
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
  const meshHooks = useProjectModelMeshes(projectId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mtlInputRef = useRef<HTMLInputElement>(null);
  const [pendingObjFile, setPendingObjFile] = useState<File | null>(null);

  const handleCameraChange = useCallback((p: [number, number, number], t: [number, number, number]) => {
    setPendingPos(p); setPendingTgt(t);
  }, []);

  useEffect(() => {
    if (canManage3D) return;
    setAssignMode(false);
    setReviewMode(false);
    setIfcSuggestionsOpen(false);
    setPickedMesh(null);
    setSelectedMeshKey(null);
    setIsolatedKeys(null);
  }, [canManage3D]);

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
      const layerKey = `glb:${meshName}:${occurrence}`;
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
    }
    if (meshesToUpsert.length > 0) {
      void meshHooks.bulkUpsertMeshes(meshesToUpsert);
    }
  }, [layerManager.extractLayers, projectId, meshHooks.bulkUpsertMeshes]);

  // ====================================================
  // Modo "Revisar Modelo": clique destaca a mesh
  // ====================================================
  const handleReviewMeshClick = useCallback((obj: THREE.Object3D) => {
    if (!reviewMode) return;
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
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
    setSelectedMeshKey(layerKey);
  }, [meshHooks.meshMap, reviewMode, sceneObj]);

  const handleWalkMeshInspect = useCallback((mesh: THREE.Mesh) => {
    const layerKey = getMeshLayerKey(mesh);
    const meshData = meshReviewOverrides.get(layerKey) ?? meshHooks.meshMap.get(layerKey) ?? null;
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
  }, [meshHooks.meshMap, meshReviewOverrides]);

  const handleIsolate = useCallback((key: string) => {
    setIsolatedKeys(prev => (prev?.has(key) ? null : new Set([key])));
  }, []);

  const handleClearIsolation = useCallback(() => {
    setIsolatedKeys(null);
  }, []);

  // Lista de casas para o painel de revisão
  const exitWalkMode = useCallback(() => {
    setCameraMode("orbit");
    setWalkInspection(null);
  }, []);

  const toggleWalkMode = useCallback(() => {
    setCameraMode((mode) => {
      const nextMode: CameraMode = mode === "walk" ? "orbit" : "walk";
      console.log("[Walk Mode Check] cameraMode toggle", { from: mode, to: nextMode });
      if (nextMode === "walk") {
        setAssignMode(false);
        setReviewMode(false);
        setPickedMesh(null);
        setSelectedMeshKey(null);
        setIsolatedKeys(null);
        setSelectedMarker(null);
      } else {
        setWalkInspection(null);
      }
      return nextMode;
    });
  }, []);

  const houseNumbers = useMemo(() => {
    const arr = (currentProject?.houses || [])
      .map((h: any) => h.houseNumber ?? h.house_number ?? h.number ?? h.id)
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isFinite(n));
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [currentProject?.houses]);

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

  // Aplica modo de visualização à cena
  const walkMeshData = useMemo(() => {
    if (!walkInspection) return null;
    return meshReviewOverrides.get(walkInspection.layerKey) ?? meshHooks.meshMap.get(walkInspection.layerKey) ?? null;
  }, [meshHooks.meshMap, meshReviewOverrides, walkInspection]);

  const walkHouse = useMemo(() => {
    const houseNumber = walkMeshData?.assigned_house_number;
    if (houseNumber == null) return null;
    return currentProject?.houses?.find((house: any) => Number(house.id) === Number(houseNumber)) ?? null;
  }, [currentProject?.houses, walkMeshData?.assigned_house_number]);

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

    sceneObj.traverse((child) => {
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
        : selectedKeys.has(layerKey)
          ? "#f472b6"
          : "#facc15";
      const intensity = selectedKeys.has(layerKey) || layerKey === smartLinkBaseKey ? 1.25 : 1;
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
    smartLinkPreviewEnabled,
    smartLinkSelectedKeys,
  ]);

  const openSmartLinkSimilar = useCallback((layerKey: string) => {
    if (!sceneObj) {
      toast.error("Cena 3D ainda não está pronta.");
      return;
    }

    const sourceMap = new Map(meshHooks.meshMap);
    meshReviewOverrides.forEach((value, key) => sourceMap.set(key, value));
    const runtimeMeshes = getSceneMeshInfo(sceneObj, sourceMap, getMeshLayerKey);
    const houseAnchorDiagnostics = getGlbHouseSuggestionDiagnostics(runtimeMeshes, houseNumbers);
    const base = runtimeMeshes.find((mesh) => mesh.layerKey === layerKey) ?? null;
    const baseSaved = sourceMap.get(layerKey) ?? null;
    const hasBaseLink = !!baseSaved
      && baseSaved.assigned_house_number != null
      && baseSaved.service_macro_id != null
      && baseSaved.service_scope_id != null
      && !baseSaved.ignored
      && !isContextProjectModelMesh(baseSaved);

    if (!base || !baseSaved || !hasBaseLink) {
      toast.error("Selecione uma mesh com Casa e Serviço vinculados para buscar similares.");
      return;
    }

    const allSimilarCandidates = scoreGlbSimilarCandidates(
      { ...base, saved: baseSaved },
      runtimeMeshes,
      { validHouseNumbers: houseNumbers, includeOtherPossible: true },
    )
      .filter((candidate) => candidate.layerKey !== layerKey);
    const candidates = allSimilarCandidates.filter((candidate) => candidate.matchStrength === "strong");
    const selected = new Set(
      candidates
        .filter((candidate) => candidate.selectedByDefault)
        .map((candidate) => candidate.layerKey),
    );
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
      linkedAnchorSample: houseAnchorDiagnostics.linkedAnchors.slice(0, 10),
      textAnchorSample: houseAnchorDiagnostics.textAnchors.slice(0, 10),
      strongCandidates: candidates.filter((candidate) => candidate.matchStrength === "strong").length,
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
    setSmartLinkCandidates(candidates);
    setSmartLinkSelectedKeys(selected);
    setSmartLinkPreviewEnabled(true);
    setSmartLinkPreviewBarOpen(false);
    setSmartLinkPreviewMode(null);
    setSmartLinkOpen(true);
  }, [currentProject?.name, houseNumbers, meshHooks.meshMap, meshReviewOverrides, projectId, sceneObj]);

  const toggleSmartLinkCandidate = useCallback((layerKey: string, checked: boolean) => {
    setSmartLinkSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(layerKey);
      else next.delete(layerKey);
      return next;
    });
  }, []);

  const smartLinkCandidatePreviewKeys = useMemo(() => {
    return smartLinkCandidates.map((candidate) => candidate.layerKey);
  }, [smartLinkCandidates]);

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
    setIsolatedKeys(null);
    setSmartLinkPreviewMode("show");
    setSmartLinkPreviewBarOpen(true);
    setSmartLinkOpen(false);
    toast.info("Candidatas destacadas no mapa.");
  }, []);

  const isolateSmartLinkCandidates = useCallback(() => {
    const keys = new Set<string>();
    if (smartLinkBaseKey) keys.add(smartLinkBaseKey);
    smartLinkCandidatePreviewKeys.forEach((key) => keys.add(key));
    if (keys.size === 0) return;
    const beforeState = smartLinkPreviewStateRef.current;
    console.log("[GLB Smart Dialog State]", {
      action: "minimize-dialog",
      reason: "isolate candidates",
      dialogOpenBefore: beforeState.dialogOpen,
      dialogOpenAfter: false,
      previewActive: true,
      cleanupCalled: false,
      caller: "isolateSmartLinkCandidates",
    });
    setSmartLinkPreviewEnabled(true);
    setIsolatedKeys(keys);
    setSmartLinkPreviewMode("isolate");
    setSmartLinkPreviewBarOpen(true);
    setSmartLinkOpen(false);
    toast.info(`Isolando ${keys.size} mesh(es) da busca de similares.`);
  }, [smartLinkBaseKey, smartLinkCandidatePreviewKeys]);

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
    setIsolatedKeys(null);
    clearSmartLinkPreviewHighlight(reason);
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
  }, [clearSmartLinkPreviewHighlight]);

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
    setSmartLinkOpen(true);
    setSmartLinkPreviewBarOpen(false);
  }, [smartLinkBase, smartLinkCandidates.length]);

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
      clearSmartLinkPreview("review mode exited");
    }
  }, [clearSmartLinkPreview, reviewMode]);

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

    const selectedCandidates = smartLinkCandidates.filter((candidate) =>
      smartLinkSelectedKeys.has(candidate.layerKey)
      && candidate.status === "applicable"
      && candidate.suggestedHouseNumber != null
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

  const applyViewMode = useCallback((mode: ViewMode, overrideMeshMap?: Map<string, ProjectModelMesh>) => {
    setViewMode(mode);
    if (!sceneObj) return;
    const sourceMap = overrideMeshMap ?? meshHooks.meshMap;
    sceneObj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const saved = sourceMap.get(getMeshLayerKey(mesh));
      if (!saved) return;
      if (saved.ignored) { child.visible = false; return; }
      switch (mode) {
        case "complete":
          child.visible = saved.visible;
          break;
        case "real": {
          if (isContextProjectModelMesh(saved)) {
            child.visible = saved.visible;
            break;
          }
          const hasLink = saved.assigned_house_number != null && saved.service_macro_id != null && saved.service_scope_id != null;
          child.visible = hasLink && !!saved.production_visible;
          break;
        }
        case "simulation":
          child.visible = saved.visible;
          break;
      }
    });
    if (mode === "real") {
      const stats = {
        contextVisible: 0,
        linkedVisible: 0,
        linkedHidden: 0,
        unlinkedHidden: 0,
        ignored: 0,
        contextExamples: [] as Array<{ layer_key: string; mesh_name: string | null; material_name: string | null }>,
      };
      sourceMap.forEach((mesh) => {
        if (mesh.ignored) {
          stats.ignored++;
          return;
        }
        if (isContextProjectModelMesh(mesh)) {
          if (mesh.visible) stats.contextVisible++;
          if (stats.contextExamples.length < 8) {
            stats.contextExamples.push({
              layer_key: mesh.layer_key,
              mesh_name: mesh.mesh_name,
              material_name: mesh.material_name,
            });
          }
          return;
        }
        const hasLink = mesh.assigned_house_number != null && mesh.service_macro_id != null && mesh.service_scope_id != null;
        if (!hasLink) {
          stats.unlinkedHidden++;
        } else if (mesh.production_visible) {
          stats.linkedVisible++;
        } else {
          stats.linkedHidden++;
        }
      });
      console.log("[GLB Real Context]", stats);
    }
  }, [sceneObj, meshHooks.meshMap]);

  // Re-aplica modo quando meshMap chega/atualiza ou cena fica pronta
  useEffect(() => {
    if (meshHooks.meshMap.size > 0 && sceneObj) applyViewMode(viewMode);
  }, [meshHooks.meshMap, sceneObj, viewMode, applyViewMode]);

  // Aplica isolamento (sobrepõe modo de visão)
  useEffect(() => {
    if (!sceneObj) return;
    if (!isolatedKeys) { applyViewMode(viewMode); return; }
    sceneObj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      child.visible = isolatedKeys.has(getMeshLayerKey(child as THREE.Mesh));
    });
  }, [isolatedKeys, sceneObj, applyViewMode, viewMode]);

  // Desabilita autoMode (LayersPanel) fora do modo simulação
  useEffect(() => {
    if (viewMode !== "simulation" && layerManager.autoMode) {
      layerManager.setAutoMode(false);
    }
  }, [viewMode, layerManager]);

  const pendingMeshCount = useMemo(() => {
    let n = 0;
    meshHooks.meshMap.forEach((m) => {
      if (m.ignored) return;
      if (m.assigned_house_number == null || m.service_macro_id == null) n++;
    });
    return n;
  }, [meshHooks.meshMap]);

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

        const saved = meshReviewOverrides.get(layerKey) ?? meshHooks.meshMap.get(layerKey) ?? null;
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
        const hasProductiveLink = !!saved
          && saved.assigned_house_number != null
          && saved.service_macro_id != null
          && saved.service_scope_id != null;
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
  }, [applyViewMode, canManage3D, meshHooks, meshReviewOverrides, projectId, sceneObj, viewMode]);

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

      const saved = meshReviewOverrides.get(layerKey) ?? meshHooks.meshMap.get(layerKey) ?? null;
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
      const hasProductiveLink = !!saved
        && saved.assigned_house_number != null
        && saved.service_macro_id != null
        && saved.service_scope_id != null;
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
  }, [canManage3D, meshHooks.meshMap, meshReviewOverrides, projectId, sceneObj]);

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
      const contexts = Array.from(meshHooks.meshMap.values()).filter((mesh) =>
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
  }, [applyViewMode, canManage3D, meshHooks, projectId, viewMode]);

  const logContextAudit = useCallback(() => {
    const contexts = Array.from(meshHooks.meshMap.values()).filter((mesh) => isContextProjectModelMesh(mesh));
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
  }, [meshHooks.meshMap]);

  // Sincronização 3D Real
  const handleSync3DReal = useCallback(async (options?: { silent?: boolean }) => {
    if (!canManage3D) { toast.error("Sem permissão para sincronizar o 3D Real."); return; }
    if (!projectId) return;
    setIsSyncing(true);
    try {
      const meshMapBeforeRefresh = meshHooks.meshMap;
      const refreshedAtSync = await meshHooks.refresh();
      const refreshedMeshMap = new Map((refreshedAtSync || []).map((mesh) => [mesh.layer_key, mesh]));
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
          override: meshReviewOverrides.get(layerKey) ?? null,
        })),
      });

      const allMeshes = Array.from(sourceMeshMap.values());
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
      housesForSync.forEach((h: any) => {
        const hn = h.houseNumber ?? h.house_number ?? h.number ?? h.id;
        (h.macros || []).forEach((macro: any) => {
          (macro.scopes || []).forEach((scope: any) => {
            progressMap.set(`${hn}::${macro.id}::${scope.id}`, Number(scope.progress || 0));
          });
        });
      });

      const ignoredCount = allMeshes.filter((mesh) => mesh.ignored).length;
      const contextCount = allMeshes.filter((mesh) => !mesh.ignored && isContextProjectModelMesh(mesh)).length;
      const linkedProductionMeshes = allMeshes.filter((mesh) =>
        !mesh.ignored
        && !isContextProjectModelMesh(mesh)
        && mesh.assigned_house_number != null
        && mesh.service_macro_id != null
        && mesh.service_scope_id != null,
      );
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
          .filter((mesh) => !isContextProjectModelMesh(mesh) && mesh.assigned_house_number != null && mesh.service_macro_id != null && mesh.service_scope_id != null)
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
      if (syncErrors.length > 0) {
        console.error("[GLB Real Sync Optimized] update errors", syncErrors);
        throw syncErrors[0];
      }

      const refreshedMeshes = await meshHooks.refresh();
      if (refreshedMeshes?.length) {
        const refreshedMap = new Map(refreshedMeshes.map((mesh) => [mesh.layer_key, mesh]));
        applyViewMode(viewMode, refreshedMap);
      } else {
        applyViewMode(viewMode);
      }
      setLastSyncResult({ total: linkedCount, visible, hidden, unlinked: unlinkedCount, syncedAt: new Date() });
      if (!options?.silent) toast.success(`Sincronizado: ${visible} produção visíveis · ${hidden} produção ocultas · ${contextCount} contextos · ${unlinkedCount} sem vínculo ignoradas`);
    } catch (err) {
      console.error("[Sync3D]", err);
      toast.error("Erro ao sincronizar");
    } finally { setIsSyncing(false); }
  }, [canManage3D, projectId, meshHooks, currentProject, applyViewMode, viewMode, meshReviewOverrides]);

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
    if (!canManage3D) { toast.error("Sem permissão para atribuir casas no Mapa 3D."); return; }
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
  }, [canManage3D, pickedMesh, meshAssignments]);

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

  const centerCamera = () => { setFitTrigger(p => p + 1); toast.success("Centralizado"); };
  const resetCameraView = () => { setResetTrigger(p => p + 1); toast.success("Visão resetada"); };

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
          setModelData({ url: data.model_3d_url, type: data.model_3d_type as "gltf" | "obj", mtlUrl: data.model_mtl_url || undefined });
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
    if (!canManage3D) { toast.error("Sem permissão para salvar o Mapa 3D."); return; }
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

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!projectId) return null;
    const companyId = profile?.company_id;
    if (!companyId) { toast.error("Empresa não identificada para upload."); return null; }
    const ext = file.name.split('.').pop();
    // RLS exige que a primeira pasta seja o company_id
    const path = `${companyId}/${projectId}/${folder}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('3d-models').upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) { toast.error(`Upload falhou: ${error.message}`); return null; }
    return supabase.storage.from('3d-models').getPublicUrl(data.path).data.publicUrl;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage3D) {
      toast.error("Sem permissão para importar modelo 3D.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const file = e.target.files?.[0]; if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".gltf") || name.endsWith(".glb")) {
      setIsLoading(true); setSceneReady(false);
      try {
        const url = await uploadFile(file, 'gltf');
        if (url) { setModelData({ url, type: "gltf" }); setHasChanges(true); toast.success("Modelo carregado!"); }
      } finally { setIsLoading(false); }
    } else if (name.endsWith(".ifc")) {
      setIsLoading(true); setSceneReady(false);
      try {
        const url = await uploadFile(file, 'ifc');
        if (url) { setModelData({ url, type: "ifc" }); setHasChanges(true); toast.success("Modelo IFC carregado!"); }
      } finally { setIsLoading(false); }
    } else if (name.endsWith(".obj")) {
      setPendingObjFile(file); toast.info("OBJ selecionado. Selecione MTL ou 'Sem MTL'");
    } else { toast.error("Use .gltf, .glb, .ifc ou .obj"); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMtlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage3D) { toast.error("Sem permissão para importar modelo 3D."); return; }
    const file = e.target.files?.[0]; if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const objUrl = await uploadFile(pendingObjFile, 'obj');
      const mtlUrl = file ? await uploadFile(file, 'mtl') : undefined;
      if (objUrl) { setModelData({ url: objUrl, type: "obj", mtlUrl }); setHasChanges(true); toast.success("Modelo OBJ carregado!"); }
    } finally { setPendingObjFile(null); setIsLoading(false); if (mtlInputRef.current) mtlInputRef.current.value = ''; }
  };

  const loadObjWithoutMtl = async () => {
    if (!canManage3D) { toast.error("Sem permissão para importar modelo 3D."); return; }
    if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const url = await uploadFile(pendingObjFile, 'obj');
      if (url) { setModelData({ url, type: "obj" }); setHasChanges(true); toast.success("OBJ carregado sem materiais"); }
    } finally { setPendingObjFile(null); setIsLoading(false); }
  };

  const resetView = () => {
    if (!canDelete3D) { toast.error("Sem permissão para resetar o Mapa 3D."); return; }
    if (!projectId) return;
    setModelData(null); setMarkers([]); setSelectedMarker(null); setPendingObjFile(null);
    setCameraMode("orbit");
    setSavedPos(null); setSavedTgt(null); setPendingPos(null); setPendingTgt(null);
    setSceneReady(false); setHasChanges(true);
    toast.success("Mapa resetado. Salve para confirmar.");
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            {canManage3D && (
              <>
                <Input ref={fileInputRef} type="file" accept=".gltf,.glb,.obj,.ifc" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}Importar 3D
                </Button>
              </>
            )}
            {canManage3D && pendingObjFile && (<>
              <Input ref={mtlInputRef} type="file" accept=".mtl" onChange={handleMtlUpload} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => mtlInputRef.current?.click()} disabled={isLoading}>MTL</Button>
              <Button variant="secondary" size="sm" onClick={loadObjWithoutMtl} disabled={isLoading}>Sem MTL</Button>
            </>)}
            <Button variant="outline" size="sm" onClick={centerCamera} disabled={isLoading}><Target className="h-4 w-4 mr-1.5" />Centralizar</Button>
            <Button variant="outline" size="sm" onClick={resetCameraView} disabled={isLoading}><Home className="h-4 w-4 mr-1.5" />Resetar Visão</Button>
            {modelData && (
              <Button
                variant={cameraMode === "walk" ? "default" : "outline"}
                size="sm"
                onClick={toggleWalkMode}
                disabled={isLoading}
                title="Caminhar pelo modelo em primeira pessoa"
              >
                <Move3D className="h-4 w-4 mr-1.5" />
                {cameraMode === "walk" ? "Sair do caminhar" : "Caminhar"}
              </Button>
            )}
            {canManage3D && layerManager.layers.length > 0 && (
              <Button variant={showLayers ? "default" : "outline"} size="sm" onClick={() => setShowLayers(p => !p)} disabled={isLoading}>
                <Layers className="h-4 w-4 mr-1.5" />Camadas ({layerManager.layers.length})
              </Button>
            )}
            {canManage3D && layerManager.layers.length > 0 && (currentProject?.houses?.length ?? 0) > 0 && (
              <Button
                variant={assignMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setCameraMode("orbit"); setAssignMode(p => !p); setPickedMesh(null); }}
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
            {canManage3D && modelData && (
              <Button
                variant={reviewMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCameraMode("orbit");
                  setReviewMode(p => !p);
                  setSelectedMeshKey(null);
                  setIsolatedKeys(null);
                  setQuickContextPanelOpen(false);
                  clearSmartLinkPreview("review toggle");
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
            {canManage3D && reviewMode && sceneObj && (
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
            {canManage3D && modelData?.type === "ifc" && projectId && (
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
                  clearSmartLinkPreview("view mode changed");
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
            {canManage3D && modelData && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSync3DReal()}
                disabled={isLoading || isSyncing || meshHooks.meshMap.size === 0}
                title="Atualiza a visibilidade das meshes a partir da produção real"
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
            {canDelete3D && (
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
            {canManage3D && (
              <Button variant={hasChanges ? "default" : "outline"} size="sm" onClick={save3DMap} disabled={isSaving || isLoading}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Salvar
              </Button>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground hidden lg:inline">
              <strong>Arrastar</strong> rotacionar • <strong>Scroll</strong> zoom • <strong>Direito</strong> mover • <strong>Duplo clique</strong> centralizar
            </span>
          </div>
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
          style={assignMode ? { cursor: "crosshair" } : undefined}
        >
          <Canvas shadows dpr={[1, 1.5]} frameloop="always"
            gl={{ antialias: true, powerPreference: "high-performance", stencil: false, depth: true }}
            onDoubleClick={cameraMode === "orbit" ? centerCamera : undefined}
            style={{ width: "100%", height: "100%", background: "#f0f4f8" }}
          >
            <Scene modelData={modelData} markers={markers} selectedMarkerId={selectedMarker?.id || null}
              onMarkerClick={setSelectedMarker} customLegendItems={customLegendItems}
              resetTrigger={resetTrigger} fitTrigger={fitTrigger}
              savedPosition={savedPos} savedTarget={savedTgt}
              onCameraChange={handleCameraChange} sceneReady={sceneReady}
              onModelLoaded={handleModelLoaded} onSceneReady={handleSceneReady}
              onMeshClick={cameraMode === "walk" ? undefined : reviewMode ? handleReviewMeshClick : assignMode ? handleMeshClick : undefined}
              selectedMeshKey={cameraMode === "walk" ? null : reviewMode ? selectedMeshKey : null}
              projectId={projectId}
              companyId={companyId}
              ifcRealModeActive={modelData?.type === "ifc" && viewMode === "real"}
              ifcHouseOptions={houseNumbers}
              ifcServiceOptions={serviceOptions}
              cameraMode={cameraMode}
              walkInspectOpen={!!walkInspection}
              onWalkExit={exitWalkMode}
              onWalkInspectClose={() => setWalkInspection(null)}
              onWalkMeshInspect={handleWalkMeshInspect} />
          </Canvas>
        </div>
        <div id="map3d-ifc-panel-slot" className="pointer-events-none absolute bottom-3 left-0 right-3 top-3 z-40 overflow-hidden" />
        {cameraMode === "walk" && (
          <div className="absolute top-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg border border-primary/30 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur pointer-events-none">
            <div className="font-semibold text-primary">Caminhar na Obra</div>
            <div className="text-muted-foreground">
              Clique no mapa para capturar o mouse | WASD mover | Mouse olhar | E inspecionar/fechar | Shift acelerar | Esc sair
            </div>
          </div>
        )}
        {smartLinkPreviewBarOpen && smartLinkPreviewEnabled && (
          <div className="absolute top-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <div>
              <p className="font-semibold text-primary">Previa de similares ativa</p>
              <p className="text-muted-foreground">
                {smartLinkPreviewMode === "isolate" ? "Candidatas isoladas no mapa" : "Candidatas destacadas no mapa"}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={returnToSmartLinkList}>
              Voltar para lista
            </Button>
            {smartLinkPreviewMode === "isolate" ? (
              <Button type="button" size="sm" variant="outline" onClick={showSmartLinkCandidatesOnMap}>
                Mostrar tudo
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={isolateSmartLinkCandidates}>
                Isolar candidatas
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => clearSmartLinkPreview("preview bar clear")}>
              Limpar destaque
            </Button>
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
            meshData={meshReviewOverrides.get(selectedMeshKey) ?? meshHooks.meshMap.get(selectedMeshKey) ?? null}
            sceneRef={sceneObj}
            houses={houseNumbers}
            services={serviceOptions}
            isolated={!!isolatedKeys?.has(selectedMeshKey)}
            onClose={() => { setSelectedMeshKey(null); setIsolatedKeys(null); }}
            onIsolate={handleIsolate}
            onShowAll={handleClearIsolation}
            onFindSimilar={openSmartLinkSimilar}
            onUpdate={async (key, data) => {
              if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return; }
              const payload = { layer_key: key, ...data };
              if (import.meta.env.DEV) {
                console.log("[GLB Mesh Link] map onUpdate", {
                  selectedMeshKey,
                  key,
                  payload,
                  before: meshHooks.meshMap.get(key) ?? null,
                });
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
              setMeshReviewOverrides((prev) => {
                const next = new Map(prev);
                next.set(key, effectiveSaved);
                return next;
              });
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
              setSelectedMeshKey(null);
              setIsolatedKeys(null);
              toast.success("Mesh marcada como ignorada");
            }}
          />
        )}
        {canManage3D && showLayers && layerManager.layers.length > 0 && (
          <LayersPanel
            layers={layerManager.layers}
            links={layerManager.links}
            autoMode={layerManager.autoMode}
            onAutoModeChange={layerManager.setAutoMode}
            onToggleLayer={layerManager.toggleLayer}
            onOpacityChange={layerManager.setLayerOpacity}
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
        {!modelData && markers.length === 0 && !isLoading && (
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

      {canManage3D && projectId && (
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
      {canManage3D && projectId && (
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
