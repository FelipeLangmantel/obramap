import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { House, Macro, Scope, Quadra, EMPTY_MACROS_TEMPLATE, calculateHouseProgress, DEFAULT_MACRO_COLORS } from "@/data/constructionData";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { saveProjectSnapshot, getProjectSnapshot, getAllProjectSnapshots } from "@/offline/projectCache";

export interface LegendItem {
  id: string;
  name: string;
  color: string;
  minPercent: number;
  maxPercent: number;
}

export const DEFAULT_LEGEND_ITEMS: LegendItem[] = [
  { id: "nao_iniciado", name: "Não Iniciado", color: "#9ca3af", minPercent: 0, maxPercent: 0 },
  { id: "fundacao", name: "Fundação", color: "#ef4444", minPercent: 1, maxPercent: 25 },
  { id: "estrutura", name: "Estrutura", color: "#f59e0b", minPercent: 26, maxPercent: 60 },
  { id: "acabamento", name: "Acabamento", color: "#3b82f6", minPercent: 61, maxPercent: 99 },
  { id: "concluido", name: "Concluído", color: "#22c55e", minPercent: 99.1, maxPercent: 100 },
];

export type ProjectSetupStep = 
  | "project_created"
  | "blocks_configured"
  | "services_defined"
  | "budget_defined"
  | "contract_defined"
  | "long_term_planned";

export interface Project {
  id: string;
  name: string;
  location: string;
  municipio?: string | null;
  estado?: string | null;
  lat?: number | null;
  lng?: number | null;
  contractor: string;
  startDate: string;
  expectedEndDate: string;
  totalHouses: number;
  unitSize: number;
  projectType: string;
  houses: House[];
  quadras: Quadra[];
  macrosTemplate: Macro[];
  createdAt: string;
  setupComplete: boolean;
  setupStep: ProjectSetupStep;
  legendFollowMacros: boolean;
  customLegendItems: LegendItem[];
  displayOrder: number;
  weightMode: "automatic" | "manual";
  logoUrl?: string | null;
  companyId?: string | null;
}

interface ConstructionContextType {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (projectId: string | null) => void;
  addProject: (project: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete" | "setupStep" | "legendFollowMacros" | "customLegendItems" | "displayOrder" | "weightMode">) => Promise<string>;
  reorderProjects: (orderedProjectIds: string[]) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  completeProjectSetup: (projectId: string) => void;
  advanceSetupStep: (step: ProjectSetupStep) => Promise<boolean>;
  
  // Quadras (for current project)
  addQuadra: (name: string, houseIds: number[]) => void;
  updateQuadra: (quadraId: string, name: string, houseIds: number[]) => void;
  deleteQuadra: (quadraId: string) => void;
  reorderQuadras: (orderedIds: string[]) => void;
  generateHousesForProject: () => void;
  
  // Houses
  selectedHouse: House | null;
  setSelectedHouse: (house: House | null) => void;
  updateScopeProgress: (houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => void;
  updateBatchScopeProgress: (houseIds: number[], macroId: string, scopeId: string, progress: number, houseProgressMap?: Record<number, number>) => Promise<void>;
  updateHouseInfo: (houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => void;
  renameHouse: (oldNumber: number, newNumber: number) => Promise<boolean>;
  getHouseProgress: (houseId: number) => number;
  moveHouseToQuadra: (houseId: number, newQuadraId: string) => void;
  refreshHousesFromDB: () => Promise<void>;
  ensureFreshProjectHouses: (options?: { force?: boolean; reason?: string }) => Promise<void>;
  
  // Filters
  filterQuadra: string;
  setFilterQuadra: (quadra: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  filterMode: "status" | "macro" | "scope";
  setFilterMode: (mode: "status" | "macro" | "scope") => void;
  filterMacro: string;
  setFilterMacro: (macroId: string) => void;
  filterScope: string;
  setFilterScope: (scopeId: string) => void;
  
  // Macro management
  addMacro: (name: string) => Promise<void>;
  updateMacro: (macroId: string, name: string, color?: string) => Promise<void>;
  deleteMacro: (macroId: string) => Promise<void>;
  resetProjectData: () => void;
  
  // Legend management
  updateLegendSettings: (followMacros: boolean, legendItems?: LegendItem[]) => void;
  
  // Scope management
  addScope: (macroId: string, name: string, weight: number) => Promise<void>;
  updateScope: (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => Promise<void>;
  deleteScope: (macroId: string, scopeId: string) => Promise<void>;
  
  // Reorder macros and scopes
  reorderMacros: (orderedMacroIds: string[]) => Promise<void>;
  reorderScopes: (macroId: string, orderedScopeIds: string[]) => Promise<void>;
  
  // Time calculations
  getDaysRemaining: () => number;
  
  // Loading state
  isLoading: boolean;
}

const ConstructionContext = createContext<ConstructionContextType | undefined>(undefined);

// Helper to convert Macro[] to Json
const macrosToJson = (macros: Macro[]): Json => {
  return macros as unknown as Json;
};

// Helper to convert Json to Macro[]
// Retorna array vazio se não houver dados - usuário deve configurar manualmente
const jsonToMacros = (json: Json): Macro[] => {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as Macro[];
};

const FILTER_STORAGE_KEY = "obramap_main_filters";

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const { user, profile, isLoading: authLoading, isSystemAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadraState] = useState<string>("all");
  const [filterStatus, setFilterStatusState] = useState<string>("all");
  const [filterMode, setFilterModeState] = useState<"status" | "macro" | "scope">("status");
  const [filterMacro, setFilterMacroState] = useState<string>("all");
  const [filterScope, setFilterScopeState] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  
  // ✅ Flags para controlar carregamento e evitar loops
  const filtersLoadedRef = useRef(false);
  const projectsRef = useRef<Project[] | null>(null);
  const cacheHydratedProjectIdsRef = useRef<Set<string>>(new Set());
  const serverHydratedProjectIdsRef = useRef<Set<string>>(new Set());
  const lastFreshHousesFetchRef = useRef<Map<string, number>>(new Map());
  const isHydratingRef = useRef(false);
  const lastProjectsLoadKeyRef = useRef<string | null>(null);

  const currentProject = projects.find((p) => p.id === currentProjectId) || null;

  const getAverageHouseProgress = useCallback((houses: House[], template?: Macro[]) => {
    if (!houses.length) return 0;
    const total = houses.reduce((sum, house) => sum + calculateHouseProgress(house, template), 0);
    return Math.round(total / houses.length);
  }, []);

  useEffect(() => {
    if (!currentProjectId) return;
    
    const savedFilters = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters);
        if (filters.filterQuadra) setFilterQuadraState(filters.filterQuadra);
        if (filters.filterStatus) setFilterStatusState(filters.filterStatus);
        if (filters.filterMode) setFilterModeState(filters.filterMode);
        if (filters.filterMacro) setFilterMacroState(filters.filterMacro);
        if (filters.filterScope) setFilterScopeState(filters.filterScope);
      } catch (e) {
        console.error("Error loading filters:", e);
      }
    } else {
      // Reset to defaults if no saved filters
      setFilterQuadraState("all");
      setFilterStatusState("all");
      setFilterModeState("status");
      setFilterMacroState("all");
      setFilterScopeState("all");
    }
    filtersLoadedRef.current = true;
  }, [currentProjectId]);

  // Persist filters with setters
  const setFilterQuadra = useCallback((value: string) => {
    setFilterQuadraState(value);
    if (currentProjectId) {
      const current = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
      const filters = current ? JSON.parse(current) : {};
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`, JSON.stringify({ ...filters, filterQuadra: value }));
    }
  }, [currentProjectId]);

  const setFilterStatus = useCallback((value: string) => {
    setFilterStatusState(value);
    if (currentProjectId) {
      const current = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
      const filters = current ? JSON.parse(current) : {};
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`, JSON.stringify({ ...filters, filterStatus: value }));
    }
  }, [currentProjectId]);

