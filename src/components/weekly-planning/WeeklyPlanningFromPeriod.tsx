import { useState, useEffect, useMemo, useCallback } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Calendar,
  Home,
  Settings2,
  ChevronDown,
  ChevronUp,
  Save,
  RefreshCcw,
  GripVertical,
  AlertTriangle,
  CheckCircle2,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  macro_color: string;
  scope_id: string;
  scope_name: string;
  target_houses: number;
  target_house_ids: number[];
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

interface DragState {
  serviceKey: string; // macro_id:scope_id
  sourceWeekNumber: number;
  houseId: number;
}

export function WeeklyPlanningFromPeriod() {
  const { currentProject } = useConstruction();
  const { company, canEdit } = useAuth();
  const projectId = currentProject?.id;
  const companyId = company?.id;

  const [periods, setPeriods] = useState<PeriodForWeekly[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState<number>(6);
  const [periodServices, setPeriodServices] = useState<ServiceForPeriod[]>([]);
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

  // Load approved/released periods
  useEffect(() => {
    if (!projectId || !companyId) return;
    const fetchPeriods = async () => {
      const { data, error } = await supabase
        .from("planning_periods")
        .select("id, period_number, start_date, end_date, status, name, weekly_plan_generated, weekly_plan_locked")
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .in("status", ["approved", "released_to_weekly", "executing", "closed"])
        .order("period_number");
      if (!error && data) setPeriods(data as PeriodForWeekly[]);
    };
    fetchPeriods();
  }, [projectId, companyId]);

  // Load working days config
  useEffect(() => {
    if (!projectId) return;
    const fetchConfig = async () => {
      const { data } = await supabase
        .from("weekly_plan_config")
        .select("working_days_per_week")
        .eq("project_id", projectId)
        .maybeSingle();
      if (data) setWorkingDaysPerWeek(data.working_days_per_week);
    };
    fetchConfig();
  }, [projectId]);

  // Load period services when period selected
  useEffect(() => {
    if (!selectedPeriodId || !projectId) return;
    const fetchServices = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("service_planning_by_period")
        .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, target_houses, target_house_ids")
        .eq("planning_period_id", selectedPeriodId)
        .eq("project_id", projectId);
      if (!error && data) {
        setPeriodServices(data as ServiceForPeriod[]);
      }
      // Check if weekly plan already exists
      const { data: existingWeeks } = await supabase
        .from("weekly_plan_weeks")
        .select("id, week_number, week_start, week_end, status")
        .eq("planning_period_id", selectedPeriodId)
        .order("week_number");

      if (existingWeeks && existingWeeks.length > 0) {
        // Load existing plan
        const weeksWithServices: WeekPlan[] = [];
        for (const week of existingWeeks) {
          const { data: services } = await supabase
            .from("weekly_plan_services")
            .select("id, macro_id, macro_name, macro_color, scope_id, scope_name, planned_house_ids, planned_houses")
            .eq("weekly_plan_week_id", week.id);
          weeksWithServices.push({
            ...week,
            services: (services || []) as WeekServicePlan[],
          });
        }
        setWeekPlans(weeksWithServices);
        setIsGenerated(true);
        setExpandedWeeks(new Set([1]));
      } else {
        setWeekPlans([]);
        setIsGenerated(false);
      }
      setIsLoading(false);
    };
    fetchServices();
  }, [selectedPeriodId, projectId]);

  // Calculate weeks from period dates
  const generateWeeks = useCallback(() => {
    if (!selectedPeriod || periodServices.length === 0) return;

    const start = parseISO(selectedPeriod.start_date);
    const end = parseISO(selectedPeriod.end_date);
    const totalDays = differenceInDays(end, start) + 1;
    const numWeeks = Math.max(1, Math.ceil(totalDays / workingDaysPerWeek));

    const weeks: WeekPlan[] = [];
    for (let i = 0; i < numWeeks; i++) {
      const weekStart = addDays(start, i * workingDaysPerWeek);
      const weekEnd = i === numWeeks - 1
        ? end
        : addDays(weekStart, workingDaysPerWeek - 1);

      // Distribute houses equally across weeks for each service
      const services: WeekServicePlan[] = periodServices.map(svc => {
        const totalHouses = svc.target_house_ids.length;
        const housesPerWeek = Math.floor(totalHouses / numWeeks);
        const remainder = totalHouses % numWeeks;
        const startIdx = i * housesPerWeek + Math.min(i, remainder);
        const count = housesPerWeek + (i < remainder ? 1 : 0);
        const houseIds = svc.target_house_ids.slice(startIdx, startIdx + count);

        return {
          id: null,
          macro_id: svc.macro_id,
          macro_name: svc.macro_name,
          macro_color: svc.macro_color,
          scope_id: svc.scope_id,
          scope_name: svc.scope_name,
          planned_house_ids: houseIds,
          planned_houses: houseIds.length,
        };
      });

      weeks.push({
        id: null,
        week_number: i + 1,
        week_start: format(weekStart, "yyyy-MM-dd"),
        week_end: format(weekEnd, "yyyy-MM-dd"),
        status: "draft",
        services,
      });
    }

    setWeekPlans(weeks);
    setIsGenerated(true);
    setExpandedWeeks(new Set([1]));
    toast.success(`${numWeeks} semana(s) gerada(s) com distribuição automática`);
  }, [selectedPeriod, periodServices, workingDaysPerWeek]);

  // Move a house from one week to another (drag and drop)
  const moveHouse = useCallback((serviceKey: string, fromWeek: number, toWeek: number, houseId: number) => {
    setWeekPlans(prev => {
      const updated = prev.map(week => {
        if (week.week_number === fromWeek) {
          return {
            ...week,
            services: week.services.map(svc => {
              if (`${svc.macro_id}:${svc.scope_id}` === serviceKey) {
                const newIds = svc.planned_house_ids.filter(id => id !== houseId);
                return { ...svc, planned_house_ids: newIds, planned_houses: newIds.length };
              }
              return svc;
            }),
          };
        }
        if (week.week_number === toWeek) {
          return {
            ...week,
            services: week.services.map(svc => {
              if (`${svc.macro_id}:${svc.scope_id}` === serviceKey) {
                if (svc.planned_house_ids.includes(houseId)) return svc;
                const newIds = [...svc.planned_house_ids, houseId].sort((a, b) => a - b);
                return { ...svc, planned_house_ids: newIds, planned_houses: newIds.length };
              }
              return svc;
            }),
          };
        }
        return week;
      });
      return updated;
    });
  }, []);

  // Save weekly plan to database
  const saveWeeklyPlan = async () => {
    if (!projectId || !companyId || !selectedPeriodId) return;
    setIsSaving(true);
    try {
      // Delete existing weeks for this period
      await supabase
        .from("weekly_plan_weeks")
        .delete()
        .eq("planning_period_id", selectedPeriodId);

      for (const week of weekPlans) {
        const { data: weekData, error: weekError } = await supabase
          .from("weekly_plan_weeks")
          .insert({
            planning_period_id: selectedPeriodId,
            project_id: projectId,
            company_id: companyId,
            week_number: week.week_number,
            week_start: week.week_start,
            week_end: week.week_end,
            status: week.status,
          })
          .select("id")
          .single();

        if (weekError || !weekData) throw weekError;

        const servicesToInsert = week.services
          .filter(svc => svc.planned_house_ids.length > 0)
          .map(svc => ({
            weekly_plan_week_id: weekData.id,
            planning_period_id: selectedPeriodId,
            project_id: projectId,
            company_id: companyId,
            macro_id: svc.macro_id,
            macro_name: svc.macro_name,
            macro_color: svc.macro_color,
            scope_id: svc.scope_id,
            scope_name: svc.scope_name,
            planned_house_ids: svc.planned_house_ids,
            planned_houses: svc.planned_house_ids.length,
          }));

        if (servicesToInsert.length > 0) {
          const { error: svcError } = await supabase
            .from("weekly_plan_services")
            .insert(servicesToInsert);
          if (svcError) throw svcError;
        }
      }

      // Mark period as having weekly plan
      await supabase
        .from("planning_periods")
        .update({ weekly_plan_generated: true, weekly_plan_locked: true })
        .eq("id", selectedPeriodId);

      toast.success("Planejamento semanal salvo com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "erro desconhecido"));
    } finally {
      setIsSaving(false);
    }
  };

  // Save working days config
  const saveConfig = async () => {
    if (!projectId || !companyId) return;
    const { error } = await supabase
      .from("weekly_plan_config")
      .upsert({
        project_id: projectId,
        company_id: companyId,
        working_days_per_week: workingDaysPerWeek,
      }, { onConflict: "project_id" });
    if (!error) {
      toast.success("Configuração salva");
      setConfigOpen(false);
    }
  };

  // Totals validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    for (const svc of periodServices) {
      const key = `${svc.macro_id}:${svc.scope_id}`;
      const allocated = weekPlans.reduce((sum, week) => {
        const weekSvc = week.services.find(s => `${s.macro_id}:${s.scope_id}` === key);
        return sum + (weekSvc?.planned_house_ids.length || 0);
      }, 0);
      if (allocated !== svc.target_house_ids.length) {
        errors.push(`${svc.scope_name}: ${allocated}/${svc.target_house_ids.length} casas alocadas`);
      }
    }
    return errors;
  }, [weekPlans, periodServices]);

  const toggleWeek = (weekNumber: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekNumber)) next.delete(weekNumber);
      else next.add(weekNumber);
      return next;
    });
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, serviceKey: string, weekNumber: number, houseId: number) => {
    setDragState({ serviceKey, sourceWeekNumber: weekNumber, houseId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetWeekNumber: number) => {
    e.preventDefault();
    if (dragState && dragState.sourceWeekNumber !== targetWeekNumber) {
      moveHouse(dragState.serviceKey, dragState.sourceWeekNumber, targetWeekNumber, dragState.houseId);
    }
    setDragState(null);
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Planejamento Semanal
          </h2>
          <p className="text-sm text-muted-foreground">
            Distribua as atividades da medição em semanas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfigOpen(!configOpen)}>
            <Settings2 className="h-4 w-4 mr-1" />
            Dias úteis: {workingDaysPerWeek}
          </Button>
        </div>
      </div>

      {/* Config panel */}
      {configOpen && (
        <Card className="border-primary/30">
          <CardContent className="pt-4">
            <div className="flex items-end gap-4">
              <div className="space-y-1">
                <Label>Dias úteis por semana</Label>
                <Select value={String(workingDaysPerWeek)} onValueChange={v => setWorkingDaysPerWeek(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
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
              <Label>Selecione a Medição</Label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma medição aprovada..." />
                </SelectTrigger>
                <SelectContent>
                  {periods.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      Medição {p.period_number}{p.name ? ` - ${p.name}` : ""} ({format(parseISO(p.start_date), "dd/MM", { locale: ptBR })} - {format(parseISO(p.end_date), "dd/MM", { locale: ptBR })})
                      {p.weekly_plan_generated && " ✓"}
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
            <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
              <span>Período: {format(parseISO(selectedPeriod.start_date), "dd/MM/yyyy")} - {format(parseISO(selectedPeriod.end_date), "dd/MM/yyyy")}</span>
              <span>•</span>
              <span>{differenceInDays(parseISO(selectedPeriod.end_date), parseISO(selectedPeriod.start_date)) + 1} dias</span>
              <span>•</span>
              <span>{periodServices.length} serviço(s)</span>
              <span>•</span>
              <Badge variant={selectedPeriod.status === "approved" ? "default" : "secondary"}>
                {selectedPeriod.status === "approved" ? "Aprovada" : selectedPeriod.status === "released_to_weekly" ? "Liberada" : selectedPeriod.status}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Validation errors */}
      {isGenerated && validationErrors.length > 0 && (
        <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Distribuição incompleta</p>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-1 space-y-0.5">
                  {validationErrors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Week cards */}
      {isGenerated && weekPlans.map(week => (
        <Card
          key={week.week_number}
          className={`transition-all ${dragState ? "ring-2 ring-primary/30" : ""}`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, week.week_number)}
        >
          <CardHeader
            className="cursor-pointer py-3"
            onClick={() => toggleWeek(week.week_number)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Semana {week.week_number}
                <span className="text-sm font-normal text-muted-foreground">
                  {format(parseISO(week.week_start), "dd/MM", { locale: ptBR })} - {format(parseISO(week.week_end), "dd/MM", { locale: ptBR })}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  <Home className="h-3 w-3 mr-1" />
                  {week.services.reduce((s, svc) => s + svc.planned_houses, 0)} casas
                </Badge>
                {expandedWeeks.has(week.week_number) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </div>
          </CardHeader>

          {expandedWeeks.has(week.week_number) && (
            <CardContent className="pt-0 space-y-3">
              {week.services.filter(svc => svc.planned_houses > 0 || periodServices.some(ps => ps.macro_id === svc.macro_id && ps.scope_id === svc.scope_id)).map(svc => {
                const serviceKey = `${svc.macro_id}:${svc.scope_id}`;
                return (
                  <div key={serviceKey} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: svc.macro_color }}
                        />
                        <span className="font-medium text-sm">{svc.scope_name}</span>
                        <span className="text-xs text-muted-foreground">({svc.macro_name})</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {svc.planned_houses} casa(s)
                      </Badge>
                    </div>

                    {/* House chips - draggable */}
                    <div className="flex flex-wrap gap-1.5">
                      {svc.planned_house_ids.map(houseId => (
                        <div
                          key={houseId}
                          draggable
                          onDragStart={(e) => handleDragStart(e, serviceKey, week.week_number, houseId)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20 cursor-grab active:cursor-grabbing hover:bg-primary/20 transition-colors select-none"
                        >
                          <GripVertical className="h-3 w-3 opacity-50" />
                          Casa {houseId}
                        </div>
                      ))}
                      {svc.planned_houses === 0 && (
                        <span className="text-xs text-muted-foreground italic">
                          Arraste casas de outras semanas para cá
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {week.services.filter(svc => svc.planned_houses > 0).length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  <ArrowLeftRight className="h-5 w-5 mx-auto mb-1 opacity-50" />
                  Arraste casas de outras semanas para esta
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* Save button */}
      {isGenerated && (
        <div className="flex items-center justify-between sticky bottom-4 bg-background border rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-2">
            {validationErrors.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            )}
            <span className="text-sm">
              {validationErrors.length === 0
                ? "Todas as casas distribuídas corretamente"
                : `${validationErrors.length} serviço(s) com distribuição pendente`}
            </span>
          </div>
          <Button
            onClick={saveWeeklyPlan}
            disabled={isSaving || validationErrors.length > 0}
          >
            <Save className="h-4 w-4 mr-1" />
            {isSaving ? "Salvando..." : "Salvar Planejamento Semanal"}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!selectedPeriodId && periods.length > 0 && (
        <Card className="p-8 text-center">
          <Calendar className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Selecione uma medição aprovada para gerar o planejamento semanal</p>
        </Card>
      )}

      {periods.length === 0 && (
        <Card className="p-8 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhuma medição aprovada encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Aprove uma medição no Planejamento por Período primeiro</p>
        </Card>
      )}
    </div>
  );
}
