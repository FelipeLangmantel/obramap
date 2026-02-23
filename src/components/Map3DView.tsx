import { useState, useRef, Suspense, useCallback, useEffect } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
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
import { Progress } from "@/components/ui/progress";
import { Upload, RotateCcw, Move3D, X, ChevronDown, ChevronRight, Save, Loader2, Home, AlertTriangle, Target } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

// Component to load and display GLTF model
function GLTFModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// Component to load and display OBJ model
function OBJModel({ url, mtlUrl }: { url: string; mtlUrl?: string }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null;
  const obj = useLoader(OBJLoader, url, (loader) => {
    if (materials) {
      materials.preload();
      loader.setMaterials(materials);
    }
  });
  return <primitive object={obj} />;
}

// House marker component for 3D scene
function HouseMarker3D({ 
  marker, 
  onClick, 
  isSelected,
  customLegendItems 
}: { 
  marker: HouseMarker; 
  onClick: () => void;
  isSelected: boolean;
  customLegendItems: any[];
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const getProgressColor = (progress: number) => {
    if (progress === 0) return "#6b7280";
    
    const sortedItems = [...customLegendItems].sort((a, b) => a.minPercent - b.minPercent);
    for (const item of sortedItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    
    if (progress < 50) return "#ef4444";
    if (progress < 100) return "#eab308";
    return "#22c55e";
  };

  const color = getProgressColor(marker.progress);

  return (
    <group position={marker.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[0.5, 0.3, 0.5]} />
        <meshStandardMaterial 
          color={color} 
          emissive={isSelected ? color : "#000000"}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>
      <Html
        position={[0, 0.4, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: 'none' }}
      >
        <div className="bg-background/90 px-2 py-1 rounded text-xs font-medium whitespace-nowrap border border-border">
          Casa {marker.houseNumber} - {marker.progress.toFixed(0)}%
        </div>
      </Html>
    </group>
  );
}

// Helper: fit camera to scene bounding box
function fitCameraToScene(
  scene: THREE.Scene,
  camera: THREE.Camera,
  controls: any
) {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  cameraZ *= 1.5; // 50% margin

  camera.position.set(
    center.x + cameraZ * 0.5,
    center.y + cameraZ * 0.8,
    center.z + cameraZ * 0.5
  );
  camera.lookAt(center);

  if (controls && controls.target) {
    controls.target.copy(center);
    controls.maxDistance = cameraZ * 3;
    controls.minDistance = maxDim * 0.2;
    controls.update();
  }
}

// Camera controller
function CameraController({ 
  resetTrigger, 
  fitTrigger,
  savedPosition, 
  savedTarget,
  onCameraChange,
  modelLoaded
}: { 
  resetTrigger: number;
  fitTrigger: number;
  savedPosition?: [number, number, number] | null;
  savedTarget?: [number, number, number] | null;
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void;
  modelLoaded?: boolean;
}) {
  const { camera, controls, scene } = useThree();
  const hasInitializedRef = useRef(false);
  const hasAutoFitRef = useRef(false);

  const doFit = useCallback(() => {
    fitCameraToScene(scene, camera, controls);
    if (onCameraChange && controls && (controls as any).target) {
      const t = (controls as any).target;
      onCameraChange(
        [camera.position.x, camera.position.y, camera.position.z],
        [t.x, t.y, t.z]
      );
    }
  }, [camera, controls, scene, onCameraChange]);

  // Initialize from saved position
  useEffect(() => {
    if (!hasInitializedRef.current && savedPosition && savedTarget) {
      camera.position.set(savedPosition[0], savedPosition[1], savedPosition[2]);
      if (controls && (controls as any).target) {
        (controls as any).target.set(savedTarget[0], savedTarget[1], savedTarget[2]);
        (controls as any).update();
      }
      hasInitializedRef.current = true;
    }
  }, [savedPosition, savedTarget, camera, controls]);

  // Auto-fit when model first loads (and no saved position)
  useEffect(() => {
    if (modelLoaded && !hasAutoFitRef.current && !savedPosition) {
      setTimeout(() => {
        doFit();
        hasAutoFitRef.current = true;
      }, 200);
    }
  }, [modelLoaded, savedPosition, doFit]);

  // Also auto-fit when there IS a saved position but model just loaded
  // This ensures the model is always visible on open
  useEffect(() => {
    if (modelLoaded && !hasAutoFitRef.current && savedPosition) {
      // Use saved position
      camera.position.set(savedPosition[0], savedPosition[1], savedPosition[2]);
      if (controls && (controls as any).target && savedTarget) {
        (controls as any).target.set(savedTarget[0], savedTarget[1], savedTarget[2]);
        (controls as any).update();
      }
      hasAutoFitRef.current = true;
    }
  }, [modelLoaded, savedPosition, savedTarget, camera, controls]);

  // Reset trigger -> go to saved position or fit
  useEffect(() => {
    if (resetTrigger > 0) {
      if (savedPosition && savedTarget) {
        camera.position.set(savedPosition[0], savedPosition[1], savedPosition[2]);
        if (controls && (controls as any).target) {
          (controls as any).target.set(savedTarget[0], savedTarget[1], savedTarget[2]);
          (controls as any).update();
        }
      } else {
        doFit();
      }
    }
  }, [resetTrigger, savedPosition, savedTarget, camera, controls, doFit]);

  // Fit trigger -> always fit to model bounds
  useEffect(() => {
    if (fitTrigger > 0) {
      doFit();
    }
  }, [fitTrigger, doFit]);

  // Track camera changes on control end
  useEffect(() => {
    if (!controls) return;
    const handleEnd = () => {
      if (onCameraChange && (controls as any).target) {
        const target = (controls as any).target;
        onCameraChange(
          [camera.position.x, camera.position.y, camera.position.z],
          [target.x, target.y, target.z]
        );
      }
    };
    (controls as any).addEventListener?.('end', handleEnd);
    return () => {
      (controls as any).removeEventListener?.('end', handleEnd);
    };
  }, [camera, controls, onCameraChange]);

  return null;
}

// 3D Scene component
function Scene({ 
  modelData, 
  markers, 
  selectedMarkerId,
  onMarkerClick,
  customLegendItems,
  resetTrigger,
  fitTrigger,
  savedPosition,
  savedTarget,
  onCameraChange,
  onDoubleClick
}: { 
  modelData: ModelData | null;
  markers: HouseMarker[];
  selectedMarkerId: number | null;
  onMarkerClick: (marker: HouseMarker) => void;
  customLegendItems: any[];
  resetTrigger: number;
  fitTrigger: number;
  savedPosition?: [number, number, number] | null;
  savedTarget?: [number, number, number] | null;
  onCameraChange?: (position: [number, number, number], target: [number, number, number]) => void;
  onDoubleClick?: () => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 30, 20]} fov={50} />
      <CameraController 
        resetTrigger={resetTrigger}
        fitTrigger={fitTrigger}
        savedPosition={savedPosition}
        savedTarget={savedTarget}
        onCameraChange={onCameraChange}
        modelLoaded={!!modelData || markers.length > 0}
      />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minDistance={1}
        maxDistance={500}
        zoomSpeed={2.0}
        panSpeed={1.5}
        rotateSpeed={1.2}
        enableDamping={true}
        dampingFactor={0.05}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        }}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        }}
      />
      
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <hemisphereLight args={["#87ceeb", "#4a7c59", 0.4]} />
      
      {/* No grid - clean view */}
      
      {/* 3D Model */}
      {modelData && (
        <Suspense fallback={
          <Html center>
            <div className="bg-background/90 px-4 py-2 rounded-lg border border-border">
              Carregando modelo...
            </div>
          </Html>
        }>
          {modelData.type === "gltf" ? (
            <GLTFModel url={modelData.url} />
          ) : (
            <OBJModel url={modelData.url} mtlUrl={modelData.mtlUrl} />
          )}
        </Suspense>
      )}
      
      {/* House markers */}
      {markers.map((marker) => (
        <HouseMarker3D
          key={marker.id}
          marker={marker}
          onClick={() => onMarkerClick(marker)}
          isSelected={selectedMarkerId === marker.id}
          customLegendItems={customLegendItems}
        />
      ))}
    </>
  );
}

