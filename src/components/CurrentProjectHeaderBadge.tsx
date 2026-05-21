import { Building2, Home } from "lucide-react";

import { useConstruction } from "@/contexts/ConstructionContext";
import { cn } from "@/lib/utils";

interface CurrentProjectHeaderBadgeProps {
  className?: string;
}

export function CurrentProjectHeaderBadge({ className }: CurrentProjectHeaderBadgeProps) {
  const { currentProject } = useConstruction();

  if (!currentProject) return null;

  const housesCount = currentProject.totalHouses || currentProject.houses?.length || 0;
  const details = [
    currentProject.location,
    housesCount > 0 ? `${housesCount} casas` : null,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs shadow-sm",
        className,
      )}
      title={currentProject.name}
    >
      <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
          Obra atual
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="max-w-[220px] truncate font-semibold text-foreground sm:max-w-[320px]">
            {currentProject.name}
          </span>
          {details.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Home className="h-3 w-3" />
              {details.join(" - ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
