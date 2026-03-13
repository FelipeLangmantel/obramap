import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

export function PleGridTab({ groups, events, measurements, entries, currentProject, setEntry, getMeasurementNumber, isSaving }: Props) {
  const totalHouses = currentProject?.total_houses || 50;
  const houseNumbers = useMemo(() => Array.from({ length: totalHouses }, (_, i) => i + 1), [totalHouses]);

  const [activeMeasurementNum, setActiveMeasurementNum] = useState<number | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const paintingRef = useRef(false);
  const erasingRef = useRef(false);

  // Set default active measurement
  useEffect(() => {
    if (activeMeasurementNum === null && measurements.length > 0) {
      setActiveMeasurementNum(measurements[measurements.length - 1].measurement_number);
    }
  }, [measurements, activeMeasurementNum]);

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

  const gridRows = useMemo(() => {
    const result: { type: "stage" | "substage" | "event"; stage?: typeof stages[0]; substage?: typeof substages[0]; event?: typeof events[0] }[] = [];
    stages.forEach(stage => {
      result.push({ type: "stage", stage });
      const subs = substages.filter(s => s.parent_id === stage.id);
      subs.forEach(sub => {
        result.push({ type: "substage", substage: sub });
        const subEvents = events.filter(e => e.group_id === sub.id).sort((a, b) => a.display_order - b.display_order);
        subEvents.forEach(ev => result.push({ type: "event", event: ev }));
      });
    });
    return result;
  }, [events, stages, substages]);

  const measurementColors = useMemo(() => {
    const colors = [
      "bg-green-600/30 text-green-300", "bg-blue-600/30 text-blue-300",
      "bg-amber-600/30 text-amber-300", "bg-purple-600/30 text-purple-300",
      "bg-cyan-600/30 text-cyan-300", "bg-pink-600/30 text-pink-300",
      "bg-red-600/30 text-red-300", "bg-emerald-600/30 text-emerald-300",
    ];
    const map: Record<number, string> = {};
    measurements.forEach((m, i) => { map[m.measurement_number] = colors[i % colors.length]; });
    return map;
  }, [measurements]);

  const handlePaint = useCallback(async (eventId: string, houseNumber: number) => {
    if (!activeMeasurementNum) return;
    const measurement = measurements.find(m => m.measurement_number === activeMeasurementNum);
    if (!measurement) return;
    const currentNum = getMeasurementNumber(eventId, houseNumber);
    if (currentNum === activeMeasurementNum) return; // already painted
    await setEntry(eventId, houseNumber, measurement.id);
  }, [activeMeasurementNum, measurements, setEntry, getMeasurementNumber]);

  const handleErase = useCallback(async (eventId: string, houseNumber: number) => {
    const currentNum = getMeasurementNumber(eventId, houseNumber);
    if (!currentNum) return; // already empty
    await setEntry(eventId, houseNumber, null);
  }, [setEntry, getMeasurementNumber]);

  const handleCellMouseDown = useCallback((e: React.MouseEvent, eventId: string, houseNumber: number) => {
    e.preventDefault();
    if (e.button === 2) {
      // Right-click = erase
      erasingRef.current = true;
      setIsErasing(true);
      handleErase(eventId, houseNumber);
    } else if (e.button === 0) {
      // Left-click = paint
      paintingRef.current = true;
      setIsPainting(true);
      handlePaint(eventId, houseNumber);
    }
  }, [handlePaint, handleErase]);

  const handleCellMouseEnter = useCallback((eventId: string, houseNumber: number) => {
    if (paintingRef.current) {
      handlePaint(eventId, houseNumber);
    } else if (erasingRef.current) {
      handleErase(eventId, houseNumber);
    }
  }, [handlePaint, handleErase]);

  const handleMouseUp = useCallback(() => {
    paintingRef.current = false;
    erasingRef.current = false;
    setIsPainting(false);
    setIsErasing(false);
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
        <span>
          <strong>Clique e arraste</strong> para pintar células com a medição selecionada.{" "}
          <strong>Botão direito</strong> para apagar.
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-muted-foreground">Medição ativa:</span>
          <Select
            value={activeMeasurementNum?.toString() || ""}
            onValueChange={v => setActiveMeasurementNum(parseInt(v))}
          >
            <SelectTrigger className="w-[140px] h-7 text-xs">
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {measurements.map(m => (
                <SelectItem key={m.id} value={m.measurement_number.toString()}>
                  Med {m.measurement_number}
                </SelectItem>
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

      <div className="flex-1 overflow-auto select-none">
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
                <div key={`s-${row.stage.id}`} className="flex bg-primary/15 border-b">
                  <div className="sticky left-0 z-10 bg-primary/15 flex">
                    <div className="w-10 h-7 flex items-center justify-center text-[10px] font-extrabold text-primary border-r">{row.stage.code}</div>
                    <div className="w-52 h-7 flex items-center px-2 text-[10px] font-extrabold text-primary tracking-wide">
                      {row.stage.name.toUpperCase()}
                    </div>
                  </div>
                </div>
              );
            }
            if (row.type === "substage" && row.substage) {
              return (
                <div key={`sub-${row.substage.id}`} className="flex bg-accent/40 border-b">
                  <div className="sticky left-0 z-10 bg-accent/40 flex">
                    <div className="w-10 h-7 flex items-center justify-center text-[10px] font-bold text-foreground border-r">{row.substage.code}</div>
                    <div className="w-52 h-7 flex items-center px-2 text-[10px] font-bold text-foreground">
                      {row.substage.name}
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
                      <div
                        key={n}
                        className={cn(
                          "w-10 h-7 flex items-center justify-center border-r cursor-pointer transition-colors",
                          measNum ? measurementColors[measNum] : "hover:bg-accent/30",
                          isPainting && "cursor-crosshair",
                          isErasing && "cursor-not-allowed"
                        )}
                        onMouseDown={e => handleCellMouseDown(e, ev.id, n)}
                        onMouseEnter={() => handleCellMouseEnter(ev.id, n)}
                      >
                        {measNum && (
                          <span className="text-[10px] font-mono font-bold">{measNum}</span>
                        )}
                      </div>
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
