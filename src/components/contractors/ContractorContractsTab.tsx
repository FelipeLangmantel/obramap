import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileText, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import type { Contractor, ContractorContract, ContractorContractService } from "@/hooks/useContractors";

interface Props {
  contractors: Contractor[];
  contracts: ContractorContract[];
  onCreateContract: (contractorId: string, data: Partial<ContractorContract>) => Promise<any>;
  fetchContractServices: (contractId: string) => Promise<ContractorContractService[]>;
  addContractService: (contractId: string, service: Partial<ContractorContractService>) => Promise<any>;
  recalcContractTotal: (contractId: string) => Promise<void>;
  onSelectContract: (contract: ContractorContract) => void;
}

const fmt = (v: number | undefined | null) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ContractorContractsTab({
  contractors, contracts, onCreateContract, fetchContractServices,
  addContractService, recalcContractTotal, onSelectContract,
}: Props) {
  const { currentProject } = useConstruction();
  const { company } = useAuth();
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("5");
  const [contractNumber, setContractNumber] = useState("");
  const [saving, setSaving] = useState(false);

  // Service assignment
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignContractId, setAssignContractId] = useState<string | null>(null);
  const [budgetServices, setBudgetServices] = useState<any[]>([]);
  const [contractServices, setContractServices] = useState<ContractorContractService[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const [negotiatedValues, setNegotiatedValues] = useState<Record<string, number>>({});
  const [selectedHouseIds, setSelectedHouseIds] = useState<Record<string, number[]>>({});

  // Load budget services (project_contract_services)
  useEffect(() => {
    if (!currentProject?.id || !company?.id) return;
    supabase
      .from("project_contract_services")
      .select("*")
      .eq("project_id", currentProject.id)
      .eq("company_id", company.id)
      .order("macro_order, scope_order")
      .then(({ data }) => { if (data) setBudgetServices(data); });
  }, [currentProject?.id, company?.id]);

  const handleCreateContract = async () => {
    if (!selectedContractorId) return;
    setSaving(true);
    await onCreateContract(selectedContractorId, {
      contract_number: contractNumber || null,
      retention_percent: parseFloat(retentionPercent) || 5,
    } as any);
    setSaving(false);
    setNewContractOpen(false);
    setSelectedContractorId("");
    setContractNumber("");
  };

  const openAssignServices = async (contractId: string) => {
    setAssignContractId(contractId);
    const services = await fetchContractServices(contractId);
    setContractServices(services);
    setAssignOpen(true);
  };

  const toggleService = (svcId: string) => {
    const next = new Set(selectedServiceIds);
    if (next.has(svcId)) next.delete(svcId); else next.add(svcId);
    setSelectedServiceIds(next);
  };

  const handleAddServices = async () => {
    if (!assignContractId) return;
    setSaving(true);
    for (const svcId of selectedServiceIds) {
      const svc = budgetServices.find(s => `${s.macro_id}::${s.scope_id}` === svcId);
      if (!svc) continue;
      const houseIds = selectedHouseIds[svcId] || [];
      const negotiated = negotiatedValues[svcId] ?? svc.unit_cost;
      await addContractService(assignContractId, {
        macro_id: svc.macro_id,
        macro_name: svc.macro_name,
        scope_id: svc.scope_id,
        scope_name: svc.scope_name,
        budget_unit_value: svc.unit_cost,
        negotiated_unit_value: negotiated,
        house_ids: houseIds,
        total_houses: houseIds.length || svc.total_houses,
      });
    }
    setSaving(false);
    setAssignOpen(false);
    setSelectedServiceIds(new Set());
    setNegotiatedValues({});
    setSelectedHouseIds({});
  };

  const availableContractors = contractors.filter(
    c => c.status === "active" && !contracts.some(ct => ct.contractor_id === c.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Contratos de Empreiteiros</h3>
        <Button size="sm" onClick={() => setNewContractOpen(true)} className="gap-1.5" disabled={availableContractors.length === 0}>
          <Plus className="h-3.5 w-3.5" /> Novo Contrato
        </Button>
      </div>

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum contrato de empreiteiro nesta obra.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {contracts.map(ct => {
            const contractor = contractors.find(c => c.id === ct.contractor_id);
            return (
              <Card key={ct.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelectContract(ct)}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{contractor?.name || "Empreiteiro"}</CardTitle>
                      <CardDescription className="text-xs">
                        {ct.contract_number ? `Contrato ${ct.contract_number}` : "Sem número"} • Retenção {ct.retention_percent}%
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ct.status === "active" ? "default" : "secondary"} className="text-[10px]">
                        {ct.status === "active" ? "Ativo" : ct.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4 border-t">
                  <div className="grid grid-cols-4 gap-2 text-[10px] sm:text-xs">
                    <div><span className="text-muted-foreground">Contrato</span><p className="font-mono font-semibold text-amber-500">{fmt(ct.total_value)}</p></div>
                    <div><span className="text-muted-foreground">Medido</span><p className="font-mono font-semibold text-green-500">{fmt(ct.total_measured)}</p></div>
                    <div><span className="text-muted-foreground">Retido</span><p className="font-mono font-semibold text-orange-500">{fmt(ct.total_retained)}</p></div>
                    <div><span className="text-muted-foreground">Pago</span><p className="font-mono font-semibold text-primary">{fmt(ct.total_paid)}</p></div>
                  </div>
                </CardContent>
                <div className="px-4 py-2 border-t flex justify-end">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); openAssignServices(ct.id); }}>
                    Gerenciar Serviços
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Contract Dialog */}
      <Dialog open={newContractOpen} onOpenChange={setNewContractOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Contrato de Empreiteiro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Empreiteiro *</Label>
              <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {availableContractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nº do Contrato</Label><Input value={contractNumber} onChange={e => setContractNumber(e.target.value)} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Retenção (%)</Label><Input type="number" value={retentionPercent} onChange={e => setRetentionPercent(e.target.value)} className="h-8 text-sm" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContractOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateContract} disabled={saving || !selectedContractorId}>{saving ? "Salvando..." : "Criar Contrato"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Services Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Atribuir Serviços ao Empreiteiro</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Selecione os serviços do orçamento executivo e defina o valor negociado.</p>
          <div className="rounded-md border overflow-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Etapa</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">Negociado</TableHead>
                  <TableHead className="text-right">Casas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgetServices.map(svc => {
                  const key = `${svc.macro_id}::${svc.scope_id}`;
                  const alreadyAssigned = contractServices.some(cs => cs.macro_id === svc.macro_id && cs.scope_id === svc.scope_id);
                  const isSelected = selectedServiceIds.has(key);
                  return (
                    <TableRow key={key} className={alreadyAssigned ? "opacity-40" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          disabled={alreadyAssigned}
                          onCheckedChange={() => {
                            toggleService(key);
                            if (!negotiatedValues[key]) {
                              setNegotiatedValues(prev => ({ ...prev, [key]: svc.unit_cost }));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{svc.macro_name}</TableCell>
                      <TableCell className="text-xs">{svc.scope_name}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{fmt(svc.unit_cost)}</TableCell>
                      <TableCell className="text-right">
                        {isSelected && (
                          <Input
                            type="number"
                            step="0.01"
                            value={negotiatedValues[key] ?? svc.unit_cost}
                            onChange={e => setNegotiatedValues(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                            className="h-7 w-24 text-xs text-right ml-auto"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{svc.total_houses}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddServices} disabled={saving || selectedServiceIds.size === 0}>
              {saving ? "Adicionando..." : `Adicionar ${selectedServiceIds.size} serviço(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
