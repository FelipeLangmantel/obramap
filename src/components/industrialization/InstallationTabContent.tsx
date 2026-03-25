import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Wrench, Filter, CheckCircle2, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface InstallationTabProps {
  companyId: string;
  contextId: string;
  contextType: "integrated" | "standalone";
}

interface IndUnit {
  id: string; context_id: string; zone_id: string | null; code: string;
  unit_number: number; unit_type: string; status: string; notes: string | null;
}

interface IndZone {
  id: string; name: string; code: string | null; color: string | null; display_order: number;
}

interface BatchUnit {
  id: string; batch_id: string; unit_id: string | null; status: string;
}

interface Batch {
  id: string; factory_id: string; batch_code: string; status: string;
  planned_start: string | null; actual_start: string | null;
  planned_finish: string | null; actual_finish: string | null;
  macro_id: string | null; scope_id: string | null;
}

interface Factory {
  id: string; name: string;
}

interface Shipment {
  id: string; shipment_number: string; truck_plate: string | null;
  driver_name: string | null; planned_date: string | null; actual_date: string | null; status: string;
}

interface ShipmentUnit {
  id: string; shipment_id: string; unit_id: string | null; status: string;
}

interface LiftingSchedule {
  id: string; equipment_id: string; booking_date: string; status: string;
  linked_shipment_id: string | null; batch_id: string | null;
}

interface LiftingEquipment {
  id: string; name: string; equipment_type: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-muted text-muted-foreground" },
  planned: { label: "Planejado", color: "bg-muted text-muted-foreground" },
  in_production: { label: "Produzindo", color: "bg-amber-500/20 text-amber-700 border-amber-300" },
  ready: { label: "Pronto", color: "bg-amber-500/20 text-amber-700 border-amber-300" },
  awaiting_transport: { label: "Aguard. Transp.", color: "bg-orange-500/20 text-orange-700 border-orange-300" },
  in_transit: { label: "Em Trânsito", color: "bg-orange-500/20 text-orange-700 border-orange-300" },
  delivered: { label: "Entregue", color: "bg-blue-500/20 text-blue-700 border-blue-300" },
  installed: { label: "Instalado", color: "bg-emerald-500/20 text-emerald-700 border-emerald-300" },
  completed: { label: "Concluído", color: "bg-emerald-500/20 text-emerald-700 border-emerald-300" },
};

const CELL_BG: Record<string, string> = {
  pending: "bg-muted/60",
  planned: "bg-muted/60",
  in_production: "bg-amber-500/15",
  ready: "bg-amber-500/15",
  awaiting_transport: "bg-orange-500/15",
  in_transit: "bg-orange-500/15",
  delivered: "bg-blue-500/15",
  installed: "bg-emerald-500/15",
  completed: "bg-emerald-500/15",
};

