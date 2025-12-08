import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from "react";
import { House, Macro, Scope, Quadra, MACROS_TEMPLATE, calculateHouseProgress, DEFAULT_MACRO_COLORS } from "@/data/constructionData";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";

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

export interface Project {
  id: string;
  name: string;
  location: string;
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
  legendFollowMacros: boolean;
  customLegendItems: LegendItem[];
  displayOrder: number;
}

interface ConstructionContextType {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (projectId: string | null) => void;
  addProject: (project: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete" | "legendFollowMacros" | "customLegendItems" | "displayOrder">) => Promise<string>;
  reorderProjects: (orderedProjectIds: string[]) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  completeProjectSetup: (projectId: string) => void;
  
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
  getHouseProgress: (houseId: number) => number;
  moveHouseToQuadra: (houseId: number, newQuadraId: string) => void;
  refreshHousesFromDB: () => Promise<void>;
  
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
const jsonToMacros = (json: Json): Macro[] => {
  if (!json || !Array.isArray(json)) return JSON.parse(JSON.stringify(MACROS_TEMPLATE));
  return json as unknown as Macro[];
};

const FILTER_STORAGE_KEY = "obramap_main_filters";

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadraState] = useState<string>("all");
  const [filterStatus, setFilterStatusState] = useState<string>("all");
  const [filterMode, setFilterModeState] = useState<"status" | "macro" | "scope">("status");
  const [filterMacro, setFilterMacroState] = useState<string>("all");
  const [filterScope, setFilterScopeState] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const filtersLoadedRef = useRef(false);

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  // Load filters from localStorage when project changes
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

