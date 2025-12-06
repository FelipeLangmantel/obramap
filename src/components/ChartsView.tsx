import { useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";

const STATUS_COLORS = {
  "not-started": "hsl(220 14% 90%)",
  "foundation": "hsl(0 84% 60%)",
  "structure": "hsl(38 92% 50%)",
  "finishing": "hsl(221 83% 53%)",
  "completed": "hsl(142 71% 45%)",
};

const STATUS_LABELS = {
  "not-started": "Não Iniciado",
  "foundation": "Fundação",
  "structure": "Estrutura",
  "finishing": "Acabamento",
  "completed": "Concluído",
};

export function ChartsView() {
  const { houses, quadras } = useConstruction();

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {
      "not-started": 0,
      "foundation": 0,
      "structure": 0,
      "finishing": 0,
      "completed": 0,
    };

    houses.forEach(house => {
      const progress = calculateHouseProgress(house);
      const status = getStatusFromProgress(progress);
      counts[status]++;
    });

    return Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => ({
        name: STATUS_LABELS[key as keyof typeof STATUS_LABELS],
        value,
        color: STATUS_COLORS[key as keyof typeof STATUS_COLORS],
      }));
  }, [houses]);

  const barData = useMemo(() => {
    return quadras.map(quadra => {
      const quadraHouses = houses.filter(h => h.quadra === quadra.id);
      const avgProgress = quadraHouses.length > 0 
        ? Math.round(quadraHouses.reduce((sum, h) => sum + calculateHouseProgress(h), 0) / quadraHouses.length)
        : 0;
      return {
        name: quadra.id,
        progress: avgProgress,
      };
    });
  }, [houses, quadras]);

  const summaryData = useMemo(() => {
    const counts: Record<string, number> = {
      "not-started": 0,
      "foundation": 0,
      "structure": 0,
      "finishing": 0,
      "completed": 0,
    };

    houses.forEach(house => {
      const progress = calculateHouseProgress(house);
      const status = getStatusFromProgress(progress);
      counts[status]++;
    });

    return [
      { label: "Não Iniciado", value: counts["not-started"], color: "bg-status-not-started text-foreground" },
      { label: "Fundação", value: counts["foundation"], color: "bg-status-foundation text-primary-foreground" },
      { label: "Estrutura", value: counts["structure"], color: "bg-status-structure text-primary-foreground" },
      { label: "Acabamento", value: counts["finishing"], color: "bg-status-finishing text-primary-foreground" },
      { label: "Concluído", value: counts["completed"], color: "bg-status-completed text-primary-foreground" },
    ];
  }, [houses]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 animate-fade-in">
          <h3 className="text-lg font-semibold text-foreground mb-4">Status por Fase</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs text-muted-foreground">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 animate-fade-in" style={{ animationDelay: "100ms" }}>
          <h3 className="text-lg font-semibold text-foreground mb-4">Progresso por Quadra</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" width={30} />
                <Tooltip formatter={(value: number) => [`${value}%`, "Progresso"]} />
                <Bar 
                  dataKey="progress" 
                  fill="hsl(221, 83%, 53%)" 
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 animate-fade-in" style={{ animationDelay: "200ms" }}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Resumo Geral</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {summaryData.map((item, index) => (
            <div 
              key={index} 
              className={`rounded-xl p-4 text-center ${item.color}`}
            >
              <p className="text-3xl font-bold">{item.value}</p>
              <p className="text-sm opacity-80">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
