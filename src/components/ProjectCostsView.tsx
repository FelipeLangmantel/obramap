import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Pencil, Trash2, DollarSign, Package, Hammer, Wrench, TrendingUp, PieChart, BarChart3, Calculator, Upload, FileText, Loader2, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConstruction } from "@/contexts/ConstructionContext";
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

const COSTS_STORAGE_KEY = "obramap_scope_costs";
const COSTS_TAB_STORAGE_KEY = "obramap_costs_tab";

export function ProjectCostsView() {
  const { currentProject } = useConstruction();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];

  // Load saved costs
  useEffect(() => {
    if (currentProject?.id) {
      const savedData = localStorage.getItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`);
      if (savedData) {
        setScopeCosts(JSON.parse(savedData));
      } else {
        // Initialize with all scopes from macros
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
    }
  }, [currentProject?.id, macros]);

  // Load planned productions for projected costs (only future ones)
  useEffect(() => {
    if (!currentProject?.id) return;
    
    const loadPlannedProductions = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('planned_productions')
        .select('id, scope_id, scope_name, macro_id, macro_name, planned_houses, planned_house_ids, week_start, week_end')
        .eq('project_id', currentProject.id)
        .gte('week_end', today); // Only future productions
      
      if (!error && data) {
        setPlannedProductions(data);
      }
    };
    
    loadPlannedProductions();
  }, [currentProject?.id]);

  // Save costs
  const saveCosts = (costs: ScopeCost[]) => {
    if (currentProject?.id) {
      localStorage.setItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`, JSON.stringify(costs));
      setScopeCosts(costs);
    }
  };

  // Update scope cost
  const handleUpdateCost = () => {
    if (!editingScope) return;
    
    const updated = scopeCosts.map(c => 
      c.scopeId === editingScope.scopeId ? editingScope : c
    );
    saveCosts(updated);
    setEditingScope(null);
    toast.success("Custos atualizados!");
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
    
    // Reset input
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

    // Sum up costs from planned productions
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

  return (
    <div className="space-y-4 h-full flex flex-col">
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
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Casas:</span> {plan.houseIds.join(', ')}
                                </p>
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

          {/* Progress Indicator */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Progresso dos Custos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Custo Realizado vs Total da Obra</span>
                  <span className="font-medium">
                    {costCalculations.total.total > 0 
                      ? Math.round((costCalculations.executed.total / costCalculations.total.total) * 100)
                      : 0
                    }%
                  </span>
                </div>
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500"
                    style={{ 
                      width: `${costCalculations.total.total > 0 
                        ? Math.min(100, (costCalculations.executed.total / costCalculations.total.total) * 100)
                        : 0
                      }%` 
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Realizado: {formatCurrency(costCalculations.executed.total)}</span>
                  <span>Total Obra: {formatCurrency(costCalculations.total.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pie Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Distribuição por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={95}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={2} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value) => formatCurrency(Number(value))}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Configure os custos dos serviços para ver o gráfico
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bar Chart by Macro */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Custos por Etapa</CardTitle>
              </CardHeader>
              <CardContent>
                {costCalculations.byMacroData.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={costCalculations.byMacroData} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          type="number" 
                          tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`}
                          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={120} 
                          tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
                        />
                        <Tooltip 
                          formatter={(value) => formatCurrency(Number(value))}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--popover))', 
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Legend 
                          wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                        />
                        <Bar dataKey="total" name="Total Obra" fill="hsl(var(--muted))" opacity={0.6} radius={[0, 4, 4, 0]} />
                        <Bar dataKey="executed" name="Realizado" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Configure os custos dos serviços para ver o gráfico
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="details" className="flex-1 overflow-auto mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Custos por Serviço
                  <Badge variant="outline" className="ml-2">
                    Valores por unidade
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfImport}
                    className="hidden"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    Importar PDF
                  </Button>
                </div>
              </div>
              <Alert className="mt-3 border-blue-500/50 bg-blue-500/10">
                <FileText className="h-4 w-4 text-blue-500" />
                <AlertDescription className="text-xs">
                  Você pode importar um orçamento em PDF ou cadastrar os valores manualmente abaixo.
                </AlertDescription>
              </Alert>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-350px)] min-h-[400px]">
                <div className="space-y-4">
                  {macros.map(macro => (
                    <div key={macro.id} className="space-y-2">
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary/30 rounded-lg">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: macro.color }}
                        />
                        <span className="text-sm font-medium">{macro.name}</span>
                      </div>
                      
                      <div className="space-y-1.5 pl-3">
                        {macro.scopes.map(scope => {
                          const cost = scopeCosts.find(c => c.scopeId === scope.id);
                          const isEditing = editingScope?.scopeId === scope.id;
                          const progress = scopeProgress[scope.id];
                          const totalCostPerUnit = (cost?.materialCost || 0) + (cost?.laborCost || 0) + (cost?.equipmentCost || 0);
                          
                          return (
                            <div 
                              key={scope.id}
                              className="flex items-center gap-3 p-3 rounded-lg bg-card border hover:border-primary/30 transition-colors"
                            >
                              {isEditing ? (
                                <div className="flex-1 flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium min-w-[120px]">{scope.name}</span>
                                  <div className="flex items-center gap-1">
                                    <Package className="w-3.5 h-3.5 text-blue-500" />
                                    <Input
                                      type="number"
                                      value={editingScope.materialCost}
                                      onChange={(e) => setEditingScope({
                                        ...editingScope,
                                        materialCost: parseFloat(e.target.value) || 0
                                      })}
                                      className="h-8 w-24"
                                      placeholder="Material"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Hammer className="w-3.5 h-3.5 text-orange-500" />
                                    <Input
                                      type="number"
                                      value={editingScope.laborCost}
                                      onChange={(e) => setEditingScope({
                                        ...editingScope,
                                        laborCost: parseFloat(e.target.value) || 0
                                      })}
                                      className="h-8 w-24"
                                      placeholder="M.O."
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Wrench className="w-3.5 h-3.5 text-green-500" />
                                    <Input
                                      type="number"
                                      value={editingScope.equipmentCost}
                                      onChange={(e) => setEditingScope({
                                        ...editingScope,
                                        equipmentCost: parseFloat(e.target.value) || 0
                                      })}
                                      className="h-8 w-24"
                                      placeholder="Equip."
                                    />
                                  </div>
                                  <Button size="sm" onClick={handleUpdateCost}>Salvar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingScope(null)}>X</Button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium">{scope.name}</span>
                                      {progress && (
                                        <Badge variant="secondary" className="text-[10px]">
                                          {progress.completed}/{progress.total}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Package className="w-3 h-3 text-blue-500" />
                                        {formatCurrency(cost?.materialCost || 0)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Hammer className="w-3 h-3 text-orange-500" />
                                        {formatCurrency(cost?.laborCost || 0)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Wrench className="w-3 h-3 text-green-500" />
                                        {formatCurrency(cost?.equipmentCost || 0)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold">{formatCurrency(totalCostPerUnit)}</p>
                                    <p className="text-[10px] text-muted-foreground">por unidade</p>
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => cost && setEditingScope({ ...cost })}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
