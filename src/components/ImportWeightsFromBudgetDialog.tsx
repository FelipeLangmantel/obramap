import { useState, useEffect } from "react";
import { Calculator, Download, Pencil, Lock, Unlock, AlertTriangle, FileText, Check, Home } from "lucide-react";
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
  unitValue: number; // Valor unitário da casa
  scopeCount: number;
  macroCount: number;
  hasData: boolean;
}

export function ImportWeightsFromBudgetDialog({ open, onOpenChange }: ImportWeightsFromBudgetDialogProps) {
  const { currentProject, updateProject } = useConstruction();
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
        .from("scope_items")
        .select("scope_id, unit_value, quantity")
        .eq("project_id", currentProject.id);

      if (error) throw error;

      // Only consider items whose scope_id exists in the current macros template
      const validScopeIds = new Set(
        currentProject.macrosTemplate.flatMap((m) => m.scopes.map((s) => s.id))
      );

      const matchedItems = (itemsData || []).filter((i) => validScopeIds.has(i.scope_id));

      const unitValue = matchedItems.reduce(
        (sum, item) => sum + Number(item.unit_value || 0) * Number(item.quantity || 0),
        0
      );

      const macroCount = currentProject.macrosTemplate.length;
      const scopeCount = currentProject.macrosTemplate.reduce((acc, m) => acc + m.scopes.length, 0);

      setBudgetSummary({
        unitValue,
        scopeCount,
        macroCount,
        hasData: unitValue > 0,
      });
    } catch (error) {
      console.error("Error loading budget summary:", error);
      setBudgetSummary({ unitValue: 0, scopeCount: 0, macroCount: 0, hasData: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!currentProject) return;

    // Prevent double-click
    if (isApplying) return;
    setIsApplying(true);

    try {
      if (selectedMode === "automatic") {
        // Validate unit value
        if (!budgetSummary?.hasData || budgetSummary.unitValue <= 0) {
          toast.error(
            "Não foi encontrado custo unitário válido. Verifique se os itens do orçamento estão vinculados aos serviços do projeto."
          );
          return;
        }

        const { data: itemsData, error: itemsError } = await supabase
          .from("scope_items")
          .select("scope_id, unit_value, quantity")
          .eq("project_id", currentProject.id);

        if (itemsError) throw itemsError;

        const validScopeIds = new Set(
          currentProject.macrosTemplate.flatMap((m) => m.scopes.map((s) => s.id))
        );

        const matchedItems = (itemsData || []).filter((i) => validScopeIds.has(i.scope_id));

        if (matchedItems.length === 0) {
          toast.error(
            "Nenhum item do orçamento está vinculado aos serviços atuais (IDs não correspondem). Ajuste o orçamento para usar os mesmos serviços do projeto."
          );
          return;
        }

        // Base value MUST be the unit value of the house (same calculation as Custos de Obra)
        const unitValue = matchedItems.reduce(
          (sum, item) => sum + Number(item.unit_value || 0) * Number(item.quantity || 0),
          0
        );

        if (unitValue <= 0) {
          toast.error("O valor unitário da casa é zero. Adicione valores aos itens primeiro.");
          return;
        }

        // Totals per scope_id
        const totalsByScopeId: Record<string, number> = {};
        for (const item of matchedItems) {
          const itemTotal = Number(item.unit_value || 0) * Number(item.quantity || 0);
          totalsByScopeId[item.scope_id] = (totalsByScopeId[item.scope_id] || 0) + itemTotal;
        }

        // Calculate weights and normalize to exactly 100%
        let totalWeight = 0;
        const updatedMacros = currentProject.macrosTemplate.map((macro) => {
          const updatedScopes = macro.scopes.map((scope) => {
            const scopeTotal = totalsByScopeId[scope.id] || 0;
            const newWeight = Math.round(((scopeTotal / unitValue) * 100) * 10) / 10; // 1 decimal
            totalWeight += newWeight;
            return { ...scope, weight: newWeight };
          });
          return { ...macro, scopes: updatedScopes };
        });

        // Normalize (handle rounding) to force exactly 100%
        if (totalWeight > 0) {
          const factor = 100 / totalWeight;
          let adjustedTotal = 0;

          updatedMacros.forEach((macro) => {
            macro.scopes.forEach((scope) => {
              scope.weight = Math.round(scope.weight * factor * 10) / 10;
              adjustedTotal += scope.weight;
            });
          });

          const diff = Math.round((100 - adjustedTotal) * 10) / 10;
          if (diff !== 0) {
            outer: for (let i = updatedMacros.length - 1; i >= 0; i--) {
              for (let j = updatedMacros[i].scopes.length - 1; j >= 0; j--) {
                if (updatedMacros[i].scopes[j].weight > 0) {
                  updatedMacros[i].scopes[j].weight =
                    Math.round((updatedMacros[i].scopes[j].weight + diff) * 10) / 10;
                  break outer;
                }
              }
            }
          }
        }

        // Final validation
        const finalSum = Math.round(
          updatedMacros.reduce((sum, m) => sum + m.scopes.reduce((s, sc) => s + sc.weight, 0), 0) * 10
        ) / 10;
        if (finalSum !== 100) {
          toast.error(`Falha ao normalizar pesos (total = ${finalSum}%). Tente novamente.`);
          return;
        }

        // Persist in one write (prevents UI loops and is faster)
        const { error: updateError } = await supabase
          .from("projects")
          .update({
            macros_template: updatedMacros as unknown as Json,
            weight_mode: "automatic",
          })
          .eq("id", currentProject.id);

        if (updateError) throw updateError;

        updateProject(currentProject.id, {
          macrosTemplate: updatedMacros,
          weightMode: "automatic",
        });

        toast.success(`Pesos importados com base no valor unitário: ${formatCurrency(unitValue)}`);
      } else {
        const { error: updateError } = await supabase
          .from("projects")
          .update({ weight_mode: "manual" })
          .eq("id", currentProject.id);

        if (updateError) throw updateError;

        updateProject(currentProject.id, { weightMode: "manual" });
        toast.success("Modo de pesos alterado para manual.");
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Error applying weights:", error);
      toast.error("Erro ao aplicar configuração de pesos. Tente novamente.");
    } finally {
      setIsApplying(false);
    }
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
            Os pesos são calculados com base no custo por unidade habitacional
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

          {/* Budget Summary - UNIT VALUE PER HOUSE */}
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">Carregando dados do orçamento...</div>
          ) : (
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Home className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Custo por Unidade Habitacional</span>
              </div>
              {hasBudget ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold text-primary">{formatCurrency(budgetSummary!.unitValue)}</p>
                    <p className="text-xs text-muted-foreground">Valor Unitário</p>
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
                    Nenhum orçamento unitário cadastrado. Adicione itens em "Custos de Obra" para usar pesos automáticos.
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
                  Os pesos serão calculados com base no valor unitário da casa. 
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
              <strong>Fórmula de cálculo:</strong><br />
              Peso do serviço = (valor do serviço ÷ valor unitário da casa) × 100<br />
              Peso da etapa = soma dos pesos dos serviços
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancelar
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={isApplying || (selectedMode === "automatic" && !hasBudget)}
          >
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