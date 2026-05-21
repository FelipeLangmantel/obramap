import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePurchasePanel, PurchaseAlert } from "@/hooks/usePurchasePanel";
import { ALERT_STATUS_LABELS, ALERT_STATUS_COLORS } from "@/components/supplies/types";
import type { SupplyAlertStatus } from "@/components/supplies/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CurrentProjectHeaderBadge } from "@/components/CurrentProjectHeaderBadge";
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronDown,
  ShoppingCart, Truck, Clock, DollarSign, Building2,
  Package, Hammer, Wrench, Save,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday, isBefore, startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy") : "—";

const fmtShort = (d: string) => format(new Date(d), "dd/MM");

const statusBadge = (status: string) => {
  const label = ALERT_STATUS_LABELS[status as SupplyAlertStatus] || status;
  const color = ALERT_STATUS_COLORS[status as SupplyAlertStatus] || "bg-muted text-muted-foreground";
  return (
    <Badge className={`${color} text-[10px] px-1.5 py-0.5`}>
      {label}
    </Badge>
  );
};

const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-gray-500" },
  sent: { label: "Enviado", color: "bg-blue-500" },
  confirmed: { label: "Confirmado", color: "bg-purple-500" },
  in_transit: { label: "Em Trânsito", color: "bg-orange-500" },
  delivered: { label: "Entregue", color: "bg-green-500" },
  cancelled: { label: "Cancelado", color: "bg-red-500" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface CompanyFamily {
  id: string;
  name: string;
  color: string | null;
  lead_time_days: number;
  is_labor: boolean;
}

export default function PurchasePanelPage() {
  const navigate = useNavigate();
  const {
    isLoading, overdueCount, todayCount, inTransitCount,
    totalPendingValue, criticalAlerts, calendarMap,
    alertsByProject, orders,
  } = usePurchasePanel();

  const handleViewChange = (view: string) => {
    navigate("/?view=" + view);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar activeView={"purchase-panel" as any} onViewChange={handleViewChange as any} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3">
            <SidebarTrigger className="shrink-0" />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                Painel de Compras
              </h1>
              <p className="text-xs text-muted-foreground">Todas as obras da empresa</p>
            </div>
            <CurrentProjectHeaderBadge />
            <Badge variant="outline" className="text-sm font-mono">
              {brl(totalPendingValue)}
            </Badge>
          </header>

          {isLoading ? (
        <div className="p-4 space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="painel" className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-3 grid grid-cols-5 h-10">
            <TabsTrigger value="painel" className="text-xs">Painel</TabsTrigger>
            <TabsTrigger value="calendario" className="text-xs">Calendário</TabsTrigger>
            <TabsTrigger value="por-obra" className="text-xs">Por Obra</TabsTrigger>
            <TabsTrigger value="pedidos" className="text-xs">Pedidos</TabsTrigger>
            <TabsTrigger value="leadtime" className="text-xs gap-1">
              <Clock className="h-3.5 w-3.5" />
              Lead Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="painel" className="flex-1 overflow-auto p-4 space-y-6">
            <PanelTab
              overdueCount={overdueCount}
              todayCount={todayCount}
              inTransitCount={inTransitCount}
              totalPendingValue={totalPendingValue}
              criticalAlerts={criticalAlerts}
            />
          </TabsContent>

          <TabsContent value="calendario" className="flex-1 overflow-auto p-4">
            <CalendarTab calendarMap={calendarMap} />
          </TabsContent>

          <TabsContent value="por-obra" className="flex-1 overflow-auto p-4 space-y-3">
            <ByProjectTab alertsByProject={alertsByProject} />
          </TabsContent>

          <TabsContent value="pedidos" className="flex-1 overflow-auto p-4">
            <OrdersTab orders={orders} />
          </TabsContent>

          <TabsContent value="leadtime" className="flex-1 overflow-auto p-4">
            <LeadTimeTab />
          </TabsContent>
        </Tabs>
      )}
        </div>
      </div>
    </SidebarProvider>
  );
}

/* =============== TAB 1 — PAINEL =============== */
function PanelTab({
  overdueCount, todayCount, inTransitCount, totalPendingValue, criticalAlerts,
}: {
  overdueCount: number;
  todayCount: number;
  inTransitCount: number;
  totalPendingValue: number;
  criticalAlerts: PurchaseAlert[];
}) {
  const kpis = [
    { label: "Compras Atrasadas", value: overdueCount, color: "border-l-red-500", icon: AlertTriangle, textColor: "text-red-500" },
    { label: "Comprar Hoje", value: todayCount, color: "border-l-amber-500", icon: Clock, textColor: "text-amber-500" },
    { label: "Em Trânsito", value: inTransitCount, color: "border-l-blue-500", icon: Truck, textColor: "text-blue-500" },
    { label: "Valor Pendente", value: brl(totalPendingValue), color: "border-l-green-500", icon: DollarSign, textColor: "text-green-500" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className={`h-4 w-4 ${k.textColor}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Compras Críticas ({criticalAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {criticalAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">Nenhuma compra crítica no momento.</p>
          ) : (
            <div className="divide-y divide-border max-h-[400px] overflow-auto">
              {criticalAlerts.map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                  {a.scope_item_code && (
                    <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                      {a.scope_item_code}
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{a.scope_item_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.project_name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtShort(a.order_by_date)}
                  </span>
                  <span className="text-xs font-medium whitespace-nowrap">{brl(a.total_value)}</span>
                  {statusBadge(a.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/* =============== TAB 2 — CALENDÁRIO =============== */
function CalendarTab({ calendarMap }: { calendarMap: Map<string, PurchaseAlert[]> }) {
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const selectedAlerts = selectedDay ? calendarMap.get(selectedDay) || [] : [];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">
          {format(month, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const entries = calendarMap.get(key);
          const hasOverdue = entries?.some(
            (a) => !["delivered", "contracted"].includes(a.status) && isBefore(new Date(a.order_by_date), today)
          );
          const hasCritical = entries?.some((a) => a.is_critical);
          const dotColor = hasOverdue
            ? "bg-red-500"
            : hasCritical
            ? "bg-amber-500"
            : entries
            ? "bg-blue-500"
            : "";

          return (
            <button
              key={key}
              onClick={() => entries && setSelectedDay(key)}
              className={`
                flex flex-col items-center py-2 rounded-md text-xs transition-colors
                ${isToday(day) ? "bg-primary/10 font-bold" : ""}
                ${selectedDay === key ? "ring-2 ring-primary" : ""}
                ${entries ? "cursor-pointer hover:bg-accent" : "cursor-default text-muted-foreground"}
              `}
            >
              <span>{format(day, "d")}</span>
              {dotColor && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${dotColor}`} />}
            </button>
          );
        })}
      </div>

      <Sheet open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDay && format(new Date(selectedDay), "dd 'de' MMMM", { locale: ptBR })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedAlerts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    {a.scope_item_code && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {a.scope_item_code}
                      </Badge>
                    )}
                    <span className="font-medium truncate">{a.scope_item_name || "—"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.project_name}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span>Qtd: {a.total_quantity}</span>
                    <span>{brl(a.total_value)}</span>
                    {statusBadge(a.status)}
                  </div>
                </CardContent>
              </Card>
            ))}
            {selectedAlerts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum alerta neste dia.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* =============== TAB 3 — POR OBRA =============== */
function ByProjectTab({
  alertsByProject,
}: {
  alertsByProject: {
    projectId: string;
    projectName: string;
    alerts: PurchaseAlert[];
    pendingCount: number;
    pendingValue: number;
  }[];
}) {
  return (
    <>
      {alertsByProject.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum alerta encontrado.</p>
      ) : (
        alertsByProject.map((proj) => (
          <Collapsible key={proj.projectId}>
            <CollapsibleTrigger asChild>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{proj.projectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {proj.pendingCount} pendentes · {brl(proj.pendingValue)}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                </CardContent>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto mt-1 mb-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Insumo</TableHead>
                      <TableHead className="text-xs">Prazo</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proj.alerts.map((a) => (
                      <TableRow key={a.id} className="text-xs">
                        <TableCell className="font-mono">{a.scope_item_code || "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{a.scope_item_name || "—"}</TableCell>
                        <TableCell>{fmtShort(a.order_by_date)}</TableCell>
                        <TableCell className="text-right">{brl(a.total_value)}</TableCell>
                        <TableCell>{statusBadge(a.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))
      )}
    </>
  );
}

/* =============== TAB 4 — PEDIDOS =============== */
function OrdersTab({ orders }: { orders: ReturnType<typeof usePurchasePanel>["orders"] }) {
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const projectNames = useMemo(
    () => [...new Set(orders.map((o) => o.project_name))].sort(),
    [orders]
  );

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (filterProject !== "all" && o.project_name !== filterProject) return false;
        if (filterStatus !== "all" && o.status !== filterStatus) return false;
        return true;
      }),
    [orders, filterProject, filterStatus]
  );

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as obras</SelectItem>
            {projectNames.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(ORDER_STATUS_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nº Pedido</TableHead>
              <TableHead className="text-xs">Fornecedor</TableHead>
              <TableHead className="text-xs">Obra</TableHead>
              <TableHead className="text-xs text-right">Valor Total</TableHead>
              <TableHead className="text-xs">Prev. Entrega</TableHead>
              <TableHead className="text-xs">Entrega Real</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum pedido encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o) => {
                const st = ORDER_STATUS_MAP[o.status] || { label: o.status, color: "bg-gray-500" };
                return (
                  <TableRow key={o.id} className="text-xs">
                    <TableCell className="font-mono">{o.order_number || "—"}</TableCell>
                    <TableCell>{o.supplier_name || "—"}</TableCell>
                    <TableCell>{o.project_name}</TableCell>
                    <TableCell className="text-right">{brl(o.total_value)}</TableCell>
                    <TableCell>{fmtDate(o.expected_delivery_date)}</TableCell>
                    <TableCell>{fmtDate(o.actual_delivery_date)}</TableCell>
                    <TableCell>
                      <Badge className={`${st.color} text-white text-[10px] px-1.5 py-0.5`}>
                        {st.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/* =============== TAB 5 — LEAD TIME (COMPANY-WIDE) =============== */
function LeadTimeTab() {
  const { company, canEdit } = useAuth();
  const companyId = company?.id;

  const [families, setFamilies] = useState<CompanyFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingValues, setEditingValues] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadFamilies = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("material_families")
      .select("id, name, color, lead_time_days, is_labor")
      .eq("company_id", companyId)
      .order("display_order", { ascending: true });
    setFamilies(
      (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        lead_time_days: f.lead_time_days ?? 7,
        is_labor: f.is_labor ?? false,
      }))
    );
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  // Realtime: reload when material_families change
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`lead-time-families-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_families" }, () => loadFamilies())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, loadFamilies]);

  const handleSave = async (familyId: string) => {
    const newDays = editingValues[familyId];
    if (newDays === undefined) return;

    setSavingId(familyId);
    const { error } = await supabase
      .from("material_families")
      .update({ lead_time_days: newDays })
      .eq("id", familyId);

    if (error) {
      toast.error("Erro ao salvar lead time");
      console.error(error);
    } else {
      toast.success("Lead time atualizado — alertas recalculados automaticamente");
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[familyId];
        return next;
      });
      // Family list will update via realtime
    }
    setSavingId(null);
  };

  const getCurrentValue = (f: CompanyFamily) =>
    editingValues[f.id] !== undefined ? editingValues[f.id] : f.lead_time_days;

  const hasChange = (f: CompanyFamily) =>
    editingValues[f.id] !== undefined && editingValues[f.id] !== f.lead_time_days;

  const materialFamilies = families.filter((f) => !f.is_labor);
  const laborFamilies = families.filter((f) => f.is_labor);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const renderFamilyRow = (family: CompanyFamily) => {
    const currentLT = getCurrentValue(family);
    const changed = hasChange(family);

    return (
      <div key={family.id} className="flex items-center justify-between p-3 border border-border rounded-lg gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: family.color || "#9ca3af" }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground">{family.name}</span>
              {family.is_labor && (
                <Badge variant="outline" className="text-[10px] border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20">
                  <Wrench className="w-2.5 h-2.5 mr-0.5" />
                  Contratação
                </Badge>
              )}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
              {family.is_labor
                ? `Início Medição - ${currentLT} dias = data limite para contratar`
                : `Início Medição - ${currentLT} dias = data limite de compra`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentLT === 0 ? (
            <Badge variant="destructive" className="text-[10px]">Sem prazo</Badge>
          ) : currentLT < 5 ? (
            <Badge className="text-[10px] bg-amber-500 dark:bg-amber-600 text-white">Curto</Badge>
          ) : (
            <Badge className="text-[10px] bg-green-500 dark:bg-green-600 text-white">OK</Badge>
          )}
          {canEdit ? (
            <>
              <Input
                type="number"
                min={0}
                max={365}
                className="w-20 h-8"
                value={currentLT}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  setEditingValues((prev) => ({ ...prev, [family.id]: v }));
                }}
              />
              <span className="text-sm text-muted-foreground">dias</span>
              {changed && (
                <Button size="sm" className="h-8" onClick={() => handleSave(family.id)} disabled={savingId === family.id}>
                  {savingId === family.id ? (
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-medium w-20 text-right text-foreground">{currentLT}</span>
              <span className="text-sm text-muted-foreground">dias</span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
        <p className="text-sm text-foreground font-medium">⚡ Configuração global da empresa</p>
        <p className="text-xs text-muted-foreground mt-1">
          Ao alterar o lead time, todas as compras abertas dessa família serão recalculadas automaticamente em todas as obras.
        </p>
      </div>

      {/* Material Families */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-primary" />
            Lead Time de Materiais
          </CardTitle>
          <CardDescription>
            Prazo de antecedência para pedidos de compra de materiais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2">
              {materialFamilies.map(renderFamilyRow)}
              {materialFamilies.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma família de materiais cadastrada.
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Labor / Equipment Families */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Hammer className="w-5 h-5 text-primary" />
            Lead Time de Mão de Obra / Equipamentos
          </CardTitle>
          <CardDescription>
            Prazo de antecedência para contratação. Alertas são gerados quando uma medição se aproxima sem contrato vigente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2">
              {laborFamilies.map(renderFamilyRow)}
              {laborFamilies.length === 0 && (
                <p className="text-center text-muted-foreground py-8 space-y-1">
                  <span className="block">Nenhuma família de mão de obra/equipamento cadastrada.</span>
                  <span className="block text-xs">Crie famílias com tipo "Mão de Obra" no módulo de Suprimentos.</span>
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
