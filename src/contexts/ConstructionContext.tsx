import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { House, Macro, Scope, MACROS_TEMPLATE, generateInitialHouses, calculateHouseProgress } from "@/data/constructionData";

interface ConstructionContextType {
  houses: House[];
  selectedHouse: House | null;
  setSelectedHouse: (house: House | null) => void;
  updateScopeProgress: (houseId: number, macroId: string, scopeId: string, progress: number) => void;
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
}

const ConstructionContext = createContext<ConstructionContextType | undefined>(undefined);

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [macrosTemplate, setMacrosTemplate] = useState<Macro[]>(() => 
    JSON.parse(JSON.stringify(MACROS_TEMPLATE))
  );
  const [houses, setHouses] = useState<House[]>(() => generateInitialHouses());
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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

  const updateScopeProgress = useCallback((houseId: number, macroId: string, scopeId: string, progress: number) => {
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
            startDate: scope.startDate || (progress > 0 ? now : null),
            endDate: progress === 100 ? now : null,
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
