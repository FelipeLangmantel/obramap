import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { House, Macro, Scope, Quadra, MACROS_TEMPLATE, QUADRAS, generateInitialHouses, calculateHouseProgress } from "@/data/constructionData";

export interface ProjectInfo {
  name: string;
  location: string;
  contractor: string;
  startDate: string;
  expectedEndDate: string;
}

interface ConstructionContextType {
  houses: House[];
  quadras: Quadra[];
  selectedHouse: House | null;
  setSelectedHouse: (house: House | null) => void;
  updateScopeProgress: (houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => void;
  updateHouseInfo: (houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => void;
  getHouseProgress: (houseId: number) => number;
  filterQuadra: string;
  setFilterQuadra: (quadra: string) => void;
  filterStatus: string;
  setFilterStatus: (status: string) => void;
  // Macro management
  macrosTemplate: Macro[];
  addMacro: (name: string) => void;
  updateMacro: (macroId: string, name: string) => void;
  deleteMacro: (macroId: string) => void;
  // Scope management
  addScope: (macroId: string, name: string, weight: number) => void;
  updateScope: (macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => void;
  deleteScope: (macroId: string, scopeId: string) => void;
  // Project info
  projectInfo: ProjectInfo;
  updateProjectInfo: (info: Partial<ProjectInfo>) => void;
  // Drag and drop
  moveHouseToQuadra: (houseId: number, newQuadraId: string) => void;
}

const ConstructionContext = createContext<ConstructionContextType | undefined>(undefined);

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [macrosTemplate, setMacrosTemplate] = useState<Macro[]>(() => 
    JSON.parse(JSON.stringify(MACROS_TEMPLATE))
  );
  const [houses, setHouses] = useState<House[]>(() => generateInitialHouses());
  const [quadras, setQuadras] = useState<Quadra[]>(() => JSON.parse(JSON.stringify(QUADRAS)));
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: "Loteamento TAPEJARA",
    location: "Tapejara - RS",
    contractor: "Construtora Principal",
    startDate: "2024-01-15",
    expectedEndDate: "2025-12-30",
  });

  const updateProjectInfo = useCallback((info: Partial<ProjectInfo>) => {
    setProjectInfo(prev => ({ ...prev, ...info }));
  }, []);

  const moveHouseToQuadra = useCallback((houseId: number, newQuadraId: string) => {
    setHouses(prev => prev.map(house => 
      house.id === houseId ? { ...house, quadra: newQuadraId, lastUpdate: new Date().toLocaleDateString("pt-BR") } : house
    ));

    setQuadras(prev => {
      const newQuadras = prev.map(quadra => ({
        ...quadra,
        houses: quadra.houses.filter(id => id !== houseId)
      }));
      
      return newQuadras.map(quadra => 
        quadra.id === newQuadraId 
          ? { ...quadra, houses: [...quadra.houses, houseId].sort((a, b) => a - b) }
          : quadra
      );
    });

    if (selectedHouse?.id === houseId) {
      setSelectedHouse(prev => prev ? { ...prev, quadra: newQuadraId } : null);
    }
  }, [selectedHouse]);

