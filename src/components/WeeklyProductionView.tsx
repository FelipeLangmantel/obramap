import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
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
  Minus,
  Filter,
  CalendarDays,
  Pencil,
  Target,
  Trash2
} from "lucide-react";
import { EditProductionDialog } from "./EditProductionDialog";
import { format, startOfWeek, endOfWeek, subWeeks, parseISO, isWithinInterval, addWeeks, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
  is_initial_database: boolean;
}

const FILTER_STORAGE_KEY = "obramap_production_filters";
const TAB_STORAGE_KEY = "obramap_production_tab";
const INITIAL_DB_STORAGE_KEY = "obramap_initial_database_mode";

export function WeeklyProductionView() {
  const { currentProject, updateScopeProgress } = useConstruction();
  const { canEdit } = useAuth();
  
  // Load saved tab from localStorage
  const [activeTab, setActiveTab] = useState<"register" | "analysis">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "register" || saved === "analysis") {
        return saved;
      }
    }
    return "register";
  });
  
  // Initial database mode - for activities already done before tracking started
  const [isInitialDatabase, setIsInitialDatabase] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(INITIAL_DB_STORAGE_KEY) === 'true';
    }
    return false;
  });
  const [selectedMacro, setSelectedMacro] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  
  // Registration period dates
  const [measurementStartDate, setMeasurementStartDate] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [measurementEndDate, setMeasurementEndDate] = useState<string>(format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [registrationDate, setRegistrationDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  
  // Analysis filters with persistence
  const [analysisPeriod, setAnalysisPeriod] = useState<string>("4weeks");
  const [analysisStartDate, setAnalysisStartDate] = useState<string>(format(subWeeks(new Date(), 4), "yyyy-MM-dd"));
  const [analysisEndDate, setAnalysisEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [analysisHouseFilter, setAnalysisHouseFilter] = useState<string>("");
  const [analysisMacroFilter, setAnalysisMacroFilter] = useState<string>("");
  const [analysisScopeFilter, setAnalysisScopeFilter] = useState<string>("");
  
  const [productions, setProductions] = useState<WeeklyProduction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduction, setEditingProduction] = useState<WeeklyProduction | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const dragStartRef = useRef<number | null>(null);

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];
  
  // Load saved filters from localStorage
  useEffect(() => {
    if (currentProject?.id) {
      const savedFilters = localStorage.getItem(`${FILTER_STORAGE_KEY}_${currentProject.id}`);
      if (savedFilters) {
        const filters = JSON.parse(savedFilters);
        if (filters.analysisPeriod) setAnalysisPeriod(filters.analysisPeriod);
        if (filters.analysisHouseFilter) setAnalysisHouseFilter(filters.analysisHouseFilter);
        if (filters.analysisMacroFilter) setAnalysisMacroFilter(filters.analysisMacroFilter);
        if (filters.analysisScopeFilter) setAnalysisScopeFilter(filters.analysisScopeFilter);
      }
    }
  }, [currentProject?.id]);

  // Save filters to localStorage
  useEffect(() => {
    if (currentProject?.id) {
      const filters = {
        analysisPeriod,
        analysisHouseFilter,
        analysisMacroFilter,
        analysisScopeFilter
      };
      localStorage.setItem(`${FILTER_STORAGE_KEY}_${currentProject.id}`, JSON.stringify(filters));
    }
  }, [currentProject?.id, analysisPeriod, analysisHouseFilter, analysisMacroFilter, analysisScopeFilter]);
  
  // Get scopes for selected macro
  const scopes = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Get all scopes for filter
  const allScopes = useMemo(() => {
    const scopeList: { id: string; name: string; macroId: string }[] = [];
    macros.forEach(macro => {
      macro.scopes.forEach(scope => {
        scopeList.push({ id: scope.id, name: scope.name, macroId: macro.id });
      });
    });
    return scopeList;
  }, [macros]);

  // Handle period filter change
  useEffect(() => {
    const now = new Date();
    switch (analysisPeriod) {
      case "all":
        // Set to project start and end dates or fallback to wide range
        if (currentProject) {
          setAnalysisStartDate(currentProject.startDate || "2020-01-01");
          setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        }
        break;
      case "1week":
        setAnalysisStartDate(format(subWeeks(now, 1), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        break;
      case "2weeks":
        setAnalysisStartDate(format(subWeeks(now, 2), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        break;
      case "4weeks":
        setAnalysisStartDate(format(subWeeks(now, 4), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        break;
      case "8weeks":
        setAnalysisStartDate(format(subWeeks(now, 8), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        break;
      case "month":
        setAnalysisStartDate(format(startOfMonth(now), "yyyy-MM-dd"));
        setAnalysisEndDate(format(endOfMonth(now), "yyyy-MM-dd"));
        break;
      case "lastmonth":
        const lastMonth = subMonths(now, 1);
        setAnalysisStartDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
        setAnalysisEndDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
        break;
      case "custom":
        // Keep current dates
        break;
    }
  }, [analysisPeriod, currentProject]);

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

  // Reload productions helper
  const reloadProductions = async () => {
    if (!currentProject) return;
    const { data: newData } = await supabase
      .from('weekly_productions')
      .select('*')
      .eq('project_id', currentProject.id)
      .order('week_start', { ascending: false });
    
    setProductions(newData || []);
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
          week_start: measurementStartDate,
          week_end: measurementEndDate,
          scope_id: scope.id,
          scope_name: scope.name,
          macro_id: macro.id,
          macro_name: macro.name,
          macro_color: macro.color,
          house_ids: selectedHouses,
          houses_count: selectedHouses.length,
          is_initial_database: isInitialDatabase,
        });

      if (error) throw error;

      // Update progress for each selected house - this updates the map automatically
      for (const houseId of selectedHouses) {
        await updateScopeProgress(houseId, macro.id, scope.id, 100);
      }

      const message = isInitialDatabase 
        ? `Banco de atividades atualizado: ${scope.name} em ${selectedHouses.length} casas.`
        : `Produção registrada: ${scope.name} em ${selectedHouses.length} casas. Mapa atualizado!`;
      toast.success(message);
      
      // Reload productions
      await reloadProductions();
      setSelectedHouses([]);
      setSelectedScope("");
    } catch (error) {
      console.error('Error saving production:', error);
      toast.error("Erro ao salvar produção");
    }
    setIsSaving(false);
  };

  // Handle edit dialog save
  const handleEditSave = async () => {
    await reloadProductions();
  };

  // Drag selection handlers
  const handleMouseDown = useCallback((houseId: number, isCompleted: boolean, event: React.MouseEvent) => {
    if (isCompleted) return;
    
    // Prevent context menu on right click
    if (event.button === 2) {
      event.preventDefault();
    }
    
    // Start drag on left or right mouse button
    if (event.button === 0 || event.button === 2) {
      setIsDragging(true);
      dragStartRef.current = houseId;
      
      // Determine drag mode based on current selection state
      const isCurrentlySelected = selectedHouses.includes(houseId);
      setDragMode(isCurrentlySelected ? 'deselect' : 'select');
      
      // Toggle the initial house
      if (isCurrentlySelected) {
        setSelectedHouses(prev => prev.filter(id => id !== houseId));
      } else {
        setSelectedHouses(prev => [...prev, houseId].sort((a, b) => a - b));
      }
    }
  }, [selectedHouses]);

  const handleMouseEnter = useCallback((houseId: number, isCompleted: boolean) => {
    if (!isDragging || isCompleted) return;
    
    if (dragMode === 'select') {
      setSelectedHouses(prev => {
        if (prev.includes(houseId)) return prev;
        return [...prev, houseId].sort((a, b) => a - b);
      });
    } else {
      setSelectedHouses(prev => prev.filter(id => id !== houseId));
    }
  }, [isDragging, dragMode]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // Add global mouse up listener to handle mouse up outside grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Filter productions by analysis period and other filters
  const filteredProductions = useMemo(() => {
    // For "all" period, don't filter by date
    if (analysisPeriod === "all") {
      return productions.filter(prod => {
        // Filter by house - show only productions that include this house
        const houseMatch = !analysisHouseFilter || 
          prod.house_ids.includes(parseInt(analysisHouseFilter));
        
        // Filter by macro
        const macroMatch = !analysisMacroFilter || prod.macro_id === analysisMacroFilter;
        
        // Filter by scope
        const scopeMatch = !analysisScopeFilter || prod.scope_id === analysisScopeFilter;
        
        return houseMatch && macroMatch && scopeMatch;
      });
    }
    
    if (!analysisStartDate || !analysisEndDate) return productions;
    
    const start = parseISO(analysisStartDate);
    const end = parseISO(analysisEndDate);
    
    return productions.filter(prod => {
      const prodDate = parseISO(prod.week_start);
      const inDateRange = isWithinInterval(prodDate, { start, end });
      
      // Filter by house - show only productions that include this house
      const houseMatch = !analysisHouseFilter || 
        prod.house_ids.includes(parseInt(analysisHouseFilter));
      
      // Filter by macro
      const macroMatch = !analysisMacroFilter || prod.macro_id === analysisMacroFilter;
      
      // Filter by scope
      const scopeMatch = !analysisScopeFilter || prod.scope_id === analysisScopeFilter;
      
      return inDateRange && houseMatch && macroMatch && scopeMatch;
    });
  }, [productions, analysisPeriod, analysisStartDate, analysisEndDate, analysisHouseFilter, analysisMacroFilter, analysisScopeFilter]);

  // Weekly stats - with proper week calculation considering the period
  // Also include detailed productions for each week for click popup
  const weeklyStats = useMemo(() => {
    const weeks: { [key: string]: { 
      total: number; 
      scopes: { [key: string]: number }; 
      weekStart: Date; 
      weekEnd: Date;
      productions: WeeklyProduction[];
    } } = {};
    
    filteredProductions.forEach(prod => {
      const weekKey = prod.week_start;
      if (!weeks[weekKey]) {
        weeks[weekKey] = { 
          total: 0, 
          scopes: {}, 
          weekStart: parseISO(prod.week_start), 
          weekEnd: parseISO(prod.week_end),
          productions: []
        };
      }
      weeks[weekKey].total += prod.houses_count;
      weeks[weekKey].scopes[prod.scope_name] = (weeks[weekKey].scopes[prod.scope_name] || 0) + prod.houses_count;
      weeks[weekKey].productions.push(prod);
    });

    return Object.entries(weeks)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, data]) => ({
        week,
        weekFormatted: format(parseISO(week), "dd/MM", { locale: ptBR }),
        ...data
      }));
  }, [filteredProductions]);

  // Calculate number of weeks in the analysis period for accurate average
  const numberOfWeeksInPeriod = useMemo(() => {
    if (!analysisStartDate || !analysisEndDate) return 1;
    const start = parseISO(analysisStartDate);
    const end = parseISO(analysisEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.ceil(diffDays / 7));
  }, [analysisStartDate, analysisEndDate]);

  // Calculate weekly average considering the actual period span
  const weeklyAverage = useMemo(() => {
    const totalProduction = filteredProductions.reduce((sum, p) => sum + p.houses_count, 0);
    // If we have data, calculate based on actual weeks with data or period weeks (whichever is more accurate)
    const weeksWithData = weeklyStats.length;
    if (weeksWithData === 0) return 0;
    // Use the greater of weeks with data or period weeks to avoid inflated averages
    const divisor = Math.max(weeksWithData, numberOfWeeksInPeriod);
    return Math.round(totalProduction / divisor);
  }, [filteredProductions, weeklyStats.length, numberOfWeeksInPeriod]);

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

  // Handle tab change with persistence
  const handleTabChange = (value: string) => {
    const tab = value as "register" | "analysis";
    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  };

  // Handle initial database mode change
  const handleInitialDatabaseChange = (checked: boolean) => {
    setIsInitialDatabase(checked);
    localStorage.setItem(INITIAL_DB_STORAGE_KEY, checked.toString());
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-10">
          <TabsTrigger value="register" className="gap-2 text-sm">
            <ClipboardList className="w-4 h-4" />
            Registrar Produção
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Análise Semanal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="flex-1 overflow-auto mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
            {/* Selection Panel */}
            <Card className="lg:col-span-1 overflow-visible">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Configuração do Registro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Initial Database Mode - Moved to top */}
                <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
                  <Checkbox
                    id="initial-database"
                    checked={isInitialDatabase}
                    onCheckedChange={(checked) => handleInitialDatabaseChange(checked as boolean)}
                  />
                  <Label 
                    htmlFor="initial-database" 
                    className="text-sm cursor-pointer"
                  >
                    Banco de Atividades Iniciais
                  </Label>
                  {isInitialDatabase && (
                    <Badge variant="outline" className="ml-auto text-xs text-amber-600 border-amber-500/50">
                      Não afeta análises
                    </Badge>
                  )}
                </div>

                {/* Period of measurement - Hidden when initial database */}
                {!isInitialDatabase && (
                  <div className="p-3 bg-secondary/30 rounded-lg space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      Período de Medição
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Início</Label>
                        <Input 
                          type="date" 
                          value={measurementStartDate}
                          onChange={(e) => setMeasurementStartDate(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Fim</Label>
                        <Input 
                          type="date" 
                          value={measurementEndDate}
                          onChange={(e) => setMeasurementEndDate(e.target.value)}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Data de Lançamento</Label>
                      <Input 
                        type="date" 
                        value={registrationDate}
                        onChange={(e) => setRegistrationDate(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm">Etapa (Macro)</Label>
                  <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="max-h-[300px] overflow-y-auto z-50">
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
                  <Label className="text-sm">Serviço</Label>
                  <Select 
                    value={selectedScope} 
                    onValueChange={setSelectedScope}
                    disabled={!selectedMacro}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="max-h-[300px] overflow-y-auto z-50">
                      {scopes.map(scope => (
                        <SelectItem key={scope.id} value={scope.id}>
                          {scope.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedScope && (
                  <div className="pt-3 border-t">
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
                  className="w-full gap-2 h-10" 
                  onClick={handleSave}
                  disabled={!selectedScope || selectedHouses.length === 0 || isSaving || !canEdit}
                >
                  <Save className="w-4 h-4" />
                  {!canEdit ? "Sem permissão" : isSaving ? "Salvando..." : "Registrar Produção"}
                </Button>
              </CardContent>
            </Card>

            {/* Houses Grid */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Selecionar Casas
                  {selectedScope && (
                    <Badge variant="outline" className="ml-auto text-xs">
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
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      💡 Dica: Clique e arraste para selecionar múltiplas casas rapidamente
                    </p>
                    <ScrollArea className="h-[calc(100vh-420px)] min-h-[300px]">
                      <div 
                        className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 select-none"
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {houses.map(house => {
                          const isCompleted = completedHouses.includes(house.id);
                          const isSelected = selectedHouses.includes(house.id);
                          const macro = macros.find(m => m.id === selectedMacro);
                          
                          return (
                            <button
                              key={house.id}
                              onMouseDown={(e) => handleMouseDown(house.id, isCompleted, e)}
                              onMouseEnter={() => handleMouseEnter(house.id, isCompleted)}
                              onMouseUp={handleMouseUp}
                              onContextMenu={(e) => e.preventDefault()}
                              disabled={isCompleted}
                              className={`
                                relative w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-all
                                ${isCompleted 
                                  ? 'bg-green-100 border-green-500 text-green-700 cursor-not-allowed opacity-60' 
                                  : isSelected 
                                    ? 'border-primary bg-primary/20 text-primary cursor-pointer' 
                                    : 'border-border bg-card hover:border-primary/50 cursor-pointer'
                                }
                                ${isDragging && !isCompleted ? 'cursor-crosshair' : ''}
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
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="space-y-4">
              {/* Period Row */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Período:</Label>
                </div>
                <Select value={analysisPeriod} onValueChange={setAnalysisPeriod}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo Projeto</SelectItem>
                    <SelectItem value="1week">Última semana</SelectItem>
                    <SelectItem value="2weeks">Últimas 2 semanas</SelectItem>
                    <SelectItem value="4weeks">Últimas 4 semanas</SelectItem>
                    <SelectItem value="8weeks">Últimas 8 semanas</SelectItem>
                    <SelectItem value="month">Este mês</SelectItem>
                    <SelectItem value="lastmonth">Mês passado</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                
                {analysisPeriod === "custom" && (
                  <div className="flex items-center gap-2">
                    <Input 
                      type="date" 
                      value={analysisStartDate}
                      onChange={(e) => setAnalysisStartDate(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                    <span className="text-muted-foreground">até</span>
                    <Input 
                      type="date" 
                      value={analysisEndDate}
                      onChange={(e) => setAnalysisEndDate(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                )}
              </div>

              {/* Additional Filters Row */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">Casa:</Label>
                  <Select value={analysisHouseFilter || "all"} onValueChange={(v) => {
                    setAnalysisHouseFilter(v === "all" ? "" : v);
                    // When filtering by house, switch to "all" period to show complete history
                    if (v !== "all") {
                      setAnalysisPeriod("all");
                    }
                  }}>
                    <SelectTrigger className="w-[100px] h-8">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {houses.map(house => (
                        <SelectItem key={house.id} value={house.id.toString()}>
                          Casa {house.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm">Etapa:</Label>
                  <Select value={analysisMacroFilter || "all"} onValueChange={(v) => { setAnalysisMacroFilter(v === "all" ? "" : v); setAnalysisScopeFilter(""); }}>
                    <SelectTrigger className="w-[150px] h-8">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {macros.map(macro => (
                        <SelectItem key={macro.id} value={macro.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: macro.color }} />
                            {macro.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-sm">Serviço:</Label>
                  <Select value={analysisScopeFilter || "all"} onValueChange={(v) => setAnalysisScopeFilter(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-[180px] h-8">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {(analysisMacroFilter 
                        ? allScopes.filter(s => s.macroId === analysisMacroFilter)
                        : allScopes
                      ).map(scope => (
                        <SelectItem key={scope.id} value={scope.id}>
                          {scope.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(analysisHouseFilter || analysisMacroFilter || analysisScopeFilter) && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setAnalysisHouseFilter("");
                      setAnalysisMacroFilter("");
                      setAnalysisScopeFilter("");
                    }}
                    className="h-8 text-xs"
                  >
                    Limpar filtros
                  </Button>
                )}

                <Badge variant="outline" className="ml-auto">
                  {filteredProductions.length} registros
                </Badge>
              </div>
            </div>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Esta Semana</p>
                    <p className="text-2xl font-bold">{weeklyStats[0]?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">serviços</p>
                  </div>
                  <BarChart3 className="w-7 h-7 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Tendência</p>
                    <div className="flex items-center gap-1">
                      <p className="text-2xl font-bold">{trend.percentage}%</p>
                      {trend.direction === 'up' && <ArrowUpRight className="w-5 h-5 text-green-600" />}
                      {trend.direction === 'down' && <ArrowDownRight className="w-5 h-5 text-red-600" />}
                      {trend.direction === 'neutral' && <Minus className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">vs anterior</p>
                  </div>
                  <TrendingUp className="w-7 h-7 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Média Semanal</p>
                    <p className="text-2xl font-bold">{weeklyAverage}</p>
                    <p className="text-xs text-muted-foreground">
                      {numberOfWeeksInPeriod} semana{numberOfWeeksInPeriod > 1 ? 's' : ''} no período
                    </p>
                  </div>
                  <Calendar className="w-7 h-7 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Período</p>
                    <p className="text-2xl font-bold">
                      {filteredProductions.reduce((sum, p) => sum + p.houses_count, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">serviços</p>
                  </div>
                  <CheckCircle2 className="w-7 h-7 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly Evolution and Recent Productions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Evolução Semanal</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {weeklyStats.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma produção registrada no período
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {weeklyStats.map((week, index) => (
                        <details key={week.week} className="group cursor-pointer">
                          <summary className="list-none space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium flex items-center gap-2">
                                Semana {week.weekFormatted}
                                <span className="text-[10px] text-muted-foreground group-open:hidden">
                                  (clique para detalhes)
                                </span>
                              </span>
                              <Badge variant={index === 0 ? "default" : "secondary"} className="text-xs">
                                {week.total} serviços
                              </Badge>
                            </div>
                            <div className="h-5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all"
                                style={{ 
                                  width: `${Math.min(100, (week.total / Math.max(...weeklyStats.map(w => w.total))) * 100)}%` 
                                }}
                              />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(week.scopes).map(([scopeName, count]) => (
                                <Badge key={scopeName} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {scopeName}: {count}
                                </Badge>
                              ))}
                            </div>
                          </summary>
                          
                          {/* Detailed productions for this week */}
                          <div className="mt-2 ml-2 pl-3 border-l-2 border-primary/30 space-y-2">
                            {week.productions.map(prod => (
                              <div key={prod.id} className={`p-2 rounded-md bg-secondary/30 text-xs ${prod.is_initial_database ? 'border border-amber-500/30' : ''}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <div 
                                    className="w-2 h-2 rounded-full" 
                                    style={{ backgroundColor: prod.macro_color }}
                                  />
                                  <span className="font-medium">{prod.scope_name}</span>
                                  <span className="uppercase text-muted-foreground">{prod.macro_name}</span>
                                  <div className="flex items-center gap-1 ml-auto">
                                    {prod.is_initial_database && (
                                      <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-500/50">Inicial</Badge>
                                    )}
                                    <Badge variant="outline" className="text-[10px]">
                                      {prod.houses_count} casas
                                    </Badge>
                                  </div>
                                </div>
                                <div className="text-muted-foreground">
                                  <span className="font-medium">Casas executadas:</span>{" "}
                                  {prod.house_ids.join(", ")}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  <span className="font-medium">Período:</span>{" "}
                                  {format(parseISO(prod.week_start), "dd/MM/yyyy", { locale: ptBR })} - {format(parseISO(prod.week_end), "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                                {prod.notes && (
                                  <div className="text-muted-foreground mt-0.5 italic">
                                    {prod.notes}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Últimos Registros</CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <ScrollArea className="h-[300px]">
                  {filteredProductions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma produção no período
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredProductions.slice(0, 20).map(prod => (
                        <div 
                          key={prod.id} 
                          className={`flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/30 transition-colors cursor-pointer ${prod.is_initial_database ? 'border-amber-500/30 bg-amber-500/5' : ''}`}
                          onClick={() => {
                            setEditingProduction(prod);
                            setEditDialogOpen(true);
                          }}
                        >
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: prod.macro_color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{prod.scope_name}</p>
                            <p className="text-xs text-muted-foreground">
                              <span className="uppercase">{prod.macro_name}</span> • {format(parseISO(prod.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(prod.week_end), "dd/MM", { locale: ptBR })}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-2">
                            <div>
                              <div className="flex items-center gap-1">
                                <Badge variant="secondary" className="text-xs">{prod.houses_count} casas</Badge>
                                {prod.is_initial_database && (
                                  <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/50">Inicial</Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {prod.house_ids.slice(0, 4).join(", ")}
                                {prod.house_ids.length > 4 && `... +${prod.house_ids.length - 4}`}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProduction(prod);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Deseja excluir este registro de produção?")) {
                                  try {
                                    await supabase.from('weekly_productions').delete().eq('id', prod.id);
                                    await reloadProductions();
                                    toast.success("Registro excluído");
                                  } catch (error) {
                                    toast.error("Erro ao excluir registro");
                                  }
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      <EditProductionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        production={editingProduction}
        onSave={handleEditSave}
      />
    </div>
  );
}
