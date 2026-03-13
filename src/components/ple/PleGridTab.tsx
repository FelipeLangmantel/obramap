import { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { usePleData } from "@/hooks/usePleData";
import type { PleMeasurement } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface Props extends PleDataReturn {
  selectedMeasurement: PleMeasurement | null;
}

export function PleGridTab({ groups, events, measurements, entries, currentProject, setEntry, getMeasurementNumber, isSaving }: Props) {
  const totalHouses = currentProject?.total_houses || 50;
  const houseNumbers = useMemo(() => Array.from({ length: totalHouses }, (_, i) => i + 1), [totalHouses]);

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

  // Build 3-level grid rows
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

  const handleCellChange = useCallback(async (eventId: string, houseNumber: number, value: string) => {
    const num = parseInt(value);
    if (value === "" || value === "0") { await setEntry(eventId, houseNumber, null); return; }
    if (isNaN(num)) return;
    const measurement = measurements.find(m => m.measurement_number === num);
    if (!measurement) return;
    await setEntry(eventId, houseNumber, measurement.id);
  }, [measurements, setEntry]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Nenhum serviço cadastrado. Use "Lançamento do Contrato" para adicionar eventos.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden h-full flex flex-col">
      <div className="bg-accent/30 px-4 py-2 text-xs border-b flex items-center justify-between">
        <span>Informe o <strong>NÚMERO DA MEDIÇÃO</strong> em que os eventos foram concluídos</span>
        <div className="flex gap-2">
          {measurements.map(m => (
            <span key={m.id} className={cn("px-2 py-0.5 rounded text-[10px] font-mono font-bold", measurementColors[m.measurement_number])}>
              Med {m.measurement_number}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
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
                      <div key={n} className={cn("w-10 h-7 flex items-center justify-center border-r", measNum ? measurementColors[measNum] : "")}>
                        <input
                          className="w-full h-full text-center text-[10px] font-mono font-bold bg-transparent border-none outline-none cursor-pointer"
                          value={measNum || ""}
                          onChange={e => handleCellChange(ev.id, n, e.target.value)}
                          disabled={isSaving}
                        />
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