  const setFilterMode = useCallback((value: "status" | "macro" | "scope") => {
    setFilterModeState(value);
    if (currentProjectId) {
      const current = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
      const filters = current ? JSON.parse(current) : {};
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`, JSON.stringify({ ...filters, filterMode: value }));
    }
  }, [currentProjectId]);

  const setFilterMacro = useCallback((value: string) => {
    setFilterMacroState(value);
    if (currentProjectId) {
      const current = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
      const filters = current ? JSON.parse(current) : {};
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`, JSON.stringify({ ...filters, filterMacro: value }));
    }
  }, [currentProjectId]);

  const setFilterScope = useCallback((value: string) => {
    setFilterScopeState(value);
    if (currentProjectId) {
      const current = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`);
      const filters = current ? JSON.parse(current) : {};
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProjectId}`, JSON.stringify({ ...filters, filterScope: value }));
    }
  }, [currentProjectId]);

  // ✅ Load projects ONLY when user/company changes (never by timers/loading/hydration)
  useEffect(() => {
    if (authLoading) return;

    // ✅ Não recarregar se a aba ficou oculta e voltou (Page Visibility)
    // O loadKey garante que só recarrega quando user/company realmente mudam

    // Logout -> hard reset
    if (!user) {
      setProjects([]);
      setCurrentProjectId(null);
      setSelectedHouse(null);
      cacheHydratedProjectIdsRef.current.clear();
      serverHydratedProjectIdsRef.current.clear();
      lastFreshHousesFetchRef.current.clear();
      projectsRef.current = null;
      lastProjectsLoadKeyRef.current = null;
      setIsLoading(false);
      return;
    }

    // Regular users: wait until company_id exists (don't clear/reload in the meantime)
    if (!isSystemAdmin && !profile?.company_id) {
      setIsLoading(true);
      return;
    }

    const loadKey = isSystemAdmin
      ? `sys:${user.id}`
      : `company:${profile!.company_id}|user:${user.id}`;

    if (lastProjectsLoadKeyRef.current === loadKey) {
      return;
    }

    lastProjectsLoadKeyRef.current = loadKey;

    // Reset project-scoped state ONLY when the key actually changed
    setProjects([]);
    setCurrentProjectId(null);
    setSelectedHouse(null);
    cacheHydratedProjectIdsRef.current.clear();
    serverHydratedProjectIdsRef.current.clear();
    lastFreshHousesFetchRef.current.clear();
    projectsRef.current = null;

    const loadProjects = async () => {
      setIsLoading(true);

      // ⚡ STALE-WHILE-REVALIDATE: hidrata da cache local IMEDIATAMENTE
      // para que Mapa Interativo / Mapa de Obras / Gráficos / Mapa 3D
      // abram instantaneamente, inclusive offline.
      try {
        const snapshots = await getAllProjectSnapshots();
        if (snapshots.length > 0) {
          const cached = snapshots
            .map((s) => s.data as Project)
            .filter(Boolean)
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
          if (cached.length > 0) {
            setProjects(cached);
            projectsRef.current = cached;
            setCurrentProjectId((id) => id ?? cached[0]?.id ?? null);
            console.log("[Map Progress Cache Check] projects loaded from cache", {
              projects: cached.length,
              projectIds: cached.map((p) => p.id),
              housesByProject: cached.map((p) => ({ projectId: p.id, houses: p.houses?.length ?? 0 })),
              online: typeof navigator === "undefined" ? true : navigator.onLine,
            });
            // Já considera projetos hidratados (com casas) se a snapshot trouxer casas
            cached.forEach((p) => {
              if (Array.isArray(p.houses) && p.houses.length > 0) {
                cacheHydratedProjectIdsRef.current.add(p.id);
              }
            });
            setIsLoading(false);
          }
        }
      } catch (e) {
        console.warn("[cache] failed to hydrate projects from local snapshot", e);
      }

      // Sem internet? Mantém o que veio do cache e sai.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsLoading(false);
        return;
      }

      try {
        // ⚡ Carrega APENAS metadados dos projetos (sem houses) — houses só são
        // hidratadas para o currentProjectId no useEffect abaixo.
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("id, name, location, municipio, estado, lat, lng, contractor, start_date, expected_end_date, total_houses, unit_size, project_type, macros_template, created_at, setup_complete, setup_step, legend_follow_macros, custom_legend_items, display_order, weight_mode, logo_url, company_id")
          .order("display_order", { ascending: true });

        if (projectsError) {
          console.error("Error loading projects:", projectsError);
          return;
        }

        const loadedProjects: Project[] = (projectsData || []).map((p) => {
          const projectTemplate = jsonToMacros(p.macros_template);

          return {
            id: p.id,
            name: p.name,
            location: p.location,
            municipio: p.municipio,
            estado: p.estado,
            lat: p.lat,
            lng: p.lng,
            contractor: p.contractor,
            startDate: p.start_date,
            expectedEndDate: p.expected_end_date,
            totalHouses: p.total_houses,
            unitSize: p.unit_size,
            projectType: p.project_type,
            houses: [],
            quadras: [],
            macrosTemplate: projectTemplate,
            createdAt: p.created_at,
            setupComplete: p.setup_complete,
            setupStep: ((p as any).setup_step as ProjectSetupStep) || "project_created",
            legendFollowMacros: p.legend_follow_macros ?? false,
            customLegendItems:
              (p.custom_legend_items as unknown as LegendItem[]) || DEFAULT_LEGEND_ITEMS,
            displayOrder: p.display_order ?? 0,
            weightMode: (p as any).weight_mode || "manual",
            logoUrl: (p as any).logo_url ?? null,
            companyId: (p as any).company_id ?? null,
          };
        });

        // Mescla com casas/quadras já em memória (vindas do cache local) para
        // não perder a UI já renderizada enquanto a hidratação acontece.
        setProjects((prev) => {
          const prevById = new Map(prev.map((p) => [p.id, p]));
          return loadedProjects.map((p) => {
            const old = prevById.get(p.id);
            if (old && (old.houses?.length || old.quadras?.length)) {
              return { ...p, houses: old.houses, quadras: old.quadras };
            }
            return p;
          });
        });
        projectsRef.current = loadedProjects;
        setCurrentProjectId((id) => id ?? loadedProjects[0]?.id ?? null);
      } catch (error) {
        console.error("Error loading projects:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [authLoading, user?.id, isSystemAdmin, profile?.company_id]);

  // Hydrate project data when switching projects (quadras/houses only)
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    if (!currentProjectId) return;
    // ✅ Only hydrate if we don't already have houses loaded for this project
    if (serverHydratedProjectIdsRef.current.has(currentProjectId)) {
      console.log("[Map Progress Cache Check] hydrate skipped", {
        projectId: currentProjectId,
        reason: "server_already_hydrated",
      });
      return;
    }
    // ✅ Prevent parallel hydration
    if (isHydratingRef.current) {
      console.log("[Map Progress Cache Check] hydrate skipped", {
        projectId: currentProjectId,
        reason: "hydration_in_flight",
      });
      return;
    }

    const project = projects.find((p) => p.id === currentProjectId);
    if (!project) return;

    isHydratingRef.current = true;

    (async () => {
      setIsLoading(true);

      // ⚡ Cache-first: pinta a UI com o snapshot offline antes da rede
      try {
        const snap = await getProjectSnapshot(currentProjectId);
        const cachedHouses = snap?.data?.houses as House[] | undefined;
        const cachedQuadras = snap?.data?.quadras as Quadra[] | undefined;
        if (cachedHouses?.length || cachedQuadras?.length) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === currentProjectId
                ? { ...p, houses: cachedHouses ?? p.houses, quadras: cachedQuadras ?? p.quadras }
                : p
            )
          );
          cacheHydratedProjectIdsRef.current.add(currentProjectId);
          console.log("[Map Progress Cache Check] project loaded from cache", {
            projectId: currentProjectId,
            cacheHouses: cachedHouses?.length ?? 0,
            cacheQuadras: cachedQuadras?.length ?? 0,
            cacheAverageProgress: getAverageHouseProgress(cachedHouses ?? project.houses ?? [], project.macrosTemplate),
            online: typeof navigator === "undefined" ? true : navigator.onLine,
          });
          setIsLoading(false);
        }
      } catch (e) {
        console.warn("[cache] hidratacao local falhou", e);
      }

      // Sem internet: confia no cache (ou fica vazio se não tiver)
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        console.log("[Map Progress Cache Check] Supabase fetch skipped", {
          projectId: currentProjectId,
          reason: "offline_cache_allowed",
        });
        setIsLoading(false);
        isHydratingRef.current = false;
        return;
      }

      try {
        const [{ data: quadrasData }, { data: housesData }] = await Promise.race([
          Promise.all([
            supabase
              .from("quadras")
              .select("*")
              .eq("project_id", currentProjectId)
              .order("display_order", { ascending: true }),
            supabase
              .from("houses")
              .select("*")
              .eq("project_id", currentProjectId)
              .order("house_number", { ascending: true }),
          ]),
          new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 30000)
          ),
        ]);

        const quadras: Quadra[] = (quadrasData || []).map((q: any) => ({
          id: q.id,
          name: q.name,
          houses: q.house_ids || [],
        }));

        const houses: House[] = (housesData || []).map((h: any) => ({
          id: h.house_number,
          quadra: h.quadra_id || "",
          area: h.area,
          type: h.type,
          constructorName: h.constructor_name || "",
          expectedDate: h.expected_date || "",
          lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
          macros: jsonToMacros(h.macros),
        }));

        serverHydratedProjectIdsRef.current.add(currentProjectId);
        lastFreshHousesFetchRef.current.set(currentProjectId, Date.now());
        console.log("[Map Progress Cache Check] project loaded from Supabase", {
          projectId: currentProjectId,
          serverHouses: houses.length,
          serverQuadras: quadras.length,
          serverAverageProgress: getAverageHouseProgress(houses, project.macrosTemplate),
          firstHouse: houses[0]
            ? { id: houses[0].id, lastUpdate: houses[0].lastUpdate, macros: houses[0].macros?.length ?? 0 }
            : null,
        });
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === currentProjectId ? { ...p, quadras, houses } : p));
          // 💾 Persiste snapshot completo para uso offline
          const merged = next.find((p) => p.id === currentProjectId);
          if (merged) void saveProjectSnapshot(currentProjectId, merged);
          return next;
        });
      } catch (e) {
        console.error("Error hydrating project:", e);
        serverHydratedProjectIdsRef.current.delete(currentProjectId);
      } finally {
        setIsLoading(false);
        isHydratingRef.current = false;
      }
    })();
  }, [currentProjectId]); // ✅ Removido 'projects' das deps para evitar loop

  // 💾 Mantém o snapshot offline em sincronia com o estado em memória
  // (atualizações locais via realtime, edits, etc.)
  useEffect(() => {
    if (!currentProjectId) return;
    const proj = projects.find((p) => p.id === currentProjectId);
    if (!proj || !proj.houses?.length) return;
    const t = setTimeout(() => {
      void saveProjectSnapshot(currentProjectId, proj);
    }, 1500); // debounce
    return () => clearTimeout(t);
  }, [projects, currentProjectId]);

  // ✅ 4.5 REALTIME: Auto-refresh houses when production/banco inicial changes
  useEffect(() => {
    if (!currentProjectId) return;

    const reloadHouses = async () => {
      const { data: housesData } = await supabase
        .from("houses")
        .select("*")
        .eq("project_id", currentProjectId)
        .order("house_number", { ascending: true });

      if (housesData) {
        const houses: House[] = housesData.map((h: any) => ({
          id: h.house_number,
          quadra: h.quadra_id || "",
          area: h.area,
          type: h.type,
          constructorName: h.constructor_name || "",
          expectedDate: h.expected_date || "",
          lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
          macros: jsonToMacros(h.macros),
        }));

        setProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? { ...p, houses } : p))
        );
      }
    };

    const channel = supabase
      .channel(`houses-realtime-${currentProjectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'houses', filter: `project_id=eq.${currentProjectId}` }, () => {
        reloadHouses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProjectId]);

  // ✅ 5. RESETAR ESTADOS AO TROCAR DE PROJETO
  const setCurrentProject = useCallback((projectId: string | null) => {
    
    // ✅ Limpa todos os estados de módulos ao trocar de obra
    setCurrentProjectId(projectId);
    setSelectedHouse(null);
    
    // Reset filter states to defaults when switching projects
    // The useEffect will then load the correct filters for the new project from localStorage
    setFilterQuadraState("all");
    setFilterStatusState("all");
    setFilterModeState("status");
    setFilterMacroState("all");
    setFilterScopeState("all");
    
    // ✅ Marca que este projeto precisa ser hidratado se ainda não foi
    // (não remove do cache para evitar re-fetch desnecessário)
  }, []);

  const addProject = useCallback(async (projectData: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete" | "legendFollowMacros" | "customLegendItems">): Promise<string> => {
    // Template vazio - usuário deve configurar etapas manualmente
    const macrosTemplate: Macro[] = [];
    
    // Get company_id via RPC function (safer than relying on profile state)
    const { data: companyId, error: companyError } = await supabase
      .rpc('get_my_company_id');
    
    if (companyError) {
      console.error('Error getting company_id:', companyError);
      // Continue with null - system_admin users may not have company_id
    }
    
    // Insert project to database first to get real UUID
    const { data: newProjectData, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: projectData.name,
        location: projectData.location,
        contractor: projectData.contractor,
        start_date: projectData.startDate,
        expected_end_date: projectData.expectedEndDate,
        total_houses: projectData.totalHouses,
        unit_size: projectData.unitSize,
        project_type: projectData.projectType,
        macros_template: macrosToJson(macrosTemplate),
        setup_complete: false,
        company_id: companyId || null,
      })
      .select()
      .single();

    if (projectError || !newProjectData) {
      console.error('Error creating project:', projectError);
      toast.error("Erro ao criar projeto: " + (projectError?.message || "Erro desconhecido"));
      return "";
    }

    // Generate houses with 0% progress
    const houses: House[] = [];
    const housesInsert = [];
    for (let i = 1; i <= projectData.totalHouses; i++) {
      const house: House = {
        id: i,
        quadra: "",
        area: projectData.unitSize,
        type: projectData.projectType,
        constructorName: projectData.contractor,
        expectedDate: projectData.expectedEndDate,
        lastUpdate: new Date().toLocaleDateString("pt-BR"),
        macros: macrosTemplate.map((macro: Macro) => ({
          ...macro,
          scopes: macro.scopes.map((scope: Scope) => ({
            ...scope,
            progress: 0,
            startDate: null,
            endDate: null,
          })),
        })),
      };
      houses.push(house);
      housesInsert.push({
        project_id: newProjectData.id,
        house_number: i,
        area: projectData.unitSize,
        type: projectData.projectType,
        constructor_name: projectData.contractor,
        expected_date: projectData.expectedEndDate,
        macros: macrosToJson(house.macros),
      });
    }

    // Insert houses to database
    if (housesInsert.length > 0) {
      const { error: housesError } = await supabase
        .from('houses')
        .insert(housesInsert);

      if (housesError) {
        console.error('Error creating houses:', housesError);
      }
    }
    
    const newProject: Project = {
      ...projectData,
      id: newProjectData.id,
      houses,
      quadras: [],
      macrosTemplate,
      createdAt: newProjectData.created_at,
      setupComplete: false,
      legendFollowMacros: false,
      customLegendItems: DEFAULT_LEGEND_ITEMS,
      displayOrder: 0,
    };

    setProjects(prev => [newProject, ...prev]);
    setCurrentProjectId(newProjectData.id);
    toast.success("Obra criada com sucesso!");
    return newProjectData.id;
  }, []);

  const updateProject = useCallback(async (projectId: string, updates: Partial<Project>) => {
    setProjects(prev => {
      const newProjects = prev.map(p => {
        if (p.id !== projectId) return p;
        
        const updatedProject = { ...p, ...updates };
        
        // If totalHouses, unitSize, projectType, contractor or expectedEndDate changed, update all houses
        if (updates.totalHouses !== undefined || updates.unitSize !== undefined || 
            updates.projectType !== undefined || updates.contractor !== undefined ||
            updates.expectedEndDate !== undefined) {
          
          const targetTotal = updates.totalHouses ?? p.totalHouses;
          const unitSize = updates.unitSize ?? p.unitSize;
          const projectType = updates.projectType ?? p.projectType;
          const contractor = updates.contractor ?? p.contractor;
          const expectedEndDate = updates.expectedEndDate ?? p.expectedEndDate;
          
          // If total houses changed, regenerate
          if (targetTotal !== p.houses.length) {
            const newHouses: House[] = [];
            for (let i = 1; i <= targetTotal; i++) {
              const existingHouse = p.houses.find(h => h.id === i);
              if (existingHouse) {
                newHouses.push({
                  ...existingHouse,
                  area: unitSize,
                  type: projectType,
                  constructorName: contractor,
                  expectedDate: expectedEndDate,
                });
              } else {
                newHouses.push({
                  id: i,
                  quadra: "",
                  area: unitSize,
                  type: projectType,
                  constructorName: contractor,
                  expectedDate: expectedEndDate,
                  lastUpdate: new Date().toLocaleDateString("pt-BR"),
                  macros: p.macrosTemplate.map(macro => ({
                    ...macro,
                    scopes: macro.scopes.map(scope => ({
                      ...scope,
                      progress: 0,
                      startDate: null,
                      endDate: null,
                    })),
                  })),
                });
              }
            }
            updatedProject.houses = newHouses;
            
            // Clean up quadras that reference houses beyond the new total
            updatedProject.quadras = p.quadras.map(q => ({
              ...q,
              houses: q.houses.filter(hId => hId <= targetTotal),
            }));
          } else {
            // Just update existing houses with new project data
            updatedProject.houses = p.houses.map(h => ({
              ...h,
              area: unitSize,
              type: projectType,
              constructorName: contractor,
              expectedDate: expectedEndDate,
            }));
          }
        }
        
        return updatedProject;
      });
      
      // Update selectedHouse if it belongs to the updated project
      if (projectId === currentProjectId && selectedHouse) {
        const updatedProject = newProjects.find(p => p.id === projectId);
        if (updatedProject) {
          const updatedHouse = updatedProject.houses.find(h => h.id === selectedHouse.id);
          if (updatedHouse) {
            setSelectedHouse(updatedHouse);
          }
        }
      }
      
      // Save to database
      const updatedProject = newProjects.find(p => p.id === projectId);
      if (updatedProject) {
        supabase
          .from('projects')
          .update({
            name: updatedProject.name,
            location: updatedProject.location,
            contractor: updatedProject.contractor,
            start_date: updatedProject.startDate,
            expected_end_date: updatedProject.expectedEndDate,
            total_houses: updatedProject.totalHouses,
            unit_size: updatedProject.unitSize,
            project_type: updatedProject.projectType,
            macros_template: macrosToJson(updatedProject.macrosTemplate),
            setup_complete: updatedProject.setupComplete,
            ...(updates.logoUrl !== undefined ? { logo_url: updatedProject.logoUrl ?? null } : {}),
          })
          .eq('id', projectId)
          .then(({ error }) => {
            if (error) console.error('Error updating project:', error);
          });

        // Update houses in database - NEVER delete existing houses to preserve FK references
        const saveHousesToDb = async () => {
          // Get existing house numbers in DB
          const { data: existingHouses } = await supabase
            .from('houses')
            .select('house_number')
            .eq('project_id', projectId);
          
          const existingNumbers = new Set((existingHouses || []).map(h => h.house_number));
          const targetNumbers = new Set(updatedProject.houses.map(h => h.id));
          
          // Delete ONLY houses that no longer exist (beyond new total)
          const toDelete = [...existingNumbers].filter(n => !targetNumbers.has(n));
          if (toDelete.length > 0) {
            await supabase
              .from('houses')
              .delete()
              .eq('project_id', projectId)
              .in('house_number', toDelete);
          }
          
          // Upsert existing houses (preserves macros/progress data)
          const toUpsert = updatedProject.houses.filter(h => existingNumbers.has(h.id));
          for (const h of toUpsert) {
            await supabase
              .from('houses')
              .update({
                quadra_id: h.quadra || null,
                area: h.area,
                type: h.type,
                constructor_name: h.constructorName,
                expected_date: h.expectedDate || null,
                // DO NOT update macros here - preserve existing production data
              })
              .eq('project_id', projectId)
              .eq('house_number', h.id);
          }
          
          // Insert ONLY truly new houses
          const toInsert = updatedProject.houses.filter(h => !existingNumbers.has(h.id));
          if (toInsert.length > 0) {
            const housesInsert = toInsert.map(h => ({
              project_id: projectId,
              house_number: h.id,
              quadra_id: h.quadra || null,
              area: h.area,
              type: h.type,
              constructor_name: h.constructorName,
              expected_date: h.expectedDate || null,
              macros: macrosToJson(h.macros),
            }));
            await supabase.from('houses').insert(housesInsert);
          }
          
          // Auto-update map_layouts to sync with new house list
          const { data: mapLayout } = await supabase
            .from('map_layouts')
            .select('id, houses, quadras')
            .eq('project_id', projectId)
            .maybeSingle();
          
          if (mapLayout) {
            // Update map quadras to remove deleted houses and add new ones
            const mapQuadras = (mapLayout.quadras as any[]) || [];
            const updatedMapQuadras = mapQuadras.map((mq: any) => ({
              ...mq,
              houses: (mq.houses || []).filter((hId: number) => targetNumbers.has(hId)),
            }));
            
            await supabase
              .from('map_layouts')
              .update({ quadras: updatedMapQuadras as unknown as Json })
              .eq('project_id', projectId);
          }
        };
        saveHousesToDb();
      }
      
      return newProjects;
    });
  }, [currentProjectId, selectedHouse]);

  const deleteProject = useCallback(async (projectId: string) => {
    // Delete from database
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      console.error('Error deleting project:', error);
      toast.error("Erro ao excluir projeto");
      return;
    }

    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (currentProjectId === projectId) {
      const remaining = projects.filter(p => p.id !== projectId);
      setCurrentProjectId(remaining.length > 0 ? remaining[0].id : null);
    }
    toast.success("Projeto excluído");
  }, [currentProjectId, projects]);

  const completeProjectSetup = useCallback(async (projectId: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, setupComplete: true } : p
    ));

    await supabase
      .from('projects')
      .update({ setup_complete: true })
      .eq('id', projectId);
  }, []);

  // Ordem hierárquica das etapas de setup
  const STEP_ORDER: ProjectSetupStep[] = [
    "project_created",
    "blocks_configured",
    "services_defined",
    "budget_defined",
    "contract_defined",
    "long_term_planned",
  ];

  // Avançar etapa de setup do projeto atual
  const advanceSetupStep = useCallback(async (step: ProjectSetupStep): Promise<boolean> => {
    if (!currentProjectId) return false;
    
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return false;
    
    const currentStep = project.setupStep || "project_created";
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    const targetIndex = STEP_ORDER.indexOf(step);
    
    // Só pode avançar, não retroceder
    if (targetIndex <= currentIndex) return true;

    try {
      const { error } = await supabase
        .from("projects")
        .update({ setup_step: step })
        .eq("id", currentProjectId);

      if (error) {
        console.error("Erro ao atualizar etapa:", error);
        return false;
      }

      // Atualizar estado local
      setProjects(prev => prev.map(p => 
        p.id === currentProjectId ? { ...p, setupStep: step } : p
      ));

      return true;
    } catch (error) {
      console.error("Erro ao avançar etapa:", error);
      return false;
    }
  }, [currentProjectId, projects]);

  // Quadra management
  const addQuadra = useCallback(async (name: string, houseIds: number[]) => {
    if (!currentProjectId) return;
    
    // Get the next display_order
    const project = projects.find(p => p.id === currentProjectId);
    const nextOrder = project ? project.quadras.length : 0;

    const { data: quadraData, error } = await supabase
      .from('quadras')
      .insert({
        project_id: currentProjectId,
        name,
        house_ids: houseIds,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error || !quadraData) {
      console.error('Error creating quadra:', error);
      return;
    }

    const newQuadra: Quadra = {
      id: quadraData.id,
      name,
      houses: houseIds,
    };
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      // Update houses to have the correct quadra
      const updatedHouses = p.houses.map(h => 
        houseIds.includes(h.id) ? { ...h, quadra: newQuadra.id } : h
      );
      
      return {
        ...p,
        quadras: [...p.quadras, newQuadra],
        houses: updatedHouses,
      };
    }));

    // Update houses in database
    for (const houseId of houseIds) {
      await supabase
        .from('houses')
        .update({ quadra_id: quadraData.id })
        .eq('project_id', currentProjectId)
        .eq('house_number', houseId);
    }
  }, [currentProjectId]);

  const updateQuadra = useCallback(async (quadraId: string, name: string, houseIds: number[]) => {
    if (!currentProjectId) return;
    
    // Update quadra in database
    await supabase
      .from('quadras')
      .update({ name, house_ids: houseIds })
      .eq('id', quadraId);

    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const oldQuadra = p.quadras.find(q => q.id === quadraId);
      const oldHouseIds = oldQuadra?.houses || [];
      
      const updatedQuadras = p.quadras.map(q => 
        q.id === quadraId ? { ...q, name, houses: houseIds } : q
      );
      
      const updatedHouses = p.houses.map(h => {
        if (houseIds.includes(h.id)) {
          return { ...h, quadra: quadraId };
        }
        // Remove from this quadra if it was there before
        if (h.quadra === quadraId && !houseIds.includes(h.id)) {
          return { ...h, quadra: "" };
        }
        return h;
      });

      // Update houses in database
      const updateHousesInDb = async () => {
        // Remove old houses from quadra
        for (const houseId of oldHouseIds) {
          if (!houseIds.includes(houseId)) {
            await supabase
              .from('houses')
              .update({ quadra_id: null })
              .eq('project_id', currentProjectId)
              .eq('house_number', houseId);
          }
        }
        // Add new houses to quadra
        for (const houseId of houseIds) {
          await supabase
            .from('houses')
            .update({ quadra_id: quadraId })
            .eq('project_id', currentProjectId)
            .eq('house_number', houseId);
        }
      };
      updateHousesInDb();
      
      return { ...p, quadras: updatedQuadras, houses: updatedHouses };
    }));
  }, [currentProjectId]);

  const deleteQuadra = useCallback(async (quadraId: string) => {
    if (!currentProjectId) return;
    
    // Delete from database
    await supabase
      .from('quadras')
      .delete()
      .eq('id', quadraId);

    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(h => 
        h.quadra === quadraId ? { ...h, quadra: "" } : h
      );
      
      return {
        ...p,
        quadras: p.quadras.filter(q => q.id !== quadraId),
        houses: updatedHouses,
      };
    }));

    // Update houses in database
    await supabase
      .from('houses')
      .update({ quadra_id: null })
      .eq('project_id', currentProjectId)
      .eq('quadra_id', quadraId);
  }, [currentProjectId]);

  const reorderQuadras = useCallback(async (orderedIds: string[]) => {
    if (!currentProjectId) return;

    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      // Reorder quadras based on orderedIds
      const reorderedQuadras = orderedIds
        .map(id => p.quadras.find(q => q.id === id))
        .filter((q): q is typeof p.quadras[0] => q !== undefined);
      
      return { ...p, quadras: reorderedQuadras };
    }));

    // Persist order to database
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase
        .from('quadras')
        .update({ display_order: i })
        .eq('id', orderedIds[i]);
    }
  }, [currentProjectId]);

  const generateHousesForProject = useCallback(async () => {
    if (!currentProjectId || !currentProject) return;
    
    // Get existing houses from DB to preserve their data
    const { data: existingDbHouses } = await supabase
      .from('houses')
      .select('*')
      .eq('project_id', currentProjectId);
    
    const existingMap = new Map((existingDbHouses || []).map(h => [h.house_number, h]));
    
    const houses: House[] = [];
    const toInsert: any[] = [];
    
    for (let i = 1; i <= currentProject.totalHouses; i++) {
      const existing = existingMap.get(i);
      if (existing) {
        // Preserve existing house with all its data
        houses.push({
          id: existing.house_number,
          quadra: existing.quadra_id || "",
          area: currentProject.unitSize,
          type: currentProject.projectType,
          constructorName: currentProject.contractor,
          expectedDate: currentProject.expectedEndDate,
          lastUpdate: new Date(existing.last_update).toLocaleDateString("pt-BR"),
          macros: jsonToMacros(existing.macros),
        });
        // Only update metadata, preserve macros
        await supabase
          .from('houses')
          .update({
            area: currentProject.unitSize,
            type: currentProject.projectType,
            constructor_name: currentProject.contractor,
            expected_date: currentProject.expectedEndDate,
          })
          .eq('project_id', currentProjectId)
          .eq('house_number', i);
      } else {
        // New house
        const house: House = {
          id: i,
          quadra: "",
          area: currentProject.unitSize,
          type: currentProject.projectType,
          constructorName: currentProject.contractor,
          expectedDate: currentProject.expectedEndDate,
          lastUpdate: new Date().toLocaleDateString("pt-BR"),
          macros: currentProject.macrosTemplate.map(macro => ({
            ...macro,
            scopes: macro.scopes.map(scope => ({
              ...scope,
              progress: 0,
              startDate: null,
              endDate: null,
            })),
          })),
        };
        houses.push(house);
        toInsert.push({
          project_id: currentProjectId,
          house_number: i,
          area: currentProject.unitSize,
          type: currentProject.projectType,
          constructor_name: currentProject.contractor,
          expected_date: currentProject.expectedEndDate,
          macros: macrosToJson(house.macros),
        });
      }
    }
    
    // Delete only houses beyond the new total
    const toDeleteNumbers = [...existingMap.keys()].filter(n => n > currentProject.totalHouses);
    if (toDeleteNumbers.length > 0) {
      await supabase
        .from('houses')
        .delete()
        .eq('project_id', currentProjectId)
        .in('house_number', toDeleteNumbers);
    }
    
    // Insert only new houses
    if (toInsert.length > 0) {
      await supabase.from('houses').insert(toInsert);
    }

    setProjects(prev => prev.map(p => 
      p.id === currentProjectId ? { ...p, houses } : p
    ));
  }, [currentProjectId, currentProject]);

  const moveHouseToQuadra = useCallback(async (houseId: number, newQuadraId: string) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(h => 
        h.id === houseId ? { ...h, quadra: newQuadraId, lastUpdate: new Date().toLocaleDateString("pt-BR") } : h
      );
      
      const updatedQuadras = p.quadras.map(q => ({
        ...q,
        houses: q.houses.filter(id => id !== houseId),
      })).map(q => 
        q.id === newQuadraId 
          ? { ...q, houses: [...q.houses, houseId].sort((a, b) => a - b) }
          : q
      );
      
      return { ...p, houses: updatedHouses, quadras: updatedQuadras };
    }));

    // Update in database
    await supabase
      .from('houses')
      .update({ quadra_id: newQuadraId })
      .eq('project_id', currentProjectId)
      .eq('house_number', houseId);

    // Update quadras in database
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
      for (const q of project.quadras) {
        const newHouses = q.id === newQuadraId 
          ? [...q.houses.filter(id => id !== houseId), houseId].sort((a, b) => a - b)
          : q.houses.filter(id => id !== houseId);
        
        await supabase
          .from('quadras')
          .update({ house_ids: newHouses })
          .eq('id', q.id);
      }
    }

    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => prev ? { ...prev, quadra: newQuadraId } : null);
    }
  }, [currentProjectId, selectedHouse, projects]);

  // Sync macros to houses helper - reads from DB to avoid overwriting progress with stale local state
  const syncMacrosToHouses = useCallback(async (newTemplate: Macro[]) => {
    if (!currentProjectId) return;
    
    // CRITICAL: Read current macros from DATABASE (not local state) to preserve production data
    const { data: dbHouses, error: fetchErr } = await supabase
      .from('houses')
      .select('house_number, macros')
      .eq('project_id', currentProjectId);

    if (fetchErr || !dbHouses) {
      console.error('Error fetching houses for sync:', fetchErr);
      return;
    }

    const dbHouseMap = new Map<number, Macro[]>();
    for (const h of dbHouses) {
      dbHouseMap.set(h.house_number, jsonToMacros(h.macros));
    }

    const updatedHousesForDb: { houseId: number; macros: Macro[] }[] = [];
    
    const buildUpdatedMacros = (existingMacros: Macro[]) => {
      return newTemplate.map(templateMacro => {
        const existingMacro = existingMacros.find(m => m.id === templateMacro.id);
        if (existingMacro) {
          const updatedScopes = templateMacro.scopes.map(templateScope => {
            const existingScope = existingMacro.scopes.find(s => s.id === templateScope.id);
            return existingScope 
              ? { ...templateScope, progress: existingScope.progress, startDate: existingScope.startDate, endDate: existingScope.endDate } 
              : { ...templateScope };
          });
          return { ...templateMacro, scopes: updatedScopes };
        }
        return { ...templateMacro, scopes: templateMacro.scopes.map(s => ({ ...s, progress: 0, startDate: null, endDate: null })) };
      });
    };

    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => {
        // Use DB macros (authoritative) instead of potentially stale local macros
        const dbMacros = dbHouseMap.get(house.id) || house.macros;
        const updatedMacros = buildUpdatedMacros(dbMacros);
        
        updatedHousesForDb.push({ houseId: house.id, macros: updatedMacros });
        return { ...house, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
      
      return { ...p, houses: updatedHouses, macrosTemplate: newTemplate };
    }));

    // Persist houses macros to database
    const BATCH_SIZE = 10;
    for (let i = 0; i < updatedHousesForDb.length; i += BATCH_SIZE) {
      const batch = updatedHousesForDb.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(house =>
        supabase
          .from('houses')
          .update({ macros: macrosToJson(house.macros), last_update: new Date().toISOString().split('T')[0] })
          .eq('project_id', currentProjectId)
          .eq('house_number', house.houseId)
      ));
    }

    if (selectedHouse) {
      const dbMacros = dbHouseMap.get(selectedHouse.id) || selectedHouse.macros;
      const updatedMacros = buildUpdatedMacros(dbMacros);
      setSelectedHouse(prev => prev ? { ...prev, macros: updatedMacros } : null);
    }
  }, [currentProjectId, selectedHouse]);

  // ============================================================
  // Central structure mutation helper
  // All structural changes go through apply_structure_mutation RPC
  // which atomically: computes delta, cascades deletions, propagates
  // name/color changes, updates macros_template, and syncs contract.
  // Then houses are synced client-side (preserving production progress).
  // ============================================================
  const applyStructureMutation = useCallback(async (
    newTemplate: Macro[],
    successMessage: string
  ): Promise<boolean> => {
    if (!currentProject) return false;

    // Garantir company_id antes de chamar a RPC (obras criadas por empresas novas
    // podem ter company_id NULL no banco, fazendo apply_structure_mutation falhar).
    if (!currentProject.companyId) {
      const { data: cid } = await supabase.rpc('get_my_company_id');
      if (cid) {
        const { error: updErr } = await supabase
          .from('projects')
          .update({ company_id: cid })
          .eq('id', currentProject.id);
        if (!updErr) {
          // Atualiza estado local para refletir o vínculo
          setProjects(prev => prev.map(p =>
            p.id === currentProject.id ? { ...p, companyId: cid as string } : p
          ));
        }
      } else {
        toast.error('Configure sua empresa em Gerenciamento → Minha Empresa antes de adicionar etapas.');
        return false;
      }
    }

    const { data, error } = await supabase.rpc('apply_structure_mutation', {
      p_project_id: currentProject.id,
      p_new_template: macrosToJson(newTemplate),
    });

    if (error) {
      console.error('Error in structure mutation:', error.message, error.details, error.hint);
      // Mensagem específica por tipo de erro para facilitar diagnóstico
      const msg = error.message?.includes('contract_not_found')
        ? 'Configure o contrato da obra antes de adicionar etapas.'
        : error.message?.includes('permission denied')
        ? 'Sem permissão para alterar estrutura desta obra.'
        : error.message?.includes('company_id')
        ? 'Vincule sua empresa antes de configurar etapas (Gerenciamento → Minha Empresa).'
        : `Erro ao salvar estrutura: ${error.message || 'erro desconhecido'}`;
      toast.error(msg);
      return false;
    }

    const result = data as { success: boolean; removed_scopes?: string[]; removed_macros?: string[]; total_scopes_removed?: number; total_macros_removed?: number } | null;

    if (result?.total_scopes_removed || result?.total_macros_removed) {
    }

    // Sync houses (preserves production progress, client-side)
    await syncMacrosToHouses(newTemplate);
    
    if (successMessage) toast.success(successMessage);
    return true;
  }, [currentProject, syncMacrosToHouses]);

  // Macro management - all mutations go through central RPC
  const addMacro = useCallback(async (name: string) => {
    if (!currentProject) return;
    
    const usedColors = currentProject.macrosTemplate.map(m => m.color);
    const availableColor = DEFAULT_MACRO_COLORS.find(c => !usedColors.includes(c)) || DEFAULT_MACRO_COLORS[0];
    
    const newMacro: Macro = {
      id: `macro_${Date.now()}`,
      name,
      color: availableColor,
      scopes: [],
    };
    
    const newTemplate = [...currentProject.macrosTemplate, newMacro];
    await applyStructureMutation(newTemplate, "Etapa adicionada!");
  }, [currentProject, applyStructureMutation]);

  const updateMacro = useCallback(async (macroId: string, name: string, color?: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId ? { ...m, name, ...(color !== undefined && { color }) } : m
    );

    await applyStructureMutation(newTemplate, "");
  }, [currentProject, applyStructureMutation]);

  const deleteMacro = useCallback(async (macroId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.filter(m => m.id !== macroId);
    await applyStructureMutation(newTemplate, "Etapa e todos dados relacionados removidos!");
  }, [currentProject, applyStructureMutation]);

  // Scope management - all mutations go through central RPC
  const addScope = useCallback(async (macroId: string, name: string, weight: number) => {
    if (!currentProject) return;
    
    const newScope: Scope = {
      id: `scope_${Date.now()}`,
      name,
      weight,
      progress: 0,
      startDate: null,
      endDate: null,
    };
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: [...m.scopes, newScope] }
        : m
    );

    await applyStructureMutation(newTemplate, "Serviço adicionado!");
  }, [currentProject, applyStructureMutation]);

  const updateScope = useCallback(async (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.map(s => s.id === scopeId ? { ...s, ...updates } : s) }
        : m
    );

    await applyStructureMutation(newTemplate, "");
  }, [currentProject, applyStructureMutation]);

  const deleteScope = useCallback(async (macroId: string, scopeId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.filter(s => s.id !== scopeId) }
        : m
    );

    await applyStructureMutation(newTemplate, "Serviço e todos dados relacionados removidos!");
  }, [currentProject, applyStructureMutation]);

  // Reorder macros
  const reorderMacros = useCallback(async (orderedMacroIds: string[]) => {
    if (!currentProject) return;
    
    const newTemplate = orderedMacroIds
      .map(id => currentProject.macrosTemplate.find(m => m.id === id))
      .filter((m): m is Macro => m !== undefined);

    await applyStructureMutation(newTemplate, "Ordem das etapas atualizada!");
  }, [currentProject, applyStructureMutation]);

  // Reorder scopes within a macro
  const reorderScopes = useCallback(async (macroId: string, orderedScopeIds: string[]) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => {
      if (m.id !== macroId) return m;
      
      const reorderedScopes = orderedScopeIds
        .map(id => m.scopes.find(s => s.id === id))
        .filter((s): s is Scope => s !== undefined);
      
      return { ...m, scopes: reorderedScopes };
    });

    await applyStructureMutation(newTemplate, "Ordem dos serviços atualizada!");
  }, [currentProject, applyStructureMutation]);

  // House updates
  const updateScopeProgress = useCallback(async (houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => {
    if (!currentProjectId) return;

    // Fetch current house data from database to avoid stale state issues
    const { data: houseData, error: fetchError } = await supabase
      .from('houses')
      .select('macros')
      .eq('project_id', currentProjectId)
      .eq('house_number', houseId)
      .single();

    if (fetchError || !houseData) {
      console.error('Error fetching house data:', fetchError);
      return;
    }

    const currentMacros = jsonToMacros(houseData.macros);

    // Build updated macros for this house
    const updatedMacros = currentMacros.map(macro => {
      if (macro.id !== macroId) return macro;
      
      const updatedScopes = macro.scopes.map(scope => {
        if (scope.id !== scopeId) return scope;
        return {
          ...scope,
          progress,
          startDate: startDate !== undefined ? startDate : scope.startDate,
          endDate: endDate !== undefined ? endDate : scope.endDate,
        };
      });
      
      return { ...macro, scopes: updatedScopes };
    });

    // Update database
    const { error } = await supabase
      .from('houses')
      .update({ 
        macros: macrosToJson(updatedMacros),
        last_update: new Date().toISOString().split('T')[0]
      })
      .eq('project_id', currentProjectId)
      .eq('house_number', houseId);

    if (error) {
      console.error('Error updating house progress:', error);
      return;
    }

    // Update local state after successful database update
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(h => {
        if (h.id !== houseId) return h;
        return { ...h, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
      
      return { ...p, houses: updatedHouses };
    }));

    // Also update selected house if it's the one being modified
    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => {
        if (!prev) return null;
        return { ...prev, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
    }
  }, [currentProjectId, selectedHouse]);

  // Batch update scope progress for multiple houses - optimized for performance
  // houseProgressMap allows setting different percentages per house
  const updateBatchScopeProgress = useCallback(async (houseIds: number[], macroId: string, scopeId: string, progress: number, houseProgressMap?: Record<number, number>) => {
    if (!currentProjectId || houseIds.length === 0) return;

    try {
      // Fetch all houses data in one query
      const { data: housesData, error: fetchError } = await supabase
        .from('houses')
        .select('house_number, macros')
        .eq('project_id', currentProjectId)
        .in('house_number', houseIds);

      if (fetchError || !housesData) {
        console.error('Error fetching houses data:', fetchError);
        return;
      }

      // Prepare all updates
      const updates: { houseNumber: number; updatedMacros: Macro[] }[] = [];
      
      for (const houseData of housesData) {
        // Use individual percentage if available, otherwise use the default progress
        const houseProgress = houseProgressMap?.[houseData.house_number] ?? progress;
        
        const currentMacros = jsonToMacros(houseData.macros);
        const updatedMacros = currentMacros.map(macro => {
          if (macro.id !== macroId) return macro;
          return {
            ...macro,
            scopes: macro.scopes.map(scope => {
              if (scope.id !== scopeId) return scope;
              return { ...scope, progress: houseProgress };
            })
          };
        });
        updates.push({ houseNumber: houseData.house_number, updatedMacros });
      }

      // Execute database updates in batches of 10 for better performance
      const BATCH_SIZE = 10;
      const today = new Date().toISOString().split('T')[0];
      
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(({ houseNumber, updatedMacros }) =>
          supabase
            .from('houses')
            .update({ 
              macros: macrosToJson(updatedMacros),
              last_update: today
            })
            .eq('project_id', currentProjectId)
            .eq('house_number', houseNumber)
        );
        await Promise.all(batchPromises);
      }

      // Update local state with all changes at once
      setProjects(prev => prev.map(p => {
        if (p.id !== currentProjectId) return p;
        
        const updatedHouses = p.houses.map(h => {
          const update = updates.find(u => u.houseNumber === h.id);
          if (!update) return h;
          return { ...h, macros: update.updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
        });
        
        return { ...p, houses: updatedHouses };
      }));

      // Update selected house if it was modified
      if (selectedHouse && houseIds.includes(selectedHouse.id)) {
        const update = updates.find(u => u.houseNumber === selectedHouse.id);
        if (update) {
          setSelectedHouse(prev => prev ? { ...prev, macros: update.updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") } : null);
        }
      }
    } catch (error) {
      console.error('Error batch updating scope progress:', error);
    }
  }, [currentProjectId, selectedHouse]);

  // Refresh houses from database - sync local state with DB
  const refreshHousesFromDB = useCallback(async () => {
    if (!currentProjectId) return;

    try {
      const project = projectsRef.current?.find((p) => p.id === currentProjectId);
      console.log("[Map Progress Cache Check] refresh houses start", {
        projectId: currentProjectId,
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        reason: "explicit_refresh",
      });

      const { data: housesData, error } = await supabase
        .from('houses')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('house_number', { ascending: true });

      if (error) {
        console.error('Error refreshing houses:', error);
        return;
      }

      const refreshedHouses: House[] = (housesData || []).map(h => ({
        id: h.house_number,
        quadra: h.quadra_id || "",
        area: h.area,
        type: h.type,
        constructorName: h.constructor_name || "",
        expectedDate: h.expected_date || "",
        lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
        macros: jsonToMacros(h.macros),
      }));

      serverHydratedProjectIdsRef.current.add(currentProjectId);
      lastFreshHousesFetchRef.current.set(currentProjectId, Date.now());
      console.log("[Map Progress Cache Check] refresh houses success", {
        projectId: currentProjectId,
        serverHouses: refreshedHouses.length,
        serverAverageProgress: getAverageHouseProgress(refreshedHouses, project?.macrosTemplate),
        firstHouse: refreshedHouses[0]
          ? {
              id: refreshedHouses[0].id,
              lastUpdate: refreshedHouses[0].lastUpdate,
              macros: refreshedHouses[0].macros?.length ?? 0,
            }
          : null,
      });

      setProjects(prev => prev.map(p => {
        if (p.id !== currentProjectId) return p;
        return { ...p, houses: refreshedHouses };
      }));

      // Update selected house if present
      if (selectedHouse) {
        const updatedHouse = refreshedHouses.find(h => h.id === selectedHouse.id);
        if (updatedHouse) {
          setSelectedHouse(updatedHouse);
        }
      }
    } catch (error) {
      console.error('Error refreshing houses from DB:', error);
      serverHydratedProjectIdsRef.current.delete(currentProjectId);
    }
  }, [currentProjectId, getAverageHouseProgress, selectedHouse]);

  const ensureFreshProjectHouses = useCallback(async (options?: { force?: boolean; reason?: string }) => {
    if (!currentProjectId) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.log("[Map Progress Cache Check] fresh houses skipped", {
        projectId: currentProjectId,
        reason: options?.reason ?? "unspecified",
        skipReason: "offline_cache_allowed",
      });
      return;
    }

    const now = Date.now();
    const lastFetch = lastFreshHousesFetchRef.current.get(currentProjectId) ?? 0;
    const ageMs = now - lastFetch;
    const throttleMs = 20_000;

    if (!options?.force && lastFetch > 0 && ageMs < throttleMs) {
      console.log("[Map Progress Cache Check] fresh houses skipped", {
        projectId: currentProjectId,
        reason: options?.reason ?? "unspecified",
        skipReason: "throttled",
        ageMs,
        throttleMs,
      });
      return;
    }

    console.log("[Map Progress Cache Check] fresh houses requested", {
      projectId: currentProjectId,
      reason: options?.reason ?? "unspecified",
      force: options?.force ?? false,
      ageMs: lastFetch ? ageMs : null,
    });
    await refreshHousesFromDB();
  }, [currentProjectId, refreshHousesFromDB]);

  // Escuta o evento disparado pelo sync worker / recálculo manual
  // (offline → online) para recarregar as casas do projeto afetado.
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { projectId?: string } | undefined;
      if (!detail?.projectId) return;
      if (detail.projectId !== currentProjectId) return;
      void refreshHousesFromDB();
    };
    window.addEventListener("obramap:progress-recomputed", handler);
    return () => window.removeEventListener("obramap:progress-recomputed", handler);
  }, [currentProjectId, refreshHousesFromDB]);

  const updateHouseInfo = useCallback(async (houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => {
        if (house.id !== houseId) return house;
        return { ...house, ...updates, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
      
      return { ...p, houses: updatedHouses };
    }));

    // Update in database
    const dbUpdates: Record<string, unknown> = {
      last_update: new Date().toISOString().split('T')[0]
    };
    if (updates.area !== undefined) dbUpdates.area = updates.area;
    if (updates.constructorName !== undefined) dbUpdates.constructor_name = updates.constructorName;
    if (updates.type !== undefined) dbUpdates.type = updates.type;
    if (updates.expectedDate !== undefined) dbUpdates.expected_date = updates.expectedDate;

    await supabase
      .from('houses')
      .update(dbUpdates)
      .eq('project_id', currentProjectId)
      .eq('house_number', houseId);

    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => prev ? { ...prev, ...updates, lastUpdate: new Date().toLocaleDateString("pt-BR") } : null);
    }
  }, [currentProjectId, selectedHouse]);

  const renameHouse = useCallback(async (oldNumber: number, newNumber: number): Promise<boolean> => {
    if (!currentProjectId) return false;
    
    // Check if newNumber already exists
    const currentProj = projects.find(p => p.id === currentProjectId);
    if (currentProj?.houses.some(h => h.id === newNumber)) {
      toast.error(`Já existe uma casa com número ${newNumber}`);
      return false;
    }

    // Use RPC to cascade rename across ALL tables
    const { error } = await supabase.rpc('rename_house_number', {
      p_project_id: currentProjectId,
      p_old_number: oldNumber,
      p_new_number: newNumber
    });

    if (error) {
      console.error('Error renaming house:', error);
      toast.error('Erro ao renumerar casa');
      return false;
    }

    // Update local state
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => 
        house.id === oldNumber ? { ...house, id: newNumber } : house
      );
      
      const updatedQuadras = p.quadras.map(q => ({
        ...q,
        houses: q.houses.map(h => h === oldNumber ? newNumber : h)
      }));
      
      return { ...p, houses: updatedHouses, quadras: updatedQuadras };
    }));

    if (selectedHouse?.id === oldNumber) {
      setSelectedHouse(prev => prev ? { ...prev, id: newNumber } : null);
    }

    return true;
  }, [currentProjectId, projects, selectedHouse]);

  const getHouseProgress = useCallback((houseId: number): number => {
    if (!currentProject) return 0;
    const house = currentProject.houses.find(h => h.id === houseId);
    return house ? calculateHouseProgress(house) : 0;
  }, [currentProject]);

  const getDaysRemaining = useCallback(() => {
    if (!currentProject) return 0;
    
    const endDate = new Date(currentProject.expectedEndDate);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays);
  }, [currentProject]);

  // Reset all house progress data
  const resetProjectData = useCallback(async () => {
    if (!currentProject) return;
    
    const resetHouses = currentProject.houses.map(house => ({
      ...house,
      macros: currentProject.macrosTemplate.map(macro => ({
        ...macro,
        scopes: macro.scopes.map(scope => ({
          ...scope,
          progress: 0,
          startDate: null,
          endDate: null,
        })),
      })),
      lastUpdate: new Date().toLocaleDateString("pt-BR"),
    }));

    setProjects(prev => prev.map(p => 
      p.id === currentProject.id ? { ...p, houses: resetHouses } : p
    ));

    // Update houses in database
    for (const house of resetHouses) {
      await supabase
        .from('houses')
        .update({ 
          macros: macrosToJson(house.macros),
          last_update: new Date().toISOString().split('T')[0]
        })
        .eq('project_id', currentProject.id)
        .eq('house_number', house.id);
    }

    setSelectedHouse(null);
  }, [currentProject]);

  // Legend settings management
  const updateLegendSettings = useCallback(async (followMacros: boolean, legendItems?: LegendItem[]) => {
    if (!currentProject) return;

    const updates: Partial<Project> = {
      legendFollowMacros: followMacros,
    };

    if (legendItems !== undefined) {
      updates.customLegendItems = legendItems;
    }

    setProjects(prev => prev.map(p => 
      p.id === currentProject.id ? { ...p, ...updates } : p
    ));

    // Update in database
    const dbUpdates: Record<string, unknown> = {
      legend_follow_macros: followMacros,
    };

    if (legendItems !== undefined) {
      dbUpdates.custom_legend_items = legendItems as unknown as Json;
    }

    await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', currentProject.id);
  }, [currentProject]);

  // Reorder projects
  const reorderProjects = useCallback(async (orderedProjectIds: string[]) => {
    // Update local state immediately
    setProjects(prev => {
      const projectMap = new Map(prev.map(p => [p.id, p]));
      return orderedProjectIds
        .map((id, index) => {
          const project = projectMap.get(id);
          return project ? { ...project, displayOrder: index } : null;
        })
        .filter((p): p is Project => p !== null);
    });

    // Update database
    try {
      for (let i = 0; i < orderedProjectIds.length; i++) {
        await supabase
          .from('projects')
          .update({ display_order: i })
          .eq('id', orderedProjectIds[i]);
      }
    } catch (error) {
      console.error('Error reordering projects:', error);
      toast.error('Erro ao reordenar obras');
    }
  }, []);

  return (
    <ConstructionContext.Provider
      value={{
        projects,
        currentProject,
        setCurrentProject,
        addProject,
        updateProject,
        deleteProject,
        completeProjectSetup,
        advanceSetupStep,
        addQuadra,
        updateQuadra,
        deleteQuadra,
        generateHousesForProject,
        selectedHouse,
        setSelectedHouse,
        updateScopeProgress,
        updateBatchScopeProgress,
        updateHouseInfo,
        renameHouse,
        getHouseProgress,
        moveHouseToQuadra,
        refreshHousesFromDB,
        ensureFreshProjectHouses,
        reorderQuadras,
        filterQuadra,
        setFilterQuadra,
        filterStatus,
        setFilterStatus,
        filterMode,
        setFilterMode,
        filterMacro,
        setFilterMacro,
        filterScope,
        setFilterScope,
        addMacro,
        updateMacro,
        deleteMacro,
        addScope,
        updateScope,
        deleteScope,
        reorderMacros,
        reorderScopes,
        getDaysRemaining,
        resetProjectData,
        updateLegendSettings,
        reorderProjects,
        isLoading,
      }}
    >
      {children}
    </ConstructionContext.Provider>
  );
}

export function useConstruction() {
  const context = useContext(ConstructionContext);
  if (context === undefined) {
    throw new Error("useConstruction must be used within a ConstructionProvider");
  }
  return context;
}
