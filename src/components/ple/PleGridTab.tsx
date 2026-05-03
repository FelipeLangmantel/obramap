import { useMemo, useCallback, useRef, useState, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronsUpDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

const compareCodeParts = (a: string, b: string) => {
  const aParts = String(a || "").split(".");
  const bParts = String(b || "").split(".");
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;

    const aNum = Number(aPart);
    const bNum = Number(bPart);
    const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum) && aPart.trim() !== "" && bPart.trim() !== "";
    const result = bothNumeric
      ? aNum - bNum
      : aPart.localeCompare(bPart, "pt-BR", { numeric: true, sensitivity: "base" });
    if (result !== 0) return result;
  }
  return 0;
};

const compareNaturalOrder = (
  a: { display_order?: number | null },
  b: { display_order?: number | null },
  aCode: string | null | undefined,
  bCode: string | null | undefined,
  aLabel: string | null | undefined,
  bLabel: string | null | undefined,
) => {
  const codeResult = compareCodeParts(aCode || "", bCode || "");
  if (codeResult !== 0) return codeResult;
  const orderResult = Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
  if (orderResult !== 0) return orderResult;
  return String(aLabel || "").localeCompare(String(bLabel || ""), "pt-BR", { numeric: true, sensitivity: "base" });
};

// Memoized cell - ultra lightweight
const GridCell = memo(function GridCell({
  measNum, colorClass, wasGlossed, isApproved, isLocked,
  onMouseDown, onMouseEnter, cellKey,
}: {
  measNum: number | null; colorClass: string;
  wasGlossed: boolean; isApproved: boolean; isLocked: boolean;
  onMouseDown: (e: React.MouseEvent, key: string) => void;
  onMouseEnter: (key: string) => void;
  cellKey: string;
}) {
  let cellClass = "";
  if (measNum && isApproved) {
    cellClass = "bg-muted text-muted-foreground";
  } else if (wasGlossed && !measNum) {
    cellClass = "bg-amber-100/50 dark:bg-amber-900/20";
  } else if (measNum) {
    cellClass = colorClass;
  } else if (!isLocked) {
    cellClass = "hover:bg-accent/30";
  }

  return (
    <div
      className={cn(
        "w-10 h-7 flex items-center justify-center border-r transition-none",
        isLocked ? "cursor-default opacity-70" : "cursor-pointer",
        cellClass
      )}
      onMouseDown={e => onMouseDown(e, cellKey)}
      onMouseEnter={() => onMouseEnter(cellKey)}
    >
      {measNum && <span className="text-[10px] font-mono font-bold">{measNum}</span>}
    </div>
  );
});

