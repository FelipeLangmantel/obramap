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
        // Import weights from budget
        const { data: itemsData, error: itemsError } = await supabase
          .from('scope_items')
          .select('scope_id, macro_id, unit_value, quantity')
          .eq('project_id', currentProject.id);

        if (itemsError) throw itemsError;

        // Load scope_costs for name mappings
        const { data: costsData } = await supabase
          .from('scope_costs')
          .select('scope_id, scope_name, macro_name')
          .eq('project_id', currentProject.id);

        const scopeIdToName: Record<string, { scopeName: string; macroName: string }> = {};
        if (costsData) {
          costsData.forEach(cost => {
            scopeIdToName[cost.scope_id] = {
              scopeName: cost.scope_name.toLowerCase().trim(),
              macroName: cost.macro_name.toLowerCase().trim()
            };
          });
        }

        // Calculate totals
        const scopeTotalsById: Record<string, number> = {};
        const scopeTotalsByName: Record<string, number> = {};
        
        (itemsData || []).forEach(item => {
          const total = Number(item.unit_value) * Number(item.quantity);
          scopeTotalsById[item.scope_id] = (scopeTotalsById[item.scope_id] || 0) + total;
          
          const nameMapping = scopeIdToName[item.scope_id];
          if (nameMapping) {
            const nameKey = `${nameMapping.macroName}|${nameMapping.scopeName}`;
            scopeTotalsByName[nameKey] = (scopeTotalsByName[nameKey] || 0) + total;
          }
        });

        const grandTotal = Object.values(scopeTotalsById).reduce((sum, val) => sum + val, 0);

        if (grandTotal === 0) {
          toast.error('O orçamento não tem valores. Adicione valores aos itens primeiro.');
          setIsApplying(false);
          return;
        }

        // Calculate and update weights
        let updated = 0;
        for (const macro of currentProject.macrosTemplate) {
          for (const scope of macro.scopes) {
            let scopeTotal = scopeTotalsById[scope.id] || 0;
            
            if (scopeTotal === 0) {
              const macroNameLower = macro.name.toLowerCase().trim();
              const scopeNameLower = scope.name.toLowerCase().trim();
              const exactKey = `${macroNameLower}|${scopeNameLower}`;
              scopeTotal = scopeTotalsByName[exactKey] || 0;
              
              if (scopeTotal === 0) {
                for (const [key, total] of Object.entries(scopeTotalsByName)) {
                  const [keyMacro, keyScope] = key.split('|');
                  if (
                    (scopeNameLower.includes(keyScope) || keyScope.includes(scopeNameLower)) &&
                    (macroNameLower.includes(keyMacro) || keyMacro.includes(macroNameLower))
                  ) {
                    scopeTotal = total;
                    break;
                  }
                }
              }
            }
            
            const newWeight = Math.round((scopeTotal / grandTotal) * 100 * 10) / 10;
            
            if (newWeight > 0 || scopeTotal === 0) {
              await updateScope(macro.id, scope.id, { weight: newWeight });
              if (newWeight > 0) updated++;
            }
          }
        }

        // Log action
        console.log(`[Weight Import] User applied automatic weights from budget. Project: ${currentProject.name}, Updated: ${updated} scopes, Mode: automatic`);
        
        toast.success(`Pesos importados do orçamento! ${updated} serviços atualizados.`);
      }

      // Update project weight mode
      const { error: updateError } = await supabase
        .from('projects')
        .update({ weight_mode: selectedMode })
        .eq('id', currentProject.id);

      if (updateError) throw updateError;

      // Update local state
      updateProject(currentProject.id, { weightMode: selectedMode });
      
      // Log action
      console.log(`[Weight Mode] User changed weight mode to "${selectedMode}". Project: ${currentProject.name}, Time: ${new Date().toISOString()}`);

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
