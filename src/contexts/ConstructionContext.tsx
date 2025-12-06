import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { House, Macro, Scope, Quadra, MACROS_TEMPLATE, calculateHouseProgress } from "@/data/constructionData";

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
}

interface ConstructionContextType {
  // Projects
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (projectId: string | null) => void;
  addProject: (project: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete">) => string;
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
  
  // Macro management
  addMacro: (name: string) => void;
  updateMacro: (macroId: string, name: string) => void;
  deleteMacro: (macroId: string) => void;
  
  // Scope management
  addScope: (macroId: string, name: string, weight: number) => void;
  updateScope: (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => void;
  deleteScope: (macroId: string, scopeId: string) => void;
  
  // Time calculations
  getDaysRemaining: () => number;
}

const ConstructionContext = createContext<ConstructionContextType | undefined>(undefined);

const DEFAULT_PROJECT: Project = {
  id: "default",
  name: "Loteamento TAPEJARA",
  location: "Tapejara - RS",
  contractor: "Construtora Principal",
  startDate: "2024-01-15",
  expectedEndDate: "2025-12-30",
  totalHouses: 123,
  unitSize: 45,
  projectType: "Residencial Popular",
  houses: [],
  quadras: [],
  macrosTemplate: JSON.parse(JSON.stringify(MACROS_TEMPLATE)),
  createdAt: new Date().toISOString(),
  setupComplete: true,
};

// Generate initial houses for default project
function generateDefaultHouses(): House[] {
  const quadras: Quadra[] = [
    { id: "A", name: "Quadra A", houses: [1, 2, 3, 4, 5, 6] },
    { id: "B", name: "Quadra B", houses: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27] },
    { id: "C", name: "Quadra C", houses: [28, 29, 30, 31, 32, 33, 34, 35] },
    { id: "D", name: "Quadra D", houses: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
    { id: "E", name: "Quadra E", houses: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57] },
    { id: "F", name: "Quadra F", houses: [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
    { id: "G", name: "Quadra G", houses: [75, 76, 77, 78, 79, 80, 81, 82] },
    { id: "H", name: "Quadra H", houses: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102] },
    { id: "I", name: "Quadra I", houses: [103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123] },
  ];
  
  const constructors = ["Construtora Alpha", "Engenharia Beta", "Construções Delta", "Edificações Gama"];
  const houses: House[] = [];
  
  quadras.forEach(quadra => {
    quadra.houses.forEach(houseNum => {
      houses.push({
        id: houseNum,
        quadra: quadra.id,
        area: 45,
        type: "Residencial",
        constructorName: constructors[Math.floor(Math.random() * constructors.length)],
        expectedDate: "29/06/2025",
        lastUpdate: new Date().toLocaleDateString("pt-BR"),
        macros: MACROS_TEMPLATE.map(macro => ({
          ...macro,
          scopes: macro.scopes.map(scope => ({
            ...scope,
            progress: Math.floor(Math.random() * 100),
            startDate: Math.random() > 0.3 ? "2024-06-15" : null,
            endDate: null,
          })),
        })),
      });
    });
  });
  
  return houses;
}

function generateDefaultQuadras(): Quadra[] {
  return [
    { id: "A", name: "Quadra A", houses: [1, 2, 3, 4, 5, 6] },
    { id: "B", name: "Quadra B", houses: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27] },
    { id: "C", name: "Quadra C", houses: [28, 29, 30, 31, 32, 33, 34, 35] },
    { id: "D", name: "Quadra D", houses: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
    { id: "E", name: "Quadra E", houses: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57] },
    { id: "F", name: "Quadra F", houses: [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74] },
    { id: "G", name: "Quadra G", houses: [75, 76, 77, 78, 79, 80, 81, 82] },
    { id: "H", name: "Quadra H", houses: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102] },
    { id: "I", name: "Quadra I", houses: [103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123] },
  ];
}

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(() => {
    const defaultWithData = {
      ...DEFAULT_PROJECT,
      houses: generateDefaultHouses(),
      quadras: generateDefaultQuadras(),
    };
    return [defaultWithData];
  });
  
  const [currentProjectId, setCurrentProjectId] = useState<string | null>("default");
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  const setCurrentProject = useCallback((projectId: string | null) => {
    setCurrentProjectId(projectId);
    setSelectedHouse(null);
    setFilterQuadra("all");
    setFilterStatus("all");
  }, []);

  const addProject = useCallback((projectData: Omit<Project, "id" | "houses" | "quadras" | "macrosTemplate" | "createdAt" | "setupComplete">) => {
    const newId = `project_${Date.now()}`;
    const newProject: Project = {
      ...projectData,
      id: newId,
      houses: [],
      quadras: [],
      macrosTemplate: JSON.parse(JSON.stringify(MACROS_TEMPLATE)),
      createdAt: new Date().toISOString(),
      setupComplete: false,
    };
    setProjects(prev => [...prev, newProject]);
    setCurrentProjectId(newId);
    return newId;
  }, []);

  const updateProject = useCallback((projectId: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, ...updates } : p
    ));
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    if (currentProjectId === projectId) {
      const remaining = projects.filter(p => p.id !== projectId);
      setCurrentProjectId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [currentProjectId, projects]);

  const completeProjectSetup = useCallback((projectId: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, setupComplete: true } : p
    ));
  }, []);

  // Quadra management
  const addQuadra = useCallback((name: string, houseIds: number[]) => {
    if (!currentProjectId) return;
    
    const newQuadra: Quadra = {
      id: `quadra_${Date.now()}`,
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
  }, [currentProjectId]);

  const updateQuadra = useCallback((quadraId: string, name: string, houseIds: number[]) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
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
      
      return { ...p, quadras: updatedQuadras, houses: updatedHouses };
    }));
  }, [currentProjectId]);

  const deleteQuadra = useCallback((quadraId: string) => {
    if (!currentProjectId) return;
    
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
  }, [currentProjectId]);

  const generateHousesForProject = useCallback(() => {
    if (!currentProjectId || !currentProject) return;
    
    const houses: House[] = [];
    for (let i = 1; i <= currentProject.totalHouses; i++) {
      houses.push({
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
      });
    }
    
    setProjects(prev => prev.map(p => 
      p.id === currentProjectId ? { ...p, houses } : p
    ));
  }, [currentProjectId, currentProject]);

  const moveHouseToQuadra = useCallback((houseId: number, newQuadraId: string) => {
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

    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => prev ? { ...prev, quadra: newQuadraId } : null);
    }
  }, [currentProjectId, selectedHouse]);

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
    
    const newMacro: Macro = {
      id: `macro_${Date.now()}`,
      name,
      scopes: [],
    };
    syncMacrosToHouses([...currentProject.macrosTemplate, newMacro]);
  }, [currentProject, syncMacrosToHouses]);

  const updateMacro = useCallback((macroId: string, name: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => m.id === macroId ? { ...m, name } : m);
    syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const deleteMacro = useCallback((macroId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.filter(m => m.id !== macroId);
    syncMacrosToHouses(newTemplate);
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
      m.id === macroId ? { ...m, scopes: [...m.scopes, newScope] } : m
    );
    syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const updateScope = useCallback((macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.map(s => s.id === scopeId ? { ...s, ...updates } : s) }
        : m
    );
    syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const deleteScope = useCallback((macroId: string, scopeId: string) => {
    if (!currentProject) return;
    
    const newTemplate = currentProject.macrosTemplate.map(m => 
      m.id === macroId ? { ...m, scopes: m.scopes.filter(s => s.id !== scopeId) } : m
    );
    syncMacrosToHouses(newTemplate);
  }, [currentProject, syncMacrosToHouses]);

  const updateScopeProgress = useCallback((houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => {
        if (house.id !== houseId) return house;
        
        const updatedMacros = house.macros.map(macro => {
          if (macro.id !== macroId) return macro;
          
          const updatedScopes = macro.scopes.map(scope => {
            if (scope.id !== scopeId) return scope;
            
            const now = new Date().toLocaleDateString("pt-BR");
            return {
              ...scope,
              progress,
              startDate: startDate !== undefined ? startDate : (scope.startDate || (progress > 0 ? now : null)),
              endDate: endDate !== undefined ? endDate : (progress === 100 ? now : null),
            };
          });
          
          return { ...macro, scopes: updatedScopes };
        });
        
        const updatedHouse = { 
          ...house, 
          macros: updatedMacros,
          lastUpdate: new Date().toLocaleDateString("pt-BR"),
        };
        
        if (selectedHouse?.id === houseId) {
          setSelectedHouse(updatedHouse);
        }
        
        return updatedHouse;
      });
      
      return { ...p, houses: updatedHouses };
    }));
  }, [currentProjectId, selectedHouse]);

  const updateHouseInfo = useCallback((houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => {
      if (p.id !== currentProjectId) return p;
      
      const updatedHouses = p.houses.map(house => {
        if (house.id !== houseId) return house;
        
        const updatedHouse = { 
          ...house, 
          ...updates,
          lastUpdate: new Date().toLocaleDateString("pt-BR"),
        };
        
        if (selectedHouse?.id === houseId) {
          setSelectedHouse(updatedHouse);
        }
        
        return updatedHouse;
      });
      
      return { ...p, houses: updatedHouses };
    }));
  }, [currentProjectId, selectedHouse]);

  const getHouseProgress = useCallback((houseId: number) => {
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
        addMacro,
        updateMacro,
        deleteMacro,
        addScope,
        updateScope,
        deleteScope,
        getDaysRemaining,
      }}
    >
      {children}
    </ConstructionContext.Provider>
  );
}

export function useConstruction() {
  const context = useContext(ConstructionContext);
  if (!context) {
    throw new Error("useConstruction must be used within a ConstructionProvider");
  }
  return context;
}
