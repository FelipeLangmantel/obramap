import React, { useEffect, useState, Suspense, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculateHouseProgress, House, Macro } from "@/data/constructionData";
import { getProjectSnapshot, saveProjectSnapshot } from "@/offline/projectCache";
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
  MapPin,
} from "lucide-react";
import HoldingMap, { MapObra } from "@/components/holding/HoldingMap";
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
function MiniOBJModelWithMtl({ url, mtlUrl, onLoaded }: { url: string; mtlUrl: string; onLoaded: () => void }) {
  const materials = useLoader(MTLLoader, mtlUrl);
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

function MiniOBJModelNoMtl({ url, onLoaded }: { url: string; onLoaded: () => void }) {
  const obj = useLoader(OBJLoader, url);
  const calledRef = useRef(false);
  useEffect(() => {
    if (obj && !calledRef.current) {
      calledRef.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => onLoaded()));
    }
  }, [obj, onLoaded]);
  return <primitive object={obj} />;
}

function MiniOBJModel({ url, mtlUrl, onLoaded }: { url: string; mtlUrl?: string; onLoaded: () => void }) {
  if (mtlUrl) {
    return <MiniOBJModelWithMtl url={url} mtlUrl={mtlUrl} onLoaded={onLoaded} />;
  }
  return <MiniOBJModelNoMtl url={url} onLoaded={onLoaded} />;
}

