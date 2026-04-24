import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UnitPresetSelector } from "@/components/shared/UnitPresetSelector";

interface ContractService {
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  unit_revenue_value: number;
  max_cost_value: number;
}

export interface ServiceFormData {
  id?: string;
  macro_id: string;
  scope_id: string;
  macro_name: string;
  scope_name: string;
  target_houses: number;
  team_count: number;
  productivity_per_team: number;
  unit_revenue_value: number;
  unit_cost_value: number;
}

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  periodId: string;
  companyId: string;
  existingService?: {
    id: string;
    macro_id: string;
    scope_id: string;
    macro_name: string;
    scope_name: string;
    target_houses: number;
    team_count: number;
    productivity_per_team: number;
    unit_revenue_value?: number;
    unit_cost_value?: number;
  } | null;
  onSave: () => void;
}

export function AddServiceDialog({
  open,
  onOpenChange,
  projectId,
  periodId,
  companyId,
  existingService,
  onSave,
}: AddServiceDialogProps) {
  const [contractServices, setContractServices] = useState<ContractService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedMacro, setSelectedMacro] = useState<string>("");
  const [selectedScope, setSelectedScope] = useState<string>("");
  const [targetHouses, setTargetHouses] = useState<number>(0);
  const [teamCount, setTeamCount] = useState<number>(1);
  const [productivityPerTeam, setProductivityPerTeam] = useState<number>(0);
  const [unitLabel, setUnitLabel] = useState<string>("");
  const [unitSymbol, setUnitSymbol] = useState<string>("");
  const [projectDefaultUnit, setProjectDefaultUnit] = useState<{
    label: string;
    symbol: string;
  } | null>(null);

  const isEditing = !!existingService;

  // Load contract services for macro/scope selection
  useEffect(() => {
    const loadContractServices = async () => {
      if (!projectId || !open) return;

      setIsLoadingServices(true);
      try {
        const { data, error } = await supabase
          .from("project_contract_services")
          .select("macro_id, macro_name, scope_id, scope_name, unit_revenue_value, max_cost_value")
          .eq("project_id", projectId)
          .order("macro_name");

        if (error) throw error;
        setContractServices(data || []);
      } catch (error) {
        console.error("Error loading contract services:", error);
        toast.error("Erro ao carregar serviços do contrato");
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadContractServices();
  }, [projectId, open]);

  // Carrega unidade default da obra (fallback quando o serviço não define unidade própria)
  useEffect(() => {
    const loadProjectUnit = async () => {
      if (!projectId || !open) return;
      const { data } = await supabase
        .from("projects")
        .select("default_unit_label, default_unit_symbol")
        .eq("id", projectId)
        .maybeSingle();
      if (data) {
        setProjectDefaultUnit({
          label: data.default_unit_label || "Casa",
          symbol: data.default_unit_symbol || "un",
        });
      }
    };
    loadProjectUnit();
  }, [projectId, open]);

  // Reset/populate form when dialog opens
  useEffect(() => {
    if (open) {
      if (existingService) {
        setSelectedMacro(existingService.macro_id);
        setSelectedScope(existingService.scope_id);
        setTargetHouses(existingService.target_houses);
        setTeamCount(existingService.team_count);
        setProductivityPerTeam(existingService.productivity_per_team);
        setUnitLabel((existingService as any).unit_label || "");
        setUnitSymbol((existingService as any).unit_symbol || "");
      } else {
        setSelectedMacro("");
        setSelectedScope("");
        setTargetHouses(0);
        setTeamCount(1);
        setProductivityPerTeam(0);
        setUnitLabel("");
        setUnitSymbol("");
      }
    }
  }, [open, existingService]);

  // Get unique macros
  const uniqueMacros = contractServices.reduce((acc, service) => {
    if (!acc.find((m) => m.macro_id === service.macro_id)) {
      acc.push({ macro_id: service.macro_id, macro_name: service.macro_name });
    }
    return acc;
  }, [] as { macro_id: string; macro_name: string }[]);

  // Get scopes for selected macro
  const scopesForMacro = contractServices.filter(
    (s) => s.macro_id === selectedMacro
  );

  // Get selected service details
  const selectedService = contractServices.find(
    (s) => s.macro_id === selectedMacro && s.scope_id === selectedScope
  );

  const expectedOutput = teamCount * productivityPerTeam;
  const capacityGap = expectedOutput - targetHouses;

  const handleMacroChange = (macroId: string) => {
    setSelectedMacro(macroId);
    setSelectedScope(""); // Reset scope when macro changes
  };

  const handleSave = async () => {
    if (!selectedMacro || !selectedScope) {
      toast.error("Selecione o macro e o serviço");
      return;
    }

    if (targetHouses <= 0) {
      toast.error("Informe a quantidade de casas planejadas");
      return;
    }

    setIsSaving(true);
    try {
      const macroData = uniqueMacros.find((m) => m.macro_id === selectedMacro);
      const scopeData = scopesForMacro.find((s) => s.scope_id === selectedScope);

      const serviceData = {
        company_id: companyId,
        project_id: projectId,
        planning_period_id: periodId,
        macro_id: selectedMacro,
        scope_id: selectedScope,
        macro_name: macroData?.macro_name || selectedMacro,
        scope_name: scopeData?.scope_name || selectedScope,
        target_houses: targetHouses,
        team_count: teamCount,
        productivity_per_team: productivityPerTeam,
        unit_revenue_value: selectedService?.unit_revenue_value || 0,
        unit_cost_value: selectedService?.max_cost_value || 0,
        planned_revenue: targetHouses * (selectedService?.unit_revenue_value || 0),
        planned_cost: targetHouses * (selectedService?.max_cost_value || 0),
        projected_result:
          targetHouses *
          ((selectedService?.unit_revenue_value || 0) - (selectedService?.max_cost_value || 0)),
        status: "planned",
        // Unidade customizada por serviço (null = herda da obra)
        unit_label: unitLabel || null,
        unit_symbol: unitSymbol || null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && existingService) {
        const { error } = await supabase
          .from("service_planning_by_period")
          .update(serviceData)
          .eq("id", existingService.id);

        if (error) throw error;
        toast.success("Serviço atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("service_planning_by_period")
          .insert({
            ...serviceData,
            created_at: new Date().toISOString(),
          });

        if (error) throw error;
        toast.success("Serviço adicionado com sucesso!");
      }

      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving service:", error);
      toast.error("Erro ao salvar serviço");
    } finally {
      setIsSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {isEditing ? "Editar Serviço" : "Adicionar Serviço"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          {isLoadingServices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Macro Selection */}
              <div className="space-y-2">
                <Label>Etapa (Macro)</Label>
                <Select
                  value={selectedMacro}
                  onValueChange={handleMacroChange}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueMacros.map((macro) => (
                      <SelectItem key={macro.macro_id} value={macro.macro_id}>
                        {macro.macro_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Scope Selection */}
              <div className="space-y-2">
                <Label>Serviço (Escopo)</Label>
                <Select
                  value={selectedScope}
                  onValueChange={setSelectedScope}
                  disabled={!selectedMacro || isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {scopesForMacro.map((scope) => (
                      <SelectItem key={scope.scope_id} value={scope.scope_id}>
                        {scope.scope_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Show service values when selected */}
              {selectedService && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor unitário (receita):</span>
                    <span className="font-medium">
                      {formatCurrency(selectedService.unit_revenue_value)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo máximo unitário:</span>
                    <span className="font-medium">
                      {formatCurrency(selectedService.max_cost_value)}
                    </span>
                  </div>
                </div>
              )}

              {/* Houses */}
              <div className="space-y-2">
                <Label>Casas Planejadas</Label>
                <Input
                  type="number"
                  min={0}
                  value={targetHouses}
                  onChange={(e) => setTargetHouses(parseInt(e.target.value) || 0)}
                />
              </div>

              {/* Team Count */}
              <div className="space-y-2">
                <Label>Quantidade de Equipes</Label>
                <Input
                  type="number"
                  min={1}
                  value={teamCount}
                  onChange={(e) => setTeamCount(parseInt(e.target.value) || 1)}
                />
              </div>

              {/* Productivity per Team */}
              <div className="space-y-2">
                <Label>Produtividade por Equipe (casas/quinzena)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={productivityPerTeam}
                  onChange={(e) =>
                    setProductivityPerTeam(parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              {/* Capacity Summary */}
              <div
                className={`rounded-lg p-3 text-sm ${
                  capacityGap >= 0
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex justify-between">
                  <span>Capacidade (equipes × produtividade):</span>
                  <span className="font-medium">{expectedOutput} casas</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>{capacityGap >= 0 ? "Folga:" : "Déficit:"}</span>
                  <span
                    className={`font-medium ${
                      capacityGap >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {capacityGap >= 0 ? `+${capacityGap}` : capacityGap} casas
                  </span>
                </div>
              </div>

              {/* Projected Financials */}
              {selectedService && targetHouses > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita prevista:</span>
                    <span className="font-medium text-green-600">
                      {formatCurrency(targetHouses * selectedService.unit_revenue_value)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo previsto:</span>
                    <span className="font-medium">
                      {formatCurrency(targetHouses * selectedService.max_cost_value)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1 mt-1">
                    <span className="text-muted-foreground">Resultado previsto:</span>
                    <span
                      className={`font-medium ${
                        selectedService.unit_revenue_value - selectedService.max_cost_value >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(
                        targetHouses *
                          (selectedService.unit_revenue_value - selectedService.max_cost_value)
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoadingServices}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
