import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConstruction } from "@/contexts/ConstructionContext";

export function ProjectSelector() {
  const { projects, currentProject, setCurrentProject } = useConstruction();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 min-w-[140px] max-w-[180px] justify-between h-7 text-[11px] px-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {currentProject?.name || "Selecionar"}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px] z-50">
        {projects.map((project) => (
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
