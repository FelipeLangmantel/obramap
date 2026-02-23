import React, { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateHouseProgress } from "@/data/constructionData";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  BarChart3,
  ArrowRight,
  Home,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { Canvas, useThree, useLoader } from "@react-three/fiber";
import { OrbitControls, useGLTF, PerspectiveCamera } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import * as THREE from "three";

// Mini GLTF model
function MiniGLTFModel({ url, onLoaded }: { url: string; onLoaded: () => void }) {
  const { scene } = useGLTF(url);
  const calledRef = useRef(false);
  useEffect(() => {
    if (scene && !calledRef.current) {
      calledRef.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
    }
  }, [scene, onLoaded]);
  return <primitive object={scene} />;
}

// Mini OBJ model
function MiniOBJModel({ url, mtlUrl, onLoaded }: { url: string; mtlUrl?: string; onLoaded: () => void }) {
  const materials = mtlUrl ? useLoader(MTLLoader, mtlUrl) : null;
  const obj = useLoader(OBJLoader, url, (loader) => {
    if (materials) { materials.preload(); loader.setMaterials(materials); }
  });
  const calledRef = useRef(false);
  useEffect(() => {
    if (obj && !calledRef.current) {
      calledRef.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
    }
  }, [obj, onLoaded]);
  return <primitive object={obj} />;
}

// Auto-fit camera for mini scene
function MiniAutoFit({ ready }: { ready: boolean }) {
  const { camera, scene } = useThree();
  const controls = useThree((s) => s.controls) as any;
  const doneRef = useRef(false);

  useEffect(() => {
    if (!ready || doneRef.current || !controls) return;
    doneRef.current = true;
    const tryFit = () => {
      const box = new THREE.Box3();
      let found = false;
      scene.traverse((child: any) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.LineSegments).isLineSegments) {
          box.expandByObject(child); found = true;
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
      if (controls.target) { controls.target.copy(center); controls.update(); }
      return true;
    };
    let attempts = 0;
    const loop = () => { if (!tryFit() && attempts++ < 30) requestAnimationFrame(loop); };
    loop();
  }, [ready, controls, camera, scene]);

  return null;
}

// Real 3D mini preview using project's actual model
function RealModel3DPreview({ projectId }: { projectId: string }) {
  const [modelData, setModelData] = useState<{ url: string; type: "gltf" | "obj"; mtlUrl?: string } | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    const fetchModel = async () => {
      const { data } = await supabase
        .from("map_layouts")
        .select("model_3d_url, model_3d_type, model_mtl_url")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data?.model_3d_url) {
        setModelData({
          url: data.model_3d_url,
          type: (data.model_3d_type as "gltf" | "obj") || "gltf",
          mtlUrl: data.model_mtl_url || undefined,
        });
      }
    };
    fetchModel();
  }, [projectId]);

  const handleModelLoaded = useCallback(() => setSceneReady(true), []);

  if (!modelData) {
    return <FallbackMini3D />;
  }

  return (
    <Canvas camera={{ position: [50, 50, 50], fov: 50 }} style={{ background: "transparent" }} frameloop="always">
      <PerspectiveCamera makeDefault position={[50, 50, 50]} fov={50} />
      <MiniAutoFit ready={sceneReady} />
      <OrbitControls
        makeDefault
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={1.2}
        maxPolarAngle={Math.PI / 2 - 0.02}
        enableDamping={false}
      />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <hemisphereLight args={["#87ceeb", "#4a7c59", 0.4]} />
      <Suspense fallback={null}>
        {modelData.type === "gltf" ? (
          <MiniGLTFModel url={modelData.url} onLoaded={handleModelLoaded} />
        ) : (
          <MiniOBJModel url={modelData.url} mtlUrl={modelData.mtlUrl} onLoaded={handleModelLoaded} />
        )}
      </Suspense>
    </Canvas>
  );
}

