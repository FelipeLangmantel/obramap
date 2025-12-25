import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Zap, 
  XCircle, 
  CheckCircle2, 
  ChevronRight,
  AlertTriangle,
  FileText,
  Shield
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SimulationScenario {
  action: string;
  newCost: number;
  newDays: number;
  costDiff: number;
  daysDiff: number;
  residualRisk: 'alto' | 'medio' | 'baixo';
}

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

interface DecisionRecord {
  scenarioAccepted: 'current' | 'action';
  selectedAction: string;
  riskMitigated: boolean;
  riskAssumed: boolean;
  changedPremises: string[];
  notes: string;
  projectedSavings: number;
  projectedDaysRecovered: number;
  residualRisk: string;
}

interface EnhancedDecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: CriticalDecision | null;
  scenarios: SimulationScenario[];
  onConfirm: (record: DecisionRecord) => void;
  onShowCalculation: () => void;
  isPending?: boolean;
}

export function EnhancedDecisionDialog({
  open,
  onOpenChange,
  decision,
  scenarios,
  onConfirm,
  onShowCalculation,
  isPending = false
}: EnhancedDecisionDialogProps) {
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [step, setStep] = useState<'simulate' | 'confirm'>('simulate');
  const [notes, setNotes] = useState("");
  const [riskMitigated, setRiskMitigated] = useState(false);
  const [riskAssumed, setRiskAssumed] = useState(false);
  const [changedPremises, setChangedPremises] = useState<string[]>([]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const selectedScenario = scenarios.find(s => s.action === selectedAction);

  const handleConfirm = () => {
    if (!decision || !selectedAction || !selectedScenario) return;

    const record: DecisionRecord = {
      scenarioAccepted: 'action',
      selectedAction,
      riskMitigated,
      riskAssumed,
      changedPremises,
      notes,
      projectedSavings: Math.abs(selectedScenario.costDiff),
      projectedDaysRecovered: Math.abs(selectedScenario.daysDiff),
      residualRisk: selectedScenario.residualRisk
    };

    onConfirm(record);
    resetState();
  };

  const resetState = () => {
    setSelectedAction("");
    setStep('simulate');
    setNotes("");
    setRiskMitigated(false);
    setRiskAssumed(false);
    setChangedPremises([]);
  };

  const handleClose = (open: boolean) => {
    if (!open) resetState();
    onOpenChange(open);
  };

  const premiseOptions = [
    "Aumentar capacidade produtiva",
    "Antecipar compras/suprimentos",
    "Alterar sequência de execução",
    "Reforçar frente crítica",
    "Contratar mão de obra adicional",
    "Renegociar prazos",
    "Aceitar custo adicional"
  ];

  if (!decision) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {step === 'simulate' ? 'Simulação de Decisão' : 'Registro de Decisão Consciente'}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            {decision.title}
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onShowCalculation}>
              <FileText className="h-3 w-3 mr-1" />
              Ver cálculo
            </Button>
          </DialogDescription>
        </DialogHeader>

        {step === 'simulate' && (
          <div className="space-y-6">
            {/* Risk Language Notice */}
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs text-muted-foreground flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-foreground">Importante:</strong> Os valores apresentados são 
                  <strong className="text-amber-600"> projeções baseadas em dados reais</strong>, não garantias. 
                  Representam o cenário mais provável com base no ritmo atual da obra.
                </span>
              </p>
            </div>

            {/* Current Scenario */}
            <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
              <h4 className="font-semibold text-red-500 mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Cenário se nada mudar (projeção)
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Custo adicional projetado</p>
                  <p className="text-xl font-bold text-red-500">{formatCurrency(decision.impactCost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Atraso projetado</p>
                  <p className="text-xl font-bold text-red-500">{decision.impactDays} dias</p>
                </div>
              </div>
            </div>

            {/* Action Scenarios */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Cenários com Mudança de Premissa</h4>
              {scenarios.map((scenario, idx) => (
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
                      Risco residual {scenario.residualRisk}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Economia potencial</p>
                      <p className="font-semibold text-green-500">{formatCurrency(Math.abs(scenario.costDiff))}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Dias recuperados</p>
                      <p className="font-semibold text-green-500">{Math.abs(scenario.daysDiff)} dias</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Custo final projetado</p>
                      <p className="font-semibold text-foreground">{formatCurrency(scenario.newCost)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => setStep('confirm')}
                disabled={!selectedAction}
              >
                Registrar Decisão
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'confirm' && selectedScenario && (
          <div className="space-y-6">
            {/* Summary */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-foreground">Decisão Selecionada</p>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{selectedAction}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-2 rounded bg-green-500/10">
                    <p className="text-xs text-muted-foreground">Economia projetada</p>
                    <p className="font-bold text-green-500">{formatCurrency(Math.abs(selectedScenario.costDiff))}</p>
                  </div>
                  <div className="p-2 rounded bg-green-500/10">
                    <p className="text-xs text-muted-foreground">Dias a recuperar</p>
                    <p className="font-bold text-green-500">{Math.abs(selectedScenario.daysDiff)} dias</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Acknowledgment */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Reconhecimento de Risco</p>
              <div className="space-y-2">
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="mitigate" 
                    checked={riskMitigated}
                    onCheckedChange={(checked) => setRiskMitigated(checked as boolean)}
                  />
                  <Label htmlFor="mitigate" className="text-sm text-muted-foreground cursor-pointer">
                    Esta ação visa <strong className="text-foreground">mitigar</strong> o risco identificado
                  </Label>
                </div>
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="assume" 
                    checked={riskAssumed}
                    onCheckedChange={(checked) => setRiskAssumed(checked as boolean)}
                  />
                  <Label htmlFor="assume" className="text-sm text-muted-foreground cursor-pointer">
                    Esta ação implica <strong className="text-foreground">assumir risco residual</strong> ({selectedScenario.residualRisk})
                  </Label>
                </div>
              </div>
            </div>

            {/* Changed Premises */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Premissas Alteradas</p>
              <div className="grid grid-cols-2 gap-2">
                {premiseOptions.map((premise, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`premise-${idx}`}
                      checked={changedPremises.includes(premise)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setChangedPremises([...changedPremises, premise]);
                        } else {
                          setChangedPremises(changedPremises.filter(p => p !== premise));
                        }
                      }}
                    />
                    <Label htmlFor={`premise-${idx}`} className="text-xs text-muted-foreground cursor-pointer">
                      {premise}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Observações (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Justificativa adicional, contexto da decisão, ou observações para registro..."
                className="min-h-[80px]"
              />
            </div>

            {/* Audit Notice */}
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-muted-foreground">
                <FileText className="h-4 w-4 inline mr-1 text-blue-500" />
                Esta decisão será registrada com data, hora, cenário aceito, risco assumido e premissas alteradas 
                para fins de auditoria e aprendizado do sistema.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('simulate')}>
                Voltar
              </Button>
              <Button 
                onClick={handleConfirm}
                disabled={isPending || (!riskMitigated && !riskAssumed)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isPending ? 'Salvando...' : 'Confirmar Decisão'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
