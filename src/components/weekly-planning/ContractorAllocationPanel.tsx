import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  HardHat, AlertTriangle, CheckCircle2, MapPin,
  ArrowRight, Home, Phone, DollarSign, Info,
} from "lucide-react";
import { ContractorHouseMapSelector } from "@/components/contractors/ContractorHouseMapSelector";

// ── Types ─────────────────────────────────────────────────
export interface ContractorOption {
  contractServiceId: string;
  contractorId: string;
  contractorName: string;
  contractorPhone: string | null;
  contractHouseIds: number[];
  totalHouses: number;
  negotiatedUnitValue: number;
}

export interface ContractorAllocation {
  contractorContractServiceId: string | null;
  contractorId: string | null;
  contractorName: string | null;
  contractorHouseIds: number[];
  contractorHouses: number;
  hasOutOfContractHouses: boolean;
  outOfContractHouseIds: number[];
}

interface AllocationWarning {
  type: "out_of_contract" | "contract_conflict";
  message: string;
  severity: "warning" | "info";
}

interface Props {
  projectId: string;
  companyId: string;
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
  weekPlanServiceId: string | null;
  weekStart: string;
  plannedHouseIds: number[];
  currentAllocation: ContractorAllocation | null;
  otherAllocationsThisWeek: Array<{ contractorName: string; houseIds: number[] }>;
  assignedHouseIds: Set<number>;
  onAllocationChange: (allocation: ContractorAllocation) => void;
}

