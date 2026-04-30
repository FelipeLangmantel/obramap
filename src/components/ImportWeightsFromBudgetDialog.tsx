import { useState, useEffect } from "react";
import { Calculator, Download, Pencil, Lock, Unlock, AlertTriangle, FileText, Check, Home, FileSignature } from "lucide-react";
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

type ImportSource = "budget" | "contract";

interface SourceSummary {
  totalValue: number; // valor total considerado (orçamento unitário ou receita contrato)
  scopeMatched: number;
  totalsByScopeId: Record<string, number>;
  hasData: boolean;
  totalScopes: number;            // total de serviços no template
  scopesWithValue: number;        // quantos têm valor > 0
  scopesWithoutValue: number;     // quantos estão zerados
  missingScopeNames: string[];    // nomes dos serviços sem valor (top 10)
}

export function ImportWeightsFromBudgetDialog({ open, onOpenChange }: ImportWeightsFromBudgetDialogProps) {
  const { currentProject, updateProject } = useConstruction();
  const [selectedMode, setSelectedMode] = useState<"automatic" | "manual">("manual");
  const [selectedSource, setSelectedSource] = useState<ImportSource>("budget");
  const [budgetSummary, setBudgetSummary] = useState<SourceSummary | null>(null);
  const [contractSummary, setContractSummary] = useState<SourceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (open && currentProject) {
      loadSummaries();
      setSelectedMode((currentProject.weightMode as "automatic" | "manual") || "manual");
    }
  }, [open, currentProject?.id]);

  const loadSummaries = async () => {
    if (!currentProject) return;
    setIsLoading(true);

    try {
      // Mapa scope_id -> scope_name (para listar serviços sem valor)
      const scopeNameById = new Map<string, string>();
      currentProject.macrosTemplate.forEach((m) =>
        m.scopes.forEach((s) => scopeNameById.set(s.id, s.name))
      );
      const validScopeIds = new Set(scopeNameById.keys());
      const totalScopes = validScopeIds.size;

      // ---------- Orçamento (scope_items) ----------
      const { data: itemsData } = await supabase
        .from("scope_items")
        .select("scope_id, unit_value, quantity")
        .eq("project_id", currentProject.id);

      const budgetTotalsByScope: Record<string, number> = {};
      let budgetTotal = 0;
      (itemsData || [])
        .filter((i) => validScopeIds.has(i.scope_id))
        .forEach((i) => {
          const v = Number(i.unit_value || 0) * Number(i.quantity || 0);
          budgetTotalsByScope[i.scope_id] = (budgetTotalsByScope[i.scope_id] || 0) + v;
          budgetTotal += v;
        });

      const budgetMissing = Array.from(validScopeIds)
        .filter((id) => !((budgetTotalsByScope[id] || 0) > 0))
        .map((id) => scopeNameById.get(id) || id);

      setBudgetSummary({
        totalValue: budgetTotal,
        scopeMatched: Object.keys(budgetTotalsByScope).filter((k) => budgetTotalsByScope[k] > 0).length,
        totalsByScopeId: budgetTotalsByScope,
        hasData: budgetTotal > 0,
        totalScopes,
        scopesWithValue: Object.keys(budgetTotalsByScope).filter((k) => budgetTotalsByScope[k] > 0).length,
        scopesWithoutValue: budgetMissing.length,
        missingScopeNames: budgetMissing.slice(0, 10),
      });

      // ---------- Contrato (project_contract_services) ----------
      const { data: contractServices } = await supabase
        .from("project_contract_services")
        .select("scope_id, unit_revenue_value")
        .eq("project_id", currentProject.id);

      const contractTotalsByScope: Record<string, number> = {};
      let contractTotal = 0;
      (contractServices || [])
        .filter((s) => validScopeIds.has(s.scope_id))
        .forEach((s) => {
          const v = Number(s.unit_revenue_value || 0);
          if (v > 0) {
            contractTotalsByScope[s.scope_id] =
              (contractTotalsByScope[s.scope_id] || 0) + v;
            contractTotal += v;
          }
        });

      const contractMissing = Array.from(validScopeIds)
        .filter((id) => !((contractTotalsByScope[id] || 0) > 0))
        .map((id) => scopeNameById.get(id) || id);

      setContractSummary({
        totalValue: contractTotal,
        scopeMatched: Object.keys(contractTotalsByScope).length,
        totalsByScopeId: contractTotalsByScope,
        hasData: contractTotal > 0,
        totalScopes,
        scopesWithValue: Object.keys(contractTotalsByScope).length,
        scopesWithoutValue: contractMissing.length,
        missingScopeNames: contractMissing.slice(0, 10),
      });

      // Default source: contrato se houver dados, senão orçamento
      if (contractTotal > 0) setSelectedSource("contract");
      else setSelectedSource("budget");
    } catch (error) {
      console.error("Error loading summaries:", error);
      const empty: SourceSummary = {
        totalValue: 0, scopeMatched: 0, totalsByScopeId: {}, hasData: false,
        totalScopes: 0, scopesWithValue: 0, scopesWithoutValue: 0, missingScopeNames: [],
      };
      setBudgetSummary(empty);
      setContractSummary(empty);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAutomaticWeights = async (summary: SourceSummary, sourceLabel: string) => {
    if (!currentProject) return;

    if (!summary.hasData || summary.totalValue <= 0) {
      toast.error(
        `Não foi possível calcular os pesos a partir de ${sourceLabel}. Verifique se há valores cadastrados.`
      );
      return;
    }

    let totalWeight = 0;
    const updatedMacros = currentProject.macrosTemplate.map((macro) => {
      const updatedScopes = macro.scopes.map((scope) => {
        const scopeTotal = summary.totalsByScopeId[scope.id] || 0;
        const newWeight = Math.round(((scopeTotal / summary.totalValue) * 100) * 10) / 10;
        totalWeight += newWeight;
        return { ...scope, weight: newWeight };
      });
      return { ...macro, scopes: updatedScopes };
    });

    // Normaliza para 100% exato
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

    const finalSum =
      Math.round(
        updatedMacros.reduce(
          (sum, m) => sum + m.scopes.reduce((s, sc) => s + sc.weight, 0),
          0
        ) * 10
      ) / 10;
    if (finalSum !== 100) {
      toast.error(`Falha ao normalizar pesos (total = ${finalSum}%). Tente novamente.`);
      return;
    }

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

    toast.success(
      `Pesos importados de ${sourceLabel}: ${formatCurrency(summary.totalValue)} distribuídos em ${summary.scopeMatched} serviço(s).`
    );
  };

  const handleApply = async () => {
    if (!currentProject || isApplying) return;
    setIsApplying(true);

    try {
      if (selectedMode === "automatic") {
        if (selectedSource === "contract") {
          await applyAutomaticWeights(contractSummary!, "Contrato");
        } else {
          await applyAutomaticWeights(budgetSummary!, "Orçamento");
        }
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  if (!currentProject) return null;

  const currentMode = currentProject.weightMode || "manual";
  const activeSummary = selectedSource === "contract" ? contractSummary : budgetSummary;
  const hasActiveData = activeSummary?.hasData || false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Configurar Pesos das Etapas
          </DialogTitle>
          <DialogDescription>
            Importe os pesos a partir do orçamento ou do contrato — todos os cálculos se ajustam automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modo atual */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
            <span className="text-sm text-muted-foreground">Modo atual:</span>
            <Badge variant={currentMode === "automatic" ? "default" : "secondary"}>
              {currentMode === "automatic" ? (
                <><Lock className="w-3 h-3 mr-1" />Automático</>
              ) : (
                <><Pencil className="w-3 h-3 mr-1" />Manual</>
              )}
            </Badge>
          </div>

          {/* Fonte de dados (apenas se modo automático) */}
          {selectedMode === "automatic" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fonte dos valores</Label>
              <RadioGroup
                value={selectedSource}
                onValueChange={(v) => setSelectedSource(v as ImportSource)}
                className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              >
                {/* Orçamento */}
                <div
                  className={`flex items-start space-x-2 p-3 rounded-lg border transition-colors ${
                    selectedSource === "budget"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/30"
                  } ${!budgetSummary?.hasData ? "opacity-60" : ""}`}
                >
                  <RadioGroupItem
                    value="budget"
                    id="src-budget"
                    disabled={!budgetSummary?.hasData}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor="src-budget"
                      className="flex items-center gap-1 font-medium cursor-pointer text-sm"
                    >
                      <Home className="w-3.5 h-3.5" />
                      Orçamento
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Usa custo unitário da casa.
                    </p>
                    {budgetSummary?.hasData ? (
                      <p className="text-xs font-mono text-primary mt-1">
                        {formatCurrency(budgetSummary.totalValue)}
                      </p>
                    ) : (
                      <p className="text-xs text-destructive mt-1">Sem dados</p>
                    )}
                  </div>
                </div>

                {/* Contrato */}
                <div
                  className={`flex items-start space-x-2 p-3 rounded-lg border transition-colors ${
                    selectedSource === "contract"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/30"
                  } ${!contractSummary?.hasData ? "opacity-60" : ""}`}
                >
                  <RadioGroupItem
                    value="contract"
                    id="src-contract"
                    disabled={!contractSummary?.hasData}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor="src-contract"
                      className="flex items-center gap-1 font-medium cursor-pointer text-sm"
                    >
                      <FileSignature className="w-3.5 h-3.5" />
                      Contrato
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Usa preço de contrato por serviço.
                    </p>
                    {contractSummary?.hasData ? (
                      <p className="text-xs font-mono text-primary mt-1">
                        {formatCurrency(contractSummary.totalValue)}
                      </p>
                    ) : (
                      <p className="text-xs text-destructive mt-1">Sem dados</p>
                    )}
                  </div>
                </div>
              </RadioGroup>

              {isLoading && (
                <p className="text-xs text-muted-foreground text-center">Carregando dados...</p>
              )}

              {!isLoading && activeSummary && (
                <Alert variant={activeSummary.scopesWithoutValue > 0 ? "destructive" : "default"}>
                  <FileText className="h-4 w-4" />
                  <AlertDescription className="text-xs space-y-2">
                    {hasActiveData ? (
                      <>
                        <div>
                          Serão atribuídos pesos a{" "}
                          <strong>{activeSummary.scopesWithValue}</strong> de{" "}
                          <strong>{activeSummary.totalScopes}</strong> serviços
                          {" "}({formatCurrency(activeSummary.totalValue)} total).
                        </div>
                        {activeSummary.scopesWithoutValue > 0 && (
                          <div className="space-y-1">
                            <div className="font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {activeSummary.scopesWithoutValue} serviço(s) sem valor cadastrado em
                              {selectedSource === "contract" ? " Contrato da Obra" : " Custos da Obra"}:
                            </div>
                            <ul className="list-disc list-inside text-[11px] opacity-90 max-h-24 overflow-auto">
                              {activeSummary.missingScopeNames.map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                              {activeSummary.scopesWithoutValue > activeSummary.missingScopeNames.length && (
                                <li>… e mais {activeSummary.scopesWithoutValue - activeSummary.missingScopeNames.length}</li>
                              )}
                            </ul>
                            <div className="text-[11px]">
                              Esses serviços ficarão com peso 0%. Para distribuir 100%, preencha os valores em
                              {selectedSource === "contract" ? " Contrato da Obra" : " Custos da Obra"} e reimporte.
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        Nenhum dado disponível para esta fonte. Cadastre valores em{" "}
                        {selectedSource === "contract" ? '"Contrato da Obra"' : '"Custos de Obra"'} primeiro.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <Separator />

          {/* Modo de pesos */}
          <RadioGroup
            value={selectedMode}
            onValueChange={(value) => setSelectedMode(value as "automatic" | "manual")}
            className="space-y-2"
          >
            <div
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                selectedMode === "automatic"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/30"
              }`}
            >
              <RadioGroupItem value="automatic" id="automatic" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="automatic" className="flex items-center gap-2 font-medium cursor-pointer">
                  <Download className="w-4 h-4" />
                  Importar pesos automaticamente
                  <Badge variant="outline" className="ml-auto">
                    <Lock className="w-3 h-3 mr-1" />
                    Auto
                  </Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Calcula os pesos proporcionalmente aos valores da fonte selecionada.
                </p>
              </div>
            </div>

            <div
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors ${
                selectedMode === "manual"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/30"
              }`}
            >
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
                  Você define livremente os pesos. A soma deve totalizar 100%.
                </p>
              </div>
            </div>
          </RadioGroup>

          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Fórmula:</strong> Peso (%) = (valor do serviço ÷ valor total da fonte) × 100.
              Os cálculos de progresso, KPIs e relatórios usam estes pesos automaticamente.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              isApplying || (selectedMode === "automatic" && !hasActiveData)
            }
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
