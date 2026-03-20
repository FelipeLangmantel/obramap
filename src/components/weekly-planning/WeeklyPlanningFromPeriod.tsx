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
  Calendar, Home, Save, RefreshCcw, Zap,
  AlertTriangle, CheckCircle2, Lock, Unlock, Undo2,
  MousePointerClick, Plus, X, HardHat,
} from "lucide-react";
import { format, parseISO, differenceInDays, eachDayOfInterval, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ContractorAllocationPanel, type ContractorAllocation } from "./ContractorAllocationPanel";

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
  working_days: string[]; // actual working day dates in this week
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
  contractor_contract_service_id: string | null;
  contractor_id: string | null;
  contractor_name: string | null;
  contractor_house_ids: number[];
  contractor_houses: number;
  has_out_of_contract_houses: boolean;
  out_of_contract_house_ids: number[];
}

interface ContractorServiceOption {
  id: string;
  contract_id: string;
  contractor_id: string;
  contractor_name: string;
  macro_id: string;
  scope_id: string;
  negotiated_unit_value: number;
  house_ids: number[];
}

interface WeekDefinition {
  week_number: number;
  days: Date[];
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

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_COLORS = [
  "bg-blue-500/15 border-blue-400/50 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 border-emerald-400/50 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 border-amber-400/50 text-amber-700 dark:text-amber-300",
  "bg-purple-500/15 border-purple-400/50 text-purple-700 dark:text-purple-300",
  "bg-rose-500/15 border-rose-400/50 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 border-cyan-400/50 text-cyan-700 dark:text-cyan-300",
];
const WEEK_DOT_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-purple-500", "bg-rose-500", "bg-cyan-500",
];

