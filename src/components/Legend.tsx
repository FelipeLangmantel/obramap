import { useConstruction } from "@/contexts/ConstructionContext";

export function Legend() {
  const { currentProject } = useConstruction();
  
  // Use macros from current project, or show empty state
  const macros = currentProject?.macrosTemplate || [];
  
  if (macros.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-xl border border-border">
        <span className="text-sm font-medium text-foreground">Legenda</span>
        <span className="text-sm text-muted-foreground">Nenhuma etapa configurada</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-card rounded-xl border border-border">
      <span className="text-sm font-medium text-foreground">Legenda</span>
      {macros.map((macro) => (
        <div key={macro.id} className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: macro.color }}
          />
          <span className="text-sm text-muted-foreground">{macro.name}</span>
        </div>
      ))}
    </div>
  );
}