// Fallback if no 3D model exists
function FallbackMini3D() {
  return (
    <Canvas camera={{ position: [3, 2, 3], fov: 45 }} style={{ background: "transparent" }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <group>
        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 4]} />
          <meshStandardMaterial color="#e2e8f0" transparent opacity={0.5} />
        </mesh>
        <mesh position={[-0.8, 0.4, 0]}>
          <boxGeometry args={[0.7, 0.8, 0.6]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
        <mesh position={[-0.8, 0.85, 0]}>
          <boxGeometry args={[0.8, 0.1, 0.7]} />
          <meshStandardMaterial color="#0369a1" />
        </mesh>
        <mesh position={[0.6, 0.6, -0.3]}>
          <boxGeometry args={[0.6, 1.2, 0.5]} />
          <meshStandardMaterial color="#0ea5e9" />
        </mesh>
        <mesh position={[0.6, 1.25, -0.3]}>
          <boxGeometry args={[0.7, 0.1, 0.6]} />
          <meshStandardMaterial color="#0284c7" />
        </mesh>
        <mesh position={[0.2, 0.25, 0.7]}>
          <boxGeometry args={[0.5, 0.5, 0.4]} />
          <meshStandardMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[-0.8, 1.4, 0.8]}>
          <boxGeometry args={[0.05, 1.8, 0.05]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
        <mesh position={[-0.4, 2.25, 0.8]}>
          <boxGeometry args={[0.9, 0.04, 0.04]} />
          <meshStandardMaterial color="#f59e0b" />
        </mesh>
      </group>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.5} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 2.5} />
    </Canvas>
  );
}

interface ProjectSummary {
  id: string;
  name: string;
  location: string;
  totalHouses: number;
  progress: number;
  completedHouses: number;
}

