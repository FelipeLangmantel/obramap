import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";

export function ProjectSelector() {
  const { projects, currentProject, setCurrentProject } = useConstruction();
  const { canAccessProject } = useAuth();

  // Filter projects based on user permissions
  const accessibleProjects = projects.filter(project => canAccessProject(project.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[120px] max-w-[180px] justify-between h-8 text-xs px-2 md:px-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[80px] md:max-w-[120px]">
              {currentProject?.name || "Selecionar"}
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px] z-50 max-h-[60vh] overflow-y-auto">
        {accessibleProjects.length === 0 ? (
          <div className="py-4 px-3 text-center text-sm text-muted-foreground">
            Nenhum projeto disponível
          </div>
        ) : (
          accessibleProjects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setCurrentProject(project.id)}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-sm truncate">{project.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {project.totalHouses} casas • {project.location}
                </span>
              </div>
              {project.id === currentProject?.id && (
                <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
