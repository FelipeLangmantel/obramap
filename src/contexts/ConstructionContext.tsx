import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { House, generateInitialHouses, calculateHouseProgress } from "@/data/constructionData";

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
}

const ConstructionContext = createContext<ConstructionContextType | undefined>(undefined);

export function ConstructionProvider({ children }: { children: ReactNode }) {
  const [houses, setHouses] = useState<House[]>(() => generateInitialHouses());
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [filterQuadra, setFilterQuadra] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
