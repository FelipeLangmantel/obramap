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
  PlayCircle,
  Shield,
  History,
  Info,
  Calculator,
  Eye
} from "lucide-react";
import { format, differenceInDays, addDays, startOfWeek, endOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalculationExplainabilityDialog } from "@/components/board/CalculationExplainabilityDialog";
import { EnhancedDecisionDialog } from "@/components/board/EnhancedDecisionDialog";
import { GovernanceLevelsPanel } from "@/components/board/GovernanceLevelsPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  calculationData?: {
    periodStart: Date;
    periodEnd: Date;
    dataPoints: number;
    realProductivity: number;
    plannedProductivity: number;
    confidenceLevel: 'baixo' | 'medio' | 'alto';
  };
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
  const [calculationDialogOpen, setCalculationDialogOpen] = useState(false);
  const [expandedDecisionId, setExpandedDecisionId] = useState<string | null>(null);

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
        .eq('project_id', currentProject.id)
        .is('deleted_at', null);
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

  // Generate productivity history for audit
  const productivityHistory = useMemo(() => {
    const history: { weekStart: Date; weekEnd: Date; planned: number; actual: number; deviation: number }[] = [];
    const today = new Date();
    
    for (let i = 0; i < 8; i++) {
      const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      
      const planned = plannedProductions.filter(p => {
        const start = new Date(p.week_start);
        return start >= weekStart && start <= weekEnd;
      }).reduce((sum, p) => sum + (p.planned_houses || 0), 0);
      
      const actual = weeklyProductions.filter(p => {
        const start = new Date(p.week_start);
        return start >= weekStart && start <= weekEnd;
      }).reduce((sum, p) => sum + (p.houses_count || 0), 0);
      
      history.push({
        weekStart,
        weekEnd,
        planned,
        actual,
        deviation: actual - planned
      });
    }
    
    return history;
  }, [plannedProductions, weeklyProductions]);

  // Generate critical decisions based on project data
  const criticalDecisions = useMemo<CriticalDecision[]>(() => {
    if (!currentProject || !houses.length) return [];
    
    const decisions: CriticalDecision[] = [];
    const today = new Date();
    const projectEnd = new Date(currentProject.expectedEndDate);
    const daysRemaining = differenceInDays(projectEnd, today);
    const periodStart = subWeeks(today, 4);
    const periodEnd = today;

    // Calculate real productivity from last 4 weeks
    const last4WeeksProductions = weeklyProductions.filter(p => {
      const start = new Date(p.week_start);
      return start >= periodStart && start <= periodEnd;
    });
    
    const totalActual = last4WeeksProductions.reduce((sum, p) => sum + (p.houses_count || 0), 0);
    const realProductivity = last4WeeksProductions.length > 0 ? totalActual / 4 : 0; // per week
    
    const last4WeeksPlanned = plannedProductions.filter(p => {
      const start = new Date(p.week_start);
      return start >= periodStart && start <= periodEnd;
    });
    const totalPlanned = last4WeeksPlanned.reduce((sum, p) => sum + (p.planned_houses || 0), 0);
    const plannedProductivity = last4WeeksPlanned.length > 0 ? totalPlanned / 4 : 0;

    const dataPoints = last4WeeksProductions.length + last4WeeksPlanned.length;
    
    // Determine confidence level
    const confidenceLevel: 'baixo' | 'medio' | 'alto' = 
      dataPoints >= 20 ? 'alto' : dataPoints >= 10 ? 'medio' : 'baixo';

    const baseCalculationData = {
      periodStart,
      periodEnd,
      dataPoints,
      realProductivity,
      plannedProductivity,
      confidenceLevel
    };

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
        const estimatedCostImpact = shortfall * (currentProject.unitSize || 45) * 150;
        
        decisions.push({
          id: `prod-${planned.id}`,
          type: 'produtividade',
          title: `Produção abaixo da meta: ${planned.scope_name}`,
          description: `${planned.macro_name} - Planejado: ${plannedCount} casas, Executado: ${actualCount} casas`,
          impactCost: estimatedCostImpact,
          impactDays: Math.ceil(shortfall / 2),
          location: `Etapa ${planned.macro_name}`,
          deadline: addDays(today, 3),
          severity: shortfall >= 5 ? 'critical' : shortfall >= 3 ? 'high' : 'medium',
          suggestedActions: [
            'Adicionar equipe extra',
            'Redistribuir recursos de outra frente',
            'Renegociar prazo com cliente',
            'Contratar empreiteiro adicional'
          ],
          calculationData: baseCalculationData
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
        impactCost: delay * houses.length * 50,
        impactDays: delay,
        location: 'Obra completa',
        deadline: addDays(today, 7),
        severity: delay > 30 ? 'critical' : delay > 15 ? 'high' : 'medium',
        suggestedActions: [
          'Acelerar frentes críticas',
          'Resequenciar atividades',
          'Aumentar efetivo geral',
          'Revisar cronograma com cliente'
        ],
        calculationData: baseCalculationData
      });
    }

    // 3. Check for stalled houses
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
        impactCost: stalledHouses.length * 2000,
        impactDays: 14,
        location: `Casas: ${stalledHouses.slice(0, 5).map(h => h.house_number).join(', ')}${stalledHouses.length > 5 ? '...' : ''}`,
        deadline: addDays(today, 2),
        severity: stalledPercent > 20 ? 'critical' : stalledPercent > 10 ? 'high' : 'medium',
        suggestedActions: [
          'Verificar bloqueios de suprimentos',
          'Realocar equipe para frentes paradas',
          'Investigar causas com encarregados',
          'Priorizar desbloqueio imediato'
        ],
        calculationData: baseCalculationData
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
        ],
        calculationData: baseCalculationData
      });
    }

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
      let costReduction = 0;
      let daysRecovered = 0;
      let residualRisk: 'alto' | 'medio' | 'baixo' = 'medio';

      if (action.includes('equipe') || action.includes('efetivo')) {
        costReduction = selectedDecision.impactCost * 0.3;
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
    const executionRate = executedDecisions.length / decisionsHistory.length;
    const score = Math.round(executionRate * 100);
    
    let level: 'alta' | 'media' | 'baixa' = 'media';
    if (score >= 70) level = 'alta';
    else if (score < 40) level = 'baixa';
    
    return { level, score };
  }, [decisionsHistory]);

  // Save decision mutation
  const saveDecisionMutation = useMutation({
    mutationFn: async ({ decision, record }: { 
      decision: CriticalDecision; 
      record: {
        selectedAction: string;
        notes: string;
        projectedSavings: number;
        projectedDaysRecovered: number;
        residualRisk: string;
        riskMitigated: boolean;
        riskAssumed: boolean;
        changedPremises: string[];
      }
    }) => {
      if (!currentProject?.id) throw new Error('No project selected');
      
      const actionDetails = [
        record.selectedAction,
        record.notes ? `Obs: ${record.notes}` : '',
        `Premissas alteradas: ${record.changedPremises.join(', ') || 'Nenhuma'}`,
        record.riskMitigated ? 'Risco mitigado' : '',
        record.riskAssumed ? `Risco residual assumido: ${record.residualRisk}` : ''
      ].filter(Boolean).join(' | ');

      const { error } = await supabase
        .from('board_decisions')
        .insert({
          project_id: currentProject.id,
          risk_type: decision.type,
          alert_origin: decision.description,
          action_taken: actionDetails,
          projected_impact_cost: record.projectedSavings,
          projected_impact_days: record.projectedDaysRecovered,
          location: decision.location,
          status: 'executed'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Decisão registrada com sucesso');
      queryClient.invalidateQueries({ queryKey: ['board-decisions'] });
      setSimulationOpen(false);
      setSelectedDecision(null);
    },
    onError: (error) => {
      toast.error('Erro ao registrar decisão');
      console.error(error);
    }
  });

  // Generate calculation data for dialog
  const calculationData = useMemo(() => {
    if (!selectedDecision?.calculationData || !currentProject) return null;
    
    const calc = selectedDecision.calculationData;
    const today = new Date();
    const projectEnd = new Date(currentProject.expectedEndDate);
    
    return {
      dataOrigin: {
        periodStart: calc.periodStart,
        periodEnd: calc.periodEnd,
        housesExecuted: weeklyProductions
          .filter(p => new Date(p.week_start) >= calc.periodStart && new Date(p.week_start) <= calc.periodEnd)
          .reduce((sum, p) => sum + (p.houses_count || 0), 0),
        servicesConsidered: [...new Set(weeklyProductions.map(p => p.scope_name))].slice(0, 6),
        dataPoints: calc.dataPoints
      },
      productivity: {
        realAverage: calc.realProductivity,
        plannedAverage: calc.plannedProductivity,
        unit: 'casas/semana',
        trend: calc.realProductivity > calc.plannedProductivity * 0.9 
          ? 'improving' as const
          : calc.realProductivity < calc.plannedProductivity * 0.7 
            ? 'declining' as const 
            : 'stable' as const
      },
      schedule: {
        remainingServices: houses.length - Math.round(houses.length * (selectedDecision.calculationData?.realProductivity || 0) / 100),
        currentPace: calc.realProductivity / 7,
        estimatedEndDate: addDays(projectEnd, selectedDecision.impactDays),
        originalEndDate: projectEnd,
        delayDays: selectedDecision.impactDays
      },
      cost: {
        realUnitCost: (currentProject.unitSize || 45) * 150,
        projectedRemaining: selectedDecision.impactCost * 0.7,
        indirectCosts: selectedDecision.impactCost * 0.3,
        totalProjected: selectedDecision.impactCost
      },
      confidence: {
        level: calc.confidenceLevel,
        reason: calc.confidenceLevel === 'alto'
          ? 'Dados estáveis com volume adequado de registros nas últimas 4 semanas.'
          : calc.confidenceLevel === 'medio'
            ? 'Volume moderado de dados. Recomenda-se monitoramento contínuo.'
            : 'Poucos registros disponíveis. Considere esta projeção como estimativa preliminar.',
        dataStability: calc.confidenceLevel === 'alto' ? 85 : calc.confidenceLevel === 'medio' ? 55 : 25,
        sampleSize: calc.dataPoints
      }
    };
  }, [selectedDecision, currentProject, houses, weeklyProductions]);

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

      {/* Golden Rule Notice */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-3">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-foreground font-medium">Regra de Ouro deste Painel</p>
          <p className="text-xs text-muted-foreground mt-1">
            Todos os números são projeções baseadas exclusivamente em dados reais já executados. 
            Nenhum valor pode ser editado manualmente ou existir sem explicação acessível.
            <strong className="text-foreground"> Não prevemos o futuro — projetamos cenários com base em execução real.</strong>
          </p>
        </div>
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
              <Collapsible
                key={decision.id}
                open={expandedDecisionId === decision.id}
                onOpenChange={(open) => setExpandedDecisionId(open ? decision.id : null)}
              >
                <div className={`border-l-4 rounded-lg ${getSeverityColor(decision.severity)} transition-all`}>
                  <div className="p-4">
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
                          {decision.calculationData && (
                            <Badge variant="outline" className={
                              decision.calculationData.confidenceLevel === 'alto' ? 'bg-green-500/10 text-green-500' :
                              decision.calculationData.confidenceLevel === 'medio' ? 'bg-amber-500/10 text-amber-500' :
                              'bg-red-500/10 text-red-500'
                            }>
                              Confiança: {decision.calculationData.confidenceLevel}
                            </Badge>
                          )}
                        </div>
                        
                        <h3 className="font-semibold text-foreground mb-1">{decision.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">{decision.description}</p>
                        
                        {/* Risk Language Notice */}
                        <p className="text-xs text-muted-foreground italic mb-3 p-2 rounded bg-muted/30">
                          "Com base no ritmo atual da obra, este é o cenário mais provável caso nenhuma ação seja tomada."
                        </p>
                        
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="h-4 w-4 text-red-500" />
                            <span>Impacto projetado: <strong className="text-red-500">{formatCurrency(decision.impactCost)}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-amber-500" />
                            <span>Atraso projetado: <strong className="text-amber-500">{decision.impactDays} dias</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span>📍 {decision.location}</span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground mt-2">
                          ⏰ Decidir até: <strong>{format(decision.deadline, "EEEE, dd/MM", { locale: ptBR })}</strong>
                        </p>
                      </div>
                      
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          onClick={() => {
                            setSelectedDecision(decision);
                            setSimulationOpen(true);
                          }}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Simular decisão
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            {expandedDecisionId === decision.id ? 'Ocultar detalhes' : 'Ver detalhes'}
                          </Button>
                        </CollapsibleTrigger>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedDecision(decision);
                            setCalculationDialogOpen(true);
                          }}
                        >
                          <Calculator className="h-4 w-4 mr-2" />
                          Como calculamos
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="px-4 pb-4 border-t border-border/50 pt-4">
                      <GovernanceLevelsPanel
                        decision={decision}
                        productivityHistory={productivityHistory}
                        decisionHistory={decisionsHistory.map(d => ({
                          id: d.id,
                          date: new Date(d.decision_date),
                          riskType: d.risk_type,
                          action: d.action_taken,
                          projectedImpact: d.projected_impact_cost || 0,
                          status: d.status as 'executed' | 'pending'
                        }))}
                        onSimulate={() => {
                          setSelectedDecision(decision);
                          setSimulationOpen(true);
                        }}
                        onShowCalculation={() => {
                          setSelectedDecision(decision);
                          setCalculationDialogOpen(true);
                        }}
                      />
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
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
          <CardDescription>Histórico de decisões conscientes com cenário aceito e premissas alteradas</CardDescription>
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
                    <p className="text-sm font-medium text-foreground">{decision.action_taken.split(' | ')[0]}</p>
                    <p className="text-xs text-muted-foreground truncate">{decision.alert_origin}</p>
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>💰 Economia: {formatCurrency(decision.projected_impact_cost || 0)}</span>
                      <span>📅 Dias recuperados: {decision.projected_impact_days || 0}</span>
                      {decision.location && <span>📍 {decision.location}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Decision Dialog */}
      <EnhancedDecisionDialog
        open={simulationOpen}
        onOpenChange={setSimulationOpen}
        decision={selectedDecision}
        scenarios={simulationScenarios}
        onConfirm={(record) => {
          if (selectedDecision) {
            saveDecisionMutation.mutate({ decision: selectedDecision, record });
          }
        }}
        onShowCalculation={() => setCalculationDialogOpen(true)}
        isPending={saveDecisionMutation.isPending}
      />

      {/* Calculation Explainability Dialog */}
      {calculationData && selectedDecision && (
        <CalculationExplainabilityDialog
          open={calculationDialogOpen}
          onOpenChange={setCalculationDialogOpen}
          decisionTitle={selectedDecision.title}
          calculationData={calculationData}
        />
      )}
    </div>
  );
}
