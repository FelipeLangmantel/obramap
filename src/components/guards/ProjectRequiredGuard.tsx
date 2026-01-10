import { Navigate } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProjectRequiredGuardProps {
  children: React.ReactNode;
}

/**
 * ✅ REGRAS DO GUARD:
 * - NÃO faz setState
 * - NÃO faz RPC/mutations
 * - NÃO chama setCurrentProject
 * - Apenas render children ou Navigate
 */
export function ProjectRequiredGuard({ children }: ProjectRequiredGuardProps) {
  const { currentProject, projects, isLoading } = useConstruction();
  const { isSystemAdmin, canAccessProject, isLoading: authLoading } = useAuth();

  // Show loading while checking
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Get accessible projects for non-system admins
  const accessibleProjects = isSystemAdmin
    ? projects
    : projects.filter((p) => canAccessProject(p.id));

  // No projects or no current project? Redirect to home
  if (accessibleProjects.length === 0 || !currentProject) {
    console.log("[ProjectRequiredGuard] No project available, redirecting to /");
    return <Navigate to="/" replace />;
  }

  // ✅ All good - render children (sem setState)
  return <>{children}</>;
}
