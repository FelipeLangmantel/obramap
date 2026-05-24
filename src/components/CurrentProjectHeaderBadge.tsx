import { useMemo, useState } from "react";
import { Building2, Check, ChevronsUpDown, Home, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { cn } from "@/lib/utils";

interface CurrentProjectHeaderBadgeProps {
  className?: string;
}

const normalizeText = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getProjectLocation = (project: { municipio?: string | null; estado?: string | null; location?: string | null }) => {
  const city = project.municipio?.trim();
  const state = project.estado?.trim();
  if (city && state) return `${city} - ${state}`;
  return city || project.location?.trim() || "";
};

const formatProjectDisplayName = (project: {
  name: string;
  location?: string | null;
  municipio?: string | null;
  estado?: string | null;
  totalHouses?: number | null;
  houses?: unknown[] | null;
}) => {
  const name = project.name?.trim() || "Obra sem nome";
  const units = Number(project.totalHouses) || project.houses?.length || 0;
  return units > 0 ? `${name} - ${units} U.H.` : name;
};

export function CurrentProjectHeaderBadge({ className }: CurrentProjectHeaderBadgeProps) {
  const { projects, currentProject, setCurrentProject } = useConstruction();
  const { canAccessProject } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const accessibleProjects = useMemo(
    () => projects.filter((project) => canAccessProject(project.id)),
    [canAccessProject, projects],
  );
  const filteredProjects = useMemo(() => {
    const term = normalizeText(search);
    if (!term) return accessibleProjects;
    return accessibleProjects.filter((project) => {
      const haystack = normalizeText(`${project.name} ${getProjectLocation(project)} ${project.totalHouses || ""}`);
      return haystack.includes(term);
    });
  }, [accessibleProjects, search]);

  const handleSelectProject = (projectId: string) => {
    setCurrentProject(projectId);
    setOpen(false);
    setSearch("");
  };

  if (!currentProject) return null;

  const displayName = formatProjectDisplayName(currentProject);
  const location = getProjectLocation(currentProject);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-auto min-w-0 max-w-full justify-start gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-left text-xs shadow-sm hover:bg-primary/15",
            className,
          )}
          title={[currentProject.name, location].filter(Boolean).join(" - ")}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
              Obra atual
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="max-w-[240px] truncate font-semibold text-foreground sm:max-w-[360px]">
                {displayName}
              </span>
              {location && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Home className="h-3 w-3" />
                  {location}
                </span>
              )}
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar obra"
              className="pl-8"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[340px]">
          {filteredProjects.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma obra disponível.
            </div>
          ) : (
            filteredProjects.map((project) => {
              const projectLocation = getProjectLocation(project);
              const projectUnits = Number(project.totalHouses) || project.houses?.length || 0;
              const selected = project.id === currentProject.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 border-b px-3 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60",
                    selected && "bg-primary/5",
                  )}
                  onClick={() => handleSelectProject(project.id)}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {selected ? <Check className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{formatProjectDisplayName(project)}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      {projectLocation && <span>{projectLocation}</span>}
                      {projectUnits > 0 && <Badge variant="outline">{projectUnits} U.H.</Badge>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
