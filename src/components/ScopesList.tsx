import { useState } from "react";
import { Calendar } from "lucide-react";
import { House, Scope } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EditScopeDialog } from "./EditScopeDialog";

interface ScopesListProps {
  house: House;
}

export function ScopesList({ house }: ScopesListProps) {
  const { canEdit } = useAuth();
  const [editScope, setEditScope] = useState<{ macroId: string; scope: Scope } | null>(null);

  const getProgressColor = (progress: number) => {
    if (progress === 0) return "bg-muted";
    if (progress < 30) return "bg-progress-low";
    if (progress < 60) return "bg-progress-medium";
    if (progress < 100) return "bg-progress-high";
    return "bg-progress-complete";
  };

  const getMacroProgress = (macro: typeof house.macros[0]) => {
    return macro.scopes.length > 0 
      ? Math.round(macro.scopes.reduce((sum, s) => sum + s.progress, 0) / macro.scopes.length)
      : 0;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Serviços da Construção</h4>
      </div>
      
      <Accordion type="multiple" className="space-y-2">
        {house.macros.map(macro => {
          const macroProgress = getMacroProgress(macro);
          
          return (
            <AccordionItem 
              key={macro.id} 
              value={macro.id}
              className="border border-border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-secondary/50">
                <div className="flex items-center justify-between w-full pr-2 gap-3">
                  <span className="text-sm font-medium flex-shrink-0">{macro.name}</span>
                  <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: `${macroProgress}%`,
                          backgroundColor: macro.color || '#3b82f6'
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground w-10 text-right">
                      {macroProgress}%
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <div className="space-y-2">
                  {macro.scopes.map(scope => (
                    <div
                      key={scope.id}
                      onClick={() => canEdit && setEditScope({ macroId: macro.id, scope })}
                      className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors group ${
                        canEdit ? "cursor-pointer hover:bg-secondary/50" : "cursor-default"
                      }`}
                    >
                      <span className={`text-sm text-muted-foreground ${canEdit ? "group-hover:text-foreground" : ""}`}>
                        {scope.name}
                      </span>
                      <div className="flex items-center gap-2 w-32">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${scope.progress}%`,
                              backgroundColor: macro.color || '#3b82f6'
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                          {scope.progress}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
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
