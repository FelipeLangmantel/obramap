import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CompanyModule {
  id: string;
  company_id: string;
  module_key: string;
  module_name: string;
  status: "active" | "development" | "disabled";
  description: string | null;
  expected_benefits: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemModule {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_beta: boolean;
  display_order: number;
}

interface UseCompanyModulesReturn {
  companyModules: CompanyModule[];
  systemModules: SystemModule[];
  isLoading: boolean;
  error: string | null;
  updateModuleStatus: (companyId: string, moduleKey: string, status: "active" | "development" | "disabled") => Promise<boolean>;
  refetch: () => Promise<void>;
  getModuleStatus: (companyId: string, moduleKey: string) => "active" | "development" | "disabled";
  isModuleActive: (companyId: string, moduleKey: string) => boolean;
}

export function useCompanyModules(): UseCompanyModulesReturn {
  const [companyModules, setCompanyModules] = useState<CompanyModule[]>([]);
  const [systemModules, setSystemModules] = useState<SystemModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [companyResult, systemResult] = await Promise.all([
        supabase.from("company_modules").select("*").order("module_name"),
        supabase.from("system_modules").select("*").order("display_order"),
      ]);

      if (companyResult.error) throw companyResult.error;
      if (systemResult.error) throw systemResult.error;

      setCompanyModules((companyResult.data || []) as CompanyModule[]);
      setSystemModules((systemResult.data || []) as SystemModule[]);
    } catch (err: any) {
      console.error("[useCompanyModules] Error:", err);
      setError(err.message || "Erro ao carregar módulos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateModuleStatus = useCallback(async (
    companyId: string,
    moduleKey: string,
    status: "active" | "development" | "disabled"
  ): Promise<boolean> => {
    try {
      // Check if record exists
      const existing = companyModules.find(
        m => m.company_id === companyId && m.module_key === moduleKey
      );

      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from("company_modules")
          .update({ 
            status, 
            updated_at: new Date().toISOString() 
          })
          .eq("id", existing.id);

        if (updateError) throw updateError;

        // Update local state
        setCompanyModules(prev => prev.map(m => 
          m.id === existing.id 
            ? { ...m, status, updated_at: new Date().toISOString() }
            : m
        ));
      } else {
        // Find system module for name and description
        const sysModule = systemModules.find(m => m.key === moduleKey);
        
        // Insert new record
        const { data: newModule, error: insertError } = await supabase
          .from("company_modules")
          .insert({
            company_id: companyId,
            module_key: moduleKey,
            module_name: sysModule?.name || moduleKey,
            description: sysModule?.description || null,
            status,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Update local state
        setCompanyModules(prev => [...prev, newModule as CompanyModule]);
      }

      toast.success("Status do módulo atualizado!");
      return true;
    } catch (err: any) {
      console.error("[useCompanyModules] Update error:", err);
      toast.error("Erro ao atualizar módulo: " + (err.message || "Erro desconhecido"));
      return false;
    }
  }, [companyModules, systemModules]);

  const getModuleStatus = useCallback((companyId: string, moduleKey: string): "active" | "development" | "disabled" => {
    const module = companyModules.find(
      m => m.company_id === companyId && m.module_key === moduleKey
    );
    return module?.status || "active"; // Default to active if not configured
  }, [companyModules]);

  const isModuleActive = useCallback((companyId: string, moduleKey: string): boolean => {
    const status = getModuleStatus(companyId, moduleKey);
    return status === "active" || status === "development";
  }, [getModuleStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    companyModules,
    systemModules,
    isLoading,
    error,
    updateModuleStatus,
    refetch: fetchData,
    getModuleStatus,
    isModuleActive,
  };
}
