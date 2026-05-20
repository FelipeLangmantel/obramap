import { Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { House } from "@/data/constructionData";
import { useConstruction, DEFAULT_LEGEND_ITEMS } from "@/contexts/ConstructionContext";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ScopesListProps {
  house: House;
}

export function ScopesList({ house }: ScopesListProps) {
  const { currentProject } = useConstruction();
  const [openMacros, setOpenMacros] = useState<Set<string>>(new Set());
  
  const legendItems = currentProject?.customLegendItems ?? DEFAULT_LEGEND_ITEMS;
  const displayMacros = (currentProject?.macrosTemplate?.length ? currentProject.macrosTemplate : house.macros).map(macro => {
    const houseMacro = house.macros.find(item => item.id === macro.id);
    return {
      ...macro,
      scopes: macro.scopes.map(scope => {
        const houseScope = houseMacro?.scopes?.find(item => item.id === scope.id)
          ?? house.macros.flatMap(item => item.scopes).find(item => item.id === scope.id);
        return {
          ...scope,
          progress: Number(houseScope?.progress ?? 0),
          startDate: houseScope?.startDate ?? scope.startDate ?? null,
          endDate: houseScope?.endDate ?? scope.endDate ?? null,
        };
      }),
    };
  });

  const getMacroProgress = (macro: typeof displayMacros[0]) => {
    if (macro.scopes.length === 0) return 0;
    const totalWeight = macro.scopes.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight === 0) return 0;
    return Math.round(macro.scopes.reduce((sum, s) => sum + s.progress * s.weight, 0) / totalWeight);
  };

  const getProgressBarColor = (progress: number) => {
    for (const item of legendItems) {
      if (progress >= item.minPercent && progress <= item.maxPercent) {
        return item.color;
      }
    }
    // Fallback colors based on progress
    if (progress === 0) return "hsl(var(--muted))";
    if (progress < 50) return "#ef4444"; // Red
    if (progress < 100) return "#f59e0b"; // Yellow/Orange
    return "#22c55e"; // Green
  };

  const toggleMacro = (macroId: string) => {
    setOpenMacros(prev => {
      const newSet = new Set(prev);
      if (newSet.has(macroId)) {
        newSet.delete(macroId);
      } else {
        newSet.add(macroId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Etapas</h4>
      </div>
      
      <div className="space-y-2">
        {displayMacros.map(macro => {
          const macroProgress = getMacroProgress(macro);
          const isOpen = openMacros.has(macro.id);
          
          return (
            <Collapsible 
              key={macro.id} 
              open={isOpen} 
              onOpenChange={() => toggleMacro(macro.id)}
            >
              <CollapsibleTrigger className="w-full">
                <div className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-md p-1 -m-1 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {isOpen ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium text-foreground">{macro.name}</span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {macroProgress}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden ml-4">
                    <div 
                      className="h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${macroProgress}%`,
                        backgroundColor: getProgressBarColor(macroProgress)
                      }}
                    />
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="mt-2 ml-4 space-y-2 border-l-2 border-border pl-3">
                  {macro.scopes.map(scope => (
                    <div key={scope.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{scope.name}</span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {scope.progress}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: `${scope.progress}%`,
                            backgroundColor: getProgressBarColor(scope.progress)
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
