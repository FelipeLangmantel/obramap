import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Package, Plus, Filter, ArrowRight, DollarSign, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface BatchesTabProps {
  companyId: string;
  contextId: string;
}

interface Batch {
  id: string; factory_id: string; batch_code: string; status: string;
  planned_quantity: number; actual_quantity: number; unit_value: number;
  planned_start: string | null; planned_finish: string | null;
  actual_start: string | null; actual_finish: string | null;
  ind_period_id: string | null; ind_service_id: string | null;
  notes: string | null; created_at: string;
  ind_factories?: { name: string } | null;
  ind_periods?: { name: string; start_date: string; end_date: string } | null;
  ind_services?: { name: string } | null;
}

interface IndFactory {
  id: string; name: string; avg_lead_time_days: number;
  advance_payment_pct: number; payment_terms: string | null; is_active: boolean;
}

interface IndPeriod {
  id: string; name: string; start_date: string; end_date: string; target_units: number;
}

interface IndService {
  id: string; name: string;
}

interface IndUnit {
  id: string; code: string; unit_number: number; zone_id: string | null; status: string;
}

interface IndZone {
  id: string; name: string; display_order: number;
}

interface BatchUnit {
  id: string; batch_id: string; unit_id: string | null; status: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planned: { label: "Planejado", color: "bg-muted text-muted-foreground" },
  released: { label: "Liberado", color: "bg-blue-500/15 text-blue-700" },
  in_production: { label: "Produzindo", color: "bg-amber-500/15 text-amber-700" },
  ready: { label: "Pronto", color: "bg-emerald-500/15 text-emerald-600" },
  awaiting_transport: { label: "Aguard. Transp.", color: "bg-orange-500/15 text-orange-700" },
  in_transit: { label: "Em Trânsito", color: "bg-violet-500/15 text-violet-700" },
  delivered: { label: "Entregue", color: "bg-emerald-500/20 text-emerald-700" },
  installed: { label: "Instalado", color: "bg-primary/15 text-primary" },
  cancelled: { label: "Cancelado", color: "bg-destructive/15 text-destructive" },
};

const STATUS_FLOW: Record<string, { next: string; label: string; dateField?: string }> = {
  planned: { next: "released", label: "Liberar para Fábrica" },
  released: { next: "in_production", label: "Confirmar Produção", dateField: "actual_start" },
  in_production: { next: "ready", label: "Marcar Pronto", dateField: "actual_finish" },
  ready: { next: "awaiting_transport", label: "Aguardar Transporte" },
};

