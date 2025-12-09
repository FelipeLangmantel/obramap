import { useState, useRef, Suspense, useCallback, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Grid, Environment, Html, PerspectiveCamera } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, Box, RotateCcw, Move3D, X, ChevronDown, ChevronRight, Save, Loader2, Home } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

// Camera reset controller
function CameraController({ resetTrigger }: { resetTrigger: number }) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (resetTrigger > 0) {
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
    }
  }, [resetTrigger, camera]);

  return null;
}

// 3D Scene component
function Scene({ 
  modelData, 
  markers, 
  selectedMarkerId,
  onMarkerClick,
  customLegendItems,
  resetTrigger
}: { 
  modelData: ModelData | null;
  markers: HouseMarker[];
  selectedMarkerId: number | null;
  onMarkerClick: (marker: HouseMarker) => void;
  customLegendItems: any[];
  resetTrigger: number;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={60} />
      <CameraController resetTrigger={resetTrigger} />
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxPolarAngle={Math.PI / 2}
        minDistance={2}
        maxDistance={100}
      />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.3} />
      
      <Environment preset="city" />
      
      {/* Ground grid */}
      <Grid
        infiniteGrid
        cellSize={1}
        cellThickness={0.5}
        sectionSize={5}
        sectionThickness={1}
        fadeDistance={50}
        fadeStrength={1}
        cellColor="#6b7280"
        sectionColor="#374151"
      />
      
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
  const houses = currentProject?.houses || [];
  const projectId = currentProject?.id;
  
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [markers, setMarkers] = useState<HouseMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<HouseMarker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [cameraResetTrigger, setCameraResetTrigger] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mtlInputRef = useRef<HTMLInputElement>(null);
  const [pendingObjFile, setPendingObjFile] = useState<File | null>(null);

  // Reset camera when component mounts or project changes
  useEffect(() => {
    setCameraResetTrigger(prev => prev + 1);
  }, [projectId]);

  const centerCamera = () => {
    setCameraResetTrigger(prev => prev + 1);
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
        .select('model_3d_url, model_3d_type, model_mtl_url, house_markers_3d')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) {
        console.error('Error loading 3D map:', error);
        return;
      }

      if (data) {
        // Load model if exists
        if (data.model_3d_url && data.model_3d_type) {
          setModelData({
            url: data.model_3d_url,
            type: data.model_3d_type as "gltf" | "obj",
            mtlUrl: data.model_mtl_url || undefined
          });
        }

        // Load markers if exists
        if (data.house_markers_3d && Array.isArray(data.house_markers_3d) && data.house_markers_3d.length > 0) {
          setMarkers(data.house_markers_3d as unknown as HouseMarker[]);
        }
      }
    } catch (err) {
      console.error('Error loading 3D map:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load data on mount
  useEffect(() => {
    loadSaved3DMap();
  }, [loadSaved3DMap]);

  // Save 3D map data to database
  const save3DMap = async () => {
    if (!projectId) {
      toast.error("Selecione um projeto primeiro");
      return;
    }

    setIsSaving(true);
    try {
      // Check if map_layout exists for this project
      const { data: existingLayout } = await supabase
        .from('map_layouts')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();

      const updateData = {
        model_3d_url: modelData?.url || null,
        model_3d_type: modelData?.type || null,
        model_mtl_url: modelData?.mtlUrl || null,
        house_markers_3d: markers as unknown as any[]
      };

      if (existingLayout) {
        // Update existing layout
        const { error } = await supabase
          .from('map_layouts')
          .update(updateData)
          .eq('project_id', projectId);

        if (error) throw error;
      } else {
        // Create new layout
        const { error } = await supabase
          .from('map_layouts')
          .insert([{
            project_id: projectId,
            ...updateData
          }]);

        if (error) throw error;
      }

      setHasChanges(false);
      toast.success("Mapa 3D salvo com sucesso!");
    } catch (err) {
      console.error('Error saving 3D map:', err);
      toast.error("Erro ao salvar mapa 3D");
    } finally {
      setIsSaving(false);
    }
  };

  // Upload file to Supabase storage
  const uploadFileToStorage = async (file: File, folder: string): Promise<string | null> => {
    if (!projectId) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${projectId}/${folder}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('3d-models')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error('Error uploading file:', error);
      toast.error(`Erro ao fazer upload: ${error.message}`);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('3d-models')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  // Generate markers from houses
  const generateMarkersFromHouses = useCallback(() => {
    if (!houses || houses.length === 0) return;

    const newMarkers: HouseMarker[] = houses.map((house, index) => {
      // Calculate general progress
      const macros = (house.macros as any[]) || [];
      let totalProgress = 0;
      let totalWeight = 0;

      macros.forEach((macro) => {
        const macroWeight = macro.weight || 1;
        let macroProgress = 0;
        let scopeCount = 0;

        macro.scopes?.forEach((scope: any) => {
          macroProgress += scope.percentage || 0;
          scopeCount++;
        });

        if (scopeCount > 0) {
          totalProgress += (macroProgress / scopeCount) * macroWeight;
          totalWeight += macroWeight;
        }
      });

      const progress = totalWeight > 0 ? totalProgress / totalWeight : 0;

      // Generate grid position
      const gridSize = Math.ceil(Math.sqrt(houses.length));
      const x = (index % gridSize) * 2 - gridSize;
      const z = Math.floor(index / gridSize) * 2 - gridSize;

      return {
        id: house.id,
        houseNumber: house.id,
        position: [x, 0.15, z] as [number, number, number],
        progress,
        macros
      };
    });

    setMarkers(newMarkers);
    setHasChanges(true);
    toast.success(`${newMarkers.length} casas carregadas no mapa 3D`);
  }, [houses]);

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
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      if (mtlInputRef.current) {
        mtlInputRef.current.value = '';
      }
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
    setHasChanges(true);
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
                <Button
                  variant="outline"
                  onClick={() => mtlInputRef.current?.click()}
                  disabled={isLoading}
                >
                  Selecionar MTL
                </Button>
                <Button
                  variant="secondary"
                  onClick={loadObjWithoutMtl}
                  disabled={isLoading}
                >
                  Carregar sem MTL
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              onClick={generateMarkersFromHouses}
              disabled={!houses || houses.length === 0 || isLoading}
            >
              <Box className="h-4 w-4 mr-2" />
              Carregar Casas ({houses?.length || 0})
            </Button>

            <Button
              variant="outline"
              onClick={centerCamera}
              disabled={isLoading}
            >
              <Home className="h-4 w-4 mr-2" />
              Centralizar
            </Button>

            <Button
              variant="outline"
              onClick={resetView}
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Resetar
            </Button>

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

            <div className="flex-1" />

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Controles:</span> Arrastar para rotacionar • Scroll para zoom • Shift+Arrastar para mover
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
        
        <Canvas shadows>
          <Scene
            modelData={modelData}
            markers={markers}
            selectedMarkerId={selectedMarker?.id || null}
            onMarkerClick={setSelectedMarker}
            customLegendItems={customLegendItems}
            resetTrigger={cameraResetTrigger}
          />
        </Canvas>

        {/* House details panel */}
        {selectedMarker && (
          <HouseDetailsPanel
            marker={selectedMarker}
            onClose={() => setSelectedMarker(null)}
            customLegendItems={customLegendItems}
          />
        )}

        {/* Empty state */}
        {!modelData && markers.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center space-y-4 p-8 bg-background/80 rounded-xl border border-border">
              <Move3D className="h-16 w-16 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">Mapa 3D</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Importe um modelo 3D (.glTF, .glb ou .obj) ou carregue as casas para visualizar
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
