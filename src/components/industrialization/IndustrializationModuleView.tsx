import { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Factory, Plus, ChevronLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FactoriesTabContent } from "./FactoriesTabContent";
import { LiftingTabContent } from "./LiftingTabContent";
import { OverviewTabContent } from "./OverviewTabContent";
import { InstallationTabContent } from "./InstallationTabContent";
import { BatchesTabContent } from "./BatchesTabContent";
import { LogisticsTabContent } from "./LogisticsTabContent";

interface OperationContext {
  id: string;
  company_id: string;
  context_type: "integrated" | "standalone";
  obramap_project_id: string | null;
  obras_portfolio_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  client_name: string | null;
  total_units: number;
  status: string;
  created_at: string;
}

interface ObraPortfolioItem {
  id: string;
  nome: string;
  total_houses: number;
  empresa: string | null;
  num_contrato: string | null;
  obramap_project_id: string | null;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function IndustrializationModuleView() {
  const { projects } = useConstruction();
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [view, setView] = useState<"dashboard" | "detail">("dashboard");
  const [activeContext, setActiveContext] = useState<OperationContext | null>(null);
  const [contexts, setContexts] = useState<OperationContext[]>([]);
  const [factories, setFactories] = useState<any[]>([]);
  const [factoryModels, setFactoryModels] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [obrasPortfolio, setObrasPortfolio] = useState<ObraPortfolioItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog
  const [newContextDialog, setNewContextDialog] = useState(false);
  const [newContextForm, setNewContextForm] = useState({
    name: "", total_units: 0,
    context_type: "standalone" as "standalone" | "integrated",
    obras_portfolio_id: "", obramap_project_id: "",
  });

  useEffect(() => {
    if (!companyId) return;
    fetchAll();
  }, [companyId]);

  const fetchAll = async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const [ctxRes, facRes, modRes, batRes, perRes, obrasRes] = await Promise.all([
        supabase.from("ind_operation_contexts").select("*").order("created_at"),
        supabase.from("ind_factories").select("id,name,is_active,advance_payment_pct,avg_lead_time_days").eq("company_id", companyId),
        supabase.from("ind_factory_models").select("id,factory_id,units_per_week,is_active").eq("company_id", companyId),
        supabase.from("ind_production_batches").select("id,context_id,factory_id,planned_quantity,actual_quantity,unit_value,status,planned_start,planned_finish,ind_period_id"),
        supabase.from("ind_periods").select("id,context_id,name,start_date,end_date,target_units").order("start_date"),
        supabase.from("obras_portfolio").select("id,nome,total_houses,empresa,num_contrato,obramap_project_id").eq("company_id", companyId).order("nome"),
      ]);
      setContexts((ctxRes.data || []) as OperationContext[]);
      setFactories(facRes.data || []);
      setFactoryModels(modRes.data || []);
      setBatches(batRes.data || []);
      setPeriods(perRes.data || []);
      setObrasPortfolio((obrasRes.data || []) as ObraPortfolioItem[]);
    } catch (err: any) {
      console.error("[Industrialization] fetchAll error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveNewContext = async () => {
    if (!newContextForm.name.trim() || !companyId) {
      toast.error("Nome obrigatório");
      return;
    }
    if (newContextForm.context_type === "integrated" && !newContextForm.obramap_project_id) {
      toast.error("Selecione o projeto ObraMap para modo integrado");
      return;
    }
    const { error } = await supabase.from("ind_operation_contexts").insert({
      company_id: companyId,
      context_type: newContextForm.context_type,
      name: newContextForm.name.trim(),
      total_units: newContextForm.total_units,
      obras_portfolio_id: newContextForm.obras_portfolio_id || null,
      obramap_project_id: newContextForm.obramap_project_id || null,
    }).select().single();
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Obra industrial criada!");
    setNewContextDialog(false);
    setNewContextForm({ name: "", total_units: 0, context_type: "standalone", obras_portfolio_id: "", obramap_project_id: "" });
    fetchAll();
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
      paused: "bg-amber-500/10 text-amber-600 border-amber-200",
      completed: "bg-blue-500/10 text-blue-600 border-blue-200",
      cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return map[status] || "";
  };

  // ── Computed data for dashboard ──
  const allPeriodsSorted = useMemo(() => {
    const uniqueIds = new Set<string>();
    return periods
      .filter(p => {
        const ctxIds = new Set(contexts.map(c => c.id));
        return ctxIds.has(p.context_id);
      })
      .sort((a: any, b: any) => a.start_date?.localeCompare(b.start_date))
      .filter(p => { if (uniqueIds.has(p.id)) return false; uniqueIds.add(p.id); return true; });
  }, [periods, contexts]);

  // Capacity heatmap data
  const capacityData = useMemo(() => {
    const activeFactories = factories.filter(f => f.is_active);
    const today = new Date();
    const weeks: { start: Date; end: Date; label: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const s = new Date(today);
      s.setDate(s.getDate() + i * 7 - today.getDay() + 1);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      weeks.push({ start: s, end: e, label: `${s.getDate()}/${s.getMonth() + 1}` });
    }
    return { activeFactories, weeks };
  }, [factories]);

  const getFactoryCapacity = (factoryId: string) => {
    return factoryModels
      .filter(m => m.factory_id === factoryId && m.is_active)
      .reduce((s: number, m: any) => s + (m.units_per_week || 0), 0);
  };

  const getWeekLoad = (factoryId: string, weekStart: Date, weekEnd: Date) => {
    return batches
      .filter(b => {
        if (b.factory_id !== factoryId) return false;
        if (!b.planned_start || !b.planned_finish) return false;
        const bs = new Date(b.planned_start);
        const bf = new Date(b.planned_finish);
        return bs <= weekEnd && bf >= weekStart;
      })
      .reduce((s: number, b: any) => s + (b.planned_quantity || 0), 0);
  };

  // Global alerts
  const alerts = useMemo(() => {
    const today = new Date();
    const items: { type: "danger" | "warning"; msg: string; contextId?: string }[] = [];
    // Late batches
    batches.forEach(b => {
      if (b.planned_finish && !["delivered", "installed", "cancelled"].includes(b.status)) {
        if (new Date(b.planned_finish) < today) {
          const ctx = contexts.find(c => c.id === b.context_id);
          items.push({ type: "danger", msg: `Lote atrasado em "${ctx?.name || "?"}" — previsto até ${new Date(b.planned_finish).toLocaleDateString("pt-BR")}`, contextId: b.context_id });
        }
      }
    });
    // Advance payments due
    batches.forEach(b => {
      if (!b.ind_period_id) return;
      const period = periods.find(p => p.id === b.ind_period_id);
      if (!period) return;
      const factory = factories.find(f => f.id === b.factory_id);
      if (!factory || !factory.advance_payment_pct) return;
      const dueDate = new Date(period.start_date);
      dueDate.setDate(dueDate.getDate() - (factory.avg_lead_time_days || 0));
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
      if (daysUntil > 0 && daysUntil <= 15) {
        const val = (b.planned_quantity || 0) * (b.unit_value || 0) * (factory.advance_payment_pct / 100);
        items.push({
          type: daysUntil <= 7 ? "danger" : "warning",
          msg: `Entrada de ${BRL.format(val)} vence em ${daysUntil} dias (${factory.name})`,
          contextId: b.context_id,
        });
      }
    });
    return items.slice(0, 5);
  }, [batches, periods, factories, contexts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // ════════════════════════ DETAIL VIEW ════════════════════════
  if (view === "detail" && activeContext && companyId) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <button
          onClick={() => setView("dashboard")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ChevronLeft className="h-4 w-4" /> Todas as Obras
        </button>

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Factory className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-foreground">{activeContext.name}</h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusColor(activeContext.status || "active")}>
                  {activeContext.context_type === "integrated" ? "Integrado" : "Standalone"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {activeContext.total_units} unidades
                </span>
              </div>
            </div>
          </div>

          {contexts.length > 1 && (
            <Select
              value={activeContext.id}
              onValueChange={id => {
                const c = contexts.find(x => x.id === id);
                if (c) setActiveContext(c);
              }}
            >
              <SelectTrigger className="h-8 text-xs w-52">
                <SelectValue placeholder="Selecionar contexto" />
              </SelectTrigger>
              <SelectContent>
                {contexts.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.context_type === "integrated" ? "Integrado" : "Standalone"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="factories">Fábricas</TabsTrigger>
            <TabsTrigger value="batches">Lotes</TabsTrigger>
            <TabsTrigger value="logistics">Logística</TabsTrigger>
            <TabsTrigger value="lifting">Içamento</TabsTrigger>
            <TabsTrigger value="installation">Montagem</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <OverviewTabContent
              companyId={companyId}
              contextId={activeContext.id}
              contextName={activeContext.name}
              contextType={activeContext.context_type}
              totalUnits={activeContext.total_units}
            />
          </TabsContent>
          <TabsContent value="factories" className="mt-4">
            <FactoriesTabContent companyId={companyId} contextId={activeContext.id} contextType={activeContext.context_type} />
          </TabsContent>
          <TabsContent value="batches" className="mt-4">
            <BatchesTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="logistics" className="mt-4">
            <LogisticsTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="lifting" className="mt-4">
            <LiftingTabContent companyId={companyId} contextId={activeContext.id} />
          </TabsContent>
          <TabsContent value="installation" className="mt-4">
            <InstallationTabContent companyId={companyId} contextId={activeContext.id} contextType={activeContext.context_type} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // ════════════════════════ DASHBOARD VIEW ════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Factory className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Industrialização & Logística</h1>
        </div>
        <Button size="sm" onClick={() => setNewContextDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Obra Industrial
        </Button>
      </div>

      {contexts.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Factory className="h-16 w-16 mx-auto text-muted-foreground/50" />
          <h2 className="text-2xl font-bold text-foreground">Nenhuma obra industrial cadastrada</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Gerencie o fluxo completo de componentes industrializados: fábrica → lote → transporte → içamento → montagem.
          </p>
          <Button onClick={() => setNewContextDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Obra Industrial
          </Button>
        </div>
      ) : (
        <>
          {/* ── Bloco 1: Multi-obra table ── */}
          <div className="rounded-lg border bg-card">
            <div className="p-3 border-b">
              <h3 className="text-sm font-semibold text-foreground">Obras Industriais</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs min-w-[160px]">Obra</TableHead>
                    <TableHead className="text-xs text-center w-16">Casas</TableHead>
                    <TableHead className="text-xs text-center w-20">Tipo</TableHead>
                    <TableHead className="text-xs min-w-[120px]">Fábricas</TableHead>
                    {allPeriodsSorted.map(p => (
                      <TableHead key={p.id} className="text-xs text-center min-w-[80px]">
                        {p.name?.length > 10 ? p.name.slice(0, 10) + "…" : p.name}
                      </TableHead>
                    ))}
                    <TableHead className="text-xs text-center w-20">Plan.</TableHead>
                    <TableHead className="text-xs text-right min-w-[100px]">Custo Total</TableHead>
                    <TableHead className="text-xs text-right min-w-[100px]">Entrada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contexts.map(ctx => {
                    const ctxBatches = batches.filter(b => b.context_id === ctx.id);
                    const ctxPeriods = periods.filter(p => p.context_id === ctx.id);
                    const linkedFactoryIds = [...new Set(ctxBatches.map(b => b.factory_id))];
                    const linkedFactoryNames = linkedFactoryIds.map(id => factories.find(f => f.id === id)?.name).filter(Boolean).join(", ");
                    const totalPlanned = ctxBatches.reduce((s, b) => s + (b.planned_quantity || 0), 0);
                    const totalCost = ctxBatches.reduce((s, b) => s + ((b.planned_quantity || 0) * (b.unit_value || 0)), 0);
                    const totalAdvance = ctxBatches.reduce((s, b) => {
                      const fac = factories.find(f => f.id === b.factory_id);
                      return s + ((b.planned_quantity || 0) * (b.unit_value || 0) * ((fac?.advance_payment_pct || 0) / 100));
                    }, 0);

                    return (
                      <TableRow
                        key={ctx.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setActiveContext(ctx); setView("detail"); }}
                      >
                        <TableCell className="text-xs font-medium">{ctx.name}</TableCell>
                        <TableCell className="text-xs text-center">{ctx.total_units}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px]">
                            {ctx.context_type === "integrated" ? "Integrado" : "Standalone"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{linkedFactoryNames || "—"}</TableCell>
                        {allPeriodsSorted.map(period => {
                          const periodBatches = ctxBatches.filter(b => b.ind_period_id === period.id);
                          const planned = periodBatches.reduce((s, b) => s + (b.planned_quantity || 0), 0);
                          const actual = periodBatches.reduce((s, b) => s + (b.actual_quantity || 0), 0);
                          const hasPeriod = ctxPeriods.some(p => p.id === period.id);
                          if (!hasPeriod) return <TableCell key={period.id} className="text-xs text-center text-muted-foreground/30">—</TableCell>;
                          const color = planned === 0
                            ? "text-muted-foreground"
                            : actual >= planned
                              ? "text-emerald-600"
                              : actual > 0
                                ? "text-amber-600"
                                : "text-muted-foreground";
                          return (
                            <TableCell key={period.id} className={`text-xs text-center font-medium ${color}`}>
                              {planned > 0 ? `${actual}/${planned}` : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-xs text-center font-medium">{totalPlanned}</TableCell>
                        <TableCell className="text-xs text-right">{totalCost > 0 ? BRL.format(totalCost) : "—"}</TableCell>
                        <TableCell className="text-xs text-right text-amber-600">{totalAdvance > 0 ? BRL.format(totalAdvance) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell className="text-xs">TOTAL</TableCell>
                    <TableCell className="text-xs text-center">{contexts.reduce((s, c) => s + c.total_units, 0)}</TableCell>
                    <TableCell />
                    <TableCell />
                    {allPeriodsSorted.map(period => {
                      const planned = batches.filter(b => b.ind_period_id === period.id).reduce((s, b) => s + (b.planned_quantity || 0), 0);
                      const actual = batches.filter(b => b.ind_period_id === period.id).reduce((s, b) => s + (b.actual_quantity || 0), 0);
                      return (
                        <TableCell key={period.id} className="text-xs text-center font-medium">
                          {planned > 0 ? `${actual}/${planned}` : "—"}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-center">{batches.reduce((s, b) => s + (b.planned_quantity || 0), 0)}</TableCell>
                    <TableCell className="text-xs text-right">{BRL.format(batches.reduce((s, b) => s + ((b.planned_quantity || 0) * (b.unit_value || 0)), 0))}</TableCell>
                    <TableCell className="text-xs text-right text-amber-600">
                      {BRL.format(batches.reduce((s, b) => {
                        const fac = factories.find(f => f.id === b.factory_id);
                        return s + ((b.planned_quantity || 0) * (b.unit_value || 0) * ((fac?.advance_payment_pct || 0) / 100));
                      }, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ── Bloco 2: Capacity heatmap ── */}
          {capacityData.activeFactories.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="p-3 border-b">
                <h3 className="text-sm font-semibold text-foreground">Capacidade Fábricas × Demanda Consolidada</h3>
              </div>
              <div className="overflow-x-auto p-3">
                <TooltipProvider>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs min-w-[120px]">Fábrica</TableHead>
                        {capacityData.weeks.map((w, i) => (
                          <TableHead key={i} className="text-xs text-center w-20">{w.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {capacityData.activeFactories.map(fac => {
                        const cap = getFactoryCapacity(fac.id);
                        return (
                          <TableRow key={fac.id}>
                            <TableCell className="text-xs font-medium">
                              {fac.name}
                              <span className="text-muted-foreground ml-1">({cap}/sem)</span>
                            </TableCell>
                            {capacityData.weeks.map((w, i) => {
                              const load = getWeekLoad(fac.id, w.start, w.end);
                              const pct = cap > 0 ? (load / cap) * 100 : 0;
                              const bg = pct === 0
                                ? "bg-muted/30"
                                : pct < 70
                                  ? "bg-emerald-500/20 text-emerald-700"
                                  : pct <= 90
                                    ? "bg-amber-500/20 text-amber-700"
                                    : "bg-destructive/20 text-destructive";
                              const ctxNames = [...new Set(batches
                                .filter(b => {
                                  if (b.factory_id !== fac.id || !b.planned_start || !b.planned_finish) return false;
                                  return new Date(b.planned_start) <= w.end && new Date(b.planned_finish) >= w.start;
                                })
                                .map(b => contexts.find(c => c.id === b.context_id)?.name)
                                .filter(Boolean)
                              )];
                              return (
                                <TableCell key={i} className="p-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={`rounded px-2 py-1 text-center text-xs font-medium ${bg}`}>
                                        {pct > 0 ? `${Math.round(pct)}%` : "—"}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{load} casas planejadas de {ctxNames.length} obra(s)</p>
                                      <p className="text-xs">{pct.toFixed(0)}% da capacidade ({cap}/sem)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
            </div>
          )}

          {/* ── Bloco 3: Global alerts ── */}
          {alerts.length > 0 && (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas
              </h3>
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-lg p-3 border-l-4 ${
                  a.type === 'danger'
                    ? 'bg-destructive/5 border-destructive text-destructive'
                    : 'bg-amber-500/5 border-amber-500 text-amber-700 dark:text-amber-400'
                }`}>
                  <AlertTriangle className='h-4 w-4 shrink-0 mt-0.5' />
                  <div className='flex-1 min-w-0'>
                    <p className='text-xs'>{a.msg}</p>
                  </div>
                  {a.contextId && (
                    <Button variant='ghost' size='sm' className='h-6 text-[10px] px-2 shrink-0'
                      onClick={() => {
                        const ctx = contexts.find(c => c.id === a.contextId);
                        if (ctx) { setActiveContext(ctx); setView('detail'); }
                      }}>
                      Ver obra →
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Dialog: Nova Obra Industrial ── */}
      <Dialog open={newContextDialog} onOpenChange={setNewContextDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Obra Industrial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select
                value={newContextForm.context_type}
                onValueChange={v => setNewContextForm(f => ({ ...f, context_type: v as any, obras_portfolio_id: "", obramap_project_id: "" }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone">Standalone — obra sem vínculo ObraMap</SelectItem>
                  <SelectItem value="integrated">Integrado — vinculado ao ObraMap</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Vincular à Holding (opcional)</Label>
              <Select
                value={newContextForm.obras_portfolio_id || "__none__"}
                onValueChange={v => {
                  const obra = obrasPortfolio.find(o => o.id === v);
                  setNewContextForm(f => ({
                    ...f,
                    obras_portfolio_id: v === "__none__" ? "" : v,
                    name: obra ? obra.nome : f.name,
                    total_units: obra?.total_houses || f.total_units,
                    obramap_project_id: obra?.obramap_project_id || f.obramap_project_id,
                  }));
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar obra da Holding..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {obrasPortfolio.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome} {o.total_houses ? `— ${o.total_houses} casas` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Ao selecionar, os campos abaixo são preenchidos automaticamente</p>
            </div>

            <div>
              <Label className="text-xs">Nome da Obra *</Label>
              <Input
                value={newContextForm.name}
                onChange={e => setNewContextForm(f => ({ ...f, name: e.target.value }))}
                className="h-8 text-xs"
                placeholder="Ex: El Dorado"
              />
            </div>

            <div>
              <Label className="text-xs">Total de Unidades</Label>
              <Input
                type="number"
                value={newContextForm.total_units}
                onChange={e => setNewContextForm(f => ({ ...f, total_units: parseInt(e.target.value) || 0 }))}
                className="h-8 text-xs"
              />
            </div>

            {newContextForm.context_type === "integrated" && (
              <div>
                <Label className="text-xs">Projeto ObraMap</Label>
                <Select
                  value={newContextForm.obramap_project_id || "__none__"}
                  onValueChange={v => setNewContextForm(f => ({ ...f, obramap_project_id: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar projeto..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {p.totalHouses} casas</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewContextDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveNewContext}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
