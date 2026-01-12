import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface SystemAdminGuardProps {
  children: ReactNode;
}

/**
 * Guard para rotas /system/*
 * - Permite acesso APENAS para isSystemAdmin === true
 * - NÃO exige company_id
 * - Redireciona não-admins para /
 */
export function SystemAdminGuard({ children }: SystemAdminGuardProps) {
  const { user, isSystemAdmin, isLoading, mustChangePassword } = useAuth();

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

  // Não é System Admin
  if (!isSystemAdmin) {
    console.log("[SystemAdminGuard] User is not system admin, redirecting to /");
    return <Navigate to="/" replace />;
  }

  // System Admin - acesso liberado
  return <>{children}</>;
}
