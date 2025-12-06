import { useEffect, useCallback } from "react";

const GLOBAL_FILTERS_KEY = "obramap_global_filters";

interface FilterState {
  filterQuadra: string;
  filterStatus: string;
  filterMode: "status" | "macro" | "scope";
  filterMacro: string;
  filterScope: string;
}

export function useFilterPersistence(
  projectId: string | null,
  filterState: FilterState,
  setters: {
    setFilterQuadra: (v: string) => void;
    setFilterStatus: (v: string) => void;
    setFilterMode: (v: "status" | "macro" | "scope") => void;
    setFilterMacro: (v: string) => void;
    setFilterScope: (v: string) => void;
  }
) {
  // Load filters when project changes
  useEffect(() => {
    if (!projectId) return;
    
    const savedFilters = localStorage.getItem(`${GLOBAL_FILTERS_KEY}_${projectId}`);
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters) as FilterState;
        if (filters.filterQuadra) setters.setFilterQuadra(filters.filterQuadra);
        if (filters.filterStatus) setters.setFilterStatus(filters.filterStatus);
        if (filters.filterMode) setters.setFilterMode(filters.filterMode);
        if (filters.filterMacro) setters.setFilterMacro(filters.filterMacro);
        if (filters.filterScope) setters.setFilterScope(filters.filterScope);
      } catch (e) {
        console.error("Error loading filters:", e);
      }
    }
  }, [projectId]); // Only run when project changes

  // Save filters when they change
  useEffect(() => {
    if (!projectId) return;
    
    const filters: FilterState = {
      filterQuadra: filterState.filterQuadra,
      filterStatus: filterState.filterStatus,
      filterMode: filterState.filterMode,
      filterMacro: filterState.filterMacro,
      filterScope: filterState.filterScope,
    };
    
    localStorage.setItem(`${GLOBAL_FILTERS_KEY}_${projectId}`, JSON.stringify(filters));
  }, [
    projectId,
    filterState.filterQuadra,
    filterState.filterStatus,
    filterState.filterMode,
    filterState.filterMacro,
    filterState.filterScope,
  ]);
}

// Generic filter persistence hook for any component
export function useGenericFilterPersistence<T extends Record<string, unknown>>(
  storageKey: string,
  projectId: string | null,
  filters: T,
  setFilters: (key: keyof T, value: T[keyof T]) => void
) {
  // Load on mount
  useEffect(() => {
    if (!projectId) return;
    
    const saved = localStorage.getItem(`${storageKey}_${projectId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as T;
        Object.keys(parsed).forEach((key) => {
          if (parsed[key as keyof T] !== undefined) {
            setFilters(key as keyof T, parsed[key as keyof T]);
          }
        });
      } catch (e) {
        console.error("Error loading filters:", e);
      }
    }
  }, [projectId, storageKey]);

  // Save on change
  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(`${storageKey}_${projectId}`, JSON.stringify(filters));
  }, [projectId, storageKey, filters]);
}
