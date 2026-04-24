import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
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
  Pencil,
  Target,
  Trash2,
  AlertTriangle,
  Percent,
  Settings2,
  ClipboardCheck,
  RotateCcw,
  Plus,
  Info
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { EditProductionDialog } from "./EditProductionDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Maximize2, Clock, User } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, parseISO, isWithinInterval, addWeeks, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MeasurementSelector } from "./production/MeasurementSelector";
import { useMeasurements, MeasurementWithServices, MeasurementService } from "@/hooks/useMeasurements";
import DiarioTabContent from "./weekly-production/DiarioTabContent";
import { ObraHistoricoPanel } from "./production/ObraHistoricoPanel";
import { WeatherPeriodPanel } from "./production/WeatherPeriodPanel";
import { useQueryClient } from "@tanstack/react-query";

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
  updated_at: string;
  notes: string | null;
  is_initial_database: boolean;
  created_by_user_id: string | null;
  created_by_name: string | null;
}

interface PlannedPeriod {
  id: string;
  week_start: string;
  week_end: string;
  scope_name: string;
  scope_id: string;
  macro_name: string;
  macro_id: string;
  macro_color?: string;
  planned_house_ids: number[];
  planned_houses: number;
  measurement_number: number | null;
}

const FILTER_STORAGE_KEY = "obramap_production_filters";
const TAB_STORAGE_KEY = "obramap_production_tab";
const INITIAL_DB_STORAGE_KEY = "obramap_initial_database_mode";