// House details panel
function HouseDetailsPanel({ 
  marker, 
  onClose,
  customLegendItems 
}: { 
  marker: HouseMarker; 
  onClose: () => void;
  customLegendItems: any[];
}) {
  const [expandedMacros, setExpandedMacros] = useState<string[]>([]);

  const toggleMacro = (macroId: string) => {
    setExpandedMacros(prev => 
      prev.includes(macroId) 
        ? prev.filter(id => id !== macroId)
        : [...prev, macroId]
    );
  };

  const getProgressBarColor = (progress: number) => {
    if (progress === 0) return "hsl(var(--muted))";
    
    const sortedItems = [...customLegendItems].sort((a, b) => a.minPercent - b.minPercent);
    for (const item of sortedItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    
    if (progress < 50) return "hsl(0, 84%, 60%)";
    if (progress < 100) return "hsl(45, 93%, 47%)";
    return "hsl(142, 71%, 45%)";
  };

  return (
    <Card className="absolute top-4 right-4 w-80 max-h-[calc(100%-2rem)] overflow-hidden z-10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Casa {marker.houseNumber}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 overflow-y-auto max-h-[400px]">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progresso Geral</span>
            <span className="font-medium">{marker.progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${marker.progress}%`,
                backgroundColor: getProgressBarColor(marker.progress)
              }}
            />
          </div>
        </div>

        {marker.macros && marker.macros.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Etapas</h4>
            {marker.macros.map((macro: any) => (
              <Collapsible 
                key={macro.id}
                open={expandedMacros.includes(macro.id)}
                onOpenChange={() => toggleMacro(macro.id)}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    {expandedMacros.includes(macro.id) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 text-left">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{macro.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {macro.progress?.toFixed(0) || 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${macro.progress || 0}%`,
                            backgroundColor: getProgressBarColor(macro.progress || 0)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-6 space-y-1">
                    {macro.scopes?.map((scope: any) => (
                      <div key={scope.id} className="p-2 rounded-lg bg-muted/30">
                        <div className="flex justify-between items-center">
                          <span className="text-xs">{scope.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {scope.percentage || 0}%
                          </span>
                        </div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${scope.percentage || 0}%`,
                              backgroundColor: getProgressBarColor(scope.percentage || 0)
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Map3DView() {
  const { currentProject } = useConstruction();
  const { isAdmin } = useAuth();
  const houses = currentProject?.houses || [];
  const projectId = currentProject?.id;
  
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [markers, setMarkers] = useState<HouseMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<HouseMarker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [cameraResetTrigger, setCameraResetTrigger] = useState(0);
  const [cameraFitTrigger, setCameraFitTrigger] = useState(0);
  const [savedCameraPosition, setSavedCameraPosition] = useState<[number, number, number] | null>(null);
  const [savedCameraTarget, setSavedCameraTarget] = useState<[number, number, number] | null>(null);
  const [pendingCameraPosition, setPendingCameraPosition] = useState<[number, number, number] | null>(null);
  const [pendingCameraTarget, setPendingCameraTarget] = useState<[number, number, number] | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mtlInputRef = useRef<HTMLInputElement>(null);
  const [pendingObjFile, setPendingObjFile] = useState<File | null>(null);
  
  const handleCameraChange = useCallback((position: [number, number, number], target: [number, number, number]) => {
    setPendingCameraPosition(position);
    setPendingCameraTarget(target);
  }, []);

  // Centralizar = fit to model bounds
  const centerCamera = () => {
    setCameraFitTrigger(prev => prev + 1);
    toast.success("Mapa centralizado");
  };

  // Resetar visão = voltar para posição salva
  const resetCameraView = () => {
    setCameraResetTrigger(prev => prev + 1);
    toast.success("Visualização resetada");
  };

  const customLegendItems = currentProject?.customLegendItems || [
    { minPercent: 0, maxPercent: 49, color: "#ef4444" },
    { minPercent: 50, maxPercent: 99, color: "#eab308" },
    { minPercent: 100, maxPercent: 100, color: "#22c55e" }
  ];

  // Load saved 3D map data from database
  const loadSaved3DMap = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('map_layouts')
        .select('model_3d_url, model_3d_type, model_mtl_url, house_markers_3d, camera_position, camera_target')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) {
        console.error('Error loading 3D map:', error);
        return;
      }

      if (data) {
        if (data.model_3d_url && data.model_3d_type) {
          setModelData({
            url: data.model_3d_url,
            type: data.model_3d_type as "gltf" | "obj",
            mtlUrl: data.model_mtl_url || undefined
          });
        }

        if (data.house_markers_3d && Array.isArray(data.house_markers_3d) && data.house_markers_3d.length > 0) {
          setMarkers(data.house_markers_3d as unknown as HouseMarker[]);
        }
        
        if (data.camera_position && Array.isArray(data.camera_position)) {
          setSavedCameraPosition(data.camera_position as [number, number, number]);
        }
        if (data.camera_target && Array.isArray(data.camera_target)) {
          setSavedCameraTarget(data.camera_target as [number, number, number]);
        }
      }
    } catch (err) {
      console.error('Error loading 3D map:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSaved3DMap();
  }, [loadSaved3DMap]);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        setCameraFitTrigger(prev => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, []);

  const save3DMap = async () => {
    if (!projectId) {
      toast.error("Selecione um projeto primeiro");
      return;
    }

    setIsSaving(true);
    try {
      const { data: existingLayout } = await supabase
        .from('map_layouts')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();

      const updateData = {
        model_3d_url: modelData?.url || null,
        model_3d_type: modelData?.type || null,
        model_mtl_url: modelData?.mtlUrl || null,
        house_markers_3d: markers as unknown as any[],
        camera_position: pendingCameraPosition || savedCameraPosition,
        camera_target: pendingCameraTarget || savedCameraTarget
      };

      if (existingLayout) {
        const { error } = await supabase
          .from('map_layouts')
          .update(updateData)
          .eq('project_id', projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('map_layouts')
          .insert([{ project_id: projectId, ...updateData }]);
        if (error) throw error;
      }

      if (pendingCameraPosition) setSavedCameraPosition(pendingCameraPosition);
      if (pendingCameraTarget) setSavedCameraTarget(pendingCameraTarget);
      
      setHasChanges(false);
      toast.success("Mapa 3D salvo com sucesso!");
    } catch (err) {
      console.error('Error saving 3D map:', err);
      toast.error("Erro ao salvar mapa 3D");
    } finally {
      setIsSaving(false);
    }
  };

  const uploadFileToStorage = async (file: File, folder: string): Promise<string | null> => {
    if (!projectId) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${projectId}/${folder}/${Date.now()}.${fileExt}`;
    const { data, error } = await supabase.storage
      .from('3d-models')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });
    if (error) {
      console.error('Error uploading file:', error);
      toast.error(`Erro ao fazer upload: ${error.message}`);
      return null;
    }
    const { data: urlData } = supabase.storage.from('3d-models').getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith(".gltf") || fileName.endsWith(".glb")) {
      setIsLoading(true);
      try {
        const uploadedUrl = await uploadFileToStorage(file, 'gltf');
        if (uploadedUrl) {
          setModelData({ url: uploadedUrl, type: "gltf" });
          setHasChanges(true);
          toast.success("Modelo glTF carregado com sucesso!");
        }
      } finally {
        setIsLoading(false);
      }
    } else if (fileName.endsWith(".obj")) {
      setPendingObjFile(file);
      toast.info("Arquivo OBJ selecionado. Selecione o arquivo MTL (opcional) ou clique em 'Carregar sem MTL'");
    } else {
      toast.error("Formato não suportado. Use glTF (.gltf, .glb) ou OBJ (.obj)");
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMtlUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!pendingObjFile) return;
    setIsLoading(true);
    try {
      const objUrl = await uploadFileToStorage(pendingObjFile, 'obj');
      const mtlUrl = file ? await uploadFileToStorage(file, 'mtl') : undefined;
      if (objUrl) {
        setModelData({ url: objUrl, type: "obj", mtlUrl: mtlUrl || undefined });
        setHasChanges(true);
        toast.success("Modelo OBJ carregado com sucesso!");
      }
    } finally {
      setPendingObjFile(null);
      setIsLoading(false);
      if (mtlInputRef.current) mtlInputRef.current.value = '';
    }
  };

  const loadObjWithoutMtl = async () => {
    if (!pendingObjFile) return;
    setIsLoading(true);
    try {
      const objUrl = await uploadFileToStorage(pendingObjFile, 'obj');
      if (objUrl) {
        setModelData({ url: objUrl, type: "obj" });
        setHasChanges(true);
        toast.success("Modelo OBJ carregado sem materiais");
      }
    } finally {
      setPendingObjFile(null);
      setIsLoading(false);
    }
  };

  const resetView = async () => {
    if (!projectId) return;
    setModelData(null);
    setMarkers([]);
    setSelectedMarker(null);
    setPendingObjFile(null);
    setSavedCameraPosition(null);
    setSavedCameraTarget(null);
    setPendingCameraPosition(null);
    setPendingCameraTarget(null);
    setHasChanges(true);
    toast.success("Mapa resetado. Clique em Salvar para confirmar.");
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".gltf,.glb,.obj"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar Modelo 3D
              </Button>
            </div>

            {pendingObjFile && (
              <div className="flex items-center gap-2">
                <Input
                  ref={mtlInputRef}
                  type="file"
                  accept=".mtl"
                  onChange={handleMtlUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => mtlInputRef.current?.click()} disabled={isLoading}>
                  Selecionar MTL
                </Button>
                <Button variant="secondary" onClick={loadObjWithoutMtl} disabled={isLoading}>
                  Carregar sem MTL
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              onClick={centerCamera}
              disabled={isLoading}
            >
              <Target className="h-4 w-4 mr-2" />
              Centralizar
            </Button>

            <Button
              variant="outline"
              onClick={resetCameraView}
              disabled={isLoading}
            >
              <Home className="h-4 w-4 mr-2" />
              Resetar Visão
            </Button>

            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isLoading}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Resetar Mapa
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Confirmar Reset do Mapa
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover o modelo 3D importado, todos os marcadores de casas e a posição da câmera salvos. 
                      <br /><br />
                      <strong>Esta ação não pode ser desfeita.</strong> Você deseja continuar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={resetView} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Sim, Resetar Mapa
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {isAdmin && (
              <Button
                variant={hasChanges ? "default" : "outline"}
                onClick={save3DMap}
                disabled={isSaving || isLoading}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Mapa
              </Button>
            )}

            <div className="flex-1" />

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Controles:</span>{" "}
              <strong>Arrastar</strong> para rotacionar •{" "}
              <strong>Scroll</strong> para zoom •{" "}
              <strong>Botão direito</strong> para mover •{" "}
              <strong>Duplo clique</strong> para centralizar
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3D Canvas */}
      <Card className="flex-1 min-h-[500px] relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20">
            <div className="flex items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Carregando...</span>
            </div>
          </div>
        )}
        
        <Canvas 
          shadows 
          dpr={[1, 1.5]}
          gl={{ 
            antialias: true,
            powerPreference: "high-performance",
            stencil: false,
            depth: true
          }}
          onDoubleClick={centerCamera}
        >
          <Scene
            modelData={modelData}
            markers={markers}
            selectedMarkerId={selectedMarker?.id || null}
            onMarkerClick={setSelectedMarker}
            customLegendItems={customLegendItems}
            resetTrigger={cameraResetTrigger}
            fitTrigger={cameraFitTrigger}
            savedPosition={savedCameraPosition}
            savedTarget={savedCameraTarget}
            onCameraChange={handleCameraChange}
          />
        </Canvas>

        {selectedMarker && (
          <HouseDetailsPanel
            marker={selectedMarker}
            onClose={() => setSelectedMarker(null)}
            customLegendItems={customLegendItems}
          />
        )}

        {!modelData && markers.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-4 p-8 bg-background/80 rounded-xl border border-border">
              <Move3D className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">Mapa 3D</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Importe um modelo 3D (.glTF, .glb ou .obj) para visualizar
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
