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
 * - Aguarda profile carregar para evitar flash de "Acesso Negado"
 * - Usuários sem company_id são bloqueados
 * - Usuários de empresa acessam normalmente
 */
export function CompanyUserGuard({ children }: CompanyUserGuardProps) {
  const { user, profile, isSystemAdmin, isLoading, mustChangePassword, company } = useAuth();

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
    return <Navigate to="/system/dashboard" replace />;
  }

  // ✅ FIX: Aguardar profile carregar antes de decidir
  // Evita o flash de "Acesso Negado" durante login quando
  // fetchUserData ainda não completou
  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Usuário sem empresa (edge case real - profile carregado mas sem company)
  if (!company) {
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