export function PleGridTab({ groups, events, measurements, entries, glosses, currentProject, setEntry, getMeasurementNumber, isSaving }: Props) {
  const totalHouses = currentProject?.total_houses || 50;
  const houseNumbers = useMemo(() => Array.from({ length: totalHouses }, (_, i) => i + 1), [totalHouses]);
  const isMobile = useIsMobile();

  const [activeMeasurementNum, setActiveMeasurementNum] = useState<number | null>(null);
  const paintingRef = useRef(false);
  const erasingRef = useRef(false);
  const [cursorMode, setCursorMode] = useState<"" | "paint" | "erase">("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.map(g => g.id)));

  // Optimistic local entries for instant UI
  const [localEntries, setLocalEntries] = useState<Map<string, string | null>>(new Map());
  const pendingOpsRef = useRef<Map<string, { eventId: string; houseNumber: number; measurementId: string | null }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeMeasurementNum === null && measurements.length > 0) {
      setActiveMeasurementNum(measurements[measurements.length - 1].measurement_number);
    }
  }, [measurements, activeMeasurementNum]);

  // Auto-expand all on desktop
  useEffect(() => {
    if (!isMobile) {
      setExpandedGroups(new Set(groups.map(g => g.id)));
    }
  }, [groups, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    setExpandedGroups(prev => {
      const next = new Set(prev);
      groups.forEach(g => { if (!prev.has(g.id)) next.add(g.id); });
      return next;
    });
  }, [groups, isMobile]);

  const stages = useMemo(
    () => groups.filter(g => !g.parent_id).sort((a, b) => compareNaturalOrder(a, b, a.code, b.code, a.name, b.name)),
    [groups]
  );
  const substages = useMemo(
    () => groups.filter(g => g.parent_id).sort((a, b) => compareNaturalOrder(a, b, a.code, b.code, a.name, b.name)),
    [groups]
  );

  const allExpanded = useMemo(() => groups.length > 0 && groups.every(g => expandedGroups.has(g.id)), [groups, expandedGroups]);
  const toggleAll = () => {
    setExpandedGroups(allExpanded ? new Set() : new Set(groups.map(g => g.id)));
  };
  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const gridRows = useMemo(() => {
    const result: { type: "stage" | "substage" | "event"; stage?: typeof stages[0]; substage?: typeof substages[0]; event?: typeof events[0] }[] = [];
    stages.forEach(stage => {
      result.push({ type: "stage", stage });
      if (!expandedGroups.has(stage.id)) return;
      const subs = substages.filter(s => s.parent_id === stage.id);
      subs.forEach(sub => {
        result.push({ type: "substage", substage: sub });
        if (!expandedGroups.has(sub.id)) return;
        const subEvents = events
          .filter(e => e.group_id === sub.id)
          .sort((a, b) => compareNaturalOrder(a, b, a.item_code, b.item_code, a.description, b.description));
        subEvents.forEach(ev => result.push({ type: "event", event: ev }));
      });
    });
    return result;
  }, [events, stages, substages, expandedGroups]);

  const measurementColors = useMemo(() => {
    const colors = [
      "bg-green-600/30 text-green-800 dark:text-green-300",
      "bg-blue-600/30 text-blue-800 dark:text-blue-300",
      "bg-amber-600/30 text-amber-800 dark:text-amber-300",
      "bg-purple-600/30 text-purple-800 dark:text-purple-300",
      "bg-cyan-600/30 text-cyan-800 dark:text-cyan-300",
      "bg-pink-600/30 text-pink-800 dark:text-pink-300",
      "bg-red-600/30 text-red-800 dark:text-red-300",
      "bg-emerald-600/30 text-emerald-800 dark:text-emerald-300",
    ];
    const map: Record<number, string> = {};
    measurements.forEach((m, i) => { map[m.measurement_number] = colors[i % colors.length]; });
    return map;
  }, [measurements]);

  // Build lookup maps for O(1) access
  const entryMap = useMemo(() => {
    const map = new Map<string, { measurement_id: string; measurement_number: number }>();
    entries.forEach(e => {
      const m = measurements.find(m => m.id === e.measurement_id);
      if (m) map.set(`${e.event_id}:${e.house_number}`, { measurement_id: e.measurement_id, measurement_number: m.measurement_number });
    });
    return map;
  }, [entries, measurements]);

  const approvedMeasurementIds = useMemo(() => {
    const s = new Set<string>();
    measurements.forEach(m => {
      if (m.status === "approved" || m.status === "approved_with_glosses") s.add(m.id);
    });
    return s;
  }, [measurements]);

  // Active measurement object
  const activeMeasurement = useMemo(() => 
    measurements.find(m => m.measurement_number === activeMeasurementNum) || null,
    [measurements, activeMeasurementNum]
  );

  // Is the active measurement approved? If so, block all editing
  const isActiveMeasurementApproved = useMemo(() => 
    activeMeasurement ? approvedMeasurementIds.has(activeMeasurement.id) : false,
    [activeMeasurement, approvedMeasurementIds]
  );

  const resolvedGlossKeys = useMemo(() => {
    const s = new Set<string>();
    glosses.filter(g => g.resolved).forEach(g => s.add(`${g.event_id}:${g.house_number}`));
    return s;
  }, [glosses]);

  const unresolvedGlossKeys = useMemo(() => {
    const s = new Set<string>();
    glosses.filter(g => !g.resolved).forEach(g => s.add(`${g.event_id}:${g.house_number}`));
    return s;
  }, [glosses]);

  // Flush pending DB operations in batch
  const flushPendingOps = useCallback(() => {
    const ops = new Map(pendingOpsRef.current);
    pendingOpsRef.current.clear();
    ops.forEach(({ eventId, houseNumber, measurementId }) => {
      setEntry(eventId, houseNumber, measurementId);
    });
  }, [setEntry]);

  const scheduledFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPendingOps, 150);
  }, [flushPendingOps]);

  // Flush on mouse up
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushPendingOps();
      }
    };
  }, [flushPendingOps]);

  // Get effective measurement number (local override or from entries)
  const getEffectiveMeasNum = useCallback((key: string): number | null => {
    if (localEntries.has(key)) {
      const mId = localEntries.get(key);
      if (!mId) return null;
      const m = measurements.find(m => m.id === mId);
      return m?.measurement_number || null;
    }
    const entry = entryMap.get(key);
    return entry?.measurement_number || null;
  }, [localEntries, entryMap, measurements]);

  const getEffectiveMeasId = useCallback((key: string): string | null => {
    if (localEntries.has(key)) {
      return localEntries.get(key) || null;
    }
    const entry = entryMap.get(key);
    return entry?.measurement_id || null;
  }, [localEntries, entryMap]);

  const handlePaint = useCallback((eventId: string, houseNumber: number) => {
    if (!activeMeasurementNum || !activeMeasurement) return;
    if (isActiveMeasurementApproved) {
      toast.error("Medição aprovada! Não é possível editar.");
      return;
    }

    const key = `${eventId}:${houseNumber}`;
    const currentMeasId = getEffectiveMeasId(key);
    
    // If cell already has an entry from an approved measurement, block
    if (currentMeasId && approvedMeasurementIds.has(currentMeasId)) return;
    
    // If cell already has the same measurement, skip
    if (currentMeasId === activeMeasurement.id) return;

    // Optimistic update
    setLocalEntries(prev => new Map(prev).set(key, activeMeasurement.id));
    pendingOpsRef.current.set(key, { eventId, houseNumber, measurementId: activeMeasurement.id });
    scheduledFlush();
  }, [activeMeasurementNum, activeMeasurement, isActiveMeasurementApproved, getEffectiveMeasId, approvedMeasurementIds, scheduledFlush]);

  const handleErase = useCallback((eventId: string, houseNumber: number) => {
    const key = `${eventId}:${houseNumber}`;
    const currentMeasId = getEffectiveMeasId(key);
    if (!currentMeasId) return;

    // Block erasing approved measurement entries
    if (approvedMeasurementIds.has(currentMeasId)) {
      toast.error("Medição aprovada! Não é possível apagar.");
      return;
    }

    // Optimistic update
    setLocalEntries(prev => new Map(prev).set(key, null));
    pendingOpsRef.current.set(key, { eventId, houseNumber, measurementId: null });
    scheduledFlush();
  }, [getEffectiveMeasId, approvedMeasurementIds, scheduledFlush]);

  // Parse cellKey -> eventId, houseNumber
  const parseCellKey = useCallback((key: string) => {
    const parts = key.split(":");
    return { eventId: parts[0], houseNumber: parseInt(parts[1]) };
  }, []);

  const handleCellMouseDown = useCallback((e: React.MouseEvent, cellKey: string) => {
    e.preventDefault();
    const { eventId, houseNumber } = parseCellKey(cellKey);
    if (e.button === 2) {
      erasingRef.current = true;
      setCursorMode("erase");
      handleErase(eventId, houseNumber);
    } else if (e.button === 0) {
      paintingRef.current = true;
      setCursorMode("paint");
      handlePaint(eventId, houseNumber);
    }
  }, [handlePaint, handleErase, parseCellKey]);

  const handleCellMouseEnter = useCallback((cellKey: string) => {
    const { eventId, houseNumber } = parseCellKey(cellKey);
    if (paintingRef.current) handlePaint(eventId, houseNumber);
    else if (erasingRef.current) handleErase(eventId, houseNumber);
  }, [handlePaint, handleErase, parseCellKey]);

  const handleMouseUp = useCallback(() => {
    paintingRef.current = false;
    erasingRef.current = false;
    setCursorMode("");
    // Flush immediately on mouse up
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushPendingOps();
    // Clear local entries after a delay to let real entries propagate
    setTimeout(() => setLocalEntries(new Map()), 500);
  }, [flushPendingOps]);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum serviço cadastrado. Use "Lançamento do Contrato" para adicionar eventos.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border rounded-lg overflow-hidden h-full flex flex-col" onContextMenu={e => e.preventDefault()}>
        {/* Toolbar */}
        <div className="bg-accent/30 px-3 py-1.5 text-xs border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-7">
              <ChevronsUpDown className="h-3.5 w-3.5" /> {allExpanded ? "Recolher Tudo" : "Expandir Tudo"}
            </Button>
            <span className="hidden sm:inline text-muted-foreground">
              <strong>Clique e arraste</strong> para pintar. <strong>Botão direito</strong> para apagar.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-muted-foreground hidden sm:inline">Medição ativa:</span>
            <Select value={activeMeasurementNum?.toString() || ""} onValueChange={v => setActiveMeasurementNum(parseInt(v))}>
              <SelectTrigger className="w-[120px] h-7 text-xs">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {measurements.map(m => (
                  <SelectItem key={m.id} value={m.measurement_number.toString()}>
                    Med {m.measurement_number} {(m.status === "approved" || m.status === "approved_with_glosses") ? "✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isActiveMeasurementApproved && (
              <span className="text-[10px] text-destructive font-bold animate-pulse">🔒 Aprovada</span>
            )}
            <div className="hidden sm:flex gap-1.5 flex-wrap">
              {measurements.map(m => (
                <span key={m.id} className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono font-bold", measurementColors[m.measurement_number])}>
                  Med {m.measurement_number}
                </span>
              ))}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">Aprovado</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-100/50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">Glossado</span>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className={cn("flex-1 overflow-auto select-none", cursorMode === "paint" && "cursor-crosshair", cursorMode === "erase" && "cursor-not-allowed")}>
          <div className="min-w-max">
            {/* Sticky header */}
            <div className="flex sticky top-0 z-10 bg-background border-b">
              <div className="sticky left-0 z-20 bg-background flex border-r">
                <div className="w-10 h-8 flex items-center justify-center text-[10px] font-bold text-muted-foreground border-r">Nº</div>
                <div className="w-52 h-8 flex items-center px-2 text-[10px] font-bold text-muted-foreground">Título dos Eventos</div>
              </div>
              {houseNumbers.map(n => (
                <div key={n} className="w-10 h-8 flex items-center justify-center text-[9px] font-bold text-muted-foreground border-r">{n}</div>
              ))}
            </div>

            {gridRows.map((row) => {
              if (row.type === "stage" && row.stage) {
                return (
                  <div key={`s-${row.stage.id}`} className="flex bg-primary/15 border-b cursor-pointer" onClick={() => toggleGroup(row.stage!.id)}>
                    <div className="sticky left-0 z-10 bg-primary/15 flex">
                      <div className="w-10 h-7 flex items-center justify-center text-[10px] font-extrabold text-primary border-r">{row.stage.code}</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="w-52 h-7 flex items-center px-2 text-[10px] font-extrabold text-primary tracking-wide truncate">
                            {expandedGroups.has(row.stage.id) ? "▾" : "▸"} {row.stage.name.toUpperCase()}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="font-bold">{row.stage.code} – {row.stage.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              }
              if (row.type === "substage" && row.substage) {
                return (
                  <div key={`sub-${row.substage.id}`} className="flex bg-accent/40 border-b cursor-pointer" onClick={() => toggleGroup(row.substage!.id)}>
                    <div className="sticky left-0 z-10 bg-accent/40 flex">
                      <div className="w-10 h-7 flex items-center justify-center text-[10px] font-bold text-foreground border-r">{row.substage.code}</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="w-52 h-7 flex items-center px-2 text-[10px] font-bold text-foreground truncate">
                            {expandedGroups.has(row.substage.id) ? "▾" : "▸"} {row.substage.name}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="font-semibold">{row.substage.code} – {row.substage.name}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              }
              if (row.type === "event" && row.event) {
                const ev = row.event;
                return (
                  <div key={ev.id} className="flex border-b hover:bg-accent/10">
                    <div className="sticky left-0 z-10 bg-background flex border-r">
                      <div className="w-10 h-7 flex items-center justify-center text-[9px] font-mono text-muted-foreground border-r">{ev.item_code}</div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="w-52 h-7 flex items-center px-2 text-[9px] truncate pl-4">{ev.description}</div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <p><span className="font-mono text-muted-foreground">{ev.item_code}</span> – {ev.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    {houseNumbers.map(n => {
                      const key = `${ev.id}:${n}`;
                      const measNum = getEffectiveMeasNum(key);
                      const measId = getEffectiveMeasId(key);
                      const isApproved = measId ? approvedMeasurementIds.has(measId) : false;
                      const isLocked = isApproved || isActiveMeasurementApproved;
                      const wasGlossed = unresolvedGlossKeys.has(key) || resolvedGlossKeys.has(key);
                      return (
                        <GridCell
                          key={n}
                          cellKey={key}
                          measNum={measNum}
                          colorClass={measNum ? measurementColors[measNum] : ""}
                          wasGlossed={wasGlossed && !measNum}
                          isApproved={isApproved}
                          isLocked={isLocked}
                          onMouseDown={handleCellMouseDown}
                          onMouseEnter={handleCellMouseEnter}
                        />
                      );
                    })}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