export function HomeDashboard({ onNavigateToProject }: { onNavigateToProject: (view: string) => void }) {
  const { profile, company, canAccessProject: authCanAccessProject } = useAuth();
  const { projects, setCurrentProject } = useConstruction() as any;

  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [totalProductions, setTotalProductions] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState(0);

  // First accessible project ID for the 3D preview
  const accessibleProjects = projects.filter((p: any) => authCanAccessProject(p.id));
  const firstProjectId = accessibleProjects.length > 0 ? accessibleProjects[0].id : null;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const firstName = profile?.display_name?.split(" ")[0] || "Usuário";

  // Build project summaries from context
  useEffect(() => {
    const summaries: ProjectSummary[] = accessibleProjects.map((project: any) => {
      const houses = project.houses || [];
      const totalHouses = project.totalHouses || houses.length;
      const template = project.macrosTemplate;
      
      // Use the same weighted calculation as the rest of the system
      const progresses = houses.map((h: any) => calculateHouseProgress(h, template));
      const avgProgress = progresses.length > 0 
        ? Math.round(progresses.reduce((a: number, b: number) => a + b, 0) / progresses.length) 
        : 0;
      const completedCount = progresses.filter((p: number) => p >= 100).length;

      return {
        id: project.id,
        name: project.name,
        location: project.location || "—",
        totalHouses,
        progress: avgProgress,
        completedHouses: completedCount,
      };
    });

    setProjectSummaries(summaries);
  }, [projects, authCanAccessProject]);

  // Fetch aggregate financial data
  useEffect(() => {
    const fetchFinancialData = async () => {
      if (!company?.id) return;
      
      try {
        // Get total productions count
        const { count: prodCount } = await supabase
          .from("productions")
          .select("*", { count: "exact", head: true });
        setTotalProductions(prodCount || 0);

        // Get financial entries summary
        const { data: financialData } = await supabase
          .from("financial_entries")
          .select("amount, category, status");
        
        if (financialData) {
          const costs = financialData.reduce((sum, e) => sum + (e.amount || 0), 0);
          setTotalCost(costs);
        }

        // Get measurements revenue
        const { data: measurementData } = await supabase
          .from("measurements")
          .select("revenue_expected");
        
        if (measurementData) {
          const rev = measurementData.reduce((sum, m) => sum + (m.revenue_expected || 0), 0);
          setTotalRevenue(rev);
        }

        // Get active alerts
        const { count: alertCount } = await supabase
          .from("planning_alerts")
          .select("*", { count: "exact", head: true })
          .eq("is_resolved", false);
        setRecentAlerts(alertCount || 0);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
      }
    };

    fetchFinancialData();
  }, [company?.id]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const totalHousesAll = projectSummaries.reduce((s, p) => s + p.totalHouses, 0);
  const totalCompletedAll = projectSummaries.reduce((s, p) => s + p.completedHouses, 0);
  const overallProgress = projectSummaries.length > 0
    ? Math.round(projectSummaries.reduce((s, p) => s + p.progress, 0) / projectSummaries.length)
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Greeting Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-6 md:p-8 text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_60%)]" />
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-primary-foreground/70 text-sm font-medium uppercase tracking-wider mb-1">
              {company?.name || "ObraMap"}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {getGreeting()}, {firstName}! 👋
            </h1>
            <p className="text-primary-foreground/80 text-sm md:text-base max-w-lg">
              Aqui está o resumo dos seus empreendimentos. 
              {projectSummaries.length > 0 
                ? ` Você tem ${projectSummaries.length} obra${projectSummaries.length > 1 ? "s" : ""} em andamento.`
                : " Cadastre sua primeira obra para começar."}
            </p>
          </div>

          {/* Mini 3D Preview - real model from first project */}
          <div className="w-48 h-36 lg:w-56 lg:h-40 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm border border-white/20 shrink-0 shadow-lg">
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center text-primary-foreground/50">
                <Building2 className="h-8 w-8 animate-pulse" />
              </div>
            }>
              {firstProjectId ? (
                <RealModel3DPreview projectId={firstProjectId} />
              ) : (
                <FallbackMini3D />
              )}
            </Suspense>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Obras</p>
                <p className="text-xl font-bold text-foreground">{projectSummaries.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <Home className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Unidades</p>
                <p className="text-xl font-bold text-foreground">
                  {totalCompletedAll}<span className="text-sm text-muted-foreground font-normal">/{totalHousesAll}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Faturamento</p>
                <p className="text-lg font-bold text-foreground truncate">{formatCurrency(totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                {recentAlerts > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Alertas</p>
                <p className="text-xl font-bold text-foreground">{recentAlerts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Seus Empreendimentos
          </h2>
          {projectSummaries.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {overallProgress}% progresso geral
            </Badge>
          )}
        </div>

        {projectSummaries.length === 0 ? (
          <Card className="border-dashed border-2 border-border">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Building2 className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground text-center">
                Nenhuma obra cadastrada ainda.<br />
                Use o menu lateral para criar sua primeira obra.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projectSummaries.map((project) => (
              <Card
                key={project.id}
                className="group border-border/50 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-200 cursor-pointer"
                onClick={() => {
                  setCurrentProject(project.id);
                  onNavigateToProject("map");
                }}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{project.location}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Progresso geral</span>
                        <span className="font-semibold text-foreground">{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Home className="h-3.5 w-3.5" />
                        <span>{project.totalHouses} unidades</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600 font-medium">{project.completedHouses} concluídas</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats Row */}
      {projectSummaries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Resumo Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Faturamento previsto</span>
                <span className="font-semibold text-foreground">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Custos lançados</span>
                <span className="font-semibold text-foreground">{formatCurrency(totalCost)}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Resultado estimado</span>
                <span className={`font-bold ${totalRevenue - totalCost >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {formatCurrency(totalRevenue - totalCost)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Produção
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Lançamentos registrados</span>
                <span className="font-semibold text-foreground">{totalProductions.toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progresso médio</span>
                <span className="font-semibold text-foreground">{overallProgress}%</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Unidades concluídas</span>
                <span className="font-bold text-primary">{totalCompletedAll} de {totalHousesAll}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
