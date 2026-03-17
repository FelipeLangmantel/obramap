import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle, ArrowLeft, Clock, DollarSign } from "lucide-react";
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
  onBack: () => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ContractorMeasurementsTab({
  contract, contractorName, fetchContractServices, fetchMeasurements,
  createMeasurement, fetchMeasurementItems, saveMeasurementItem,
  approveMeasurement, onBack,
}: Props) {
  const [services, setServices] = useState<ContractorContractService[]>([]);
  const [measurements, setMeasurements] = useState<ContractorMeasurement[]>([]);
  const [selectedMeasurement, setSelectedMeasurement] = useState<ContractorMeasurement | null>(null);
  const [measurementItems, setMeasurementItems] = useState<ContractorMeasurementItem[]>([]);
  const [newMeasOpen, setNewMeasOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const loadItems = async (measId: string) => {
    const items = await fetchMeasurementItems(measId);
    setMeasurementItems(items);
  };

  const selectMeasurement = async (m: ContractorMeasurement) => {
    setSelectedMeasurement(m);
    await loadItems(m.id);
  };

  const handleCreateMeasurement = async () => {
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
    if (!selectedMeasurement) return;
    const svc = services.find(s => s.id === serviceId);
    if (!svc) return;

    // Generate house_ids as sequential based on count
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
    if (!selectedMeasurement) return;
    const ok = await approveMeasurement(selectedMeasurement.id);
    if (ok) {
      await load();
      setSelectedMeasurement(prev => prev ? { ...prev, status: "approved", approved_at: new Date().toISOString() } : null);
    }
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
        <div className="ml-auto">
          <Button size="sm" onClick={() => setNewMeasOpen(true)} className="gap-1.5 text-xs h-7">
            <Plus className="h-3.5 w-3.5" /> Nova Medição
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Valor Contrato", value: fmt(contract.total_value), color: "text-amber-500" },
          { label: "Total Medido", value: fmt(contract.total_measured), color: "text-green-500" },
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

      {/* Measurements list or detail */}
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
              <Button size="sm" className="gap-1.5 text-xs h-7 bg-green-600 hover:bg-green-700" onClick={handleApprove}>
                <CheckCircle className="h-3.5 w-3.5" /> Aprovar
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Bruto</p><p className="font-mono font-bold text-green-500">{fmt(totalGross)}</p></CardContent></Card>
            <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Retenção ({contract.retention_percent}%)</p><p className="font-mono font-bold text-orange-500">{fmt(retentionValue)}</p></CardContent></Card>
            <Card><CardContent className="p-2 text-center"><p className="text-[10px] text-muted-foreground">Líquido</p><p className="font-mono font-bold text-primary">{fmt(netValue)}</p></CardContent></Card>
          </div>

          {selectedMeasurement.payment_due_date && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Previsão de pagamento: {new Date(selectedMeasurement.payment_due_date + "T12:00:00").toLocaleDateString("pt-BR")}
            </div>
          )}

          {/* Service items for measurement */}
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
          <h4 className="text-xs font-semibold text-muted-foreground">Histórico de Medições</h4>
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
            <Button onClick={handleCreateMeasurement} disabled={saving || !periodStart || !periodEnd}>
              {saving ? "Criando..." : "Criar Medição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
