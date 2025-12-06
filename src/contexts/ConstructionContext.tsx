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
}

interface ConstructionContextType {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (projectId: string | null) => void;
  addProject: (project: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete" | "legendFollowMacros" | "customLegendItems">) => Promise<string>;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  deleteProject: (projectId: string) => void;
  completeProjectSetup: (projectId: string) => void;
  
  // Quadras (for current project)
  addQuadra: (name: string, houseIds: number[]) => void;
  updateQuadra: (quadraId: string, name: string, houseIds: number[]) => void;
  deleteQuadra: (quadraId: string) => void;
  generateHousesForProject: () => void;
  
  // Houses
  selectedHouse: House | null;
  setSelectedHouse: (house: House | null) => void;
  updateScopeProgress: (houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => void;
  updateHouseInfo: (houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => void;
  getHouseProgress: (houseId: number) => number;
  moveHouseToQuadra: (houseId: number, newQuadraId: string) => void;
  
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
  addMacro: (name: string) => void;
  updateMacro: (macroId: string, name: string, color?: string) => void;
  deleteMacro: (macroId: string) => void;
  resetProjectData: () => void;
  
  // Legend management
  updateLegendSettings: (followMacros: boolean, legendItems?: LegendItem[]) => void;
  
  // Scope management
  addScope: (macroId: string, name: string, weight: number) => void;
  updateScope: (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => void;
  deleteScope: (macroId: string, scopeId: string) => void;
  
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

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMode, setFilterMode] = useState<"status" | "macro" | "scope">("status");
  const [filterMacro, setFilterMacro] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

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
          .order('created_at', { ascending: false });

        if (projectsError) {
          console.error('Error loading projects:', projectsError);
          setIsLoading(false);
          return;
        }

        const loadedProjects: Project[] = [];

        for (const p of projectsData || []) {
          // Load quadras for this project
          const { data: quadrasData } = await supabase
            .from('quadras')
            .select('*')
            .eq('project_id', p.id);

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

          const houses: House[] = (housesData || []).map(h => ({
            id: h.house_number,
            quadra: h.quadra_id || "",
            area: h.area,
            type: h.type,
            constructorName: h.constructor_name || "",
            expectedDate: h.expected_date || "",
            lastUpdate: new Date(h.last_update).toLocaleDateString("pt-BR"),
            macros: jsonToMacros(h.macros),
          }));

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
            macrosTemplate: jsonToMacros(p.macros_template),
            createdAt: p.created_at,
            setupComplete: p.setup_complete,
            legendFollowMacros: p.legend_follow_macros ?? false,
            customLegendItems: (p.custom_legend_items as unknown as LegendItem[]) || DEFAULT_LEGEND_ITEMS,
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
    setFilterQuadra("all");
    setFilterStatus("all");
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
    
    const { data: quadraData, error } = await supabase
      .from('quadras')
      .insert({
        project_id: currentProjectId,
        name,
        house_ids: houseIds,
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

  // Sync macros to houses helper
  const syncMacrosToHouses = useCallback((newTemplate: Macro[]) => {
    if (!currentProjectId) return;
    
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
        return { ...house, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
      
      return { ...p, houses: updatedHouses, macrosTemplate: newTemplate };
    }));

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

  // Macro management
  const addMacro = useCallback((name: string) => {
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
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  const updateMacro = useCallback((macroId: string, name: string, color?: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId ? { ...m, name, ...(color !== undefined && { color }) } : m
    );
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  const deleteMacro = useCallback((macroId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.filter(m => m.id !== macroId);
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  // Scope management
  const addScope = useCallback((macroId: string, name: string, weight: number) => {
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
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  const updateScope = useCallback((macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.map(s => s.id === scopeId ? { ...s, ...updates } : s) }
        : m
    );
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  const deleteScope = useCallback((macroId: string, scopeId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.filter(s => s.id !== scopeId) }
        : m
    );
    syncMacrosToHouses(newTemplate);

    // Update in database
    supabase
      .from('projects')
      .update({ macros_template: macrosToJson(newTemplate) })
      .eq('id', currentProject.id);
  }, [currentProject, syncMacrosToHouses]);

  // House updates
  const updateScopeProgress = useCallback(async (houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => {
    if (!currentProjectId) return;

    // Update local state first for immediate UI response
    setProjects(prev => {
      const newProjects = prev.map(p => {
        if (p.id !== currentProjectId) return p;
        
        const updatedHouses = p.houses.map(house => {
          if (house.id !== houseId) return house;
          
          const updatedMacros = house.macros.map(macro => {
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
          
          return { ...house, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
        });
        
        return { ...p, houses: updatedHouses };
      });

      // Update database asynchronously
      const updatedProject = newProjects.find(p => p.id === currentProjectId);
      if (updatedProject) {
        const updatedHouse = updatedProject.houses.find(h => h.id === houseId);
        if (updatedHouse) {
          supabase
            .from('houses')
            .update({ 
              macros: macrosToJson(updatedHouse.macros),
              last_update: new Date().toISOString().split('T')[0]
            })
            .eq('project_id', currentProjectId)
            .eq('house_number', houseId)
            .then(({ error }) => {
              if (error) console.error('Error updating house progress:', error);
            });
        }
      }
      
      return newProjects;
    });

    // Also update selected house if it's the one being modified
    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => {
        if (!prev) return null;
        const updatedMacros = prev.macros.map(macro => {
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
        return { ...prev, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
      });
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
        updateHouseInfo,
        getHouseProgress,
        moveHouseToQuadra,
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
        getDaysRemaining,
        resetProjectData,
        updateLegendSettings,
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