  // Load projects from database on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const loadProjects = async () => {
      setIsLoading(true);
      try {
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .order('display_order', { ascending: true });

        if (projectsError) {
          console.error('Error loading projects:', projectsError);
          setIsLoading(false);
          return;
        }

        const loadedProjects: Project[] = [];

        for (const p of projectsData || []) {
          // Load quadras for this project (ordered by display_order)
          const { data: quadrasData } = await supabase
            .from('quadras')
            .select('*')
            .eq('project_id', p.id)
            .order('display_order', { ascending: true });

          // Load houses for this project
          const { data: housesData } = await supabase
            .from('houses')
            .select('*')
            .eq('project_id', p.id)
            .order('house_number', { ascending: true });

          const quadras: Quadra[] = (quadrasData || []).map(q => ({
            id: q.id,
            name: q.name,
            houses: q.house_ids || [],
          }));

          const projectTemplate = jsonToMacros(p.macros_template);

          // Sync houses with project template - preserve progress but use template IDs
          const houses: House[] = (housesData || []).map(h => {
            const houseMacros = jsonToMacros(h.macros);
            
            // Check if house macros match template structure
            const needsSync = projectTemplate.length > 0 && (
              houseMacros.length !== projectTemplate.length ||
              !projectTemplate.every(tm => houseMacros.some(hm => hm.id === tm.id))
            );

            if (needsSync) {
              // Sync house macros to match template, preserving progress by name matching
              const syncedMacros = projectTemplate.map(templateMacro => {
                // Try to find by ID first, then by name
                const existingMacro = houseMacros.find(m => m.id === templateMacro.id) ||
                  houseMacros.find(m => m.name.toLowerCase() === templateMacro.name.toLowerCase());
                
                if (existingMacro) {
                  const syncedScopes = templateMacro.scopes.map(templateScope => {
                    // Try to find by ID first, then by name
                    const existingScope = existingMacro.scopes.find(s => s.id === templateScope.id) ||
                      existingMacro.scopes.find(s => s.name.toLowerCase() === templateScope.name.toLowerCase());
                    
                    return existingScope
                      ? { ...templateScope, progress: existingScope.progress, startDate: existingScope.startDate, endDate: existingScope.endDate }
                      : { ...templateScope, progress: 0, startDate: null, endDate: null };
                  });
                  return { ...templateMacro, scopes: syncedScopes };
                }
                return { ...templateMacro, scopes: templateMacro.scopes.map(s => ({ ...s, progress: 0, startDate: null, endDate: null })) };
              });
              
              return {
                id: h.house_number,
                quadra: h.quadra_id || "",
                area: h.area,
                type: h.type,
                constructorName: h.constructor_name || "",
                expectedDate: h.expected_date || "",
                lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
                macros: syncedMacros,
              };
            }

            return {
              id: h.house_number,
              quadra: h.quadra_id || "",
              area: h.area,
              type: h.type,
              constructorName: h.constructor_name || "",
              expectedDate: h.expected_date || "",
              lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
              macros: houseMacros,
            };
          });

          // If houses needed sync, persist to database
          const housesToSync = (housesData || []).filter((h, i) => {
            const houseMacros = jsonToMacros(h.macros);
            return projectTemplate.length > 0 && (
              houseMacros.length !== projectTemplate.length ||
              !projectTemplate.every(tm => houseMacros.some(hm => hm.id === tm.id))
            );
          });

          if (housesToSync.length > 0) {
            console.log(`Syncing ${housesToSync.length} houses with project template...`);
            for (const house of houses) {
              if (housesToSync.some(h => h.house_number === house.id)) {
                supabase
                  .from('houses')
                  .update({ macros: macrosToJson(house.macros) })
                  .eq('project_id', p.id)
                  .eq('house_number', house.id)
                  .then(({ error }) => {
                    if (error) console.error('Error syncing house:', error);
                  });
              }
            }
          }

          loadedProjects.push({
            id: p.id,
            name: p.name,
            location: p.location,
            contractor: p.contractor,
            startDate: p.start_date,
            expectedEndDate: p.expected_end_date,
            totalHouses: p.total_houses,
            unitSize: p.unit_size,
            projectType: p.project_type,
            houses,
            quadras,
            macrosTemplate: projectTemplate,
            createdAt: p.created_at,
            setupComplete: p.setup_complete,
            legendFollowMacros: p.legend_follow_macros ?? false,
            customLegendItems: (p.custom_legend_items as unknown as LegendItem[]) || DEFAULT_LEGEND_ITEMS,
            displayOrder: p.display_order ?? 0,
          });
        }

        setProjects(loadedProjects);
        if (loadedProjects.length > 0) {
          setCurrentProjectId(loadedProjects[0].id);
        }
      } catch (error) {
        console.error('Error loading projects:', error);
      }
      setIsLoading(false);
    };

    loadProjects();
  }, []);

  const setCurrentProject = useCallback((projectId: string | null) => {
    setCurrentProjectId(projectId);
    setSelectedHouse(null);
    // Don't reset filters here - they are loaded from localStorage per project
  }, []);

  const addProject = useCallback(async (projectData: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete" | "legendFollowMacros" | "customLegendItems">): Promise<string> => {
    const macrosTemplate = JSON.parse(JSON.stringify(MACROS_TEMPLATE));
    
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
      })
      .select()
      .single();

    if (projectError || !newProjectData) {
      console.error('Error creating project:', projectError);
      toast.error("Erro ao criar projeto");
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
          })
          .eq('id', projectId)
          .then(({ error }) => {
            if (error) console.error('Error updating project:', error);
          });

        // Update houses in database
        const saveHousesToDb = async () => {
          // Delete existing houses
          await supabase.from('houses').delete().eq('project_id', projectId);
          
          // Insert updated houses
          if (updatedProject.houses.length > 0) {
            const housesInsert = updatedProject.houses.map(h => ({
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
    
    const houses: House[] = [];
    const housesInsert = [];
    for (let i = 1; i <= currentProject.totalHouses; i++) {
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
      housesInsert.push({
        project_id: currentProjectId,
        house_number: i,
        area: currentProject.unitSize,
        type: currentProject.projectType,
        constructor_name: currentProject.contractor,
        expected_date: currentProject.expectedEndDate,
        macros: macrosToJson(house.macros),
      });
    }
    
    // Delete existing and insert new houses
    await supabase.from('houses').delete().eq('project_id', currentProjectId);
    if (housesInsert.length > 0) {
      await supabase.from('houses').insert(housesInsert);
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

  // Sync macros to houses helper - now also persists to database
  const syncMacrosToHouses = useCallback(async (newTemplate: Macro[]) => {
    if (!currentProjectId) return;
    
    let updatedHousesForDb: { houseId: number; macros: Macro[] }[] = [];
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => {
        const updatedMacros = newTemplate.map(templateMacro => {
          const existingMacro = house.macros.find(m => m.id === templateMacro.id);
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
        
        updatedHousesForDb.push({ houseId: house.id, macros: updatedMacros });
        return { ...house, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
      
      return { ...p, houses: updatedHouses, macrosTemplate: newTemplate };
    }));

    // Persist houses macros to database
    for (const house of updatedHousesForDb) {
      await supabase
        .from('houses')
        .update({ macros: macrosToJson(house.macros), last_update: new Date().toISOString().split('T')[0] })
        .eq('project_id', currentProjectId)
        .eq('house_number', house.houseId);
    }

    if (selectedHouse) {
      const updatedMacros = newTemplate.map(templateMacro => {
        const existingMacro = selectedHouse.macros.find(m => m.id === templateMacro.id);
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
      setSelectedHouse(prev => prev ? { ...prev, macros: updatedMacros } : null);
    }
  }, [currentProjectId, selectedHouse]);

  // Macro management - with proper await for database persistence
  const addMacro = useCallback(async (name: string) => {
    if (!currentProject) return;
    
    // Get next available color
    const usedColors = currentProject.macrosTemplate.map(m => m.color);
    const availableColor = DEFAULT_MACRO_COLORS.find(c => !usedColors.includes(c)) || DEFAULT_MACRO_COLORS[0];
    
    const newMacro: Macro = {
      id: `macro_${Date.now()}`,
      name,
      color: availableColor,
      scopes: [],
    };
    
    const newTemplate = [...currentProject.macrosTemplate, newMacro];
    
    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error adding macro:', error);
      toast.error("Erro ao adicionar etapa");
      return;
    }

    // Then sync to houses (which also persists)
    await syncMacrosToHouses(newTemplate);
    toast.success("Etapa adicionada!");
  }, [currentProject, syncMacrosToHouses]);

  const updateMacro = useCallback(async (macroId: string, name: string, color?: string) => {
    if (!currentProject) return;
    
    const oldMacro = currentProject.macrosTemplate.find(m => m.id === macroId);
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId ? { ...m, name, ...(color !== undefined && { color }) } : m
    );

    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error updating macro:', error);
      toast.error("Erro ao atualizar etapa");
      return;
    }

    // Propagate name/color changes to related tables
    if (oldMacro && (oldMacro.name !== name || (color !== undefined && oldMacro.color !== color))) {
      const updateData: { macro_name?: string; macro_color?: string } = {};
      if (oldMacro.name !== name) updateData.macro_name = name;
      if (color !== undefined && oldMacro.color !== color) updateData.macro_color = color;
      
      // Update weekly_productions
      await supabase
        .from('weekly_productions')
        .update(updateData)
        .eq('project_id', currentProject.id)
        .eq('macro_id', macroId);
      
      // Update planned_productions
      await supabase
        .from('planned_productions')
        .update(updateData)
        .eq('project_id', currentProject.id)
        .eq('macro_id', macroId);
      
      // Update production_deviations
      await supabase
        .from('production_deviations')
        .update({ macro_name: name })
        .eq('project_id', currentProject.id)
        .eq('macro_id', macroId);
    }

    // Then sync to houses
    await syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const deleteMacro = useCallback(async (macroId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.filter(m => m.id !== macroId);

    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error deleting macro:', error);
      toast.error("Erro ao remover etapa");
      return;
    }

    // Then sync to houses
    await syncMacrosToHouses(newTemplate);
    toast.success("Etapa removida!");
  }, [currentProject, syncMacrosToHouses]);

  // Scope management - with proper await for database persistence
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

    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error adding scope:', error);
      toast.error("Erro ao adicionar serviço");
      return;
    }

    // Then sync to houses
    await syncMacrosToHouses(newTemplate);
    toast.success("Serviço adicionado!");
  }, [currentProject, syncMacrosToHouses]);

  const updateScope = useCallback(async (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => {
    if (!currentProject) return;
    
    const macro = currentProject.macrosTemplate.find(m => m.id === macroId);
    const oldScope = macro?.scopes.find(s => s.id === scopeId);
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.map(s => s.id === scopeId ? { ...s, ...updates } : s) }
        : m
    );

    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error updating scope:', error);
      toast.error("Erro ao atualizar serviço");
      return;
    }

    // Propagate name changes to related tables
    if (oldScope && updates.name && oldScope.name !== updates.name) {
      // Update weekly_productions
      await supabase
        .from('weekly_productions')
        .update({ scope_name: updates.name })
        .eq('project_id', currentProject.id)
        .eq('scope_id', scopeId);
      
      // Update planned_productions
      await supabase
        .from('planned_productions')
        .update({ scope_name: updates.name })
        .eq('project_id', currentProject.id)
        .eq('scope_id', scopeId);
      
      // Update production_deviations
      await supabase
        .from('production_deviations')
        .update({ scope_name: updates.name })
        .eq('project_id', currentProject.id)
        .eq('scope_id', scopeId);
    }

    // Then sync to houses
    await syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const deleteScope = useCallback(async (macroId: string, scopeId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.filter(s => s.id !== scopeId) }
        : m
    );

    // Update in database first
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error deleting scope:', error);
      toast.error("Erro ao remover serviço");
      return;
    }

    // Then sync to houses
    await syncMacrosToHouses(newTemplate);
    toast.success("Serviço removido!");
  }, [currentProject, syncMacrosToHouses]);

  // Reorder macros - reorganizes the order of macros/etapas
  const reorderMacros = useCallback(async (orderedMacroIds: string[]) => {
    if (!currentProject) return;
    
    const newTemplate = orderedMacroIds
      .map(id => currentProject.macrosTemplate.find(m => m.id === id))
      .filter((m): m is Macro => m !== undefined);

    // Update in database
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error reordering macros:', error);
      toast.error("Erro ao reordenar etapas");
      return;
    }

    // Sync to houses
    await syncMacrosToHouses(newTemplate);
    toast.success("Ordem das etapas atualizada!");
  }, [currentProject, syncMacrosToHouses]);

  // Reorder scopes within a macro - reorganizes the order of scopes/services
  const reorderScopes = useCallback(async (macroId: string, orderedScopeIds: string[]) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => {
      if (m.id !== macroId) return m;
      
      const reorderedScopes = orderedScopeIds
        .map(id => m.scopes.find(s => s.id === id))
        .filter((s): s is Scope => s !== undefined);
      
      return { ...m, scopes: reorderedScopes };
    });

    // Update in database
    const { error } = await supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);

    if (error) {
      console.error('Error reordering scopes:', error);
      toast.error("Erro ao reordenar serviços");
      return;
    }

    // Sync to houses
    await syncMacrosToHouses(newTemplate);
    toast.success("Ordem dos serviços atualizada!");
  }, [currentProject, syncMacrosToHouses]);

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

      // Execute all database updates in parallel
      const updatePromises = updates.map(({ houseNumber, updatedMacros }) =>
        supabase
          .from('houses')
          .update({ 
            macros: macrosToJson(updatedMacros),
            last_update: new Date().toISOString().split('T')[0]
          })
          .eq('project_id', currentProjectId)
          .eq('house_number', houseNumber)
      );

      await Promise.all(updatePromises);

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
    }
  }, [currentProjectId, selectedHouse]);

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
        addQuadra,
        updateQuadra,
        deleteQuadra,
        generateHousesForProject,
        selectedHouse,
        setSelectedHouse,
        updateScopeProgress,
        updateBatchScopeProgress,
        updateHouseInfo,
        getHouseProgress,
        moveHouseToQuadra,
        refreshHousesFromDB,
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
