import React, { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { differenceInDays, startOfDay, addDays, format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GanttService } from './hooks/useStrategicGanttData';
import { Settings2, GripVertical, ArrowRight, Link2 } from 'lucide-react';

interface LineOfBalanceProps {
  ganttServices: GanttService[];
  projectStartDate: string;
  onUpdatePredecessor?: (serviceId: string, predecessorStageId: string | null) => Promise<void>;
}

const COLORS = [
  '#4a4a4a', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#84cc16', '#f43f5e', '#a855f7', '#0ea5e9', '#6366f1',
];

export function LineOfBalance({ ganttServices, projectStartDate, onUpdatePredecessor }: LineOfBalanceProps) {
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const sortedServices = useMemo(() => {
    return [...ganttServices].sort((a, b) => a.sequence_order - b.sequence_order);
  }, [ganttServices]);

  const maxUnits = useMemo(() => {
    if (ganttServices.length === 0) return 0;
    return Math.max(...ganttServices.map(s => s.total_houses));
  }, [ganttServices]);

  // Build day columns with week/month grouping
  const { days, weekGroups, monthGroups, totalDays } = useMemo(() => {
    if (!projectStartDate || ganttServices.length === 0) {
      return { days: [], weekGroups: [], monthGroups: [], totalDays: 0 };
    }

    const start = startOfDay(new Date(projectStartDate));
    const maxDay = Math.max(...ganttServices.map(s => differenceInDays(s.planned_end, start)));
    const total = maxDay + 14; // buffer

    const daysList: { date: Date; dayOfWeek: number; dayNum: number; offset: number }[] = [];
    for (let d = 0; d <= total; d++) {
      const date = addDays(start, d);
      daysList.push({
        date,
        dayOfWeek: date.getDay(),
        dayNum: date.getDate(),
        offset: d,
      });
    }

    // Week groups
    const wGroups: { label: string; startIdx: number; count: number }[] = [];
    daysList.forEach((day, idx) => {
      const weekStart = startOfWeek(day.date, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      const label = `${format(weekStart, 'dd', { locale: ptBR })} - ${format(weekEnd, 'dd', { locale: ptBR })}`;
      if (wGroups.length > 0 && wGroups[wGroups.length - 1].label === label) {
        wGroups[wGroups.length - 1].count++;
      } else {
        wGroups.push({ label, startIdx: idx, count: 1 });
      }
    });

    // Month groups
    const mGroups: { label: string; startIdx: number; count: number }[] = [];
    daysList.forEach((day, idx) => {
      const label = format(day.date, 'MMM yyyy', { locale: ptBR });
      if (mGroups.length > 0 && mGroups[mGroups.length - 1].label === label) {
        mGroups[mGroups.length - 1].count++;
      } else {
        mGroups.push({ label, startIdx: idx, count: 1 });
      }
    });

    return { days: daysList, weekGroups: wGroups, monthGroups: mGroups, totalDays: total + 1 };
  }, [projectStartDate, ganttServices]);

  const todayOffset = useMemo(() => {
    if (!projectStartDate) return -1;
    return differenceInDays(new Date(), startOfDay(new Date(projectStartDate)));
  }, [projectStartDate]);

  if (ganttServices.length === 0 || !projectStartDate) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Configure o planejamento estratégico para visualizar a Linha de Balanço
        </CardContent>
      </Card>
    );
  }

  const startDate = startOfDay(new Date(projectStartDate));
  const ROW_HEIGHT = 32;
  const DAY_WIDTH = 22;
  const HEADER_HEIGHT = 72; // 3 rows: month(24) + week(24) + day(24)
  const LEFT_PANEL_WIDTH = 160;
  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = maxUnits * ROW_HEIGHT;

  // Unit labels: top = highest unit, bottom = unit 1 (like the reference)
  const unitLabels = Array.from({ length: maxUnits }, (_, i) => maxUnits - i);

  // For each service+unit, compute the bar's start/end day
  const getUnitBar = (svc: GanttService, unitIndex: number) => {
    const svcStartDay = differenceInDays(svc.planned_start, startDate);
    const svcEndDay = differenceInDays(svc.planned_end, startDate);
    const duration = svcEndDay - svcStartDay;
    const total = svc.total_houses;
    if (total === 0 || duration <= 0) return null;

    const daysPerUnit = duration / total;
    const unitDuration = Math.max(1, Math.ceil(daysPerUnit));
    // unitIndex: 0 = first unit to execute, total-1 = last
    const barStart = svcStartDay + Math.round(unitIndex * daysPerUnit);
    const barEnd = barStart + unitDuration;
    return { startDay: barStart, endDay: barEnd };
  };

  // Sync vertical scroll between left panel and chart
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Linha de Balanço</CardTitle>
          <div className="flex items-center gap-2">
            {/* Legend badges */}
            <div className="hidden lg:flex gap-1.5 flex-wrap mr-2">
              {sortedServices.map((svc, idx) => (
                <Badge key={svc.id} variant="outline" className="text-[10px] gap-1 py-0">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  {svc.name.length > 20 ? svc.name.substring(0, 20) + '…' : svc.name}
                </Badge>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowSequenceDialog(true)}
            >
              <Settings2 className="h-4 w-4" />
              Organizar Fluxograma
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex border-t" style={{ height: Math.min(chartHeight + HEADER_HEIGHT + 2, 600) }}>
          {/* ─── Left Panel: unit labels ─── */}
          <div className="shrink-0 flex flex-col border-r" style={{ width: LEFT_PANEL_WIDTH }}>
            {/* Header area */}
            <div className="border-b bg-muted/40" style={{ height: HEADER_HEIGHT }}>
              <div className="flex flex-col justify-end h-full px-3 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mês</span>
                <span className="text-[10px] text-muted-foreground">Semana</span>
                <span className="text-[10px] text-muted-foreground">Dia</span>
              </div>
            </div>
            {/* Scrollable unit labels */}
            <div
              ref={leftPanelRef}
              className="flex-1 overflow-hidden"
            >
              <div style={{ height: chartHeight }}>
                {unitLabels.map((unit) => (
                  <div
                    key={unit}
                    className="flex items-center px-3 text-xs font-medium border-b border-border/30"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span className="text-foreground truncate">
                      {maxUnits <= 30 ? `Un ${unit}` : (unit % 5 === 0 || unit === 1 || unit === maxUnits ? `Un ${unit}` : '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right Panel: chart ─── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Fixed time header */}
            <div className="border-b bg-muted/40 overflow-hidden shrink-0" style={{ height: HEADER_HEIGHT }}>
              <div
                ref={scrollContainerRef}
                className="overflow-x-auto"
                style={{ height: HEADER_HEIGHT }}
              >
                <div style={{ width: chartWidth }}>
                  {/* Month row */}
                  <div className="flex" style={{ height: 24 }}>
                    {monthGroups.map((mg, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center text-xs font-bold border-r border-border/40 capitalize"
                        style={{ width: mg.count * DAY_WIDTH }}
                      >
                        {mg.label}
                      </div>
                    ))}
                  </div>
                  {/* Week row */}
                  <div className="flex" style={{ height: 24 }}>
                    {weekGroups.map((wg, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center text-[10px] text-muted-foreground border-r border-border/40"
                        style={{ width: wg.count * DAY_WIDTH }}
                      >
                        {wg.label}
                      </div>
                    ))}
                  </div>
                  {/* Day row - tick marks */}
                  <div className="flex" style={{ height: 24 }}>
                    {days.map((day, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-center text-[8px] border-r border-border/20 ${
                          day.dayOfWeek === 0 || day.dayOfWeek === 6 ? 'bg-muted/60' : ''
                        }`}
                        style={{ width: DAY_WIDTH }}
                      >
                        <span className="text-muted-foreground">{day.dayNum}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable chart body */}
            <div
              className="flex-1 overflow-auto"
              onScroll={(e) => {
                handleScroll(e);
                // Sync horizontal scroll with header
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }
              }}
            >
              <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
                {/* Background grid - horizontal */}
                {unitLabels.map((_, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="absolute w-full border-b border-border/15"
                    style={{ top: (rowIdx + 1) * ROW_HEIGHT }}
                  />
                ))}

                {/* Background grid - weekend columns */}
                {days.map((day, i) => (
                  (day.dayOfWeek === 0 || day.dayOfWeek === 6) && (
                    <div
                      key={`wknd_${i}`}
                      className="absolute top-0 bg-muted/30"
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, height: chartHeight }}
                    />
                  )
                ))}

                {/* Background grid - weekly vertical lines */}
                {days.map((day, i) => (
                  day.dayOfWeek === 1 && (
                    <div
                      key={`vline_${i}`}
                      className="absolute top-0 border-l border-border/25"
                      style={{ left: i * DAY_WIDTH, height: chartHeight }}
                    />
                  )
                ))}

                {/* Today vertical line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 z-30 pointer-events-none"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2, height: chartHeight }}
                  >
                    <div className="w-0.5 h-full bg-red-500 opacity-80" />
                  </div>
                )}

                {/* Service bars per unit */}
                {sortedServices.map((svc, svcIdx) => {
                  const color = COLORS[svcIdx % COLORS.length];
                  const bars: React.ReactNode[] = [];

                  for (let u = 0; u < svc.total_houses; u++) {
                    const bar = getUnitBar(svc, u);
                    if (!bar) continue;

                    const unitNumber = u + 1; // execution order unit
                    // Row position: unitNumber maps to row. Top row = maxUnits, bottom = 1
                    const rowIdx = maxUnits - unitNumber;
                    if (rowIdx < 0 || rowIdx >= maxUnits) continue;

                    const x = bar.startDay * DAY_WIDTH;
                    const w = Math.max(DAY_WIDTH, (bar.endDay - bar.startDay) * DAY_WIDTH);
                    const y = rowIdx * ROW_HEIGHT + 2;
                    const isExecuted = unitNumber <= svc.executed_houses;
                    
                    // Show service name on middle unit bar
                    const midUnit = Math.floor(svc.total_houses / 2);
                    const showName = u === midUnit && w > 40;

                    bars.push(
                      <div
                        key={`${svc.id}_u${u}`}
                        className="absolute flex items-center overflow-hidden"
                        style={{
                          left: x,
                          top: y,
                          width: w,
                          height: ROW_HEIGHT - 4,
                          backgroundColor: color,
                          opacity: isExecuted ? 1 : 0.75,
                          borderRadius: 2,
                          borderLeft: isExecuted ? '3px solid rgba(255,255,255,0.6)' : undefined,
                        }}
                        title={`${svc.name} - Un ${unitNumber} (Dia ${bar.startDay}→${bar.endDay})`}
                      >
                        {showName && (
                          <span
                            className="text-[9px] font-bold px-1 truncate whitespace-nowrap"
                            style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                          >
                            {svc.name.length > 20 ? svc.name.substring(0, 20) + '…' : svc.name}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return <React.Fragment key={svc.id}>{bars}</React.Fragment>;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground border-t bg-muted/20">
          <div className="flex items-center gap-5">
            {sortedServices.slice(0, 8).map((svc, idx) => (
              <div key={svc.id} className="flex items-center gap-1.5">
                <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span className="truncate max-w-[100px]">{svc.name.split(' - ')[0]}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-red-500" />
            <span>Hoje</span>
          </div>
        </div>
      </CardContent>

      <SequenceDialog
        open={showSequenceDialog}
        onOpenChange={setShowSequenceDialog}
        services={sortedServices}
        allServices={ganttServices}
        onUpdatePredecessor={onUpdatePredecessor}
      />
    </Card>
  );
}

// ── Sequence Editor Dialog ──────────────────────────────────────────
interface SequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: GanttService[];
  allServices: GanttService[];
  onUpdatePredecessor?: (serviceId: string, predecessorStageId: string | null) => Promise<void>;
}

function SequenceDialog({ open, onOpenChange, services, allServices, onUpdatePredecessor }: SequenceDialogProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handlePredecessorChange = async (serviceId: string, predecessorStageId: string | null) => {
    if (!onUpdatePredecessor) return;
    setUpdating(serviceId);
    try {
      await onUpdatePredecessor(serviceId, predecessorStageId);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Organizar Fluxograma - Sequência de Serviços
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Defina a ordem e predecessoras dos serviços. A Linha de Balanço será atualizada automaticamente.
        </p>
        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-3 pr-2">
            {services.map((svc, idx) => {
              const color = COLORS[idx % COLORS.length];
              return (
                <div key={svc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-sm font-mono w-5">{idx + 1}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {svc.remaining_houses} un restantes • {svc.duration_days}d
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={svc.depends_on || 'none'}
                    onValueChange={(val) => handlePredecessorChange(svc.id, val === 'none' ? null : val)}
                    disabled={updating === svc.id}
                  >
                    <SelectTrigger className="w-[200px] text-xs">
                      <SelectValue placeholder="Sem predecessora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem predecessora</SelectItem>
                      {allServices
                        .filter(s => s.id !== svc.id)
                        .map((s) => (
                          <SelectItem key={s.stage_id || s.id} value={s.stage_id || s.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: COLORS[allServices.indexOf(s) % COLORS.length] }}
                              />
                              {s.name.length > 30 ? s.name.substring(0, 30) + '…' : s.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
