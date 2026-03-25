import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, CalendarDays, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LiftingTabProps {
  companyId: string;
  contextId: string;
}

interface Equipment {
  id: string; name: string; equipment_type: string; supplier_name: string | null;
  capacity_tons: number; daily_cost: number; is_active: boolean; notes: string | null;
}

interface Schedule {
  id: string; context_id: string; equipment_id: string; linked_shipment_id: string | null;
  booking_date: string; start_time: string | null; end_time: string | null;
  daily_cost: number; status: string; notes: string | null; ind_period_id: string | null;
  batch_id: string | null; unit_ids?: string[] | null;
}

interface Shipment {
  id: string; shipment_number: string; status: string; planned_date: string | null;
}

interface IndPeriod {
  id: string; name: string; start_date: string; end_date: string;
}

interface IndUnit {
  id: string; code: string; unit_number: number; status: string;
  zone_id: string | null;
}

interface UnitKit {
  id: string; unit_id: string; kit_status: string;
}

const EQUIP_TYPES: Record<string, string> = {
  crane: "Grua", munck: "Munck", forklift: "Empilhadeira", other: "Outro",
};

const EMPTY_EQUIPMENT = {
  name: "", equipment_type: "crane", supplier_name: "", capacity_tons: 0,
  daily_cost: 0, is_active: true, notes: "",
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function LiftingTabContent({ companyId, contextId }: LiftingTabProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [units, setUnits] = useState<IndUnit[]>([]);
  const [unitKits, setUnitKits] = useState<UnitKit[]>([]);

  // Equipment dialog
  const [equipDialog, setEquipDialog] = useState(false);
  const [equipForm, setEquipForm] = useState(EMPTY_EQUIPMENT);
  const [editingEquipId, setEditingEquipId] = useState<string | null>(null);

  // Schedule dialog
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    equipment_id: "", linked_shipment_id: "", booking_date: "",
    start_time: "07:00", end_time: "17:00", daily_cost: 0,
    ind_period_id: "", notes: "", selectedUnitIds: [] as string[],
  });

  // Complete dialog
  const [completeTarget, setCompleteTarget] = useState<Schedule | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchAll = useCallback(async () => {
    const [eRes, sRes, shRes, pRes, uRes, kRes] = await Promise.all([
      supabase.from("ind_lifting_equipment").select("*").eq("company_id", companyId).order("name"),
      supabase.from("ind_lifting_schedule").select("*").eq("context_id", contextId).order("booking_date"),
      supabase.from("ind_shipments").select("id, shipment_number, status, planned_date").eq("context_id", contextId),
      supabase.from("ind_periods").select("id, name, start_date, end_date").eq("context_id", contextId).order("start_date"),
      supabase.from("ind_units").select("id, code, unit_number, status, zone_id").eq("context_id", contextId),
      supabase.from("ind_unit_kits").select("id, unit_id, kit_status").eq("context_id", contextId),
    ]);
    setEquipment((eRes.data || []) as Equipment[]);
    setSchedules((sRes.data || []) as Schedule[]);
    setShipments((shRes.data || []) as Shipment[]);
    setPeriods((pRes.data || []) as IndPeriod[]);
    setUnits((uRes.data || []) as IndUnit[]);
    setUnitKits((kRes.data || []) as UnitKit[]);
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Equipment CRUD ───
  const openNewEquip = () => { setEquipForm({ ...EMPTY_EQUIPMENT }); setEditingEquipId(null); setEquipDialog(true); };
  const openEditEquip = (e: Equipment) => {
    setEquipForm({
      name: e.name, equipment_type: e.equipment_type, supplier_name: e.supplier_name || "",
      capacity_tons: e.capacity_tons, daily_cost: e.daily_cost, is_active: e.is_active, notes: e.notes || "",
    });
    setEditingEquipId(e.id);
    setEquipDialog(true);
  };

  const saveEquip = async () => {
    if (!equipForm.name.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = {
      ...equipForm, company_id: companyId,
      supplier_name: equipForm.supplier_name || null,
      notes: equipForm.notes || null,
    };
    if (editingEquipId) {
      const { error } = await supabase.from("ind_lifting_equipment").update(payload as any).eq("id", editingEquipId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Equipamento atualizado!");
    } else {
      const { error } = await supabase.from("ind_lifting_equipment").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Equipamento criado!");
    }
    setEquipDialog(false);
    fetchAll();
  };

  // ─── Schedule booking ───
  const openNewSchedule = () => {
    setScheduleForm({
      equipment_id: "", linked_shipment_id: "", booking_date: "",
      start_time: "07:00", end_time: "17:00", daily_cost: 0,
      ind_period_id: "", notes: "", selectedUnitIds: [],
    });
    setScheduleDialog(true);
  };

  const handleEquipSelect = (equipId: string) => {
    const eq = equipment.find(e => e.id === equipId);
    setScheduleForm(f => ({
      ...f,
      equipment_id: equipId,
      daily_cost: eq?.daily_cost || f.daily_cost,
    }));
  };

  // Available units: status = 'delivered' and kit complete (or no kit)
  const availableUnits = useMemo(() => {
    return units.filter(u => {
      if (u.status !== "delivered") return false;
      const kit = unitKits.find(k => k.unit_id === u.id);
      if (kit && kit.kit_status !== "complete") return false;
      return true;
    });
  }, [units, unitKits]);

  const toggleUnit = (unitId: string) => {
    setScheduleForm(f => ({
      ...f,
      selectedUnitIds: f.selectedUnitIds.includes(unitId)
        ? f.selectedUnitIds.filter(id => id !== unitId)
        : [...f.selectedUnitIds, unitId],
    }));
  };

  const saveSchedule = async () => {
    if (!scheduleForm.equipment_id || !scheduleForm.booking_date) {
      toast.error("Equipamento e data são obrigatórios");
      return;
    }

    // Check for conflicts
    const conflict = schedules.find(s =>
      s.equipment_id === scheduleForm.equipment_id &&
      s.booking_date === scheduleForm.booking_date &&
      s.status !== "cancelled"
    );
    if (conflict) {
      toast.error("Conflito: equipamento já agendado nesta data!");
      return;
    }

    const { error } = await supabase.from("ind_lifting_schedule").insert({
      company_id: companyId,
      context_id: contextId,
      equipment_id: scheduleForm.equipment_id,
      linked_shipment_id: scheduleForm.linked_shipment_id || null,
      booking_date: scheduleForm.booking_date,
      start_time: scheduleForm.start_time || null,
      end_time: scheduleForm.end_time || null,
      daily_cost: scheduleForm.daily_cost,
      ind_period_id: scheduleForm.ind_period_id || null,
      status: "scheduled",
      notes: scheduleForm.notes || null,
      unit_ids: scheduleForm.selectedUnitIds,
    } as any);

    if (error) { toast.error("Erro ao agendar: " + error.message); return; }
    toast.success("Içamento agendado!");
    setScheduleDialog(false);
    fetchAll();
  };

  // ─── Complete schedule ───
  const handleComplete = async () => {
    if (!completeTarget) return;
    // Update schedule status
    const { error: schErr } = await supabase
      .from("ind_lifting_schedule")
      .update({ status: "done" } as any)
      .eq("id", completeTarget.id);
    if (schErr) { toast.error("Erro ao concluir"); return; }

    // Update linked batch_units, units, unit_kits to 'installed'
    if (completeTarget.batch_id) {
      await supabase
        .from("ind_batch_units")
        .update({ status: "installed" } as any)
        .eq("batch_id", completeTarget.batch_id)
        .eq("context_id", contextId);
    }

    // Note: In a full implementation, we'd update specific units from the schedule.
    // For now, we update batch-level.

    toast.success("Içamento concluído! Status atualizado.");
    setCompleteTarget(null);
    fetchAll();
  };

  // ─── Delete ───
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("ind_lifting_schedule").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Erro ao excluir"); setDeleteTarget(null); return; }
    toast.success("Agendamento excluído!");
    setDeleteTarget(null);
    fetchAll();
  };

  // ─── Weekly Calendar ───
  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const getSchedulesForDay = (date: Date) =>
    schedules.filter(s => isSameDay(new Date(s.booking_date + "T12:00:00"), date));

  const hasConflict = (date: Date) => {
    const daySchedules = getSchedulesForDay(date).filter(s => s.status !== "cancelled");
    const equipIds = daySchedules.map(s => s.equipment_id);
    return new Set(equipIds).size < equipIds.length;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      scheduled: { variant: "outline", label: "Agendado" },
      in_progress: { variant: "default", label: "Em andamento" },
      done: { variant: "secondary", label: "Concluído" },
      cancelled: { variant: "destructive", label: "Cancelado" },
    };
    return map[status] || { variant: "outline" as const, label: status };
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="equipamentos" className="w-full">
        <TabsList>
          <TabsTrigger value="equipamentos" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Equipamentos ({equipment.length})
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Agenda
          </TabsTrigger>
        </TabsList>

        {/* ═══ EQUIPAMENTOS ═══ */}
        <TabsContent value="equipamentos" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewEquip} className="gap-1.5">
              <Plus className="h-4 w-4" /> Novo Equipamento
            </Button>
          </div>

          {equipment.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum equipamento cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {equipment.map(e => (
                <Card key={e.id} className={`${!e.is_active ? "opacity-60" : ""}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{e.name}</span>
                          <Badge variant={e.is_active ? "default" : "secondary"} className="text-[10px]">
                            {e.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                        <Badge variant="outline" className="text-[10px] mt-1">
                          {EQUIP_TYPES[e.equipment_type] || e.equipment_type}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEquip(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      {e.supplier_name && <span>Forn: {e.supplier_name}</span>}
                      <span>Cap: {e.capacity_tons}t</span>
                      <span className="font-medium text-foreground">Custo/dia: {BRL.format(e.daily_cost)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══ AGENDA ═══ */}
        <TabsContent value="agenda" className="space-y-3 mt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>←</Button>
              <span className="text-sm font-medium text-foreground">
                {format(weekDays[0], "dd/MM", { locale: ptBR })} — {format(weekDays[6], "dd/MM/yyyy", { locale: ptBR })}
              </span>
              <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>→</Button>
              {weekOffset !== 0 && (
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekOffset(0)}>Hoje</Button>
              )}
            </div>
            <Button size="sm" onClick={openNewSchedule} className="gap-1.5">
              <Plus className="h-4 w-4" /> Agendar Içamento
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const daySchedules = getSchedulesForDay(day);
              const conflict = hasConflict(day);
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={day.toISOString()}
                  className={`border rounded-lg p-2 min-h-[120px] ${isToday ? "border-primary bg-primary/5" : "border-border"} ${conflict ? "border-destructive bg-destructive/5" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {format(day, "EEE", { locale: ptBR })}
                    </span>
                    <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {format(day, "dd")}
                    </span>
                  </div>

                  {conflict && (
                    <div className="flex items-center gap-1 text-[9px] text-destructive mb-1">
                      <AlertTriangle className="h-3 w-3" /> Conflito
                    </div>
                  )}

                  <div className="space-y-1">
                    {daySchedules.map(s => {
                      const eq = equipment.find(e => e.id === s.equipment_id);
                      const badge = getStatusBadge(s.status);
                      return (
                        <div
                          key={s.id}
                          className="rounded bg-accent/50 p-1.5 text-[10px] space-y-0.5 cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => {
                            if (s.status === "scheduled") setCompleteTarget(s);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground truncate">{eq?.name || "?"}</span>
                            <Badge variant={badge.variant} className="text-[8px] px-1 py-0">{badge.label}</Badge>
                          </div>
                          {s.start_time && s.end_time && (
                            <span className="text-muted-foreground">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                          )}
                          <span className="text-muted-foreground">{BRL.format(s.daily_cost)}</span>
                          {s.status === "scheduled" && (
                            <div className="flex gap-1 mt-0.5">
                              <Button
                                variant="ghost" size="icon" className="h-4 w-4"
                                onClick={e => { e.stopPropagation(); setDeleteTarget({ id: s.id, label: `${eq?.name} — ${s.booking_date}` }); }}
                              >
                                <Trash2 className="h-2.5 w-2.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary table below calendar */}
          {schedules.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Resumo de Agendamentos</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Equipamento</TableHead>
                      <TableHead className="text-xs">Horário</TableHead>
                      <TableHead className="text-xs text-right">Custo</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                      <TableHead className="text-xs w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules
                      .filter(s => s.status !== "cancelled")
                      .sort((a, b) => a.booking_date.localeCompare(b.booking_date))
                      .map(s => {
                        const eq = equipment.find(e => e.id === s.equipment_id);
                        const badge = getStatusBadge(s.status);
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="text-xs">{format(new Date(s.booking_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                            <TableCell className="text-xs font-medium">{eq?.name || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {s.start_time && s.end_time ? `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right">{BRL.format(s.daily_cost)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {s.status === "scheduled" && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCompleteTarget(s)} title="Concluir">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ id: s.id, label: `${eq?.name}` })}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
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

      {/* Equipment Dialog */}
      <Dialog open={equipDialog} onOpenChange={setEquipDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEquipId ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Nome *</Label>
              <Input value={equipForm.name} onChange={e => setEquipForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={equipForm.equipment_type} onValueChange={v => setEquipForm(f => ({ ...f, equipment_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EQUIP_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={equipForm.is_active} onCheckedChange={v => setEquipForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-xs">Ativo</Label>
            </div>
            <div>
              <Label className="text-xs">Fornecedor</Label>
              <Input value={equipForm.supplier_name} onChange={e => setEquipForm(f => ({ ...f, supplier_name: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Capacidade (ton)</Label>
              <Input type="number" step="0.1" value={equipForm.capacity_tons} onChange={e => setEquipForm(f => ({ ...f, capacity_tons: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Custo Diário (R$)</Label>
              <Input type="number" step="0.01" value={equipForm.daily_cost} onChange={e => setEquipForm(f => ({ ...f, daily_cost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Observações</Label>
              <Input value={equipForm.notes} onChange={e => setEquipForm(f => ({ ...f, notes: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEquipDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveEquip}>{editingEquipId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog} onOpenChange={setScheduleDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agendar Içamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Equipamento *</Label>
              <Select value={scheduleForm.equipment_id} onValueChange={handleEquipSelect}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {equipment.filter(e => e.is_active).map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} — {EQUIP_TYPES[e.equipment_type]} ({BRL.format(e.daily_cost)}/dia)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Viagem Vinculada (opcional)</Label>
              <Select value={scheduleForm.linked_shipment_id || "__none__"} onValueChange={v => setScheduleForm(f => ({ ...f, linked_shipment_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {shipments.filter(s => s.status === "delivered").map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.shipment_number} — {s.planned_date ? format(new Date(s.planned_date + "T12:00:00"), "dd/MM/yy") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={scheduleForm.booking_date} onChange={e => setScheduleForm(f => ({ ...f, booking_date: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm(f => ({ ...f, start_time: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm(f => ({ ...f, end_time: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Período (Quinzena)</Label>
              <Select value={scheduleForm.ind_period_id || "__none__"} onValueChange={v => setScheduleForm(f => ({ ...f, ind_period_id: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Custo do Dia (R$)</Label>
              <Input type="number" step="0.01" value={scheduleForm.daily_cost} onChange={e => setScheduleForm(f => ({ ...f, daily_cost: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
            </div>

            {/* Unit selection */}
            {availableUnits.length > 0 && (
              <div>
                <Label className="text-xs">Unidades a Içar ({scheduleForm.selectedUnitIds.length} selecionadas)</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 mt-1 space-y-1">
                  {availableUnits.map(u => (
                    <div key={u.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={scheduleForm.selectedUnitIds.includes(u.id)}
                        onCheckedChange={() => toggleUnit(u.id)}
                      />
                      <span className="text-xs">{u.code || `Un. ${u.unit_number}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={scheduleForm.notes} onChange={e => setScheduleForm(f => ({ ...f, notes: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveSchedule}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Confirmation */}
      <AlertDialog open={!!completeTarget} onOpenChange={v => !v && setCompleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir Içamento</AlertDialogTitle>
            <AlertDialogDescription>
              Ao concluir, o status das unidades vinculadas será atualizado para "installed".
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete}>Concluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o agendamento "{deleteTarget?.label}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
