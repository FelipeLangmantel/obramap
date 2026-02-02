import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSystemModules } from "@/hooks/useSystemModules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { Loader2 } from "lucide-react";

interface ModuleAccessGuardProps {
  moduleKey: string;
  children: ReactNode;
}

/**
 * Guard para bloquear acesso a módulos desativados globalmente.
 * System Admin sempre tem acesso.
 */
export function ModuleAccessGuard({ moduleKey, children }: ModuleAccessGuardProps) {
  const { isSystemAdmin, isLoading: authLoading } = useAuth();
  const { isModuleEnabled, isLoading: modulesLoading, modules } = useSystemModules();

  // Loading state
  if (authLoading || modulesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // System Admin sempre tem acesso
  if (isSystemAdmin) {
    return <>{children}</>;
  }

  // Verificar se módulo está habilitado
  // Se não encontrar o módulo, assume que está habilitado (fail-open para não bloquear acidentalmente)
  const moduleExists = modules.some(m => m.key === moduleKey);
  if (!moduleExists) {
    return <>{children}</>;
  }

  if (!isModuleEnabled(moduleKey)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-muted">
              <ShieldOff className="h-10 w-10 text-muted-foreground" />
            </div>
            <CardTitle>Módulo Desativado</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Este módulo foi desativado pelo administrador do sistema e não está disponível no momento.
            </p>
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

  return <>{children}</>;
}
