import React, { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, subDays, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Loader2, CalendarDays, Users, ClipboardCheck, Hammer, AlertTriangle, MessageSquare, CheckCircle2, Camera } from "lucide-react";
import { toast } from "sonner";
import { calculateHouseProgress } from "@/data/constructionData";
import { getCachedPhotoSignedUrl } from "@/lib/photoSignedUrlCache";

type Periodo = "semanal" | "quinzenal" | "mensal" | "personalizado";
type PhotoReportType = "simples" | "gerencial";

const PERIODO_DAYS: Record<Exclude<Periodo, "personalizado">, number> = { semanal: 7, quinzenal: 15, mensal: 30 };

function getPeriodoRange(periodo: Exclude<Periodo, "personalizado">, referenceDate: string) {
  const reference = parseISO(referenceDate);
  if (periodo === "semanal") {
    return {
      inicio: format(startOfWeek(reference, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      fim: format(endOfWeek(reference, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }

  return {
    inicio: format(subDays(reference, PERIODO_DAYS[periodo] - 1), "yyyy-MM-dd"),
    fim: referenceDate,
  };
}

interface DiaryEntryRow {
  id: string;
  entry_date: string;
  engineer_name: string;
  clima: string | null;
  equipe_presente: number | null;
  observacao_geral: string | null;
  status: string;
  status_aprovacao?: string | null;
  mm_chuva?: number | null;
}
interface DiaryItemRow {
  id: string;
  diary_entry_id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
  observacao: string | null;
}
interface HouseProgressRow {
  id: string;
  house_number: number;
  macros: any[];
}
interface WeeklyProductionRow {
  id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  week_start: string;
  week_end: string;
  is_initial_database: boolean;
  deleted_at: string | null;
}
interface WeeklyPlanWeekRow {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
}
interface WeeklyPlanServiceRow {
  id: string;
  weekly_plan_week_id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  planned_house_ids: number[];
  planned_houses: number;
}
interface PhotoReportRow {
  id: string;
  diary_entry_id: string;
  diary_item_id: string | null;
  storage_path: string;
  legenda: string | null;
  house_number: number | null;
  created_at: string | null;
  url: string;
}
interface DeviationRow {
  id: string;
  scope_name: string;
  macro_name: string;
  planned_count: number;
  actual_count: number;
  missing_house_ids: number[] | null;
  severity: string;
  deviation_reason?: string | null;
  week_start: string;
  week_end: string;
}

const SEVERITY_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-300", icon: "🔴" },
  warning: { label: "Alerta", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300", icon: "🟡" },
  info: { label: "Info", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300", icon: "🔵" },
};

const clampPercent = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
};

const serviceKey = (macroId: string | null | undefined, scopeId: string | null | undefined, macroName?: string, scopeName?: string) =>
  `${macroId || macroName || "sem-etapa"}|${scopeId || scopeName || "sem-servico"}`;

const productionPairKey = (houseNumber: number, macroId: string | null | undefined, scopeId: string | null | undefined, macroName?: string, scopeName?: string) =>
  `${houseNumber}|${serviceKey(macroId, scopeId, macroName, scopeName)}`;

const formatHouses = (houses: number[]) =>
  houses.length > 0
    ? [...new Set(houses)].sort((a, b) => a - b).map(n => String(n).padStart(2, "0")).join(", ")
    : "—";

function getHouseScopeProgress(
  house: HouseProgressRow | undefined,
  macroId: string | null | undefined,
  scopeId: string | null | undefined,
  macroName?: string,
  scopeName?: string,
) {
  if (!house || !Array.isArray(house.macros)) return null;
  const normalizedMacroName = macroName?.trim().toLowerCase();
  const normalizedScopeName = scopeName?.trim().toLowerCase();
  const macro = house.macros.find((item: any) =>
    item?.id === macroId ||
    (normalizedMacroName && String(item?.name || "").trim().toLowerCase() === normalizedMacroName)
  );
  const scopes = Array.isArray(macro?.scopes) ? macro.scopes : [];
  const scope = scopes.find((item: any) =>
    item?.id === scopeId ||
    (normalizedScopeName && String(item?.name || "").trim().toLowerCase() === normalizedScopeName)
  );
  return clampPercent(scope?.progress);
}

export default function RelatorioObraView() {
  const { currentProject } = useConstruction();
  const [periodo, setPeriodo] = useState<Periodo>("semanal");
  const initialRange = useMemo(() => getPeriodoRange("semanal", format(new Date(), "yyyy-MM-dd")), []);
  const [dataInicio, setDataInicio] = useState<string>(initialRange.inicio);
  const [dataFim, setDataFim] = useState<string>(initialRange.fim);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const [photoReportType, setPhotoReportType] = useState<PhotoReportType>("simples");

  const [entries, setEntries] = useState<DiaryEntryRow[]>([]);
  const [items, setItems] = useState<DiaryItemRow[]>([]);
  const [photos, setPhotos] = useState<PhotoReportRow[]>([]);
  const [deviations, setDeviations] = useState<DeviationRow[]>([]);
  const [housesProgress, setHousesProgress] = useState<HouseProgressRow[]>([]);
  const [weeklyProductions, setWeeklyProductions] = useState<WeeklyProductionRow[]>([]);
  const [weeklyPlanWeeks, setWeeklyPlanWeeks] = useState<WeeklyPlanWeekRow[]>([]);
  const [weeklyPlanServices, setWeeklyPlanServices] = useState<WeeklyPlanServiceRow[]>([]);

  const handlePeriodoChange = (value: Periodo) => {
    setPeriodo(value);
    if (value !== "personalizado") {
      const range = getPeriodoRange(value, dataFim);
      setDataInicio(range.inicio);
      setDataFim(range.fim);
    }
  };

  const handleDataInicioChange = (value: string) => {
    setDataInicio(value);
    setPeriodo("personalizado");
  };

  const handleDataFimChange = (value: string) => {
    if (periodo === "personalizado") {
      setDataFim(value);
      return;
    }

    const range = getPeriodoRange(periodo, value);
    setDataInicio(range.inicio);
    setDataFim(range.fim);
  };

  useEffect(() => {
    if (!currentProject?.id) return;
    loadData();
  }, [currentProject?.id, dataInicio, dataFim]);

  // Realtime: recarregar quando diary_items, diary_entries ou desvios mudam
  // Pausa o canal quando a aba está oculta para reduzir conexões simultâneas.
  useEffect(() => {
    if (!currentProject?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = () => {
      channel = supabase
        .channel(`relatorio-obra-${currentProject.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "diary_items",
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "diary_entries",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "production_deviations",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "houses",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "weekly_productions",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "weekly_plan_weeks",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "weekly_plan_services",
          filter: `project_id=eq.${currentProject.id}`,
        }, () => loadData())
        .subscribe();
    };

    const handleVisibility = () => {
      if (document.hidden) {
        if (channel) { supabase.removeChannel(channel); channel = null; }
      } else if (!channel) {
        subscribe();
        // Reload garante que nada foi perdido enquanto o canal estava pausado
        loadData();
      }
    };

    subscribe();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentProject?.id]);

  const loadData = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      // 1. Casas e progresso acumulado oficial
      const { data: housesData } = await supabase
        .from("houses")
        .select("id, house_number, macros")
        .eq("project_id", currentProject.id)
        .order("house_number", { ascending: true });
      setHousesProgress(((housesData || []) as any[]).map(house => ({
        id: house.id,
        house_number: Number(house.house_number),
        macros: Array.isArray(house.macros) ? house.macros : [],
      })));

      // 2. Produção semanal direta no intervalo. A tabela nao possui percentual
      // dedicado; quando necessário, o relatório deriva o percentual de houses.macros.
      const { data: weeklyData } = await supabase
        .from("weekly_productions")
        .select("id, macro_id, macro_name, scope_id, scope_name, house_ids, week_start, week_end, is_initial_database, deleted_at")
        .eq("project_id", currentProject.id)
        .lte("week_start", dataFim)
        .gte("week_end", dataInicio)
        .is("deleted_at", null)
        .order("week_start", { ascending: true });
      setWeeklyProductions(((weeklyData || []) as any[]).map(row => ({
        ...row,
        house_ids: (row.house_ids || []).map(Number),
      })));

      // 3. Planejamento semanal liberado no intervalo
      const { data: planWeeksData } = await supabase
        .from("weekly_plan_weeks")
        .select("id, week_start, week_end, status")
        .eq("project_id", currentProject.id)
        .lte("week_start", dataFim)
        .gte("week_end", dataInicio)
        .order("week_start", { ascending: true });
      const planWeeks = (planWeeksData || []) as WeeklyPlanWeekRow[];
      setWeeklyPlanWeeks(planWeeks);

      if (planWeeks.length > 0) {
        const { data: planServicesData } = await supabase
          .from("weekly_plan_services")
          .select("id, weekly_plan_week_id, macro_id, macro_name, scope_id, scope_name, planned_house_ids, planned_houses")
          .in("weekly_plan_week_id", planWeeks.map(week => week.id));
        setWeeklyPlanServices(((planServicesData || []) as any[]).map(row => ({
          ...row,
          planned_house_ids: (row.planned_house_ids || []).map(Number),
          planned_houses: Number(row.planned_houses || (row.planned_house_ids || []).length),
        })));
      } else {
        setWeeklyPlanServices([]);
      }

      // 4. Diary entries
      const { data: entriesData } = await supabase
        .from("diary_entries")
        .select("id, entry_date, engineer_name, clima, equipe_presente, observacao_geral, status, status_aprovacao, mm_chuva")
        .eq("project_id", currentProject.id)
        .gte("entry_date", dataInicio)
        .lte("entry_date", dataFim)
        .order("entry_date", { ascending: false });

      const entryIds = (entriesData || []).map(e => e.id);
      setEntries(entriesData || []);
      if (entryIds.length === 0) {
        setItems([]);
        setPhotos([]);
      } else {
        // 5. Diary items
        let itemsData: DiaryItemRow[] = [];
        const { data } = await supabase
          .from("diary_items")
          .select("id, diary_entry_id, macro_id, macro_name, scope_id, scope_name, house_ids, percentual_executado, observacao")
          .in("diary_entry_id", entryIds)
          .is("deleted_at", null);
        itemsData = (data || []).map(d => ({
          ...d,
          house_ids: d.house_ids || [],
          percentual_executado: Number(d.percentual_executado),
        }));
        setItems(itemsData);

        // 6. Diary photos
        const { data: photosData } = await supabase
          .from("diary_photos")
          .select("id, diary_entry_id, diary_item_id, storage_path, legenda, house_number, created_at")
          .in("diary_entry_id", entryIds)
          .order("created_at", { ascending: true });

        if (!photosData || photosData.length === 0) {
          setPhotos([]);
        } else {
          const photosWithUrls = await Promise.all(
            photosData.map(async (photo: any) => {
              const signedUrl = await getCachedPhotoSignedUrl({
                bucket: "diary-photos",
                path: photo.storage_path,
                transform: { width: 900, resize: "contain", quality: 70 },
              });

              return {
                id: photo.id,
                diary_entry_id: photo.diary_entry_id,
                diary_item_id: photo.diary_item_id,
                storage_path: photo.storage_path,
                legenda: photo.legenda,
                house_number: photo.house_number,
                created_at: photo.created_at,
                url: signedUrl || "",
              } as PhotoReportRow;
            })
          );
          setPhotos(photosWithUrls);
        }
      }

      // 7. Deviations
      const { data: devData } = await supabase
        .from("production_deviations")
        .select("id, scope_name, macro_name, planned_count, actual_count, missing_house_ids, severity, deviation_reason, week_start, week_end")
        .eq("project_id", currentProject.id)
        .gte("week_start", dataInicio)
        .lte("week_end", dataFim);
      setDeviations((devData || []) as DeviationRow[]);
    } catch (err: any) {
      toast.error("Erro ao carregar dados: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // KPIs
  const kpis = useMemo(() => {
    const diasTrabalhados = new Set(
      entries.filter(e => e.status === "finalizado" || items.some(i => i.diary_entry_id === e.id)).map(e => e.entry_date)
    ).size;
    const casasExecutadas = new Set(items.flatMap(i => i.house_ids)).size;
    const servicos = new Set(items.map(i => i.scope_id)).size;
    const equipes = entries.map(e => e.equipe_presente || 0).filter(n => n > 0);
    const equipeMedia = equipes.length > 0 ? Math.round(equipes.reduce((s, n) => s + n, 0) / equipes.length) : 0;
    return { diasTrabalhados, casasExecutadas, servicos, equipeMedia };
  }, [entries, items]);

  const physicalReport = useMemo(() => {
    const templateServices = ((currentProject as any)?.macrosTemplate || [])
      .flatMap((macro: any) => (macro.scopes || []).map((scope: any) => ({
        macroId: macro.id,
        macroName: macro.name,
        scopeId: scope.id,
        scopeName: scope.name,
        weight: Number(scope.weight) || 0,
      })));

    const fallbackServicesMap = new Map<string, { macroId: string; macroName: string; scopeId: string; scopeName: string; weight: number }>();
    const addFallbackService = (macroId: string, macroName: string, scopeId: string, scopeName: string) => {
      const key = serviceKey(macroId, scopeId, macroName, scopeName);
      if (!fallbackServicesMap.has(key)) {
        fallbackServicesMap.set(key, { macroId, macroName, scopeId, scopeName, weight: 1 });
      }
    };

    housesProgress.forEach(house => {
      (house.macros || []).forEach((macro: any) => {
        (macro.scopes || []).forEach((scope: any) => {
          addFallbackService(String(macro.id || macro.name || ""), macro.name || "Etapa", String(scope.id || scope.name || ""), scope.name || "Serviço");
        });
      });
    });
    items.forEach(item => addFallbackService(item.macro_id, item.macro_name, item.scope_id, item.scope_name));
    weeklyProductions.forEach(row => addFallbackService(row.macro_id, row.macro_name, row.scope_id, row.scope_name));

    const services = templateServices.length > 0 ? templateServices : Array.from(fallbackServicesMap.values());
    const serviceWeights = new Map<string, number>();
    services.forEach(service => {
      serviceWeights.set(serviceKey(service.macroId, service.scopeId, service.macroName, service.scopeName), service.weight > 0 ? service.weight : 1);
    });
    const totalServiceWeight = Array.from(serviceWeights.values()).reduce((sum, weight) => sum + weight, 0) || services.length || 1;

    const housesByNumber = new Map(housesProgress.map(house => [Number(house.house_number), house]));
    const diaryPairKeys = new Set<string>();
    const periodPairs = new Map<string, {
      houseNumber: number;
      macroId: string;
      macroName: string;
      scopeId: string;
      scopeName: string;
      periodPercent: number;
      accumulatedPercent: number | null;
      sources: Set<string>;
    }>();

    const addPair = (
      houseNumber: number,
      macroId: string,
      macroName: string,
      scopeId: string,
      scopeName: string,
      percent: number | null,
      source: string,
    ) => {
      if (percent == null) return;
      const key = productionPairKey(houseNumber, macroId, scopeId, macroName, scopeName);
      const current = periodPairs.get(key);
      const accumulatedPercent = getHouseScopeProgress(housesByNumber.get(houseNumber), macroId, scopeId, macroName, scopeName);
      if (!current) {
        periodPairs.set(key, {
          houseNumber,
          macroId,
          macroName,
          scopeId,
          scopeName,
          periodPercent: percent,
          accumulatedPercent,
          sources: new Set([source]),
        });
        return;
      }
      current.periodPercent = Math.min(100, current.periodPercent + percent);
      current.accumulatedPercent = accumulatedPercent ?? current.accumulatedPercent;
      current.sources.add(source);
    };

    items.forEach(item => {
      const percent = clampPercent(item.percentual_executado);
      item.house_ids.forEach(houseNumber => {
        const key = productionPairKey(Number(houseNumber), item.macro_id, item.scope_id, item.macro_name, item.scope_name);
        diaryPairKeys.add(key);
        addPair(Number(houseNumber), item.macro_id, item.macro_name, item.scope_id, item.scope_name, percent, "Diário");
      });
    });

    weeklyProductions.forEach(row => {
      row.house_ids.forEach(houseNumber => {
        const numericHouse = Number(houseNumber);
        const pairKey = productionPairKey(numericHouse, row.macro_id, row.scope_id, row.macro_name, row.scope_name);
        if (diaryPairKeys.has(pairKey)) return;
        const accumulated = getHouseScopeProgress(housesByNumber.get(numericHouse), row.macro_id, row.scope_id, row.macro_name, row.scope_name);
        addPair(
          numericHouse,
          row.macro_id,
          row.macro_name,
          row.scope_id,
          row.scope_name,
          accumulated,
          row.is_initial_database ? "Banco inicial (acumulado atual)" : "Semanal (acumulado atual)",
        );
      });
    });

    const pairRows = Array.from(periodPairs.values());
    const weightedPeriod = pairRows.reduce((sum, pair) => {
      const weight = serviceWeights.get(serviceKey(pair.macroId, pair.scopeId, pair.macroName, pair.scopeName)) || 1;
      return sum + pair.periodPercent * weight;
    }, 0);
    const periodProgressPercent = housesProgress.length > 0
      ? Math.round((weightedPeriod / (housesProgress.length * totalServiceWeight)) * 10) / 10
      : 0;

    const accumulatedProgressPercent = housesProgress.length > 0
      ? Math.round(
          housesProgress.reduce((sum, house) => sum + calculateHouseProgress(house as any, (currentProject as any)?.macrosTemplate), 0) /
          housesProgress.length * 10
        ) / 10
      : 0;

    const servicesMap = new Map<string, {
      macro: string;
      scope: string;
      houses: Set<number>;
      periodValues: number[];
      accumulatedValues: number[];
      sources: Set<string>;
    }>();
    pairRows.forEach(pair => {
      const key = serviceKey(pair.macroId, pair.scopeId, pair.macroName, pair.scopeName);
      if (!servicesMap.has(key)) {
        servicesMap.set(key, {
          macro: pair.macroName,
          scope: pair.scopeName,
          houses: new Set<number>(),
          periodValues: [],
          accumulatedValues: [],
          sources: new Set<string>(),
        });
      }
      const group = servicesMap.get(key)!;
      group.houses.add(pair.houseNumber);
      group.periodValues.push(pair.periodPercent);
      if (pair.accumulatedPercent != null) group.accumulatedValues.push(pair.accumulatedPercent);
      pair.sources.forEach(source => group.sources.add(source));
    });

    const servicesPeriod = Array.from(servicesMap.values()).map(group => ({
      macro: group.macro,
      scope: group.scope,
      housesArr: Array.from(group.houses).sort((a, b) => a - b),
      houses: formatHouses(Array.from(group.houses)),
      periodPercent: group.periodValues.length > 0
        ? Math.round((group.periodValues.reduce((sum, value) => sum + value, 0) / group.periodValues.length) * 10) / 10
        : null,
      accumulatedPercent: group.accumulatedValues.length > 0
        ? Math.round((group.accumulatedValues.reduce((sum, value) => sum + value, 0) / group.accumulatedValues.length) * 10) / 10
        : null,
      sources: Array.from(group.sources).join(", "),
    })).sort((a, b) => a.macro.localeCompare(b.macro) || a.scope.localeCompare(b.scope));

    const pairProgressByKey = new Map(pairRows.map(pair => [
      productionPairKey(pair.houseNumber, pair.macroId, pair.scopeId, pair.macroName, pair.scopeName),
      pair.periodPercent,
    ]));

    const planningComparison = weeklyPlanServices.map(plan => {
      const plannedHouses = (plan.planned_house_ids || []).map(Number);
      const executedValues = plannedHouses.map(houseNumber =>
        pairProgressByKey.get(productionPairKey(houseNumber, plan.macro_id, plan.scope_id, plan.macro_name, plan.scope_name)) || 0
      );
      const executedAverage = executedValues.length > 0
        ? Math.round((executedValues.reduce((sum, value) => sum + value, 0) / executedValues.length) * 10) / 10
        : 0;
      const executedHouses = plannedHouses.filter((_, index) => executedValues[index] > 0);
      const status = executedAverage >= 100 ? "Atendido" : executedAverage > 0 ? "Parcial" : "Não iniciado";
      return {
        macro: plan.macro_name,
        scope: plan.scope_name,
        plannedHouses,
        plannedCount: plan.planned_houses || plannedHouses.length,
        executedHouses,
        executedAverage,
        diff: Math.round((executedAverage - 100) * 10) / 10,
        status,
      };
    }).sort((a, b) => a.macro.localeCompare(b.macro) || a.scope.localeCompare(b.scope));

    return {
      periodProgressPercent,
      accumulatedProgressPercent,
      servicesPeriod,
      housesWithProgress: new Set(pairRows.map(pair => pair.houseNumber)).size,
      servicesWithProgress: servicesPeriod.length,
      planningComparison,
      hasWeeklyPlanning: weeklyPlanWeeks.length > 0 && weeklyPlanServices.length > 0,
    };
  }, [currentProject, housesProgress, items, weeklyProductions, weeklyPlanServices, weeklyPlanWeeks.length]);

  const photosByServicePeriod = useMemo(() => {
    const itemMap = new Map(items.map(item => [item.id, item]));
    const entryMap = new Map(entries.map(entry => [entry.id, entry]));
    const seenPhotos = new Set<string>();
    const map = new Map<string, {
      diary_item_id: string;
      entry_date: string;
      macro_id: string;
      macro_name: string;
      scope_id: string;
      scope_name: string;
      house_ids: number[];
      percentual_executado: number;
      observacao: string | null;
      photos: PhotoReportRow[];
    }>();

    for (const photo of photos) {
      if (!photo.diary_item_id) continue;
      const photoKey = photo.id || photo.storage_path;
      if (seenPhotos.has(photoKey)) continue;
      seenPhotos.add(photoKey);

      const item = itemMap.get(photo.diary_item_id);
      const entry = entryMap.get(photo.diary_entry_id);
      if (!item || !entry) continue;

      if (!map.has(photo.diary_item_id)) {
        map.set(photo.diary_item_id, {
          diary_item_id: photo.diary_item_id,
          entry_date: entry.entry_date,
          macro_id: item.macro_id,
          macro_name: item.macro_name,
          scope_id: item.scope_id,
          scope_name: item.scope_name,
          house_ids: item.house_ids,
          percentual_executado: item.percentual_executado,
          observacao: item.observacao,
          photos: [],
        });
      }

      map.get(photo.diary_item_id)!.photos.push(photo);
    }

    return Array.from(map.values());
  }, [entries, items, photos]);

  const generalPhotosPeriod = useMemo(() => {
    const seenPhotos = new Set<string>();
    const linkedPhotoKeys = new Set(
      photos
        .filter(photo => photo.diary_item_id)
        .map(photo => photo.id || photo.storage_path)
    );
    return photos.filter(photo => {
      if (photo.diary_item_id) return false;
      const photoKey = photo.id || photo.storage_path;
      if (linkedPhotoKeys.has(photoKey)) return false;
      if (seenPhotos.has(photoKey)) return false;
      seenPhotos.add(photoKey);
      return true;
    });
  }, [photos]);

  const eapPhysicalSummary = useMemo(() => {
    const linkedPhotoCountByItem = new Map<string, number>();
    photosByServicePeriod.forEach(group => {
      linkedPhotoCountByItem.set(group.diary_item_id, group.photos.length);
    });

    const map = new Map<string, {
      macroName: string;
      scopeIds: Set<string>;
      houses: Set<number>;
      percentages: number[];
      linkedPhotos: number;
      hasIncompleteData: boolean;
    }>();

    items.forEach(item => {
      const macroKey = item.macro_id || item.macro_name || "sem-etapa";
      const macroName = item.macro_name?.trim() || "Etapa nao informada";
      if (!map.has(macroKey)) {
        map.set(macroKey, {
          macroName,
          scopeIds: new Set<string>(),
          houses: new Set<number>(),
          percentages: [],
          linkedPhotos: 0,
          hasIncompleteData: false,
        });
      }

      const group = map.get(macroKey)!;
      const scopeKey = item.scope_id || item.scope_name;
      if (scopeKey) group.scopeIds.add(scopeKey);
      else group.hasIncompleteData = true;

      item.house_ids.forEach(house => group.houses.add(house));

      if (Number.isFinite(item.percentual_executado)) {
        group.percentages.push(item.percentual_executado);
      } else {
        group.hasIncompleteData = true;
      }

      group.linkedPhotos += linkedPhotoCountByItem.get(item.id) || 0;
      if (!item.macro_name || !item.scope_name) group.hasIncompleteData = true;
    });

    return Array.from(map.values())
      .map(group => ({
        macroName: group.macroName,
        servicesCount: group.scopeIds.size,
        housesCount: group.houses.size,
        avgPercent: group.percentages.length > 0
          ? Math.round(group.percentages.reduce((sum, value) => sum + value, 0) / group.percentages.length)
          : null,
        linkedPhotos: group.linkedPhotos,
        hasIncompleteData: group.hasIncompleteData,
      }))
      .sort((a, b) => a.macroName.localeCompare(b.macroName));
  }, [items, photosByServicePeriod]);

  const photoKpis = useMemo(() => {
    const linkedPhotos = photos.filter(photo => photo.diary_item_id).length;
    const daysWithPhotos = new Set(photos.map(photo => photo.diary_entry_id)).size;

    return {
      totalPhotos: photos.length,
      linkedPhotos,
      generalPhotos: generalPhotosPeriod.length,
      servicesWithPhotos: photosByServicePeriod.length,
      daysWithPhotos,
    };
  }, [generalPhotosPeriod.length, photos, photosByServicePeriod.length]);

  // Atividades agrupadas
  const atividadesAgrupadas = useMemo(() => {
    const map = new Map<string, { macro: string; scope: string; casas: number[]; pcts: number[] }>();
    for (const item of items) {
      const key = `${item.macro_id}|${item.scope_id}`;
      if (!map.has(key)) {
        map.set(key, { macro: item.macro_name, scope: item.scope_name, casas: [], pcts: [] });
      }
      const entry = map.get(key)!;
      entry.casas.push(...item.house_ids);
      entry.pcts.push(item.percentual_executado);
    }
    return Array.from(map.values()).map(g => ({
      macro: g.macro,
      scope: g.scope,
      casasArr: [...new Set(g.casas)].sort((a, b) => a - b),
      casas: [...new Set(g.casas)].sort((a, b) => a - b).map(n => String(n).padStart(2, "0")).join(", "),
      pctMedio: Math.round(g.pcts.reduce((s, p) => s + p, 0) / g.pcts.length),
    }));
  }, [items]);

  const observacoes = useMemo(() => {
    return entries
      .filter(e => e.observacao_geral && e.observacao_geral.trim().length > 0)
      .map(e => ({ data: e.entry_date, texto: e.observacao_geral!, engenheiro: e.engineer_name }));
  }, [entries]);

  // IDC e clima
  const climaStats = useMemo(() => {
    const totalDias = entries.length;
    const chuvosos = entries.filter(e => (e.clima || "").toLowerCase().includes("chuv")).length;
    const praticaveis = totalDias - chuvosos;
    const mmAcumulado = entries.reduce((s, e) => s + Number(e.mm_chuva || 0), 0);
    const idc = totalDias > 0 ? Math.round((praticaveis / totalDias) * 100) : 0;
    return { totalDias, chuvosos, praticaveis, mmAcumulado: Math.round(mmAcumulado * 10) / 10, idc };
  }, [entries]);

  // Status RDOs
  const rdoStatus = useMemo(() => {
    const aprovado = entries.filter(e => e.status_aprovacao === "aprovado").length;
    const revisando = entries.filter(e => e.status_aprovacao === "revisando").length;
    const preenchendo = entries.filter(e => e.status_aprovacao === "preenchendo" || !e.status_aprovacao).length;
    return { aprovado, revisando, preenchendo, total: entries.length };
  }, [entries]);

  // Curva S — % executado acumulado por dia
  const curvaS = useMemo(() => {
    // Soma percentuais por dia, divididos pelo nº de casas, normalizando por casa-serviço
    const byDay = new Map<string, number>();
    for (const e of entries) byDay.set(e.entry_date, 0);
    for (const it of items) {
      const ent = entries.find(e => e.id === it.diary_entry_id);
      if (!ent) continue;
      const peso = (it.percentual_executado / 100) * it.house_ids.length;
      byDay.set(ent.entry_date, (byDay.get(ent.entry_date) || 0) + peso);
    }
    const ordered = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
    let acum = 0;
    return ordered.map(([d, v]) => ({ data: d, dia: v, acum: (acum += v) }));
  }, [entries, items]);

  const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();

      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleGeneratePhotoPDF = async (reportType: PhotoReportType = photoReportType) => {
    if (!currentProject) return;
    setExportingPhotos(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      const footerH = 14;
      const contentW = pageW - margin * 2;
      const periodText = `${format(parseISO(dataInicio), "dd/MM/yyyy")} a ${format(parseISO(dataFim), "dd/MM/yyyy")}`;
      const issuedAt = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
      const projectLocation =
        (currentProject as any).location ||
        (currentProject as any).address ||
        (currentProject as any).endereco ||
        "";
      const isManagerial = reportType === "gerencial";
      const allHouseNumbers = new Set<number>();

      photosByServicePeriod.forEach(group => {
        group.house_ids.forEach(house => allHouseNumbers.add(house));
        group.photos.forEach(photo => {
          if (photo.house_number != null) allHouseNumbers.add(photo.house_number);
        });
      });
      generalPhotosPeriod.forEach(photo => {
        if (photo.house_number != null) allHouseNumbers.add(photo.house_number);
      });

      const ensurePage = (y: number, needed = 20) => {
        if (y + needed <= pageH - footerH) return y;
        doc.addPage();
        return margin;
      };

      const drawUnavailable = (x: number, y: number, w: number, h: number) => {
        doc.setDrawColor(200);
        doc.setFillColor(245, 245, 245);
        doc.rect(x, y, w, h, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text("Imagem indisponível", x + w / 2, y + h / 2, { align: "center" });
        doc.setTextColor(30);
      };

      const addWrappedText = (text: string, x: number, y: number, maxW: number, lineH = 5) => {
        const lines = doc.splitTextToSize(text, maxW);
        doc.text(lines, x, y);
        return y + lines.length * lineH;
      };

      const drawSimpleTable = (
        startY: number,
        headers: string[],
        rows: Array<Array<string | number>>,
        columnWidths: number[],
      ) => {
        let tableY = startY;
        const rowH = 8;

        tableY = ensurePage(tableY, rowH * 2);
        doc.setFillColor(37, 99, 235);
        doc.setDrawColor(37, 99, 235);
        doc.rect(margin, tableY - 5, contentW, rowH, "FD");
        doc.setTextColor(255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        let x = margin + 2;
        headers.forEach((header, index) => {
          doc.text(header, x, tableY);
          x += columnWidths[index];
        });
        tableY += rowH;

        doc.setTextColor(30);
        doc.setFont("helvetica", "normal");
        rows.forEach((row, rowIndex) => {
          tableY = ensurePage(tableY, rowH + 2);
          if (rowIndex % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, tableY - 5, contentW, rowH, "F");
          }

          let cellX = margin + 2;
          row.forEach((cell, index) => {
            const text = doc.splitTextToSize(String(cell), columnWidths[index] - 3);
            doc.text(text.slice(0, 2), cellX, tableY);
            cellX += columnWidths[index];
          });
          tableY += rowH;
        });

        return tableY + 4;
      };

      const renderPhotoCell = async (
        photo: PhotoReportRow,
        x: number,
        y: number,
        cellW: number,
        imageH: number,
        meta: string
      ) => {
        doc.setDrawColor(215);
        doc.rect(x, y, cellW, imageH);
        const dataUrl = await loadImageAsDataUrl(photo.url);

        if (dataUrl) {
          try {
            const imageFormat = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(dataUrl, imageFormat, x, y, cellW, imageH, undefined, "FAST");
          } catch {
            drawUnavailable(x, y, cellW, imageH);
          }
        } else {
          drawUnavailable(x, y, cellW, imageH);
        }

        let captionY = y + imageH + 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        captionY = addWrappedText(meta, x, captionY, cellW, 4);

        if (photo.legenda) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          captionY = addWrappedText(photo.legenda, x, captionY + 1, cellW, 4);
        }

        return captionY + 3;
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("RELATÓRIO FOTOGRÁFICO DA MEDIÇÃO", margin, 24);
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.8);
      doc.line(margin, 29, pageW - margin, 29);

      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(currentProject.name, margin, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      let y = 50;
      if (projectLocation) {
        doc.text(`Local da obra: ${projectLocation}`, margin, y);
        y += 7;
      }
      doc.text(`Período: ${periodText}`, margin, y);
      y += 7;
      doc.text(`Emissão: ${issuedAt}`, margin, y);
      y += 7;
      doc.text(`Tipo: ${isManagerial ? "Gerencial" : "Simples"}`, margin, y);
      y += 12;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Resumo fotográfico", margin, y);
      y += 8;

      const summaryRows = [
        ["Total de fotos", photoKpis.totalPhotos],
        ["Fotos vinculadas a serviços", photoKpis.linkedPhotos],
        ["Fotos avulsas", photoKpis.generalPhotos],
        ["Serviços com fotos", photoKpis.servicesWithPhotos],
        ["Dias com registros fotográficos", photoKpis.daysWithPhotos],
        ["Casas registradas", allHouseNumbers.size],
      ];

      doc.setFontSize(10);
      summaryRows.forEach(([label, value]) => {
        doc.setFont("helvetica", "normal");
        doc.text(String(label), margin, y);
        doc.setFont("helvetica", "bold");
        doc.text(String(value), pageW - margin, y, { align: "right" });
        y += 7;
      });

      y += 8;

      if (photos.length === 0) {
        y = ensurePage(y, 24);
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(245, 158, 11);
        doc.rect(margin, y - 5, contentW, 18, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(120, 53, 15);
        y = addWrappedText(
          "Nenhuma foto foi encontrada no periodo selecionado. O relatorio foi emitido para registrar a ausencia de fotos neste intervalo.",
          margin + 3,
          y + 2,
          contentW - 6,
          5,
        );
        doc.setTextColor(30);
        y += 8;
      }

      if (isManagerial) {
        y = ensurePage(y, 34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Resumo fisico por EAP/etapa", margin, y);
        y += 8;

        if (eapPhysicalSummary.length === 0) {
          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, y - 5, contentW, 18, "FD");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          y = addWrappedText(
            "Nao ha servicos vinculados suficientes no periodo para calcular o resumo fisico por EAP. O registro fotografico segue disponivel abaixo.",
            margin + 3,
            y + 2,
            contentW - 6,
            5,
          );
          y += 8;
        } else {
          const rows = eapPhysicalSummary.map(row => [
            row.macroName,
            row.servicesCount,
            row.housesCount,
            row.avgPercent == null ? "N/D" : `${row.avgPercent}%`,
            row.linkedPhotos,
          ]);
          y = drawSimpleTable(y, ["Etapa/EAP", "Serv.", "Casas", "% medio", "Fotos"], rows, [72, 22, 24, 30, 22]);

          if (eapPhysicalSummary.some(row => row.hasIncompleteData)) {
            y = ensurePage(y, 16);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100);
            y = addWrappedText(
              "Observacao: alguns lancamentos nao possuem etapa, servico ou percentual completo; estes itens foram mantidos no relatorio com os dados disponiveis.",
              margin,
              y,
              contentW,
              4,
            );
            doc.setTextColor(30);
            y += 4;
          }
        }

        y += 6;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Registro fotográfico por serviço", margin, y);
      y += 8;

      const serviceGroupsByDate = new Map<string, typeof photosByServicePeriod>();
      photosByServicePeriod
        .slice()
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.macro_name.localeCompare(b.macro_name) || a.scope_name.localeCompare(b.scope_name))
        .forEach(group => {
          if (!serviceGroupsByDate.has(group.entry_date)) serviceGroupsByDate.set(group.entry_date, []);
          serviceGroupsByDate.get(group.entry_date)!.push(group);
        });

      for (const [entryDate, groups] of serviceGroupsByDate.entries()) {
        y = ensurePage(y, 24);
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(191, 219, 254);
        doc.rect(margin, y - 5, contentW, 9, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30);
        doc.text(format(parseISO(entryDate), "dd/MM/yyyy"), margin + 3, y + 1);
        y += 12;

        for (const group of groups) {
          y = ensurePage(y, 36);
          const houses = group.house_ids.length > 0
            ? group.house_ids.map(n => String(n).padStart(2, "0")).join(", ")
            : "Não informado";

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          y = addWrappedText(`${group.macro_name} / ${group.scope_name}`, margin, y, contentW, 5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          y = addWrappedText(`Casas vinculadas: ${houses} · Percentual executado: ${group.percentual_executado}%`, margin, y + 1, contentW, 4);

          if (group.observacao) {
            y = addWrappedText(`Observação: ${group.observacao}`, margin, y + 1, contentW, 4);
          }
          y += 4;

          const gap = 6;
          const cellW = (contentW - gap) / 2;
          const imageH = 62;
          const minCellH = imageH + 18;

          for (let i = 0; i < group.photos.length; i += 2) {
            y = ensurePage(y, minCellH);
            const rowPhotos = group.photos.slice(i, i + 2);
            let rowBottom = y;

            for (let col = 0; col < rowPhotos.length; col++) {
              const photo = rowPhotos[col];
              const x = margin + col * (cellW + gap);
              const metaParts = [];
              if (photo.house_number != null) metaParts.push(`Casa ${String(photo.house_number).padStart(2, "0")}`);
              if (photo.created_at) metaParts.push(format(parseISO(photo.created_at), "dd/MM/yyyy HH:mm"));
              const meta = metaParts.join(" · ") || format(parseISO(entryDate), "dd/MM/yyyy");
              const bottom = await renderPhotoCell(photo, x, y, cellW, imageH, meta);
              rowBottom = Math.max(rowBottom, bottom);
            }

            y = rowBottom + 4;
          }

          y += 4;
        }
      }

      if (generalPhotosPeriod.length > 0) {
        y = ensurePage(y, 28);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("FOTOS GERAIS / AVULSAS DO PERÍODO", margin, y);
        y += 8;

        const entryMap = new Map(entries.map(entry => [entry.id, entry]));
        const sortedGeneralPhotos = generalPhotosPeriod
          .slice()
          .sort((a, b) => {
            const dateA = entryMap.get(a.diary_entry_id)?.entry_date || "";
            const dateB = entryMap.get(b.diary_entry_id)?.entry_date || "";
            return dateA.localeCompare(dateB) || (a.created_at || "").localeCompare(b.created_at || "");
          });

        const gap = 6;
        const cellW = (contentW - gap) / 2;
        const imageH = 62;
        const minCellH = imageH + 18;

        for (let i = 0; i < sortedGeneralPhotos.length; i += 2) {
          y = ensurePage(y, minCellH);
          const rowPhotos = sortedGeneralPhotos.slice(i, i + 2);
          let rowBottom = y;

          for (let col = 0; col < rowPhotos.length; col++) {
            const photo = rowPhotos[col];
            const entryDate = entryMap.get(photo.diary_entry_id)?.entry_date;
            const metaParts = [];
            if (entryDate) metaParts.push(format(parseISO(entryDate), "dd/MM/yyyy"));
            if (photo.house_number != null) metaParts.push(`Casa ${String(photo.house_number).padStart(2, "0")}`);
            const bottom = await renderPhotoCell(photo, margin + col * (cellW + gap), y, cellW, imageH, metaParts.join(" · ") || "Foto avulsa");
            rowBottom = Math.max(rowBottom, bottom);
          }

          y = rowBottom + 4;
        }
      }

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(80);
        doc.text(currentProject.name, margin, pageH - 10);
        doc.text(`Período: ${periodText}`, margin, pageH - 5);
        doc.text(`Página ${page}/${pageCount}`, pageW - margin, pageH - 10, { align: "right" });
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text("© ObraMap | Engenharia Digital", pageW - margin, pageH - 5, { align: "right" });
      }

      const safeName = currentProject.name.replace(/[^\w\-]+/g, "_");
      const typeSuffix = isManagerial ? "gerencial" : "simples";
      doc.save(`relatorio-fotografico-${typeSuffix}-${safeName}-${dataInicio}-${dataFim}.pdf`);
      toast.success("Relatório fotográfico gerado!");
    } catch (err: any) {
      toast.error("Erro ao gerar relatório fotográfico: " + (err.message || ""));
    } finally {
      setExportingPhotos(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!currentProject) return;
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable = autoTableMod.default;

      const doc = new jsPDF({ orientation: "portrait", format: "a4" });

      // Título
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`Relatório de Obra — ${currentProject.name}`, 14, 22);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Período: ${format(parseISO(dataInicio), "dd/MM/yyyy")} a ${format(parseISO(dataFim), "dd/MM/yyyy")} (${periodo})`,
        14, 30
      );

      // Resumo
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Resumo do período", 14, 40);
      autoTable(doc, {
        startY: 44,
        head: [["Indicador", "Valor"]],
        body: [
          ["Dias trabalhados", String(kpis.diasTrabalhados)],
          ["Total casas executadas", String(kpis.casasExecutadas)],
          ["Serviços distintos", String(kpis.servicos)],
          ["Equipe média/dia", String(kpis.equipeMedia)],
          ["IDC — Índice de Dias Praticáveis", `${climaStats.idc}% (${climaStats.praticaveis}/${climaStats.totalDias})`],
          ["Dias com chuva", String(climaStats.chuvosos)],
          ["Pluviometria acumulada", `${climaStats.mmAcumulado} mm`],
          ["RDOs aprovados", `${rdoStatus.aprovado} / ${rdoStatus.total}`],
          ["RDOs em revisão", String(rdoStatus.revisando)],
          ["RDOs em preenchimento", String(rdoStatus.preenchendo)],
        ],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });

      // Evolucao fisica
      let cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Evolucao fisica no periodo", 14, cursorY);
      autoTable(doc, {
        startY: cursorY + 4,
        head: [["Etapa/EAP", "Servico", "Casas", "% Periodo", "Acumulado", "Fonte"]],
        body: physicalReport.servicesPeriod.length > 0
          ? physicalReport.servicesPeriod.map(row => [
              row.macro,
              row.scope,
              row.houses,
              row.periodPercent == null ? "—" : `${row.periodPercent}%`,
              row.accumulatedPercent == null ? "—" : `${row.accumulatedPercent}%`,
              row.sources,
            ])
          : [["—", "Sem avanco fisico no periodo", "—", "—", "—", "—"]],
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8, cellWidth: "auto" },
        columnStyles: { 2: { cellWidth: 45 }, 5: { cellWidth: 32 } },
      });

      cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Planejado x Executado", 14, cursorY);
      autoTable(doc, {
        startY: cursorY + 4,
        head: [["Etapa/EAP", "Servico", "Planejado", "Executado", "% Exec.", "Status"]],
        body: physicalReport.hasWeeklyPlanning
          ? physicalReport.planningComparison.map(row => [
              row.macro,
              row.scope,
              formatHouses(row.plannedHouses),
              formatHouses(row.executedHouses),
              `${row.executedAverage}%`,
              row.status,
            ])
          : [["—", "Sem planejamento semanal lancado para este periodo", "—", "—", "—", "—"]],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8, cellWidth: "auto" },
        columnStyles: { 2: { cellWidth: 42 }, 3: { cellWidth: 42 } },
      });

      // Atividades
      cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Atividades executadas", 14, cursorY);
      autoTable(doc, {
        startY: cursorY + 4,
        head: [["Etapa", "Serviço", "Casas", "% Médio"]],
        body: atividadesAgrupadas.length > 0
          ? atividadesAgrupadas.map(a => [a.macro, a.scope, a.casas, `${a.pctMedio}%`])
          : [["—", "Sem lançamentos no período", "—", "—"]],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8, cellWidth: "auto" },
        columnStyles: { 2: { cellWidth: 70 } },
      });

      // Desvios
      cursorY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Desvios do período", 14, cursorY);
      if (deviations.length > 0) {
        autoTable(doc, {
          startY: cursorY + 4,
          head: [["Severidade", "Etapa", "Serviço", "Planejado", "Executado", "Faltantes"]],
          body: deviations.map(d => [
            (SEVERITY_BADGE[d.severity]?.label || d.severity),
            d.macro_name,
            d.scope_name,
            String(d.planned_count),
            String(d.actual_count),
            (d.missing_house_ids || []).map(n => String(n).padStart(2, "0")).join(", ") || "—",
          ]),
          theme: "grid",
          headStyles: { fillColor: [220, 38, 38] },
          styles: { fontSize: 8 },
        });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text("Nenhum desvio registrado no período.", 14, cursorY + 8);
      }

      // Observações
      cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 8;
      if (observacoes.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Observações do período", 14, cursorY);
        autoTable(doc, {
          startY: cursorY + 4,
          head: [["Data", "Engenheiro", "Observação"]],
          body: observacoes.map(o => [
            format(parseISO(o.data), "dd/MM/yyyy"),
            o.engenheiro,
            o.texto,
          ]),
          theme: "striped",
          headStyles: { fillColor: [37, 99, 235] },
          styles: { fontSize: 8 },
          columnStyles: { 2: { cellWidth: 110 } },
        });
      }

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageH = doc.internal.pageSize.getHeight();
        const pageW = doc.internal.pageSize.getWidth();
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80);
        doc.text(
          `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} • Página ${i} de ${pageCount}`,
          14, pageH - 8
        );
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text("© 2026 ObraMap | Engenharia Digital", pageW / 2, pageH - 3, { align: "center" });
      }

      const safeName = currentProject.name.replace(/[^\w\-]+/g, "_");
      doc.save(`relatorio-${safeName}-${format(parseISO(dataFim), "yyyy-MM-dd")}.pdf`);
      toast.success("Relatório gerado!");
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err.message || ""));
    } finally {
      setExporting(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <FileText className="h-16 w-16 text-muted-foreground" />
        <p className="text-muted-foreground">Selecione uma obra para gerar o relatório.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={periodo} onValueChange={(v) => handlePeriodoChange(v as Periodo)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanal">Semanal (7 dias)</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal (15 dias)</SelectItem>
                  <SelectItem value="mensal">Mensal (30 dias)</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Data Início</label>
              <Input type="date" value={dataInicio} onChange={(e) => handleDataInicioChange(e.target.value)} className="mt-1" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
              <Input type="date" value={dataFim} onChange={(e) => handleDataFimChange(e.target.value)} className="mt-1" />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              Período analisado: <span className="font-semibold">{format(parseISO(dataInicio), "dd/MM/yyyy")}</span> até{" "}
              <span className="font-semibold">{format(parseISO(dataFim), "dd/MM/yyyy")}</span>
            </div>
            <Button onClick={handleGeneratePDF} disabled={exporting || loading} className="ml-auto">
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Gerar PDF
            </Button>
            <div className="min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Tipo fotografico</label>
              <Select value={photoReportType} onValueChange={(value) => setPhotoReportType(value as PhotoReportType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simples">Simples</SelectItem>
                  <SelectItem value="gerencial">Gerencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => handleGeneratePhotoPDF()} disabled={exportingPhotos || loading} variant="outline">
              {exportingPhotos ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
              Gerar Relatório Fotográfico
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<CalendarDays />} label="Dias trabalhados" value={kpis.diasTrabalhados} color="text-blue-600" />
        <KpiCard icon={<ClipboardCheck />} label="Casas executadas" value={kpis.casasExecutadas} color="text-emerald-600" />
        <KpiCard icon={<Hammer />} label="Serviços distintos" value={kpis.servicos} color="text-amber-600" />
        <KpiCard icon={<Users />} label="Equipe média/dia" value={kpis.equipeMedia} color="text-purple-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolução física da obra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Avanço no período" value={`${physicalReport.periodProgressPercent}%`} />
            <MetricCard label="Acumulado da obra" value={`${physicalReport.accumulatedProgressPercent}%`} />
            <MetricCard label="Casas com avanço" value={String(physicalReport.housesWithProgress)} />
            <MetricCard label="Serviços com avanço" value={String(physicalReport.servicesWithProgress)} />
          </div>
          <p className="text-xs text-muted-foreground">
            O acumulado usa houses.macros como fonte oficial. O avanço do período respeita percentuais parciais do Diário e,
            para registros semanais sem percentual próprio, usa o acumulado atual da casa/serviço.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Serviços executados no período</CardTitle>
        </CardHeader>
        <CardContent>
          {physicalReport.servicesPeriod.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum avanço físico encontrado no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa/EAP</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Casas</TableHead>
                    <TableHead className="text-right">% no período</TableHead>
                    <TableHead className="text-right">Acumulado atual</TableHead>
                    <TableHead>Fonte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {physicalReport.servicesPeriod.map((row, index) => (
                    <TableRow key={`${row.macro}-${row.scope}-${index}`}>
                      <TableCell className="font-medium">{row.macro}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[360px]">{row.houses}</TableCell>
                      <TableCell className="text-right font-semibold">{row.periodPercent == null ? "—" : `${row.periodPercent}%`}</TableCell>
                      <TableCell className="text-right">{row.accumulatedPercent == null ? "—" : `${row.accumulatedPercent}%`}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.sources}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Planejado x Executado no período</CardTitle>
        </CardHeader>
        <CardContent>
          {!physicalReport.hasWeeklyPlanning ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem planejamento semanal lançado para este período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa/EAP</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Casas planejadas</TableHead>
                    <TableHead>Casas executadas</TableHead>
                    <TableHead className="text-right">% executado</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {physicalReport.planningComparison.map((row, index) => (
                    <TableRow key={`${row.macro}-${row.scope}-${index}`}>
                      <TableCell className="font-medium">{row.macro}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatHouses(row.plannedHouses)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatHouses(row.executedHouses)}</TableCell>
                      <TableCell className="text-right font-semibold">{row.executedAverage}%</TableCell>
                      <TableCell className="text-right">{row.diff}%</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "Atendido" ? "default" : row.status === "Parcial" ? "secondary" : "outline"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Fotos do Diário no período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <PhotoKpi label="Fotos no período" value={photoKpis.totalPhotos} />
            <PhotoKpi label="Fotos vinculadas a serviço" value={photoKpis.linkedPhotos} />
            <PhotoKpi label="Fotos avulsas" value={photoKpis.generalPhotos} />
            <PhotoKpi label="Serviços com fotos" value={photoKpis.servicesWithPhotos} />
            <PhotoKpi label="Dias com fotos" value={photoKpis.daysWithPhotos} />
          </div>
        </CardContent>
      </Card>

      {/* Clima/IDC + RDOs status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Clima e Praticabilidade</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">IDC (Dias Praticáveis)</span><span className="font-bold">{climaStats.idc}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dias praticáveis</span><span>{climaStats.praticaveis} / {climaStats.totalDias}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Dias com chuva</span><span>{climaStats.chuvosos}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Pluviometria acumulada</span><span className="font-semibold">{climaStats.mmAcumulado} mm</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Status dos RDOs no período</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total de RDOs</span><span className="font-bold">{rdoStatus.total}</span></div>
            <div className="flex justify-between"><span className="text-emerald-600">Aprovados</span><span>{rdoStatus.aprovado}</span></div>
            <div className="flex justify-between"><span className="text-amber-600">Em revisão</span><span>{rdoStatus.revisando}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Em preenchimento</span><span>{rdoStatus.preenchendo}</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Curva S — execução acumulada */}
      {curvaS.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Curva S — Execução acumulada (casas-serviço)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Data</TableHead><TableHead className="text-right">Dia</TableHead><TableHead className="text-right">Acumulado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {curvaS.map(c => (
                    <TableRow key={c.data}>
                      <TableCell>{format(parseISO(c.data), "dd/MM")}</TableCell>
                      <TableCell className="text-right">{c.dia.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">{c.acum.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Atividades */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atividades executadas no período</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : atividadesAgrupadas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum lançamento no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Casas executadas</TableHead>
                    <TableHead className="text-right">% médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atividadesAgrupadas.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{a.macro}</TableCell>
                      <TableCell>{a.scope}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[400px]">{a.casas}</TableCell>
                      <TableCell className="text-right font-bold">{a.pctMedio}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desvios */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Desvios do período
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deviations.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">Nenhum desvio no período</div>
                <div className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Todas as metas planejadas foram atingidas.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {deviations.map(d => {
                const sev = SEVERITY_BADGE[d.severity] || SEVERITY_BADGE.info;
                return (
                  <div key={d.id} className={`p-3 rounded-lg border ${sev.cls}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={sev.cls}>{sev.icon} {sev.label}</Badge>
                          <span className="font-semibold text-sm">{d.macro_name} — {d.scope_name}</span>
                        </div>
                        <div className="text-xs mt-1 opacity-90">
                          Planejado: <strong>{d.planned_count}</strong> casas • Executado: <strong>{d.actual_count}</strong>
                          {d.missing_house_ids && d.missing_house_ids.length > 0 && (
                            <> • Faltantes: {d.missing_house_ids.map(n => String(n).padStart(2, "0")).join(", ")}</>
                          )}
                        </div>
                        {d.deviation_reason && (
                          <div className="text-xs italic opacity-80 mt-1">"{d.deviation_reason}"</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Observações */}
      {observacoes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Observações do período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {observacoes.map((o, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-1">
                    {format(parseISO(o.data), "dd/MM/yyyy", { locale: ptBR })} • {o.engenheiro}
                  </div>
                  <div className="text-sm">{o.texto}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className={`${color}`}>{icon}</div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function PhotoKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
