import { useState, useRef, Suspense, useCallback, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Html, PerspectiveCamera } from "@react-three/drei";
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
import { useProjectModelMeshes, type ProjectModelMesh } from "@/hooks/useProjectModelMeshes";
import { MeshReviewPanel, type ServiceOption } from "./map3d/MeshReviewPanel";
import { parseHouseNumberFromMesh } from "./map3d/parseHouseFromMeshName";
import { HouseFotoHistoryDrawer } from "@/components/diario/HouseFotoHistoryDrawer";
import { canDelete3DAssets, canManage3DMap } from "@/lib/accessControl";

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

// Aplica highlight branco emissivo na mesh selecionada (modo Revisar).
function useSelectionHighlight(scene: THREE.Object3D | null, selectedKey: string | null) {
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      const apply = (m: any) => {
        if (!m || m.emissive === undefined) return;
        if (mesh.uuid === selectedKey) {
          m.emissive.set(0xffffff);
          m.emissiveIntensity = 0.25;
        } else {
          m.emissive.set(0x000000);
          m.emissiveIntensity = 0;
        }
        m.needsUpdate = true;
      };
      if (Array.isArray(mat)) mat.forEach(apply); else apply(mat);
    });
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

// Camera auto-fit
function AutoFitCamera({ 
  fitTrigger, resetTrigger, savedPosition, savedTarget, onCameraChange, sceneReady
}: {
  fitTrigger: number; resetTrigger: number;
  savedPosition?: [number, number, number] | null; savedTarget?: [number, number, number] | null;
  onCameraChange?: (pos: [number, number, number], tgt: [number, number, number]) => void;
  sceneReady: boolean;
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
    if (!sceneReady || hasAutoFitRef.current || !controls) return;
    hasAutoFitRef.current = true;
    
    // Always fit to model - saved positions may be stale/wrong
    let attempts = 0;
    const tryFit = () => {
      if (doFit()) return;
      attempts++;
      if (attempts < 30) requestAnimationFrame(tryFit);
    };
    tryFit();
  }, [sceneReady, controls, camera, doFit]);

  // Fit trigger
  useEffect(() => {
    if (fitTrigger <= 0) return;
    let attempts = 0;
    const tryFit = () => { if (!doFit() && attempts++ < 15) requestAnimationFrame(tryFit); };
    tryFit();
  }, [fitTrigger, doFit]);

  // Reset trigger
  useEffect(() => {
    if (resetTrigger <= 0 || !controls) return;
    if (savedPosition && savedTarget) {
      camera.position.set(savedPosition[0], savedPosition[1], savedPosition[2]);
      controls.target?.set(savedTarget[0], savedTarget[1], savedTarget[2]);
      controls.update();
    } else { doFit(); }
  }, [resetTrigger, savedPosition, savedTarget, controls, camera, doFit]);

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
  onMeshClick, selectedMeshKey, projectId, companyId,
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
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 50, 50]} fov={50} />
      <AutoFitCamera fitTrigger={fitTrigger} resetTrigger={resetTrigger}
        savedPosition={savedPosition} savedTarget={savedTarget}
        onCameraChange={onCameraChange} sceneReady={sceneReady} />
      <ZoomToMouseControls />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <hemisphereLight args={["#87ceeb", "#4a7c59", 0.4]} />

      {modelData && (
        <Suspense fallback={<Html center><div className="bg-background/90 px-4 py-2 rounded-lg border border-border">Carregando modelo...</div></Html>}>
          {modelData.type === "gltf" ? (
            <GLTFModel url={modelData.url} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
          ) : modelData.type === "ifc" ? (
            <IFCModel url={modelData.url} projectId={projectId} companyId={companyId} onLoaded={onModelLoaded} onSceneReady={onSceneReady} onMeshClick={onMeshClick} selectedMeshKey={selectedMeshKey} />
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

export function Map3DView() {
  const { currentProject, refreshHousesFromDB } = useConstruction();
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

  // Modo de visualização
  type ViewMode = "complete" | "real" | "simulation";
  const [viewMode, setViewMode] = useState<ViewMode>("complete");

  // Sincronização 3D Real
  const [isSyncing, setIsSyncing] = useState(false);
  interface SyncResult { total: number; visible: number; hidden: number; unlinked: number; syncedAt: Date; }
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cena ref para aplicar visibilidade fora do JSX
  const [sceneObj, setSceneObj] = useState<THREE.Object3D | null>(null);

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
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const materialName = Array.isArray(mesh.material)
        ? mesh.material.map((m: any) => m.name).filter(Boolean).join(", ")
        : (mesh.material as any)?.name || "";
      meshesToUpsert.push({
        layer_key: mesh.uuid,
        mesh_name: mesh.name || "",
        material_name: materialName,
        detected_house_number: parseHouseNumberFromMesh(mesh.name || ""),
      });
    });
    if (meshesToUpsert.length > 0) {
      void meshHooks.bulkUpsertMeshes(meshesToUpsert);
    }
  }, [layerManager.extractLayers, projectId, meshHooks]);

  // ====================================================
  // Modo "Revisar Modelo": clique destaca a mesh
  // ====================================================
  const handleReviewMeshClick = useCallback((obj: THREE.Object3D) => {
    if (!reviewMode) return;
    if (!(obj as THREE.Mesh).isMesh) return;
    setSelectedMeshKey((obj as THREE.Mesh).uuid);
  }, [reviewMode]);

  const handleIsolate = useCallback((key: string) => {
    setIsolatedKeys(prev => (prev?.has(key) ? null : new Set([key])));
  }, []);

  // Lista de casas para o painel de revisão
  const houseNumbers = useMemo(() => {
    const arr = (currentProject?.houses || [])
      .map((h: any) => h.houseNumber ?? h.house_number ?? h.number)
      .filter((n: any) => typeof n === "number");
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
  const applyViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (!sceneObj) return;
    sceneObj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const saved = meshHooks.meshMap.get(child.uuid);
      if (!saved) return;
      if (saved.ignored) { child.visible = false; return; }
      switch (mode) {
        case "complete":
          child.visible = saved.visible;
          break;
        case "real": {
          const hasLink = saved.assigned_house_number != null && saved.service_macro_id != null;
          child.visible = hasLink && saved.production_visible;
          break;
        }
        case "simulation":
          child.visible = saved.visible;
          break;
      }
    });
  }, [sceneObj, meshHooks.meshMap]);

  // Re-aplica modo quando meshMap chega/atualiza ou cena fica pronta
  useEffect(() => {
    if (meshHooks.meshMap.size > 0 && sceneObj) applyViewMode(viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshHooks.meshMap, sceneObj]);

  // Aplica isolamento (sobrepõe modo de visão)
  useEffect(() => {
    if (!sceneObj) return;
    if (!isolatedKeys) { applyViewMode(viewMode); return; }
    sceneObj.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      child.visible = isolatedKeys.has(child.uuid);
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

  // Sincronização 3D Real
  const handleSync3DReal = useCallback(async () => {
    if (!canManage3D) { toast.error("Sem permissão para sincronizar o 3D Real."); return; }
    if (!projectId) return;
    setIsSyncing(true);
    try {
      const meshes = Array.from(meshHooks.meshMap.values()).filter(m => !m.ignored);
      if (meshes.length === 0) { toast.info("Nenhuma mesh registrada."); return; }

      const progressMap = new Map<string, number>();
      (currentProject?.houses || []).forEach((h: any) => {
        const hn = h.houseNumber ?? h.house_number ?? h.number;
        (h.macros || []).forEach((macro: any) => {
          (macro.scopes || []).forEach((scope: any) => {
            progressMap.set(`${hn}::${macro.id}::${scope.id}`, scope.progress || 0);
          });
        });
      });

      let visible = 0, hidden = 0, unlinked = 0;
      const now = new Date().toISOString();

      await Promise.all(meshes.map(async (mesh) => {
        const hasLink = mesh.assigned_house_number != null && mesh.service_macro_id != null && mesh.service_scope_id != null;
        let progress = 0; let pv = false;
        if (!hasLink) {
          unlinked++;
        } else {
          progress = progressMap.get(`${mesh.assigned_house_number}::${mesh.service_macro_id}::${mesh.service_scope_id}`) ?? 0;
          pv = progress > 0;
          if (pv) visible++; else hidden++;
        }
        await supabase.from("project_model_meshes" as any).update({
          production_visible: pv, progress_percent: progress, last_synced_at: now,
        }).eq("id", (mesh as any).id);
      }));

      await meshHooks.refresh();
      applyViewMode(viewMode);
      setLastSyncResult({ total: meshes.length, visible, hidden, unlinked, syncedAt: new Date() });
      toast.success(`Sincronizado: ${visible} visíveis · ${hidden} ocultas · ${unlinked} sem vínculo`);
    } catch (err) {
      console.error("[Sync3D]", err);
      toast.error("Erro ao sincronizar");
    } finally { setIsSyncing(false); }
  }, [canManage3D, projectId, meshHooks, currentProject, applyViewMode, viewMode]);

  // Auto-sync após realtime, debounced (somente se já sincronizou ao menos 1x)
  const autoSync = useCallback(() => {
    if (!lastSyncResult) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => { void handleSync3DReal(); }, 800);
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
            {canManage3D && layerManager.layers.length > 0 && (
              <Button variant={showLayers ? "default" : "outline"} size="sm" onClick={() => setShowLayers(p => !p)} disabled={isLoading}>
                <Layers className="h-4 w-4 mr-1.5" />Camadas ({layerManager.layers.length})
              </Button>
            )}
            {canManage3D && layerManager.layers.length > 0 && (currentProject?.houses?.length ?? 0) > 0 && (
              <Button
                variant={assignMode ? "default" : "outline"}
                size="sm"
                onClick={() => { setAssignMode(p => !p); setPickedMesh(null); }}
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
                  setReviewMode(p => !p);
                  setSelectedMeshKey(null);
                  setIsolatedKeys(null);
                  if (!reviewMode) setAssignMode(false);
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
                onValueChange={(v) => { if (v) applyViewMode(v as ViewMode); }}
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
                onClick={handleSync3DReal}
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
          className="absolute inset-0"
          style={assignMode ? { cursor: "crosshair" } : undefined}
        >
          <Canvas shadows dpr={[1, 1.5]} frameloop="always"
            gl={{ antialias: true, powerPreference: "high-performance", stencil: false, depth: true }}
            onDoubleClick={centerCamera}
            style={{ width: "100%", height: "100%", background: "#f0f4f8" }}
          >
            <Scene modelData={modelData} markers={markers} selectedMarkerId={selectedMarker?.id || null}
              onMarkerClick={setSelectedMarker} customLegendItems={customLegendItems}
              resetTrigger={resetTrigger} fitTrigger={fitTrigger}
              savedPosition={savedPos} savedTarget={savedTgt}
              onCameraChange={handleCameraChange} sceneReady={sceneReady}
              onModelLoaded={handleModelLoaded} onSceneReady={handleSceneReady}
              onMeshClick={reviewMode ? handleReviewMeshClick : assignMode ? handleMeshClick : undefined}
              selectedMeshKey={reviewMode ? selectedMeshKey : null}
              projectId={projectId}
              companyId={companyId} />
          </Canvas>
        </div>
        <div id="map3d-ifc-panel-slot" className="pointer-events-none absolute inset-0 z-40" />
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
        {canManage3D && reviewMode && selectedMeshKey && (
          <MeshReviewPanel
            meshKey={selectedMeshKey}
            meshData={meshHooks.meshMap.get(selectedMeshKey) ?? null}
            sceneRef={sceneObj}
            houses={houseNumbers}
            services={serviceOptions}
            isolated={!!isolatedKeys?.has(selectedMeshKey)}
            onClose={() => { setSelectedMeshKey(null); setIsolatedKeys(null); }}
            onIsolate={handleIsolate}
            onUpdate={async (key, data) => {
              if (!canManage3D) { toast.error("Sem permissão para revisar o modelo 3D."); return; }
              await meshHooks.upsertMesh({ layer_key: key, ...data });
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
        <HouseFotoHistoryDrawer
          open={photoHistoryOpen}
          onOpenChange={setPhotoHistoryOpen}
          houseId={selectedMarker?.houseNumber ?? null}
          projectId={projectId ?? null}
          houseLabel={selectedMarker ? `Casa ${String(selectedMarker.houseNumber).padStart(2, "0")}` : undefined}
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
