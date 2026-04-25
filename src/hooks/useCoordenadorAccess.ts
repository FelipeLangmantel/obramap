import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Determina se o usuário pode atuar como coordenador/admin sobre uma obra.
 *
 * Regras:
 *  - system_admin / admin / coordenador (papel global) → sempre true.
 *  - Qualquer usuário designado em projects.coordenador_user_id da obra → true.
 *  - Demais (engenheiro, viewer, editor) → false.
 *
 * Use para liberar:
 *  - Aprovação de RDO
 *  - Edição/correção/regressão de percentuais sem justificativa
 *  - Painel de revisão de produção
 *  - Aprovação de exclusões
 */
export function useCoordenadorAccess(projectId?: string | null) {
  const { profile, user } = useAuth();
  const [obraCoordenadorId, setObraCoordenadorId] = useState<string | null>(null);

  const globalCoordOrAdmin =
    profile?.system_role === "system_admin" ||
    profile?.system_role === "admin" ||
    (profile?.system_role as string) === "coordenador";

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setObraCoordenadorId(null);
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("projects")
        .select("coordenador_user_id")
        .eq("id", projectId)
        .maybeSingle();
      if (!cancelled) setObraCoordenadorId(data?.coordenador_user_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isObraCoordenador = !!user?.id && !!obraCoordenadorId && obraCoordenadorId === user.id;
  const canApprove = globalCoordOrAdmin || isObraCoordenador;
  const isAdmin = globalCoordOrAdmin; // mantém semântica antiga para componentes que separam admin/coord

  return {
    canApprove,
    isAdmin,
    isObraCoordenador,
    isGlobalCoordenadorOrAdmin: globalCoordOrAdmin,
  };
}