function ProductionRecordItem({ prod, canEdit, podeExcluir, onEdit, onDelete, showFullDetails = false }: {
  prod: WeeklyProduction;
  canEdit: boolean;
  podeExcluir: boolean;
  onEdit: () => void;
  onDelete: () => void;
  showFullDetails?: boolean;
}) {
  return (
    <div 
      className={`flex items-start gap-3 p-2.5 rounded-lg border hover:bg-accent/30 transition-colors ${canEdit ? 'cursor-pointer' : ''} ${prod.is_initial_database ? 'border-amber-500/30 bg-amber-500/5' : ''}`}
      onClick={() => { if (canEdit) onEdit(); }}
    >
      <div 
        className="w-3 h-3 rounded-full flex-shrink-0 mt-1" 
        style={{ backgroundColor: prod.macro_color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{prod.scope_name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="uppercase">{prod.macro_name}</span> • {format(parseISO(prod.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(prod.week_end), "dd/MM", { locale: ptBR })}
        </p>
        {showFullDetails && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Casas: {prod.house_ids.join(", ")}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(parseISO(prod.updated_at || prod.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
          {prod.created_by_name && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {prod.created_by_name}
            </span>
          )}
        </div>
      </div>
      <div className="text-right flex items-center gap-2 flex-shrink-0">
        <div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">{prod.houses_count} casas</Badge>
            {prod.is_initial_database && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/50">Inicial</Badge>
            )}
          </div>
          {!showFullDetails && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {prod.house_ids.slice(0, 4).join(", ")}
              {prod.house_ids.length > 4 && `... +${prod.house_ids.length - 4}`}
            </p>
          )}
        </div>
        {canEdit && !(prod.is_initial_database && !podeExcluir) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {podeExcluir && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {prod.is_initial_database && !podeExcluir && (
          <span
            className="text-muted-foreground inline-flex items-center"
            title="Banco Inicial — edição restrita a administradores"
          >
            🔒
          </span>
        )}
      </div>
    </div>
  );
}

export function WeeklyProductionView() {
  const { currentProject, updateBatchScopeProgress, refreshHousesFromDB } = useConstruction();
  const queryClient = useQueryClient();
  const { canEdit, profile, isCompanyAdmin, isSystemAdmin, user } = useAuth();
  const podeExcluir = isCompanyAdmin || isSystemAdmin;
  
  // Load saved tab from localStorage
  const [activeTab, setActiveTab] = useState<"register" | "analysis" | "diario" | "historico" | "obra">(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === "register" || saved === "analysis" || saved === "diario" || saved === "historico" || saved === "obra") {
        return saved as any;
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
  
  // Analysis filters with global persistence (same for all projects)
  const [analysisPeriod, setAnalysisPeriod] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`${FILTER_STORAGE_KEY}_period`) || "1week_back";
    }
    return "1week_back";
  });
  const [analysisStartDate, setAnalysisStartDate] = useState<string>(format(subWeeks(new Date(), 1), "yyyy-MM-dd"));
  const [analysisEndDate, setAnalysisEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [analysisHouseFilter, setAnalysisHouseFilter] = useState<string>("");
  const [analysisMacroFilter, setAnalysisMacroFilter] = useState<string>("");
  const [analysisScopeFilter, setAnalysisScopeFilter] = useState<string>("");
  
  const [productions, setProductions] = useState<WeeklyProduction[]>([]);
  const [plannedPeriods, setPlannedPeriods] = useState<PlannedPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingProduction, setEditingProduction] = useState<WeeklyProduction | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productionToDelete, setProductionToDelete] = useState<WeeklyProduction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [justificativaExclusao, setJustificativaExclusao] = useState("");
  const [deletionLog, setDeletionLog] = useState<any[]>([]);
  const [correcaoLog, setCorrecaoLog] = useState<any[]>([]);
  const [filtroHistorico, setFiltroHistorico] = useState<"todos"|"exclusoes"|"correcoes">("todos");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [duplicataDialogOpen, setDuplicataDialogOpen] = useState(false);
  const [casasDuplicatas, setCasasDuplicatas] = useState<number[]>([]);
  const [pendingInsert, setPendingInsert] = useState<(() => Promise<void>) | null>(null);
  // Custom percentage mode
  const [customPercentMode, setCustomPercentMode] = useState(false);
  const [massPercentage, setMassPercentage] = useState(100);
  const [housePercentages, setHousePercentages] = useState<Record<number, number>>({});
  
  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const dragStartRef = useRef<number | null>(null);

  // C2: Released weekly planning state
  const [releasedWeeks, setReleasedWeeks] = useState<any[]>([]);
  const [releasedWeekServices, setReleasedWeekServices] = useState<any[]>([]);
  const [selectedReleasedWeek, setSelectedReleasedWeek] = useState<any | null>(null);
  const [selectedReleasedService, setSelectedReleasedService] = useState<any | null>(null);
  const [planViewMode, setPlanViewMode] = useState<'service' | 'contractor'>('service');
  // C3: Deviation alerts state
  const [deviationAlerts, setDeviationAlerts] = useState<any[]>([]);
  
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [deviationReason, setDeviationReason] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];
  useEffect(() => {
    const savedPeriod = localStorage.getItem(`${FILTER_STORAGE_KEY}_period`);
    if (savedPeriod) {
      setAnalysisPeriod(savedPeriod);
    }
  }, []);

  // Save period filter to localStorage (global)
  useEffect(() => {
    localStorage.setItem(`${FILTER_STORAGE_KEY}_period`, analysisPeriod);
  }, [analysisPeriod]);

  // Reset other filters when project changes
  useEffect(() => {
    setAnalysisHouseFilter("");
    setAnalysisMacroFilter("");
    setAnalysisScopeFilter("");
  }, [currentProject?.id]);

  // C2: Load released weeks when project changes
  useEffect(() => {
    if (!currentProject?.id) return;
    supabase
      .from('weekly_plan_weeks')
      .select(`
        id, week_number, week_start, week_end,
        planning_periods!inner(period_number, status)
      `)
      .eq('project_id', currentProject.id)
      .in('planning_periods.status', ['released_to_weekly', 'closed'])
      .order('week_start', { ascending: false })
      .then(({ data }) => setReleasedWeeks(data || []));
  }, [currentProject?.id]);

  // C3: Load deviation alerts
  const loadDeviationAlerts = useCallback(async () => {
    if (!currentProject?.id) return;
    const { data } = await supabase
      .from('production_deviations')
      .select('*')
      .eq('project_id', currentProject.id)
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false });
    setDeviationAlerts(data || []);
  }, [currentProject?.id]);

  useEffect(() => {
    loadDeviationAlerts();
  }, [loadDeviationAlerts]);

  const openDeviationAlertCount = useMemo(() => 
    deviationAlerts.filter(a => a.status === 'open').length
  , [deviationAlerts]);

  // C2: Select released week handler
  const onSelectReleasedWeek = async (weekId: string) => {
    const week = releasedWeeks.find(w => w.id === weekId) || null;
    setSelectedReleasedWeek(week);
    setSelectedReleasedService(null);
    if (!weekId) { setReleasedWeekServices([]); return; }
    const { data } = await supabase
      .from('weekly_plan_services')
      .select('*')
      .eq('weekly_plan_week_id', weekId);
    // Check which services already have production registered
    const serviceIds = (data || []).map(s => s.id);
    let registeredServiceIds: string[] = [];
    if (serviceIds.length > 0) {
      const { data: prods } = await supabase
        .from('weekly_productions')
        .select('weekly_plan_service_id')
        .in('weekly_plan_service_id', serviceIds)
        .is('deleted_at', null);
      registeredServiceIds = (prods || []).map(p => p.weekly_plan_service_id).filter(Boolean) as string[];
    }
    setReleasedWeekServices((data || []).map(s => ({
      ...s,
      _registered: registeredServiceIds.includes(s.id)
    })));
  };

  // C2: Apply released service to form
  const applyReleasedService = (svc: any) => {
    setSelectedReleasedService(svc);
    setSelectedMacro(svc.macro_id);
    setTimeout(() => setSelectedScope(svc.scope_id), 100);
    setSelectedHouses(svc.planned_house_ids || []);
    if (selectedReleasedWeek) {
      setMeasurementStartDate(selectedReleasedWeek.week_start);
      setMeasurementEndDate(selectedReleasedWeek.week_end);
    }
  };
  
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
          setAnalysisEndDate(format(addWeeks(now, 4), "yyyy-MM-dd"));
        }
        break;
      case "1week_forward":
        setAnalysisStartDate(format(now, "yyyy-MM-dd"));
        setAnalysisEndDate(format(addWeeks(now, 1), "yyyy-MM-dd"));
        break;
      case "2weeks_forward":
        setAnalysisStartDate(format(now, "yyyy-MM-dd"));
        setAnalysisEndDate(format(addWeeks(now, 2), "yyyy-MM-dd"));
        break;
      case "1week_back":
        setAnalysisStartDate(format(subWeeks(now, 1), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
        break;
      case "2weeks_back":
        setAnalysisStartDate(format(subWeeks(now, 2), "yyyy-MM-dd"));
        setAnalysisEndDate(format(now, "yyyy-MM-dd"));
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

  // Use new measurements hook
  const { 
    measurementsWithServices,
    getRegisteredServiceIds,
    registerProduction: registerNewProduction,
    isLoading: isMeasurementsLoading
  } = useMeasurements({ projectId: currentProject?.id });

  // Selected measurement from new system - reset on project change
  const [selectedMeasurementNew, setSelectedMeasurementNew] = useState<MeasurementWithServices | null>(null);
  const [selectedServiceNew, setSelectedServiceNew] = useState<MeasurementService | null>(null);
  
  // Reset measurement selection when project changes or measurements reload
  useEffect(() => {
    setSelectedMeasurementNew(null);
    setSelectedServiceNew(null);
  }, [currentProject?.id]);
  
  // Validate selected measurement still exists after data reload
  useEffect(() => {
    if (selectedMeasurementNew && measurementsWithServices.length > 0) {
      const stillExists = measurementsWithServices.find(m => m.id === selectedMeasurementNew.id);
      if (!stillExists) {
        setSelectedMeasurementNew(null);
        setSelectedServiceNew(null);
      } else {
        // Update with fresh data
        setSelectedMeasurementNew(stillExists);
        // Validate selected service
        if (selectedServiceNew) {
          const serviceExists = stillExists.services.find(s => s.id === selectedServiceNew.id);
          if (!serviceExists) {
            setSelectedServiceNew(null);
          }
        }
      }
    }
  }, [measurementsWithServices]);

  // Load productions and planned periods (legacy support)
  useEffect(() => {
    if (!currentProject) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      // Load productions and planned periods in parallel
      const [productionsResult, plannedResult] = await Promise.all([
        supabase
          .from('weekly_productions')
          .select('*')
          .eq('project_id', currentProject.id)
          .is('deleted_at', null)
          .order('week_start', { ascending: false }),
        supabase
          .from('planned_productions')
          .select('id, week_start, week_end, scope_name, scope_id, macro_name, macro_id, macro_color, planned_house_ids, planned_houses, measurement_number')
          .eq('project_id', currentProject.id)
          .order('week_start', { ascending: true })
      ]);

      if (productionsResult.error) {
        console.error('Error loading productions:', productionsResult.error);
      } else {
        setProductions(productionsResult.data || []);
      }

      if (plannedResult.error) {
        console.error('Error loading planned periods:', plannedResult.error);
      } else {
        setPlannedPeriods(plannedResult.data || []);
      }
      
      setIsLoading(false);
    };

    loadData();
  }, [currentProject]);

  // When new measurement/service is selected, auto-fill form
  useEffect(() => {
    if (selectedMeasurementNew && selectedServiceNew) {
      // Set dates from measurement
      setMeasurementStartDate(selectedMeasurementNew.start_date);
      setMeasurementEndDate(selectedMeasurementNew.end_date);
      
      // Set macro and scope from service
      setSelectedMacro(selectedServiceNew.macro_id);
      setTimeout(() => setSelectedScope(selectedServiceNew.scope_id), 100);
      
      // Set planned houses from service
      if (selectedServiceNew.planned_house_ids?.length > 0) {
        setSelectedHouses(selectedServiceNew.planned_house_ids);
      }
    }
  }, [selectedMeasurementNew, selectedServiceNew]);

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
    setHousePercentages({});
  };

  // Reload productions helper
  const reloadProductions = async () => {
    if (!currentProject) return;
    const { data: newData } = await supabase
      .from('weekly_productions')
      .select('*')
      .eq('project_id', currentProject.id)
      .is('deleted_at', null)
      .order('week_start', { ascending: false });
    
    setProductions(newData || []);
  };

  // Realtime: novos lançamentos do Diário recarregam a lista
  useEffect(() => {
    if (!currentProject?.id) return;
    const channel = supabase
      .channel(`weekly-prod-realtime-${currentProject.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'productions',
        filter: `project_id=eq.${currentProject.id}`,
      }, () => { void reloadProductions(); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'weekly_productions',
        filter: `project_id=eq.${currentProject.id}`,
      }, () => { void reloadProductions(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id]);

  // State for selected planned period
  const [selectedPlannedPeriod, setSelectedPlannedPeriod] = useState<PlannedPeriod | null>(null);

  // Apply planned period to measurement dates and pre-select houses/scope
  const applyPlannedPeriod = (periodId: string) => {
    const period = plannedPeriods.find(p => p.id === periodId);
    if (period) {
      setMeasurementStartDate(period.week_start);
      setMeasurementEndDate(period.week_end);
      setSelectedPlannedPeriod(period);
      
      // Auto-select macro and scope if available
      if (period.macro_id) {
        setSelectedMacro(period.macro_id);
        if (period.scope_id) {
          setTimeout(() => setSelectedScope(period.scope_id), 100);
        }
      }
      
      // Pre-select planned houses
      if (period.planned_house_ids && period.planned_house_ids.length > 0) {
        setSelectedHouses(period.planned_house_ids);
      }
      
      toast.success(`Período aplicado: ${format(parseISO(period.week_start), 'dd/MM', { locale: ptBR })} - ${format(parseISO(period.week_end), 'dd/MM', { locale: ptBR })} (${period.planned_houses} casas previstas)`);
    }
  };

  // Save production record - now also saves to new productions table
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
      // Determine if this is from a measurement or unplanned
      const isUnplanned = !selectedMeasurementNew || !selectedServiceNew;
      const measurementId = selectedMeasurementNew?.id || null;
      const measurementServiceId = selectedServiceNew?.id || null;

      // Função interna que executa a inserção propriamente dita
      const executarInsercao = async () => {
        // 1. Save to new productions table — SKIP when Initial Database to avoid double-counting
        if (!isInitialDatabase) {
          const { error: newProductionError } = await supabase
            .from('productions')
            .insert({
              project_id: currentProject.id,
              measurement_id: measurementId,
              measurement_service_id: measurementServiceId,
              macro_id: macro.id,
              macro_name: macro.name,
              macro_color: macro.color,
              scope_id: scope.id,
              scope_name: scope.name,
              house_ids: selectedHouses,
              houses_count: selectedHouses.length,
              production_date: format(new Date(), 'yyyy-MM-dd'),
              is_initial_database: isInitialDatabase,
              is_unplanned: isUnplanned,
              notes: null
            });

          if (newProductionError) {
            console.error('Error saving to new productions table:', newProductionError);
          }
        }

        // 2. Also save to legacy weekly_productions for backward compatibility
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
            created_by_user_id: profile?.user_id || null,
            created_by_name: profile?.display_name || null,
          });

        if (error) throw error;

        // Build percentage map - add to existing progress instead of replacing
        const progressMap: Record<number, number> = {};
        for (const houseId of selectedHouses) {
          const house = houses.find(h => h.id === houseId);
          const houseMacros = (house?.macros as any[]) || [];
          const houseMacro = houseMacros.find(m => m.id === macro.id);
          const houseScope = houseMacro?.scopes?.find((s: any) => s.id === scope.id);
          const currentProgress = houseScope?.progress || 0;
          const remainingPercent = 100 - currentProgress;

          const percentToAdd = customPercentMode
            ? Math.min(housePercentages[houseId] ?? massPercentage, remainingPercent)
            : remainingPercent;

          progressMap[houseId] = Math.min(100, currentProgress + percentToAdd);
        }

        await updateBatchScopeProgress(selectedHouses, macro.id, scope.id, 100, progressMap);

        const message = isInitialDatabase
          ? `Banco de atividades atualizado: ${scope.name} em ${selectedHouses.length} casas.`
          : `Produção registrada: ${scope.name} em ${selectedHouses.length} casas. Mapa atualizado!`;
        toast.success(message);

        await reloadProductions();

        // C2: Deviation tracking after save
        if (selectedReleasedService && !isInitialDatabase) {
          try {
            const plannedIds: number[] = selectedReleasedService.planned_house_ids || [];
            const missingIds = plannedIds.filter(id => !selectedHouses.includes(id));
            const unplannedIds = selectedHouses.filter(id => !plannedIds.includes(id));

            await supabase.from('weekly_productions')
              .update({
                weekly_plan_service_id: selectedReleasedService.id,
                contractor_id: selectedReleasedService.contractor_id || null,
              })
              .eq('project_id', currentProject.id)
              .eq('scope_id', scope.id)
              .eq('macro_id', macro.id)
              .eq('week_start', measurementStartDate)
              .is('weekly_plan_service_id', null)
              .order('created_at', { ascending: false })
              .limit(1);

            if (missingIds.length > 0) {
              const pct = (missingIds.length / plannedIds.length) * 100;
              await supabase.from('production_deviations').insert({
                project_id: currentProject.id,
                company_id: profile?.company_id,
                week_start: measurementStartDate,
                week_end: measurementEndDate,
                scope_id: scope.id,
                scope_name: scope.name,
                macro_id: macro.id,
                macro_name: macro.name,
                weekly_plan_service_id: selectedReleasedService.id,
                planned_count: plannedIds.length,
                actual_count: selectedHouses.length,
                deviation: selectedHouses.length - plannedIds.length,
                planned_house_ids: plannedIds,
                actual_house_ids: [...selectedHouses],
                missing_house_ids: missingIds,
                unplanned_house_ids: unplannedIds,
                severity: pct > 40 ? 'critical' : pct > 20 ? 'warning' : 'info',
                status: 'open',
              });
              toast.warning(`${missingIds.length} casa(s) não executadas — alerta gerado.`);
            }
          } catch (devErr) {
            console.error('Error tracking deviation:', devErr);
          }
          setSelectedReleasedService(null);
          setSelectedReleasedWeek(null);
          setReleasedWeekServices([]);
        }

        setSelectedHouses([]);
        setSelectedScope("");
        setHousePercentages({});
        setMassPercentage(100);
        setSelectedMeasurementNew(null);
        setSelectedServiceNew(null);
      };

      // Duplicate-check: BLOCK if Initial Database overlaps with Diary entries
      if (isInitialDatabase) {
        const { data: jaNoDiario } = await supabase
          .from('productions')
          .select('house_ids')
          .eq('project_id', currentProject.id)
          .eq('macro_id', macro.id)
          .eq('scope_id', scope.id)
          .eq('is_initial_database', false)
          .is('deleted_at', null);
        const casasJaLancadas = (jaNoDiario || []).flatMap(p => (p.house_ids as number[]) || []);
        const duplicatas = selectedHouses.filter(h => casasJaLancadas.includes(h));
        if (duplicatas.length > 0) {
          setCasasDuplicatas(duplicatas);
          setPendingInsert(() => executarInsercao);
          setDuplicataDialogOpen(true);
          setIsSaving(false);
          return; // PARAR — não inserir até confirmação
        }
      }

      await executarInsercao();
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

  // Handle delete production via atomic RPC (soft delete + cascade + revert no banco)
  const handleDeleteProduction = async () => {
    if (!productionToDelete || !currentProject || !podeExcluir) return;
    if (justificativaExclusao.trim().length < 20) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc('delete_production_safe', {
        p_weekly_production_id: productionToDelete.id,
        p_justificativa: justificativaExclusao.trim(),
        p_deleted_by: user!.id,
        p_deleted_by_nome: profile?.display_name || user?.email || 'Admin',
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        if (result?.error === 'justificativa_muito_curta') {
          toast.error('Justificativa deve ter pelo menos 20 caracteres.');
        } else if (result?.error === 'registro_nao_encontrado') {
          toast.error('Registro não encontrado ou já excluído.');
        } else {
          toast.error('Erro ao excluir: ' + (result?.error || 'desconhecido'));
        }
        return;
      }

      // Banco já fez tudo atomicamente (revert houses.macros, soft delete em productions/diary_items, log)
      await reloadProductions();
      await loadDeletionLog();
      await refreshHousesFromDB();
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
      queryClient.invalidateQueries({ queryKey: ["houses"] });
      toast.success("Registro excluído. Auditoria registrada.");
      setDeleteDialogOpen(false);
      setProductionToDelete(null);
      setJustificativaExclusao("");
    } catch (error: any) {
      console.error('Error deleting production:', error);
      toast.error("Erro ao excluir: " + (error?.message || 'erro desconhecido'));
    }
    setIsDeleting(false);
  };

  // Carrega histórico de exclusões para admins
  const loadDeletionLog = useCallback(async () => {
    if (!currentProject?.id || !podeExcluir) return;
    const { data } = await supabase
      .from('production_deletion_log')
      .select('*')
      .eq('project_id', currentProject.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setDeletionLog(data || []);

    const { data: corrLog } = await supabase
      .from("diary_item_corrections")
      .select("id, macro_name, scope_name, tipo, house_ids_anterior, house_ids_posterior, percentual_anterior, percentual_posterior, justificativa, corrigido_por_nome, created_at")
      .eq("project_id", currentProject.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setCorrecaoLog(corrLog || []);
  }, [currentProject?.id, podeExcluir]);

  const historicoUnificado = useMemo(() => {
    const exclusoes = (deletionLog || []).map((d: any) => ({
      tipo: "exclusao",
      macro_name: d.macro_name || "—",
      scope_name: d.scope_name || "—",
      descricao: `Casas removidas: ${(d.house_ids as number[])?.join(", ") || "—"}`,
      feito_por: d.deleted_by_nome || "—",
      justificativa: d.justificativa,
      created_at: d.created_at,
    }));
    const correcoes = (correcaoLog || []).map((c: any) => ({
      tipo: "correcao",
      macro_name: c.macro_name || "—",
      scope_name: c.scope_name || "—",
      descricao: c.tipo === "ajuste_casas"
        ? `Casas: ${(c.house_ids_anterior as number[])?.join(", ")} → ${(c.house_ids_posterior as number[])?.join(", ")}`
        : c.tipo === "ajuste_percentual"
        ? `Percentual: ${c.percentual_anterior}% → ${c.percentual_posterior}%`
        : `Itens removidos das casas: ${(c.house_ids_anterior as number[])?.join(", ")}`,
      feito_por: c.corrigido_por_nome || "—",
      justificativa: c.justificativa,
      created_at: c.created_at,
    }));
    const todos = [...exclusoes, ...correcoes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (filtroHistorico === "exclusoes") return exclusoes;
    if (filtroHistorico === "correcoes") return correcoes;
    return todos;
  }, [deletionLog, correcaoLog, filtroHistorico]);

  useEffect(() => {
    loadDeletionLog();
  }, [loadDeletionLog]);


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
  // This includes ALL records for display purposes
  // Initial database records are always included regardless of date filter
  const allFilteredProductions = useMemo(() => {
    // For "all" period, don't filter by date
    if (analysisPeriod === "all") {
      return productions.filter(prod => {
        const houseMatch = !analysisHouseFilter || 
          prod.house_ids.includes(parseInt(analysisHouseFilter));
        const macroMatch = !analysisMacroFilter || prod.macro_id === analysisMacroFilter;
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
      const houseMatch = !analysisHouseFilter || 
        prod.house_ids.includes(parseInt(analysisHouseFilter));
      const macroMatch = !analysisMacroFilter || prod.macro_id === analysisMacroFilter;
      const scopeMatch = !analysisScopeFilter || prod.scope_id === analysisScopeFilter;
      // Always include initial database records regardless of date filter
      return (prod.is_initial_database || inDateRange) && houseMatch && macroMatch && scopeMatch;
    });
  }, [productions, analysisPeriod, analysisStartDate, analysisEndDate, analysisHouseFilter, analysisMacroFilter, analysisScopeFilter]);

  // For analysis calculations, EXCLUDE initial database records
  // These don't affect trends/averages
  const filteredProductions = useMemo(() => {
    return allFilteredProductions.filter(prod => !prod.is_initial_database);
  }, [allFilteredProductions]);

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
    const tab = value as "register" | "analysis" | "diario";
    setActiveTab(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  };

  // Handle initial database mode change
  const handleInitialDatabaseChange = (checked: boolean) => {
    setIsInitialDatabase(checked);
    localStorage.setItem(INITIAL_DB_STORAGE_KEY, checked.toString());
  };

  // State for measurement-based navigation
  const [selectedMeasurementNum, setSelectedMeasurementNum] = useState<number | null>(null);
  
  // State for adding unplanned service
  const [isAddingUnplanned, setIsAddingUnplanned] = useState(false);

  // Get list of registered production IDs for the current measurement
  // This helps track which planned services have already been registered
  const registeredPlannedIds = useMemo(() => {
    if (selectedMeasurementNum === null) return [];
    
    // Get all planned periods for this measurement
    const measurementPeriods = plannedPeriods.filter(p => 
      (p.measurement_number || 1) === selectedMeasurementNum
    );
    
    // Check which ones have matching productions in the same date range
    return measurementPeriods
      .filter(period => {
        return productions.some(prod => 
          prod.scope_id === period.scope_id && 
          prod.macro_id === period.macro_id &&
          prod.week_start === period.week_start &&
          prod.week_end === period.week_end
        );
      })
      .map(p => p.id);
  }, [selectedMeasurementNum, plannedPeriods, productions]);

  // Group periods by measurement
  const measurementGroups = useMemo(() => {
    const groups = new Map<number, PlannedPeriod[]>();
    plannedPeriods.forEach(period => {
      const measurementNum = period.measurement_number || 1;
      if (!groups.has(measurementNum)) {
        groups.set(measurementNum, []);
      }
      groups.get(measurementNum)!.push(period);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [plannedPeriods]);

  // Periods for selected measurement
  const periodsForMeasurement = useMemo(() => {
    if (selectedMeasurementNum === null) return [];
    return plannedPeriods.filter(p => (p.measurement_number || 1) === selectedMeasurementNum);
  }, [plannedPeriods, selectedMeasurementNum]);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-3xl h-10 grid-cols-4">
          <TabsTrigger value="register" className="gap-2 text-sm">
            <ClipboardList className="w-4 h-4" />
            Registrar
          </TabsTrigger>
          <TabsTrigger value="diario" className="gap-2 text-sm">
            Do Diário
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Análise
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2 text-sm">
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* C2: Released Weekly Planning Card */}
          {!isInitialDatabase && !isAddingUnplanned && releasedWeeks.length > 0 && (
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-600" />
                  Do Planejamento Semanal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={selectedReleasedWeek?.id || ""}
                  onValueChange={(v) => onSelectReleasedWeek(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione a semana..." />
                  </SelectTrigger>
                  <SelectContent>
                    {releasedWeeks.map((w: any) => {
                      const pp = Array.isArray(w.planning_periods) ? w.planning_periods[0] : w.planning_periods;
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          Semana {w.week_number} — {format(parseISO(w.week_start), 'dd/MM', { locale: ptBR })} a {format(parseISO(w.week_end), 'dd/MM', { locale: ptBR })} (Medição {pp?.period_number || '?'})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {selectedReleasedWeek && releasedWeekServices.length > 0 && (
                  <>
                    {/* Toggle de modo */}
                    <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                      <button
                        onClick={() => setPlanViewMode('service')}
                        className={`px-3 py-1 text-xs rounded-md transition-all ${planViewMode === 'service' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}
                      >
                        Por Serviço
                      </button>
                      <button
                        onClick={() => setPlanViewMode('contractor')}
                        className={`px-3 py-1 text-xs rounded-md transition-all ${planViewMode === 'contractor' ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}
                      >
                        Por Empreiteiro
                      </button>
                    </div>

                    <ScrollArea className="h-[200px] pr-2">
                      <div className="space-y-1.5">
                        {planViewMode === 'service' ? (
                          /* Modo por Serviço (original) */
                          releasedWeekServices.map((svc: any) => {
                            const isSelected = selectedReleasedService?.id === svc.id;
                            const isRegistered = svc._registered;
                            return (
                              <button
                                key={svc.id}
                                onClick={() => !isRegistered && applyReleasedService(isSelected ? null : svc)}
                                disabled={isRegistered}
                                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                                  isRegistered 
                                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 opacity-60 cursor-not-allowed"
                                    : isSelected
                                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 ring-2 ring-blue-200"
                                      : "bg-background hover:bg-muted/50 border-border hover:border-blue-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: svc.macro_color }} />
                                    <span className="font-medium text-sm">{svc.scope_name}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="secondary" className="text-xs">
                                      {svc.planned_houses} casas
                                    </Badge>
                                    {svc.contractor_name && (
                                      <Badge variant="outline" className="text-[10px]">
                                        {svc.contractor_name}
                                      </Badge>
                                    )}
                                    {isRegistered && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          /* Modo por Empreiteiro */
                          (() => {
                            const grouped: Record<string, { name: string; services: any[] }> = {};
                            releasedWeekServices.forEach((svc: any) => {
                              const key = svc.contractor_id || '_none';
                              if (!grouped[key]) {
                                grouped[key] = { name: svc.contractor_name || 'Sem empreiteiro', services: [] };
                              }
                              grouped[key].services.push(svc);
                            });
                            return Object.entries(grouped).map(([key, group]) => {
                              const totalHouses = group.services.reduce((sum: number, s: any) => sum + (s.planned_houses || 0), 0);
                              const isNone = key === '_none';
                              return (
                                <div key={key} className="space-y-1">
                                  <div className="flex items-center justify-between px-1 pt-1">
                                    <span className={`text-xs font-semibold ${isNone ? 'text-amber-600' : 'text-foreground'}`}>
                                      {group.name}
                                    </span>
                                    <Badge variant={isNone ? "outline" : "secondary"} className={`text-[10px] ${isNone ? 'border-amber-400 text-amber-600' : ''}`}>
                                      {totalHouses} casas
                                    </Badge>
                                  </div>
                                  {group.services.map((svc: any) => {
                                    const isSelected = selectedReleasedService?.id === svc.id;
                                    const isRegistered = svc._registered;
                                    return (
                                      <button
                                        key={svc.id}
                                        onClick={() => !isRegistered && applyReleasedService(isSelected ? null : svc)}
                                        disabled={isRegistered}
                                        className={`w-full p-2 rounded-lg border text-left transition-all ${
                                          isRegistered
                                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 opacity-60 cursor-not-allowed"
                                            : isSelected
                                              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 ring-2 ring-blue-200"
                                              : "bg-background hover:bg-muted/50 border-border hover:border-blue-300"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: svc.macro_color }} />
                                            <span className="text-sm">{svc.scope_name}</span>
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <Badge variant="secondary" className="text-[10px]">
                                              {svc.planned_houses} casas
                                            </Badge>
                                            {isRegistered && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            });
                          })()
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}

                {selectedReleasedService && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => {
                    setSelectedReleasedService(null);
                    setSelectedReleasedWeek(null);
                    setReleasedWeekServices([]);
                    setSelectedMacro("");
                    setSelectedScope("");
                    setSelectedHouses([]);
                  }}>
                    Limpar seleção do planejamento
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Measurement Selector - Priority: new measurements table, fallback to legacy */}
          {!isInitialDatabase && !isAddingUnplanned && (
            <>
              {/* New measurement system - only show if we have measurements in new table */}
              {measurementsWithServices.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Medição
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Measurement selector */}
                    <Select
                      value={selectedMeasurementNew?.id || ""}
                      onValueChange={(value) => {
                        const measurement = measurementsWithServices.find(m => m.id === value) || null;
                        setSelectedMeasurementNew(measurement);
                        setSelectedServiceNew(null);
                        setSelectedMeasurementNum(measurement?.measurement_number || null);
                      }}
                      disabled={isMeasurementsLoading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a medição..." />
                      </SelectTrigger>
                      <SelectContent>
                        {measurementsWithServices.map(m => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-3 py-1">
                              <Badge variant="default" className="text-xs">
                                {m.measurement_number}ª Medição
                              </Badge>
                              <span className="text-sm">
                                {m.servicesCount} serviço(s) · {m.totalHouses} casas
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(parseISO(m.start_date), 'dd/MM', { locale: ptBR })} - {format(parseISO(m.end_date), 'dd/MM', { locale: ptBR })}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Services for selected measurement */}
                    {selectedMeasurementNew && selectedMeasurementNew.services.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-muted-foreground">Serviços da Medição:</div>
                        <ScrollArea className="h-[180px] pr-4">
                          <div className="space-y-2">
                            {selectedMeasurementNew.services.map(service => {
                              const registeredIds = getRegisteredServiceIds(selectedMeasurementNew.id);
                              const isRegistered = registeredIds.includes(service.id);
                              const isSelected = selectedServiceNew?.id === service.id;
                              
                              return (
                                <button
                                  key={service.id}
                                  onClick={() => !isRegistered && setSelectedServiceNew(isSelected ? null : service)}
                                  disabled={isRegistered}
                                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                                    isRegistered 
                                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 opacity-60 cursor-not-allowed"
                                      : isSelected
                                        ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                                        : "bg-background hover:bg-muted/50 border-border hover:border-primary/50"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-3 h-3 rounded-full" 
                                        style={{ backgroundColor: service.macro_color }}
                                      />
                                      <span className="font-medium text-sm">{service.scope_name}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {service.macro_name}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs">
                                        <Home className="w-3 h-3 mr-1" />
                                        {service.planned_houses}
                                      </Badge>
                                      {isRegistered && (
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    {/* Action buttons */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => {
                        setIsAddingUnplanned(true);
                        setSelectedMeasurementNew(null);
                        setSelectedServiceNew(null);
                        setSelectedPlannedPeriod(null);
                        setSelectedMacro("");
                        setSelectedScope("");
                        setSelectedHouses([]);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Serviço não previsto
                    </Button>
                  </CardContent>
                </Card>
              ) : plannedPeriods.length > 0 ? (
                // Legacy measurement selector - fallback
                <MeasurementSelector
                  plannedPeriods={plannedPeriods}
                  registeredScopeIds={registeredPlannedIds}
                  selectedMeasurement={selectedMeasurementNum}
                  onMeasurementChange={setSelectedMeasurementNum}
                  selectedPeriod={selectedPlannedPeriod}
                  onPeriodChange={setSelectedPlannedPeriod}
                  onApplyService={(period) => {
                    setIsAddingUnplanned(false);
                    setMeasurementStartDate(period.week_start);
                    setMeasurementEndDate(period.week_end);
                    setSelectedMacro(period.macro_id);
                    setTimeout(() => setSelectedScope(period.scope_id), 100);
                    if (period.planned_house_ids?.length > 0) {
                      setSelectedHouses(period.planned_house_ids);
                    }
                    toast.success(`Serviço "${period.scope_name}" aplicado com ${period.planned_houses} casas`);
                  }}
                  onAddUnplannedService={() => {
                    setIsAddingUnplanned(true);
                    setSelectedPlannedPeriod(null);
                    setSelectedMacro("");
                    setSelectedScope("");
                    setSelectedHouses([]);
                  }}
                />
              ) : null}
            </>
          )}

          {/* Mode indicator for unplanned service */}
          {isAddingUnplanned && (
            <Card className="border-2 border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Plus className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="font-medium text-amber-800 dark:text-amber-200">Serviço Não Previsto</h3>
                      <p className="text-sm text-amber-600 dark:text-amber-400">Adicionando atividade fora do planejamento da medição</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setIsAddingUnplanned(false);
                      setSelectedMacro("");
                      setSelectedScope("");
                      setSelectedHouses([]);
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Voltar ao Planejamento
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            {/* Left Panel - Configuration */}
            <Card className="xl:col-span-1 overflow-visible">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="w-5 h-5" />
                    Configuração
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="initial-database"
                      checked={isInitialDatabase}
                      onCheckedChange={(checked) => handleInitialDatabaseChange(checked as boolean)}
                      disabled={!podeExcluir}
                    />
                    <Label
                      htmlFor="initial-database"
                      className={cn("text-xs", podeExcluir ? "cursor-pointer" : "cursor-not-allowed text-muted-foreground")}
                      title={!podeExcluir ? "Banco Inicial — somente administradores" : undefined}
                    >
                      Banco Inicial {!podeExcluir && <span className="ml-1">🔒</span>}
                    </Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Period Info (read-only from planning) */}
                {!isInitialDatabase && selectedPlannedPeriod && (
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Período da Medição</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {selectedPlannedPeriod.measurement_number}ª Med.
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{format(parseISO(measurementStartDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                      <span className="text-muted-foreground">até</span>
                      <span className="font-medium">{format(parseISO(measurementEndDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    </div>
                  </div>
                )}

                {/* Period input for unplanned service */}
                {!isInitialDatabase && isAddingUnplanned && (
                  <div className="p-3 bg-amber-50/50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium">Período</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Início</Label>
                        <Input 
                          type="date" 
                          value={measurementStartDate}
                          onChange={(e) => setMeasurementStartDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Fim</Label>
                        <Input 
                          type="date" 
                          value={measurementEndDate}
                          onChange={(e) => setMeasurementEndDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Macro/Scope Selectors */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Etapa</Label>
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

                  <div className="space-y-1.5">
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
                </div>

                {/* Validation / Status */}
                {selectedPlannedPeriod && selectedScope && selectedPlannedPeriod.scope_id === selectedScope && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm">
                      <Target className="w-4 h-4" />
                      <span className="font-medium">Validação</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span>Previsto: <strong>{selectedPlannedPeriod.planned_houses}</strong></span>
                      <span className={`font-semibold ${selectedHouses.length === selectedPlannedPeriod.planned_houses ? 'text-green-600' : 'text-yellow-600'}`}>
                        Selecionado: {selectedHouses.length}
                      </span>
                    </div>
                    {selectedHouses.length === selectedPlannedPeriod.planned_houses ? (
                      <div className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Meta atingida!
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-yellow-600">
                        <AlertTriangle className="w-3 h-3" />
                        {Math.abs(selectedPlannedPeriod.planned_houses - selectedHouses.length)} {selectedHouses.length < selectedPlannedPeriod.planned_houses ? 'faltando' : 'a mais'}
                      </div>
                    )}
                  </div>
                )}

                {selectedScope && !selectedPlannedPeriod && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs">
                      <Plus className="w-3 h-3" />
                      <span>Serviço adicional (não planejado)</span>
                    </div>
                  </div>
                )}

                {/* House Selection Summary */}
                {selectedScope && (
                  <div className="pt-3 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Casas Selecionadas</span>
                      <Badge variant="secondary">{selectedHouses.length}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllHouses}>
                        Todas
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                        Limpar
                      </Button>
                      {selectedPlannedPeriod?.planned_house_ids && selectedPlannedPeriod.planned_house_ids.length > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setSelectedHouses(selectedPlannedPeriod.planned_house_ids)}
                        >
                          <Target className="w-3 h-3" />
                          Planejadas
                        </Button>
                      )}
                    </div>
                    
                    {/* Custom Percentage Toggle */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1">
                        <Percent className="w-3 h-3 text-muted-foreground" />
                        <Label className="text-xs">% Parcial</Label>
                      </div>
                      <Switch
                        checked={customPercentMode}
                        onCheckedChange={(checked) => {
                          setCustomPercentMode(checked);
                          if (!checked) {
                            setHousePercentages({});
                            setMassPercentage(100);
                          }
                        }}
                      />
                    </div>

                    {customPercentMode && (
                      <div className="flex items-center gap-2">
                        <Slider
                          value={[massPercentage]}
                          onValueChange={(v) => {
                            setMassPercentage(v[0]);
                            const newPercentages: Record<number, number> = {};
                            selectedHouses.forEach(houseId => {
                              newPercentages[houseId] = v[0];
                            });
                            setHousePercentages(newPercentages);
                          }}
                          max={100}
                          min={0}
                          step={5}
                          className="flex-1"
                        />
                        <Badge variant="outline">{massPercentage}%</Badge>
                      </div>
                    )}
                  </div>
                )}

                {/* Save Button */}
                <Button 
                  className="w-full gap-2 h-10" 
                  onClick={handleSave}
                  disabled={!selectedScope || selectedHouses.length === 0 || isSaving || !canEdit}
                >
                  <Save className="w-4 h-4" />
                  {!canEdit ? "Modo Visualização" : isSaving ? "Salvando..." : "Registrar Produção"}
                </Button>
                {!canEdit && (
                  <p className="text-xs text-muted-foreground text-center">
                    Modo simulação - sem permissão para salvar
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Right Panel - Houses Grid */}
            <Card className="xl:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Selecionar Casas
                  {selectedScope && (
                    <div className="ml-auto flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {selectedHouses.length} selecionadas
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {completedHouses.length} concluídas
                      </Badge>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedScope ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Selecione uma medição e um serviço para começar</p>
                    <p className="text-xs mt-1">Use o seletor de medição acima ou escolha manualmente</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      💡 Clique e arraste para selecionar múltiplas casas
                    </p>
                    <ScrollArea className="h-[calc(100vh-480px)] min-h-[250px]">
                      <div 
                        className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-14 xl:grid-cols-16 gap-1.5 select-none"
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {houses.map(house => {
                          const isCompleted = completedHouses.includes(house.id);
                          const isSelected = selectedHouses.includes(house.id);
                          const isPlanned = selectedPlannedPeriod?.planned_house_ids?.includes(house.id);
                          const isReleasedPlanned = selectedReleasedService?.planned_house_ids?.includes(house.id);
                          const isDeselectedFromPlan = selectedReleasedService && isReleasedPlanned && !isSelected;
                          const isExtraFromPlan = selectedReleasedService && !isReleasedPlanned && isSelected;
                          const macro = macros.find(m => m.id === selectedMacro);
                          
                          const houseMacros = (house.macros as any[]) || [];
                          const houseMacro = houseMacros.find(m => m.id === selectedMacro);
                          const houseScope = houseMacro?.scopes?.find((s: any) => s.id === selectedScope);
                          const currentProgress = houseScope?.progress || 0;
                          const hasPartialProgress = currentProgress > 0 && currentProgress < 100;
                          const remainingPercent = 100 - currentProgress;
                          
                          const housePercent = customPercentMode 
                            ? Math.min(housePercentages[house.id] ?? massPercentage, remainingPercent)
                            : remainingPercent;
                          
                          return (
                            <button
                              key={house.id}
                              onMouseDown={(e) => handleMouseDown(house.id, isCompleted, e)}
                              onMouseEnter={() => handleMouseEnter(house.id, isCompleted)}
                              onMouseUp={handleMouseUp}
                              onContextMenu={(e) => e.preventDefault()}
                              disabled={isCompleted}
                              className={`
                                relative w-10 h-10 rounded-md border-2 flex flex-col items-center justify-center text-xs font-medium transition-all
                                ${isCompleted 
                                  ? 'bg-green-500/15 border-green-500 text-green-700 dark:text-green-400 cursor-not-allowed opacity-60' 
                                  : hasPartialProgress
                                    ? isSelected 
                                      ? 'border-primary bg-primary/20 text-primary cursor-pointer'
                                      : 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-400 cursor-pointer'
                                    : isSelected 
                                      ? 'border-primary bg-primary/20 text-primary cursor-pointer' 
                                      : isPlanned
                                        ? 'border-blue-300 bg-blue-50/50 hover:border-primary/50 cursor-pointer'
                                        : 'border-border bg-card hover:border-primary/50 cursor-pointer'
                                }
                                ${isDragging && !isCompleted ? 'cursor-crosshair' : ''}
                              `}
                              style={
                                isDeselectedFromPlan && !isCompleted
                                  ? { borderColor: '#ef4444', borderStyle: 'dashed' }
                                  : isExtraFromPlan && !isCompleted
                                    ? { borderColor: '#f59e0b', borderStyle: 'dashed', backgroundColor: '#fef3c720' }
                                    : isSelected && macro 
                                      ? { borderColor: macro.color, backgroundColor: macro.color + '20' } 
                                      : undefined
                              }
                              title={`Casa ${house.id}: ${currentProgress}% concluído`}
                            >
                              <span className="font-bold text-[11px]">{house.id}</span>
                              <span className={`text-[8px] leading-tight ${hasPartialProgress ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {currentProgress}%
                              </span>
                              {isSelected && !isCompleted && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                                  <CheckCircle2 className="w-2 h-2 text-white" />
                                </span>
                              )}
                              {isCompleted && (
                                <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-600" />
                              )}
                              {isPlanned && !isSelected && !isCompleted && (
                                <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-blue-500 rounded-full" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    
                    {/* Released plan counter */}
                    {selectedReleasedService && (
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-xs">
                        {(() => {
                          const plannedIds: number[] = selectedReleasedService.planned_house_ids || [];
                          const selected = selectedHouses;
                          const fromPlan = selected.filter((id: number) => plannedIds.includes(id)).length;
                          const extras = selected.filter((id: number) => !plannedIds.includes(id)).length;
                          const pending = plannedIds.filter((id: number) => !selected.includes(id)).length;
                          return (
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{fromPlan} de {plannedIds.length} planejadas</span>
                              {extras > 0 && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">{extras} extras</Badge>}
                              {pending > 0 && <Badge variant="outline" className="text-[10px] border-red-400 text-red-600">{pending} pendentes</Badge>}
                            </span>
                          );
                        })()}
                      </div>
                    )}

                    {/* Nota informativa sobre flexibilidade */}
                    {selectedReleasedService && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 flex items-center gap-1.5 mt-2">
                        <Info className="h-3 w-3 flex-shrink-0" />
                        <span>
                          Planejado para <strong>{selectedReleasedService.contractor_name || 'sem empreiteiro'}</strong>.
                          Você pode ajustar as casas livremente — o real registrado é o que vale.
                          Qualquer diferença do planejamento gerará um alerta automático.
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span>Planejada</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-amber-500/10 border-2 border-amber-400" />
                        <span>Parcial</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-green-500/15 border-2 border-green-500" />
                        <span>Concluída</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-primary/20 border-2 border-primary" />
                        <span>Selecionada</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="diario" className="flex-1 overflow-auto mt-4">
          <DiarioTabContent />
        </TabsContent>

        <TabsContent value="analysis" className="flex-1 overflow-auto mt-4 space-y-4">
          <Tabs defaultValue="evolution" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="evolution">Evolução</TabsTrigger>
              <TabsTrigger value="clima">Clima e dias praticáveis</TabsTrigger>
              <TabsTrigger value="alerts" className="gap-1.5">
                Alertas
                {openDeviationAlertCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 min-w-[18px] h-[18px]">
                    {openDeviationAlertCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="clima" className="space-y-4">
              {currentProject?.id && <WeatherPeriodPanel projectId={currentProject.id} />}
            </TabsContent>

            <TabsContent value="evolution" className="space-y-4">
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
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="Selecione o período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo Projeto</SelectItem>
                    <SelectItem value="2weeks_forward">2 semanas à frente</SelectItem>
                    <SelectItem value="1week_forward">1 semana à frente</SelectItem>
                    <SelectItem value="1week_back">1 semana atrás</SelectItem>
                    <SelectItem value="2weeks_back">2 semanas atrás</SelectItem>
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
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Últimos Registros</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {allFilteredProductions.length} total
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowAllRecords(true)}
                  >
                    <Maximize2 className="h-3 w-3" />
                    Ver Todos
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ScrollArea className="h-[300px]">
                  {allFilteredProductions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma produção no período
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {allFilteredProductions.slice(0, 10).map(prod => (
                        <ProductionRecordItem 
                          key={prod.id} 
                          prod={prod} 
                          canEdit={canEdit} 
                          podeExcluir={podeExcluir}
                          onEdit={() => { setEditingProduction(prod); setEditDialogOpen(true); }}
                          onDelete={() => { setProductionToDelete(prod); setJustificativaExclusao(""); setDeleteDialogOpen(true); }}
                        />
                      ))}
                      {allFilteredProductions.length > 10 && (
                        <Button 
                          variant="ghost" 
                          className="w-full text-xs text-muted-foreground"
                          onClick={() => setShowAllRecords(true)}
                        >
                          +{allFilteredProductions.length - 10} registros — Clique para ver todos
                        </Button>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Full Records Dialog */}
          <Dialog open={showAllRecords} onOpenChange={setShowAllRecords}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  Todos os Registros de Produção
                  <Badge variant="secondary">{allFilteredProductions.length} registros</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                {allFilteredProductions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma produção no período
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allFilteredProductions.map(prod => (
                      <ProductionRecordItem 
                        key={prod.id} 
                        prod={prod} 
                        canEdit={canEdit} 
                        podeExcluir={podeExcluir}
                        onEdit={() => { setEditingProduction(prod); setEditDialogOpen(true); setShowAllRecords(false); }}
                        onDelete={() => { setProductionToDelete(prod); setJustificativaExclusao(""); setDeleteDialogOpen(true); setShowAllRecords(false); }}
                        showFullDetails
                      />
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
            </TabsContent>

            {/* C3: Alerts Sub-Tab */}
            <TabsContent value="alerts" className="space-y-4">
              {deviationAlerts.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum alerta de desvio ativo</p>
                  <p className="text-xs mt-1">Alertas são gerados automaticamente quando a produção difere do planejamento</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {deviationAlerts.map((alert: any) => (
                    <Card key={alert.id} className={`border-l-4 ${
                      alert.severity === 'critical' ? 'border-l-red-500' : 
                      alert.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'
                    }`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[10px] ${
                              alert.severity === 'critical' ? 'bg-red-500 hover:bg-red-600' :
                              alert.severity === 'warning' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600'
                            }`}>
                              {alert.severity === 'critical' ? 'Crítico' : alert.severity === 'warning' ? 'Atenção' : 'Info'}
                            </Badge>
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: alert.macro_color || '#888' }} />
                              <span className="text-sm font-medium">{alert.macro_name}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-sm">{alert.scope_name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={alert.status === 'open' ? 'destructive' : 'secondary'} className="text-[10px]">
                              {alert.status === 'open' ? 'Aberto' : 'Registrado'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {alert.week_start && alert.week_end && 
                                `${format(parseISO(alert.week_start), 'dd/MM', { locale: ptBR })} a ${format(parseISO(alert.week_end), 'dd/MM', { locale: ptBR })}`
                              }
                            </span>
                          </div>
                        </div>

                        <div className="text-sm">
                          Planejado: <strong>{alert.planned_count}</strong> · Executado: <strong>{alert.actual_count}</strong> · Faltando: <strong>{(alert.missing_house_ids || []).length}</strong> casas
                        </div>

                        {(alert.missing_house_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(alert.missing_house_ids as number[]).map((id: number) => (
                              <span key={id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                {id}
                              </span>
                            ))}
                          </div>
                        )}

                        {(alert.unplanned_house_ids || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-amber-600 mr-1">Extras:</span>
                            {(alert.unplanned_house_ids as number[]).map((id: number) => (
                              <span key={id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {id}
                              </span>
                            ))}
                          </div>
                        )}

                        {alert.deviation_reason && (
                          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                            <span className="font-medium">Motivo:</span> {alert.deviation_reason}
                            {alert.corrective_action && <><br/><span className="font-medium">Ação:</span> {alert.corrective_action}</>}
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {alert.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setSelectedAlert(alert);
                                setDeviationReason("");
                                setCorrectiveAction("");
                                setReasonDialogOpen(true);
                              }}
                            >
                              Registrar motivo
                            </Button>
                          )}
                          {alert.status === 'acknowledged' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                              onClick={async () => {
                                await supabase.from('production_deviations')
                                  .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: profile?.user_id })
                                  .eq('id', alert.id);
                                toast.success("Alerta resolvido.");
                                loadDeviationAlerts();
                              }}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Resolver
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

            </TabsContent>

          {/* Reason Dialog */}
          <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Motivo do Desvio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Select value={deviationReason} onValueChange={setDeviationReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'Falta de material', 'Falta de mão de obra', 'Mão de obra insuficiente',
                        'Empreiteiro substituído', 'Problemas climáticos', 'Chuva excessiva',
                        'Problema técnico', 'Atraso de fornecedor', 'Retrabalho necessário',
                        'Mudança de escopo', 'Equipamento indisponível', 'Acidente/afastamento',
                        'Feriado não previsto', 'Casas inacessíveis', 'Problema de qualidade', 'Outros'
                      ].map(reason => (
                        <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ação corretiva planejada</Label>
                  <Textarea
                    value={correctiveAction}
                    onChange={(e) => setCorrectiveAction(e.target.value)}
                    placeholder="Descreva a ação corretiva..."
                    rows={3}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!deviationReason}
                  onClick={async () => {
                    if (!selectedAlert) return;
                    await supabase.from('production_deviations')
                      .update({
                        deviation_reason: deviationReason,
                        corrective_action: correctiveAction || null,
                        status: 'acknowledged',
                      })
                      .eq('id', selectedAlert.id);
                    toast.success("Motivo registrado.");
                    setReasonDialogOpen(false);
                    setSelectedAlert(null);
                    loadDeviationAlerts();
                  }}
                >
                  Salvar Motivo
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </Tabs>
        </TabsContent>

        <TabsContent value="historico" className="flex-1 overflow-auto mt-4 space-y-4">
          {currentProject?.id && <ObraHistoricoPanel projectId={currentProject.id} />}

          {podeExcluir && historicoUnificado.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Exclusões e correções manuais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {(["todos","exclusoes","correcoes"] as const).map(f => (
                    <Button key={f} size="sm"
                      variant={filtroHistorico === f ? "default" : "outline"}
                      onClick={() => setFiltroHistorico(f)}>
                      {f === "todos" ? "Todos" : f === "exclusoes" ? "Exclusões" : "Correções"}
                    </Button>
                  ))}
                </div>
                <div className="space-y-2">
                  {historicoUnificado.map((item: any, i: number) => (
                    <div key={i} className="rounded-lg border p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                          item.tipo === "exclusao"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400")}>
                          {item.tipo === "exclusao" ? "Exclusão" : "Correção"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}
                        </span>
                      </div>
                      <p className="font-medium">{item.macro_name} — {item.scope_name}</p>
                      <p className="text-xs text-muted-foreground">{item.descricao}</p>
                      <p className="text-xs"><span className="text-muted-foreground">Por: </span><span className="font-medium">{item.feito_por}</span></p>
                      {item.justificativa && <p className="text-xs italic text-muted-foreground">"{item.justificativa}"</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* AlertDialog de duplicidade — confirma inserção de Banco Inicial sobre casas já lançadas */}
      <AlertDialog open={duplicataDialogOpen} onOpenChange={setDuplicataDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Casas já lançadas no Diário</AlertDialogTitle>
            <AlertDialogDescription>
              As casas <strong>{casasDuplicatas.join(", ")}</strong> já foram lançadas
              pelo Diário de Obras para este serviço nesta semana.
              Continuar criará dupla contagem no Planejamento Estratégico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDuplicataDialogOpen(false); setPendingInsert(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                setDuplicataDialogOpen(false);
                if (pendingInsert) await pendingInsert();
                setPendingInsert(null);
              }}>
              Continuar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditProductionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        production={editingProduction}
        onSave={handleEditSave}
      />

      {/* Delete Confirmation Dialog with justification */}
      <Dialog open={deleteDialogOpen} onOpenChange={(o) => { setDeleteDialogOpen(o); if (!o) setJustificativaExclusao(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ⚠️ Excluir Registro de Produção
            </DialogTitle>
          </DialogHeader>
          {productionToDelete && (
            <div className="space-y-3">
              <div className="p-3 rounded-md border bg-muted/40 text-sm space-y-1">
                <div><span className="text-muted-foreground">Serviço:</span> <strong>{productionToDelete.macro_name} / {productionToDelete.scope_name}</strong></div>
                <div><span className="text-muted-foreground">Semana:</span> {format(parseISO(productionToDelete.week_start), "dd/MM", { locale: ptBR })}–{format(parseISO(productionToDelete.week_end), "dd/MM/yyyy", { locale: ptBR })}</div>
                <div><span className="text-muted-foreground">Casas:</span> {productionToDelete.houses_count} ({productionToDelete.house_ids.slice(0, 8).join(", ")}{productionToDelete.house_ids.length > 8 ? "..." : ""})</div>
                {productionToDelete.created_by_name && <div><span className="text-muted-foreground">Lançado por:</span> {productionToDelete.created_by_name}</div>}
              </div>
              <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-xs text-destructive">
                Esta exclusão é irreversível. O progresso das casas será revertido, os desvios vinculados serão removidos e um registro de auditoria será criado.
              </div>
              <div>
                <Label className="text-xs mb-1 block">Justificativa (mínimo 20 caracteres)</Label>
                <Textarea
                  value={justificativaExclusao}
                  onChange={(e) => setJustificativaExclusao(e.target.value)}
                  placeholder="Descreva por que este registro está sendo excluído (ex: lançamento duplicado, casa errada, serviço incorreto...)"
                  className="min-h-[90px]"
                />
                <div className="text-[11px] text-muted-foreground mt-1 text-right">
                  {justificativaExclusao.trim().length}/20
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProduction}
              disabled={isDeleting || justificativaExclusao.trim().length < 20}
            >
              {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
