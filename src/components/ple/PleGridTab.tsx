import { useMemo, useCallback, useRef, useState, useEffect, memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsUpDown } from "lucide-react";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

// Memoized cell to avoid re-rendering all cells on every state change
const GridCell = memo(function GridCell({
  eventId, houseNumber, measNum, colorClass, onMouseDown, onMouseEnter,
}: {
  eventId: string; houseNumber: number; measNum: number | null; colorClass: string;
  onMouseDown: (e: React.MouseEvent, eventId: string, houseNumber: number) => void;
  onMouseEnter: (eventId: string, houseNumber: number) => void;
}) {
  return (
    <div
      className={cn(
        "w-10 h-7 flex items-center justify-center border-r cursor-pointer transition-none",
        measNum ? colorClass : "hover:bg-accent/30"
      )}
      onMouseDown={e => onMouseDown(e, eventId, houseNumber)}
      onMouseEnter={() => onMouseEnter(eventId, houseNumber)}
    >
      {measNum && <span className="text-[10px] font-mono font-bold">{measNum}</span>}
    </div>
  );
});

export function PleGridTab({ groups, events, measurements, entries, currentProject, setEntry, getMeasurementNumber, isSaving }: Props) {
  const totalHouses = currentProject?.total_houses || 50;
  const houseNumbers = useMemo(() => Array.from({ length: totalHouses }, (_, i) => i + 1), [totalHouses]);

  const [activeMeasurementNum, setActiveMeasurementNum] = useState<number | null>(null);
  const paintingRef = useRef(false);
  const erasingRef = useRef(false);
  const [cursorMode, setCursorMode] = useState<"" | "paint" | "erase">("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.map(g => g.id)));

  // Set default active measurement
  useEffect(() => {
    if (activeMeasurementNum === null && measurements.length > 0) {
      setActiveMeasurementNum(measurements[measurements.length - 1].measurement_number);
    }
  }, [measurements, activeMeasurementNum]);

  // Keep expanded in sync with new groups
  useEffect(() => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      groups.forEach(g => { if (!prev.has(g.id)) next.add(g.id); });
      return next;
    });
  }, [groups]);

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

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
        const subEvents = events.filter(e => e.group_id === sub.id).sort((a, b) => a.display_order - b.display_order);
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

  // Use a queue to avoid blocking the UI thread during rapid painting
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const handlePaint = useCallback((eventId: string, houseNumber: number) => {
    if (!activeMeasurementNum) return;
    const measurement = measurements.find(m => m.measurement_number === activeMeasurementNum);
    if (!measurement) return;
    const currentNum = getMeasurementNumber(eventId, houseNumber);
    if (currentNum === activeMeasurementNum) return;
    // Queue the operation so we don't await in the mouse handler
    queueRef.current = queueRef.current.then(() => setEntry(eventId, houseNumber, measurement.id));
  }, [activeMeasurementNum, measurements, setEntry, getMeasurementNumber]);

  const handleErase = useCallback((eventId: string, houseNumber: number) => {
    const currentNum = getMeasurementNumber(eventId, houseNumber);
    if (!currentNum) return;
    queueRef.current = queueRef.current.then(() => setEntry(eventId, houseNumber, null));
  }, [setEntry, getMeasurementNumber]);

  const handleCellMouseDown = useCallback((e: React.MouseEvent, eventId: string, houseNumber: number) => {
    e.preventDefault();
    if (e.button === 2) {
      erasingRef.current = true;
      setCursorMode("erase");
      handleErase(eventId, houseNumber);
    } else if (e.button === 0) {
      paintingRef.current = true;
      setCursorMode("paint");
      handlePaint(eventId, houseNumber);
    }
  }, [handlePaint, handleErase]);

  const handleCellMouseEnter = useCallback((eventId: string, houseNumber: number) => {
    if (paintingRef.current) handlePaint(eventId, houseNumber);
    else if (erasingRef.current) handleErase(eventId, houseNumber);
  }, [handlePaint, handleErase]);

  const handleMouseUp = useCallback(() => {
    paintingRef.current = false;
    erasingRef.current = false;
    setCursorMode("");
  }, []);

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
    <div className="border rounded-lg overflow-hidden h-full flex flex-col" onContextMenu={e => e.preventDefault()}>
      <div className="bg-accent/30 px-4 py-2 text-xs border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-7">
            <ChevronsUpDown className="h-3.5 w-3.5" /> {allExpanded ? "Recolher Tudo" : "Expandir Tudo"}
          </Button>
          <span>
            <strong>Clique e arraste</strong> para pintar. <strong>Botão direito</strong> para apagar.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-muted-foreground">Medição ativa:</span>
          <Select value={activeMeasurementNum?.toString() || ""} onValueChange={v => setActiveMeasurementNum(parseInt(v))}>
            <SelectTrigger className="w-[140px] h-7 text-xs">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {measurements.map(m => (
                <SelectItem key={m.id} value={m.measurement_number.toString()}>Med {m.measurement_number}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {measurements.map(m => (
              <span key={m.id} className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold", measurementColors[m.measurement_number])}>
                Med {m.measurement_number}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={cn("flex-1 overflow-auto select-none", cursorMode === "paint" && "cursor-crosshair", cursorMode === "erase" && "cursor-not-allowed")}>
        <div className="min-w-max">
          {/* Header */}
          <div className="flex sticky top-0 z-10 bg-background border-b">
            <div className="sticky left-0 z-20 bg-background flex border-r">
              <div className="w-10 h-8 flex items-center justify-center text-[10px] font-bold text-muted-foreground border-r">Nº</div>
              <div className="w-52 h-8 flex items-center px-2 text-[10px] font-bold text-muted-foreground">Título dos Eventos</div>
            </div>
            {houseNumbers.map(n => (
              <div key={n} className="w-10 h-8 flex items-center justify-center text-[9px] font-bold text-muted-foreground border-r">{n}</div>
            ))}
          </div>

          {/* Rows */}
          {gridRows.map((row) => {
            if (row.type === "stage" && row.stage) {
              return (
                <div key={`s-${row.stage.id}`} className="flex bg-primary/15 border-b cursor-pointer" onClick={() => toggleGroup(row.stage!.id)}>
                  <div className="sticky left-0 z-10 bg-primary/15 flex">
                    <div className="w-10 h-7 flex items-center justify-center text-[10px] font-extrabold text-primary border-r">{row.stage.code}</div>
                    <div className="w-52 h-7 flex items-center px-2 text-[10px] font-extrabold text-primary tracking-wide">
                      {expandedGroups.has(row.stage.id) ? "▾" : "▸"} {row.stage.name.toUpperCase()}
                    </div>
                  </div>
                </div>
              );
            }
            if (row.type === "substage" && row.substage) {
              return (
                <div key={`sub-${row.substage.id}`} className="flex bg-accent/40 border-b cursor-pointer" onClick={() => toggleGroup(row.substage!.id)}>
                  <div className="sticky left-0 z-10 bg-accent/40 flex">
                    <div className="w-10 h-7 flex items-center justify-center text-[10px] font-bold text-foreground border-r">{row.substage.code}</div>
                    <div className="w-52 h-7 flex items-center px-2 text-[10px] font-bold text-foreground">
                      {expandedGroups.has(row.substage.id) ? "▾" : "▸"} {row.substage.name}
                    </div>
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
                    <div className="w-52 h-7 flex items-center px-2 text-[9px] truncate pl-4" title={ev.description}>{ev.description}</div>
                  </div>
                  {houseNumbers.map(n => {
                    const measNum = getMeasurementNumber(ev.id, n);
                    return (
                      <GridCell
                        key={n}
                        eventId={ev.id}
                        houseNumber={n}
                        measNum={measNum}
                        colorClass={measNum ? measurementColors[measNum] : ""}
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
  );
}
