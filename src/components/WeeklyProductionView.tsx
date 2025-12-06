import { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  ClipboardList, 
  Save, 
  TrendingUp, 
  Calendar, 
  Home, 
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WeeklyProduction {
  id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  house_ids: number[];
  houses_count: number;
  created_at: string;
  notes: string | null;
}

export function WeeklyProductionView() {
  const { currentProject, updateScopeProgress } = useConstruction();
  const [activeTab, setActiveTab] = useState<"register" | "analysis">("register");
  const [selectedMacro, setSelectedMacro] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  const [weekDate, setWeekDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [productions, setProductions] = useState<WeeklyProduction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];
  
  // Get scopes for selected macro
  const scopes = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Get current week boundaries
  const weekStart = useMemo(() => startOfWeek(parseISO(weekDate), { weekStartsOn: 1 }), [weekDate]);
  const weekEnd = useMemo(() => endOfWeek(parseISO(weekDate), { weekStartsOn: 1 }), [weekDate]);

  // Load productions
  useEffect(() => {
    if (!currentProject) return;
    
    const loadProductions = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('weekly_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });

      if (error) {
        console.error('Error loading productions:', error);
      } else {
        setProductions(data || []);
      }
      setIsLoading(false);
    };

    loadProductions();
  }, [currentProject]);

  // Toggle house selection
  const toggleHouse = (houseId: number) => {
    setSelectedHouses(prev => 
      prev.includes(houseId) 
        ? prev.filter(id => id !== houseId)
        : [...prev, houseId].sort((a, b) => a - b)
    );
  };

  // Select all houses
  const selectAllHouses = () => {
    setSelectedHouses(houses.map(h => h.id));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedHouses([]);
  };

  // Save production record
  const handleSave = async () => {
    if (!currentProject || !selectedScope || selectedHouses.length === 0) {
      toast.error("Selecione um serviço e pelo menos uma casa");
      return;
    }

    const macro = macros.find(m => m.id === selectedMacro);
    const scope = scopes.find(s => s.id === selectedScope);

    if (!macro || !scope) return;

    setIsSaving(true);
    try {
      // Save production record
      const { error } = await supabase
        .from('weekly_productions')
        .insert({
          project_id: currentProject.id,
          week_start: format(weekStart, "yyyy-MM-dd"),
          week_end: format(weekEnd, "yyyy-MM-dd"),
          scope_id: scope.id,
          scope_name: scope.name,
          macro_id: macro.id,
          macro_name: macro.name,
          macro_color: macro.color,
          house_ids: selectedHouses,
          houses_count: selectedHouses.length,
        });

      if (error) throw error;

      // Update progress for each selected house
      for (const houseId of selectedHouses) {
        await updateScopeProgress(houseId, macro.id, scope.id, 100);
      }

      toast.success(`Produção registrada: ${scope.name} em ${selectedHouses.length} casas`);
      
      // Reload productions
      const { data: newData } = await supabase
        .from('weekly_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      setProductions(newData || []);
      setSelectedHouses([]);
      setSelectedScope("");
    } catch (error) {
      console.error('Error saving production:', error);
      toast.error("Erro ao salvar produção");
    }
    setIsSaving(false);
  };

  // Weekly stats
  const weeklyStats = useMemo(() => {
    const weeks: { [key: string]: { total: number; scopes: { [key: string]: number } } } = {};
    
    productions.forEach(prod => {
      const weekKey = prod.week_start;
      if (!weeks[weekKey]) {
        weeks[weekKey] = { total: 0, scopes: {} };
      }
      weeks[weekKey].total += prod.houses_count;
      weeks[weekKey].scopes[prod.scope_name] = (weeks[weekKey].scopes[prod.scope_name] || 0) + prod.houses_count;
    });

    return Object.entries(weeks)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([week, data]) => ({
        week,
        weekFormatted: format(parseISO(week), "dd/MM", { locale: ptBR }),
        ...data
      }));
  }, [productions]);

  // Calculate trend
  const trend = useMemo(() => {
    if (weeklyStats.length < 2) return { direction: 'neutral', percentage: 0 };
    const current = weeklyStats[0]?.total || 0;
    const previous = weeklyStats[1]?.total || 0;
    
    if (previous === 0) return { direction: 'up', percentage: 100 };
    
    const change = ((current - previous) / previous) * 100;
    return {
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
      percentage: Math.abs(Math.round(change))
    };
  }, [weeklyStats]);

  // Get houses already completed for selected scope
  const completedHouses = useMemo(() => {
    if (!selectedScope || !currentProject) return [];
    
    return houses
      .filter(house => {
        for (const macro of house.macros) {
          const scope = macro.scopes.find(s => s.id === selectedScope);
          if (scope && scope.progress === 100) return true;
        }
        return false;
      })
      .map(h => h.id);
  }, [selectedScope, houses, currentProject]);

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto para ver a produção semanal
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "register" | "analysis")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="register" className="gap-2">
            <ClipboardList className="w-4 h-4" />
            Registrar Produção
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Análise Semanal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Selection Panel */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Semana de Referência</Label>
                  <Input 
                    type="date" 
                    value={weekDate}
                    onChange={(e) => setWeekDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Semana: {format(weekStart, "dd/MM", { locale: ptBR })} - {format(weekEnd, "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Etapa (Macro)</Label>
                  <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {macros.map(macro => (
                        <SelectItem key={macro.id} value={macro.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: macro.color }} />
                            {macro.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <Select 
                    value={selectedScope} 
                    onValueChange={setSelectedScope}
                    disabled={!selectedMacro}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      {scopes.map(scope => (
                        <SelectItem key={scope.id} value={scope.id}>
                          {scope.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedScope && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Casas Selecionadas</span>
                      <Badge variant="secondary">{selectedHouses.length}</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllHouses}>
                        Todas
                      </Button>
                      <Button variant="outline" size="sm" onClick={clearSelection}>
                        Limpar
                      </Button>
                    </div>
                  </div>
                )}

                <Button 
                  className="w-full gap-2" 
                  onClick={handleSave}
                  disabled={!selectedScope || selectedHouses.length === 0 || isSaving}
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Salvando..." : "Registrar Produção"}
                </Button>
              </CardContent>
            </Card>

            {/* Houses Grid */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Selecionar Casas
                  {selectedScope && (
                    <Badge variant="outline" className="ml-auto">
                      {completedHouses.length} já concluídas
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedScope ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Selecione uma etapa e um serviço para ver as casas
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                      {houses.map(house => {
                        const isCompleted = completedHouses.includes(house.id);
                        const isSelected = selectedHouses.includes(house.id);
                        const macro = macros.find(m => m.id === selectedMacro);
                        
                        return (
                          <button
                            key={house.id}
                            onClick={() => !isCompleted && toggleHouse(house.id)}
                            disabled={isCompleted}
                            className={`
                              relative w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-all
                              ${isCompleted 
                                ? 'bg-green-100 border-green-500 text-green-700 cursor-not-allowed opacity-60' 
                                : isSelected 
                                  ? 'border-primary bg-primary/20 text-primary' 
                                  : 'border-border bg-card hover:border-primary/50'
                              }
                            `}
                            style={isSelected && macro ? { borderColor: macro.color, backgroundColor: macro.color + '20' } : undefined}
                          >
                            {house.id}
                            {isCompleted && (
                              <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Esta Semana</p>
                    <p className="text-2xl font-bold">{weeklyStats[0]?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">serviços executados</p>
                  </div>
                  <BarChart3 className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tendência</p>
                    <div className="flex items-center gap-1">
                      <p className="text-2xl font-bold">{trend.percentage}%</p>
                      {trend.direction === 'up' && <ArrowUpRight className="w-5 h-5 text-green-600" />}
                      {trend.direction === 'down' && <ArrowDownRight className="w-5 h-5 text-red-600" />}
                      {trend.direction === 'neutral' && <Minus className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">vs semana anterior</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Média Semanal</p>
                    <p className="text-2xl font-bold">
                      {weeklyStats.length > 0 
                        ? Math.round(weeklyStats.reduce((sum, w) => sum + w.total, 0) / weeklyStats.length)
                        : 0
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">últimas {weeklyStats.length} semanas</p>
                  </div>
                  <Calendar className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Registrado</p>
                    <p className="text-2xl font-bold">
                      {productions.reduce((sum, p) => sum + p.houses_count, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">serviços executados</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Evolution */}
          <Card>
            <CardHeader>
              <CardTitle>Evolução Semanal</CardTitle>
            </CardHeader>
            <CardContent>
              {weeklyStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma produção registrada ainda
                </div>
              ) : (
                <div className="space-y-4">
                  {weeklyStats.map((week, index) => (
                    <div key={week.week} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Semana {week.weekFormatted}</span>
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          {week.total} serviços
                        </Badge>
                      </div>
                      <div className="h-6 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ 
                            width: `${Math.min(100, (week.total / Math.max(...weeklyStats.map(w => w.total))) * 100)}%` 
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(week.scopes).map(([scopeName, count]) => (
                          <Badge key={scopeName} variant="outline" className="text-xs">
                            {scopeName}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Productions */}
          <Card>
            <CardHeader>
              <CardTitle>Últimos Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {productions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma produção registrada
                  </div>
                ) : (
                  <div className="space-y-3">
                    {productions.slice(0, 20).map(prod => (
                      <div key={prod.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: prod.macro_color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{prod.scope_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {prod.macro_name} • Semana {format(parseISO(prod.week_start), "dd/MM", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary">{prod.houses_count} casas</Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {prod.house_ids.slice(0, 5).join(", ")}
                            {prod.house_ids.length > 5 && `... +${prod.house_ids.length - 5}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
