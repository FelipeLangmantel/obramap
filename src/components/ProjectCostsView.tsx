import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { DollarSign, Package, Hammer, Wrench, TrendingUp, PieChart, BarChart3, Calculator, Target, Cloud, ChevronDown, ChevronRight, Home, Loader2, Minimize2, Maximize2, Printer, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BudgetItemsEditor } from "./BudgetItemsEditor";
import { IndirectCostsTab } from "./costs/IndirectCostsTab";
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
  macro_color: string;
  planned_houses: number;
  planned_house_ids: number[];
  week_start: string;
  week_end: string;
  measurement_number: number | null;
}

interface MeasurementCost {
  measurementNumber: number;
  weekStart: string;
  weekEnd: string;
  productions: {
    scopeId: string;
    scopeName: string;
    macroName: string;
    macroColor: string;
    houses: number;
    houseIds: number[];
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    totalCost: number;
  }[];
  totalMaterial: number;
  totalLabor: number;
  totalEquipment: number;
  totalCost: number;
}

const COSTS_TAB_STORAGE_KEY = "obramap_costs_tab";

export function ProjectCostsView() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const { currentStep, advanceToStep } = useProjectSetupFlow();
  const [scopeCosts, setScopeCosts] = useState<ScopeCost[]>([]);
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "indirect">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(COSTS_TAB_STORAGE_KEY);
      if (saved === "overview" || saved === "details" || saved === "indirect") {
        return saved;
      }
    }
    return "details";
  });
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<number>>(new Set());
  const [editingScope, setEditingScope] = useState<{ scopeId: string; macroId: string; scopeName: string } | null>(null);
  const [isUnitCostCollapsed, setIsUnitCostCollapsed] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const savedScrollPosition = useRef<number>(0);

  const toggleMacro = (macroId: string) => {
    setExpandedMacros(prev => {
      const next = new Set(prev);
      if (next.has(macroId)) next.delete(macroId);
      else next.add(macroId);
      return next;
    });
  };

  const toggleMeasurement = (measurementNumber: number) => {
    setExpandedMeasurements(prev => {
      const next = new Set(prev);
      if (next.has(measurementNumber)) next.delete(measurementNumber);
      else next.add(measurementNumber);
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
      // Load scope items and aggregate into costs
      const { data: itemsData, error } = await supabase
        .from('scope_items')
        .select('*')
        .eq('project_id', currentProject.id);

      if (error) throw error;

      // Aggregate items by scope
      const costsByScope: Record<string, ScopeCost> = {};
      
      // Initialize with all scopes
      macros.forEach(macro => {
        macro.scopes.forEach(scope => {
          costsByScope[scope.id] = {
            scopeId: scope.id,
            scopeName: scope.name,
            macroId: macro.id,
            macroName: macro.name,
            macroColor: macro.color,
            materialCost: 0,
            laborCost: 0,
            equipmentCost: 0
          };
        });
      });

      // Sum up costs from items
      if (itemsData) {
        itemsData.forEach(item => {
          const total = Number(item.unit_value) * Number(item.quantity);
          if (costsByScope[item.scope_id]) {
            if (item.category === 'material') {
              costsByScope[item.scope_id].materialCost += total;
            } else if (item.category === 'labor') {
              costsByScope[item.scope_id].laborCost += total;
            } else {
              costsByScope[item.scope_id].equipmentCost += total;
            }
          }
        });
      }

      setScopeCosts(Object.values(costsByScope));

      // ✅ Se existe orçamento (itens), liberar Contrato da Obra para obras novas
      if ((itemsData?.length ?? 0) > 0) {
        if (currentStep === "project_created" || currentStep === "blocks_configured" || currentStep === "services_defined") {
          await advanceToStep("budget_defined");
        }
      }
    } catch (error) {
      console.error('Error loading costs:', error);
      toast.error('Erro ao carregar custos');
    } finally {
      setIsLoading(false);
    }
  }, [currentProject?.id, macros, currentStep, advanceToStep]);

  // Load costs on mount and when project changes
  useEffect(() => {
    loadCostsFromDatabase();
  }, [loadCostsFromDatabase]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!currentProject?.id) return;

    const channel = supabase
      .channel('scope-items-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scope_items',
          filter: `project_id=eq.${currentProject.id}`
        },
        () => {
          loadCostsFromDatabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentProject?.id, loadCostsFromDatabase]);

  // Load execution bank data from RPC for accurate progress
  const [executionBank, setExecutionBank] = useState<Map<string, { executed_houses: number; total_houses: number; completion_percent: number }>>(new Map());

  const loadExecutionBank = useCallback(async () => {
    if (!currentProject?.id) return;
    
    const { data, error } = await supabase.rpc('get_service_execution_bank', { p_project_id: currentProject.id });
    
    if (!error && data) {
      const map = new Map<string, { executed_houses: number; total_houses: number; completion_percent: number }>();
      (data as any[]).forEach((row: any) => {
        // Map by scope_id for matching with scopeCosts
        const key = row.scope_id;
        const existing = map.get(key);
        map.set(key, {
          executed_houses: (existing?.executed_houses || 0) + (Number(row.executed_houses) || 0),
          total_houses: Number(row.total_houses) || 0,
          completion_percent: Number(row.completion_percent) || 0,
        });
      });
      setExecutionBank(map);
    }
  }, [currentProject?.id]);

  useEffect(() => {
    loadExecutionBank();
  }, [loadExecutionBank]);

  // Subscribe to production changes for auto-update
  useEffect(() => {
    if (!currentProject?.id) return;

    const channel = supabase
      .channel('production-changes-costs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productions', filter: `project_id=eq.${currentProject.id}` }, () => loadExecutionBank())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_productions', filter: `project_id=eq.${currentProject.id}` }, () => loadExecutionBank())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id, loadExecutionBank]);

  // Calculate progress for each scope from execution bank (real production data)
  const scopeProgress = useMemo(() => {
    const progress: { [scopeId: string]: { completed: number; total: number } } = {};
    
    executionBank.forEach((value, scopeId) => {
      progress[scopeId] = {
        completed: value.executed_houses,
        total: value.total_houses,
      };
    });
    
    return progress;
  }, [executionBank]);

  // Load planned productions for projected costs
  useEffect(() => {
    if (!currentProject?.id) return;
    
    const loadPlannedProductions = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('planned_productions')
        .select('id, scope_id, scope_name, macro_id, macro_name, macro_color, planned_houses, planned_house_ids, week_start, week_end, measurement_number')
        .eq('project_id', currentProject.id)
        .gte('week_end', today)
        .order('measurement_number', { ascending: true })
        .order('week_start', { ascending: true });
      
      if (!error && data) {
        setPlannedProductions(data as PlannedProduction[]);
      }
    };
    
    loadPlannedProductions();
  }, [currentProject?.id]);

  // Calculate costs based on progress - TOTAL values (unit cost × houses)
  const costCalculations = useMemo(() => {
    let totalMaterial = 0;
    let totalLabor = 0;
    let totalEquipment = 0;
    let executedMaterial = 0;
    let executedLabor = 0;
    let executedEquipment = 0;

    const byMacroData: { [macroId: string]: { name: string; total: number; executed: number; color: string } } = {};

    scopeCosts.forEach(cost => {
      if (cost.materialCost === 0 && cost.laborCost === 0 && cost.equipmentCost === 0) {
        return;
      }

      const progress = scopeProgress[cost.scopeId];
      const totalHouses = progress?.total || houses.length;
      const completedHouses = progress?.completed || 0;

      // Multiply unit cost per house × total houses for total obra
      const totalScopeMaterial = cost.materialCost * totalHouses;
      const totalScopeLabor = cost.laborCost * totalHouses;
      const totalScopeEquipment = cost.equipmentCost * totalHouses;

      // Multiply unit cost per house × completed houses for executed
      const execMaterial = cost.materialCost * completedHouses;
      const execLabor = cost.laborCost * completedHouses;
      const execEquipment = cost.equipmentCost * completedHouses;

      totalMaterial += totalScopeMaterial;
      totalLabor += totalScopeLabor;
      totalEquipment += totalScopeEquipment;
      executedMaterial += execMaterial;
      executedLabor += execLabor;
      executedEquipment += execEquipment;

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
      byMacroData: Object.values(byMacroData).filter(m => m.total > 0)
    };
  }, [scopeCosts, scopeProgress, houses.length]);

  // Calculate unit cost (cost per 1 house)
  const unitCost = useMemo(() => {
    let material = 0;
    let labor = 0;
    let equipment = 0;

    scopeCosts.forEach(cost => {
      material += cost.materialCost;
      labor += cost.laborCost;
      equipment += cost.equipmentCost;
    });

    return {
      material,
      labor,
      equipment,
      total: material + labor + equipment
    };
  }, [scopeCosts]);

  // Calculate projected costs grouped by measurement
  const projectedCosts = useMemo(() => {
    let projectedMaterial = 0;
    let projectedLabor = 0;
    let projectedEquipment = 0;
    
    // Group by measurement number
    const measurementsMap: Record<number, MeasurementCost> = {};

    plannedProductions.forEach(planned => {
      const cost = scopeCosts.find(c => c.scopeId === planned.scope_id);
      const measurementNumber = planned.measurement_number || 1;
      
      if (!measurementsMap[measurementNumber]) {
        measurementsMap[measurementNumber] = {
          measurementNumber,
          weekStart: planned.week_start,
          weekEnd: planned.week_end,
          productions: [],
          totalMaterial: 0,
          totalLabor: 0,
          totalEquipment: 0,
          totalCost: 0
        };
      }
      
      // Update date range for the measurement
      if (planned.week_start < measurementsMap[measurementNumber].weekStart) {
        measurementsMap[measurementNumber].weekStart = planned.week_start;
      }
      if (planned.week_end > measurementsMap[measurementNumber].weekEnd) {
        measurementsMap[measurementNumber].weekEnd = planned.week_end;
      }
      
      if (cost) {
        const materialCost = cost.materialCost * planned.planned_houses;
        const laborCost = cost.laborCost * planned.planned_houses;
        const equipmentCost = cost.equipmentCost * planned.planned_houses;
        const totalCost = materialCost + laborCost + equipmentCost;
        
        projectedMaterial += materialCost;
        projectedLabor += laborCost;
        projectedEquipment += equipmentCost;
        
        measurementsMap[measurementNumber].productions.push({
          scopeId: planned.scope_id,
          scopeName: planned.scope_name,
          macroName: planned.macro_name,
          macroColor: planned.macro_color,
          houses: planned.planned_houses,
          houseIds: planned.planned_house_ids || [],
          materialCost,
          laborCost,
          equipmentCost,
          totalCost
        });
        
        measurementsMap[measurementNumber].totalMaterial += materialCost;
        measurementsMap[measurementNumber].totalLabor += laborCost;
        measurementsMap[measurementNumber].totalEquipment += equipmentCost;
        measurementsMap[measurementNumber].totalCost += totalCost;
      }
    });
    
    // Convert to sorted array
    const byMeasurement = Object.values(measurementsMap).sort((a, b) => a.measurementNumber - b.measurementNumber);

    return {
      material: projectedMaterial,
      labor: projectedLabor,
      equipment: projectedEquipment,
      total: projectedMaterial + projectedLabor + projectedEquipment,
      byMeasurement
    };
  }, [plannedProductions, scopeCosts]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Print budget function - PDF
  const printBudget = async (format: 'analytical' | 'synthetic') => {
    setIsPrinting(true);
    
    try {
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let y = 20;

      // Load all scope items for the project
      const { data: itemsData, error } = await supabase
        .from('scope_items')
        .select('*')
        .eq('project_id', currentProject?.id);

      if (error) throw error;

      // Header
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`ORÇAMENTO - ${currentProject?.name}`, pageWidth / 2, y, { align: 'center' });
      
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Contratante: ${currentProject?.contractor}`, margin, y);
      y += 5;
      doc.text(`Local: ${currentProject?.location}`, margin, y);
      y += 5;
      doc.text(`Total de Casas: ${houses.length}`, margin, y);
      y += 5;
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, y);
      
      y += 10;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      if (format === 'analytical') {
        // Analytical - detailed view by macro and scope
        macros.forEach(macro => {
          // Check if we need a new page
          if (y > 260) {
            doc.addPage();
            y = 20;
          }
          
          // Macro header
          doc.setFillColor(70, 130, 180);
          doc.roundedRect(margin, y, pageWidth - 2 * margin, 7, 2, 2, 'F');
          doc.setTextColor(255);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(macro.name, margin + 3, y + 5);
          y += 12;
          doc.setTextColor(0);
          
          macro.scopes.forEach(scope => {
            const scopeItems = itemsData?.filter(item => item.scope_id === scope.id) || [];
            if (scopeItems.length === 0) return;
            
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            
            // Scope header
            doc.setFillColor(240, 240, 240);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 6, 1, 1, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`  ${scope.name}`, margin, y + 4.5);
            const scopeTotal = scopeItems.reduce((sum, i) => sum + Number(i.unit_value) * Number(i.quantity), 0);
            doc.text(formatCurrency(scopeTotal), pageWidth - margin - 3, y + 4.5, { align: 'right' });
            y += 9;
            
            // Items
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            scopeItems.forEach(item => {
              if (y > 275) {
                doc.addPage();
                y = 20;
              }
              
              const total = Number(item.unit_value) * Number(item.quantity);
              const categoryIcon = item.category === 'material' ? '[M]' : item.category === 'labor' ? '[O]' : '[E]';
              
              // Item name with word wrap
              const itemName = `${categoryIcon} ${item.name}`;
              const maxWidth = 90;
              const lines = doc.splitTextToSize(itemName, maxWidth);
              
              doc.text(lines, margin + 4, y + 3);
              doc.text(`${item.quantity} ${item.unit}`, pageWidth - 70, y + 3);
              doc.text(formatCurrency(Number(item.unit_value)), pageWidth - 45, y + 3);
              doc.text(formatCurrency(total), pageWidth - margin - 3, y + 3, { align: 'right' });
              
              y += 4 * lines.length + 2;
            });
            
            y += 3;
          });
          
          y += 5;
        });
      } else {
        // Synthetic - summary by macro
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Etapa', margin, y);
        doc.text('Material', pageWidth - 85, y);
        doc.text('M.Obra', pageWidth - 60, y);
        doc.text('Equip.', pageWidth - 40, y);
        doc.text('Total', pageWidth - margin, y, { align: 'right' });
        y += 3;
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
        
        doc.setFont('helvetica', 'normal');
        let totalMaterial = 0, totalLabor = 0, totalEquipment = 0;
        
        macros.forEach(macro => {
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
          
          const macroScopeCosts = scopeCosts.filter(c => c.macroId === macro.id);
          const macroMaterial = macroScopeCosts.reduce((sum, c) => sum + c.materialCost, 0);
          const macroLabor = macroScopeCosts.reduce((sum, c) => sum + c.laborCost, 0);
          const macroEquipment = macroScopeCosts.reduce((sum, c) => sum + c.equipmentCost, 0);
          const macroTotal = macroMaterial + macroLabor + macroEquipment;
          
          totalMaterial += macroMaterial;
          totalLabor += macroLabor;
          totalEquipment += macroEquipment;
          
          const macroName = macro.name.length > 25 ? macro.name.substring(0, 25) + '...' : macro.name;
          doc.text(macroName, margin, y);
          doc.text(formatCurrency(macroMaterial), pageWidth - 85, y);
          doc.text(formatCurrency(macroLabor), pageWidth - 60, y);
          doc.text(formatCurrency(macroEquipment), pageWidth - 40, y);
          doc.text(formatCurrency(macroTotal), pageWidth - margin, y, { align: 'right' });
          y += 6;
        });
        
        // Totals
        y += 3;
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL POR CASA', margin, y);
        doc.text(formatCurrency(totalMaterial), pageWidth - 85, y);
        doc.text(formatCurrency(totalLabor), pageWidth - 60, y);
        doc.text(formatCurrency(totalEquipment), pageWidth - 40, y);
        doc.text(formatCurrency(totalMaterial + totalLabor + totalEquipment), pageWidth - margin, y, { align: 'right' });
        
        y += 8;
        doc.setFillColor(230, 230, 255);
        doc.roundedRect(margin, y - 4, pageWidth - 2 * margin, 10, 2, 2, 'F');
        doc.setFontSize(11);
        doc.text(`TOTAL DA OBRA (${houses.length} casas): ${formatCurrency((totalMaterial + totalLabor + totalEquipment) * houses.length)}`, pageWidth / 2, y + 2, { align: 'center' });
      }
      
      // Footer with page numbers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      }
      
      // Save PDF
      const fileName = `orcamento_${currentProject?.name.replace(/\s+/g, '_')}_${format}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast.success(`Orçamento ${format === 'analytical' ? 'analítico' : 'sintético'} em PDF gerado!`);
    } catch (error) {
      console.error('Error printing:', error);
      toast.error('Erro ao gerar PDF do orçamento');
    } finally {
      setIsPrinting(false);
    }
  };

  // Save scroll position before editing
  const handleEditScope = (scopeId: string, macroId: string, scopeName: string) => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        savedScrollPosition.current = viewport.scrollTop;
      }
    }
    setEditingScope({ scopeId, macroId, scopeName });
  };

  // Restore scroll position after editing
  const handleBackFromEdit = () => {
    setEditingScope(null);
    loadCostsFromDatabase();
    // Restore scroll position after a small delay to allow DOM to update
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = savedScrollPosition.current;
        }
      }
    }, 100);
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
      <Tabs value={activeTab} onValueChange={(v) => { 
        const tab = v as "overview" | "details" | "indirect";
        setActiveTab(tab);
        localStorage.setItem(COSTS_TAB_STORAGE_KEY, tab);
      }} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3 h-10">
          <TabsTrigger value="details" className="gap-2 text-sm">
            <Calculator className="w-4 h-4" />
            Orçamento
          </TabsTrigger>
          <TabsTrigger value="indirect" className="gap-2 text-sm">
            <Building2 className="w-4 h-4" />
            Indiretos
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2 text-sm">
            <PieChart className="w-4 h-4" />
            Visão Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Collapsible Unit Cost Card */}
          <Collapsible open={!isUnitCostCollapsed} onOpenChange={(open) => setIsUnitCostCollapsed(!open)}>
            <Card className={`border-2 border-secondary/50 bg-gradient-to-br from-secondary/10 to-secondary/5 dark:from-secondary/20 dark:to-secondary/10 transition-all ${isUnitCostCollapsed ? 'py-0' : ''}`}>
              <CollapsibleTrigger asChild>
                <CardHeader className={`cursor-pointer hover:bg-secondary/10 dark:hover:bg-secondary/20 transition-colors ${isUnitCostCollapsed ? 'py-3' : 'pb-3'}`}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Home className="w-5 h-5 text-secondary" />
                      Custo por Unidade Habitacional
                      {isUnitCostCollapsed && (
                        <Badge variant="secondary" className="ml-2 text-secondary-foreground">
                          {formatCurrency(unitCost.total)}
                        </Badge>
                      )}
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      {isUnitCostCollapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-background/80 rounded-lg">
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Package className="w-3 h-3 text-blue-500" />
                        Material
                      </p>
                      <p className="text-xl font-bold text-secondary dark:text-secondary-foreground">{formatCurrency(unitCost.material)}</p>
                    </div>
                    <div className="p-3 bg-background/80 rounded-lg">
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Hammer className="w-3 h-3 text-orange-500" />
                        Mão de Obra
                      </p>
                      <p className="text-xl font-bold text-secondary dark:text-secondary-foreground">{formatCurrency(unitCost.labor)}</p>
                    </div>
                    <div className="p-3 bg-background/80 rounded-lg">
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-green-500" />
                        Equipamentos
                      </p>
                      <p className="text-xl font-bold text-secondary dark:text-secondary-foreground">{formatCurrency(unitCost.equipment)}</p>
                    </div>
                    <div className="p-3 bg-secondary/20 dark:bg-secondary/30 rounded-lg">
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Total Unitário
                      </p>
                      <p className="text-2xl font-bold text-secondary dark:text-secondary-foreground">{formatCurrency(unitCost.total)}</p>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Print Budget Button */}
          {!editingScope && (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2" disabled={isPrinting}>
                    <Printer className="w-4 h-4" />
                    {isPrinting ? 'Exportando...' : 'Imprimir Orçamento'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => printBudget('analytical')}>
                    Analítico (detalhado)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => printBudget('synthetic')}>
                    Sintético (resumo)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Scope editor inline or macro list */}
          {editingScope ? (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calculator className="w-4 h-4" />
                    {editingScope.scopeName}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={handleBackFromEdit}>
                    Voltar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <BudgetItemsEditor
                  projectId={currentProject.id}
                  scopeId={editingScope.scopeId}
                  macroId={editingScope.macroId}
                  scopeName={editingScope.scopeName}
                  compact
                />
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-380px)]" ref={scrollAreaRef}>
              <div className="space-y-3">
                {macros.map(macro => {
                  const macroScopeCosts = scopeCosts.filter(c => c.macroId === macro.id);
                  const macroTotal = macroScopeCosts.reduce((sum, c) => sum + c.materialCost + c.laborCost + c.equipmentCost, 0);
                  const macroWeightPercent = unitCost.total > 0 ? (macroTotal / unitCost.total * 100) : 0;
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
                                <Badge className="ml-1 text-xs bg-primary/20 text-primary">
                                  {macroWeightPercent.toFixed(1)}%
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
                                const scopeTotal = cost ? cost.materialCost + cost.laborCost + cost.equipmentCost : 0;
                                const weightPercent = unitCost.total > 0 ? (scopeTotal / unitCost.total * 100) : 0;

                                return (
                                  <div
                                    key={scope.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => handleEditScope(scope.id, macro.id, scope.name)}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-sm">{scope.name}</p>
                                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                                          {weightPercent.toFixed(1)}%
                                        </Badge>
                                      </div>
                                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
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
                                      <p className="font-bold">{formatCurrency(scopeTotal)}</p>
                                      <p className="text-xs text-muted-foreground">por casa</p>
                                    </div>
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
          )}
        </TabsContent>

        <TabsContent value="indirect" className="flex-1 overflow-auto mt-4">
          <IndirectCostsTab />
        </TabsContent>

        <TabsContent value="overview" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Summary Cards - show executed totals and total obra */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Material</span>
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
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Mão de Obra</span>
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
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Equipamentos</span>
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
                  <span className="text-xs font-medium text-primary">Total</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(costCalculations.executed.total)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total Obra: {formatCurrency(costCalculations.total.total)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Projected Costs */}
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
                
                {projectedCosts.byMeasurement.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Detalhamento por Medição
                    </p>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-2">
                        {projectedCosts.byMeasurement.map((measurement) => {
                          const isExpanded = expandedMeasurements.has(measurement.measurementNumber);
                          const weekRange = `${measurement.weekStart.split('-').reverse().slice(0, 2).join('/')} - ${measurement.weekEnd.split('-').reverse().slice(0, 2).join('/')}`;
                          
                          return (
                            <Collapsible key={measurement.measurementNumber} open={isExpanded} onOpenChange={() => toggleMeasurement(measurement.measurementNumber)}>
                              <CollapsibleTrigger asChild>
                                <div className="p-3 bg-background/60 rounded-lg border border-amber-200/50 cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-900/20 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      <div>
                                        <p className="text-sm font-medium">Medição {measurement.measurementNumber}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {weekRange} • {measurement.productions.reduce((sum, p) => sum + p.houses, 0)} casas • {measurement.productions.length} serviços
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(measurement.totalCost)}</p>
                                      <div className="flex gap-2 text-xs text-muted-foreground">
                                        <span>Mat: {formatCurrency(measurement.totalMaterial)}</span>
                                        <span>MO: {formatCurrency(measurement.totalLabor)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-1 ml-6 space-y-1">
                                  {measurement.productions.map((prod, idx) => (
                                    <div key={idx} className="p-2 bg-muted/30 rounded border border-muted flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: prod.macroColor }} />
                                        <div>
                                          <p className="text-xs font-medium">{prod.scopeName}</p>
                                          <p className="text-xs text-muted-foreground">{prod.macroName} • {prod.houses} casas</p>
                                        </div>
                                      </div>
                                      <div className="text-right text-xs">
                                        <p className="font-medium">{formatCurrency(prod.totalCost)}</p>
                                        <p className="text-muted-foreground">
                                          M: {formatCurrency(prod.materialCost)} | MO: {formatCurrency(prod.laborCost)} | EQ: {formatCurrency(prod.equipmentCost)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Charts */}
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

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <PieChart className="w-4 h-4" />
                  Distribuição de Custos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <div className="space-y-3">
                    <ResponsiveContainer width="100%" height={180}>
                      <RechartsPieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          label={false}
                          labelLine={false}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-3">
                      {pieData.map((entry) => {
                        const percent = costCalculations.executed.total > 0 ? ((entry.value / costCalculations.executed.total) * 100).toFixed(0) : "0";
                        return (
                          <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="font-medium">{entry.name}: {percent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Nenhum custo cadastrado ainda
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
      </Tabs>
    </div>
  );
}