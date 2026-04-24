import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectModule {
  id: string;
  project_id: string;
  module_key: string;
  is_enabled: boolean;
}

/**
 * Toggle de módulos por OBRA (project_modules).
 *
 * Camada granular acima de company_modules: permite que um admin diga
 * "esta obra específica não tem Suprimentos" mesmo que a empresa tenha o
 * módulo ativo.
 *
 * Regra de fallback: se não houver registro em project_modules para a
 * combinação (project_id, module_key), considera-se HABILITADO. Isso evita
 * quebrar projetos antigos criados antes da feature.
 */
export function useProjectModules(projectId?: string | null) {
  const [modules, setModules] = useState<ProjectModule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) {
      setModules([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_modules")
        .select("id, project_id, module_key, is_enabled")
        .eq("project_id", projectId);
      if (error) throw error;
      setModules((data || []) as ProjectModule[]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isEnabled = useCallback(
    (moduleKey: string): boolean => {
      const found = modules.find((m) => m.module_key === moduleKey);
      // fallback: sem registro = habilitado
      return found ? found.is_enabled : true;
    },
    [modules]
  );

  /**
   * Define o estado de um conjunto de módulos para a obra.
   * Faz upsert linha-a-linha para evitar conflito sem unique handler.
   */
  const setModulesForProject = useCallback(
    async (
      pid: string,
      entries: Array<{ module_key: string; is_enabled: boolean }>
    ): Promise<boolean> => {
      if (!pid || entries.length === 0) return true;
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const rows = entries.map((e) => ({
        project_id: pid,
        module_key: e.module_key,
        is_enabled: e.is_enabled,
        enabled_by: userId,
      }));
      const { error } = await supabase
        .from("project_modules")
        .upsert(rows, { onConflict: "project_id,module_key" });
      if (error) {
        console.error("[useProjectModules] upsert error:", error);
        return false;
      }
      await reload();
      return true;
    },
    [reload]
  );

  return { modules, isLoading, isEnabled, setModulesForProject, reload };
}