// ── House Cell ─────────────────────────────────────────────
type HouseStatus = "done" | "in_progress" | "available" | "selected" | "blocked";

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
    blocked: "bg-muted/60 text-muted-foreground border-muted/40 cursor-not-allowed opacity-40",
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={status !== "done" && status !== "blocked" ? onClick : undefined}
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
      <div className="text-[10px] text-muted-foreground">{week.working_days.length} dias úteis</div>
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
  week, onRemoveHouse, onMoveHouse,
}: {
  week: WeekPlan;
  onRemoveHouse: (weekNumber: number, serviceKey: string, houseId: number) => void;
  onMoveHouse: (fromWeek: number, toWeek: number, serviceKey: string, houseId: number) => void;
}) {
  const totalHouses = week.services.reduce((s, svc) => s + svc.planned_house_ids.length, 0);
  const activeServices = week.services.filter(s => s.planned_house_ids.length > 0);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.fromWeek !== week.week_number) {
        onMoveHouse(data.fromWeek, week.week_number, data.serviceKey, data.houseId);
      }
    } catch {}
  };

  return (
    <div
      className={`flex flex-col rounded-xl border bg-card min-w-[200px] max-w-[240px] transition-all ${
        isDragOver ? "ring-2 ring-primary border-primary shadow-lg scale-[1.02]" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2 border-b bg-muted/50 rounded-t-xl">
        <div className="font-semibold text-sm flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          Sem {week.week_number}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {format(parseISO(week.week_start), "dd/MM", { locale: ptBR })} – {format(parseISO(week.week_end), "dd/MM", { locale: ptBR })}
          <span className="ml-1">• {week.working_days.length} dias úteis</span>
        </div>
        <Badge variant="outline" className="text-[10px] mt-1 gap-1">
          <Home className="h-2.5 w-2.5" /> {totalHouses} casa{totalHouses !== 1 ? "s" : ""}
        </Badge>
      </div>
      <ScrollArea className="flex-1 p-2 max-h-[300px]">
        <div className="space-y-2">
          {activeServices.map(svc => {
            const sk = svcKey(svc);
            return (
              <div key={sk} className="space-y-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: svc.macro_color }} />
                  <span className="text-[11px] font-medium truncate">{svc.scope_name}</span>
                </div>
                <div className="flex flex-wrap gap-0.5">
                  {svc.planned_house_ids.map(hId => (
                    <DraggableHouseBadge
                      key={hId}
                      houseId={hId}
                      weekNumber={week.week_number}
                      serviceKey={sk}
                      onRemove={() => onRemoveHouse(week.week_number, sk, hId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {activeServices.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {isDragOver ? "Solte aqui para alocar" : "Nenhuma casa alocada"}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Draggable House Badge ──────────────────────────────────
function DraggableHouseBadge({
  houseId, weekNumber, serviceKey, onRemove,
}: {
  houseId: number;
  weekNumber: number;
  serviceKey: string;
  onRemove: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ houseId, fromWeek: weekNumber, serviceKey }));
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  };

  const handleDragEnd = () => setIsDragging(false);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group relative flex items-center transition-all ${isDragging ? "opacity-40 scale-90" : ""}`}
    >
      <div className="w-8 h-7 rounded-l border text-[10px] font-bold bg-primary/10 text-primary border-primary/20 flex items-center justify-center cursor-grab active:cursor-grabbing">
        {houseId}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-5 h-7 rounded-r border border-l-0 border-primary/20 bg-primary/5 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-colors"
        title={`Remover casa ${houseId}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ── Week Calendar Configurator ─────────────────────────────
function WeekCalendarConfigurator({
  startDate,
  endDate,
  onConfirm,
}: {
  startDate: Date;
  endDate: Date;
  onConfirm: (weeks: WeekDefinition[]) => void;
}) {
  // Working day toggles — which weekdays are work days (0=Sun...6=Sat)
  const [workDays, setWorkDays] = useState<boolean[]>([false, true, true, true, true, true, true]); // Mon-Sat default
  
  // All calendar days in the period
  const allDays = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);
  
  // Working days only (filtered by selected weekdays)
  const workingDays = useMemo(
    () => allDays.filter(d => workDays[getDay(d)]),
    [allDays, workDays]
  );
  
  // Week definitions — array of arrays of dates
  const [weekDefs, setWeekDefs] = useState<WeekDefinition[]>([]);
  
  // Currently painting week
  const [paintingWeek, setPaintingWeek] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Auto-split working days into equal weeks
  const autoSplit = useCallback((numWeeks: number) => {
    if (workingDays.length === 0) return;
    const perWeek = Math.ceil(workingDays.length / numWeeks);
    const defs: WeekDefinition[] = [];
    for (let i = 0; i < numWeeks; i++) {
      const start = i * perWeek;
      const end = Math.min(start + perWeek, workingDays.length);
      if (start < workingDays.length) {
        defs.push({ week_number: i + 1, days: workingDays.slice(start, end) });
      }
    }
    setWeekDefs(defs);
  }, [workingDays]);
  
  // Initialize with auto-split of 2 weeks
  useEffect(() => {
    if (workingDays.length > 0 && weekDefs.length === 0) {
      const numWeeks = workingDays.length <= 6 ? 1 : Math.ceil(workingDays.length / 5);
      autoSplit(Math.max(1, Math.min(numWeeks, 4)));
    }
  }, [workingDays.length]);
  
  // Re-split when working days change
  useEffect(() => {
    if (weekDefs.length > 0) {
      autoSplit(weekDefs.length);
    }
  }, [workDays]);
  
  // Get which week a day belongs to
  const dayWeekMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const week of weekDefs) {
      for (const day of week.days) {
        map.set(format(day, "yyyy-MM-dd"), week.week_number);
      }
    }
    return map;
  }, [weekDefs]);
  
  // Handle day click/drag — assign to painting week
  const handleDayMouseDown = (day: Date) => {
    if (paintingWeek === null) return;
    setIsDragging(true);
    assignDayToWeek(day, paintingWeek);
  };
  
  const handleDayMouseEnter = (day: Date) => {
    if (!isDragging || paintingWeek === null) return;
    assignDayToWeek(day, paintingWeek);
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const assignDayToWeek = (day: Date, targetWeek: number) => {
    const dayStr = format(day, "yyyy-MM-dd");
    if (!workDays[getDay(day)]) return; // not a working day
    
    setWeekDefs(prev => {
      const newDefs = prev.map(w => ({
        ...w,
        days: w.days.filter(d => format(d, "yyyy-MM-dd") !== dayStr),
      }));
      
      const target = newDefs.find(w => w.week_number === targetWeek);
      if (target) {
        target.days.push(day);
        target.days.sort((a, b) => a.getTime() - b.getTime());
      }
      
      return newDefs;
    });
  };
  
  const addWeek = () => {
    const newNum = weekDefs.length + 1;
    setWeekDefs(prev => [...prev, { week_number: newNum, days: [] }]);
    setPaintingWeek(newNum);
  };
  
  const removeWeek = (weekNum: number) => {
    setWeekDefs(prev => {
      const filtered = prev.filter(w => w.week_number !== weekNum);
      return filtered.map((w, i) => ({ ...w, week_number: i + 1 }));
    });
    if (paintingWeek === weekNum) setPaintingWeek(null);
  };
  
  // Stats
  const totalWorkingDays = workingDays.length;
  const assignedDays = weekDefs.reduce((s, w) => s + w.days.length, 0);
  const unassignedDays = totalWorkingDays - assignedDays;
  const isValid = unassignedDays === 0 && weekDefs.length > 0 && weekDefs.every(w => w.days.length > 0);
  
  // Toggle working day
  const toggleWorkDay = (dayIndex: number) => {
    setWorkDays(prev => {
      const next = [...prev];
      next[dayIndex] = !next[dayIndex];
      return next;
    });
  };

  return (
    <Card className="border-primary/30" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Configurar Semanas de Trabalho
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Selecione os dias úteis e defina os intervalos de cada semana
        </p>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-4 space-y-4">
        {/* Working days selector */}
        <div className="space-y-2">
          <Label className="text-xs">Dias úteis da semana</Label>
          <div className="flex gap-1.5">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => toggleWorkDay(i)}
                className={`
                  w-10 h-10 rounded-lg border-2 text-xs font-bold transition-all
                  ${workDays[i]
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:border-primary/40"
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {totalWorkingDays} dias úteis no período
          </p>
        </div>
        
        {/* Week selector buttons */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Semanas ({weekDefs.length})</Label>
            <div className="flex gap-1">
              {[2, 3, 4].map(n => (
                <Button key={n} variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => autoSplit(n)}>
                  {n} sem
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={addWeek}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {weekDefs.map((w, idx) => (
              <button
                key={w.week_number}
                onClick={() => setPaintingWeek(paintingWeek === w.week_number ? null : w.week_number)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all
                  ${paintingWeek === w.week_number
                    ? "ring-2 ring-primary shadow-md border-primary bg-primary/10"
                    : `${WEEK_COLORS[idx % WEEK_COLORS.length]}`
                  }
                `}
              >
                <div className={`w-3 h-3 rounded-full ${WEEK_DOT_COLORS[idx % WEEK_DOT_COLORS.length]}`} />
                Sem {w.week_number}
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {w.days.length} dias
                </Badge>
                {weekDefs.length > 1 && (
                  <X
                    className="h-3 w-3 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); removeWeek(w.week_number); }}
                  />
                )}
              </button>
            ))}
          </div>
          
          {paintingWeek !== null && (
            <p className="text-[11px] text-primary font-medium">
              ✎ Clique ou arraste nos dias do calendário para atribuir à Semana {paintingWeek}
            </p>
          )}
        </div>
        
        {/* Calendar Grid */}
        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map(l => (
              <div key={l} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{l}</div>
            ))}
          </div>
          
          {/* Pad start */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: getDay(startDate) }).map((_, i) => (
              <div key={`pad-${i}`} className="w-full aspect-square" />
            ))}
            
            {allDays.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const isWorking = workDays[getDay(day)];
              const assignedWeek = dayWeekMap.get(dayStr);
              const weekIdx = assignedWeek ? assignedWeek - 1 : -1;
              
              return (
                <button
                  key={dayStr}
                  onMouseDown={() => isWorking && handleDayMouseDown(day)}
                  onMouseEnter={() => isWorking && handleDayMouseEnter(day)}
                  disabled={!isWorking}
                  className={`
                    w-full aspect-square rounded-md border text-[11px] font-medium transition-all select-none
                    flex flex-col items-center justify-center gap-0.5
                    ${!isWorking
                      ? "bg-muted/30 text-muted-foreground/40 border-transparent cursor-not-allowed line-through"
                      : assignedWeek
                        ? `${WEEK_COLORS[weekIdx % WEEK_COLORS.length]} cursor-pointer hover:opacity-80`
                        : "bg-card text-foreground border-border cursor-pointer hover:border-primary hover:bg-primary/5"
                    }
                  `}
                >
                  <span>{format(day, "d")}</span>
                  {assignedWeek && (
                    <span className="text-[8px] font-bold leading-none">S{assignedWeek}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Summary & Confirm */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-xs space-y-0.5">
            <div className="text-muted-foreground">
              {assignedDays}/{totalWorkingDays} dias atribuídos
              {unassignedDays > 0 && (
                <span className="text-destructive font-semibold ml-2">
                  {unassignedDays} dia(s) sem semana
                </span>
              )}
            </div>
            <div className="flex gap-3">
              {weekDefs.map((w, idx) => (
                <span key={w.week_number} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${WEEK_DOT_COLORS[idx % WEEK_DOT_COLORS.length]}`} />
                  Sem {w.week_number}: {w.days.length > 0
                    ? `${format(w.days[0], "dd/MM")} – ${format(w.days[w.days.length - 1], "dd/MM")}`
                    : "vazia"
                  }
                </span>
              ))}
            </div>
          </div>
          <Button
            onClick={() => onConfirm(weekDefs)}
            disabled={!isValid}
            className="gap-1"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Semanas
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const [periodServices, setPeriodServices] = useState<ServiceForPeriod[]>([]);
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [showWeekConfig, setShowWeekConfig] = useState(false);

  // Contractor services for this project
  const [contractorServices, setContractorServices] = useState<ContractorServiceOption[]>([]);

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

    const availableHouses = houses
      .filter(h => getHouseProgress(h, selectedService.macro_id, selectedService.scope_id) < 100)
      .map(h => h.id);

    const assignmentMap = new Map<number, number>();
    for (const week of weekPlans) {
      const ws = week.services.find(s => svcKey(s) === key);
      if (ws) {
        for (const hId of ws.planned_house_ids) {
          assignmentMap.set(hId, week.week_number);
        }
      }
    }

    // Calculate total allocated for this service across all weeks
    const totalAllocatedForService = Array.from(assignmentMap.values()).length;
    const available = houses.filter(h => getHouseProgress(h, selectedService.macro_id, selectedService.scope_id) < 100).length;
    const targetLimit = Math.min(selectedService.target_houses, available);
    const isAtLimit = totalAllocatedForService + selectedHouseIds.size >= targetLimit;

    for (const h of houses) {
      const progress = getHouseProgress(h, selectedService.macro_id, selectedService.scope_id);
      if (progress >= 100) {
        map.set(h.id, { status: "done", weekAssigned: null });
      } else if (selectedHouseIds.has(h.id)) {
        map.set(h.id, { status: "selected", weekAssigned: assignmentMap.get(h.id) || null });
      } else if (assignmentMap.has(h.id)) {
        map.set(h.id, { status: "in_progress", weekAssigned: assignmentMap.get(h.id)! });
      } else if (availableHouses.includes(h.id)) {
        // Block available houses when limit is reached
        map.set(h.id, { status: isAtLimit ? "blocked" : "available", weekAssigned: null });
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

    const unassigned = houses.map(h => h.id).filter(id => !assignedToQuadra.has(id)).sort((a, b) => a - b);
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
  const loadPeriods = useCallback(async () => {
    if (!projectId || !companyId) return;
    const { data } = await supabase
      .from("planning_periods")
      .select("id, period_number, start_date, end_date, status, name, weekly_plan_generated, weekly_plan_locked")
      .eq("project_id", projectId)
      .eq("company_id", companyId)
      .in("status", ["draft", "approved", "released_to_weekly", "closed"])
      .order("period_number");
    if (data) setPeriods(data as PeriodForWeekly[]);
  }, [projectId, companyId]);

  // Load contractor contract services for this project
  useEffect(() => {
    if (!projectId || !companyId) return;
    (async () => {
      const { data } = await supabase
        .from("contractor_contract_services")
        .select("id, contract_id, macro_id, scope_id, negotiated_unit_value, house_ids, contractor_contracts!inner(contractor_id, contractors!inner(name))")
        .eq("project_id", projectId)
        .eq("company_id", companyId);
      if (data) {
        const options: ContractorServiceOption[] = data.map((s: any) => ({
          id: s.id,
          contract_id: s.contract_id,
          contractor_id: s.contractor_contracts?.contractor_id || "",
          contractor_name: s.contractor_contracts?.contractors?.name || "Empreiteiro",
          macro_id: s.macro_id,
          scope_id: s.scope_id,
          negotiated_unit_value: s.negotiated_unit_value,
          house_ids: s.house_ids || [],
        }));
        setContractorServices(options);
      }
    })();
  }, [projectId, companyId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

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
            .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, planned_house_ids, planned_houses, contractor_contract_service_id, contractor_id, contractor_name, contractor_house_ids, contractor_houses, has_out_of_contract_houses, out_of_contract_house_ids")
            .eq("weekly_plan_week_id", w.id);
          const services = (ws || []).map((s: any) => ({
            ...s,
            contractor_contract_service_id: s.contractor_contract_service_id || null,
            contractor_id: s.contractor_id || null,
            contractor_name: s.contractor_name || null,
            contractor_house_ids: s.contractor_house_ids || [],
            contractor_houses: s.contractor_houses || 0,
            has_out_of_contract_houses: s.has_out_of_contract_houses || false,
            out_of_contract_house_ids: s.out_of_contract_house_ids || [],
          })) as WeekServicePlan[];
          weeksWithSvcs.push({ ...w, services, working_days: [] });
        }
        setWeekPlans(weeksWithSvcs);
        setIsGenerated(true);
        setShowWeekConfig(false);
      } else {
        setWeekPlans([]);
        setIsGenerated(false);
        setShowWeekConfig(true);
      }
    })();
    setSelectedServiceKey("");
    setSelectedHouseIds(new Set());
    setTargetWeek(null);
  }, [selectedPeriodId, projectId]);

  // ── Create weeks from calendar config ──────────────────
  const handleWeekConfigConfirm = useCallback((weekDefs: WeekDefinition[]) => {
    if (periodServices.length === 0) return;

    const weeks: WeekPlan[] = weekDefs.map(wd => {
      const sortedDays = [...wd.days].sort((a, b) => a.getTime() - b.getTime());
      const services: WeekServicePlan[] = periodServices.map(svc => ({
        id: null,
        macro_id: svc.macro_id,
        macro_name: svc.macro_name,
        macro_color: getMacroColor(svc.macro_id, macros),
        scope_id: svc.scope_id,
        scope_name: svc.scope_name,
        planned_house_ids: [],
        planned_houses: 0,
        contractor_contract_service_id: null,
        contractor_id: null,
        contractor_name: null,
        contractor_house_ids: [],
        contractor_houses: 0,
        has_out_of_contract_houses: false,
        out_of_contract_house_ids: [],
      }));

      return {
        id: null,
        week_number: wd.week_number,
        week_start: format(sortedDays[0], "yyyy-MM-dd"),
        week_end: format(sortedDays[sortedDays.length - 1], "yyyy-MM-dd"),
        status: "draft",
        services,
        working_days: sortedDays.map(d => format(d, "yyyy-MM-dd")),
      };
    });

    setWeekPlans(weeks);
    setIsGenerated(true);
    setShowWeekConfig(false);
    toast.success(`${weeks.length} semana(s) configurada(s). Distribua os serviços.`);
  }, [periodServices, macros]);

  // ── Auto-distribute ─────────────────────────────────────
  const autoDistribute = useCallback(() => {
    if (!weekPlans.length || !periodServices.length) return;
    const numWeeks = weekPlans.length;

    setWeekPlans(prev => {
      const newWeeks = prev.map(w => ({
        ...w,
        services: w.services.map(s => ({ ...s, planned_house_ids: [] as number[], planned_houses: 0 })),
      }));

      // Calculate proportional distribution based on working days
      const totalWorkingDays = newWeeks.reduce((s, w) => s + w.working_days.length, 0);

      for (const svc of periodServices) {
        const key = `${svc.macro_id}:${svc.scope_id}`;
        const available = houses
          .filter(h => getHouseProgress(h, svc.macro_id, svc.scope_id) < 100)
          .map(h => h.id)
          .sort((a, b) => a - b)
          .slice(0, svc.target_houses);

        if (available.length === 0) continue;

        // Distribute proportionally to working days
        let distributed = 0;
        for (let wi = 0; wi < numWeeks; wi++) {
          const weekDays = newWeeks[wi].working_days.length;
          const proportion = totalWorkingDays > 0 ? weekDays / totalWorkingDays : 1 / numWeeks;
          const count = wi === numWeeks - 1
            ? available.length - distributed
            : Math.round(available.length * proportion);

          const ws = newWeeks[wi].services.find(s => svcKey(s) === key);
          if (ws) {
            const slice = available.slice(distributed, distributed + count);
            ws.planned_house_ids = slice;
            ws.planned_houses = slice.length;
            distributed += count;
          }
        }
      }

      return newWeeks;
    });

    toast.success("Casas distribuídas proporcionalmente aos dias úteis");
  }, [weekPlans.length, periodServices, houses]);

  // ── House click handler ─────────────────────────────────
  const toggleHouseSelection = useCallback((houseId: number) => {
    setSelectedHouseIds(prev => {
      const next = new Set(prev);
      if (next.has(houseId)) next.delete(houseId);
      else next.add(houseId);
      return next;
    });
  }, []);

  // ── Assign selected houses to week ──────────────────────
  const assignToWeek = useCallback((weekNumber: number) => {
    if (!selectedServiceKey || selectedHouseIds.size === 0) return;

    setWeekPlans(prev => prev.map(week => {
      const updated = {
        ...week,
        services: week.services.map(svc => {
          if (svcKey(svc) !== selectedServiceKey) return svc;
          const filtered = svc.planned_house_ids.filter(id => !selectedHouseIds.has(id));
          return { ...svc, planned_house_ids: filtered, planned_houses: filtered.length };
        }),
      };

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

  // ── Move house between weeks (drag & drop) ─────────────
  const moveHouseBetweenWeeks = useCallback((fromWeek: number, toWeek: number, serviceKey: string, houseId: number) => {
    setWeekPlans(prev => prev.map(week => {
      if (week.week_number === fromWeek) {
        return {
          ...week,
          services: week.services.map(svc => {
            if (svcKey(svc) !== serviceKey) return svc;
            const ids = svc.planned_house_ids.filter(id => id !== houseId);
            return { ...svc, planned_house_ids: ids, planned_houses: ids.length };
          }),
        };
      }
      if (week.week_number === toWeek) {
        return {
          ...week,
          services: week.services.map(svc => {
            if (svcKey(svc) !== serviceKey) return svc;
            const ids = [...new Set([...svc.planned_house_ids, houseId])].sort((a, b) => a - b);
            return { ...svc, planned_house_ids: ids, planned_houses: ids.length };
          }),
        };
      }
      return week;
    }));
    toast.success(`Casa ${houseId} movida para Semana ${toWeek}`);
  }, []);


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
      // 1. Buscar semanas existentes para reutilizar IDs (preserva log)
      const { data: existingWeeks } = await supabase
        .from("weekly_plan_weeks")
        .select("id, week_number")
        .eq("planning_period_id", selectedPeriodId);

      const existingWeekMap = new Map(
        (existingWeeks || []).map(w => [w.week_number, w.id])
      );

      for (const week of weekPlans) {
        let weekId = existingWeekMap.get(week.week_number);

        if (weekId) {
          // Atualizar semana existente (preserva IDs dos serviços)
          await supabase.from("weekly_plan_weeks")
            .update({ week_start: week.week_start, week_end: week.week_end, status: week.status })
            .eq("id", weekId);
        } else {
          // Criar nova semana
          const { data: wd, error: we } = await supabase
            .from("weekly_plan_weeks")
            .insert({ planning_period_id: selectedPeriodId, project_id: projectId, company_id: companyId, week_number: week.week_number, week_start: week.week_start, week_end: week.week_end, status: week.status })
            .select("id").single();
          if (we || !wd) throw we;
          weekId = wd.id;
        }

        // Para cada serviço: upsert pelo unique key (weekly_plan_week_id, macro_id, scope_id)
        const rows = week.services.filter(s => s.planned_house_ids.length > 0).map(s => ({
          weekly_plan_week_id: weekId, planning_period_id: selectedPeriodId, project_id: projectId, company_id: companyId,
          macro_id: s.macro_id, macro_name: s.macro_name, macro_color: s.macro_color,
          scope_id: s.scope_id, scope_name: s.scope_name,
          planned_house_ids: s.planned_house_ids, planned_houses: s.planned_house_ids.length,
          contractor_contract_service_id: s.contractor_contract_service_id || null,
          contractor_id: s.contractor_id || null,
          contractor_name: s.contractor_name || null,
          contractor_house_ids: s.contractor_house_ids || [],
          contractor_houses: s.contractor_houses || 0,
          has_out_of_contract_houses: s.has_out_of_contract_houses || false,
          out_of_contract_house_ids: s.out_of_contract_house_ids || [],
        }));

        if (rows.length > 0) {
          const { error } = await supabase.from("weekly_plan_services")
            .upsert(rows, { onConflict: "weekly_plan_week_id,macro_id,scope_id" });
          if (error) throw error;
        }

        // Remover serviços que não estão mais no plano (casas = 0)
        const activeScopeIds = week.services
          .filter(s => s.planned_house_ids.length > 0)
          .map(s => s.scope_id);

        if (activeScopeIds.length > 0 && weekId) {
          await supabase.from("weekly_plan_services")
            .delete()
            .eq("weekly_plan_week_id", weekId)
            .not("scope_id", "in", `(${activeScopeIds.map(id => `"${id}"`).join(",")})`)
        }
      }

      // Remover semanas que não existem mais no plano
      const activeWeekNumbers = weekPlans.map(w => w.week_number);
      const weeksToDelete = (existingWeeks || [])
        .filter(w => !activeWeekNumbers.includes(w.week_number))
        .map(w => w.id);
      if (weeksToDelete.length > 0) {
        await supabase.from("weekly_plan_weeks").delete().in("id", weeksToDelete);
      }

      await supabase.from("planning_periods").update({ 
        weekly_plan_generated: true, 
        weekly_plan_locked: true,
        status: "released_to_weekly"
      }).eq("id", selectedPeriodId);
      
      await loadPeriods();
      
      toast.success("Planejamento semanal salvo e medição liberada!");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Revert to draft (unlock for re-editing) ─────────
  const revertToDraft = async () => {
    if (!selectedPeriodId) return;
    setIsReverting(true);
    try {
      // Clear weekly plan data first
      await supabase.from("weekly_plan_weeks").delete().eq("planning_period_id", selectedPeriodId);
      
      // Revert status to draft directly
      await supabase.from("planning_periods").update({ 
        weekly_plan_generated: false, 
        weekly_plan_locked: false,
        status: "draft"
      }).eq("id", selectedPeriodId);

      // Refresh periods list
      await loadPeriods();

      setWeekPlans([]);
      setIsGenerated(false);
      setShowWeekConfig(false);
      toast.success("Medição revertida para rascunho. Planejamento semanal limpo.");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "desconhecido"));
    } finally {
      setIsReverting(false);
    }
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
            Configure as semanas → selecione o serviço → distribua as casas
          </p>
        </div>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="space-y-1 flex-1">
              <Label>Medição</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger><SelectValue placeholder="Escolha uma medição aprovada..." /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => {
                    const statusLabel = p.status === "draft" ? "Rascunho"
                      : p.status === "approved" ? "Aprovada" 
                      : p.status === "released_to_weekly" ? "Liberada" 
                      : p.status === "closed" ? "Fechada" 
                      : "Rascunho";
                    const statusIcon = p.weekly_plan_generated ? " ✓" : "";
                    const statusColor = p.status === "draft" ? "bg-muted text-muted-foreground"
                      : p.status === "approved" ? "bg-primary/20 text-primary"
                      : p.status === "released_to_weekly" ? "bg-emerald-500/20 text-emerald-700"
                      : p.status === "closed" ? "bg-destructive/20 text-destructive"
                      : "bg-muted text-muted-foreground";
                    const isDisabled = p.status === "closed";
                    return (
                      <SelectItem key={p.id} value={p.id} disabled={isDisabled}>
                        <span className="flex items-center gap-2">
                          Medição {p.period_number}{p.name ? ` – ${p.name}` : ""} ({format(parseISO(p.start_date), "dd/MM", { locale: ptBR })} – {format(parseISO(p.end_date), "dd/MM", { locale: ptBR })})
                          {statusIcon}
                          <Badge variant="outline" className={`text-[10px] px-1.5 h-4 ml-1 border-0 ${statusColor}`}>
                            {statusLabel}
                          </Badge>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 mt-5">
              {isGenerated && (
                <>
                  <Button variant="outline" size="sm" onClick={autoDistribute}>
                    <Zap className="h-4 w-4 mr-1" />
                    Auto-distribuir
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowWeekConfig(true); setIsGenerated(false); setWeekPlans([]); }}>
                    <RefreshCcw className="h-4 w-4 mr-1" />
                    Reconfigurar Semanas
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
              <span>{periodServices.filter(s => s.target_houses > 0).length} serviço(s) com atividades</span>
              <span className="text-border">|</span>
              <Badge variant={selectedPeriod.weekly_plan_locked ? "secondary" : "default"} className="gap-1">
                {selectedPeriod.weekly_plan_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {selectedPeriod.status === "draft" ? "Rascunho" : selectedPeriod.status === "approved" ? "Aprovada" : selectedPeriod.status === "released_to_weekly" ? "Liberada" : selectedPeriod.status === "closed" ? "Fechada" : selectedPeriod.status}
              </Badge>
              {(selectedPeriod.status === "released_to_weekly") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={revertToDraft}
                  disabled={isReverting}
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  {isReverting ? "Revertendo..." : "Reverter p/ Rascunho"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── WEEK CALENDAR CONFIGURATOR ────────────────── */}
      {showWeekConfig && selectedPeriod && periodServices.length > 0 && (
        <WeekCalendarConfigurator
          startDate={parseISO(selectedPeriod.start_date)}
          endDate={parseISO(selectedPeriod.end_date)}
          onConfirm={handleWeekConfigConfirm}
        />
      )}

      {/* ── SERVICE-FIRST FLOW ─────────────────────────── */}
      {isGenerated && (
        <div className="space-y-4">
          {/* Step 1: Select Service */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">1</span>
                Selecione o Serviço
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({periodServices.filter(s => s.target_houses > 0).length} com atividades)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {periodServices.filter(svc => {
                  const available = houses.filter(h => getHouseProgress(h, svc.macro_id, svc.scope_id) < 100).length;
                  return svc.target_houses > 0 && available > 0;
                }).map(svc => {
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

                  // Contractor info from first week service instance
                  const firstSvc = weekPlans.flatMap(w => w.services).find(s => svcKey(s) === key && s.contractor_id);
                  const hasContractor = !!firstSvc?.contractor_id;
                  const hasOutOfContract = !!firstSvc?.has_out_of_contract_houses;

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
                      {/* Contractor badge */}
                      {hasContractor ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0 gap-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                          <HardHat className="h-2.5 w-2.5" />
                          {firstSvc!.contractor_name} · {firstSvc!.contractor_houses}
                        </Badge>
                      ) : allocated > 0 ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0 gap-0.5 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Sem empreiteiro
                        </Badge>
                      ) : null}
                      {hasOutOfContract && (
                        <Home className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Contractor allocation panel per service */}
              {selectedService && (() => {
                // Find current allocation from the first week that has this service
                const sKey = selectedServiceKey;
                const allSvcInstances = weekPlans.flatMap(w =>
                  w.services.filter(s => svcKey(s) === sKey && s.planned_house_ids.length > 0)
                );
                const firstInstance = allSvcInstances[0];
                const currentAlloc: ContractorAllocation | null = firstInstance?.contractor_id ? {
                  contractorContractServiceId: firstInstance.contractor_contract_service_id,
                  contractorId: firstInstance.contractor_id,
                  contractorName: firstInstance.contractor_name,
                  contractorHouseIds: firstInstance.contractor_house_ids || [],
                  contractorHouses: firstInstance.contractor_houses || 0,
                  hasOutOfContractHouses: firstInstance.has_out_of_contract_houses || false,
                  outOfContractHouseIds: firstInstance.out_of_contract_house_ids || [],
                } : null;

                // Get all planned house ids for this service across all weeks
                const allPlannedIds = weekPlans.flatMap(w => {
                  const ws = w.services.find(s => svcKey(s) === sKey);
                  return ws?.planned_house_ids || [];
                });

                // Other allocations this week for conflict detection
                const otherAllocations = weekPlans.flatMap(w =>
                  w.services.filter(s => svcKey(s) !== sKey && s.contractor_id)
                    .map(s => ({ contractorName: s.contractor_name || "", houseIds: s.contractor_house_ids || [] }))
                );

                // Assigned house ids from contracts
                const assignedSet = new Set<number>();
                contractorServices
                  .filter(cs => cs.macro_id === selectedService.macro_id && cs.scope_id === selectedService.scope_id)
                  .forEach(cs => cs.house_ids.forEach(id => assignedSet.add(id)));

                return (
                  <div className="mt-3">
                    <ContractorAllocationPanel
                      projectId={projectId!}
                      companyId={companyId!}
                      macroId={selectedService.macro_id}
                      scopeId={selectedService.scope_id}
                      macroName={selectedService.macro_name}
                      scopeName={selectedService.scope_name}
                      weekPlanServiceId={firstInstance?.id || null}
                      weekStart={weekPlans[0]?.week_start || ""}
                      plannedHouseIds={allPlannedIds}
                      currentAllocation={currentAlloc}
                      otherAllocationsThisWeek={otherAllocations}
                      assignedHouseIds={assignedSet}
                      onAllocationChange={(alloc) => {
                        // Update all week services for this svcKey
                        setWeekPlans(prev => prev.map(w => ({
                          ...w,
                          services: w.services.map(s => {
                            if (svcKey(s) !== sKey) return s;
                            return {
                              ...s,
                              contractor_contract_service_id: alloc.contractorContractServiceId,
                              contractor_id: alloc.contractorId,
                              contractor_name: alloc.contractorName,
                              contractor_house_ids: alloc.contractorHouseIds,
                              contractor_houses: alloc.contractorHouses,
                              has_out_of_contract_houses: alloc.hasOutOfContractHouses,
                              out_of_contract_house_ids: alloc.outOfContractHouseIds,
                            };
                          }),
                        })));
                      }}
                    />
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Step 2: Visual House Grid */}
          {selectedService && (() => {
            const sKey = `${selectedService.macro_id}:${selectedService.scope_id}`;
            const totalAvailable = houses.filter(h => getHouseProgress(h, selectedService.macro_id, selectedService.scope_id) < 100).length;
            const totalTarget = Math.min(selectedService.target_houses, totalAvailable);
            const totalAllocated = weekPlans.reduce((sum, w) => {
              const ws = w.services.find(s => svcKey(s) === sKey);
              return sum + (ws?.planned_house_ids.length || 0);
            }, 0);
            const remaining = Math.max(0, totalTarget - totalAllocated);
            const doneCount = houses.filter(h => getHouseProgress(h, selectedService.macro_id, selectedService.scope_id) >= 100).length;
            const progressPct = totalTarget > 0 ? Math.round((totalAllocated / totalTarget) * 100) : 0;

            return (
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
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

                {/* Progress summary */}
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">Meta: <strong className="text-foreground">{totalTarget} casas</strong></span>
                      <span className="text-muted-foreground">Alocadas: <strong className="text-primary">{totalAllocated}</strong></span>
                      {remaining > 0 ? (
                        <span className="text-destructive font-semibold">Faltam: {remaining}</span>
                      ) : (
                        <span className="text-primary font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Completo
                        </span>
                      )}
                      {doneCount > 0 && (
                        <span className="text-muted-foreground">Concluídas: {doneCount}</span>
                      )}
                    </div>
                    <span className="font-bold text-foreground">{progressPct}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${remaining === 0 ? "bg-primary" : "bg-primary/70"}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
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
            );
          })()}

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
                      onRemoveHouse={removeHouseFromWeek}
                      onMoveHouse={moveHouseBetweenWeeks}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Contractor warning alert */}
          {(() => {
            const servicesWithoutContractor = weekPlans.flatMap(w => w.services)
              .filter((s, i, arr) => {
                // Unique by svcKey, has planned houses, no contractor
                const k = svcKey(s);
                return s.planned_houses > 0 && !s.contractor_id && arr.findIndex(x => svcKey(x) === k) === i;
              });
            if (servicesWithoutContractor.length === 0) return null;
            return (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  {servicesWithoutContractor.length} serviço(s) sem empreiteiro alocado:{" "}
                  {servicesWithoutContractor.map(s => s.scope_name).join(", ")}
                </span>
              </div>
            );
          })()}

          {/* Save bar */}
          <div className="flex items-center justify-between bg-card border rounded-lg p-3 shadow-sm">
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
        <Card className="p-6">
          <div className="text-center mb-4">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">Selecione uma medição para configurar o planejamento semanal</p>
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            {periods.map(p => {
              const statusLabel = p.status === "draft" ? "Rascunho"
                : p.status === "approved" ? "Aprovada"
                : p.status === "released_to_weekly" ? "Liberada"
                : p.status === "closed" ? "Fechada" : p.status;
              const statusColor = p.status === "draft" ? "bg-muted text-muted-foreground"
                : p.status === "approved" ? "bg-primary/20 text-primary"
                : p.status === "released_to_weekly" ? "bg-emerald-500/20 text-emerald-700"
                : p.status === "closed" ? "bg-destructive/20 text-destructive"
                : "bg-muted text-muted-foreground";
              return (
                <button
                  key={p.id}
                  onClick={() => p.status !== "closed" ? setSelectedPeriodId(p.id) : undefined}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                    p.status === "closed" ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:bg-primary/5 cursor-pointer"
                  }`}
                >
                  <span className="text-sm font-medium">
                    Medição {p.period_number} ({format(parseISO(p.start_date), "dd/MM", { locale: ptBR })} – {format(parseISO(p.end_date), "dd/MM", { locale: ptBR })})
                  </span>
                  <Badge variant="outline" className={`text-[10px] border-0 ${statusColor}`}>
                    {statusLabel}
                    {p.weekly_plan_generated ? " ✓" : ""}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      {periods.length === 0 && (
        <Card className="p-8 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhuma medição encontrada</p>
          <p className="text-xs text-muted-foreground mt-1">Crie medições no módulo de Planejamento por Período</p>
        </Card>
      )}
    </div>
  );
}
