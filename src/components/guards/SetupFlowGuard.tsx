import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { SystemSetupWizard, OrphanDataCounts } from "@/components/setup/SystemSetupWizard";
import { Loader2 } from "lucide-react";

type ProjectSetupStep =
  | "project_created"
  | "blocks_configured"
  | "services_defined"
  | "budget_defined"
  | "contract_defined"
  | "long_term_planned";

// Ordem hierárquica das etapas
const STEP_ORDER: ProjectSetupStep[] = [
  "project_created",
  "blocks_configured",
  "services_defined",
  "budget_defined",
  "contract_defined",
  "long_term_planned",
];

// Mapeamento de rotas para etapa mínima necessária
// IMPORTANTE: Rotas não listadas aqui são acessíveis livremente
const ROUTE_REQUIREMENTS: Record<string, ProjectSetupStep> = {
  "/project-contract": "budget_defined",
  "/long-term-planning": "contract_defined",
  "/measurement-planning": "long_term_planned",
};

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

  // ✅ 7. Se não tem projetos disponíveis
  if (projects.length === 0) {
    if (location.pathname === "/") {
      return <>{children}</>;
    }
    console.log("[SETUP GUARD] No projects, redirecting to /");
    return <Navigate to="/" replace />;
  }

  // ✅ 8. Se não tem projeto selecionado
  if (!currentProject) {
    if (location.pathname === "/") {
      return <>{children}</>;
    }
    console.log("[SETUP GUARD] No current project, redirecting to /");
    return <Navigate to="/" replace />;
  }

  // ✅ 9. Verificar requisitos de rota baseado no setup_step
  const currentStep = currentProject.setupStep || "project_created";
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const requiredStep = ROUTE_REQUIREMENTS[location.pathname];

  if (requiredStep) {
    const requiredIndex = STEP_ORDER.indexOf(requiredStep);

    if (currentStepIndex < requiredIndex) {
      // ✅ Para rotas que precisam mostrar alerta de bloqueio ao invés de redirecionar
      // Isso evita que o usuário seja redirecionado para o mapa sem entender o motivo
      const routesWithInPageAlert = ["/project-contract", "/long-term-planning", "/measurement-planning"];
      
      if (routesWithInPageAlert.includes(location.pathname)) {
        console.log(`[SETUP GUARD] Route ${location.pathname} blocked (needs ${requiredStep}, current ${currentStep}) -> rendering page to show blocked message`);
        return <>{children}</>;
      }

      // Para outras rotas, mantém o redirect seguro
      console.log(`[SETUP GUARD] Route ${location.pathname} requires ${requiredStep}, current is ${currentStep}, redirecting to /`);
      return <Navigate to="/" replace />;
    }
  }

  // ✅ 10. Tudo OK, renderiza children
  return <>{children}</>;
}
