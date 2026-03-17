import { useState, useEffect, useMemo, useCallback } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Calendar, Home, Settings2, Save, RefreshCcw, Zap,
  AlertTriangle, CheckCircle2, Lock, Unlock, Undo2,
  MousePointerClick,
} from "lucide-react";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────
interface PeriodForWeekly {
  id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: string;
  name: string | null;
  weekly_plan_generated: boolean;
  weekly_plan_locked: boolean;
}

interface ServiceForPeriod {
  id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  target_houses: number;
}

interface WeekPlan {
  id: string | null;
  week_number: number;
  week_start: string;
  week_end: string;
  status: string;
  services: WeekServicePlan[];
}

interface WeekServicePlan {
  id: string | null;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  planned_house_ids: number[];
  planned_houses: number;
}

// ── Helpers ────────────────────────────────────────────────
function getMacroColor(macroId: string, macros: any[]): string {
  return macros?.find((m: any) => m.id === macroId)?.color || "#6b7280";
}

function svcKey(s: { macro_id: string; scope_id: string }) {
  return `${s.macro_id}:${s.scope_id}`;
}

function getHouseProgress(house: any, macroId: string, scopeId: string): number {
  const macro = house.macros?.find((m: any) => m.id === macroId);
  if (!macro) return 0;
  const scope = macro.scopes?.find((s: any) => s.id === scopeId);
  return scope?.progress || 0;
}

// ── House Cell in the Visual Grid ──────────────────────────
type HouseStatus = "done" | "in_progress" | "available" | "selected";

