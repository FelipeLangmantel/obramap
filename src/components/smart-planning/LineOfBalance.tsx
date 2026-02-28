import React, { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { differenceInDays, startOfDay, addDays, format, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GanttService } from './hooks/useStrategicGanttData';
import { Settings2, GripVertical, ArrowRight, Link2 } from 'lucide-react';

interface LineOfBalanceProps {
  ganttServices: GanttService[];
  projectStartDate: string;
  onUpdatePredecessor?: (serviceId: string, predecessorStageId: string | null) => Promise<void>;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#f43f5e', '#a855f7', '#eab308', '#0ea5e9',
];

interface WeekColumn {
  weekStart: Date;
  weekEnd: Date;
  label: string;
  monthLabel: string;
  dayOffsets: number[]; // day indices from project start
}

export function LineOfBalance({ ganttServices, projectStartDate, onUpdatePredecessor }: LineOfBalanceProps) {
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sorted services by sequence_order
  const sortedServices = useMemo(() => {
    return [...ganttServices].sort((a, b) => a.sequence_order - b.sequence_order);
  }, [ganttServices]);

  // Get max units (houses)
  const maxUnits = useMemo(() => {
    if (ganttServices.length === 0) return 0;
    return Math.max(...ganttServices.map(s => s.total_houses));
  }, [ganttServices]);

  // Generate week columns
  const weeks = useMemo(() => {
    if (!projectStartDate || ganttServices.length === 0) return [];
    
    const start = startOfDay(new Date(projectStartDate));
    const maxDay = Math.max(...ganttServices.map(s => differenceInDays(s.planned_end, start)));
    const totalDays = maxDay + 7;
    
    const result: WeekColumn[] = [];
    let current = startOfWeek(start, { weekStartsOn: 1 });
    
    while (differenceInDays(current, start) <= totalDays) {
      const wEnd = endOfWeek(current, { weekStartsOn: 1 });
      const dayOffsets: number[] = [];
      for (let d = 0; d < 7; d++) {
        dayOffsets.push(differenceInDays(addDays(current, d), start));
      }
      result.push({
        weekStart: current,
        weekEnd: wEnd,
        label: `${format(current, 'dd/MM', { locale: ptBR })}`,
        monthLabel: format(current, 'MMM yyyy', { locale: ptBR }),
        dayOffsets,
      });
      current = addDays(current, 7);
    }
    return result;
  }, [projectStartDate, ganttServices]);

  // Today marker position
  const todayOffset = useMemo(() => {
    if (!projectStartDate) return -1;
    return differenceInDays(new Date(), startOfDay(new Date(projectStartDate)));
  }, [projectStartDate]);

  // Month header groups
  const monthGroups = useMemo(() => {
    const groups: { label: string; startIdx: number; count: number }[] = [];
    weeks.forEach((w, idx) => {
      const ml = w.monthLabel;
      if (groups.length > 0 && groups[groups.length - 1].label === ml) {
        groups[groups.length - 1].count++;
      } else {
        groups.push({ label: ml, startIdx: idx, count: 1 });
      }
    });
    return groups;
  }, [weeks]);

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
  const ROW_HEIGHT = 36;
  const HEADER_HEIGHT = 60;
  const LEFT_PANEL_WIDTH = 180;
  const DAY_WIDTH = 18;
  const totalDays = weeks.length * 7;
  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = maxUnits * ROW_HEIGHT;

  // Build unit rows (1..maxUnits) - bottom to top in the chart
  const unitRows = Array.from({ length: maxUnits }, (_, i) => i + 1);

  // Calculate bar positions for each service
  // In a LOB, each service band goes diagonally: 
  // - X position = time (day offset from project start)
  // - Y position = unit number
  // The band starts at (planned_start, first_unit) and goes to (planned_end, last_unit)
  const getServiceBand = (svc: GanttService) => {
    const svcStartDay = differenceInDays(svc.planned_start, startDate);
    const svcEndDay = differenceInDays(svc.planned_end, startDate);
    const durationDays = svcEndDay - svcStartDay;
    
    // For each unit, calculate start and end day
    const unitBars: { unit: number; startDay: number; endDay: number }[] = [];
    const unitsToSchedule = svc.total_houses;
    
    if (unitsToSchedule === 0 || durationDays === 0) return unitBars;
    
    // Calculate days per unit (cycle time)
    const daysPerUnit = durationDays / unitsToSchedule;
    
    // Minimum bar width = productivity-based duration for one unit
    const unitDuration = Math.max(1, Math.ceil(daysPerUnit));
    
    for (let u = 0; u < unitsToSchedule; u++) {
      const unitStartDay = svcStartDay + Math.round(u * daysPerUnit);
      const unitEndDay = unitStartDay + unitDuration;
      unitBars.push({
        unit: u + 1,
        startDay: unitStartDay,
        endDay: Math.min(unitEndDay, svcEndDay + unitDuration),
      });
    }
    
    return unitBars;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Linha de Balanço</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setShowSequenceDialog(true);
              }}
            >
              <Settings2 className="h-4 w-4" />
              Organizar Fluxograma
            </Button>
          </div>
        </div>
        {/* Legend */}
        <div className="flex gap-2 flex-wrap mt-2">
          {sortedServices.map((svc, idx) => (
            <Badge
              key={svc.id}
              variant="outline"
              className="text-xs gap-1"
            >
              <div
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              />
              {svc.name.length > 30 ? svc.name.substring(0, 30) + '…' : svc.name}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex overflow-hidden border-t">
          {/* Left panel - Unit labels */}
          <div
            className="shrink-0 border-r bg-muted/30"
            style={{ width: LEFT_PANEL_WIDTH }}
          >
            {/* Header spacer */}
            <div
              className="border-b flex items-end px-3 text-xs font-medium text-muted-foreground"
              style={{ height: HEADER_HEIGHT }}
            >
              Unidades
            </div>
            {/* Unit rows - from top (highest) to bottom (1) */}
            <div style={{ height: chartHeight, overflow: 'hidden' }}>
              {unitRows.slice().reverse().map(unit => (
                <div
                  key={unit}
                  className="flex items-center px-3 text-xs border-b border-border/50"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="text-muted-foreground">
                    {unit <= 20 || unit % 5 === 0 ? `Un ${unit}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel - Chart area with scroll */}
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div style={{ width: chartWidth, minWidth: '100%' }}>
              {/* Time header */}
              <div style={{ height: HEADER_HEIGHT }} className="border-b">
                {/* Month row */}
                <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                  {monthGroups.map((mg, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center text-xs font-semibold border-r border-border/50 capitalize"
                      style={{ width: mg.count * 7 * DAY_WIDTH }}
                    >
                      {mg.label}
                    </div>
                  ))}
                </div>
                {/* Week row */}
                <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
                  {weeks.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center text-[10px] text-muted-foreground border-r border-border/50"
                      style={{ width: 7 * DAY_WIDTH }}
                    >
                      {w.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chart body */}
              <div
                className="relative"
                style={{ height: chartHeight, width: chartWidth }}
              >
                {/* Grid lines - horizontal */}
                {unitRows.map(unit => (
                  <div
                    key={unit}
                    className="absolute w-full border-b border-border/20"
                    style={{ top: (maxUnits - unit) * ROW_HEIGHT + ROW_HEIGHT }}
                  />
                ))}
                
                {/* Grid lines - weekly vertical */}
                {weeks.map((w, i) => (
                  <div
                    key={i}
                    className="absolute top-0 border-l border-border/20"
                    style={{ left: i * 7 * DAY_WIDTH, height: chartHeight }}
                  />
                ))}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute top-0 z-20"
                    style={{ left: todayOffset * DAY_WIDTH, height: chartHeight }}
                  >
                    <div className="w-0.5 h-full bg-primary opacity-70" />
                    <div className="absolute -top-5 -left-3 bg-primary text-primary-foreground text-[9px] px-1 rounded">
                      Hoje
                    </div>
                  </div>
                )}

                {/* Service bands */}
                {sortedServices.map((svc, svcIdx) => {
                  const color = COLORS[svcIdx % COLORS.length];
                  const bars = getServiceBand(svc);
                  
                  return bars.map((bar, barIdx) => {
                    const x = bar.startDay * DAY_WIDTH;
                    const w = Math.max(DAY_WIDTH, (bar.endDay - bar.startDay) * DAY_WIDTH);
                    // Y: unit 1 is at bottom, unit N is at top
                    const y = (maxUnits - bar.unit) * ROW_HEIGHT;
                    
                    return (
                      <div
                        key={`${svc.id}_${barIdx}`}
                        className="absolute rounded-sm flex items-center overflow-hidden"
                        style={{
                          left: x,
                          top: y,
                          width: w,
                          height: ROW_HEIGHT - 4,
                          backgroundColor: color,
                          opacity: bar.unit <= svc.executed_houses ? 1 : 0.7,
                        }}
                        title={`${svc.name} - Un ${bar.unit} (Dia ${bar.startDay}-${bar.endDay})`}
                      >
                        {/* Show service name only on first visible bar with enough space */}
                        {barIdx === 0 && w > 50 && (
                          <span
                            className="text-[9px] font-medium px-1 truncate"
                            style={{ color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                          >
                            {svc.name.length > 15 ? svc.name.substring(0, 15) + '…' : svc.name}
                          </span>
                        )}
                      </div>
                    );
                  });
                })}

                {/* Executed overlay markers */}
                {sortedServices.map((svc, svcIdx) => {
                  if (svc.executed_houses === 0) return null;
                  const color = COLORS[svcIdx % COLORS.length];
                  // Draw a thicker border on executed units
                  const bars = getServiceBand(svc);
                  return bars
                    .filter(b => b.unit <= svc.executed_houses)
                    .map((bar, i) => {
                      const x = bar.startDay * DAY_WIDTH;
                      const w = Math.max(DAY_WIDTH, (bar.endDay - bar.startDay) * DAY_WIDTH);
                      const y = (maxUnits - bar.unit) * ROW_HEIGHT;
                      return (
                        <div
                          key={`exec_${svc.id}_${i}`}
                          className="absolute rounded-sm border-2 pointer-events-none"
                          style={{
                            left: x,
                            top: y,
                            width: w,
                            height: ROW_HEIGHT - 4,
                            borderColor: '#fff',
                            boxShadow: `0 0 0 1px ${color}`,
                          }}
                        />
                      );
                    });
                })}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Footer legend */}
        <div className="px-4 py-2 flex items-center gap-6 text-xs text-muted-foreground border-t">
          <div className="flex items-center gap-2">
            <div className="w-6 h-3 rounded-sm bg-primary opacity-70" />
            <span>Planejado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-3 rounded-sm bg-primary border-2 border-white shadow-sm" />
            <span>Executado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-4 bg-primary" />
            <span>Hoje</span>
          </div>
        </div>
      </CardContent>

      {/* Sequence/Flowchart Dialog */}
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
                <div
                  key={svc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  {/* Order number */}
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-sm font-mono w-5">{idx + 1}</span>
                  </div>

                  {/* Color dot + name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className="w-4 h-4 rounded-sm shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {svc.remaining_houses} un restantes • {svc.duration_days}d
                      </p>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                  {/* Predecessor selector */}
                  <Select
                    value={svc.depends_on || 'none'}
                    onValueChange={(val) =>
                      handlePredecessorChange(svc.id, val === 'none' ? null : val)
                    }
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
