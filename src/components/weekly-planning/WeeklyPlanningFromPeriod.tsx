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
  Calendar, Home, Settings2, Save, RefreshCcw,
  AlertTriangle, CheckCircle2, Zap, GripVertical,
  ArrowRight, Lock, Unlock,
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

interface DragPayload {
  serviceKey: string;
  sourceWeek: number;
  houseId: number;
}

// ── Helpers ────────────────────────────────────────────────
function getMacroColor(macroId: string, macros: any[]): string {
  return macros?.find((m: any) => m.id === macroId)?.color || "#6b7280";
}

function buildAvailableHouseIds(
  targetHouses: number, macroId: string, scopeId: string, houses: any[]
): number[] {
  const available = houses
    .filter((h: any) => {
      const macro = h.macros?.find((m: any) => m.id === macroId);
      if (!macro) return true;
      const scope = macro.scopes?.find((s: any) => s.id === scopeId);
      return !scope || scope.progress < 100;
    })
    .map((h: any) => h.house_number)
    .sort((a: number, b: number) => a - b);
  return available.slice(0, targetHouses);
}

function serviceKey(svc: { macro_id: string; scope_id: string }) {
  return `${svc.macro_id}:${svc.scope_id}`;
}

// ── Draggable House Chip ───────────────────────────────────
function HouseChip({
  houseId, svcKey, weekNumber, onDragStart, isDragging, houseProgress,
}: {
  houseId: number;
  svcKey: string;
  weekNumber: number;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  isDragging: boolean;
  houseProgress: number;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            draggable
            onDragStart={(e) => onDragStart(e, { serviceKey: svcKey, sourceWeek: weekNumber, houseId })}
            className={`
              inline-flex items-center gap-0.5 px-2 py-1 rounded text-xs font-semibold
              border cursor-grab active:cursor-grabbing select-none transition-all
              ${isDragging ? "opacity-30 scale-95" : "hover:shadow-md hover:-translate-y-0.5"}
              ${houseProgress > 0 && houseProgress < 100
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                : "bg-primary/10 border-primary/20 text-primary"
              }
            `}
          >
            <GripVertical className="h-3 w-3 opacity-40 shrink-0" />
            {houseId}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Casa {houseId} — {houseProgress}% concluído
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Service Row inside a Week Column ───────────────────────
function ServiceRow({
  svc, weekNumber, onDragStart, dragPayload, houseProgressMap,
}: {
  svc: WeekServicePlan;
  weekNumber: number;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  dragPayload: DragPayload | null;
  houseProgressMap: Map<string, number>;
}) {
  if (svc.planned_house_ids.length === 0) return null;
  const key = serviceKey(svc);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: svc.macro_color }} />
        <span className="text-xs font-medium truncate flex-1">{svc.scope_name}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
          {svc.planned_house_ids.length}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {svc.planned_house_ids.map(hId => (
          <HouseChip
            key={hId}
            houseId={hId}
            svcKey={key}
            weekNumber={weekNumber}
            onDragStart={onDragStart}
            isDragging={
              !!dragPayload &&
              dragPayload.serviceKey === key &&
              dragPayload.sourceWeek === weekNumber &&
              dragPayload.houseId === hId
            }
            houseProgress={houseProgressMap.get(`${key}:${hId}`) || 0}
          />
        ))}
      </div>
    </div>
  );
}

