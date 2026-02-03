import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SystemModule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_beta: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface UseSystemModulesReturn {
  modules: SystemModule[];
  isLoading: boolean;
  error: string | null;
  updateModule: (id: string, updates: Partial<Pick<SystemModule, "is_enabled" | "is_beta">>) => Promise<boolean>;
  refetch: () => Promise<void>;
  isModuleEnabled: (moduleKey: string) => boolean;
  isModuleBeta: (moduleKey: string) => boolean;
}

export function useSystemModules(): UseSystemModulesReturn {
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchModules = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("system_modules")
        .select("*")
        .order("display_order", { ascending: true });

      if (fetchError) {
        // Check for specific error about is_system_admin
        if (fetchError.message?.includes("is_system_admin")) {
          console.warn("[useSystemModules] RLS policy issue, retrying...");
        }
        throw fetchError;
      }

      setModules(data || []);
    } catch (err: any) {
      console.error("[useSystemModules] Error fetching modules:", err);
      setError(err.message || "Erro ao carregar módulos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateModule = useCallback(async (
    id: string, 
    updates: Partial<Pick<SystemModule, "is_enabled" | "is_beta">>
  ): Promise<boolean> => {
    try {
      const { error: updateError } = await supabase
        .from("system_modules")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        throw updateError;
      }

      // Atualizar estado local
      setModules(prev => prev.map(m => 
        m.id === id ? { ...m, ...updates, updated_at: new Date().toISOString() } : m
      ));

      toast({
        title: "Módulo atualizado",
        description: "As alterações foram salvas com sucesso.",
      });

      return true;
    } catch (err: any) {
      console.error("[useSystemModules] Error updating module:", err);
      toast({
        title: "Erro ao atualizar",
        description: err.message || "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  const isModuleEnabled = useCallback((moduleKey: string): boolean => {
    const module = modules.find(m => m.key === moduleKey);
    return module?.is_enabled ?? true; // Default: enabled if not found
  }, [modules]);

  const isModuleBeta = useCallback((moduleKey: string): boolean => {
    const module = modules.find(m => m.key === moduleKey);
    return module?.is_beta ?? false;
  }, [modules]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  return {
    modules,
    isLoading,
    error,
    updateModule,
    refetch: fetchModules,
    isModuleEnabled,
    isModuleBeta,
  };
}