function HouseCell({
  houseId, status, weekAssigned, onClick, quadraName,
}: {
  houseId: number;
  status: HouseStatus;
  weekAssigned: number | null;
  onClick: () => void;
  quadraName?: string;
}) {
  const colorMap: Record<HouseStatus, string> = {
    done: "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-50",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-400/40 cursor-pointer hover:border-amber-500",
    available: "bg-card text-foreground border-border cursor-pointer hover:border-primary hover:bg-primary/5",
    selected: "bg-primary text-primary-foreground border-primary cursor-pointer ring-2 ring-primary/40 shadow-md",
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={status !== "done" ? onClick : undefined}
            className={`
              relative w-11 h-11 rounded-lg border-2 text-xs font-bold
              transition-all duration-150 flex flex-col items-center justify-center
              ${colorMap[status]}
            `}
          >
            <span>{houseId}</span>
            {weekAssigned && status !== "selected" && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {weekAssigned}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>Casa {houseId}{quadraName ? ` • ${quadraName}` : ""}</div>
          {status === "done" && <div className="text-muted-foreground">✓ Já concluído</div>}
          {status === "in_progress" && <div className="text-amber-600">Em andamento</div>}
          {weekAssigned && <div>Alocada → Semana {weekAssigned}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Week Slot Button ───────────────────────────────────────
function WeekSlot({
  week, count, isTarget, onClick, serviceColor,
}: {
  week: WeekPlan;
  count: number;
  isTarget: boolean;
  onClick: () => void;
  serviceColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all min-w-[100px]
        ${isTarget
          ? "border-primary bg-primary/10 shadow-md scale-105"
          : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
        }
      `}
    >
      <div className="text-xs font-semibold flex items-center gap-1">
        <Calendar className="h-3 w-3 text-primary" />
        Sem {week.week_number}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {format(parseISO(week.week_start), "dd/MM", { locale: ptBR })} – {format(parseISO(week.week_end), "dd/MM", { locale: ptBR })}
      </div>
      <div className="flex items-center gap-1 mt-0.5">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: serviceColor }} />
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          {count} casa{count !== 1 ? "s" : ""}
        </Badge>
      </div>
    </button>
  );
}

// ── Summary Column ─────────────────────────────────────────
function WeekSummaryColumn({
  week, onRemoveHouse,
}: {
  week: WeekPlan;
  onRemoveHouse: (weekNumber: number, serviceKey: string, houseId: number) => void;
}) {
  const totalHouses = week.services.reduce((s, svc) => s + svc.planned_house_ids.length, 0);
  const activeServices = week.services.filter(s => s.planned_house_ids.length > 0);

  return (
    <div className="flex flex-col rounded-xl border bg-card min-w-[200px] max-w-[240px]">
      <div className="px-3 py-2 border-b bg-muted/50 rounded-t-xl">
        <div className="font-semibold text-sm flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          Sem {week.week_number}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {format(parseISO(week.week_start), "dd/MM", { locale: ptBR })} – {format(parseISO(week.week_end), "dd/MM", { locale: ptBR })}
        </div>
        <Badge variant="outline" className="text-[10px] mt-1 gap-1">
          <Home className="h-2.5 w-2.5" /> {totalHouses} casa{totalHouses !== 1 ? "s" : ""}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-2 max-h-[300px]">
        <div className="space-y-2">
          {activeServices.map(svc => (
            <div key={svcKey(svc)} className="space-y-1">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: svc.macro_color }} />
                <span className="text-[11px] font-medium truncate">{svc.scope_name}</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {svc.planned_house_ids.map(hId => (
                  <TooltipProvider key={hId} delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onRemoveHouse(week.week_number, svcKey(svc), hId)}
                          className="w-7 h-7 rounded border text-[10px] font-bold bg-primary/10 text-primary border-primary/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                        >
                          {hId}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Clique para remover Casa {hId}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          ))}
          {activeServices.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma casa alocada</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ██ MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export function WeeklyPlanningFromPeriod() {
  const { currentProject } = useConstruction();
  const { company } = useAuth();
  const projectId = currentProject?.id;
  const companyId = company?.id;
  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];
  const quadras = currentProject?.quadras || [];

  const [periods, setPeriods] = useState<PeriodForWeekly[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState(6);
  const [periodServices, setPeriodServices] = useState<ServiceForPeriod[]>([]);
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Service-first flow state
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>("");
  const [selectedHouseIds, setSelectedHouseIds] = useState<Set<number>>(new Set());
  const [targetWeek, setTargetWeek] = useState<number | null>(null);

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);
  const selectedService = periodServices.find(s => `${s.macro_id}:${s.scope_id}` === selectedServiceKey);

  // Build quadra lookup
  const quadraMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const q of quadras) {
      for (const hId of q.houses) {
        map.set(hId, q.name);
      }
    }
    return map;
  }, [quadras]);

  // For the selected service, determine each house's status
  const houseStatusMap = useMemo(() => {
    if (!selectedService) return new Map<number, { status: HouseStatus; weekAssigned: number | null }>();

    const map = new Map<number, { status: HouseStatus; weekAssigned: number | null }>();
    const key = selectedServiceKey;

    // Get all available houses for this service
    const availableHouses = houses
      .filter(h => {
        const progress = getHouseProgress(h, selectedService.macro_id, selectedService.scope_id);
        return progress < 100;
      })
      .map(h => h.id);

    // Build assignment map from weekPlans
    const assignmentMap = new Map<number, number>();
    for (const week of weekPlans) {
      const ws = week.services.find(s => svcKey(s) === key);
      if (ws) {
        for (const hId of ws.planned_house_ids) {
          assignmentMap.set(hId, week.week_number);
        }
      }
    }

    for (const h of houses) {
      const progress = getHouseProgress(h, selectedService.macro_id, selectedService.scope_id);
      if (progress >= 100) {
        map.set(h.id, { status: "done", weekAssigned: null });
      } else if (selectedHouseIds.has(h.id)) {
        map.set(h.id, { status: "selected", weekAssigned: assignmentMap.get(h.id) || null });
      } else if (assignmentMap.has(h.id)) {
        map.set(h.id, { status: "in_progress", weekAssigned: assignmentMap.get(h.id)! });
      } else if (availableHouses.includes(h.id)) {
        map.set(h.id, { status: "available", weekAssigned: null });
      } else {
        map.set(h.id, { status: "done", weekAssigned: null });
      }
    }
    return map;
  }, [selectedService, selectedServiceKey, houses, weekPlans, selectedHouseIds]);

  // Houses organized by quadra for visual grid
  const housesGroupedByQuadra = useMemo(() => {
    const groups: { name: string; houseIds: number[] }[] = [];
    const assignedToQuadra = new Set<number>();

    for (const q of quadras) {
      const sorted = [...q.houses].sort((a, b) => a - b);
      groups.push({ name: q.name, houseIds: sorted });
      sorted.forEach(id => assignedToQuadra.add(id));
    }

    const unassigned = houses
      .map(h => h.id)
      .filter(id => !assignedToQuadra.has(id))
      .sort((a, b) => a - b);

    if (unassigned.length > 0) {
      groups.push({ name: "Sem Quadra", houseIds: unassigned });
    }
    return groups;
  }, [quadras, houses]);

  // Count allocated per service per week
  const serviceWeekCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const week of weekPlans) {
      for (const svc of week.services) {
        const k = `${svcKey(svc)}:${week.week_number}`;
        map.set(k, svc.planned_house_ids.length);
      }
    }
    return map;
  }, [weekPlans]);

  // ── Data Loading ────────────────────────────────────────
  useEffect(() => {
    if (!projectId || !companyId) return;
    (async () => {
      const { data } = await supabase
        .from("planning_periods")
        .select("id, period_number, start_date, end_date, status, name, weekly_plan_generated, weekly_plan_locked")
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .in("status", ["approved", "released_to_weekly", "executing", "closed"])
        .order("period_number");
      if (data) setPeriods(data as PeriodForWeekly[]);
    })();
  }, [projectId, companyId]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("weekly_plan_config")
        .select("working_days_per_week")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data) setWorkingDaysPerWeek(data.working_days_per_week);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!selectedPeriodId || !projectId) return;
    (async () => {
      const { data: svcs } = await supabase
        .from("service_planning_by_period")
        .select("id, macro_id, macro_name, scope_id, scope_name, target_houses")
        .eq("planning_period_id", selectedPeriodId)
        .eq("project_id", projectId);
      if (svcs) setPeriodServices(svcs);

      const { data: existingWeeks } = await supabase
        .from("weekly_plan_weeks")
        .select("id, week_number, week_start, week_end, status")
        .eq("planning_period_id", selectedPeriodId)
        .order("week_number");

      if (existingWeeks && existingWeeks.length > 0) {
        const weeksWithSvcs: WeekPlan[] = [];
        for (const w of existingWeeks) {
          const { data: ws } = await supabase
            .from("weekly_plan_services")
            .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, planned_house_ids, planned_houses")
            .eq("weekly_plan_week_id", w.id);
          weeksWithSvcs.push({ ...w, services: (ws || []) as WeekServicePlan[] });
        }
        setWeekPlans(weeksWithSvcs);
        setIsGenerated(true);
      } else {
        setWeekPlans([]);
        setIsGenerated(false);
      }
    })();
    setSelectedServiceKey("");
    setSelectedHouseIds(new Set());
    setTargetWeek(null);
  }, [selectedPeriodId, projectId]);

  // ── Generate Weeks ──────────────────────────────────────
  const generateWeeks = useCallback(() => {
    if (!selectedPeriod || periodServices.length === 0) return;
    const start = parseISO(selectedPeriod.start_date);
    const end = parseISO(selectedPeriod.end_date);
    const totalDays = differenceInDays(end, start) + 1;
    const numWeeks = Math.max(1, Math.ceil(totalDays / workingDaysPerWeek));

    const weeks: WeekPlan[] = [];
    for (let i = 0; i < numWeeks; i++) {
      const ws = addDays(start, i * workingDaysPerWeek);
      const we = i === numWeeks - 1 ? end : addDays(ws, workingDaysPerWeek - 1);

      // Empty services — user will assign manually
      const services: WeekServicePlan[] = periodServices.map(svc => ({
        id: null,
        macro_id: svc.macro_id,
        macro_name: svc.macro_name,
        macro_color: getMacroColor(svc.macro_id, macros),
        scope_id: svc.scope_id,
        scope_name: svc.scope_name,
        planned_house_ids: [],
        planned_houses: 0,
      }));

      weeks.push({
        id: null, week_number: i + 1,
        week_start: format(ws, "yyyy-MM-dd"),
        week_end: format(we, "yyyy-MM-dd"),
        status: "draft", services,
      });
    }

    setWeekPlans(weeks);
    setIsGenerated(true);
    toast.success(`${numWeeks} semana(s) criada(s). Selecione um serviço e comece a distribuir as casas.`);
  }, [selectedPeriod, periodServices, workingDaysPerWeek, macros]);

  // ── Auto-distribute ─────────────────────────────────────
  const autoDistribute = useCallback(() => {
    if (!weekPlans.length || !periodServices.length) return;
    const numWeeks = weekPlans.length;

    setWeekPlans(prev => {
      const newWeeks = prev.map(w => ({
        ...w,
        services: w.services.map(s => ({ ...s, planned_house_ids: [] as number[], planned_houses: 0 })),
      }));

      for (const svc of periodServices) {
        const key = `${svc.macro_id}:${svc.scope_id}`;
        const available = houses
          .filter(h => getHouseProgress(h, svc.macro_id, svc.scope_id) < 100)
          .map(h => h.id)
          .sort((a, b) => a - b)
          .slice(0, svc.target_houses);

        for (let i = 0; i < available.length; i++) {
          const weekIdx = i % numWeeks;
          const ws = newWeeks[weekIdx].services.find(s => svcKey(s) === key);
          if (ws) {
            ws.planned_house_ids.push(available[i]);
            ws.planned_houses = ws.planned_house_ids.length;
          }
        }
      }

      return newWeeks;
    });

    toast.success("Casas distribuídas automaticamente");
  }, [weekPlans.length, periodServices, houses]);

  // ── House click handler ─────────────────────────────────
  const toggleHouseSelection = useCallback((houseId: number) => {
    setSelectedHouseIds(prev => {
      const next = new Set(prev);
      if (next.has(houseId)) {
        next.delete(houseId);
      } else {
        next.add(houseId);
      }
      return next;
    });
  }, []);

  // ── Assign selected houses to week ──────────────────────
  const assignToWeek = useCallback((weekNumber: number) => {
    if (!selectedServiceKey || selectedHouseIds.size === 0) return;

    setWeekPlans(prev => prev.map(week => {
      // Remove from other weeks first
      const updated = {
        ...week,
        services: week.services.map(svc => {
          if (svcKey(svc) !== selectedServiceKey) return svc;
          const filtered = svc.planned_house_ids.filter(id => !selectedHouseIds.has(id));
          return { ...svc, planned_house_ids: filtered, planned_houses: filtered.length };
        }),
      };

      // Add to target week
      if (week.week_number === weekNumber) {
        return {
          ...updated,
          services: updated.services.map(svc => {
            if (svcKey(svc) !== selectedServiceKey) return svc;
            const ids = [...new Set([...svc.planned_house_ids, ...selectedHouseIds])].sort((a, b) => a - b);
            return { ...svc, planned_house_ids: ids, planned_houses: ids.length };
          }),
        };
      }
      return updated;
    }));

    toast.success(`${selectedHouseIds.size} casa(s) alocada(s) na Semana ${weekNumber}`);
    setSelectedHouseIds(new Set());
  }, [selectedServiceKey, selectedHouseIds]);

  // ── Remove house from week ──────────────────────────────
  const removeHouseFromWeek = useCallback((weekNumber: number, serviceKey: string, houseId: number) => {
    setWeekPlans(prev => prev.map(week => {
      if (week.week_number !== weekNumber) return week;
      return {
        ...week,
        services: week.services.map(svc => {
          if (svcKey(svc) !== serviceKey) return svc;
          const ids = svc.planned_house_ids.filter(id => id !== houseId);
          return { ...svc, planned_house_ids: ids, planned_houses: ids.length };
        }),
      };
    }));
  }, []);

  // ── Validation ──────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const svc of periodServices) {
      const key = `${svc.macro_id}:${svc.scope_id}`;
      const available = houses.filter(h => getHouseProgress(h, svc.macro_id, svc.scope_id) < 100).length;
      const expected = Math.min(svc.target_houses, available);
      const allocated = weekPlans.reduce((sum, w) => {
        const ws = w.services.find(s => svcKey(s) === key);
        return sum + (ws?.planned_house_ids.length || 0);
      }, 0);
      if (allocated < expected) {
        errors.push(`${svc.scope_name}: ${allocated}/${expected}`);
      }
    }
    return errors;
  }, [weekPlans, periodServices, houses]);

  // ── Save ────────────────────────────────────────────────
  const saveWeeklyPlan = async () => {
    if (!projectId || !companyId || !selectedPeriodId) return;
    setIsSaving(true);
    try {
      await supabase.from("weekly_plan_weeks").delete().eq("planning_period_id", selectedPeriodId);
      for (const week of weekPlans) {
        const { data: wd, error: we } = await supabase
          .from("weekly_plan_weeks")
          .insert({ planning_period_id: selectedPeriodId, project_id: projectId, company_id: companyId, week_number: week.week_number, week_start: week.week_start, week_end: week.week_end, status: week.status })
          .select("id").single();
        if (we || !wd) throw we;
        const rows = week.services.filter(s => s.planned_house_ids.length > 0).map(s => ({
          weekly_plan_week_id: wd.id, planning_period_id: selectedPeriodId, project_id: projectId, company_id: companyId,
          macro_id: s.macro_id, macro_name: s.macro_name, macro_color: s.macro_color,
          scope_id: s.scope_id, scope_name: s.scope_name,
          planned_house_ids: s.planned_house_ids, planned_houses: s.planned_house_ids.length,
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("weekly_plan_services").insert(rows);
          if (error) throw error;
        }
      }
      await supabase.from("planning_periods").update({ weekly_plan_generated: true, weekly_plan_locked: true }).eq("id", selectedPeriodId);
      toast.success("Planejamento semanal salvo!");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setIsSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!projectId || !companyId) return;
    await supabase.from("weekly_plan_config").upsert({ project_id: projectId, company_id: companyId, working_days_per_week: workingDaysPerWeek }, { onConflict: "project_id" });
    toast.success("Configuração salva");
    setConfigOpen(false);
  };

  // ── Render ──────────────────────────────────────────────
  if (!projectId) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Selecione um projeto para começar.</p>
      </Card>
    );
  }

  const currentServiceColor = selectedService
    ? getMacroColor(selectedService.macro_id, macros)
    : "#6b7280";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Planejamento Semanal
          </h2>
          <p className="text-sm text-muted-foreground">
            Selecione o serviço → clique nas casas → aloque na semana
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(!configOpen)}>
          <Settings2 className="h-4 w-4 mr-1" />
          {workingDaysPerWeek} dias/sem
        </Button>
      </div>

      {/* Config */}
      {configOpen && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label>Dias úteis por semana</Label>
                <Select value={String(workingDaysPerWeek)} onValueChange={v => setWorkingDaysPerWeek(Number(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 dias</SelectItem>
                    <SelectItem value="6">6 dias</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={saveConfig}>Salvar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="space-y-1 flex-1">
              <Label>Medição</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger><SelectValue placeholder="Escolha uma medição aprovada..." /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      Medição {p.period_number}{p.name ? ` – ${p.name}` : ""} ({format(parseISO(p.start_date), "dd/MM", { locale: ptBR })} – {format(parseISO(p.end_date), "dd/MM", { locale: ptBR })})
                      {p.weekly_plan_generated ? " ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 mt-5">
              {selectedPeriod && !isGenerated && periodServices.length > 0 && (
                <Button onClick={generateWeeks}>
                  <Zap className="h-4 w-4 mr-1" />
                  Criar Semanas
                </Button>
              )}
              {isGenerated && (
                <>
                  <Button variant="outline" size="sm" onClick={autoDistribute}>
                    <Zap className="h-4 w-4 mr-1" />
                    Auto-distribuir
                  </Button>
                  <Button variant="ghost" size="sm" onClick={generateWeeks}>
                    <RefreshCcw className="h-4 w-4 mr-1" />
                    Resetar
                  </Button>
                </>
              )}
            </div>
          </div>

          {selectedPeriod && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-muted-foreground">
              <span>{format(parseISO(selectedPeriod.start_date), "dd/MM/yyyy")} – {format(parseISO(selectedPeriod.end_date), "dd/MM/yyyy")}</span>
              <span className="text-border">|</span>
              <span>{differenceInDays(parseISO(selectedPeriod.end_date), parseISO(selectedPeriod.start_date)) + 1} dias</span>
              <span className="text-border">|</span>
              <span>{periodServices.length} serviço(s)</span>
              <span className="text-border">|</span>
              <Badge variant={selectedPeriod.weekly_plan_locked ? "secondary" : "default"} className="gap-1">
                {selectedPeriod.weekly_plan_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {selectedPeriod.status === "approved" ? "Aprovada" : selectedPeriod.status === "released_to_weekly" ? "Liberada" : selectedPeriod.status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SERVICE-FIRST FLOW ─────────────────────────── */}
      {isGenerated && (
        <div className="space-y-4">
          {/* Step 1: Select Service */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">1</span>
                Selecione o Serviço
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {periodServices.map(svc => {
                  const key = `${svc.macro_id}:${svc.scope_id}`;
                  const color = getMacroColor(svc.macro_id, macros);
                  const isActive = selectedServiceKey === key;
                  const allocated = weekPlans.reduce((sum, w) => {
                    const ws = w.services.find(s => svcKey(s) === key);
                    return sum + (ws?.planned_house_ids.length || 0);
                  }, 0);
                  const available = houses.filter(h => getHouseProgress(h, svc.macro_id, svc.scope_id) < 100).length;
                  const expected = Math.min(svc.target_houses, available);
                  const isComplete = allocated >= expected;

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedServiceKey(isActive ? "" : key);
                        setSelectedHouseIds(new Set());
                      }}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-all
                        ${isActive
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                        }
                        ${isComplete && !isActive ? "opacity-60" : ""}
                      `}
                    >
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-medium truncate max-w-[180px]">{svc.scope_name}</span>
                      <Badge
                        variant={isComplete ? "default" : "secondary"}
                        className="text-[10px] px-1.5 h-4 shrink-0"
                      >
                        {allocated}/{expected}
                      </Badge>
                      {isComplete && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Visual House Grid */}
          {selectedService && (
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">2</span>
                    Selecione as Casas
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentServiceColor }} />
                    <span className="font-normal text-muted-foreground">{selectedService.scope_name}</span>
                  </CardTitle>
                  {selectedHouseIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="gap-1">
                        <MousePointerClick className="h-3 w-3" />
                        {selectedHouseIds.size} selecionada(s)
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedHouseIds(new Set())}
                        className="h-7 text-xs"
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        Limpar
                      </Button>
                    </div>
                  )}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded border-2 bg-card border-border" /> Disponível
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded border-2 bg-primary border-primary" /> Selecionada
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded border-2 bg-amber-500/15 border-amber-400/40" /> Alocada
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded border-2 bg-muted border-muted opacity-50" /> Concluída
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <ScrollArea className="max-h-[280px]">
                  <div className="space-y-3">
                    {housesGroupedByQuadra.map(group => {
                      const relevantHouses = group.houseIds.filter(id => houseStatusMap.has(id));
                      if (relevantHouses.length === 0) return null;

                      return (
                        <div key={group.name}>
                          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                            {group.name}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {relevantHouses.map(hId => {
                              const info = houseStatusMap.get(hId)!;
                              return (
                                <HouseCell
                                  key={hId}
                                  houseId={hId}
                                  status={info.status}
                                  weekAssigned={info.weekAssigned}
                                  onClick={() => toggleHouseSelection(hId)}
                                  quadraName={quadraMap.get(hId)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Assign to Week */}
          {selectedService && selectedHouseIds.size > 0 && (
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">3</span>
                  Alocar {selectedHouseIds.size} casa(s) em qual semana?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <div className="flex flex-wrap gap-2">
                  {weekPlans.map(week => {
                    const count = serviceWeekCounts.get(`${selectedServiceKey}:${week.week_number}`) || 0;
                    return (
                      <WeekSlot
                        key={week.week_number}
                        week={week}
                        count={count}
                        isTarget={targetWeek === week.week_number}
                        onClick={() => assignToWeek(week.week_number)}
                        serviceColor={currentServiceColor}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary: Week columns */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Resumo por Semana</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-4">
              <ScrollArea className="w-full">
                <div className="flex gap-3 pb-2">
                  {weekPlans.map(week => (
                    <WeekSummaryColumn
                      key={week.week_number}
                      week={week}
                      allServices={periodServices}
                      onRemoveHouse={removeHouseFromWeek}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Save bar */}
          <div className="flex items-center justify-between sticky bottom-4 bg-card border rounded-lg p-3 shadow-lg z-10">
            <div className="flex items-center gap-2 text-sm">
              {validationErrors.length === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Todas as casas distribuídas</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>{validationErrors.length} serviço(s) pendente(s)</span>
                </>
              )}
            </div>
            <Button onClick={saveWeeklyPlan} disabled={isSaving || validationErrors.length > 0}>
              <Save className="h-4 w-4 mr-1" />
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      )}

      {/* Empty states */}
      {!selectedPeriodId && periods.length > 0 && (
        <Card className="p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Selecione uma medição aprovada</p>
        </Card>
      )}
      {periods.length === 0 && (
        <Card className="p-8 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhuma medição aprovada encontrada</p>
        </Card>
      )}
    </div>
  );
}
