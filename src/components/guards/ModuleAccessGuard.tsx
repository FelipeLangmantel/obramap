import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemModules } from "@/hooks/useSystemModules";
import { useProjectModules } from "@/hooks/useProjectModules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldOff, ArrowLeft, Loader2 } from "lucide-react";

interface ModuleAccessGuardProps {
  moduleKey: string;
  /**
   * Quando informado, também valida toggles por OBRA (project_modules).
   * Se o módulo estiver desabilitado para a obra, bloqueia acesso.
   */
  projectId?: string | null;
  children: ReactNode;
}

/**
 * Guard de acesso a módulos. Hierarquia de validação:
 *  1. System Admin → sempre liberado
 *  2. Módulo desabilitado globalmente (system_modules) → bloqueado
 *  3. Se projectId presente: módulo desabilitado para a obra (project_modules) → bloqueado
 *  4. Caso contrário → liberado
 */
export function ModuleAccessGuard({
  moduleKey,
  projectId,
  children,
}: ModuleAccessGuardProps) {
  const { isSystemAdmin, isLoading: authLoading } = useAuth();
  const { isModuleEnabled, isLoading: modulesLoading, modules } = useSystemModules();
  const { isEnabled: isProjectModuleEnabled, isLoading: projectModulesLoading } =
    useProjectModules(projectId ?? undefined);

  if (authLoading || modulesLoading || (projectId && projectModulesLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSystemAdmin) {
    return <>{children}</>;
  }

  // Validação 1: módulo global
  const moduleExists = modules.some((m) => m.key === moduleKey);
  if (moduleExists && !isModuleEnabled(moduleKey)) {
    return <BlockedScreen reason="system" />;
  }

  // Validação 2: módulo da OBRA (project_modules)
  if (projectId && !isProjectModuleEnabled(moduleKey)) {
    return <BlockedScreen reason="project" />;
  }

  return <>{children}</>;
}

function BlockedScreen({ reason }: { reason: "system" | "project" }) {
  const message =
    reason === "project"
      ? "Este módulo não está habilitado para esta obra. Solicite ao administrador da empresa para ativá-lo no vínculo da obra."
      : "Este módulo foi desativado pelo administrador do sistema e não está disponível no momento.";
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-4 rounded-full bg-muted">
            <ShieldOff className="h-10 w-10 text-muted-foreground" />
          </div>
          <CardTitle>
            {reason === "project" ? "Módulo Indisponível na Obra" : "Módulo Desativado"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message}</p>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