// Auto-fit camera for mini scene
function MiniAutoFit({ ready }: { ready: boolean }) {
  const { camera, scene } = useThree();
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3; update?: () => void } | undefined;
  const doneRef = useRef(false);

  useEffect(() => {
    if (!ready || doneRef.current || !controls) return;
    doneRef.current = true;
    const tryFit = () => {
      const box = new THREE.Box3();
      let found = false;
      scene.traverse((child: THREE.Object3D) => {
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
        const { resolveMap3DSignedUrl } = await import("@/lib/map3dStorage");
        const [signedUrl, signedMtl] = await Promise.all([
          resolveMap3DSignedUrl(data.model_3d_url),
          resolveMap3DSignedUrl(data.model_mtl_url),
        ]);
        if (signedUrl) {
          setModelData({
            url: signedUrl,
            type: (data.model_3d_type as "gltf" | "obj") || "gltf",
            mtlUrl: signedMtl || undefined,
          });
        }
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
  progress: number | null;
  completedHouses: number | null;
  progressStatus: "loaded" | "loading" | "error" | "unavailable";
}

type LinkedPortfolioCoords = {
  id: string;
  nome: string;
  municipio: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  obramap_project_id: string | null;
};

type DashboardProject = {
  id: string;
  name: string;
  location?: string | null;
  totalHouses?: number | null;
  houses?: House[];
  quadras?: unknown[];
  macrosTemplate?: Macro[];
  [key: string]: unknown;
};

type HouseRow = {
  house_number: number;
  quadra_id?: string | null;
  area: number;
  type: string;
  constructor_name?: string | null;
  expected_date?: string | null;
  last_update?: string | null;
  macros?: unknown;
};

const isHydrationDebugEnabled = () =>
  typeof window !== "undefined" && window.localStorage.getItem("obramap:debug:hydration") === "1";

const logDashboardProgress = (message: string, detail?: Record<string, unknown>) => {
  if (!isHydrationDebugEnabled()) return;
  console.info(`[Dashboard Progress] ${message}`, detail ?? {});
};

const mapHouseRow = (row: HouseRow): House => ({
  id: row.house_number,
  quadra: row.quadra_id || "",
  area: row.area,
  type: row.type,
  constructorName: row.constructor_name || "",
  expectedDate: row.expected_date || "",
  lastUpdate: row.last_update ? new Date(row.last_update).toLocaleDateString("pt-BR") : "",
  macros: Array.isArray(row.macros) ? row.macros as Macro[] : [],
});

const buildProjectSummary = (
  project: DashboardProject,
  houses: House[],
  status: ProjectSummary["progressStatus"],
): ProjectSummary => {
  const totalHouses = Number(project.totalHouses) || houses.length || 0;
  const template = project.macrosTemplate;
  const progresses = houses.map((house) => calculateHouseProgress(house, template));
  const hasProgressData = progresses.length > 0;

  return {
    id: project.id,
    name: project.name,
    location: project.location || "—",
    totalHouses,
    progress: hasProgressData
      ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length)
      : null,
    completedHouses: hasProgressData
      ? progresses.filter((progress) => progress >= 100).length
      : null,
    progressStatus: hasProgressData ? "loaded" : status,
  };
};

export function HomeDashboard({ onNavigateToProject }: { onNavigateToProject: (view: string) => void }) {
  const { profile, company, canAccessProject: authCanAccessProject } = useAuth();
  const { projects, setCurrentProject } = useConstruction();

  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [linkedPortfolioByProjectId, setLinkedPortfolioByProjectId] = useState<Map<string, LinkedPortfolioCoords>>(new Map());
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [totalProductions, setTotalProductions] = useState(0);
  const [recentAlerts, setRecentAlerts] = useState(0);

  // First accessible project ID for the 3D preview
  const accessibleProjects = useMemo(
    () => projects.filter((project) => authCanAccessProject(project.id)),
    [projects, authCanAccessProject]
  );
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
    const summaries: ProjectSummary[] = accessibleProjects.map((project) => {
      const houses = project.houses || [];
      const totalHouses = project.totalHouses || houses.length;
      const template = project.macrosTemplate;
      
      // Use the same weighted calculation as the rest of the system
      const progresses = houses.map((h) => calculateHouseProgress(h, template));
      const avgProgress = progresses.length > 0 
        ? Math.round(progresses.reduce((a: number, b: number) => a + b, 0) / progresses.length) 
        : null;
      const completedCount = progresses.length > 0
        ? progresses.filter((p: number) => p >= 100).length
        : null;

      return {
        id: project.id,
        name: project.name,
        location: project.location || "—",
        totalHouses,
        progress: avgProgress,
        completedHouses: completedCount,
        progressStatus: progresses.length > 0 ? "loaded" : "loading",
      };
    });

    setProjectSummaries(summaries);
  }, [accessibleProjects]);

  useEffect(() => {
    let cancelled = false;
    const projectsForDashboard = accessibleProjects as unknown as DashboardProject[];

    const updateSummary = (projectId: string, summary: ProjectSummary) => {
      if (cancelled) return;
      setProjectSummaries((prev) =>
        prev.map((item) => item.id === projectId ? summary : item)
      );
    };

    const loadProgress = async (project: DashboardProject) => {
      const contextHouses = Array.isArray(project.houses) ? project.houses : [];
      if (contextHouses.length > 0) {
        logDashboardProgress("context hit", {
          projectId: project.id,
          houses: contextHouses.length,
          progress: buildProjectSummary(project, contextHouses, "loaded").progress,
        });
        return;
      }

      try {
        const snapshot = await getProjectSnapshot(project.id);
        const cachedHouses = Array.isArray(snapshot?.data?.houses)
          ? snapshot.data.houses as House[]
          : [];

        if (cachedHouses.length > 0) {
          const cachedSummary = buildProjectSummary(project, cachedHouses, "loaded");
          logDashboardProgress("cache hit", {
            projectId: project.id,
            houses: cachedHouses.length,
            progress: cachedSummary.progress,
          });
          updateSummary(project.id, cachedSummary);
        } else {
          logDashboardProgress("cache miss", { projectId: project.id });
        }
      } catch (error) {
        logDashboardProgress("cache error", { projectId: project.id, error });
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        updateSummary(project.id, buildProjectSummary(project, [], "unavailable"));
        return;
      }

      const { data, error } = await supabase
        .from("houses")
        .select("*")
        .eq("project_id", project.id)
        .order("house_number", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("[Dashboard Progress] failed to load houses", { projectId: project.id, error });
        updateSummary(project.id, buildProjectSummary(project, [], "error"));
        return;
      }

      const houses = (data || []).map(mapHouseRow);
      const summary = buildProjectSummary(project, houses, houses.length > 0 ? "loaded" : "unavailable");
      logDashboardProgress("houses loaded", {
        projectId: project.id,
        houses: houses.length,
        progress: summary.progress,
      });
      updateSummary(project.id, summary);

      try {
        const snapshot = await getProjectSnapshot(project.id);
        const snapshotData = snapshot?.data && typeof snapshot.data === "object"
          ? snapshot.data
          : project;
        await saveProjectSnapshot(project.id, {
          ...snapshotData,
          ...project,
          houses,
          quadras: Array.isArray(snapshotData?.quadras)
            ? snapshotData.quadras
            : Array.isArray(project.quadras)
              ? project.quadras
              : [],
        });
      } catch (error) {
        logDashboardProgress("cache save error", { projectId: project.id, error });
      }
    };

    projectsForDashboard.forEach((project) => {
      void loadProgress(project);
    });

    return () => {
      cancelled = true;
    };
  }, [accessibleProjects]);

  useEffect(() => {
    let cancelled = false;

    const fetchLinkedPortfolioCoords = async () => {
      const projectIds = accessibleProjects.map((project) => project.id).filter(Boolean);

      if (projectIds.length === 0) {
        setLinkedPortfolioByProjectId(new Map());
        return;
      }

      const { data, error } = await supabase
        .from("obras_portfolio")
        .select("id, nome, municipio, estado, latitude, longitude, obramap_project_id")
        .in("obramap_project_id", projectIds);

      if (cancelled) return;

      if (error) {
        console.error("Error loading linked portfolio coordinates:", error);
        setLinkedPortfolioByProjectId(new Map());
        return;
      }

      const next = new Map<string, LinkedPortfolioCoords>();
      ((data || []) as LinkedPortfolioCoords[]).forEach((obra) => {
        if (obra.obramap_project_id) {
          next.set(obra.obramap_project_id, obra);
        }
      });

      setLinkedPortfolioByProjectId(next);
    };

    fetchLinkedPortfolioCoords();

    return () => {
      cancelled = true;
    };
  }, [accessibleProjects]);

  const mapObras = useMemo<MapObra[]>(() => {
    const summaryByProjectId = new Map(projectSummaries.map((project) => [project.id, project]));

    return accessibleProjects
      .map((project) => {
        const linkedPortfolio = linkedPortfolioByProjectId.get(project.id);
        const latitude = project.lat ?? linkedPortfolio?.latitude;
        const longitude = project.lng ?? linkedPortfolio?.longitude;

        return { project, linkedPortfolio, latitude, longitude };
      })
      .filter(({ latitude, longitude }) => latitude != null && longitude != null)
      .map(({ project, linkedPortfolio, latitude, longitude }) => {
        const summary = summaryByProjectId.get(project.id);
        const progress = summary?.progress;
        const numericProgress = progress ?? 0;
        const health = progress === null || progress === undefined
          ? "gray"
          : numericProgress >= 100
            ? "green"
            : numericProgress >= 50
              ? "green"
              : numericProgress > 0
                ? "yellow"
                : "gray";
        const status = progress === null || progress === undefined
          ? "nao_iniciada"
          : numericProgress >= 100
            ? "concluida"
            : numericProgress > 0
              ? "em_andamento"
              : "nao_iniciada";
        const locationParts = [
          project.municipio || linkedPortfolio?.municipio || project.location,
          project.estado || linkedPortfolio?.estado,
        ].filter(Boolean);

        return {
          id: project.id,
          nome: project.name,
          municipio: locationParts.join(" / "),
          lat: Number(latitude),
          lng: Number(longitude),
          health,
          valor_contrato: 0,
          status,
        };
      });
  }, [accessibleProjects, linkedPortfolioByProjectId, projectSummaries]);

  const projectsWithoutCoordinates = useMemo(() => {
    return accessibleProjects
      .map((project) => {
        const linkedPortfolio = linkedPortfolioByProjectId.get(project.id);
        const latitude = project.lat ?? linkedPortfolio?.latitude;
        const longitude = project.lng ?? linkedPortfolio?.longitude;
        const location = [
          project.municipio || linkedPortfolio?.municipio || project.location,
          project.estado || linkedPortfolio?.estado,
        ].filter(Boolean).join(" / ");

        return {
          id: project.id,
          name: project.name,
          location,
          hasLocationHint: Boolean(project.municipio || linkedPortfolio?.municipio || project.location),
          hasCoordinates: latitude != null && longitude != null,
        };
      })
      .filter((project) => !project.hasCoordinates);
  }, [accessibleProjects, linkedPortfolioByProjectId]);

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

  const loadedProjectSummaries = projectSummaries.filter((project) => project.progress !== null);
  const loadingProgressCount = projectSummaries.filter((project) => project.progressStatus === "loading").length;
  const totalHousesAll = projectSummaries.reduce((s, p) => s + p.totalHouses, 0);
  const totalCompletedAll = loadedProjectSummaries.reduce((s, p) => s + (p.completedHouses ?? 0), 0);
  const overallProgress = loadedProjectSummaries.length > 0
    ? Math.round(loadedProjectSummaries.reduce((s, p) => s + (p.progress ?? 0), 0) / loadedProjectSummaries.length)
    : null;
  const overallProgressLabel = overallProgress !== null
    ? `${overallProgress}% progresso geral${loadingProgressCount > 0 ? ` · ${loadingProgressCount} atualizando` : ""}`
    : "Atualizando progresso";

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
                  {loadedProjectSummaries.length > 0 ? totalCompletedAll : "..."}
                  <span className="text-sm text-muted-foreground font-normal">/{totalHousesAll}</span>
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
              {overallProgressLabel}
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
                        <span className="font-semibold text-foreground">
                          {project.progress !== null
                            ? `${project.progress}%`
                            : project.progressStatus === "loading"
                              ? "Atualizando..."
                              : project.progressStatus === "error"
                                ? "Erro ao carregar"
                                : "Indisponível"}
                        </span>
                      </div>
                      <Progress value={project.progress ?? 0} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Home className="h-3.5 w-3.5" />
                        <span>{project.totalHouses} unidades</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600 font-medium">
                          {project.completedHouses !== null
                            ? `${project.completedHouses} concluídas`
                            : project.progressStatus === "loading"
                              ? "Atualizando"
                              : "Indisponível"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Mapa das Obras */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Mapa das obras
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Visualização geográfica dos empreendimentos em andamento
              </p>
              {projectsWithoutCoordinates.length > 0 && (
                <>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Existem {projectsWithoutCoordinates.length} obra(s) sem coordenadas.
                  </p>
                  <Button size="sm" asChild>
                    <a href="/holding-config">Ir para Geocodificacao</a>
                  </Button>
                </>
              )}
            </div>
            {mapObras.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {mapObras.length} obra{mapObras.length !== 1 ? "s" : ""} mapeada{mapObras.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {mapObras.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Nenhuma obra ativa com coordenadas cadastradas.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Informe latitude/longitude nos empreendimentos ativos para visualizá-los aqui.
              </p>
            </div>
          ) : (
            <HoldingMap
              obras={mapObras}
              onObraClick={(projectId) => {
                setCurrentProject(projectId);
                onNavigateToProject("map");
              }}
            />
          )}
        </CardContent>
      </Card>

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
                <span className="font-semibold text-foreground">
                  {overallProgress !== null ? `${overallProgress}%` : "Atualizando"}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Unidades concluídas</span>
                <span className="font-bold text-primary">
                  {loadedProjectSummaries.length > 0 ? totalCompletedAll : "..."} de {totalHousesAll}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
