import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProjectRequiredGuardProps {
  children: React.ReactNode;
}

/**
 * Route guard that ensures a project is selected before accessing protected modules.
 * Redirects to home page if no project is available.
 */
export function ProjectRequiredGuard({ children }: ProjectRequiredGuardProps) {
  const { currentProject, projects, isLoading } = useConstruction();
  const { isSystemAdmin, canAccessProject } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Get accessible projects for non-system admins
  const accessibleProjects = isSystemAdmin
    ? projects
    : projects.filter((p) => canAccessProject(p.id));

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) return;

    // If no projects exist or accessible, redirect to home to create one
    if (accessibleProjects.length === 0) {
      console.warn("[ProjectRequiredGuard] No accessible projects, redirecting to home");
      navigate("/", { replace: true });
      return;
    }

    // If no current project but there are accessible projects, 
    // the ConstructionContext should auto-select one
    if (!currentProject) {
      console.warn("[ProjectRequiredGuard] No current project selected, redirecting to home");
      navigate("/", { replace: true });
    }
  }, [isLoading, currentProject, accessibleProjects.length, navigate, location.pathname]);

  // Show loading while checking
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children if no project
  if (!currentProject) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
