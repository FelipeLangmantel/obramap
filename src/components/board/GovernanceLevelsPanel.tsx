import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Briefcase, 
  Wrench, 
  FileSearch, 
  TrendingUp, 
  Clock, 
  DollarSign,
  ChevronRight,
  History,
  BarChart3,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  // Extended calculation data for technical validation
  calculationData?: {
    periodStart: Date;
    periodEnd: Date;
    dataPoints: number;
    realProductivity: number;
    plannedProductivity: number;
    confidenceLevel: 'baixo' | 'medio' | 'alto';
  };
}

interface ProductivityHistory {
  weekStart: Date;
  weekEnd: Date;
  planned: number;
  actual: number;
  deviation: number;
}

interface DecisionRecord {
  id: string;
  date: Date;
  riskType: string;
  action: string;
  projectedImpact: number;
  actualImpact?: number;
  status: 'executed' | 'pending';
}

interface GovernanceLevelsPanelProps {
  decision: CriticalDecision;
  productivityHistory: ProductivityHistory[];
  decisionHistory: DecisionRecord[];
  onSimulate: () => void;
  onShowCalculation: () => void;
}

export function GovernanceLevelsPanel({
  decision,
  productivityHistory,
  decisionHistory,
  onSimulate,
  onShowCalculation
}: GovernanceLevelsPanelProps) {
  const [activeLevel, setActiveLevel] = useState<'decision' | 'validation' | 'audit'>('decision');

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-4">
      {/* Level Selector */}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
        <p className="text-xs text-muted-foreground px-2">Nível de Leitura:</p>
        <Tabs value={activeLevel} onValueChange={(v) => setActiveLevel(v as any)} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="decision" className="text-xs gap-1">
              <Briefcase className="h-3 w-3" />
              Decisão
            </TabsTrigger>
            <TabsTrigger value="validation" className="text-xs gap-1">
              <Wrench className="h-3 w-3" />
              Validação
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1">
              <FileSearch className="h-3 w-3" />
              Auditoria
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Level 1 - Executive Decision */}
      {activeLevel === 'decision' && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Visão Executiva</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                Diretor Executivo
              </Badge>
            </div>
            <CardDescription>
              Informações essenciais para tomada de decisão rápida
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Impacto Financeiro
                </p>
                <p className="text-2xl font-bold text-red-500">{formatCurrency(decision.impactCost)}</p>
              </div>
              <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Impacto no Prazo
                </p>
                <p className="text-2xl font-bold text-amber-500">{decision.impactDays} dias</p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-2">Ação Recomendada</p>
              <p className="text-sm text-muted-foreground">{decision.suggestedActions[0]}</p>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-muted-foreground italic">
                "Com base no ritmo atual da obra, este é o cenário mais provável caso nenhuma ação seja tomada."
              </p>
            </div>

            <Button className="w-full" onClick={onSimulate}>
              Simular Decisão
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Level 2 - Technical Validation */}
      {activeLevel === 'validation' && (
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-base">Validação Técnica</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600">
                Diretor Técnico
              </Badge>
            </div>
            <CardDescription>
              Como foram calculadas as projeções e quais premissas usadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {decision.calculationData && (
              <>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium mb-3">Dados Utilizados</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Período analisado:</span>
                      <span className="font-medium">
                        {format(decision.calculationData.periodStart, "dd/MM", { locale: ptBR })} - {format(decision.calculationData.periodEnd, "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pontos de dados:</span>
                      <span className="font-medium">{decision.calculationData.dataPoints}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Produtividade Real</p>
                    <p className="text-lg font-bold">{decision.calculationData.realProductivity.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">casas/semana</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Produtividade Planejada</p>
                    <p className="text-lg font-bold">{decision.calculationData.plannedProductivity.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">casas/semana</p>
                  </div>
                </div>

                <div className={`p-3 rounded-lg flex items-center justify-between ${
                  decision.calculationData.confidenceLevel === 'alto' ? 'bg-green-500/10' :
                  decision.calculationData.confidenceLevel === 'medio' ? 'bg-amber-500/10' : 'bg-red-500/10'
                }`}>
                  <span className="text-sm">Grau de Confiança:</span>
                  <Badge variant="outline" className={
                    decision.calculationData.confidenceLevel === 'alto' ? 'bg-green-500/10 text-green-500' :
                    decision.calculationData.confidenceLevel === 'medio' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-red-500/10 text-red-500'
                  }>
                    {decision.calculationData.confidenceLevel.toUpperCase()}
                  </Badge>
                </div>
              </>
            )}

            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium mb-2">Premissas Adotadas</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Ritmo de produção baseado nas últimas 4 semanas</li>
                <li>• Custo unitário calculado pela média executada</li>
                <li>• Sem considerar eventos extraordinários</li>
              </ul>
            </div>

            <Button variant="outline" className="w-full" onClick={onShowCalculation}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Cálculo Detalhado
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Level 3 - Audit */}
      {activeLevel === 'audit' && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-base">Auditoria</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600">
                Gestão / Controle
              </Badge>
            </div>
            <CardDescription>
              Histórico de dados reais e evolução das decisões
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Productivity History */}
            <div>
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Evolução da Produtividade
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {productivityHistory.slice(0, 6).map((week, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                    <span className="text-muted-foreground">
                      {format(week.weekStart, "dd/MM", { locale: ptBR })} - {format(week.weekEnd, "dd/MM", { locale: ptBR })}
                    </span>
                    <div className="flex items-center gap-3">
                      <span>Plan: {week.planned}</span>
                      <span>Real: {week.actual}</span>
                      <Badge variant="outline" className={
                        week.deviation >= 0 ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                      }>
                        {week.deviation > 0 ? '+' : ''}{week.deviation}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Decision History */}
            <div>
              <p className="text-sm font-medium mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Decisões Tomadas vs. Resultado Real
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {decisionHistory.slice(0, 5).map((record, idx) => (
                  <div key={idx} className="p-2 rounded bg-muted/30 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{format(record.date, "dd/MM/yyyy", { locale: ptBR })}</span>
                      {record.status === 'executed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{record.action}</p>
                    <div className="flex gap-4 mt-1 text-xs">
                      <span>Projetado: {formatCurrency(record.projectedImpact)}</span>
                      {record.actualImpact !== undefined && (
                        <span className={record.actualImpact <= record.projectedImpact ? 'text-green-500' : 'text-red-500'}>
                          Real: {formatCurrency(record.actualImpact)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">
                Este histórico permite validar a assertividade das projeções e calibrar futuras decisões.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
