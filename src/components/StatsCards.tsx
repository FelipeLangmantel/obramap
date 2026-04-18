import { Home, TrendingUp, CheckCircle2, Clock, Calendar } from "lucide-react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress } from "@/data/constructionData";
import { useMemo } from "react";

export function StatsCards() {
  const { currentProject, filterMode, filterMacro, filterScope } = useConstruction();
  
  const stats = useMemo(() => {
    if (!currentProject) return { total: 0, avgProgress: 0, completed: 0, inProgress: 0, label: "Progresso Médio" };
    
    const houses = currentProject.houses;
    const total = houses.length;
    if (total === 0) return { total: 0, avgProgress: 0, completed: 0, inProgress: 0, label: "Progresso Médio" };
    
    let avgProgress: number;
    let label = "Progresso Médio";
    let completed: number;
    let inProgress: number;

    // Calculate based on filter selection
    if (filterMode === "macro" && filterMacro !== "all") {
      // Calculate average for specific macro
      const macro = currentProject.macrosTemplate.find(m => m.id === filterMacro);
      const macroName = macro?.name || "Etapa";
      label = `Média: ${macroName}`;
      
      const macroProgresses = houses.map(house => {
        const houseMacro = house.macros.find(m => m.id === filterMacro);
        if (!houseMacro) return 0;
        
        const totalWeight = houseMacro.scopes.reduce((sum, s) => sum + s.weight, 0);
        if (totalWeight === 0) return 0;
        
        const weightedProgress = houseMacro.scopes.reduce((sum, s) => sum + (s.progress * s.weight), 0);
        return weightedProgress / totalWeight;
      });
      
      avgProgress = Math.round((macroProgresses.reduce((a, b) => a + b, 0) / total) * 10) / 10;
      completed = macroProgresses.filter(p => p === 100).length;
      inProgress = macroProgresses.filter(p => p > 0 && p < 100).length;
      
    } else if (filterMode === "scope" && filterScope !== "all") {
      // Calculate average for specific scope
      let scopeName = "Serviço";
      
      // Find the scope name from macros template
      for (const macro of currentProject.macrosTemplate) {
        const scope = macro.scopes.find(s => s.id === filterScope);
        if (scope) {
          scopeName = scope.name;
          break;
        }
      }
      
      label = `Média: ${scopeName}`;
      
      const scopeProgresses = houses.map(house => {
        for (const macro of house.macros) {
          const scope = macro.scopes.find(s => s.id === filterScope);
          if (scope) {
            return scope.progress;
          }
        }
        return 0;
      });
      
      avgProgress = Math.round((scopeProgresses.reduce((a, b) => a + b, 0) / total) * 10) / 10;
      completed = scopeProgresses.filter(p => p === 100).length;
      inProgress = scopeProgresses.filter(p => p > 0 && p < 100).length;
      
    } else {
      // Default: calculate overall house progress using template weights
      const template = currentProject.macrosTemplate;
      const progresses = houses.map(h => calculateHouseProgress(h, template));
      avgProgress = Math.round((progresses.reduce((a, b) => a + b, 0) / total) * 10) / 10;
      completed = progresses.filter(p => p === 100).length;
      inProgress = progresses.filter(p => p > 0 && p < 100).length;
    }
    
    return { total, avgProgress, completed, inProgress, label };
  }, [currentProject, filterMode, filterMacro, filterScope]);

  // Calculate days remaining based on current project's expected end date
  const daysRemaining = useMemo(() => {
    if (!currentProject?.expectedEndDate) return null;
    
    const endDate = new Date(currentProject.expectedEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time for accurate day calculation
    endDate.setHours(0, 0, 0, 0);
    
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }, [currentProject?.expectedEndDate]);

  if (!currentProject) return null;

  const cards = [
    {
      icon: Home,
      value: stats.total,
      label: "Total de Casas",
      color: "bg-primary/10 text-primary",
    },
    {
      icon: TrendingUp,
      value: `${stats.avgProgress}%`,
      label: stats.label,
      color: "bg-chart-blue/10 text-chart-blue",
    },
    {
      icon: CheckCircle2,
      value: stats.completed,
      label: "Concluídos",
      color: "bg-progress-complete/10 text-progress-complete",
    },
    {
      icon: Clock,
      value: stats.inProgress,
      label: "Em Andamento",
      color: "bg-chart-orange/10 text-chart-orange",
    },
    {
      icon: Calendar,
      value: daysRemaining !== null ? (daysRemaining > 0 ? daysRemaining : 0) : "-",
      label: daysRemaining !== null && daysRemaining > 0 ? "Dias Restantes" : "Prazo Encerrado",
      color: daysRemaining !== null && daysRemaining > 0 
        ? "bg-chart-purple/10 text-chart-purple" 
        : "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-card rounded-xl p-4 border border-border animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex flex-col items-center text-center gap-2">
            <div className={`w-10 h-10 rounded-xl ${card.color} flex items-center justify-center`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
