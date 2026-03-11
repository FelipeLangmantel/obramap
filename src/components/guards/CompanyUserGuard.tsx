import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const { user, profile, isSystemAdmin, isLoading, mustChangePassword, company, signOut } = useAuth();

  // Debug temporário para detectar remount real
  React.useEffect(() => {
    console.log("[MOUNT] CompanyUserGuard mounted");
    return () => console.log("[UNMOUNT] CompanyUserGuard unmounted");
  }, []);

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

  // ✅ FIX: Aguardar profile E company carregarem antes de decidir
  // Se profile existe e tem company_id, mas company ainda não carregou,
  // significa que fetchUserData ainda está em andamento
  if (!profile || (profile.company_id && !company)) {
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
          <p className="text-muted-foreground mb-6">Entre em contato com o administrador.</p>
          <Button variant="outline" onClick={() => signOut()}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </div>
    );
  }

  // Usuário de empresa - acesso liberado
  return <>{children}</>;
}