  // Helper to sync changes to all houses
  const syncMacrosToHouses = useCallback((newTemplate: Macro[]) => {
    setHouses(prev => prev.map(house => {
      const updatedMacros = newTemplate.map(templateMacro => {
        const existingMacro = house.macros.find(m => m.id === templateMacro.id);
        if (existingMacro) {
          // Keep existing progress data, update structure
          const updatedScopes = templateMacro.scopes.map(templateScope => {
            const existingScope = existingMacro.scopes.find(s => s.id === templateScope.id);
            return existingScope ? { ...templateScope, progress: existingScope.progress, startDate: existingScope.startDate, endDate: existingScope.endDate } : { ...templateScope };
          });
          return { ...templateMacro, scopes: updatedScopes };
        }
        // New macro - add with zero progress
        return { ...templateMacro, scopes: templateMacro.scopes.map(s => ({ ...s, progress: 0, startDate: null, endDate: null })) };
      });
      return { ...house, macros: updatedMacros, lastUpdate: new Date().toLocaleDateString("pt-BR") };
    }));

    // Update selected house if exists
    setSelectedHouse(prev => {
      if (!prev) return null;
      const updatedMacros = newTemplate.map(templateMacro => {
        const existingMacro = prev.macros.find(m => m.id === templateMacro.id);
        if (existingMacro) {
          const updatedScopes = templateMacro.scopes.map(templateScope => {
            const existingScope = existingMacro.scopes.find(s => s.id === templateScope.id);
            return existingScope ? { ...templateScope, progress: existingScope.progress, startDate: existingScope.startDate, endDate: existingScope.endDate } : { ...templateScope };
          });
          return { ...templateMacro, scopes: updatedScopes };
        }
        return { ...templateMacro, scopes: templateMacro.scopes.map(s => ({ ...s, progress: 0, startDate: null, endDate: null })) };
      });
      return { ...prev, macros: updatedMacros };
    });
  }, []);

  // Macro management
  const addMacro = useCallback((name: string) => {
    const newMacro: Macro = {
      id: `macro_${Date.now()}`,
      name,
      scopes: [],
    };
    const newTemplate = [...macrosTemplate, newMacro];
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  const updateMacro = useCallback((macroId: string, name: string) => {
    const newTemplate = macrosTemplate.map(m => m.id === macroId ? { ...m, name } : m);
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  const deleteMacro = useCallback((macroId: string) => {
    const newTemplate = macrosTemplate.filter(m => m.id !== macroId);
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  // Scope management
  const addScope = useCallback((macroId: string, name: string, weight: number) => {
    const newScope: Scope = {
      id: `scope_${Date.now()}`,
      name,
      weight,
      progress: 0,
      startDate: null,
      endDate: null,
    };
    const newTemplate = macrosTemplate.map(m => 
      m.id === macroId ? { ...m, scopes: [...m.scopes, newScope] } : m
    );
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  const updateScope = useCallback((macroId: string, scopeId: string, updates: Partial<Pick<Scope, "name" | "weight">>) => {
    const newTemplate = macrosTemplate.map(m => 
      m.id === macroId 
        ? { ...m, scopes: m.scopes.map(s => s.id === scopeId ? { ...s, ...updates } : s) }
        : m
    );
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  const deleteScope = useCallback((macroId: string, scopeId: string) => {
    const newTemplate = macrosTemplate.map(m => 
      m.id === macroId ? { ...m, scopes: m.scopes.filter(s => s.id !== scopeId) } : m
    );
    setMacrosTemplate(newTemplate);
    syncMacrosToHouses(newTemplate);
  }, [macrosTemplate, syncMacrosToHouses]);

  const updateScopeProgress = useCallback((houseId: number, macroId: string, scopeId: string, progress: number, startDate?: string | null, endDate?: string | null) => {
    setHouses(prev => prev.map(house => {
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
    }));
  }, [selectedHouse]);

  const updateHouseInfo = useCallback((houseId: number, updates: Partial<Pick<House, "area" | "constructorName" | "type" | "expectedDate">>) => {
    setHouses(prev => prev.map(house => {
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
    }));
  }, [selectedHouse]);

  const getHouseProgress = useCallback((houseId: number) => {
    const house = houses.find(h => h.id === houseId);
    return house ? calculateHouseProgress(house) : 0;
  }, [houses]);

  return (
    <ConstructionContext.Provider
      value={{
        houses,
        quadras,
        selectedHouse,
        setSelectedHouse,
        updateScopeProgress,
        updateHouseInfo,
        getHouseProgress,
        filterQuadra,
        setFilterQuadra,
        filterStatus,
        setFilterStatus,
        macrosTemplate,
        addMacro,
        updateMacro,
        deleteMacro,
        addScope,
        updateScope,
        deleteScope,
        projectInfo,
        updateProjectInfo,
        moveHouseToQuadra,
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
