import { Calendar } from "lucide-react";
import { House } from "@/data/constructionData";

interface ScopesListProps {
  house: House;
}

export function ScopesList({ house }: ScopesListProps) {
  const getMacroProgress = (macro: typeof house.macros[0]) => {
    return macro.scopes.length > 0 
      ? Math.round(macro.scopes.reduce((sum, s) => sum + s.progress, 0) / macro.scopes.length)
      : 0;
  };

  const getProgressBarColor = (progress: number) => {
    if (progress === 0) return "hsl(var(--muted))";
    if (progress < 50) return "hsl(0, 84%, 60%)"; // Red
    if (progress < 100) return "hsl(45, 93%, 47%)"; // Yellow/Orange
    return "hsl(142, 71%, 45%)"; // Green
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold text-foreground">Etapas</h4>
      </div>
      
      <div className="space-y-3">
        {house.macros.map(macro => {
          const macroProgress = getMacroProgress(macro);
          
          return (
            <div key={macro.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{macro.name}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {macroProgress}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${macroProgress}%`,
                    backgroundColor: getProgressBarColor(macroProgress)
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
