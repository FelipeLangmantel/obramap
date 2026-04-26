import { useState, useRef, Suspense, useCallback, useEffect } from "react";
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
import { Upload, RotateCcw, Move3D, X, ChevronDown, ChevronRight, Save, Loader2, Home, AlertTriangle, Target, Layers, Camera } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useModelLayers } from "./map3d/useModelLayers";
import { LayersPanel } from "./map3d/LayersPanel";
import { LinkLayersDialog } from "./map3d/LinkLayersDialog";
import { HouseFotoHistoryDrawer } from "@/components/diario/HouseFotoHistoryDrawer";

interface ModelData {
  url: string;
  type: "gltf" | "obj";
  mtlUrl?: string;
}

interface HouseMarker {
  id: number;
  houseNumber: number;
  position: [number, number, number];
  progress: number;
  macros: any[];
}

// GLTF model - calls onLoaded after it's in the scene
function GLTFModel({ url, onLoaded, onSceneReady }: { url: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void }) {
  const { scene } = useGLTF(url);
  const calledRef = useRef(false);
  
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
  
  return <primitive object={scene} />;
}

// OBJ model - calls onLoaded after it's in the scene
function OBJModel({ url, mtlUrl, onLoaded, onSceneReady }: { url: string; mtlUrl?: string; onLoaded: () => void; onSceneReady?: (scene: THREE.Object3D) => void }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null;
  const obj = useLoader(OBJLoader, url, (loader) => {
    if (materials) { materials.preload(); loader.setMaterials(materials); }
  });
  const calledRef = useRef(false);

  useEffect(() => {
    if (obj && !calledRef.current) {
      calledRef.current = true;
      onSceneReady?.(obj);
      requestAnimationFrame(() => { requestAnimationFrame(() => { onLoaded(); }); });
    }
  }, [obj, onLoaded, onSceneReady]);

  return <primitive object={obj} />;
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
  resetTrigger, fitTrigger, savedPosition, savedTarget, onCameraChange, sceneReady, onModelLoaded, onSceneReady
}: { 
  modelData: ModelData | null; markers: HouseMarker[]; selectedMarkerId: number | null;
  onMarkerClick: (m: HouseMarker) => void; customLegendItems: any[];
  resetTrigger: number; fitTrigger: number;
  savedPosition?: [number, number, number] | null; savedTarget?: [number, number, number] | null;
  onCameraChange?: (p: [number, number, number], t: [number, number, number]) => void;
  sceneReady: boolean; onModelLoaded: () => void;
  onSceneReady?: (scene: THREE.Object3D) => void;
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
            <GLTFModel url={modelData.url} onLoaded={onModelLoaded} onSceneReady={onSceneReady} />
          ) : (
            <OBJModel url={modelData.url} mtlUrl={modelData.mtlUrl} onLoaded={onModelLoaded} onSceneReady={onSceneReady} />
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
  const { currentProject } = useConstruction();
  const { isAdmin } = useAuth();
  const projectId = currentProject?.id;
  
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
  const [showLayers, setShowLayers] = useState(false);
  
  const layerManager = useModelLayers(projectId);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mtlInputRef = useRef<HTMLInputElement>(null);
  const [pendingObjFile, setPendingObjFile] = useState<File | null>(null);
  
  const handleCameraChange = useCallback((p: [number, number, number], t: [number, number, number]) => {
    setPendingPos(p); setPendingTgt(t);
  }, []);

  // Called by the actual 3D model component when geometry is in scene
  const handleModelLoaded = useCallback(() => {
    console.log('[3D] Model geometry loaded in scene');
    setSceneReady(true);
  }, []);

  // Extract layers when 3D scene is ready
  const handleSceneReady = useCallback((scene: THREE.Object3D) => {
    layerManager.extractLayers(scene);
    console.log('[3D] Layers extracted from model');
  }, [layerManager.extractLayers]);

  // ============================================================
  // Integração 3D ⇄ Produção em tempo real
  // ============================================================
  // Calcula o progresso médio por (macro_id, scope_id) e por (macro_id)
  // diretamente das casas em memória — sem query adicional. As casas já
  // são mantidas atualizadas em tempo real pelo canal `houses-realtime-*`
  // do ConstructionContext (recompute_house_progress_from_diary roda no
  // backend a cada item de diário/produção). Assim, ao lançar uma produção,
  // o 3D atualiza camada por camada automaticamente.
  useEffect(() => {
    if (!currentProject || !layerManager.autoMode || layerManager.links.length === 0) return;

    const houses = currentProject.houses || [];
    if (houses.length === 0) return;

    const totalHouses = houses.length;
    const sumByScope = new Map<string, number>();   // chave: macro::scope
    const sumByMacro = new Map<string, number>();   // chave: macro
    const countByMacro = new Map<string, number>(); // nº de scopes por macro (para média)

    houses.forEach(h => {
      (h.macros || []).forEach((m: any) => {
        let macroSum = 0;
        let macroCount = 0;
        (m.scopes || []).forEach((s: any) => {
          const key = `${m.id}::${s.id}`;
          sumByScope.set(key, (sumByScope.get(key) || 0) + (s.progress || 0));
          macroSum += (s.progress || 0);
          macroCount += 1;
        });
        // Progresso da etapa = média dos scopes daquela casa
        if (macroCount > 0) {
          sumByMacro.set(m.id, (sumByMacro.get(m.id) || 0) + macroSum / macroCount);
          countByMacro.set(m.id, (countByMacro.get(m.id) || 0) + 1);
        }
      });
    });

    const progressMap = new Map<string, number>();
    sumByScope.forEach((sum, key) => {
      progressMap.set(key, sum / totalHouses);
    });
    sumByMacro.forEach((sum, macroId) => {
      const n = countByMacro.get(macroId) || totalHouses;
      progressMap.set(macroId, sum / n);
    });

    layerManager.updateFromMacroProgress(progressMap);
  }, [
    currentProject?.id,
    currentProject?.houses,
    layerManager.autoMode,
    layerManager.links,
    layerManager.updateFromMacroProgress,
  ]);

  // Realtime: lançamentos no Diário/Produção disparam refresh das casas,
  // que por sua vez recalcula o progresso por camada acima. Pausa quando
  // a aba está oculta para economizar conexões (limite Supabase Pro: 200).
  const { refreshHousesFromDB } = useConstruction();
  useEffect(() => {
    if (!projectId || !layerManager.autoMode) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      channel = supabase
        .channel(`map3d-production-${projectId}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "productions",
          filter: `project_id=eq.${projectId}`,
        }, () => { void refreshHousesFromDB(); })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "weekly_productions",
          filter: `project_id=eq.${projectId}`,
        }, () => { void refreshHousesFromDB(); })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "diary_items",
        }, () => { void refreshHousesFromDB(); })
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
  }, [projectId, layerManager.autoMode, refreshHousesFromDB]);

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
    const ext = file.name.split('.').pop();
    const path = `${projectId}/${folder}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from('3d-models').upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) { toast.error(`Upload falhou: ${error.message}`); return null; }
    return supabase.storage.from('3d-models').getPublicUrl(data.path).data.publicUrl;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".gltf") || name.endsWith(".glb")) {
      setIsLoading(true); setSceneReady(false);
      try {
        const url = await uploadFile(file, 'gltf');
        if (url) { setModelData({ url, type: "gltf" }); setHasChanges(true); toast.success("Modelo carregado!"); }
      } finally { setIsLoading(false); }
    } else if (name.endsWith(".obj")) {
      setPendingObjFile(file); toast.info("OBJ selecionado. Selecione MTL ou 'Sem MTL'");
    } else { toast.error("Use .gltf, .glb ou .obj"); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMtlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const objUrl = await uploadFile(pendingObjFile, 'obj');
      const mtlUrl = file ? await uploadFile(file, 'mtl') : undefined;
      if (objUrl) { setModelData({ url: objUrl, type: "obj", mtlUrl }); setHasChanges(true); toast.success("Modelo OBJ carregado!"); }
    } finally { setPendingObjFile(null); setIsLoading(false); if (mtlInputRef.current) mtlInputRef.current.value = ''; }
  };

  const loadObjWithoutMtl = async () => {
    if (!pendingObjFile) return;
    setIsLoading(true); setSceneReady(false);
    try {
      const url = await uploadFile(pendingObjFile, 'obj');
      if (url) { setModelData({ url, type: "obj" }); setHasChanges(true); toast.success("OBJ carregado sem materiais"); }
    } finally { setPendingObjFile(null); setIsLoading(false); }
  };

  const resetView = () => {
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
            <Input ref={fileInputRef} type="file" accept=".gltf,.glb,.obj" onChange={handleFileUpload} className="hidden" disabled={isLoading} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}Importar 3D
            </Button>
            {pendingObjFile && (<>
              <Input ref={mtlInputRef} type="file" accept=".mtl" onChange={handleMtlUpload} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => mtlInputRef.current?.click()} disabled={isLoading}>MTL</Button>
              <Button variant="secondary" size="sm" onClick={loadObjWithoutMtl} disabled={isLoading}>Sem MTL</Button>
            </>)}
            <Button variant="outline" size="sm" onClick={centerCamera} disabled={isLoading}><Target className="h-4 w-4 mr-1.5" />Centralizar</Button>
            <Button variant="outline" size="sm" onClick={resetCameraView} disabled={isLoading}><Home className="h-4 w-4 mr-1.5" />Resetar Visão</Button>
            {layerManager.layers.length > 0 && (
              <Button variant={showLayers ? "default" : "outline"} size="sm" onClick={() => setShowLayers(p => !p)} disabled={isLoading}>
                <Layers className="h-4 w-4 mr-1.5" />Camadas ({layerManager.layers.length})
              </Button>
            )}
            {isAdmin && (
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
            {isAdmin && (
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
        <div className="absolute inset-0">
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
              onModelLoaded={handleModelLoaded} onSceneReady={handleSceneReady} />
          </Canvas>
        </div>
        {showLayers && layerManager.layers.length > 0 && (
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
              <p className="text-sm text-muted-foreground">Importe um modelo 3D (.glTF, .glb ou .obj)</p>
            </div>
          </div>
        )}
      </Card>

      {projectId && (
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
    </div>
  );
}
