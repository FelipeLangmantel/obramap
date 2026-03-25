import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Truck, Plus, Pencil, Filter, ArrowRight, FileText, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface LogisticsTabProps {
  companyId: string;
  contextId: string;
}

interface IndTruck {
  id: string; plate: string; truck_type: string; capacity_kg: number;
  carrier_name: string | null; driver_name: string | null; driver_phone: string | null;
  is_active: boolean; notes: string | null;
}

interface Shipment {
  id: string; shipment_number: string; status: string; batch_id: string | null;
  truck_id: string | null; planned_date: string | null; actual_date: string | null;
  truck_plate: string | null; driver_name: string | null; freight_value: number;
  received_by: string | null; notes: string | null; ind_period_id: string | null;
  ind_production_batches?: { batch_code: string; factory_id: string; ind_factories?: { name: string } | null } | null;
}

interface Batch {
  id: string; batch_code: string; factory_id: string; status: string;
  planned_quantity: number; ind_factories?: { name: string } | null;
}

interface IndPeriod {
  id: string; name: string; start_date: string; end_date: string;
}

interface BatchUnit {
  id: string; batch_id: string; unit_id: string | null; status: string;
}

interface IndUnit {
  id: string; code: string; unit_number: number;
}

const TRUCK_TYPES: Record<string, string> = {
  munck: "Munck", carreta: "Carreta", bitrem: "Bitrem", outro: "Outro",
};

const SHIP_STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: "Planejado", color: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmado", color: "bg-blue-500/15 text-blue-700" },
  in_transit: { label: "Em Trânsito", color: "bg-amber-500/15 text-amber-700" },
  delivered: { label: "Entregue", color: "bg-emerald-500/15 text-emerald-700" },
  cancelled: { label: "Cancelado", color: "bg-destructive/15 text-destructive" },
};

const SHIP_FLOW: Record<string, { next: string; label: string }> = {
  planned: { next: "confirmed", label: "Confirmar" },
  confirmed: { next: "in_transit", label: "Em Trânsito" },
};

const EMPTY_TRUCK = {
  plate: "", truck_type: "munck", capacity_kg: 0,
  carrier_name: "", driver_name: "", driver_phone: "", is_active: true, notes: "",
};

