import { useState, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  DollarSign, 
  Clock, 
  Package, 
  TrendingDown,
  Target,
  CheckCircle2,
  XCircle,
  PlayCircle,
  ChevronRight,
  Shield,
  History,
  Zap
} from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface CriticalDecision {
  id: string;
  type: 'custo' | 'prazo' | 'suprimentos' | 'produtividade';
  title: string;
  description: string;
  impactCost: number;
  impactDays: number;
  location: string;
  deadline: Date;
  severity: 'critical' | 'high' | 'medium';
  suggestedActions: string[];
}

interface SimulationScenario {
  action: string;
  newCost: number;
  newDays: number;
  costDiff: number;
  daysDiff: number;
  residualRisk: 'alto' | 'medio' | 'baixo';
}

export function BoardDecisionsView() {
  const { currentProject } = useConstruction();
  const queryClient = useQueryClient();
  const [selectedDecision, setSelectedDecision] = useState<CriticalDecision | null>(null);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [actionNotes, setActionNotes] = useState("");

  // Fetch houses for current project
  const { data: houses = [] } = useQuery({
    queryKey: ['houses', currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .eq('project_id', currentProject.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject?.id
  });

  // Fetch weekly productions
  const { data: weeklyProductions = [] } = useQuery({
    queryKey: ['weekly-productions', currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const { data, error } = await supabase
        .from('weekly_productions')
        .select('*')
        .eq('project_id', currentProject.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject?.id
  });

  // Fetch planned productions
  const { data: plannedProductions = [] } = useQuery({
    queryKey: ['planned-productions', currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const { data, error } = await supabase
        .from('planned_productions')
        .select('*')
        .eq('project_id', currentProject.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject?.id
  });

  // Fetch decision history
  const { data: decisionsHistory = [] } = useQuery({
    queryKey: ['board-decisions', currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const { data, error } = await supabase
        .from('board_decisions')
        .select('*')
        .eq('project_id', currentProject.id)
        .order('decision_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentProject?.id
  });

  // Generate critical decisions based on project data
  const criticalDecisions = useMemo<CriticalDecision[]>(() => {
    if (!currentProject || !houses.length) return [];
    
    const decisions: CriticalDecision[] = [];
    const today = new Date();
    const projectEnd = new Date(currentProject.expectedEndDate);
    const daysRemaining = differenceInDays(projectEnd, today);
    
    // Parse macros template
    const macros = Array.isArray(currentProject.macrosTemplate) 
      ? currentProject.macrosTemplate 
      : [];

    // 1. Analyze production delays
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 1 });
    
    const thisWeekPlanned = plannedProductions.filter(p => {
      const start = new Date(p.week_start);
      return start >= thisWeekStart && start <= thisWeekEnd;
    });

    const thisWeekActual = weeklyProductions.filter(p => {
      const start = new Date(p.week_start);
      return start >= thisWeekStart && start <= thisWeekEnd;
    });

    // Check for production shortfall
    thisWeekPlanned.forEach(planned => {
      const actual = thisWeekActual.find(
        a => a.macro_id === planned.macro_id && a.scope_id === planned.scope_id
      );
      const actualCount = actual?.houses_count || 0;
      const plannedCount = planned.planned_houses || 0;
      
      if (plannedCount > 0 && actualCount < plannedCount * 0.7) {
        const shortfall = plannedCount - actualCount;
        const estimatedCostImpact = shortfall * (currentProject.unitSize || 45) * 150; // R$150/m²
        
        decisions.push({
          id: `prod-${planned.id}`,
          type: 'produtividade',
          title: `Produção abaixo da meta: ${planned.scope_name}`,
          description: `${planned.macro_name} - Planejado: ${plannedCount} casas, Executado: ${actualCount} casas`,
          impactCost: estimatedCostImpact,
          impactDays: Math.ceil(shortfall / 2), // Assume 2 houses/day capacity
          location: `Etapa ${planned.macro_name}`,
          deadline: addDays(today, 3),
          severity: shortfall >= 5 ? 'critical' : shortfall >= 3 ? 'high' : 'medium',
          suggestedActions: [
            'Adicionar equipe extra',
            'Redistribuir recursos de outra frente',
            'Renegociar prazo com cliente',
            'Contratar empreiteiro adicional'
          ]
        });
      }
    });

    // 2. Analyze overall progress vs deadline
    const totalProgress = houses.reduce((sum, h) => {
      const houseMacros = Array.isArray(h.macros) ? h.macros : [];
      const totalWeight = houseMacros.reduce((w: number, m: any) => w + (m.weight || 0), 0);
      const completedWeight = houseMacros.reduce((w: number, m: any) => {
        const scopes = Array.isArray(m.scopes) ? m.scopes : [];
        return w + scopes.reduce((sw: number, s: any) => sw + ((s.progress || 0) * (m.weight || 0) / 100), 0);
      }, 0);
      return sum + (totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0);
    }, 0) / (houses.length || 1);

    const expectedProgress = daysRemaining > 0 
      ? ((differenceInDays(today, new Date(currentProject.startDate)) / 
          differenceInDays(projectEnd, new Date(currentProject.startDate))) * 100)
      : 100;

    if (expectedProgress - totalProgress > 10) {
      const delay = Math.round((expectedProgress - totalProgress) / 100 * daysRemaining);
      decisions.push({
        id: 'deadline-risk',
        type: 'prazo',
        title: 'Risco de atraso no prazo final',
        description: `Progresso atual ${totalProgress.toFixed(1)}% vs esperado ${expectedProgress.toFixed(1)}%. Atraso projetado: ${delay} dias`,
        impactCost: delay * houses.length * 50, // R$50/dia/casa de custo extra
        impactDays: delay,
        location: 'Obra completa',
        deadline: addDays(today, 7),
        severity: delay > 30 ? 'critical' : delay > 15 ? 'high' : 'medium',
        suggestedActions: [
          'Acelerar frentes críticas',
          'Resequenciar atividades',
          'Aumentar efetivo geral',
          'Revisar cronograma com cliente'
        ]
      });
    }

    // 3. Check for stalled houses (no progress in 2+ weeks)
    const stalledHouses = houses.filter(h => {
      const lastUpdate = new Date(h.last_update);
      return differenceInDays(today, lastUpdate) > 14;
    });

    if (stalledHouses.length > 0) {
      const stalledPercent = (stalledHouses.length / houses.length) * 100;
      decisions.push({
        id: 'stalled-houses',
        type: 'produtividade',
        title: `${stalledHouses.length} unidades paradas há mais de 2 semanas`,
        description: `${stalledPercent.toFixed(1)}% das unidades sem avanço registrado`,
        impactCost: stalledHouses.length * 2000, // R$2000/casa parada
        impactDays: 14,
        location: `Casas: ${stalledHouses.slice(0, 5).map(h => h.house_number).join(', ')}${stalledHouses.length > 5 ? '...' : ''}`,
        deadline: addDays(today, 2),
        severity: stalledPercent > 20 ? 'critical' : stalledPercent > 10 ? 'high' : 'medium',
        suggestedActions: [
          'Verificar bloqueios de suprimentos',
          'Realocar equipe para frentes paradas',
          'Investigar causas com encarregados',
          'Priorizar desbloqueio imediato'
        ]
      });
    }

    // 4. Low completion rate near deadline
    if (daysRemaining < 60 && totalProgress < 80) {
      const gap = 100 - totalProgress;
      decisions.push({
        id: 'completion-gap',
        type: 'custo',
        title: 'Gap crítico de conclusão próximo ao prazo',
        description: `Faltam ${gap.toFixed(1)}% para conclusão com apenas ${daysRemaining} dias restantes`,
        impactCost: gap * houses.length * 100,
        impactDays: Math.max(0, Math.round(gap / 2) - daysRemaining),
        location: 'Obra completa',
        deadline: addDays(today, 5),
        severity: 'critical',
        suggestedActions: [
          'Mobilização emergencial de equipes',
          'Contratação de turnos extras',
          'Priorização radical de acabamentos',
          'Negociar extensão de prazo'
        ]
      });
    }

    // Sort by severity and impact
    return decisions
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return (b.impactCost + b.impactDays * 1000) - (a.impactCost + a.impactDays * 1000);
      })
      .slice(0, 5);
  }, [currentProject, houses, weeklyProductions, plannedProductions]);

  // Calculate simulation scenarios
  const simulationScenarios = useMemo<SimulationScenario[]>(() => {
    if (!selectedDecision) return [];
    
    return selectedDecision.suggestedActions.map(action => {
      // Simulate different outcomes based on action type
      let costReduction = 0;
      let daysRecovered = 0;
      let residualRisk: 'alto' | 'medio' | 'baixo' = 'medio';

      if (action.includes('equipe') || action.includes('efetivo')) {
        costReduction = selectedDecision.impactCost * 0.3; // 30% cost mitigation
        daysRecovered = Math.floor(selectedDecision.impactDays * 0.5);
        residualRisk = 'medio';
      } else if (action.includes('empreiteiro') || action.includes('contrat')) {
        costReduction = selectedDecision.impactCost * 0.6;
        daysRecovered = Math.floor(selectedDecision.impactDays * 0.7);
        residualRisk = 'baixo';
      } else if (action.includes('Renegociar') || action.includes('Revisar')) {
        costReduction = selectedDecision.impactCost * 0.1;
        daysRecovered = Math.floor(selectedDecision.impactDays * 0.3);
        residualRisk = 'alto';
      } else {
        costReduction = selectedDecision.impactCost * 0.4;
        daysRecovered = Math.floor(selectedDecision.impactDays * 0.4);
        residualRisk = 'medio';
      }

      return {
        action,
        newCost: selectedDecision.impactCost - costReduction,
        newDays: selectedDecision.impactDays - daysRecovered,
        costDiff: -costReduction,
        daysDiff: -daysRecovered,
        residualRisk
      };
    });
  }, [selectedDecision]);

  // Calculate management quality indicator
  const managementQuality = useMemo(() => {
    if (decisionsHistory.length === 0) return { level: 'media' as const, score: 50 };
    
    const executedDecisions = decisionsHistory.filter(d => d.status === 'executed');
    const pendingDecisions = decisionsHistory.filter(d => d.status === 'pending');
    
    // Score based on executed vs pending ratio and timing
    const executionRate = executedDecisions.length / decisionsHistory.length;
    const score = Math.round(executionRate * 100);
    
    let level: 'alta' | 'media' | 'baixa' = 'media';
    if (score >= 70) level = 'alta';
    else if (score < 40) level = 'baixa';
    
    return { level, score };
  }, [decisionsHistory]);

  // Save decision mutation
  const saveDecisionMutation = useMutation({
    mutationFn: async ({ decision, action }: { decision: CriticalDecision; action: string }) => {
      if (!currentProject?.id) throw new Error('No project selected');
      
      const { error } = await supabase
        .from('board_decisions')
        .insert({
          project_id: currentProject.id,
          risk_type: decision.type,
          alert_origin: decision.description,
          action_taken: action + (actionNotes ? ` - ${actionNotes}` : ''),
          projected_impact_cost: decision.impactCost,
          projected_impact_days: decision.impactDays,
          location: decision.location,
          status: 'executed'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Decisão registrada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['board-decisions'] });
      setConfirmDialogOpen(false);
      setSimulationOpen(false);
      setSelectedDecision(null);
      setSelectedAction("");
      setActionNotes("");
    },
    onError: (error) => {
      toast.error('Erro ao registrar decisão');
      console.error(error);
    }
  });

  const getRiskTypeIcon = (type: string) => {
    switch (type) {
      case 'custo': return <DollarSign className="h-5 w-5" />;
      case 'prazo': return <Clock className="h-5 w-5" />;
      case 'suprimentos': return <Package className="h-5 w-5" />;
      case 'produtividade': return <TrendingDown className="h-5 w-5" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getRiskTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      custo: 'bg-red-500/10 text-red-500 border-red-500/20',
      prazo: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      suprimentos: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      produtividade: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    };
    return colors[type] || 'bg-muted text-muted-foreground';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-l-red-500 bg-red-500/5';
      case 'high': return 'border-l-amber-500 bg-amber-500/5';
      default: return 'border-l-blue-500 bg-blue-500/5';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um projeto para ver as decisões</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Decisões da Diretoria</h1>
          <p className="text-muted-foreground mt-1">
            Semana de {format(startOfWeek(new Date(), { weekStartsOn: 1 }), "dd/MM", { locale: ptBR })} a {format(endOfWeek(new Date(), { weekStartsOn: 1 }), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
        
        {/* Management Quality Indicator */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-full ${
              managementQuality.level === 'alta' ? 'bg-green-500/10' :
              managementQuality.level === 'media' ? 'bg-amber-500/10' : 'bg-red-500/10'
            }`}>
              <Shield className={`h-6 w-6 ${
                managementQuality.level === 'alta' ? 'text-green-500' :
                managementQuality.level === 'media' ? 'text-amber-500' : 'text-red-500'
              }`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gestão Antecipada</p>
              <p className={`text-lg font-bold ${
                managementQuality.level === 'alta' ? 'text-green-500' :
                managementQuality.level === 'media' ? 'text-amber-500' : 'text-red-500'
              }`}>
                {managementQuality.level.charAt(0).toUpperCase() + managementQuality.level.slice(1)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Decisions Block */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle>Decisões Críticas da Semana</CardTitle>
          </div>
          <CardDescription>
            Se você só puder decidir 3 coisas esta semana, quais são?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {criticalDecisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p className="font-medium">Nenhuma decisão crítica pendente</p>
              <p className="text-sm">A obra está dentro dos parâmetros esperados</p>
            </div>
          ) : (
            criticalDecisions.map((decision, index) => (
              <div
                key={decision.id}
                className={`border-l-4 rounded-lg p-4 ${getSeverityColor(decision.severity)} transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-muted-foreground">#{index + 1}</span>
                      <Badge variant="outline" className={getRiskTypeBadge(decision.type)}>
                        {getRiskTypeIcon(decision.type)}
                        <span className="ml-1 capitalize">{decision.type}</span>
                      </Badge>
                      {decision.severity === 'critical' && (
                        <Badge variant="destructive">CRÍTICO</Badge>
                      )}
                    </div>
                    
                    <h3 className="font-semibold text-foreground mb-1">{decision.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{decision.description}</p>
                    
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-4 w-4 text-red-500" />
                        <span>Impacto: <strong className="text-red-500">{formatCurrency(decision.impactCost)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <span>Atraso: <strong className="text-amber-500">{decision.impactDays} dias</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span>📍 {decision.location}</span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground mt-2">
                      ⏰ Decidir até: <strong>{format(decision.deadline, "EEEE, dd/MM", { locale: ptBR })}</strong>
                    </p>
                  </div>
                  
                  <Button
                    onClick={() => {
                      setSelectedDecision(decision);
                      setSimulationOpen(true);
                    }}
                    className="shrink-0"
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Simular decisão
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Decision History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <CardTitle>Decisões Tomadas</CardTitle>
          </div>
          <CardDescription>Histórico de decisões e ações da diretoria</CardDescription>
        </CardHeader>
        <CardContent>
          {decisionsHistory.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">
              Nenhuma decisão registrada ainda
            </p>
          ) : (
            <div className="space-y-3">
              {decisionsHistory.slice(0, 10).map((decision) => (
                <div key={decision.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <div className={`p-2 rounded-full ${
                    decision.status === 'executed' ? 'bg-green-500/10' : 'bg-amber-500/10'
                  }`}>
                    {decision.status === 'executed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={getRiskTypeBadge(decision.risk_type)}>
                        {decision.risk_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(decision.decision_date), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{decision.action_taken}</p>
                    <p className="text-xs text-muted-foreground truncate">{decision.alert_origin}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>💰 {formatCurrency(decision.projected_impact_cost)}</span>
                      <span>📅 {decision.projected_impact_days} dias</span>
                      {decision.location && <span>📍 {decision.location}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulation Dialog */}
      <Dialog open={simulationOpen} onOpenChange={setSimulationOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Simulação de Decisão
            </DialogTitle>
            {selectedDecision && (
              <DialogDescription>{selectedDecision.title}</DialogDescription>
            )}
          </DialogHeader>
          
          {selectedDecision && (
            <div className="space-y-6">
              {/* Current Scenario */}
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <h4 className="font-semibold text-red-500 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Cenário Atual (se nada mudar)
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Custo adicional</p>
                    <p className="text-xl font-bold text-red-500">{formatCurrency(selectedDecision.impactCost)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dias de atraso</p>
                    <p className="text-xl font-bold text-red-500">{selectedDecision.impactDays} dias</p>
                  </div>
                </div>
              </div>

              {/* Action Scenarios */}
              <div className="space-y-3">
                <h4 className="font-semibold text-foreground">Cenários com Ação</h4>
                {simulationScenarios.map((scenario, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedAction === scenario.action 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedAction(scenario.action)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-foreground">{scenario.action}</p>
                      <Badge variant="outline" className={
                        scenario.residualRisk === 'baixo' ? 'bg-green-500/10 text-green-500' :
                        scenario.residualRisk === 'medio' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-500'
                      }>
                        Risco {scenario.residualRisk}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Economia</p>
                        <p className="font-semibold text-green-500">{formatCurrency(Math.abs(scenario.costDiff))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Dias recuperados</p>
                        <p className="font-semibold text-green-500">{Math.abs(scenario.daysDiff)} dias</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Custo final</p>
                        <p className="font-semibold text-foreground">{formatCurrency(scenario.newCost)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSimulationOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={!selectedAction}
                >
                  Registrar Decisão
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Decision Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Decisão</DialogTitle>
            <DialogDescription>
              Registrar a decisão: "{selectedAction}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Observações (opcional)</label>
              <Textarea
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Adicione observações sobre a decisão..."
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (selectedDecision && selectedAction) {
                  saveDecisionMutation.mutate({ 
                    decision: selectedDecision, 
                    action: selectedAction 
                  });
                }
              }}
              disabled={saveDecisionMutation.isPending}
            >
              {saveDecisionMutation.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
