import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Plus, Pencil, Trash2, DollarSign, Package, Hammer, Wrench, TrendingUp, PieChart, BarChart3, Calculator, Upload, FileText, Loader2, Target, Cloud, CloudOff, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface ScopeCost {
  id?: string;
  scopeId: string;
  scopeName: string;
  macroId: string;
  macroName: string;
  macroColor: string;
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
}

interface PlannedProduction {
  id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  planned_houses: number;
  planned_house_ids: number[];
  week_start: string;
  week_end: string;
}

const COSTS_TAB_STORAGE_KEY = "obramap_costs_tab";

export function ProjectCostsView() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const [scopeCosts, setScopeCosts] = useState<ScopeCost[]>([]);
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [editingScope, setEditingScope] = useState<ScopeCost | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "details">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COSTS_TAB_STORAGE_KEY);
      if (saved === "overview" || saved === "details") {
        return saved;
      }
    }
    return "overview";
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleMacro = (macroId: string) => {
    setExpandedMacros(prev => {
      const next = new Set(prev);
      if (next.has(macroId)) {
        next.delete(macroId);
      } else {
        next.add(macroId);
      }
      return next;
    });
  };

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];

  // Load costs from database
  const loadCostsFromDatabase = useCallback(async () => {
    if (!currentProject?.id) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('scope_costs')
        .select('*')
        .eq('project_id', currentProject.id);

      if (error) throw error;

      if (data && data.length > 0) {
        const costs: ScopeCost[] = data.map(row => ({
          id: row.id,
          scopeId: row.scope_id,
          scopeName: row.scope_name,
          macroId: row.macro_id,
          macroName: row.macro_name,
          macroColor: row.macro_color,
          materialCost: Number(row.material_cost) || 0,
          laborCost: Number(row.labor_cost) || 0,
          equipmentCost: Number(row.equipment_cost) || 0
        }));
        setScopeCosts(costs);
      } else {
        // Initialize with all scopes from macros if no data exists
        const initialCosts: ScopeCost[] = [];
        macros.forEach(macro => {
          macro.scopes.forEach(scope => {
            initialCosts.push({
              scopeId: scope.id,
              scopeName: scope.name,
              macroId: macro.id,
              macroName: macro.name,
              macroColor: macro.color,
              materialCost: 0,
              laborCost: 0,
              equipmentCost: 0
            });
          });
        });
        setScopeCosts(initialCosts);
      }
    } catch (error) {
      console.error('Error loading costs:', error);
      toast.error('Erro ao carregar custos');
    } finally {
      setIsLoading(false);
    }
  }, [currentProject?.id, macros]);

  // Load costs on mount and when project changes
  useEffect(() => {
    loadCostsFromDatabase();
  }, [loadCostsFromDatabase]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!currentProject?.id) return;

    const channel = supabase
      .channel('scope-costs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scope_costs',
          filter: `project_id=eq.${currentProject.id}`
        },
        () => {
          // Reload costs when any change happens
          loadCostsFromDatabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProject?.id, loadCostsFromDatabase]);

  // Load planned productions for projected costs (only future ones)
  useEffect(() => {
    if (!currentProject?.id) return;
    
    const loadPlannedProductions = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('planned_productions')
        .select('id, scope_id, scope_name, macro_id, macro_name, planned_houses, planned_house_ids, week_start, week_end')
        .eq('project_id', currentProject.id)
        .gte('week_end', today);
      
      if (!error && data) {
        setPlannedProductions(data);
      }
    };
    
    loadPlannedProductions();
  }, [currentProject?.id]);

  // Save cost to database
  const saveCostToDatabase = async (cost: ScopeCost) => {
    if (!currentProject?.id) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('scope_costs')
        .upsert({
          project_id: currentProject.id,
          scope_id: cost.scopeId,
          scope_name: cost.scopeName,
          macro_id: cost.macroId,
          macro_name: cost.macroName,
          macro_color: cost.macroColor,
          material_cost: cost.materialCost,
          labor_cost: cost.laborCost,
          equipment_cost: cost.equipmentCost
        }, {
          onConflict: 'project_id,scope_id'
        });

      if (error) throw error;
      
      toast.success("Custos salvos e sincronizados!");
    } catch (error) {
      console.error('Error saving cost:', error);
      toast.error('Erro ao salvar custos');
    } finally {
      setIsSaving(false);
    }
  };

  // Update scope cost
  const handleUpdateCost = async () => {
    if (!editingScope) return;
    
    const updated = scopeCosts.map(c => 
      c.scopeId === editingScope.scopeId ? editingScope : c
    );
    setScopeCosts(updated);
    await saveCostToDatabase(editingScope);
    setEditingScope(null);
  };

  // Handle PDF import
  const handlePdfImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error("Por favor, selecione um arquivo PDF");
      return;
    }

    setIsImporting(true);
    toast.info("Funcionalidade de leitura de PDF em desenvolvimento. Por enquanto, cadastre os valores manualmente.");
    setIsImporting(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Calculate progress for each scope from houses
  const scopeProgress = useMemo(() => {
    const progress: { [scopeId: string]: { completed: number; total: number } } = {};
    
    houses.forEach(house => {
      house.macros.forEach(macro => {
        macro.scopes.forEach(scope => {
          if (!progress[scope.id]) {
            progress[scope.id] = { completed: 0, total: 0 };
          }
          progress[scope.id].total++;
          if (scope.progress === 100) {
            progress[scope.id].completed++;
          }
        });
      });
    });
    
    return progress;
  }, [houses]);

  // Calculate costs based on progress (Realized costs from actual work)
  const costCalculations = useMemo(() => {
    let totalMaterial = 0;
    let totalLabor = 0;
    let totalEquipment = 0;
    let executedMaterial = 0;
    let executedLabor = 0;
    let executedEquipment = 0;

    const byScopeData: { name: string; material: number; labor: number; equipment: number; color: string }[] = [];
    const byMacroData: { [macroId: string]: { name: string; total: number; executed: number; color: string } } = {};

    scopeCosts.forEach(cost => {
      const progress = scopeProgress[cost.scopeId];
      const totalHouses = progress?.total || houses.length;
      const completedHouses = progress?.completed || 0;

      const totalScopeMaterial = cost.materialCost * totalHouses;
      const totalScopeLabor = cost.laborCost * totalHouses;
      const totalScopeEquipment = cost.equipmentCost * totalHouses;

      const execMaterial = cost.materialCost * completedHouses;
      const execLabor = cost.laborCost * completedHouses;
      const execEquipment = cost.equipmentCost * completedHouses;

      totalMaterial += totalScopeMaterial;
      totalLabor += totalScopeLabor;
      totalEquipment += totalScopeEquipment;
      executedMaterial += execMaterial;
      executedLabor += execLabor;
      executedEquipment += execEquipment;

      if (cost.materialCost > 0 || cost.laborCost > 0 || cost.equipmentCost > 0) {
        byScopeData.push({
          name: cost.scopeName,
          material: execMaterial,
          labor: execLabor,
          equipment: execEquipment,
          color: cost.macroColor
        });
      }

      // Group by macro
      if (!byMacroData[cost.macroId]) {
        byMacroData[cost.macroId] = {
          name: cost.macroName,
          total: 0,
          executed: 0,
          color: cost.macroColor
        };
      }
      byMacroData[cost.macroId].total += totalScopeMaterial + totalScopeLabor + totalScopeEquipment;
      byMacroData[cost.macroId].executed += execMaterial + execLabor + execEquipment;
    });

    return {
      total: {
        material: totalMaterial,
        labor: totalLabor,
        equipment: totalEquipment,
        total: totalMaterial + totalLabor + totalEquipment
      },
      executed: {
        material: executedMaterial,
        labor: executedLabor,
        equipment: executedEquipment,
        total: executedMaterial + executedLabor + executedEquipment
      },
      byScopeData: byScopeData.sort((a, b) => (b.material + b.labor + b.equipment) - (a.material + a.labor + a.equipment)).slice(0, 10),
      byMacroData: Object.values(byMacroData).filter(m => m.total > 0)
    };
  }, [scopeCosts, scopeProgress, houses.length]);

  // Calculate projected costs based on planned production (future)
  const projectedCosts = useMemo(() => {
    let projectedMaterial = 0;
    let projectedLabor = 0;
    let projectedEquipment = 0;
    const byPlanData: { week: string; scope: string; houses: number; houseIds: number[]; material: number; labor: number; equipment: number; total: number }[] = [];

    plannedProductions.forEach(planned => {
      const cost = scopeCosts.find(c => c.scopeId === planned.scope_id);
      if (cost) {
        const material = cost.materialCost * planned.planned_houses;
        const labor = cost.laborCost * planned.planned_houses;
        const equipment = cost.equipmentCost * planned.planned_houses;
        
        projectedMaterial += material;
        projectedLabor += labor;
        projectedEquipment += equipment;
        
        byPlanData.push({
          week: `${planned.week_start.split('-').reverse().slice(0, 2).join('/')} - ${planned.week_end.split('-').reverse().slice(0, 2).join('/')}`,
          scope: planned.scope_name,
          houses: planned.planned_houses,
          houseIds: planned.planned_house_ids || [],
          material,
          labor,
          equipment,
          total: material + labor + equipment
        });
      }
    });

    return {
      material: projectedMaterial,
      labor: projectedLabor,
      equipment: projectedEquipment,
      total: projectedMaterial + projectedLabor + projectedEquipment,
      byPlanData
    };
  }, [plannedProductions, scopeCosts]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const pieData = [
    { name: "Material", value: costCalculations.executed.material, color: "#3b82f6" },
    { name: "Mão de Obra", value: costCalculations.executed.labor, color: "#f97316" },
    { name: "Equipamentos", value: costCalculations.executed.equipment, color: "#22c55e" }
  ].filter(d => d.value > 0);

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto para ver os custos
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando custos...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Sync indicator */}
      <div className="flex items-center justify-end gap-2">
        {isSaving ? (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Salvando...
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-green-600">
            <Cloud className="w-3 h-3" />
            Sincronizado
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { 
        const tab = v as "overview" | "details";
        setActiveTab(tab);
        localStorage.setItem(COSTS_TAB_STORAGE_KEY, tab);
      }} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-lg grid-cols-2 h-10">
          <TabsTrigger value="overview" className="gap-2 text-sm">
            <PieChart className="w-4 h-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="details" className="gap-2 text-sm">
            <Calculator className="w-4 h-4" />
            Custos por Serviço
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Summary Cards - Realized Costs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Material Realizado</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(costCalculations.executed.material)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Obra: {formatCurrency(costCalculations.total.material)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Hammer className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Mão de Obra Realizada</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(costCalculations.executed.labor)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Obra: {formatCurrency(costCalculations.total.labor)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Equipamentos Realizado</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(costCalculations.executed.equipment)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Obra: {formatCurrency(costCalculations.total.equipment)}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-primary">Total Realizado</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(costCalculations.executed.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Obra: {formatCurrency(costCalculations.total.total)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Projected Costs from Planned Production */}
          {projectedCosts.total > 0 && (
            <Card className="border-2 border-amber-400/50 bg-gradient-to-br from-amber-50/50 to-amber-100/30 dark:from-amber-900/20 dark:to-amber-800/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-amber-600" />
                  Custos Projetados (Produção Futura)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-background/80 rounded-lg">
                    <p className="text-xs text-muted-foreground font-medium">Material</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(projectedCosts.material)}</p>
                  </div>
                  <div className="p-3 bg-background/80 rounded-lg">
                    <p className="text-xs text-muted-foreground font-medium">Mão de Obra</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(projectedCosts.labor)}</p>
                  </div>
                  <div className="p-3 bg-background/80 rounded-lg">
                    <p className="text-xs text-muted-foreground font-medium">Equipamentos</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(projectedCosts.equipment)}</p>
                  </div>
                  <div className="p-3 bg-amber-200/50 dark:bg-amber-700/30 rounded-lg">
                    <p className="text-xs text-muted-foreground font-medium">Total Projetado</p>
                    <p className="text-xl font-bold text-amber-800 dark:text-amber-300">{formatCurrency(projectedCosts.total)}</p>
                  </div>
                </div>
                
                {/* Detailed breakdown by plan */}
                {projectedCosts.byPlanData.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Detalhamento por Planejamento
                    </p>
                    <ScrollArea className="h-[180px]">
                      <div className="space-y-2">
                        {projectedCosts.byPlanData.map((plan, idx) => (
                          <div key={idx} className="p-3 bg-background/60 rounded-lg border border-amber-200/50">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm font-medium">{plan.scope}</p>
                                <p className="text-xs text-muted-foreground">{plan.week}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(plan.total)}</p>
                                <p className="text-xs text-muted-foreground">{plan.houses} casas</p>
                              </div>
                            </div>
                            {plan.houseIds.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {plan.houseIds.slice(0, 10).map(id => (
                                  <Badge key={id} variant="outline" className="text-xs px-1.5 py-0">
                                    {id}
                                  </Badge>
                                ))}
                                {plan.houseIds.length > 10 && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                                    +{plan.houseIds.length - 10}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Progress Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Progresso do Orçamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {costCalculations.total.total > 0 && (
                    <>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Executado</span>
                          <span className="font-medium">
                            {((costCalculations.executed.total / costCalculations.total.total) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min((costCalculations.executed.total / costCalculations.total.total) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Restante</p>
                          <p className="font-bold text-lg">{formatCurrency(costCalculations.total.total - costCalculations.executed.total)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Total Orçado</p>
                          <p className="font-bold text-lg">{formatCurrency(costCalculations.total.total)}</p>
                        </div>
                      </div>
                    </>
                  )}
                  {costCalculations.total.total === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Cadastre os custos por serviço para ver o progresso
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pie Chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  Distribuição de Custos Realizados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Nenhum custo executado ainda
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bar Chart by Macro */}
          {costCalculations.byMacroData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Custos por Etapa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={costCalculations.byMacroData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} fontSize={10} />
                    <YAxis type="category" dataKey="name" width={120} fontSize={11} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="executed" name="Executado" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="total" name="Total" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="details" className="flex-1 overflow-auto mt-4 space-y-4">
          {!canEdit && (
            <Alert>
              <AlertDescription className="flex items-center gap-2">
                <CloudOff className="w-4 h-4" />
                Você está no modo visualização. Somente editores podem alterar os custos.
              </AlertDescription>
            </Alert>
          )}

          {canEdit && (
            <div className="flex gap-2 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handlePdfImport}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="gap-2"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Importar PDF
              </Button>
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-3">
              {macros.map(macro => {
                const macroScopeCosts = scopeCosts.filter(c => c.macroId === macro.id);
                const macroTotal = macroScopeCosts.reduce((sum, c) => sum + c.materialCost + c.laborCost + c.equipmentCost, 0);
                const isExpanded = expandedMacros.has(macro.id);
                
                return (
                  <Collapsible key={macro.id} open={isExpanded} onOpenChange={() => toggleMacro(macro.id)}>
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: macro.color }}
                              />
                              {macro.name}
                              <Badge variant="outline" className="ml-2 text-xs font-normal">
                                {macro.scopes.length} serviços
                              </Badge>
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {formatCurrency(macroTotal)} / casa
                            </Badge>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0">
                          <div className="space-y-2">
                            {macro.scopes.map(scope => {
                              const cost = scopeCosts.find(c => c.scopeId === scope.id);
                              const isEditing = editingScope?.scopeId === scope.id;
                              const scopeTotal = cost ? cost.materialCost + cost.laborCost + cost.equipmentCost : 0;

                              return (
                                <div
                                  key={scope.id}
                                  className={`p-3 rounded-lg border transition-colors ${
                                    isEditing ? 'bg-accent border-primary' : 'bg-muted/30 hover:bg-muted/50'
                                  }`}
                                >
                                  {isEditing && editingScope ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between">
                                        <p className="font-medium text-sm">{scope.name}</p>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setEditingScope(null)}
                                          >
                                            Cancelar
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={handleUpdateCost}
                                            disabled={isSaving}
                                          >
                                            {isSaving ? (
                                              <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                              'Salvar'
                                            )}
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-3 gap-3">
                                        <div>
                                          <Label className="text-xs">Material (R$)</Label>
                                          <Input
                                            type="number"
                                            value={editingScope.materialCost}
                                            onChange={(e) => setEditingScope({
                                              ...editingScope,
                                              materialCost: Number(e.target.value) || 0
                                            })}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">Mão de Obra (R$)</Label>
                                          <Input
                                            type="number"
                                            value={editingScope.laborCost}
                                            onChange={(e) => setEditingScope({
                                              ...editingScope,
                                              laborCost: Number(e.target.value) || 0
                                            })}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">Equipamentos (R$)</Label>
                                          <Input
                                            type="number"
                                            value={editingScope.equipmentCost}
                                            onChange={(e) => setEditingScope({
                                              ...editingScope,
                                              equipmentCost: Number(e.target.value) || 0
                                            })}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <p className="text-sm font-medium">{scope.name}</p>
                                        {scopeTotal > 0 && (
                                          <div className="flex gap-2 text-xs text-muted-foreground">
                                            {cost && cost.materialCost > 0 && (
                                              <span className="flex items-center gap-1">
                                                <Package className="w-3 h-3 text-blue-500" />
                                                {formatCurrency(cost.materialCost)}
                                              </span>
                                            )}
                                            {cost && cost.laborCost > 0 && (
                                              <span className="flex items-center gap-1">
                                                <Hammer className="w-3 h-3 text-orange-500" />
                                                {formatCurrency(cost.laborCost)}
                                              </span>
                                            )}
                                            {cost && cost.equipmentCost > 0 && (
                                              <span className="flex items-center gap-1">
                                                <Wrench className="w-3 h-3 text-green-500" />
                                                {formatCurrency(cost.equipmentCost)}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={scopeTotal > 0 ? "default" : "secondary"} className="text-xs">
                                          {formatCurrency(scopeTotal)}
                                        </Badge>
                                        {canEdit && (
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7"
                                            onClick={() => {
                                              if (cost) {
                                                setEditingScope(cost);
                                              } else {
                                                // Create new cost entry if doesn't exist
                                                const newCost: ScopeCost = {
                                                  scopeId: scope.id,
                                                  scopeName: scope.name,
                                                  macroId: macro.id,
                                                  macroName: macro.name,
                                                  macroColor: macro.color,
                                                  materialCost: 0,
                                                  laborCost: 0,
                                                  equipmentCost: 0
                                                };
                                                setScopeCosts(prev => [...prev, newCost]);
                                                setEditingScope(newCost);
                                              }
                                            }}
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}