export function LogisticsTabContent({ companyId, contextId }: LogisticsTabProps) {
  const [trucks, setTrucks] = useState<IndTruck[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [batchUnits, setBatchUnits] = useState<BatchUnit[]>([]);
  const [units, setUnits] = useState<IndUnit[]>([]);

  // Truck dialog
  const [truckDialog, setTruckDialog] = useState(false);
  const [truckForm, setTruckForm] = useState(EMPTY_TRUCK);
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);

  // Shipment dialog
  const [shipDialog, setShipDialog] = useState(false);
  const [shipForm, setShipForm] = useState({
    batch_id: "", truck_id: "", planned_date: "", freight_value: 0, period_id: "", notes: "",
  });

  // Filters
  const [filterFactory, setFilterFactory] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("all");

  // Detail sheet
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  // Delivery dialog
  const [deliveryDialog, setDeliveryDialog] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ actual_date: "", received_by: "" });

  const fetchAll = useCallback(async () => {
    const [tRes, sRes, bRes, pRes, buRes, uRes] = await Promise.all([
      supabase.from("ind_trucks").select("*").eq("company_id", companyId).order("plate"),
      supabase.from("ind_shipments").select("*, ind_production_batches(batch_code,factory_id,ind_factories(name))").eq("context_id", contextId).order("planned_date", { ascending: false }),
      supabase.from("ind_production_batches").select("id,batch_code,factory_id,status,planned_quantity,ind_factories(name)").eq("context_id", contextId),
      supabase.from("ind_periods").select("id,name,start_date,end_date").eq("context_id", contextId).order("start_date"),
      supabase.from("ind_batch_units").select("id,batch_id,unit_id,status").eq("context_id", contextId),
      supabase.from("ind_units").select("id,code,unit_number").eq("context_id", contextId),
    ]);
    setTrucks((tRes.data || []) as IndTruck[]);
    setShipments((sRes.data || []) as Shipment[]);
    setBatches((bRes.data || []) as Batch[]);
    setPeriods((pRes.data || []) as IndPeriod[]);
    setBatchUnits((buRes.data || []) as BatchUnit[]);
    setUnits((uRes.data || []) as IndUnit[]);
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Truck CRUD ───
  const openNewTruck = () => { setTruckForm({ ...EMPTY_TRUCK }); setEditingTruckId(null); setTruckDialog(true); };
  const openEditTruck = (t: IndTruck) => {
    setTruckForm({
      plate: t.plate, truck_type: t.truck_type, capacity_kg: t.capacity_kg,
      carrier_name: t.carrier_name || "", driver_name: t.driver_name || "",
      driver_phone: t.driver_phone || "", is_active: t.is_active, notes: t.notes || "",
    });
    setEditingTruckId(t.id);
    setTruckDialog(true);
  };
  const saveTruck = async () => {
    if (!requireEdit()) return;
    if (!truckForm.plate.trim()) { toast.error("Placa obrigatória"); return; }
    const payload = {
      ...truckForm, company_id: companyId,
      carrier_name: truckForm.carrier_name || null,
      driver_name: truckForm.driver_name || null,
      driver_phone: truckForm.driver_phone || null,
      notes: truckForm.notes || null,
    };
    if (editingTruckId) {
      const { error } = await supabase.from("ind_trucks").update(payload as any).eq("id", editingTruckId);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Caminhão atualizado!");
    } else {
      const { error } = await supabase.from("ind_trucks").insert(payload as any);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Caminhão cadastrado!");
    }
    setTruckDialog(false);
    fetchAll();
  };

  // ─── Shipment ───
  const readyBatches = useMemo(() =>
    batches.filter(b => b.status === "ready" || b.status === "awaiting_transport"),
  [batches]);
  const activeTrucks = useMemo(() => trucks.filter(t => t.is_active), [trucks]);

  const openNewShipment = () => {
    setShipForm({ batch_id: "", truck_id: "", planned_date: "", freight_value: 0, period_id: "", notes: "" });
    setShipDialog(true);
  };

  const saveShipment = async () => {
    if (!requireEdit()) return;
    if (!shipForm.batch_id || !shipForm.truck_id || !shipForm.planned_date) {
      toast.error("Lote, caminhão e data são obrigatórios");
      return;
    }
    const year = new Date().getFullYear();
    const existingCount = shipments.filter(s => s.status !== "cancelled").length;
    const shipNumber = `REM-${year}-${String(existingCount + 1).padStart(3, "0")}`;
    const truck = trucks.find(t => t.id === shipForm.truck_id);

    const { error } = await supabase.from("ind_shipments").insert({
      company_id: companyId,
      context_id: contextId,
      batch_id: shipForm.batch_id,
      truck_id: shipForm.truck_id,
      truck_plate: truck?.plate || null,
      driver_name: truck?.driver_name || null,
      shipment_number: shipNumber,
      planned_date: shipForm.planned_date,
      freight_value: shipForm.freight_value,
      ind_period_id: shipForm.period_id || null,
      status: "planned",
      notes: shipForm.notes || null,
    } as any);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`Viagem ${shipNumber} criada!`);
    setShipDialog(false);
    fetchAll();
  };

  // Advance shipment status
  const advanceShipment = async (ship: Shipment) => {
    const flow = SHIP_FLOW[ship.status];
    if (!flow) return;
    const { error } = await supabase.from("ind_shipments").update({ status: flow.next } as any).eq("id", ship.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`Status → ${SHIP_STATUS[flow.next]?.label}`);
    if (selectedShipment?.id === ship.id) setSelectedShipment({ ...ship, status: flow.next });
    fetchAll();
  };

  // Confirm delivery
  const openDeliveryDialog = () => {
    setDeliveryForm({ actual_date: new Date().toISOString().slice(0, 10), received_by: "" });
    setDeliveryDialog(true);
  };

  const confirmDelivery = async () => {
    if (!requireEdit()) return;
    if (!selectedShipment) return;
    try {
      // Update shipment
      const { error: sErr } = await supabase.from("ind_shipments").update({
        status: "delivered",
        actual_date: deliveryForm.actual_date,
        received_by: deliveryForm.received_by || null,
      } as any).eq("id", selectedShipment.id);
      if (sErr) throw sErr;

      // Update batch_units
      if (selectedShipment.batch_id) {
        await supabase.from("ind_batch_units")
          .update({ status: "delivered" } as any)
          .eq("batch_id", selectedShipment.batch_id)
          .eq("context_id", contextId);

        // Update units
        const bus = batchUnits.filter(bu => bu.batch_id === selectedShipment.batch_id);
        const unitIds = bus.map(bu => bu.unit_id).filter(Boolean) as string[];
        if (unitIds.length > 0) {
          await supabase.from("ind_units").update({ status: "delivered" } as any).in("id", unitIds);
        }

        // Update batch
        await supabase.from("ind_production_batches")
          .update({ status: "delivered" } as any)
          .eq("id", selectedShipment.batch_id);
      }

      toast.success("Entrega confirmada!");
      setDeliveryDialog(false);
      setSelectedShipment(null);
      fetchAll();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Romaneio (print)
  const printRomaneio = (ship: Shipment) => {
    const batch = batches.find(b => b.id === ship.batch_id);
    const bus = batchUnits.filter(bu => bu.batch_id === ship.batch_id);
    const unitList = bus.map(bu => units.find(u => u.id === bu.unit_id)).filter(Boolean) as IndUnit[];

    const html = `<html><head><title>Romaneio ${ship.shipment_number}</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
    h1{font-size:18px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #333;padding:6px;text-align:left}th{background:#eee}
    .sig{margin-top:60px;display:flex;gap:40px}.sig div{border-top:1px solid #333;padding-top:4px;width:200px;text-align:center}
    @media print{body{padding:10px}}</style></head><body>
    <h1>ROMANEIO — ${ship.shipment_number}</h1>
    <p><strong>Data:</strong> ${ship.planned_date ? format(new Date(ship.planned_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</p>
    <p><strong>Motorista:</strong> ${ship.driver_name || "—"} | <strong>Placa:</strong> ${ship.truck_plate || "—"}</p>
    <p><strong>Origem:</strong> ${batch?.ind_factories?.name || "—"} | <strong>Lote:</strong> ${batch?.batch_code || "—"}</p>
    <p><strong>Frete:</strong> ${BRL.format(ship.freight_value)}</p>
    <table><thead><tr><th>#</th><th>Código</th><th>Nº Unidade</th></tr></thead>
    <tbody>${unitList.map((u, i) => `<tr><td>${i + 1}</td><td>${u.code}</td><td>${u.unit_number}</td></tr>`).join("")}</tbody></table>
    <p style="margin-top:8px"><strong>Total de peças: ${unitList.length}</strong></p>
    <div class="sig"><div>Conferente (origem)</div><div>Conferente (destino)</div><div>Motorista</div></div>
    </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // Filter
  const filteredShipments = useMemo(() => {
    let r = [...shipments];
    if (filterFactory !== "all") {
      r = r.filter(s => s.ind_production_batches?.factory_id === filterFactory);
    }
    if (filterPeriod !== "all") {
      r = r.filter(s => s.ind_period_id === filterPeriod);
    }
    return r;
  }, [shipments, filterFactory, filterPeriod]);

  const uniqueFactories = useMemo(() => {
    const map = new Map<string, string>();
    batches.forEach(b => { if (b.ind_factories?.name) map.set(b.factory_id, b.ind_factories.name); });
    return Array.from(map.entries());
  }, [batches]);

  // Detail
  const shipmentUnits = useMemo(() => {
    if (!selectedShipment?.batch_id) return [];
    const bus = batchUnits.filter(bu => bu.batch_id === selectedShipment.batch_id);
    return bus.map(bu => units.find(u => u.id === bu.unit_id)).filter(Boolean) as IndUnit[];
  }, [selectedShipment, batchUnits, units]);

  const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yy") : "—";

  return (
    <div className="space-y-4">
      <Tabs defaultValue="trucks" className="w-full">
        <TabsList>
          <TabsTrigger value="trucks" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" /> Caminhões ({trucks.length})
          </TabsTrigger>
          <TabsTrigger value="shipments" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Viagens ({shipments.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ TRUCKS ═══ */}
        <TabsContent value="trucks" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewTruck} className="gap-1.5" disabled={!canEdit}>
              <Plus className="h-4 w-4" /> Novo Caminhão
            </Button>
          </div>
          {trucks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum caminhão cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Placa</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Cap. (kg)</TableHead>
                      <TableHead className="text-xs">Transportadora</TableHead>
                      <TableHead className="text-xs">Motorista</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                      <TableHead className="text-xs w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trucks.map(t => (
                      <TableRow key={t.id} className={!t.is_active ? "opacity-50" : ""}>
                        <TableCell className="text-xs font-bold text-foreground">{t.plate}</TableCell>
                        <TableCell className="text-xs text-foreground">{TRUCK_TYPES[t.truck_type] || t.truck_type}</TableCell>
                        <TableCell className="text-xs text-foreground">{t.capacity_kg.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-xs text-foreground">{t.carrier_name || "—"}</TableCell>
                        <TableCell className="text-xs text-foreground">{t.driver_name || "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                            {t.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditTruck(t)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ SHIPMENTS ═══ */}
        <TabsContent value="shipments" className="space-y-3 mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterFactory} onValueChange={setFilterFactory}>
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueFactories.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Quinzena" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button size="sm" onClick={openNewShipment} className="gap-1.5 h-7 text-xs" disabled={!canEdit || readyBatches.length === 0}>
              <Plus className="h-3.5 w-3.5" /> Nova Viagem
            </Button>
          </div>

          {filteredShipments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhuma viagem registrada.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Viagem</TableHead>
                      <TableHead className="text-xs">Data Plan.</TableHead>
                      <TableHead className="text-xs">Empresa</TableHead>
                      <TableHead className="text-xs">Caminhão</TableHead>
                      <TableHead className="text-xs text-center">Peças</TableHead>
                      <TableHead className="text-xs text-right">Frete</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShipments.map(s => {
                      const st = SHIP_STATUS[s.status] || { label: s.status, color: "" };
                      const pieceCount = batchUnits.filter(bu => bu.batch_id === s.batch_id).length;
                      return (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedShipment(s)}>
                          <TableCell className="text-xs font-bold text-foreground">{s.shipment_number}</TableCell>
                          <TableCell className="text-xs text-foreground">{fmtDate(s.planned_date)}</TableCell>
                          <TableCell className="text-xs text-foreground">{s.ind_production_batches?.ind_factories?.name || "—"}</TableCell>
                          <TableCell className="text-xs text-foreground">{s.truck_plate || "—"}</TableCell>
                          <TableCell className="text-xs text-center font-medium text-foreground">{pieceCount}</TableCell>
                          <TableCell className="text-xs text-right text-foreground">{BRL.format(s.freight_value)}</TableCell>
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
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}

      {/* Truck Dialog */}
      <Dialog open={truckDialog} onOpenChange={setTruckDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTruckId ? "Editar Caminhão" : "Novo Caminhão"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placa *</Label>
              <Input value={truckForm.plate} onChange={e => setTruckForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={truckForm.truck_type} onValueChange={v => setTruckForm(f => ({ ...f, truck_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TRUCK_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capacidade (kg)</Label>
              <Input type="number" value={truckForm.capacity_kg} onChange={e => setTruckForm(f => ({ ...f, capacity_kg: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={truckForm.is_active} onCheckedChange={v => setTruckForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-xs">Ativo</Label>
            </div>
            <div>
              <Label className="text-xs">Transportadora</Label>
              <Input value={truckForm.carrier_name} onChange={e => setTruckForm(f => ({ ...f, carrier_name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Motorista</Label>
              <Input value={truckForm.driver_name} onChange={e => setTruckForm(f => ({ ...f, driver_name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={truckForm.driver_phone} onChange={e => setTruckForm(f => ({ ...f, driver_phone: e.target.value }))} className="h-8 text-xs" type="tel" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTruckDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveTruck}>{editingTruckId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipment Dialog */}
      <Dialog open={shipDialog} onOpenChange={setShipDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Viagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Lote de Origem *</Label>
              <Select value={shipForm.batch_id} onValueChange={v => setShipForm(f => ({ ...f, batch_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {readyBatches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_code} — {b.ind_factories?.name} ({b.planned_quantity} un)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Caminhão *</Label>
              <Select value={shipForm.truck_id} onValueChange={v => setShipForm(f => ({ ...f, truck_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {activeTrucks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.plate} — {TRUCK_TYPES[t.truck_type]} ({t.capacity_kg.toLocaleString("pt-BR")} kg)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Planejada *</Label>
                <Input type="date" value={shipForm.planned_date} onChange={e => setShipForm(f => ({ ...f, planned_date: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Frete (R$)</Label>
                <Input type="number" step="0.01" value={shipForm.freight_value} onChange={e => setShipForm(f => ({ ...f, freight_value: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Quinzena</Label>
              <Select value={shipForm.period_id || "__none__"} onValueChange={v => setShipForm(f => ({ ...f, period_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShipDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveShipment}>Criar Viagem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shipment Detail Sheet */}
      <Sheet open={!!selectedShipment} onOpenChange={v => !v && setSelectedShipment(null)}>
        <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
          {selectedShipment && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{selectedShipment.shipment_number}</span>
                  <Badge variant="outline" className={cn("text-[10px]", SHIP_STATUS[selectedShipment.status]?.color)}>
                    {SHIP_STATUS[selectedShipment.status]?.label}
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Data Plan.:</span> <span className="font-medium text-foreground">{fmtDate(selectedShipment.planned_date)}</span></div>
                  <div><span className="text-muted-foreground">Data Real:</span> <span className="font-medium text-foreground">{fmtDate(selectedShipment.actual_date)}</span></div>
                  <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium text-foreground">{selectedShipment.ind_production_batches?.ind_factories?.name || "—"}</span></div>
                  <div><span className="text-muted-foreground">Lote:</span> <span className="font-medium text-foreground">{selectedShipment.ind_production_batches?.batch_code || "—"}</span></div>
                  <div><span className="text-muted-foreground">Caminhão:</span> <span className="font-medium text-foreground">{selectedShipment.truck_plate || "—"}</span></div>
                  <div><span className="text-muted-foreground">Motorista:</span> <span className="font-medium text-foreground">{selectedShipment.driver_name || "—"}</span></div>
                  <div><span className="text-muted-foreground">Frete:</span> <span className="font-bold text-foreground">{BRL.format(selectedShipment.freight_value)}</span></div>
                  {selectedShipment.received_by && <div><span className="text-muted-foreground">Recebido por:</span> <span className="font-medium text-foreground">{selectedShipment.received_by}</span></div>}
                </div>

                {/* Units */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Unidades ({shipmentUnits.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {shipmentUnits.map(u => (
                      <Badge key={u.id} variant="outline" className="text-[9px]">
                        {u.code || `#${u.unit_number}`}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  {SHIP_FLOW[selectedShipment.status] && (
                    <Button size="sm" className="w-full gap-1.5" onClick={() => advanceShipment(selectedShipment)}>
                      <ArrowRight className="h-3.5 w-3.5" />
                      {SHIP_FLOW[selectedShipment.status].label}
                    </Button>
                  )}
                  {selectedShipment.status === "in_transit" && (
                    <Button size="sm" variant="default" className="w-full gap-1.5" onClick={openDeliveryDialog}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar Entrega
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => printRomaneio(selectedShipment)}>
                    <FileText className="h-3.5 w-3.5" /> Romaneio
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delivery Dialog */}
      <Dialog open={deliveryDialog} onOpenChange={setDeliveryDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirmar Entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Data Real de Entrega</Label>
              <Input type="date" value={deliveryForm.actual_date} onChange={e => setDeliveryForm(f => ({ ...f, actual_date: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Recebido por</Label>
              <Input value={deliveryForm.received_by} onChange={e => setDeliveryForm(f => ({ ...f, received_by: e.target.value }))} className="h-8 text-xs" placeholder="Nome do conferente" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeliveryDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={confirmDelivery}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
