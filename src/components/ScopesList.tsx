import { useState } from "react";
import { Calendar } from "lucide-react";
import { House, Scope } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EditScopeDialog } from "./EditScopeDialog";

interface ScopesListProps {
  house: House;
}

export function ScopesList({ house }: ScopesListProps) {
  const [editScope, setEditScope] = useState<{ macroId: string; scope: Scope } | null>(null);

  const getProgressColor = (progress: number) => {
    if (progress === 0) return "bg-muted";
    if (progress < 30) return "bg-progress-low";
    if (progress < 60) return "bg-progress-medium";
    if (progress < 100) return "bg-progress-high";
    return "bg-progress-complete";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Serviços da Construção</h4>
      </div>
      
      <Accordion type="multiple" className="space-y-2">
        {house.macros.map(macro => (
          <AccordionItem 
            key={macro.id} 
            value={macro.id}
            className="border border-border rounded-lg overflow-hidden"
          >
            <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-secondary/50">
              <div className="flex items-center justify-between w-full pr-2">
                <span className="text-sm font-medium">{macro.name}</span>
                <span className="text-xs font-medium text-muted-foreground ml-2">
                  {macro.scopes.length > 0 
                    ? `${Math.round(macro.scopes.reduce((sum, s) => sum + s.progress, 0) / macro.scopes.length)}%`
                    : "0%"
                  }
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3">
              <div className="space-y-2">
                {macro.scopes.map(scope => (
                  <button
                    key={scope.id}
                    onClick={() => setEditScope({ macroId: macro.id, scope })}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-secondary/50 transition-colors group"
                  >
                    <span className="text-sm text-muted-foreground group-hover:text-foreground">
                      {scope.name}
                    </span>
                    <div className="flex items-center gap-2 w-32">
                      <Progress 
                        value={scope.progress} 
                        className="h-1.5 flex-1"
                      />
                      <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                        {scope.progress}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      
      {editScope && (
        <EditScopeDialog
          open={!!editScope}
          onOpenChange={(open) => !open && setEditScope(null)}
          houseId={house.id}
          macroId={editScope.macroId}
          scope={editScope.scope}
        />
      )}
    </div>
  );
}
