import { useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend as RechartsLegend } from "recharts";
import { useConstruction } from "@/contexts/ConstructionContext";
import { calculateHouseProgress, getStatusFromProgress } from "@/data/constructionData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_COLORS = {
  "not-started": "#9ca3af",
  "foundation": "#ef4444",
  "structure": "#f59e0b",
  "finishing": "#3b82f6",
  "completed": "#22c55e",
};

const STATUS_LABELS = {
  "not-started": "Não Iniciado",
  "foundation": "Fundação",
  "structure": "Estrutura",
  "finishing": "Acabamento",
  "completed": "Concluído",
};

export function ChartsView() {
  const { 
    currentProject,
    filterQuadra,
    filterMode,
    filterStatus,
    filterMacro,
    filterScope
  } = useConstruction();

  // Filter houses based on current filters
  const filteredHouses = useMemo(() => {
    if (!currentProject) return [];
    
    let houses = currentProject.houses;
    
    // Filter by quadra
    if (filterQuadra !== "all") {
      houses = houses.filter(h => h.quadra === filterQuadra);
    }
    
    // Filter by status
    if (filterMode === "status" && filterStatus !== "all") {
      houses = houses.filter(h => {
        const progress = calculateHouseProgress(h);
        const status = getStatusFromProgress(progress);
        return status === filterStatus;
      });
    }
    
    // Filter by macro
    if (filterMode === "macro" && filterMacro !== "all") {
      houses = houses.filter(h => {
        const macro = h.macros.find(m => m.id === filterMacro);
        return macro !== undefined;
      });
    }
    
    // Filter by scope
    if (filterMode === "scope" && filterScope !== "all") {
      houses = houses.filter(h => {
        return h.macros.some(m => m.scopes.some(s => s.id === filterScope));
      });
    }
    
    return houses;
  }, [currentProject, filterQuadra, filterMode, filterStatus, filterMacro, filterScope]);

  const { pieData, barData, summaryData, macroProgressData, scopeProgressData } = useMemo(() => {
    if (!currentProject) {
      return { pieData: [], barData: [], summaryData: [], macroProgressData: [], scopeProgressData: [] };
    }

    const quadras = currentProject.quadras;
    const macros = currentProject.macrosTemplate;

    // Status counts from filtered houses
    const counts: Record<string, number> = {
      "not-started": 0,
      "foundation": 0,
      "structure": 0,
      "finishing": 0,
      "completed": 0,
    };

    filteredHouses.forEach(house => {
      const progress = calculateHouseProgress(house);
      const status = getStatusFromProgress(progress);
      counts[status]++;
    });

    const pieData = Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([key, value]) => ({
        name: STATUS_LABELS[key as keyof typeof STATUS_LABELS],
        value,
        color: STATUS_COLORS[key as keyof typeof STATUS_COLORS],
      }));

    // Bar data - progress by quadra (filtered houses only)
    const barData = quadras.map(quadra => {
      const quadraHouses = filteredHouses.filter(h => h.quadra === quadra.id);
      const avgProgress = quadraHouses.length > 0 
        ? Math.round(quadraHouses.reduce((sum, h) => sum + calculateHouseProgress(h), 0) / quadraHouses.length)
        : 0;
      return {
        name: quadra.name,
        progress: avgProgress,
        houses: quadraHouses.length
      };
    }).filter(q => q.houses > 0);

    // Macro progress data
    const macroProgressData = macros.map(macro => {
      let totalProgress = 0;
      let count = 0;
      
      filteredHouses.forEach(house => {
        const houseMacro = house.macros.find(m => m.id === macro.id);
        if (houseMacro && houseMacro.scopes.length > 0) {
          const macroProgress = houseMacro.scopes.reduce((sum, s) => sum + s.progress, 0) / houseMacro.scopes.length;
          totalProgress += macroProgress;
          count++;
        }
      });
      
      return {
        name: macro.name,
        progress: count > 0 ? Math.round(totalProgress / count) : 0,
        color: macro.color
      };
    });

    // Scope progress data (from selected macro or all)
    const scopeProgressData: { name: string; progress: number; color: string; completed: number; total: number }[] = [];
    
    const targetMacros = filterMode === "macro" && filterMacro !== "all" 
      ? macros.filter(m => m.id === filterMacro)
      : macros;
    
    targetMacros.forEach(macro => {
      macro.scopes.forEach(scope => {
        let completed = 0;
        let total = 0;
        
        filteredHouses.forEach(house => {
          const houseMacro = house.macros.find(m => m.id === macro.id);
          if (houseMacro) {
            const houseScope = houseMacro.scopes.find(s => s.id === scope.id);
            if (houseScope) {
              total++;
              if (houseScope.progress === 100) completed++;
            }
          }
        });
        
        scopeProgressData.push({
          name: scope.name,
          progress: total > 0 ? Math.round((completed / total) * 100) : 0,
          color: macro.color,
          completed,
          total
        });
      });
    });

    const summaryData = [
      { label: "Não Iniciado", value: counts["not-started"], color: "bg-gray-400" },
      { label: "Fundação", value: counts["foundation"], color: "bg-red-500" },
      { label: "Estrutura", value: counts["structure"], color: "bg-amber-500" },
      { label: "Acabamento", value: counts["finishing"], color: "bg-blue-500" },
      { label: "Concluído", value: counts["completed"], color: "bg-green-500" },
    ];

    return { pieData, barData, summaryData, macroProgressData, scopeProgressData };
  }, [currentProject, filteredHouses, filterMode, filterMacro]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para visualizar os gráficos
      </div>
    );
  }

  const totalHouses = filteredHouses.length;
  const overallProgress = totalHouses > 0 
    ? Math.round(filteredHouses.reduce((sum, h) => sum + calculateHouseProgress(h), 0) / totalHouses)
    : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-3 pb-2 px-3">
            <p className="text-2xl font-bold text-primary">{totalHouses}</p>
            <p className="text-xs text-muted-foreground">Casas Filtradas</p>
          </CardContent>
        </Card>
        {summaryData.map((item, index) => (
          <Card key={index} className={`${item.color}`}>
            <CardContent className="pt-3 pb-2 px-3">
              <p className="text-2xl font-bold text-white">{item.value}</p>
              <p className="text-xs text-white/80">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart - Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value} casas`, name]}
                      contentStyle={{ fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma casa encontrada
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {pieData.map((entry, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-[10px] text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart - Progress by Quadra */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Progresso por Quadra</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis 
                      type="number" 
                      domain={[0, 100]} 
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={60}
                      tick={{ fontSize: 10 }}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value}%`, "Progresso"]}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar 
                      dataKey="progress" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma quadra encontrada
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Macro Progress Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Progresso por Etapa (Macro)</CardTitle>
        </CardHeader>
        <CardContent>
          {macroProgressData.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={macroProgressData} 
                  margin={{ left: 10, right: 20, top: 10, bottom: 100 }}
                >
                  <XAxis 
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10 }}
                    width={35}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`${value}%`, "Progresso Médio"]}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Bar 
                    dataKey="progress" 
                    radius={[4, 4, 0, 0]}
                  >
                    {macroProgressData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhuma etapa configurada
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scope Progress Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Progresso por Serviço 
            {filterMode === "macro" && filterMacro !== "all" && (
              <span className="text-xs text-muted-foreground ml-2">(filtrado pela etapa selecionada)</span>
            )}
            {filterMode === "scope" && filterScope !== "all" && (
              <span className="text-xs text-muted-foreground ml-2">(filtrado pelo serviço selecionado)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scopeProgressData.length > 0 ? (
            <div style={{ height: Math.max(200, scopeProgressData.length * 28 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={scopeProgressData} 
                  layout="vertical" 
                  margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
                >
                  <XAxis 
                    type="number" 
                    domain={[0, 100]} 
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={140}
                    tick={{ fontSize: 9 }}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${props.payload.completed}/${props.payload.total} casas (${value}%)`,
                      "Concluído"
                    ]}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Bar 
                    dataKey="progress" 
                    radius={[0, 4, 4, 0]}
                  >
                    {scopeProgressData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              Nenhum serviço configurado
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overall Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Progresso Geral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progresso médio das casas filtradas</span>
              <span className="font-bold text-primary">{overallProgress}%</span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {filteredHouses.filter(h => calculateHouseProgress(h) === 100).length} de {totalHouses} casas concluídas
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
