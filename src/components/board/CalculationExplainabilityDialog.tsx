import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calculator, 
  Database, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Info
} from "lucide-react";
import { format, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalculationData {
  // Data origin
  dataOrigin: {
    periodStart: Date;
    periodEnd: Date;
    housesExecuted: number;
    servicesConsidered: string[];
    dataPoints: number;
  };
  // Real productivity
  productivity: {
    realAverage: number;
    plannedAverage: number;
    unit: string;
    trend: 'improving' | 'stable' | 'declining';
  };
  // Schedule calculation
  schedule: {
    remainingServices: number;
    currentPace: number;
    estimatedEndDate: Date;
    originalEndDate: Date;
    delayDays: number;
  };
  // Cost calculation
  cost: {
    realUnitCost: number;
    projectedRemaining: number;
    indirectCosts: number;
    totalProjected: number;
  };
  // Confidence level
  confidence: {
    level: 'baixo' | 'medio' | 'alto';
    reason: string;
    dataStability: number; // 0-100
    sampleSize: number;
  };
}

interface CalculationExplainabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decisionTitle: string;
  calculationData: CalculationData;
}

export function CalculationExplainabilityDialog({
  open,
  onOpenChange,
  decisionTitle,
  calculationData
}: CalculationExplainabilityDialogProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'alto': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'medio': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'baixo': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining': return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default: return <TrendingUp className="h-4 w-4 text-amber-500 rotate-90" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Como este número foi calculado
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {decisionTitle}
            <Badge variant="outline" className={getConfidenceColor(calculationData.confidence.level)}>
              Confiança: {calculationData.confidence.level.charAt(0).toUpperCase() + calculationData.confidence.level.slice(1)}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        {/* Golden Rule Indicator */}
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center gap-3">
          <Info className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Regra de Ouro:</strong> Nenhum número pode ser editado manualmente, 
            ajustado sem base em dados reais, ou existir sem explicação acessível.
          </p>
        </div>

        <Tabs defaultValue="origin" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="origin">Origem</TabsTrigger>
            <TabsTrigger value="productivity">Produtividade</TabsTrigger>
            <TabsTrigger value="schedule">Prazo</TabsTrigger>
            <TabsTrigger value="cost">Custo</TabsTrigger>
            <TabsTrigger value="confidence">Confiança</TabsTrigger>
          </TabsList>

          {/* Data Origin Tab */}
          <TabsContent value="origin" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  Origem dos Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Período Considerado</p>
                    <p className="font-medium">
                      {format(calculationData.dataOrigin.periodStart, "dd/MM/yyyy", { locale: ptBR })} a{' '}
                      {format(calculationData.dataOrigin.periodEnd, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Casas Executadas no Período</p>
                    <p className="font-medium text-lg">{calculationData.dataOrigin.housesExecuted} unidades</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">Serviços Considerados</p>
                  <div className="flex flex-wrap gap-2">
                    {calculationData.dataOrigin.servicesConsidered.map((service, idx) => (
                      <Badge key={idx} variant="secondary">{service}</Badge>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{calculationData.dataOrigin.dataPoints} pontos de dados</strong> foram 
                    analisados para gerar esta projeção.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Productivity Tab */}
          <TabsContent value="productivity" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Produtividade Real Usada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Produtividade Real Média</p>
                    <p className="text-2xl font-bold text-foreground">
                      {calculationData.productivity.realAverage.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">{calculationData.productivity.unit}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Produtividade Planejada</p>
                    <p className="text-2xl font-bold text-foreground">
                      {calculationData.productivity.plannedAverage.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">{calculationData.productivity.unit}</p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg flex items-center justify-between ${
                  calculationData.productivity.realAverage >= calculationData.productivity.plannedAverage
                    ? 'bg-green-500/5 border border-green-500/20'
                    : 'bg-red-500/5 border border-red-500/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(calculationData.productivity.trend)}
                    <span className="font-medium">Tendência: {
                      calculationData.productivity.trend === 'improving' ? 'Melhorando' :
                      calculationData.productivity.trend === 'declining' ? 'Declinando' : 'Estável'
                    }</span>
                  </div>
                  <span className={`text-lg font-bold ${
                    calculationData.productivity.realAverage >= calculationData.productivity.plannedAverage
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`}>
                    {((calculationData.productivity.realAverage / calculationData.productivity.plannedAverage - 1) * 100).toFixed(1)}%
                  </span>
                </div>

                <p className="text-xs text-muted-foreground italic">
                  * A produtividade real é calculada com base nas execuções registradas no período analisado.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Cálculo do Prazo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">Fórmula Aplicada</p>
                  <div className="p-3 rounded bg-background font-mono text-sm">
                    Data Final = Saldo Restante ÷ Ritmo Atual
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Saldo de Serviços Restantes</p>
                    <p className="text-xl font-bold">{calculationData.schedule.remainingServices}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Ritmo Atual</p>
                    <p className="text-xl font-bold">{calculationData.schedule.currentPace.toFixed(2)}/dia</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Data Original</p>
                    <p className="font-medium">{format(calculationData.schedule.originalEndDate, "dd/MM/yyyy", { locale: ptBR })}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${
                    calculationData.schedule.delayDays > 0 ? 'bg-red-500/10' : 'bg-green-500/10'
                  }`}>
                    <p className="text-xs text-muted-foreground mb-1">Data Estimada</p>
                    <p className={`font-medium ${calculationData.schedule.delayDays > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {format(calculationData.schedule.estimatedEndDate, "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                {calculationData.schedule.delayDays > 0 && (
                  <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                    <p className="text-sm">
                      <AlertTriangle className="h-4 w-4 inline mr-2 text-red-500" />
                      <strong className="text-red-500">{calculationData.schedule.delayDays} dias de atraso projetado</strong> em relação ao prazo original.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cost Tab */}
          <TabsContent value="cost" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Cálculo do Custo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">Fórmula Aplicada</p>
                  <div className="p-3 rounded bg-background font-mono text-sm">
                    Custo Total = (Custo Unitário Real × Saldo) + Custos Indiretos
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Custo Unitário Real Aprendido</span>
                    <span className="font-bold">{formatCurrency(calculationData.cost.realUnitCost)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Projeção sobre Saldo Restante</span>
                    <span className="font-bold">{formatCurrency(calculationData.cost.projectedRemaining)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">Custos Indiretos (prazo adicional)</span>
                    <span className="font-bold">{formatCurrency(calculationData.cost.indirectCosts)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <span className="font-semibold text-foreground">TOTAL PROJETADO</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(calculationData.cost.totalProjected)}</span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground italic">
                  * Os custos unitários são calculados com base nos custos reais registrados no período analisado.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Confidence Tab */}
          <TabsContent value="confidence" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {calculationData.confidence.level === 'alto' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : calculationData.confidence.level === 'medio' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                  Grau de Confiança da Projeção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`p-6 rounded-lg text-center ${
                  calculationData.confidence.level === 'alto' ? 'bg-green-500/10' :
                  calculationData.confidence.level === 'medio' ? 'bg-amber-500/10' : 'bg-red-500/10'
                }`}>
                  <p className={`text-4xl font-bold ${
                    calculationData.confidence.level === 'alto' ? 'text-green-500' :
                    calculationData.confidence.level === 'medio' ? 'text-amber-500' : 'text-red-500'
                  }`}>
                    {calculationData.confidence.level.toUpperCase()}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-2">Motivo da classificação:</p>
                  <p className="font-medium">{calculationData.confidence.reason}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Estabilidade dos Dados</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            calculationData.confidence.dataStability >= 70 ? 'bg-green-500' :
                            calculationData.confidence.dataStability >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${calculationData.confidence.dataStability}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{calculationData.confidence.dataStability}%</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">Tamanho da Amostra</p>
                    <p className="text-xl font-bold">{calculationData.confidence.sampleSize} registros</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Interpretação:</strong> Esta projeção é baseada em{' '}
                    <strong>{calculationData.confidence.sampleSize}</strong> registros de execução real. 
                    {calculationData.confidence.level === 'alto' 
                      ? ' Os dados são consistentes e a projeção tem alta probabilidade de acerto.'
                      : calculationData.confidence.level === 'medio'
                      ? ' Há variação moderada nos dados, recomenda-se monitoramento contínuo.'
                      : ' Os dados apresentam alta variação, considere esta projeção como estimativa preliminar.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
