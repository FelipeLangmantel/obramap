import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SystemSetupWizard, OrphanDataCounts } from "@/components/setup/SystemSetupWizard";
import { Loader2 } from "lucide-react";

// ✅ BLOQUEIO DE SETUP REMOVIDO
// O setup_step é mantido apenas para exibição informativa
// Nenhuma rota é bloqueada baseada em etapas não concluídas

const RPC_TIMEOUT_MS = 12000;
const SETUP_CACHE_KEY = "obramap_system_setup_checked";

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

interface SetupFlowGuardProps {
  children: React.ReactNode;
}

/**
 * ✅ GUARD CENTRAL ÚNICO
 * Controla TODO o acesso baseado em:
 * 1. Verificação inicial do sistema (admin existe?)
 * 2. Autenticação
 * 3. Projeto selecionado
 * 4. Etapa de setup do projeto
 * 
 * NÃO usa useEffect com navigate - apenas renderiza:
 * - Loading
 * - Wizard de setup inicial
 * - Navigate para redirect
 * - Children para acesso liberado
 */
export function SetupFlowGuard({ children }: SetupFlowGuardProps) {
  const { user, isSystemAdmin, isLoading: authLoading } = useAuth();
  const { currentProject, projects, isLoading: projectsLoading } = useConstruction();
  const location = useLocation();

  useEffect(() => {
    console.log("[MOUNT] SetupFlowGuard mounted");
    return () => console.log("[UNMOUNT] SetupFlowGuard unmounted");
  }, []);

  // ✅ Estado para verificação inicial do sistema
  const [systemCheckComplete, setSystemCheckComplete] = useState(false);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [hasOrphanData, setHasOrphanData] = useState(false);
  const [orphanCounts, setOrphanCounts] = useState<OrphanDataCounts | null>(null);

  // ✅ Refs para controlar execução única
  const checkingRef = useRef(false);
  const checkedRef = useRef(false);

  // ✅ Verificação inicial do sistema (roda apenas uma vez)
  const checkSystemStatus = useCallback(async () => {
    if (checkingRef.current || checkedRef.current) return;
    
    // Verificar cache primeiro
    const cacheKey = `${user?.id ?? "anon"}|${isSystemAdmin ? "sys" : "nosys"}`;
    if (sessionStorage.getItem(SETUP_CACHE_KEY) === cacheKey) {
      console.log("[SETUP GUARD] Cache hit, skipping system check");
      checkedRef.current = true;
      setSystemCheckComplete(true);
      return;
    }

    checkingRef.current = true;
    console.log("[SETUP GUARD] Starting system check for:", cacheKey);

    try {
      // Verificar se admin existe
      const { data: adminExists, error: adminError } = await withTimeout(
        supabase.rpc("admin_exists"),
        RPC_TIMEOUT_MS
      );

      if (adminError) {
        console.error("[SETUP GUARD] Error checking admin:", adminError);
        // Fail-open para não bloquear o app
        setSystemCheckComplete(true);
        return;
      }

      // Se não existe admin, precisa de setup inicial
      if (!adminExists) {
        console.log("[SETUP GUARD] No admin exists, showing setup wizard");
        
        // Verificar dados órfãos para o wizard
        try {
          const { data: orphanData } = await withTimeout(
            supabase.rpc("get_orphan_data_counts"),
            RPC_TIMEOUT_MS
          );
          
          if (orphanData) {
            const counts = orphanData as unknown as OrphanDataCounts;
            setOrphanCounts(counts);
            setHasOrphanData(counts.has_orphan_data);
          }
        } catch (e) {
          console.error("[SETUP GUARD] Error checking orphan data:", e);
        }

        setNeedsInitialSetup(true);
        setSystemCheckComplete(true);
        return;
      }

      // Admin existe, sistema está configurado
      sessionStorage.setItem(SETUP_CACHE_KEY, cacheKey);
      setSystemCheckComplete(true);
    } catch (error) {
      console.error("[SETUP GUARD] System check error:", error);
      // Fail-open
      setSystemCheckComplete(true);
    } finally {
      checkingRef.current = false;
      checkedRef.current = true;
    }
  }, [user?.id, isSystemAdmin]);

  // ✅ Executar verificação quando auth estiver pronta
  useEffect(() => {
    if (authLoading) return;
    checkSystemStatus();
  }, [authLoading, checkSystemStatus]);

  // ✅ Handler para quando o wizard de setup terminar
  const handleSetupComplete = () => {
    setNeedsInitialSetup(false);
    window.location.href = "/auth";
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER LOGIC - Sem navegação em cascata, apenas renderiza o estado correto
  // ═══════════════════════════════════════════════════════════════════════════

  // ✅ 1. Carregando auth ou verificação inicial
  if (authLoading || !systemCheckComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando sistema...</p>
        </div>
      </div>
    );
  }

  // ✅ 2. Precisa de setup inicial (primeiro uso)
  if (needsInitialSetup) {
    return (
      <SystemSetupWizard
        onComplete={handleSetupComplete}
        needsAdmin={true}
        hasOrphanData={hasOrphanData}
        orphanCounts={orphanCounts}
      />
    );
  }

  // ✅ 3. Não autenticado -> redirect para /auth
  if (!user) {
    console.log("[SETUP GUARD] No user, redirecting to /auth");
    return <Navigate to="/auth" replace />;
  }

  // ✅ 4. System admin tem acesso total (ANTES de verificar projetos)
  // System admin ignora completamente o fluxo de setup de obra
  if (isSystemAdmin) {
    console.log("[SETUP GUARD] System admin, granting full access (bypassing project checks)");
    return <>{children}</>;
  }

  // ✅ 5. Rotas admin requerem apenas autenticação (não precisa de projeto)
  if (location.pathname.startsWith("/admin")) {
    console.log("[SETUP GUARD] Admin route, granting access");
    return <>{children}</>;
  }

  // ✅ 6. Carregando projetos (apenas para usuários normais em rotas não-admin)
  if (projectsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando projetos...</p>
        </div>
      </div>
    );
  }

  // ✅ 7. NAVEGAÇÃO LIVRE - Não bloqueia por falta de projetos
  // O usuário pode acessar qualquer rota livremente
  if (projects.length === 0) {
    console.log("[SETUP GUARD] No projects, but allowing free navigation");
  }

  if (!currentProject && location.pathname !== "/") {
    console.log("[SETUP GUARD] No current project, but allowing free navigation");
  }

  // ✅ 9. BLOQUEIO DE ROTA REMOVIDO - Navegação livre
  // O setup_step é mantido apenas para exibição informativa
  console.log(`[SETUP GUARD] Free navigation enabled - no route blocking based on setup_step`);

  // ✅ 10. Tudo OK, renderiza children
  return <>{children}</>;
}
