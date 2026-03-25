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
import { Factory, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Calendar, Wrench, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format, addWeeks, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FactoriesTabProps {
  companyId: string;
  contextId: string;
  contextType: "integrated" | "standalone";
}

interface IndFactory {
  id: string; company_id: string; name: string; cnpj: string | null;
  city: string | null; state: string | null; contact_name: string | null;
  contact_phone: string | null; contact_email: string | null;
  avg_lead_time_days: number; radius_km: number | null; notes: string | null;
  is_active: boolean; advance_payment_pct: number; payment_terms: string | null;
}

interface IndFactoryModel {
  id: string; factory_id: string; name: string; units_per_week: number;
  total_positions: number; ind_service_id: string | null; is_active: boolean;
}

interface IndPeriod {
  id: string; context_id: string; name: string; start_date: string;
  end_date: string; target_units: number; status: string;
}

interface IndService {
  id: string; context_id: string; name: string; category: string | null;
  display_order: number;
}

interface IndBatch {
  id: string; factory_id: string; planned_quantity: number;
  planned_start: string | null; planned_finish: string | null;
  status: string;
}

const EMPTY_FACTORY = {
  name: "", cnpj: "", city: "", state: "", contact_name: "", contact_phone: "",
  contact_email: "", avg_lead_time_days: 30, advance_payment_pct: 0,
  payment_terms: "", radius_km: 0, notes: "", is_active: true,
};

const EMPTY_MODEL = {
  name: "", units_per_week: 10, total_positions: 6, ind_service_id: "",
};

const EMPTY_PERIOD = {
  name: "", start_date: "", end_date: "", target_units: 0,
};

const EMPTY_SERVICE = { name: "", category: "", display_order: 0 };

export function FactoriesTabContent({ companyId, contextId, contextType }: FactoriesTabProps) {
  const [factories, setFactories] = useState<IndFactory[]>([]);
  const [models, setModels] = useState<IndFactoryModel[]>([]);
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [services, setServices] = useState<IndService[]>([]);
  const [batches, setBatches] = useState<IndBatch[]>([]);

  const [expandedFactory, setExpandedFactory] = useState<string | null>(null);

  // Dialog states
  const [factoryDialog, setFactoryDialog] = useState(false);
  const [factoryForm, setFactoryForm] = useState(EMPTY_FACTORY);
  const [editingFactoryId, setEditingFactoryId] = useState<string | null>(null);

  const [modelDialog, setModelDialog] = useState(false);
  const [modelForm, setModelForm] = useState(EMPTY_MODEL);
  const [modelFactoryId, setModelFactoryId] = useState<string | null>(null);

  const [periodDialog, setPeriodDialog] = useState(false);
  const [periodForm, setPeriodForm] = useState(EMPTY_PERIOD);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);

  const [serviceDialog, setServiceDialog] = useState(false);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const [fRes, mRes, pRes, sRes, bRes] = await Promise.all([
      supabase.from("ind_factories").select("*").eq("company_id", companyId).order("name"),
      supabase.from("ind_factory_models").select("*").eq("company_id", companyId).order("name"),
      supabase.from("ind_periods").select("*").eq("context_id", contextId).order("start_date"),
      supabase.from("ind_services").select("*").eq("context_id", contextId).order("display_order"),
      supabase.from("ind_production_batches").select("id, factory_id, planned_quantity, planned_start, planned_finish, status").eq("context_id", contextId),
    ]);
    setFactories((fRes.data || []) as IndFactory[]);
    setModels((mRes.data || []) as IndFactoryModel[]);
    setPeriods((pRes.data || []) as IndPeriod[]);
    setServices((sRes.data || []) as IndService[]);
    setBatches((bRes.data || []) as IndBatch[]);
  }, [companyId, contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Factory CRUD ───
  const openNewFactory = () => { setFactoryForm({ ...EMPTY_FACTORY }); setEditingFactoryId(null); setFactoryDialog(true); };
  const openEditFactory = (f: IndFactory) => {
    setFactoryForm({
      name: f.name, cnpj: f.cnpj || "", city: f.city || "", state: f.state || "",
      contact_name: f.contact_name || "", contact_phone: f.contact_phone || "",
      contact_email: f.contact_email || "", avg_lead_time_days: f.avg_lead_time_days,
      advance_payment_pct: f.advance_payment_pct, payment_terms: f.payment_terms || "",
      radius_km: f.radius_km || 0, notes: f.notes || "", is_active: f.is_active,
    });
    setEditingFactoryId(f.id);
    setFactoryDialog(true);
  };
  const saveFactory = async () => {
    if (!requireEdit()) return;
    if (!factoryForm.name.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = {
      ...factoryForm,
      company_id: companyId,
      cnpj: factoryForm.cnpj || null,
      city: factoryForm.city || null,
      state: factoryForm.state || null,
      contact_name: factoryForm.contact_name || null,
      contact_phone: factoryForm.contact_phone || null,
      contact_email: factoryForm.contact_email || null,
      payment_terms: factoryForm.payment_terms || null,
      radius_km: factoryForm.radius_km || null,
      notes: factoryForm.notes || null,
    };
    if (editingFactoryId) {
      const { error } = await supabase.from("ind_factories").update(payload as any).eq("id", editingFactoryId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Fábrica atualizada!");
    } else {
      const { error } = await supabase.from("ind_factories").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Fábrica criada!");
    }
    setFactoryDialog(false);
    fetchAll();
  };

  // ─── Model CRUD ───
  const openNewModel = (factoryId: string) => { setModelForm({ ...EMPTY_MODEL }); setModelFactoryId(factoryId); setModelDialog(true); };
  const saveModel = async () => {
    if (!requireEdit()) return;
    if (!modelForm.name.trim() || !modelFactoryId) { toast.error("Nome obrigatório"); return; }
    const { error } = await supabase.from("ind_factory_models").insert({
      factory_id: modelFactoryId,
      company_id: companyId,
      name: modelForm.name,
      units_per_week: modelForm.units_per_week,
      total_positions: modelForm.total_positions,
      ind_service_id: modelForm.ind_service_id || null,
      scope_id: null, macro_id: null,
    } as any);
    if (error) { toast.error("Erro ao criar modelo"); return; }
    toast.success("Modelo adicionado!");
    setModelDialog(false);
    fetchAll();
  };

  // ─── Period CRUD ───
  const openNewPeriod = () => { setPeriodForm({ ...EMPTY_PERIOD }); setEditingPeriodId(null); setPeriodDialog(true); };
  const openEditPeriod = (p: IndPeriod) => {
    setPeriodForm({ name: p.name, start_date: p.start_date, end_date: p.end_date, target_units: p.target_units });
    setEditingPeriodId(p.id);
    setPeriodDialog(true);
  };
  const savePeriod = async () => {
    if (!requireEdit()) return;
    if (!periodForm.name.trim() || !periodForm.start_date || !periodForm.end_date) { toast.error("Preencha todos os campos"); return; }
    const payload = { ...periodForm, context_id: contextId, company_id: companyId };
    if (editingPeriodId) {
      const { error } = await supabase.from("ind_periods").update(payload as any).eq("id", editingPeriodId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Período atualizado!");
    } else {
      const { error } = await supabase.from("ind_periods").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Período criado!");
    }
    setPeriodDialog(false);
    fetchAll();
  };

  // ─── Service CRUD ───
  const openNewService = () => { setServiceForm({ ...EMPTY_SERVICE }); setEditingServiceId(null); setServiceDialog(true); };
  const openEditService = (s: IndService) => {
    setServiceForm({ name: s.name, category: s.category || "", display_order: s.display_order });
    setEditingServiceId(s.id);
    setServiceDialog(true);
  };
  const saveService = async () => {
    if (!serviceForm.name.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = { ...serviceForm, context_id: contextId, company_id: companyId, category: serviceForm.category || null };
    if (editingServiceId) {
      const { error } = await supabase.from("ind_services").update(payload as any).eq("id", editingServiceId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Serviço atualizado!");
    } else {
      const { error } = await supabase.from("ind_services").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Serviço criado!");
    }
    setServiceDialog(false);
    fetchAll();
  };

  // ─── Delete handler ───
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    if (type === "period") {
      const linked = batches.filter(b => b.factory_id === id); // won't match but safe
      // Check via ind_period_id — but we don't have that in batches query. Allow delete, DB will SET NULL.
    }
    const table = type === "factory" ? "ind_factories" : type === "model" ? "ind_factory_models" : type === "period" ? "ind_periods" : "ind_services";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); setDeleteTarget(null); return; }
    toast.success("Excluído!");
    setDeleteTarget(null);
    fetchAll();
  };

  // ─── Heat Map Data ───
  const heatMapData = useMemo(() => {
    const activeFactories = factories.filter(f => f.is_active);
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addWeeks(today, i);
      const end = endOfWeek(start, { weekStartsOn: 1 });
      return { start, end, label: format(start, "dd/MM", { locale: ptBR }) };
    });

    return activeFactories.map(factory => {
      const factoryModels = models.filter(m => m.factory_id === factory.id && m.is_active);
      const weeklyCapacity = factoryModels.reduce((s, m) => s + m.units_per_week, 0);
      const factoryBatches = batches.filter(b => b.factory_id === factory.id && b.status !== "cancelled");

      const weekData = weeks.map(week => {
        const planned = factoryBatches
          .filter(b => {
            if (!b.planned_start || !b.planned_finish) return false;
            const bStart = new Date(b.planned_start + "T12:00:00");
            const bEnd = new Date(b.planned_finish + "T12:00:00");
            return bStart <= week.end && bEnd >= week.start;
          })
          .reduce((s, b) => s + b.planned_quantity, 0);
        const pct = weeklyCapacity > 0 ? Math.round((planned / weeklyCapacity) * 100) : 0;
        return { planned, pct };
      });

      return { factory, weeklyCapacity, weekData };
    });
  }, [factories, models, batches]);

  const heatMapWeeks = useMemo(() => {
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 8 }, (_, i) => {
      const start = addWeeks(today, i);
      return format(start, "dd/MM", { locale: ptBR });
    });
  }, []);

  const getHeatColor = (pct: number) => {
    if (pct === 0) return "bg-muted text-muted-foreground";
    if (pct < 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    if (pct <= 90) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  };

  // ─── Period batch stats ───
  const periodStats = useMemo(() => {
    const map = new Map<string, { planned: number; actual: number }>();
    // We'd need ind_period_id on batches — for now show 0
    periods.forEach(p => map.set(p.id, { planned: 0, actual: 0 }));
    return map;
  }, [periods, batches]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="empresas" className="w-full">
        <TabsList>
          <TabsTrigger value="empresas" className="gap-1.5">
            <Factory className="h-3.5 w-3.5" /> Empresas Fabris ({factories.length})
          </TabsTrigger>
          <TabsTrigger value="periodos" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Períodos ({periods.length})
          </TabsTrigger>
          <TabsTrigger value="servicos" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Serviços ({services.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ EMPRESAS FABRIS ═══ */}
        <TabsContent value="empresas" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewFactory} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova Fábrica
            </Button>
          </div>

          {factories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Factory className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhuma fábrica cadastrada.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {factories.map(f => {
                const fModels = models.filter(m => m.factory_id === f.id);
                const weeklyCapacity = fModels.filter(m => m.is_active).reduce((s, m) => s + m.units_per_week, 0);
                const isExpanded = expandedFactory === f.id;
                return (
                  <Card key={f.id} className={`transition-colors ${!f.is_active ? "opacity-60" : ""}`}>
                    <CardContent className="p-3">
                      <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => setExpandedFactory(isExpanded ? null : f.id)}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">{f.name}</span>
                            <Badge variant={f.is_active ? "default" : "secondary"} className="text-[10px]">
                              {f.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            {f.city && <span>{f.city}{f.state ? `/${f.state}` : ""}</span>}
                            <span>Cap: {weeklyCapacity} un/sem</span>
                            <span>Lead: {f.avg_lead_time_days}d</span>
                            {f.advance_payment_pct > 0 && <span>Entrada: {f.advance_payment_pct}%</span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditFactory(f); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: "factory", id: f.id, label: f.name }); }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Modelos de Produção</span>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openNewModel(f.id)}>
                              <Plus className="h-3 w-3" /> Novo Modelo
                            </Button>
                          </div>
                          {fModels.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">Nenhum modelo cadastrado.</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Modelo</TableHead>
                                  <TableHead className="text-xs text-right">Un/Sem</TableHead>
                                  <TableHead className="text-xs text-right">Posições</TableHead>
                                  <TableHead className="text-xs">Serviço</TableHead>
                                  <TableHead className="text-xs text-center">Status</TableHead>
                                  <TableHead className="text-xs w-12" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {fModels.map(m => (
                                  <TableRow key={m.id}>
                                    <TableCell className="text-xs font-medium">{m.name}</TableCell>
                                    <TableCell className="text-xs text-right">{m.units_per_week}</TableCell>
                                    <TableCell className="text-xs text-right">{m.total_positions}</TableCell>
                                    <TableCell className="text-xs">
                                      {services.find(s => s.id === m.ind_service_id)?.name || "—"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px]">
                                        {m.is_active ? "Ativo" : "Inativo"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "model", id: m.id, label: m.name })}>
                                        <Trash2 className="h-3 w-3 text-destructive" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ PERÍODOS ═══ */}
        <TabsContent value="periodos" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewPeriod} className="gap-1.5">
              <Plus className="h-4 w-4" /> Novo Período
            </Button>
          </div>

          {periods.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum período cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Início</TableHead>
                  <TableHead className="text-xs">Fim</TableHead>
                  <TableHead className="text-xs text-right">Meta</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.start_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.end_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{p.target_units} un</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">{p.status || "draft"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPeriod(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "period", id: p.id, label: p.name })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ═══ SERVIÇOS ═══ */}
        <TabsContent value="servicos" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewService} className="gap-1.5">
              <Plus className="h-4 w-4" /> Novo Serviço
            </Button>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum serviço cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ordem</TableHead>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{s.display_order}</TableCell>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.category || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditService(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "service", id: s.id, label: s.name })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ HEAT MAP — Capacidade Semanal ═══ */}
      {heatMapData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Capacidade Semanal — Próximas 8 Semanas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[120px]">Fábrica</TableHead>
                    <TableHead className="text-xs text-right min-w-[60px]">Cap/Sem</TableHead>
                    {heatMapWeeks.map(w => (
                      <TableHead key={w} className="text-xs text-center min-w-[60px]">{w}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heatMapData.map(row => (
                    <TableRow key={row.factory.id}>
                      <TableCell className="text-xs font-medium">{row.factory.name}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{row.weeklyCapacity}</TableCell>
                      {row.weekData.map((w, i) => (
                        <TableCell key={i} className="p-1 text-center">
                          <div className={`rounded px-1.5 py-1 text-[10px] font-medium ${getHeatColor(w.pct)}`}>
                            {w.pct > 0 ? `${w.pct}%` : "—"}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40" /> &lt;70%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/40" /> 70-90%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/40" /> &gt;90%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ DIALOGS ═══ */}

      {/* Factory Dialog */}
      <Dialog open={factoryDialog} onOpenChange={setFactoryDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFactoryId ? "Editar Fábrica" : "Nova Fábrica"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Nome *</Label><Input value={factoryForm.name} onChange={e => setFactoryForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">CNPJ</Label><Input value={factoryForm.cnpj} onChange={e => setFactoryForm(f => ({ ...f, cnpj: e.target.value }))} className="h-8 text-xs" /></div>
            <div className="flex items-center gap-2 pt-5"><Switch checked={factoryForm.is_active} onCheckedChange={v => setFactoryForm(f => ({ ...f, is_active: v }))} /><Label className="text-xs">Ativo</Label></div>
            <div><Label className="text-xs">Cidade</Label><Input value={factoryForm.city} onChange={e => setFactoryForm(f => ({ ...f, city: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Estado</Label><Input value={factoryForm.state} onChange={e => setFactoryForm(f => ({ ...f, state: e.target.value }))} className="h-8 text-xs" maxLength={2} /></div>
            <div><Label className="text-xs">Contato</Label><Input value={factoryForm.contact_name} onChange={e => setFactoryForm(f => ({ ...f, contact_name: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Telefone</Label><Input value={factoryForm.contact_phone} onChange={e => setFactoryForm(f => ({ ...f, contact_phone: e.target.value }))} className="h-8 text-xs" type="tel" /></div>
            <div className="col-span-2"><Label className="text-xs">E-mail</Label><Input value={factoryForm.contact_email} onChange={e => setFactoryForm(f => ({ ...f, contact_email: e.target.value }))} className="h-8 text-xs" type="email" /></div>
            <div><Label className="text-xs">Lead Time (dias)</Label><Input type="number" value={factoryForm.avg_lead_time_days} onChange={e => setFactoryForm(f => ({ ...f, avg_lead_time_days: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">% Entrada</Label><Input type="number" step="0.1" value={factoryForm.advance_payment_pct} onChange={e => setFactoryForm(f => ({ ...f, advance_payment_pct: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            <div className="col-span-2"><Label className="text-xs">Condições de Pagamento</Label><Input value={factoryForm.payment_terms} onChange={e => setFactoryForm(f => ({ ...f, payment_terms: e.target.value }))} className="h-8 text-xs" placeholder="Ex: 30/60/90 dias" /></div>
            <div><Label className="text-xs">Raio (km)</Label><Input type="number" value={factoryForm.radius_km} onChange={e => setFactoryForm(f => ({ ...f, radius_km: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            <div className="col-span-2"><Label className="text-xs">Observações</Label><Input value={factoryForm.notes} onChange={e => setFactoryForm(f => ({ ...f, notes: e.target.value }))} className="h-8 text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFactoryDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveFactory}>{editingFactoryId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Model Dialog */}
      <Dialog open={modelDialog} onOpenChange={setModelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Modelo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={modelForm.name} onChange={e => setModelForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Parede LSF 3m" /></div>
            <div><Label className="text-xs">Capacidade (un/semana)</Label><Input type="number" value={modelForm.units_per_week} onChange={e => setModelForm(f => ({ ...f, units_per_week: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Posições/Painéis</Label><Input type="number" value={modelForm.total_positions} onChange={e => setModelForm(f => ({ ...f, total_positions: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
            <div>
              <Label className="text-xs">Serviço</Label>
              <Select value={modelForm.ind_service_id} onValueChange={v => setModelForm(f => ({ ...f, ind_service_id: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModelDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveModel}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Dialog */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingPeriodId ? "Editar Período" : "Novo Período"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Quinzena 1 — Abril/2026" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Início</Label><Input type="date" value={periodForm.start_date} onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Fim</Label><Input type="date" value={periodForm.end_date} onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs" /></div>
            </div>
            <div><Label className="text-xs">Meta de Unidades</Label><Input type="number" value={periodForm.target_units} onChange={e => setPeriodForm(f => ({ ...f, target_units: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={savePeriod}>{editingPeriodId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Dialog */}
      <Dialog open={serviceDialog} onOpenChange={setServiceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingServiceId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Parede + Laje" /></div>
            <div><Label className="text-xs">Categoria</Label><Input value={serviceForm.category} onChange={e => setServiceForm(f => ({ ...f, category: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Estrutural" /></div>
            <div><Label className="text-xs">Ordem</Label><Input type="number" value={serviceForm.display_order} onChange={e => setServiceForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setServiceDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveService}>{editingServiceId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir "{deleteTarget?.label}"? Esta ação não pode ser desfeita.
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
