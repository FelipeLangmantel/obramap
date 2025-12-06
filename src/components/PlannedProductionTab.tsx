import { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Target,
  Save,
  Calendar,
  Home,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Plus,
  Trash2,
  BarChart3,
  ClipboardList,
  AlertCircle,
  ArrowRight
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addWeeks, parseISO, isBefore, isAfter, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PlannedProduction {
  id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  planned_houses: number;
  planned_house_ids: number[];
  notes: string | null;
  created_at: string;
}

interface ActualProduction {
  id: string;
  scope_id: string;
  week_start: string;
  week_end: string;
  houses_count: number;
  house_ids: number[];
}

interface Deviation {
  id: string;
  planned_production_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  planned_count: number;
  actual_count: number;
  deviation: number;
  deviation_reason: string;
  corrective_action: string | null;
}

const DEVIATION_REASONS = [
  "Falta de material",
  "Falta de mão de obra",
  "Problemas climáticos",
  "Problemas técnicos",
  "Atraso de fornecedor",
  "Retrabalho necessário",
  "Mudança de escopo",
  "Equipamento indisponível",
  "Outros"
];

export function PlannedProductionTab() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  
  const [selectedMacro, setSelectedMacro] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");
  const [plannedHousesCount, setPlannedHousesCount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  
  // Planning period dates (next week by default)
  const [planStartDate, setPlanStartDate] = useState<string>(
    format(startOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  const [planEndDate, setPlanEndDate] = useState<string>(
    format(endOfWeek(addWeeks(new Date(), 1), { weekStartsOn: 1 }), "yyyy-MM-dd")
  );
  
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [actualProductions, setActualProductions] = useState<ActualProduction[]>([]);
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Deviation dialog
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState<{
    planned: PlannedProduction;
    actual: number;
    deviation: number;
  } | null>(null);
  const [deviationReason, setDeviationReason] = useState<string>("");
  const [correctiveAction, setCorrectiveAction] = useState<string>("");

  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];

  const scopes = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Load data
  useEffect(() => {
    if (!currentProject) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      // Load planned productions
      const { data: plannedData } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      // Load actual productions for comparison
      const { data: actualData } = await supabase
        .from('weekly_productions')
        .select('id, scope_id, week_start, week_end, houses_count, house_ids')
        .eq('project_id', currentProject.id);
      
      // Load deviations
      const { data: deviationData } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      setPlannedProductions((plannedData || []) as PlannedProduction[]);
      setActualProductions((actualData || []) as ActualProduction[]);
      setDeviations((deviationData || []) as Deviation[]);
      setIsLoading(false);
    };

    loadData();
  }, [currentProject]);

  // Save planned production
  const handleSave = async () => {
    if (!currentProject || !selectedScope || !plannedHousesCount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const macro = macros.find(m => m.id === selectedMacro);
    const scope = scopes.find(s => s.id === selectedScope);
    if (!macro || !scope) return;

    const count = parseInt(plannedHousesCount);
    if (isNaN(count) || count <= 0) {
      toast.error("Quantidade de casas inválida");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('planned_productions')
        .insert({
          project_id: currentProject.id,
          week_start: planStartDate,
          week_end: planEndDate,
          scope_id: scope.id,
          scope_name: scope.name,
          macro_id: macro.id,
          macro_name: macro.name,
          macro_color: macro.color,
          planned_houses: count,
          planned_house_ids: [],
          notes: notes || null,
        });

      if (error) throw error;

      toast.success("Planejamento salvo com sucesso!");
      
      // Reload data
      const { data } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('week_start', { ascending: false });
      
      setPlannedProductions((data || []) as PlannedProduction[]);
      setPlannedHousesCount("");
      setNotes("");
      setSelectedScope("");
    } catch (error) {
      console.error('Error saving planned production:', error);
      toast.error("Erro ao salvar planejamento");
    }
    setIsSaving(false);
  };

  // Delete planned production
  const handleDelete = async (id: string) => {
    try {
      await supabase.from('planned_productions').delete().eq('id', id);
      setPlannedProductions(prev => prev.filter(p => p.id !== id));
      toast.success("Planejamento removido");
    } catch (error) {
      toast.error("Erro ao remover");
    }
  };

  // Save deviation reason
  const handleSaveDeviation = async () => {
    if (!selectedDeviation || !deviationReason || !currentProject) {
      toast.error("Selecione um motivo");
      return;
    }

    try {
      const { error } = await supabase
        .from('production_deviations')
        .insert({
          project_id: currentProject.id,
          planned_production_id: selectedDeviation.planned.id,
          week_start: selectedDeviation.planned.week_start,
          week_end: selectedDeviation.planned.week_end,
          scope_id: selectedDeviation.planned.scope_id,
          scope_name: selectedDeviation.planned.scope_name,
          macro_id: selectedDeviation.planned.macro_id,
          macro_name: selectedDeviation.planned.macro_name,
          planned_count: selectedDeviation.planned.planned_houses,
          actual_count: selectedDeviation.actual,
          deviation: selectedDeviation.deviation,
          deviation_reason: deviationReason,
          corrective_action: correctiveAction || null,
        });

      if (error) throw error;

      toast.success("Desvio registrado com sucesso!");
      setDeviationDialogOpen(false);
      setSelectedDeviation(null);
      setDeviationReason("");
      setCorrectiveAction("");

      // Reload deviations
      const { data } = await supabase
        .from('production_deviations')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('created_at', { ascending: false });
      
      setDeviations((data || []) as Deviation[]);
    } catch (error) {
      console.error('Error saving deviation:', error);
      toast.error("Erro ao registrar desvio");
    }
  };

  // Calculate comparisons for past weeks
  const comparisons = useMemo(() => {
    const now = new Date();
    
    return plannedProductions
      .filter(planned => {
        const endDate = parseISO(planned.week_end);
        return isBefore(endDate, now); // Only past weeks
      })
      .map(planned => {
        // Find actual production for same scope and period
        const actual = actualProductions.filter(a => 
          a.scope_id === planned.scope_id &&
          a.week_start === planned.week_start
        );
        
        const actualCount = actual.reduce((sum, a) => sum + a.houses_count, 0);
        const deviation = actualCount - planned.planned_houses;
        const percentDeviation = planned.planned_houses > 0 
          ? ((deviation / planned.planned_houses) * 100).toFixed(1)
          : "0";
        
        // Check if deviation already registered
        const hasDeviation = deviations.some(d => d.planned_production_id === planned.id);
        
        return {
          planned,
          actualCount,
          deviation,
          percentDeviation,
          hasDeviation,
          isNegative: deviation < 0
        };
      });
  }, [plannedProductions, actualProductions, deviations]);

  // Deviation analysis by reason
  const deviationAnalysis = useMemo(() => {
    const byReason: Record<string, { count: number; totalDeviation: number }> = {};
    
    deviations.forEach(d => {
      if (!byReason[d.deviation_reason]) {
        byReason[d.deviation_reason] = { count: 0, totalDeviation: 0 };
      }
      byReason[d.deviation_reason].count++;
      byReason[d.deviation_reason].totalDeviation += Math.abs(d.deviation);
    });
    
    return Object.entries(byReason)
      .map(([reason, data]) => ({ reason, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [deviations]);

  // Stats
  const stats = useMemo(() => {
    const totalPlanned = comparisons.reduce((sum, c) => sum + c.planned.planned_houses, 0);
    const totalActual = comparisons.reduce((sum, c) => sum + c.actualCount, 0);
    const negativeDeviations = comparisons.filter(c => c.deviation < 0).length;
    const positiveDeviations = comparisons.filter(c => c.deviation > 0).length;
    const onTarget = comparisons.filter(c => c.deviation === 0).length;
    
    return {
      totalPlanned,
      totalActual,
      overallDeviation: totalPlanned > 0 ? (((totalActual - totalPlanned) / totalPlanned) * 100).toFixed(1) : "0",
      negativeDeviations,
      positiveDeviations,
      onTarget,
      accuracy: comparisons.length > 0 ? ((onTarget / comparisons.length) * 100).toFixed(0) : "0"
    };
  }, [comparisons]);

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Planning Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-5 h-5" />
              Planejar Produção
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-secondary/30 rounded-lg space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Período do Planejamento
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input 
                    type="date" 
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input 
                    type="date" 
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Etapa (Macro)</Label>
              <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }}>
                <SelectTrigger className="h-9">
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
              <Label className="text-sm">Serviço</Label>
              <Select 
                value={selectedScope} 
                onValueChange={setSelectedScope}
                disabled={!selectedMacro}
              >
                <SelectTrigger className="h-9">
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

            <div className="space-y-2">
              <Label className="text-sm">Quantidade de Casas Planejadas</Label>
              <Input 
                type="number"
                min="1"
                max={houses.length}
                value={plannedHousesCount}
                onChange={(e) => setPlannedHousesCount(e.target.value)}
                placeholder={`Máx: ${houses.length}`}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Observações (opcional)</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre o planejamento..."
                className="min-h-[60px] resize-none"
              />
            </div>

            <Button 
              className="w-full gap-2 h-10" 
              onClick={handleSave}
              disabled={!selectedScope || !plannedHousesCount || isSaving || !canEdit}
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Salvando..." : "Salvar Planejamento"}
            </Button>
          </CardContent>
        </Card>

        {/* Comparisons and Stats */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Planejado vs Realizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Planejado</p>
                <p className="text-xl font-bold">{stats.totalPlanned}</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Realizado</p>
                <p className="text-xl font-bold">{stats.totalActual}</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Desvio Geral</p>
                <p className={`text-xl font-bold ${parseFloat(stats.overallDeviation) < 0 ? 'text-red-500' : parseFloat(stats.overallDeviation) > 0 ? 'text-green-500' : ''}`}>
                  {stats.overallDeviation}%
                </p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">Acurácia</p>
                <p className="text-xl font-bold">{stats.accuracy}%</p>
              </div>
            </div>

            {/* Comparisons List */}
            <ScrollArea className="h-[300px]">
              {comparisons.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum período passado para comparação ainda
                </div>
              ) : (
                <div className="space-y-2">
                  {comparisons.map(comp => (
                    <div 
                      key={comp.planned.id} 
                      className={`p-3 rounded-lg border ${comp.isNegative && !comp.hasDeviation ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'bg-card'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: comp.planned.macro_color }}
                          />
                          <div>
                            <p className="text-sm font-medium">{comp.planned.scope_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(comp.planned.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(comp.planned.week_end), "dd/MM", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                Plan: {comp.planned.planned_houses}
                              </Badge>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <Badge variant={comp.deviation >= 0 ? "default" : "destructive"} className="text-xs">
                                Real: {comp.actualCount}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-1 justify-end">
                              {comp.deviation > 0 ? (
                                <TrendingUp className="w-3 h-3 text-green-500" />
                              ) : comp.deviation < 0 ? (
                                <TrendingDown className="w-3 h-3 text-red-500" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              )}
                              <span className={`text-xs ${comp.deviation < 0 ? 'text-red-500' : comp.deviation > 0 ? 'text-green-500' : ''}`}>
                                {comp.deviation > 0 ? '+' : ''}{comp.deviation} ({comp.percentDeviation}%)
                              </span>
                            </div>
                          </div>
                          {comp.isNegative && !comp.hasDeviation && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-8 border-red-300 text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setSelectedDeviation({
                                  planned: comp.planned,
                                  actual: comp.actualCount,
                                  deviation: comp.deviation
                                });
                                setDeviationDialogOpen(true);
                              }}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Justificar
                            </Button>
                          )}
                          {comp.hasDeviation && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Justificado
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDelete(comp.planned.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Deviation Analysis */}
      {deviations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Análise de Desvios - Motivos de Não Cumprimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* By Reason Chart */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Frequência por Motivo</p>
                {deviationAnalysis.map((item, index) => (
                  <div key={item.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.reason}</span>
                      <Badge variant="outline">{item.count}x</Badge>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 transition-all"
                        style={{ 
                          width: `${(item.count / Math.max(...deviationAnalysis.map(d => d.count))) * 100}%`,
                          opacity: 1 - (index * 0.15)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Deviations */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Últimos Desvios Registrados</p>
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {deviations.slice(0, 10).map(d => (
                      <div key={d.id} className="p-2 rounded-lg border bg-card text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{d.scope_name}</span>
                          <Badge variant="destructive" className="text-xs">
                            -{Math.abs(d.deviation)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          <strong>Motivo:</strong> {d.deviation_reason}
                        </p>
                        {d.corrective_action && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                            <strong>Ação:</strong> {d.corrective_action}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Future Plans */}
      {plannedProductions.filter(p => isAfter(parseISO(p.week_end), new Date())).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Planejamentos Futuros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {plannedProductions
                .filter(p => isAfter(parseISO(p.week_end), new Date()))
                .map(p => (
                  <div key={p.id} className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: p.macro_color }}
                        />
                        <span className="text-sm font-medium">{p.scope_name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {format(parseISO(p.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(p.week_end), "dd/MM", { locale: ptBR })}
                      </span>
                      <Badge variant="secondary">{p.planned_houses} casas</Badge>
                    </div>
                    {p.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">{p.notes}</p>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deviation Dialog */}
      <Dialog open={deviationDialogOpen} onOpenChange={setDeviationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Registrar Motivo do Desvio
            </DialogTitle>
          </DialogHeader>
          
          {selectedDeviation && (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-sm font-medium">{selectedDeviation.planned.scope_name}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(selectedDeviation.planned.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(selectedDeviation.planned.week_end), "dd/MM", { locale: ptBR })}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">Planejado: {selectedDeviation.planned.planned_houses}</Badge>
                  <Badge variant="destructive">Realizado: {selectedDeviation.actual}</Badge>
                  <Badge variant="secondary">Desvio: {selectedDeviation.deviation}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Motivo do Não Cumprimento *</Label>
                <Select value={deviationReason} onValueChange={setDeviationReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEVIATION_REASONS.map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Ação Corretiva (opcional)</Label>
                <Textarea 
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Descreva a ação corretiva a ser tomada..."
                  className="min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviationDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDeviation} disabled={!deviationReason}>
              Salvar Desvio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