// ── Week Column ────────────────────────────────────────────
function WeekColumn({
  week, onDragStart, onDrop, dragPayload, houseProgressMap, totalWeeks,
}: {
  week: WeekPlan;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  onDrop: (weekNumber: number) => void;
  dragPayload: DragPayload | null;
  houseProgressMap: Map<string, number>;
  totalWeeks: number;
}) {
  const [isOver, setIsOver] = useState(false);
  const totalHouses = week.services.reduce((s, svc) => s + svc.planned_house_ids.length, 0);
  const isDropTarget = !!dragPayload && dragPayload.sourceWeek !== week.week_number;

  return (
    <div
      className={`
        flex flex-col rounded-xl border-2 transition-all duration-200
        ${totalWeeks <= 3 ? "min-w-[280px] w-[320px]" : "min-w-[240px] w-[260px]"}
        ${isOver && isDropTarget
          ? "border-primary bg-primary/5 shadow-lg scale-[1.01]"
          : isDropTarget
            ? "border-primary/30 border-dashed"
            : "border-border bg-card"
        }
      `}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsOver(false); onDrop(week.week_number); }}
    >
      {/* Column Header */}
      <div className="px-3 py-2.5 border-b bg-muted/50 rounded-t-xl flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            Sem {week.week_number}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {format(parseISO(week.week_start), "dd/MM", { locale: ptBR })} – {format(parseISO(week.week_end), "dd/MM", { locale: ptBR })}
          </div>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <Home className="h-3 w-3" />
          {totalHouses}
        </Badge>
      </div>

      {/* Column Body */}
      <ScrollArea className="flex-1 p-2.5 max-h-[60vh]">
        <div className="space-y-3">
          {week.services.filter(s => s.planned_house_ids.length > 0).map(svc => (
            <ServiceRow
              key={serviceKey(svc)}
              svc={svc}
              weekNumber={week.week_number}
              onDragStart={onDragStart}
              dragPayload={dragPayload}
              houseProgressMap={houseProgressMap}
            />
          ))}

          {totalHouses === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowRight className="h-5 w-5 mx-auto mb-1 opacity-40" />
              <p className="text-xs">Arraste casas para cá</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Unassigned Pool ────────────────────────────────────────
function UnassignedPool({
  services, weekPlans, allHouseIds, onDragStart, dragPayload, houseProgressMap,
}: {
  services: ServiceForPeriod[];
  weekPlans: WeekPlan[];
  allHouseIds: Map<string, number[]>;
  onDragStart: (e: React.DragEvent, payload: DragPayload) => void;
  dragPayload: DragPayload | null;
  houseProgressMap: Map<string, number>;
}) {
  const unassigned = useMemo(() => {
    const result: { key: string; scopeName: string; macroName: string; macroColor: string; houseIds: number[] }[] = [];
    for (const svc of services) {
      const key = `${svc.macro_id}:${svc.scope_id}`;
      const all = allHouseIds.get(key) || [];
      const assigned = new Set<number>();
      for (const week of weekPlans) {
        const ws = week.services.find(s => serviceKey(s) === key);
        ws?.planned_house_ids.forEach(id => assigned.add(id));
      }
      const remaining = all.filter(id => !assigned.has(id));
      if (remaining.length > 0) {
        const wSvc = weekPlans[0]?.services.find(s => serviceKey(s) === key);
        result.push({
          key,
          scopeName: svc.scope_name,
          macroName: svc.macro_name,
          macroColor: wSvc?.macro_color || "#6b7280",
          houseIds: remaining,
        });
      }
    }
    return result;
  }, [services, weekPlans, allHouseIds]);

  if (unassigned.length === 0) return null;

  const totalUnassigned = unassigned.reduce((s, u) => s + u.houseIds.length, 0);

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="py-2.5 px-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Casas não alocadas
          <Badge variant="destructive" className="text-xs">{totalUnassigned}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="space-y-2">
          {unassigned.map(u => (
            <div key={u.key} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: u.macroColor }} />
                <span className="text-xs font-medium">{u.scopeName}</span>
                <span className="text-[10px] text-muted-foreground">({u.macroName})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.houseIds.map(hId => (
                  <HouseChip
                    key={hId}
                    houseId={hId}
                    svcKey={u.key}
                    weekNumber={0}
                    onDragStart={onDragStart}
                    isDragging={
                      !!dragPayload &&
                      dragPayload.serviceKey === u.key &&
                      dragPayload.sourceWeek === 0 &&
                      dragPayload.houseId === hId
                    }
                    houseProgress={houseProgressMap.get(`${u.key}:${hId}`) || 0}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────
export function WeeklyPlanningFromPeriod() {
  const { currentProject } = useConstruction();
  const { company } = useAuth();
  const projectId = currentProject?.id;
  const companyId = company?.id;
  const macros = currentProject?.macrosTemplate || [];
  const houses = currentProject?.houses || [];

  const [periods, setPeriods] = useState<PeriodForWeekly[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState(6);
  const [periodServices, setPeriodServices] = useState<ServiceForPeriod[]>([]);
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  // House progress map: "macroId:scopeId:houseNumber" → progress%
  const houseProgressMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of houses) {
      for (const m of (h.macros || []) as any[]) {
        for (const s of (m.scopes || []) as any[]) {
          map.set(`${m.id}:${s.id}:${(h as any).id ?? (h as any).house_number}`, s.progress || 0);
        }
      }
    }
    return map;
  }, [houses]);

  // All expected house IDs per service
  const allHouseIdsMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const svc of periodServices) {
      const key = `${svc.macro_id}:${svc.scope_id}`;
      map.set(key, buildAvailableHouseIds(svc.target_houses, svc.macro_id, svc.scope_id, houses));
    }
    return map;
  }, [periodServices, houses]);

  // Load periods
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

  // Load config
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

  // Load period services + existing plan
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
  }, [selectedPeriodId, projectId]);

  // Generate weeks
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

      const services: WeekServicePlan[] = periodServices.map(svc => {
        const key = `${svc.macro_id}:${svc.scope_id}`;
        const allIds = allHouseIdsMap.get(key) || [];
        const total = allIds.length;
        const perWeek = Math.floor(total / numWeeks);
        const remainder = total % numWeeks;
        const startIdx = i * perWeek + Math.min(i, remainder);
        const count = perWeek + (i < remainder ? 1 : 0);

        return {
          id: null,
          macro_id: svc.macro_id,
          macro_name: svc.macro_name,
          macro_color: getMacroColor(svc.macro_id, macros),
          scope_id: svc.scope_id,
          scope_name: svc.scope_name,
          planned_house_ids: allIds.slice(startIdx, startIdx + count),
          planned_houses: count,
        };
      });

      weeks.push({
        id: null, week_number: i + 1,
        week_start: format(ws, "yyyy-MM-dd"),
        week_end: format(we, "yyyy-MM-dd"),
        status: "draft", services,
      });
    }

    setWeekPlans(weeks);
    setIsGenerated(true);
    toast.success(`${numWeeks} semana(s) gerada(s) automaticamente`);
  }, [selectedPeriod, periodServices, workingDaysPerWeek, allHouseIdsMap, macros]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, payload: DragPayload) => {
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDrop = useCallback((targetWeek: number) => {
    if (!dragPayload || dragPayload.sourceWeek === targetWeek) {
      setDragPayload(null);
      return;
    }

    setWeekPlans(prev => prev.map(week => {
      if (week.week_number === dragPayload.sourceWeek) {
        return {
          ...week,
          services: week.services.map(svc =>
            serviceKey(svc) === dragPayload.serviceKey
              ? { ...svc, planned_house_ids: svc.planned_house_ids.filter(id => id !== dragPayload.houseId), planned_houses: svc.planned_house_ids.filter(id => id !== dragPayload.houseId).length }
              : svc
          ),
        };
      }
      if (week.week_number === targetWeek) {
        return {
          ...week,
          services: week.services.map(svc => {
            if (serviceKey(svc) === dragPayload.serviceKey) {
              if (svc.planned_house_ids.includes(dragPayload.houseId)) return svc;
              const ids = [...svc.planned_house_ids, dragPayload.houseId].sort((a, b) => a - b);
              return { ...svc, planned_house_ids: ids, planned_houses: ids.length };
            }
            return svc;
          }),
        };
      }
      return week;
    }));
    setDragPayload(null);
  }, [dragPayload]);

  // End drag on document
  useEffect(() => {
    const handler = () => setDragPayload(null);
    document.addEventListener("dragend", handler);
    return () => document.removeEventListener("dragend", handler);
  }, []);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const svc of periodServices) {
      const key = `${svc.macro_id}:${svc.scope_id}`;
      const expected = allHouseIdsMap.get(key) || [];
      const allocated = weekPlans.reduce((sum, w) => {
        const ws = w.services.find(s => serviceKey(s) === key);
        return sum + (ws?.planned_house_ids.length || 0);
      }, 0);
      if (allocated !== expected.length) {
        errors.push(`${svc.scope_name}: ${allocated}/${expected.length}`);
      }
    }
    return errors;
  }, [weekPlans, periodServices, allHouseIdsMap]);

  // Save
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

  if (!projectId) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Selecione um projeto para começar.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Planejamento Semanal
          </h2>
          <p className="text-sm text-muted-foreground">Arraste as casas entre as semanas para distribuir a execução</p>
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

            {selectedPeriod && !isGenerated && periodServices.length > 0 && (
              <Button onClick={generateWeeks} className="mt-5">
                <Zap className="h-4 w-4 mr-1" />
                Gerar Semanas
              </Button>
            )}
            {isGenerated && (
              <Button variant="outline" onClick={generateWeeks} className="mt-5" size="sm">
                <RefreshCcw className="h-4 w-4 mr-1" />
                Regenerar
              </Button>
            )}
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

      {/* Unassigned pool */}
      {isGenerated && (
        <UnassignedPool
          services={periodServices}
          weekPlans={weekPlans}
          allHouseIds={allHouseIdsMap}
          onDragStart={handleDragStart}
          dragPayload={dragPayload}
          houseProgressMap={houseProgressMap}
        />
      )}

      {/* Kanban columns */}
      {isGenerated && weekPlans.length > 0 && (
        <div className="relative">
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-4 pr-4">
              {weekPlans.map(week => (
                <WeekColumn
                  key={week.week_number}
                  week={week}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  dragPayload={dragPayload}
                  houseProgressMap={houseProgressMap}
                  totalWeeks={weekPlans.length}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Save bar */}
      {isGenerated && (
        <div className="flex items-center justify-between sticky bottom-4 bg-card border rounded-lg p-3 shadow-lg z-10">
          <div className="flex items-center gap-2 text-sm">
            {validationErrors.length === 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
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
