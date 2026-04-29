import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, CheckCircle, ArrowLeft, Clock, Pencil, Trash2, Save, X, MapPin, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { ContractorHouseMapSelector } from "./ContractorHouseMapSelector";
import type {
  ContractorContract, ContractorContractService,
  ContractorMeasurement, ContractorMeasurementItem,
} from "@/hooks/useContractors";

interface Props {
  contract: ContractorContract;
  contractorName: string;
  fetchContractServices: (contractId: string) => Promise<ContractorContractService[]>;
  fetchMeasurements: (contractId: string) => Promise<ContractorMeasurement[]>;
  createMeasurement: (contractId: string, data: Partial<ContractorMeasurement>) => Promise<any>;
  fetchMeasurementItems: (measurementId: string) => Promise<ContractorMeasurementItem[]>;
  saveMeasurementItem: (item: any) => Promise<any>;
  approveMeasurement: (measurementId: string) => Promise<boolean>;
  updateContractService: (serviceId: string, updates: Partial<ContractorContractService>) => Promise<boolean>;
  deleteContractService: (serviceId: string, contractId: string) => Promise<boolean>;
  recalcContractTotal: (contractId: string) => Promise<void>;
  onBack: () => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ContractorMeasurementsTab({
  contract, contractorName, fetchContractServices, fetchMeasurements,
  createMeasurement, fetchMeasurementItems, saveMeasurementItem,
  approveMeasurement, updateContractService, deleteContractService,
  recalcContractTotal, onBack,
}: Props) {
  const { currentProject } = useConstruction();
  const { company, canEdit, requireEdit } = useAuth();

  const [services, setServices] = useState<ContractorContractService[]>([]);
  const [measurements, setMeasurements] = useState<ContractorMeasurement[]>([]);
  const [selectedMeasurement, setSelectedMeasurement] = useState<ContractorMeasurement | null>(null);
  const [measurementItems, setMeasurementItems] = useState<ContractorMeasurementItem[]>([]);
  const [newMeasOpen, setNewMeasOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("services");

  // Edit service state
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editNegotiatedValue, setEditNegotiatedValue] = useState(0);
  const [editHouseIds, setEditHouseIds] = useState<number[]>([]);

  // House map selector
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [mapSelectorService, setMapSelectorService] = useState<ContractorContractService | null>(null);
  const [allAssignedHouses, setAllAssignedHouses] = useState<Record<string, Set<number>>>({});

  // New measurement form
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [measNotes, setMeasNotes] = useState("");

  const load = useCallback(async () => {
    const [svcs, meass] = await Promise.all([
      fetchContractServices(contract.id),
      fetchMeasurements(contract.id),
    ]);
    setServices(svcs);
    setMeasurements(meass);
  }, [contract.id, fetchContractServices, fetchMeasurements]);

  useEffect(() => { load(); }, [load]);

  // Load all assigned houses across ALL contracts for cross-checking
  const loadAllAssigned = useCallback(async (excludeServiceId?: string) => {
    if (!currentProject?.id || !company?.id) return;
    const { data } = await supabase
      .from("contractor_contract_services")
      .select("id, macro_id, scope_id, house_ids")
      .eq("project_id", currentProject.id)
      .eq("company_id", company.id);
    const map: Record<string, Set<number>> = {};
    (data || []).forEach((s: any) => {
      const key = `${s.macro_id}::${s.scope_id}`;
      if (!map[key]) map[key] = new Set();
      // Exclude the service being edited so its own houses remain selectable
      if (excludeServiceId && s.id === excludeServiceId) return;
      (s.house_ids || []).forEach((id: number) => map[key].add(id));
    });
    setAllAssignedHouses(map);
  }, [currentProject?.id, company?.id]);

  const loadItems = async (measId: string) => {
    const items = await fetchMeasurementItems(measId);
    setMeasurementItems(items);
  };

  const selectMeasurement = async (m: ContractorMeasurement) => {
    setSelectedMeasurement(m);
    await loadItems(m.id);
  };

  const handleCreateMeasurement = async () => {
    if (!requireEdit()) return;
    if (!periodStart || !periodEnd) return;
    setSaving(true);
    const nextNumber = measurements.length > 0
      ? Math.max(...measurements.map(m => m.measurement_number)) + 1
      : 1;
    await createMeasurement(contract.id, {
      measurement_number: nextNumber,
      period_start: periodStart,
      period_end: periodEnd,
      retention_percent: contract.retention_percent,
      payment_due_date: paymentDueDate || null,
      notes: measNotes || null,
    } as any);
    setSaving(false);
    setNewMeasOpen(false);
    setPeriodStart("");
    setPeriodEnd("");
    setPaymentDueDate("");
    setMeasNotes("");
    await load();
  };

  const handleUpdateItem = async (serviceId: string, housesCount: number) => {
    if (!requireEdit()) return;
    if (!selectedMeasurement) return;
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return;

    const existingItem = measurementItems.find(i => i.contract_service_id === serviceId);
    await saveMeasurementItem({
      id: existingItem?.id,
      measurement_id: selectedMeasurement.id,
      contract_service_id: serviceId,
      houses_measured: housesCount,
      unit_value: svc.negotiated_unit_value,
      house_ids: Array.from({ length: housesCount }, (_, i) => i + 1),
    });
    await loadItems(selectedMeasurement.id);
  };

  const handleApprove = async () => {
    if (!requireEdit()) return;
    if (!selectedMeasurement) return;
    const ok = await approveMeasurement(selectedMeasurement.id);
    if (ok) {
      await load();
      setSelectedMeasurement(prev => prev ? { ...prev, status: "approved", approved_at: new Date().toISOString() } : null);
    }
  };

  const handleEditService = async (svc: ContractorContractService) => {
    setEditingServiceId(svc.id);
    setEditNegotiatedValue(svc.negotiated_unit_value);
    setEditHouseIds(svc.house_ids || []);
    await loadAllAssigned(svc.id);
  };

  const handleOpenMapSelector = (svc: ContractorContractService) => {
    setMapSelectorService(svc);
    setMapSelectorOpen(true);
  };

  const handleHouseSelectionConfirm = (houseIds: number[]) => {
    setEditHouseIds(houseIds);
  };

  const handleSaveService = async (svc: ContractorContractService) => {
    if (!requireEdit()) return;
    setSaving(true);
    const ok = await updateContractService(svc.id, {
      negotiated_unit_value: editNegotiatedValue,
      total_houses: editHouseIds.length,
      house_ids: editHouseIds,
    });
    if (ok) {
      await recalcContractTotal(contract.id);
      await load();
    }
    setEditingServiceId(null);
    setEditHouseIds([]);
    setSaving(false);
  };

  const handleDeleteService = async (svc: ContractorContractService) => {
    if (!requireEdit()) return;
    if (!confirm(`Remover o serviço "${svc.scope_name}" deste contrato?`)) return;
    setSaving(true);
    const ok = await deleteContractService(svc.id, contract.id);
    if (ok) await load();
    setSaving(false);
  };

  const totalGross = measurementItems.reduce((s, i) => s + i.total_value, 0);
  const retentionValue = totalGross * (contract.retention_percent / 100);
  const netValue = totalGross - retentionValue;

  const statusLabels: Record<string, string> = {
    draft: "Rascunho",
    approved: "Aprovada",
    paid: "Paga",
  };
  const statusColors: Record<string, string> = {
    draft: "secondary",
    approved: "default",
    paid: "default",
  };

  const contractTotalFromServices = services.reduce((s, sv) => s + sv.total_value, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{contractorName}</h3>
          <p className="text-[10px] text-muted-foreground">
            Contrato {contract.contract_number || "S/N"} • Valor {fmt(contract.total_value)} • Retenção {contract.retention_percent}%
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Valor Contrato", value: fmt(contract.total_value), color: "text-amber-500" },
          { label: "Total Medido", value: fmt(contract.total_measured), color: "text-emerald-500" },
          { label: "Total Retido", value: fmt(contract.total_retained), color: "text-orange-500" },
          { label: "Total Pago", value: fmt(contract.total_paid), color: "text-primary" },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">{c.label}</p>
              <p className={`text-xs sm:text-sm font-mono font-bold ${c.color}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs: Services / Measurements */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-fit h-9">
          <TabsTrigger value="services" className="text-xs px-3 h-7">
            Serviços ({services.length})
          </TabsTrigger>
          <TabsTrigger value="measurements" className="text-xs px-3 h-7">
            Medições ({measurements.length})
          </TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services" className="mt-3">
          {services.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Nenhum serviço atribuído a este contrato. Use "Gerenciar Serviços" na lista de contratos.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Orçamento Un.</TableHead>
                      <TableHead className="text-right">Negociado Un.</TableHead>
                      <TableHead className="text-center">Casas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-24 text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map(svc => {
                      const isEditing = editingServiceId === svc.id;
                      const currentHouseCount = isEditing ? editHouseIds.length : (svc.house_ids?.length || svc.total_houses);
                      const currentNegotiated = isEditing ? editNegotiatedValue : svc.negotiated_unit_value;
                      return (
                        <TableRow key={svc.id}>
                          <TableCell className="text-xs">{svc.macro_name}</TableCell>
                          <TableCell className="text-xs">{svc.scope_name}</TableCell>
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">{fmt(svc.budget_unit_value)}</TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editNegotiatedValue}
                                onChange={e => setEditNegotiatedValue(parseFloat(e.target.value) || 0)}
                                className="h-7 w-24 text-xs text-right ml-auto"
                                autoFocus
                              />
                            ) : (
                              <span className="text-xs font-mono">{fmt(svc.negotiated_unit_value)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleOpenMapSelector(svc)}
                              >
                                <MapPin className="h-3 w-3" />
                                {editHouseIds.length > 0 ? `${editHouseIds.length} casas` : "Selecionar"}
                              </Button>
                            ) : (
                              <span className="text-xs font-mono">{currentHouseCount}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold">
                            {fmt(currentNegotiated * currentHouseCount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSaveService(svc)} disabled={saving}>
                                  <Save className="h-3.5 w-3.5 text-emerald-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingServiceId(null); setEditHouseIds([]); }}>
                                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditService(svc)}>
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteService(svc)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Badge variant="outline" className="font-mono text-xs px-3 py-1">
                  Total: {fmt(contractTotalFromServices)}
                </Badge>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Measurements Tab */}
        <TabsContent value="measurements" className="mt-3">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setNewMeasOpen(true)} className="gap-1.5 text-xs h-7" disabled={!canEdit}>
              <Plus className="h-3.5 w-3.5" /> Nova Medição
            </Button>
          </div>

          {selectedMeasurement ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedMeasurement(null)}>
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
                  </Button>
                  <h4 className="text-sm font-semibold">Medição #{selectedMeasurement.measurement_number}</h4>
                  <Badge variant={statusColors[selectedMeasurement.status] as any} className="text-[10px]">
                    {statusLabels[selectedMeasurement.status] || selectedMeasurement.status}
                  </Badge>
                </div>
                {selectedMeasurement.status === "draft" && (
                  <Button size="sm" className="gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={!canEdit}>
                    <CheckCircle className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Bruto</p><p className="font-mono font-bold text-emerald-500">{fmt(totalGross)}</p></CardContent></Card>
                <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Retenção ({contract.retention_percent}%)</p><p className="font-mono font-bold text-orange-500">{fmt(retentionValue)}</p></CardContent></Card>
                <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Líquido</p><p className="font-mono font-bold text-primary">{fmt(netValue)}</p></CardContent></Card>
              </div>

              {selectedMeasurement.payment_due_date && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Previsão de pagamento: {new Date(selectedMeasurement.payment_due_date + "T12:00:00").toLocaleDateString("pt-BR")}
                </div>
              )}

              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Valor Un.</TableHead>
                      <TableHead className="text-right">Casas Medidas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map(svc => {
                      const item = measurementItems.find(i => i.contract_service_id === svc.id);
                      const housesMeasured = item?.houses_measured || 0;
                      const totalVal = housesMeasured * svc.negotiated_unit_value;
                      const isDraft = selectedMeasurement.status === "draft";
                      return (
                        <TableRow key={svc.id}>
                          <TableCell className="text-xs">{svc.macro_name}</TableCell>
                          <TableCell className="text-xs">{svc.scope_name}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{fmt(svc.negotiated_unit_value)}</TableCell>
                          <TableCell className="text-right">
                            {isDraft ? (
                              <Input
                                type="number"
                                min={0}
                                max={svc.total_houses}
                                value={housesMeasured}
                                onChange={e => handleUpdateItem(svc.id, parseInt(e.target.value) || 0)}
                                className="h-7 w-16 text-xs text-right ml-auto"
                              />
                            ) : (
                              <span className="text-xs font-mono">{housesMeasured}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold">{fmt(totalVal)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {measurements.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma medição criada.</CardContent></Card>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Líquido</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Pagamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {measurements.map(m => (
                        <TableRow key={m.id} className="cursor-pointer hover:bg-accent/50" onClick={() => selectMeasurement(m)}>
                          <TableCell className="font-mono text-xs">{m.measurement_number}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(m.period_start + "T12:00:00").toLocaleDateString("pt-BR")} – {new Date(m.period_end + "T12:00:00").toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">{fmt(m.gross_value)}</TableCell>
                          <TableCell className="text-right text-xs font-mono font-semibold">{fmt(m.net_value)}</TableCell>
                          <TableCell>
                            <Badge variant={statusColors[m.status] as any} className="text-[10px]">
                              {statusLabels[m.status] || m.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.payment_due_date
                              ? new Date(m.payment_due_date + "T12:00:00").toLocaleDateString("pt-BR")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Measurement Dialog */}
      <Dialog open={newMeasOpen} onOpenChange={setNewMeasOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Medição do Empreiteiro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Início do Período *</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="h-8 text-sm" /></div>
              <div><Label className="text-xs">Fim do Período *</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="h-8 text-sm" /></div>
            </div>
            <div><Label className="text-xs">Previsão de Pagamento</Label><Input type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Observações</Label><Textarea value={measNotes} onChange={e => setMeasNotes(e.target.value)} className="text-sm" rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMeasOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateMeasurement} disabled={saving || !periodStart || !periodEnd || !canEdit}>
              {saving ? "Criando..." : "Criar Medição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* House Map Selector */}
      {mapSelectorService && (
        <ContractorHouseMapSelector
          open={mapSelectorOpen}
          onOpenChange={(open) => {
            setMapSelectorOpen(open);
            if (!open) setMapSelectorService(null);
          }}
          macroId={mapSelectorService.macro_id}
          scopeId={mapSelectorService.scope_id}
          macroName={mapSelectorService.macro_name}
          scopeName={mapSelectorService.scope_name}
          assignedHouseIds={allAssignedHouses[`${mapSelectorService.macro_id}::${mapSelectorService.scope_id}`] || new Set()}
          selectedHouseIds={editHouseIds}
          onConfirm={handleHouseSelectionConfirm}
        />
      )}
    </div>
  );
}