export function ContractorAllocationPanel({
  projectId, companyId, macroId, scopeId, macroName, scopeName,
  weekPlanServiceId, weekStart, plannedHouseIds,
  currentAllocation, otherAllocationsThisWeek, assignedHouseIds,
  onAllocationChange,
}: Props) {
  const { user, canEdit, requireEdit } = useAuth();
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<ContractorOption | null>(null);
  const [selectedHouseIds, setSelectedHouseIds] = useState<number[]>([]);
  const [warnings, setWarnings] = useState<AllocationWarning[]>([]);
  const [changeReason, setChangeReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  // Load contractors for this service
  useEffect(() => {
    if (!projectId || !companyId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("contractor_contract_services")
        .select(`
          id, house_ids, total_houses, negotiated_unit_value,
          contractor_contracts!inner(id, status, contractor_id, contractors!inner(id, name, phone))
        `)
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .eq("macro_id", macroId)
        .eq("scope_id", scopeId)
        .eq("contractor_contracts.status", "active");

      if (data) {
        const opts: ContractorOption[] = data.map((s: any) => ({
          contractServiceId: s.id,
          contractorId: s.contractor_contracts?.contractors?.id || "",
          contractorName: s.contractor_contracts?.contractors?.name || "Empreiteiro",
          contractorPhone: s.contractor_contracts?.contractors?.phone || null,
          contractHouseIds: s.house_ids || [],
          totalHouses: s.total_houses || 0,
          negotiatedUnitValue: s.negotiated_unit_value || 0,
        }));
        setContractors(opts);
      }
      setLoading(false);
    })();
  }, [projectId, companyId, macroId, scopeId]);

  // Validate allocation
  const validateAllocation = useCallback(
    (houseIds: number[], contractor: ContractorOption): AllocationWarning[] => {
      const w: AllocationWarning[] = [];
      const outOfContract = houseIds.filter(id => !contractor.contractHouseIds.includes(id));
      if (outOfContract.length > 0) {
        w.push({
          type: "out_of_contract",
          message: `${outOfContract.length} casa(s) não estão no contrato deste empreiteiro (${outOfContract.join(", ")}). Isso será registrado mas não altera o contrato.`,
          severity: "warning",
        });
      }
      for (const other of otherAllocationsThisWeek) {
        const conflict = houseIds.filter(id => other.houseIds.includes(id));
        if (conflict.length > 0) {
          w.push({
            type: "contract_conflict",
            message: `Casa(s) ${conflict.join(", ")} pertencem ao contrato do empreiteiro ${other.contractorName}. A alocação ficará registrada como exceção desta semana.`,
            severity: "info",
          });
        }
      }
      return w;
    },
    [otherAllocationsThisWeek]
  );

  const handleSelectContractor = (contractor: ContractorOption) => {
    setSelectedContractor(contractor);
    // Pre-select houses that are both in the contract and in planned houses
    const preSelected = plannedHouseIds.filter(id => contractor.contractHouseIds.includes(id));
    setSelectedHouseIds(preSelected);
    const w = validateAllocation(preSelected, contractor);
    setWarnings(w);
    setShowSelector(false);
    setShowConfirm(true);
  };

  const handleMapConfirm = (houseIds: number[]) => {
    if (!selectedContractor) return;
    setSelectedHouseIds(houseIds);
    const w = validateAllocation(houseIds, selectedContractor);
    setWarnings(w);
    setShowMapSelector(false);
    setShowConfirm(true);
  };

  const handleConfirmAllocation = async () => {
    if (!selectedContractor) return;
    const outOfContract = selectedHouseIds.filter(
      id => !selectedContractor.contractHouseIds.includes(id)
    );

    const allocation: ContractorAllocation = {
      contractorContractServiceId: selectedContractor.contractServiceId,
      contractorId: selectedContractor.contractorId,
      contractorName: selectedContractor.contractorName,
      contractorHouseIds: selectedHouseIds,
      contractorHouses: selectedHouseIds.length,
      hasOutOfContractHouses: outOfContract.length > 0,
      outOfContractHouseIds: outOfContract,
    };

    // Log change if replacing contractor
    if (
      weekPlanServiceId &&
      currentAllocation?.contractorId &&
      currentAllocation.contractorId !== selectedContractor.contractorId
    ) {
      const transferred = (currentAllocation.contractorHouseIds || []).filter(
        id => selectedHouseIds.includes(id)
      );
      await supabase.from("weekly_plan_contractor_log").insert({
        weekly_plan_service_id: weekPlanServiceId,
        project_id: projectId,
        company_id: companyId,
        week_start: weekStart,
        macro_id: macroId,
        scope_id: scopeId,
        scope_name: scopeName,
        previous_contractor_id: currentAllocation.contractorId,
        previous_contractor_name: currentAllocation.contractorName,
        previous_house_ids: currentAllocation.contractorHouseIds || [],
        new_contractor_id: selectedContractor.contractorId,
        new_contractor_name: selectedContractor.contractorName,
        new_house_ids: selectedHouseIds,
        transferred_house_ids: transferred,
        change_reason: changeReason || null,
        changed_by: user?.id || null,
      });
    }

    onAllocationChange(allocation);
    toast.success(`Empreiteiro ${selectedContractor.contractorName} alocado — ${selectedHouseIds.length} casa(s)`);
    setShowConfirm(false);
    setChangeReason("");
  };

  const isAllocated = !!currentAllocation?.contractorId;

  return (
    <>
      <Card className="border-muted">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <HardHat className="h-3.5 w-3.5 text-primary" />
            Empreiteiro desta semana
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-3 pb-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : isAllocated ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    {currentAllocation!.contractorName}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Home className="h-2.5 w-2.5" />
                    {currentAllocation!.contractorHouses} casa(s)
                  </Badge>
                  {currentAllocation!.hasOutOfContractHouses && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {currentAllocation!.outOfContractHouseIds.length} fora do contrato
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setShowSelector(true)}>
                  Alterar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-3 w-3" />
                Sem empreiteiro alocado
              </Badge>
              <Button variant="default" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setShowSelector(true)}>
                <HardHat className="h-3 w-3" />
                Alocar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contractor selector dialog */}
      <Dialog open={showSelector} onOpenChange={setShowSelector}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <HardHat className="h-4 w-4 text-primary" />
              Selecionar Empreiteiro — {scopeName}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 p-1">
              {contractors.length === 0 ? (
                <div className="text-center py-6">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500 opacity-60" />
                  <p className="text-sm text-muted-foreground">Nenhum empreiteiro com contrato ativo para este serviço.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => {
                      setShowSelector(false);
                      toast.info("Registre contratos de empreiteiros no módulo Empreiteiros.");
                    }}
                  >
                    Ir para módulo de Empreiteiros
                  </Button>
                </div>
              ) : (
                contractors.map(c => (
                  <button
                    key={c.contractServiceId}
                    onClick={() => handleSelectContractor(c)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{c.contractorName}</div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {c.contractorPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.contractorPhone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Home className="h-3 w-3" /> {c.totalHouses} casas no contrato
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {c.negotiatedUnitValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/un
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog with warnings */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Confirmar Alocação
            </DialogTitle>
          </DialogHeader>
          {selectedContractor && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 border text-sm">
                <div className="font-semibold">{selectedContractor.contractorName}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {selectedHouseIds.length} casa(s) selecionada(s) de {plannedHouseIds.length} planejada(s)
                </div>
              </div>

              {/* House selection actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1 flex-1"
                  onClick={() => {
                    // Select all planned houses
                    setSelectedHouseIds([...plannedHouseIds]);
                    setWarnings(validateAllocation(plannedHouseIds, selectedContractor));
                  }}
                >
                  <Home className="h-3 w-3" />
                  Todas as planejadas ({plannedHouseIds.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1 flex-1"
                  onClick={() => {
                    const inContract = plannedHouseIds.filter(id => selectedContractor.contractHouseIds.includes(id));
                    setSelectedHouseIds(inContract);
                    setWarnings(validateAllocation(inContract, selectedContractor));
                  }}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Apenas do contrato ({plannedHouseIds.filter(id => selectedContractor.contractHouseIds.includes(id)).length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setShowMapSelector(true)}
                >
                  <MapPin className="h-3 w-3" />
                  Mapa
                </Button>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-2">
                  {warnings.map((w, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                        w.severity === "warning"
                          ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/30 dark:border-amber-800"
                          : "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800"
                      }`}
                    >
                      {w.severity === "warning" ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Change reason (if replacing) */}
              {currentAllocation?.contractorId && currentAllocation.contractorId !== selectedContractor.contractorId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Motivo da mudança (opcional)</label>
                  <Textarea
                    value={changeReason}
                    onChange={e => setChangeReason(e.target.value)}
                    placeholder="Ex: empreiteiro anterior não disponível esta semana..."
                    className="h-16 text-xs"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleConfirmAllocation} disabled={selectedHouseIds.length === 0}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Confirmar Alocação ({selectedHouseIds.length} casa{selectedHouseIds.length !== 1 ? "s" : ""})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Map selector */}
      {showMapSelector && selectedContractor && (
        <ContractorHouseMapSelector
          open={showMapSelector}
          onOpenChange={setShowMapSelector}
          macroId={macroId}
          scopeId={scopeId}
          macroName={macroName}
          scopeName={scopeName}
          assignedHouseIds={assignedHouseIds}
          selectedHouseIds={selectedHouseIds}
          onConfirm={handleMapConfirm}
        />
      )}
    </>
  );
}
