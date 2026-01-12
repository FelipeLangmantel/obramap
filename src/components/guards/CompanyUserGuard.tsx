import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface CompanyUserGuardProps {
  children: ReactNode;
}

/**
 * Guard para rotas de usuário de empresa
 * - System Admin é redirecionado para /system/dashboard
 * - Usuários sem company_id são bloqueados
 * - Usuários de empresa acessam normalmente
 */
export function CompanyUserGuard({ children }: CompanyUserGuardProps) {
  const { user, isSystemAdmin, isLoading, mustChangePassword, company } = useAuth();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Não autenticado
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Precisa trocar senha
  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  // System Admin deve ir para área de sistema
  if (isSystemAdmin) {
    console.log("[CompanyUserGuard] System admin, redirecting to /system/dashboard");
    return <Navigate to="/system/dashboard" replace />;
  }

  // Usuário sem empresa (edge case)
  if (!company) {
    console.log("[CompanyUserGuard] User has no company, showing error");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground">Você não está vinculado a nenhuma empresa.</p>
          <p className="text-muted-foreground">Entre em contato com o administrador.</p>
        </div>
      </div>
    );
  }

  // Usuário de empresa - acesso liberado
  return <>{children}</>;
}
