import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CheckCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import type { PleEvent, PleEventGroup, PleMeasurement, PleEntry } from "@/hooks/usePleData";

export interface PleGloss {
  id: string;
  ple_project_id: string;
  measurement_id: string;
  event_id: string;
  house_number: number;
  glossed_by: string | null;
  glossed_at: string;
  resolved: boolean;
  resolved_measurement_id: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  measurement: PleMeasurement;
  entries: PleEntry[];
  events: PleEvent[];
  groups: PleEventGroup[];
  glosses: PleGloss[];
  totalHouses: number;
  onToggleGloss: (eventId: string, houseNumber: number, measurementId: string) => void;
  onApproveMeasurement: (measurementId: string, hasGlosses: boolean) => void;
}

export function PleAuditDialog({
  open, onClose, measurement, entries, events, groups, glosses,
  onToggleGloss, onApproveMeasurement,
}: Props) {
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const measEntries = useMemo(() =>
    entries.filter(e => e.measurement_id === measurement.id),
    [entries, measurement.id]
  );

  const measGlosses = useMemo(() =>
    glosses.filter(g => g.measurement_id === measurement.id && !g.resolved),
    [glosses, measurement.id]
  );

  const glossSet = useMemo(() => {
    const s = new Set<string>();
    measGlosses.forEach(g => s.add(`${g.event_id}:${g.house_number}`));
    return s;
  }, [measGlosses]);

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substages = useMemo(() => groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);

  const measuredEventIds = useMemo(() => new Set(measEntries.map(e => e.event_id)), [measEntries]);
  const measuredEvents = useMemo(() => events.filter(e => measuredEventIds.has(e.id)), [events, measuredEventIds]);

  const housesPerEvent = useMemo(() => {
    const map: Record<string, number[]> = {};
    measEntries.forEach(e => {
      if (!map[e.event_id]) map[e.event_id] = [];
      map[e.event_id].push(e.house_number);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => a - b));
    return map;
  }, [measEntries]);

  const totalGlosses = measGlosses.length;
  const totalEntries = measEntries.length;

  const totalValor = useMemo(() => {
    let v = 0;
    measuredEvents.forEach(ev => {
      const count = housesPerEvent[ev.id]?.length || 0;
      v += (ev.quantity * ev.unit_value) * count;
    });
    return v;
  }, [measuredEvents, housesPerEvent]);

  const glossedValor = useMemo(() => {
    let v = 0;
    measGlosses.forEach(g => {
      const ev = events.find(e => e.id === g.event_id);
      if (ev) v += ev.quantity * ev.unit_value;
    });
    return v;
  }, [measGlosses, events]);

  const handleApprove = () => {
    onApproveMeasurement(measurement.id, totalGlosses > 0);
    onClose();
  };

  const isGlossed = (eventId: string, houseNumber: number) => glossSet.has(`${eventId}:${houseNumber}`);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 sm:gap-3 flex-wrap text-sm sm:text-base">
            <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Aferição – Med. {measurement.measurement_number}
            {measurement.period_label && (
              <Badge variant="outline" className="font-normal text-[10px] sm:text-xs">{measurement.period_label}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="rounded-lg p-2 sm:p-3 text-center border border-border bg-muted/50">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Lançado</div>
            <div className="text-sm sm:text-lg font-bold text-foreground">{totalEntries} itens</div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 text-center border border-border bg-muted/50">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Valor</div>
            <div className="text-xs sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtCur(totalValor)}</div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 text-center border border-border bg-muted/50">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">Glossas</div>
            <div className={cn("text-sm sm:text-lg font-bold", totalGlosses > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
              {totalGlosses}
            </div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 text-center border border-border bg-muted/50">
            <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase font-medium">V. Glossado</div>
            <div className={cn("text-xs sm:text-lg font-bold", glossedValor > 0 ? "text-destructive" : "text-muted-foreground")}>
              {fmtCur(glossedValor)}
            </div>
          </div>
        </div>

        <p className="text-[10px] sm:text-xs text-muted-foreground">
          Toque nas casas para marcar/desmarcar <strong className="text-destructive">glossa</strong>.
        </p>

        {/* Grid */}
        <ScrollArea className="flex-1 border border-border rounded-lg min-h-0">
          <div className="min-w-max" onContextMenu={e => e.preventDefault()}>
            {stages.map(stage => {
              const subs = substages.filter(s => s.parent_id === stage.id);
              const stageEvents = measuredEvents.filter(ev => {
                if (ev.group_id === stage.id) return true;
                return subs.some(s => s.id === ev.group_id);
              });
              if (stageEvents.length === 0) return null;

              return (
                <div key={stage.id}>
                  <div className="flex bg-primary/15 border-b">
                    <div className="w-8 sm:w-10 h-7 flex items-center justify-center text-[9px] sm:text-[10px] font-extrabold text-primary border-r">
                      {stage.code}
                    </div>
                    <div className="w-36 sm:w-52 h-7 flex items-center px-2 text-[9px] sm:text-[10px] font-extrabold text-primary tracking-wide truncate">
                      {stage.name.toUpperCase()}
                    </div>
                  </div>

                  {subs.map(sub => {
                    const subEvents = measuredEvents.filter(ev => ev.group_id === sub.id);
                    if (subEvents.length === 0) return null;

                    return (
                      <div key={sub.id}>
                        <div className="flex bg-accent/40 border-b">
                          <div className="w-8 sm:w-10 h-7 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-foreground border-r">
                            {sub.code}
                          </div>
                          <div className="w-36 sm:w-52 h-7 flex items-center px-2 text-[9px] sm:text-[10px] font-bold text-foreground truncate">
                            {sub.name}
                          </div>
                        </div>

                        {subEvents.sort((a, b) => a.display_order - b.display_order).map(ev => {
                          const houses = housesPerEvent[ev.id] || [];
                          return (
                            <div key={ev.id} className="flex border-b hover:bg-accent/10">
                              <div className="w-8 sm:w-10 h-8 flex items-center justify-center text-[8px] sm:text-[9px] font-mono text-muted-foreground border-r shrink-0">
                                {ev.item_code}
                              </div>
                              <div className="w-36 sm:w-52 h-8 flex items-center px-1.5 sm:px-2 text-[8px] sm:text-[9px] truncate shrink-0 border-r" title={ev.description}>
                                {ev.description}
                              </div>
                              <div className="flex flex-wrap">
                                {houses.map(n => {
                                  const glossed = isGlossed(ev.id, n);
                                  return (
                                    <div
                                      key={n}
                                      onClick={() => onToggleGloss(ev.id, n, measurement.id)}
                                      className={cn(
                                        "w-9 sm:w-10 h-8 flex items-center justify-center border-r cursor-pointer transition-colors relative",
                                        glossed
                                          ? "bg-destructive/20 border-destructive/30"
                                          : "bg-emerald-600/15 hover:bg-emerald-600/25 active:bg-emerald-600/35"
                                      )}
                                    >
                                      <span className={cn("text-[9px] sm:text-[10px] font-mono font-bold", glossed ? "text-destructive line-through" : "text-emerald-700 dark:text-emerald-300")}>
                                        {n}
                                      </span>
                                      {glossed && (
                                        <span className="absolute -top-0.5 -right-0.5 text-[7px] sm:text-[8px] font-black text-destructive">G</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <div className="flex items-center gap-2 sm:mr-auto text-xs">
            {totalGlosses > 0 && (
              <Badge variant="destructive" className="gap-1 text-[10px] sm:text-xs">
                <AlertTriangle className="h-3 w-3" /> {totalGlosses} glossa(s)
              </Badge>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">Cancelar</Button>
            <Button
              onClick={handleApprove}
              className={cn(
                "gap-1.5 flex-1 sm:flex-none",
                totalGlosses > 0
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {totalGlosses > 0 ? (
                <><AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">Aprovar com Glossas</span><span className="sm:hidden">Aprovar c/ Glossas</span></>
              ) : (
                <><CheckCircle className="h-4 w-4" /> Aprovar</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
