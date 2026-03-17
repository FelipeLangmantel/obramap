import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * @deprecated Use /system/dashboard instead
 * Este componente existe apenas para compatibilidade e redirecionamento
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isSystemAdmin, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    if (isSystemAdmin) {
      // Redirecionar para nova rota de sistema
      navigate("/system/dashboard", { replace: true });
    } else {
      // Não é admin, ir para área de empresa
      navigate("/dashboard", { replace: true });
    }
  }, [user, isSystemAdmin, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}