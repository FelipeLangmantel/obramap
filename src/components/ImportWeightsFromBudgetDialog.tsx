import { useState, useEffect } from "react";
import { Calculator, Download, Pencil, Lock, Unlock, AlertTriangle, FileText, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";

interface ImportWeightsFromBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BudgetSummary {
  totalValue: number;
  scopeCount: number;
  macroCount: number;
  hasData: boolean;
}

export function ImportWeightsFromBudgetDialog({ open, onOpenChange }: ImportWeightsFromBudgetDialogProps) {
  const { currentProject, updateScope, updateProject } = useConstruction();
  const [selectedMode, setSelectedMode] = useState<"automatic" | "manual">("manual");
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Load budget summary when dialog opens
  useEffect(() => {
    if (open && currentProject) {
      loadBudgetSummary();
      setSelectedMode(currentProject.weightMode as "automatic" | "manual" || "manual");
    }
  }, [open, currentProject?.id]);

  const loadBudgetSummary = async () => {
    if (!currentProject) return;
    setIsLoading(true);

    try {
      const { data: itemsData, error } = await supabase
        .from('scope_items')
        .select('scope_id, macro_id, unit_value, quantity')
        .eq('project_id', currentProject.id);

      if (error) throw error;

      if (!itemsData || itemsData.length === 0) {
        setBudgetSummary({ totalValue: 0, scopeCount: 0, macroCount: 0, hasData: false });
      } else {
        const totalValue = itemsData.reduce((sum, item) => sum + (Number(item.unit_value) * Number(item.quantity)), 0);
        const uniqueScopes = new Set(itemsData.map(i => i.scope_id));
        const uniqueMacros = new Set(itemsData.map(i => i.macro_id));
        
        setBudgetSummary({
          totalValue,
          scopeCount: uniqueScopes.size,
          macroCount: uniqueMacros.size,
          hasData: totalValue > 0
        });
      }
    } catch (error) {
      console.error('Error loading budget summary:', error);
      setBudgetSummary({ totalValue: 0, scopeCount: 0, macroCount: 0, hasData: false });
    }
    setIsLoading(false);
  };

  const handleApply = async () => {
    if (!currentProject) return;
    setIsApplying(true);

    try {
      if (selectedMode === "automatic") {
        // Import weights from budget - get all scope_items with their values
        const { data: itemsData, error: itemsError } = await supabase
          .from('scope_items')
          .select('scope_id, macro_id, unit_value, quantity, name')
          .eq('project_id', currentProject.id);

        if (itemsError) throw itemsError;

        if (!itemsData || itemsData.length === 0) {
          toast.error('Nenhum item de orçamento encontrado. Adicione itens em "Custos de Obra" primeiro.');
          setIsApplying(false);
          return;
        }

        // Calculate totals by macro_id and scope_id from scope_items
        const scopeTotals: Record<string, number> = {};
        const macroTotals: Record<string, number> = {};
        let grandTotal = 0;
        
        itemsData.forEach(item => {
          const itemTotal = Number(item.unit_value || 0) * Number(item.quantity || 0);
          grandTotal += itemTotal;
          
          // Group by macro_id and scope_id
          const key = `${item.macro_id}|${item.scope_id}`;
          scopeTotals[key] = (scopeTotals[key] || 0) + itemTotal;
          macroTotals[item.macro_id] = (macroTotals[item.macro_id] || 0) + itemTotal;
        });

        console.log('[Weight Import] Scope totals:', scopeTotals);
        console.log('[Weight Import] Grand total:', grandTotal);

        if (grandTotal === 0) {
          toast.error('O orçamento não tem valores. Adicione valores aos itens primeiro.');
          setIsApplying(false);
          return;
        }

        // Calculate and update weights for each scope in macrosTemplate
        let updated = 0;
        const updatedMacros = currentProject.macrosTemplate.map(macro => {
          const updatedScopes = macro.scopes.map(scope => {
            const key = `${macro.id}|${scope.id}`;
            const scopeTotal = scopeTotals[key] || 0;
            const newWeight = Math.round((scopeTotal / grandTotal) * 100 * 10) / 10;
            
            if (scopeTotal > 0) {
              console.log(`[Weight Import] ${macro.name} > ${scope.name}: R$ ${scopeTotal.toFixed(2)} = ${newWeight}%`);
              updated++;
            }
            
            return { ...scope, weight: newWeight };
          });
          return { ...macro, scopes: updatedScopes };
        });

        // Update the project's macrosTemplate with new weights
        const { error: updateError } = await supabase
          .from('projects')
          .update({ 
            macros_template: updatedMacros as unknown as Json,
            weight_mode: selectedMode 
          })
          .eq('id', currentProject.id);

        if (updateError) throw updateError;

        // Update local state
        updateProject(currentProject.id, { 
          macrosTemplate: updatedMacros,
          weightMode: selectedMode 
        });

        // Log action
        console.log(`[Weight Import] User applied automatic weights from budget. Project: ${currentProject.name}, Updated: ${updated} scopes, Total: R$ ${grandTotal.toFixed(2)}`);
        
        toast.success(`Pesos importados do orçamento! ${updated} serviços atualizados.`);
      } else {
        // Manual mode - just update the weight_mode
        const { error: updateError } = await supabase
          .from('projects')
          .update({ weight_mode: selectedMode })
          .eq('id', currentProject.id);

        if (updateError) throw updateError;

        // Update local state
        updateProject(currentProject.id, { weightMode: selectedMode });
        
        // Log action
        console.log(`[Weight Mode] User changed weight mode to "${selectedMode}". Project: ${currentProject.name}, Time: ${new Date().toISOString()}`);
        
        toast.success('Modo de pesos alterado para manual.');
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error applying weights:', error);
      toast.error('Erro ao aplicar configuração de pesos');
    }
    setIsApplying(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!currentProject) return null;

  const currentMode = currentProject.weightMode || "manual";
  const hasBudget = budgetSummary?.hasData || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Configurar Pesos das Etapas
          </DialogTitle>
          <DialogDescription>
            Escolha como os pesos das etapas e serviços serão calculados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Mode Indicator */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
            <span className="text-sm text-muted-foreground">Modo atual:</span>
            <Badge variant={currentMode === "automatic" ? "default" : "secondary"}>
              {currentMode === "automatic" ? (
                <>
                  <Lock className="w-3 h-3 mr-1" />
                  Pesos do Orçamento
                </>
              ) : (
                <>
                  <Pencil className="w-3 h-3 mr-1" />
                  Pesos Manuais
                </>
              )}
            </Badge>
          </div>

          {/* Budget Summary */}
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Carregando dados do orçamento...</div>
          ) : (
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Resumo do Orçamento</span>
              </div>
              {hasBudget ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-primary">{formatCurrency(budgetSummary!.totalValue)}</p>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{budgetSummary!.macroCount}</p>
                    <p className="text-xs text-muted-foreground">Etapas</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{budgetSummary!.scopeCount}</p>
                    <p className="text-xs text-muted-foreground">Serviços</p>
                  </div>
                </div>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhum orçamento cadastrado. Adicione itens em "Custos de Obra" para usar pesos automáticos.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <Separator />

          {/* Mode Selection */}
          <RadioGroup 
            value={selectedMode} 
            onValueChange={(value) => setSelectedMode(value as "automatic" | "manual")}
            className="space-y-3"
          >
            <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
              selectedMode === "automatic" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:bg-secondary/30"
            } ${!hasBudget ? "opacity-50 cursor-not-allowed" : ""}`}>
              <RadioGroupItem 
                value="automatic" 
                id="automatic" 
                disabled={!hasBudget}
                className="mt-1"
              />
              <div className="flex-1">
                <Label 
                  htmlFor="automatic" 
                  className={`flex items-center gap-2 font-medium ${!hasBudget ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <Download className="w-4 h-4" />
                  Usar pesos do orçamento
                  <Badge variant="outline" className="ml-auto">
                    <Lock className="w-3 h-3 mr-1" />
                    Automático
                  </Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Os pesos serão calculados automaticamente com base nos valores do orçamento. 
                  A edição manual ficará bloqueada.
                </p>
                {!hasBudget && (
                  <p className="text-xs text-destructive mt-1">
                    Indisponível - cadastre itens no orçamento primeiro
                  </p>
                )}
              </div>
            </div>

            <div className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
              selectedMode === "manual" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:bg-secondary/30"
            }`}>
              <RadioGroupItem value="manual" id="manual" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="manual" className="flex items-center gap-2 font-medium cursor-pointer">
                  <Pencil className="w-4 h-4" />
                  Definir pesos manualmente
                  <Badge variant="outline" className="ml-auto">
                    <Unlock className="w-3 h-3 mr-1" />
                    Manual
                  </Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Você poderá editar livremente os pesos de cada etapa e serviço. 
                  A soma dos pesos deve totalizar 100%.
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* Weight Formula Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Fórmula de cálculo automático:</strong><br />
              Peso do serviço = (valor do serviço ÷ valor total da obra) × 100<br />
              Peso da etapa = soma dos pesos dos serviços
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={isApplying || (selectedMode === "automatic" && !hasBudget)}>
            {isApplying ? (
              "Aplicando..."
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                {selectedMode === "automatic" ? "Importar e Aplicar" : "Salvar Configuração"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
