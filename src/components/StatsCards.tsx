import { Home, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";
import { useMemo } from "react";

export function StatsCards() {
  const { houses } = useConstruction();
  
  const stats = useMemo(() => {
    const total = houses.length;
    const progresses = houses.map(h => calculateHouseProgress(h));
    const avgProgress = Math.round(progresses.reduce((a, b) => a + b, 0) / total);
    const completed = progresses.filter(p => p === 100).length;
    const inProgress = progresses.filter(p => p > 0 && p < 100).length;
    
    return { total, avgProgress, completed, inProgress };
  }, [houses]);

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
      label: "Progresso Médio",
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
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-card rounded-xl p-4 border border-border animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl ${card.color} flex items-center justify-center`}>
              <card.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