export function BatchesTabContent({ companyId, contextId }: BatchesTabProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [factories, setFactories] = useState<IndFactory[]>([]);
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [services, setServices] = useState<IndService[]>([]);
  const [units, setUnits] = useState<IndUnit[]>([]);
  const [zones, setZones] = useState<IndZone[]>([]);
  const [batchUnits, setBatchUnits] = useState<BatchUnit[]>([]);

  const [filterFactory, setFilterFactory] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [newDialog, setNewDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  // New batch form
  const [form, setForm] = useState({
    factory_id: "", service_id: "", period_id: "",
    unit_value: 0, planned_start: "", planned_finish: "", notes: "",
    selectedUnitIds: [] as string[],
  });

  // Ready dialog extras
  const [readyDialog, setReadyDialog] = useState(false);
  const [readyActualQty, setReadyActualQty] = useState(0);

  const fetchAll = useCallback(async () => {
    const [bRes, fRes, pRes, sRes, uRes, zRes, buRes] = await Promise.all([
      supabase.from("ind_production_batches").select("*, ind_factories(name), ind_periods(name,start_date,end_date), ind_services(name)").eq("context_id", contextId).order("created_at", { ascending: false }),
      supabase.from("ind_factories").select("id,name,avg_lead_time_days,advance_payment_pct,payment_terms,is_active").eq("company_id", companyId).eq("is_active", true).order("name"),
      supabase.from("ind_periods").select("id,name,start_date,end_date,target_units").eq("context_id", contextId).order("start_date"),
      supabase.from("ind_services").select("id,name").eq("context_id", contextId).order("name"),
      supabase.from("ind_units").select("id,code,unit_number,zone_id,status").eq("context_id", contextId).order("unit_number"),
      supabase.from("ind_zones").select("id,name,display_order").eq("context_id", contextId).order("display_order"),
      supabase.from("ind_batch_units").select("id,batch_id,unit_id,status").eq("context_id", contextId),
    ]);
    setBatches((bRes.data || []) as Batch[]);
    setFactories((fRes.data || []) as IndFactory[]);
    setPeriods((pRes.data || []) as IndPeriod[]);
    setServices((sRes.data || []) as IndService[]);
    setUnits((uRes.data || []) as IndUnit[]);
    setZones((zRes.data || []) as IndZone[]);
    setBatchUnits((buRes.data || []) as BatchUnit[]);
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    let r = [...batches];
    if (filterFactory !== "all") r = r.filter(b => b.factory_id === filterFactory);
    if (filterPeriod !== "all") r = r.filter(b => b.ind_period_id === filterPeriod);
    if (filterStatus !== "all") r = r.filter(b => b.status === filterStatus);
    return r;
  }, [batches, filterFactory, filterPeriod, filterStatus]);

  // Units already in active batches
  const usedUnitIds = useMemo(() => {
    const activeBatchIds = batches.filter(b => b.status !== "cancelled").map(b => b.id);
    return new Set(batchUnits.filter(bu => bu.unit_id && activeBatchIds.includes(bu.batch_id)).map(bu => bu.unit_id!));
  }, [batches, batchUnits]);

  const selectedFactory = useMemo(() => factories.find(f => f.id === form.factory_id), [factories, form.factory_id]);
  const selectedPeriod = useMemo(() => periods.find(p => p.id === form.period_id), [periods, form.period_id]);

  const totalValue = form.selectedUnitIds.length * form.unit_value;
  const advanceValue = selectedFactory ? totalValue * selectedFactory.advance_payment_pct / 100 : 0;
  const advanceDueDate = selectedPeriod && selectedFactory
    ? new Date(new Date(selectedPeriod.start_date + "T12:00:00").getTime() - selectedFactory.avg_lead_time_days * 86400000)
    : null;
  const advanceDueDays = advanceDueDate ? differenceInDays(advanceDueDate, new Date()) : 999;

  const openNewDialog = () => {
    // Pre-fill unit_value from last batch of same factory
    setForm({
      factory_id: "", service_id: "", period_id: "",
      unit_value: 0, planned_start: "", planned_finish: "", notes: "",
      selectedUnitIds: [],
    });
    setNewDialog(true);
  };

  const handleFactoryChange = (factoryId: string) => {
    const lastBatch = batches.find(b => b.factory_id === factoryId && b.unit_value > 0);
    setForm(f => ({
      ...f,
      factory_id: factoryId,
      unit_value: lastBatch?.unit_value || f.unit_value,
    }));
  };

  const toggleUnit = (unitId: string) => {
    setForm(f => ({
      ...f,
      selectedUnitIds: f.selectedUnitIds.includes(unitId)
        ? f.selectedUnitIds.filter(id => id !== unitId)
        : [...f.selectedUnitIds, unitId],
    }));
  };

  const saveBatch = async () => {
    if (!form.factory_id || !form.period_id || form.selectedUnitIds.length === 0) {
      toast.error("Empresa, quinzena e unidades são obrigatórios");
      return;
    }
    try {
      const factory = factories.find(f => f.id === form.factory_id);
      const existingCount = batches.filter(b => b.status !== "cancelled").length;
      const prefix = factory?.name?.slice(0, 2).toUpperCase() || "LT";
      const batchCode = `${prefix}-${String(existingCount + 1).padStart(3, "0")}`;

      const { data: newBatch, error } = await supabase
        .from("ind_production_batches")
        .insert({
          company_id: companyId,
          context_id: contextId,
          factory_id: form.factory_id,
          ind_service_id: form.service_id || null,
          ind_period_id: form.period_id,
          unit_value: form.unit_value,
          planned_quantity: form.selectedUnitIds.length,
          planned_start: form.planned_start || null,
          planned_finish: form.planned_finish || null,
          batch_code: batchCode,
          status: "planned",
          notes: form.notes || null,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Insert batch_units
      const batchUnitRows = form.selectedUnitIds.map(uid => ({
        batch_id: newBatch.id,
        context_id: contextId,
        unit_id: uid,
        status: "planned",
      }));
      const { error: buErr } = await supabase.from("ind_batch_units").insert(batchUnitRows as any);
      if (buErr) throw buErr;

      toast.success(`Lote ${batchCode} criado com ${form.selectedUnitIds.length} unidades!`);
      setNewDialog(false);
      fetchAll();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Status advance
  const advanceStatus = async (batch: Batch) => {
    const flow = STATUS_FLOW[batch.status];
    if (!flow) return;

    if (flow.next === "ready") {
      setReadyActualQty(batch.planned_quantity);
      setReadyDialog(true);
      return;
    }

    const updates: Record<string, any> = { status: flow.next };
    if (flow.dateField) updates[flow.dateField] = new Date().toISOString().slice(0, 10);

    const { error } = await supabase.from("ind_production_batches").update(updates as any).eq("id", batch.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`Status → ${STATUS_MAP[flow.next]?.label}`);
    if (selectedBatch?.id === batch.id) setSelectedBatch({ ...batch, status: flow.next, ...updates });
    fetchAll();
  };

  const confirmReady = async () => {
    if (!selectedBatch) return;
    const actualValue = readyActualQty * selectedBatch.unit_value;
    const { error } = await supabase.from("ind_production_batches").update({
      status: "ready",
      actual_finish: new Date().toISOString().slice(0, 10),
      actual_quantity: readyActualQty,
      actual_value: actualValue,
    } as any).eq("id", selectedBatch.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Lote marcado como pronto!");
    setReadyDialog(false);
    setSelectedBatch(null);
    fetchAll();
  };

  // Detail
  const batchDetail = useMemo(() => {
    if (!selectedBatch) return { units: [] as (IndUnit & { buStatus: string })[], totalValue: 0, advance: 0 };
    const bus = batchUnits.filter(bu => bu.batch_id === selectedBatch.id);
    const unitsList = bus.map(bu => {
      const u = units.find(u2 => u2.id === bu.unit_id);
      return u ? { ...u, buStatus: bu.status } : null;
    }).filter(Boolean) as (IndUnit & { buStatus: string })[];
    const tv = selectedBatch.planned_quantity * selectedBatch.unit_value;
    const factory = factories.find(f => f.id === selectedBatch.factory_id);
    const adv = factory ? tv * factory.advance_payment_pct / 100 : 0;
    return { units: unitsList, totalValue: tv, advance: adv };
  }, [selectedBatch, batchUnits, units, factories]);

  const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yy") : "—";

  // Group units by zone for new dialog
  const unitsByZone = useMemo(() => {
    const groups: { zone: IndZone | null; units: IndUnit[] }[] = [];
    const zMap = new Map<string, IndUnit[]>();
    const noZone: IndUnit[] = [];
    units.forEach(u => {
      if (u.zone_id) {
        const arr = zMap.get(u.zone_id) || [];
        arr.push(u);
        zMap.set(u.zone_id, arr);
      } else {
        noZone.push(u);
      }
    });
    zones.forEach(z => {
      const zu = zMap.get(z.id);
      if (zu) groups.push({ zone: z, units: zu });
    });
    if (noZone.length > 0) groups.push({ zone: null, units: noZone });
    return groups;
  }, [units, zones]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterFactory} onValueChange={setFilterFactory}>
          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {factories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Quinzena" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openNewDialog} className="gap-1.5 h-7 text-xs">
          <Plus className="h-3.5 w-3.5" /> Novo Lote
        </Button>
      </div>

      {/* Batch table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhum lote encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Código</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs">Serviço</TableHead>
                  <TableHead className="text-xs">Quinzena</TableHead>
                  <TableHead className="text-xs text-center">Plan./Prod.</TableHead>
                  <TableHead className="text-xs text-right">Valor Total</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(b => {
                  const st = STATUS_MAP[b.status] || { label: b.status, color: "" };
                  return (
                    <TableRow key={b.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedBatch(b)}>
                      <TableCell className="text-xs font-bold text-foreground">{b.batch_code}</TableCell>
                      <TableCell className="text-xs text-foreground">{b.ind_factories?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-foreground">{b.ind_services?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-foreground">{b.ind_periods?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-center font-medium text-foreground">
                        {b.actual_quantity > 0 ? `${b.actual_quantity}/${b.planned_quantity}` : b.planned_quantity}
                      </TableCell>
                      <TableCell className="text-xs text-right text-foreground">
                        {BRL.format(b.planned_quantity * b.unit_value)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn("text-[10px]", st.color)}>{st.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ═══ New Batch Dialog ═══ */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lote de Produção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Empresa Fabril *</Label>
                <Select value={form.factory_id} onValueChange={handleFactoryChange}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {factories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Serviço</Label>
                <Select value={form.service_id || "__none__"} onValueChange={v => setForm(f => ({ ...f, service_id: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedFactory && (
              <Card className="bg-accent/30">
                <CardContent className="p-3 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Lead Time:</span> <span className="font-medium text-foreground">{selectedFactory.avg_lead_time_days} dias</span></div>
                  <div><span className="text-muted-foreground">Entrada:</span> <span className="font-medium text-foreground">{selectedFactory.advance_payment_pct}%</span></div>
                  <div><span className="text-muted-foreground">Pagamento:</span> <span className="font-medium text-foreground">{selectedFactory.payment_terms || "—"}</span></div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Quinzena *</Label>
                <Select value={form.period_id} onValueChange={v => setForm(f => ({ ...f, period_id: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {periods.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({format(new Date(p.start_date + "T12:00:00"), "dd/MM")}–{format(new Date(p.end_date + "T12:00:00"), "dd/MM")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor Unitário (R$)</Label>
                <Input type="number" step="0.01" value={form.unit_value} onChange={e => setForm(f => ({ ...f, unit_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
              </div>
              <div className="flex flex-col justify-end text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-foreground">{BRL.format(totalValue)}</span>
                </div>
                {advanceValue > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entrada:</span>
                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-300">{BRL.format(advanceValue)}</Badge>
                  </div>
                )}
                {advanceDueDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Limite:</span>
                    <Badge variant="outline" className={cn("text-[9px]", advanceDueDays < 7 ? "bg-destructive/10 text-destructive border-destructive/30" : "")}>
                      {format(advanceDueDate, "dd/MM/yy")}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Início Planejado</Label>
                <Input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Fim Planejado</Label>
                <Input type="date" value={form.planned_finish} onChange={e => setForm(f => ({ ...f, planned_finish: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>

            {/* Unit grid */}
            <div>
              <Label className="text-xs">Unidades ({form.selectedUnitIds.length} selecionadas)</Label>
              <div className="border rounded-lg p-2 mt-1 max-h-48 overflow-y-auto space-y-2">
                {unitsByZone.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma unidade cadastrada.</p>
                ) : unitsByZone.map(({ zone, units: zu }) => (
                  <div key={zone?.id || "no-zone"}>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">{zone?.name || "Sem zona"}</p>
                    <div className="flex flex-wrap gap-1">
                      {zu.map(u => {
                        const used = usedUnitIds.has(u.id);
                        const selected = form.selectedUnitIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            disabled={used}
                            onClick={() => !used && toggleUnit(u.id)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors",
                              used ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed" :
                              selected ? "bg-primary text-primary-foreground border-primary" :
                              "bg-card text-foreground border-border hover:border-primary",
                            )}
                          >
                            {u.code || `#${u.unit_number}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs min-h-[50px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveBatch}>Criar Lote ({form.selectedUnitIds.length} un)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Batch Detail Sheet ═══ */}
      <Sheet open={!!selectedBatch} onOpenChange={v => !v && setSelectedBatch(null)}>
        <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
          {selectedBatch && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{selectedBatch.batch_code}</span>
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_MAP[selectedBatch.status]?.color)}>
                    {STATUS_MAP[selectedBatch.status]?.label}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium text-foreground">{selectedBatch.ind_factories?.name}</span></div>
                  <div><span className="text-muted-foreground">Quinzena:</span> <span className="font-medium text-foreground">{selectedBatch.ind_periods?.name}</span></div>
                  <div><span className="text-muted-foreground">Serviço:</span> <span className="font-medium text-foreground">{selectedBatch.ind_services?.name || "—"}</span></div>
                  <div><span className="text-muted-foreground">Qtd:</span> <span className="font-medium text-foreground">{selectedBatch.actual_quantity > 0 ? `${selectedBatch.actual_quantity}/` : ""}{selectedBatch.planned_quantity}</span></div>
                </div>

                {/* Financial */}
                <Card className="bg-accent/30">
                  <CardContent className="p-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Valor Total</span>
                      <span className="font-bold text-foreground">{BRL.format(batchDetail.totalValue)}</span>
                    </div>
                    {batchDetail.advance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entrada</span>
                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700">{BRL.format(batchDetail.advance)}</Badge>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Saldo</span>
                      <span className="font-medium text-foreground">{BRL.format(batchDetail.totalValue - batchDetail.advance)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Histórico
                  </div>
                  <div className="pl-4 space-y-0.5">
                    <div>Criado: {format(new Date(selectedBatch.created_at), "dd/MM/yy HH:mm")}</div>
                    {selectedBatch.planned_start && <div>Início plan.: {fmtDate(selectedBatch.planned_start)}</div>}
                    {selectedBatch.actual_start && <div>Início real: {fmtDate(selectedBatch.actual_start)}</div>}
                    {selectedBatch.planned_finish && <div>Fim plan.: {fmtDate(selectedBatch.planned_finish)}</div>}
                    {selectedBatch.actual_finish && <div>Fim real: {fmtDate(selectedBatch.actual_finish)}</div>}
                  </div>
                </div>

                {/* Units */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Unidades ({batchDetail.units.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {batchDetail.units.map(u => (
                      <Badge key={u.id} variant="outline" className="text-[9px]">
                        {u.code || `#${u.unit_number}`}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                {STATUS_FLOW[selectedBatch.status] && (
                  <Button size="sm" className="w-full gap-1.5" onClick={() => advanceStatus(selectedBatch)}>
                    <ArrowRight className="h-3.5 w-3.5" />
                    {STATUS_FLOW[selectedBatch.status].label}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Ready confirmation dialog */}
      <Dialog open={readyDialog} onOpenChange={setReadyDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Marcar como Pronto</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Quantidade Real Produzida</Label>
            <Input type="number" value={readyActualQty} onChange={e => setReadyActualQty(parseInt(e.target.value) || 0)} className="h-8 text-sm" />
            {selectedBatch && (
              <p className="text-xs text-muted-foreground">
                Valor: {BRL.format(readyActualQty * selectedBatch.unit_value)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReadyDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={confirmReady}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
