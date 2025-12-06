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
        <Button variant="outline" className="gap-2 min-w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="truncate max-w-[150px]">
              {currentProject?.name || "Selecionar Obra"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setCurrentProject(project.id)}
          >
            <div className="flex flex-col">
              <span className="font-medium">{project.name}</span>
              <span className="text-xs text-muted-foreground">
                {project.totalHouses} casas • {project.location}
              </span>
            </div>
            {project.id === currentProject?.id && (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