export function InstallationTabContent({ companyId, contextId, contextType }: InstallationTabProps) {
  const { canEdit, requireEdit } = useAuth();
  const [units, setUnits] = useState<IndUnit[]>([]);
  const [zones, setZones] = useState<IndZone[]>([]);
  const [batchUnits, setBatchUnits] = useState<BatchUnit[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [shipmentUnits, setShipmentUnits] = useState<ShipmentUnit[]>([]);
  const [liftingSchedules, setLiftingSchedules] = useState<LiftingSchedule[]>([]);
  const [liftingEquipment, setLiftingEquipment] = useState<LiftingEquipment[]>([]);

  // Filters
  const [filterZone, setFilterZone] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFactory, setFilterFactory] = useState("all");

  // Detail drawer
  const [selectedUnit, setSelectedUnit] = useState<IndUnit | null>(null);

  // Assembly dialog
  const [assemblyDialog, setAssemblyDialog] = useState(false);
  const [assemblyForm, setAssemblyForm] = useState({
    selectedUnitIds: [] as string[],
    assembly_date: new Date().toISOString().slice(0, 10),
    team: "",
    notes: "",
  });

  const fetchAll = useCallback(async () => {
    const [uRes, zRes, buRes, bRes, fRes, sRes, suRes, lsRes, leRes] = await Promise.all([
      supabase.from("ind_units").select("*").eq("context_id", contextId).order("unit_number"),
      supabase.from("ind_zones").select("*").eq("context_id", contextId).order("display_order"),
      supabase.from("ind_batch_units").select("id,batch_id,unit_id,status").eq("context_id", contextId),
      supabase.from("ind_production_batches").select("id,factory_id,batch_code,status,planned_start,actual_start,planned_finish,actual_finish,macro_id,scope_id").eq("context_id", contextId),
      supabase.from("ind_factories").select("id,name").eq("company_id", companyId),
      supabase.from("ind_shipments").select("id,shipment_number,truck_plate,driver_name,planned_date,actual_date,status").eq("context_id", contextId),
      supabase.from("ind_shipment_units").select("id,shipment_id,unit_id,status").eq("context_id", contextId),
      supabase.from("ind_lifting_schedule").select("id,equipment_id,booking_date,status,linked_shipment_id,batch_id").eq("context_id", contextId),
      supabase.from("ind_lifting_equipment").select("id,name,equipment_type").eq("company_id", companyId),
    ]);
    setUnits((uRes.data || []) as IndUnit[]);
    setZones((zRes.data || []) as IndZone[]);
    setBatchUnits((buRes.data || []) as BatchUnit[]);
    setBatches((bRes.data || []) as Batch[]);
    setFactories((fRes.data || []) as Factory[]);
    setShipments((sRes.data || []) as Shipment[]);
    setShipmentUnits((suRes.data || []) as ShipmentUnit[]);
    setLiftingSchedules((lsRes.data || []) as LiftingSchedule[]);
    setLiftingEquipment((leRes.data || []) as LiftingEquipment[]);
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Helpers
  const getBatchForUnit = (unitId: string) => {
    const bu = batchUnits.find(b => b.unit_id === unitId);
    if (!bu) return null;
    return batches.find(b => b.id === bu.batch_id) || null;
  };

  const getFactoryForBatch = (batchId: string) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return null;
    return factories.find(f => f.id === batch.factory_id) || null;
  };

  const getShipmentForUnit = (unitId: string) => {
    const su = shipmentUnits.find(s => s.unit_id === unitId);
    if (!su) return null;
    return shipments.find(s => s.id === su.shipment_id) || null;
  };

  const getLiftingForUnit = (unitId: string) => {
    const bu = batchUnits.find(b => b.unit_id === unitId);
    if (!bu) return null;
    const ls = liftingSchedules.find(l => l.batch_id === bu.batch_id);
    if (!ls) return null;
    const eq = liftingEquipment.find(e => e.id === ls.equipment_id);
    return { schedule: ls, equipment: eq };
  };

  // Filter
  const filteredUnits = useMemo(() => {
    let result = [...units];
    if (filterZone !== "all") result = result.filter(u => u.zone_id === filterZone);
    if (filterStatus !== "all") result = result.filter(u => u.status === filterStatus);
    if (filterFactory !== "all") {
      const factoryBatchIds = batches.filter(b => b.factory_id === filterFactory).map(b => b.id);
      const unitIdsInFactory = batchUnits.filter(bu => factoryBatchIds.includes(bu.batch_id)).map(bu => bu.unit_id);
      result = result.filter(u => unitIdsInFactory.includes(u.id));
    }
    return result;
  }, [units, filterZone, filterStatus, filterFactory, batches, batchUnits]);

  // Group by zone
  const groupedByZone = useMemo(() => {
    const groups: { zone: IndZone | null; units: IndUnit[] }[] = [];
    const zoneMap = new Map<string, IndUnit[]>();
    const noZone: IndUnit[] = [];

    filteredUnits.forEach(u => {
      if (u.zone_id) {
        const arr = zoneMap.get(u.zone_id) || [];
        arr.push(u);
        zoneMap.set(u.zone_id, arr);
      } else {
        noZone.push(u);
      }
    });

    zones.forEach(z => {
      const zUnits = zoneMap.get(z.id);
      if (zUnits && zUnits.length > 0) groups.push({ zone: z, units: zUnits });
    });
    if (noZone.length > 0) groups.push({ zone: null, units: noZone });
    return groups;
  }, [filteredUnits, zones]);

  // Status summary
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    units.forEach(u => { counts[u.status] = (counts[u.status] || 0) + 1; });
    return counts;
  }, [units]);

  // Installable units (status = 'installed' from lifting, ready for assembly registration)
  const installableUnits = useMemo(() =>
    units.filter(u => u.status === "installed"),
  [units]);

  // Assembly
  const toggleAssemblyUnit = (unitId: string) => {
    setAssemblyForm(f => ({
      ...f,
      selectedUnitIds: f.selectedUnitIds.includes(unitId)
        ? f.selectedUnitIds.filter(id => id !== unitId)
        : [...f.selectedUnitIds, unitId],
    }));
  };

  const openAssemblyDialog = () => {
    setAssemblyForm({
      selectedUnitIds: [],
      assembly_date: new Date().toISOString().slice(0, 10),
      team: "",
      notes: "",
    });
    setAssemblyDialog(true);
  };

  const saveAssembly = async () => {
    if (!requireEdit()) return;
    if (assemblyForm.selectedUnitIds.length === 0) {
      toast.error("Selecione ao menos uma unidade");
      return;
    }

    try {
      // Update ind_units status
      const { error: unitErr } = await supabase
        .from("ind_units")
        .update({ status: "installed", notes: assemblyForm.notes || null } as any)
        .in("id", assemblyForm.selectedUnitIds);
      if (unitErr) throw unitErr;

      // Update ind_batch_units status
      const { error: buErr } = await supabase
        .from("ind_batch_units")
        .update({ status: "installed" } as any)
        .in("unit_id", assemblyForm.selectedUnitIds)
        .eq("context_id", contextId);
      if (buErr) throw buErr;

      // Sync to weekly_productions for integrated contexts
      if (contextType === 'integrated') {
        try {
          const { data: ctxData } = await supabase
            .from('ind_operation_contexts')
            .select('obramap_project_id')
            .eq('id', contextId).single();
          const projectId = ctxData?.obramap_project_id;

          const houseNumbers = units
            .filter(u => assemblyForm.selectedUnitIds.includes(u.id))
            .map(u => u.unit_number).filter(Boolean);

          const relatedBatches = batches.filter(b =>
            batchUnits.some(bu =>
              assemblyForm.selectedUnitIds.includes(bu.unit_id || '') &&
              bu.batch_id === b.id
            )
          );

          const today = new Date();
          const weekStart = new Date(today);
          const day = today.getDay();
          weekStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
          const weekStartStr = weekStart.toISOString().split('T')[0];

          for (const batch of relatedBatches) {
            if (!batch.macro_id || !batch.scope_id || !projectId) continue;
            await supabase.from('weekly_productions').insert({
              project_id: projectId,
              scope_id: batch.scope_id,
              macro_id: batch.macro_id,
              week_start: weekStartStr,
              house_ids: houseNumbers,
              quantity: houseNumbers.length,
              notes: assemblyForm.notes ||
                'Lancado automaticamente pelo modulo de industrializacao',
            } as any);
          }
        } catch (e) {
          console.error('Erro ao criar weekly_productions:', e);
        }
      }

      toast.success(`${assemblyForm.selectedUnitIds.length} unidades registradas como montadas!`);
      setAssemblyDialog(false);
      fetchAll();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Detail drawer data
  const unitDetail = useMemo(() => {
    if (!selectedUnit) return null;
    const batch = getBatchForUnit(selectedUnit.id);
    const factory = batch ? getFactoryForBatch(batch.id) : null;
    const shipment = getShipmentForUnit(selectedUnit.id);
    const lifting = getLiftingForUnit(selectedUnit.id);
    return { batch, factory, shipment, lifting };
  }, [selectedUnit, batchUnits, batches, factories, shipmentUnits, shipments, liftingSchedules, liftingEquipment]);

  const fmtDate = (d: string | null) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yy") : "—";

  return (
    <div className="space-y-4">
      {/* Status summary — compact card row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {Object.entries(statusCounts)
          .sort(([,a], [,b]) => b - a)
          .map(([status, count]) => {
            const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-muted text-muted-foreground" };
            const pct = units.length > 0 ? Math.round((count / units.length) * 100) : 0;
            return (
              <div key={status} className={cn("rounded-lg border px-3 py-2 text-center", CELL_BG[status] || "bg-muted/40")}>
                <div className="text-lg font-bold text-foreground">{count}</div>
                <div className="text-[10px] text-muted-foreground">{cfg.label} ({pct}%)</div>
              </div>
            );
          })}
        <div className="rounded-lg border px-3 py-2 text-center bg-card">
          <div className="text-lg font-bold text-foreground">{units.length}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
      </div>

      {/* Filters + Action */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterZone} onValueChange={setFilterZone}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Zona" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Zonas</SelectItem>
            {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFactory} onValueChange={setFilterFactory}>
          <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            {factories.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openAssemblyDialog} disabled={!canEdit || installableUnits.length === 0} className="gap-1.5 h-7 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5" /> Registrar Montagem ({installableUnits.length})
        </Button>
      </div>

      {/* Unit Grid */}
      {filteredUnits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhuma unidade encontrada.</p>
            <p className="text-xs mt-1">Cadastre unidades na aba Lotes ou ajuste os filtros.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groupedByZone.map(({ zone, units: zUnits }) => {
            const zInstalled = zUnits.filter(u => u.status === "installed" || u.status === "completed").length;
            const zPct = zUnits.length > 0 ? Math.round((zInstalled / zUnits.length) * 100) : 0;
            return (
            <Card key={zone?.id || "no-zone"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {zone?.color && (
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                  )}
                  <CardTitle className="text-sm">{zone?.name || "Sem Zona"}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{zUnits.length} un</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{zInstalled} instaladas · {zPct}%</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {zUnits.map(u => {
                    const cfg = STATUS_CONFIG[u.status] || { label: u.status, color: "" };
                    const cellBg = CELL_BG[u.status] || "bg-muted/60";
                    return (
                      <Tooltip key={u.id}>
                        <TooltipTrigger asChild>
                          <button
                            className={cn(
                              "rounded-md px-2 py-1.5 text-[10px] font-bold border transition-all hover:ring-2 hover:ring-primary/30",
                              cellBg, "text-foreground",
                            )}
                            onClick={() => setSelectedUnit(u)}
                          >
                            {u.code || `#${u.unit_number}`}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">
                          <p>{cfg.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}

      {/* Legend — simplified */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
        {[
          { key: "pending", label: "Pendente" },
          { key: "in_production", label: "Produzindo" },
          { key: "in_transit", label: "Em Trânsito" },
          { key: "delivered", label: "Entregue" },
          { key: "installed", label: "Instalado" },
        ].map(item => (
          <div key={item.key} className="flex items-center gap-1">
            <div className={cn("w-3 h-3 rounded", CELL_BG[item.key] || "bg-muted")} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ═══ Unit Detail Drawer ═══ */}
      <Sheet open={!!selectedUnit} onOpenChange={v => !v && setSelectedUnit(null)}>
        <SheetContent className="w-[360px] sm:w-[400px] overflow-y-auto">
          {selectedUnit && unitDetail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{selectedUnit.code || `Unidade #${selectedUnit.unit_number}`}</span>
                  <Badge variant="outline" className={cn("text-[10px]", STATUS_CONFIG[selectedUnit.status]?.color)}>
                    {STATUS_CONFIG[selectedUnit.status]?.label || selectedUnit.status}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {/* Timeline */}
                <div className="space-y-3">
                  {/* Batch / Factory */}
                  <TimelineStep
                    icon={<Package className="h-4 w-4" />}
                    title="Lote / Fábrica"
                    active={!!unitDetail.batch}
                    details={unitDetail.batch ? [
                      { label: "Lote", value: unitDetail.batch.batch_code },
                      { label: "Empresa", value: unitDetail.factory?.name || "—" },
                      { label: "Início Prod.", value: fmtDate(unitDetail.batch.actual_start || unitDetail.batch.planned_start) },
                      { label: "Fim Prod.", value: fmtDate(unitDetail.batch.actual_finish || unitDetail.batch.planned_finish) },
                      { label: "Status", value: unitDetail.batch.status },
                    ] : [{ label: "", value: "Sem lote vinculado" }]}
                  />

                  {/* Shipment */}
                  <TimelineStep
                    icon={<Truck className="h-4 w-4" />}
                    title="Transporte"
                    active={!!unitDetail.shipment}
                    details={unitDetail.shipment ? [
                      { label: "Viagem", value: unitDetail.shipment.shipment_number },
                      { label: "Caminhão", value: unitDetail.shipment.truck_plate || "—" },
                      { label: "Motorista", value: unitDetail.shipment.driver_name || "—" },
                      { label: "Data Entrega", value: fmtDate(unitDetail.shipment.actual_date || unitDetail.shipment.planned_date) },
                      { label: "Status", value: unitDetail.shipment.status },
                    ] : [{ label: "", value: "Sem viagem registrada" }]}
                  />

                  {/* Lifting */}
                  <TimelineStep
                    icon={<Wrench className="h-4 w-4" />}
                    title="Içamento"
                    active={!!unitDetail.lifting}
                    details={unitDetail.lifting ? [
                      { label: "Equipamento", value: unitDetail.lifting.equipment?.name || "—" },
                      { label: "Tipo", value: unitDetail.lifting.equipment?.equipment_type || "—" },
                      { label: "Data", value: fmtDate(unitDetail.lifting.schedule.booking_date) },
                      { label: "Status", value: unitDetail.lifting.schedule.status },
                    ] : [{ label: "", value: "Sem içamento agendado" }]}
                  />

                  {/* Installation */}
                  <TimelineStep
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    title="Montagem"
                    active={selectedUnit.status === "installed" || selectedUnit.status === "completed"}
                    details={[{
                      label: "Status",
                      value: selectedUnit.status === "installed" || selectedUnit.status === "completed"
                        ? "Montagem concluída" : "Pendente",
                    }]}
                  />
                </div>

                {selectedUnit.notes && (
                  <div className="text-xs text-muted-foreground border-t pt-3">
                    <span className="font-medium text-foreground">Obs: </span>{selectedUnit.notes}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ═══ Assembly Dialog ═══ */}
      <Dialog open={assemblyDialog} onOpenChange={setAssemblyDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Montagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Unidades Instaladas ({assemblyForm.selectedUnitIds.length} selecionadas)</Label>
              <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-1">
                {installableUnits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma unidade com status "instalado" disponível.</p>
                ) : (
                  installableUnits.map(u => (
                    <div key={u.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={assemblyForm.selectedUnitIds.includes(u.id)}
                        onCheckedChange={() => toggleAssemblyUnit(u.id)}
                      />
                      <span className="text-xs font-medium">{u.code || `#${u.unit_number}`}</span>
                      {u.zone_id && (
                        <span className="text-[10px] text-muted-foreground">
                          {zones.find(z => z.id === u.zone_id)?.name}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data de Montagem</Label>
                <Input
                  type="date"
                  value={assemblyForm.assembly_date}
                  onChange={e => setAssemblyForm(f => ({ ...f, assembly_date: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Equipe Responsável</Label>
                <Input
                  value={assemblyForm.team}
                  onChange={e => setAssemblyForm(f => ({ ...f, team: e.target.value }))}
                  className="h-8 text-xs"
                  placeholder="Ex: Equipe A"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                value={assemblyForm.notes}
                onChange={e => setAssemblyForm(f => ({ ...f, notes: e.target.value }))}
                className="text-xs min-h-[60px]"
                placeholder="Notas sobre a montagem..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssemblyDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveAssembly}>
              Confirmar ({assemblyForm.selectedUnitIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Timeline Step Component ───
function TimelineStep({
  icon,
  title,
  active,
  details,
}: {
  icon: React.ReactNode;
  title: string;
  active: boolean;
  details: { label: string; value: string }[];
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}>
          {icon}
        </div>
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="pb-4 flex-1">
        <p className={cn("text-xs font-semibold mb-1", active ? "text-foreground" : "text-muted-foreground")}>{title}</p>
        <div className="space-y-0.5">
          {details.map((d, i) => (
            <div key={i} className="flex gap-2 text-[11px]">
              {d.label && <span className="text-muted-foreground shrink-0">{d.label}:</span>}
              <span className="text-foreground font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
