import React, { useMemo } from 'react';
import { format, differenceInDays, addDays, startOfWeek, eachWeekOfInterval, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { GanttTask } from './types';
import { AlertTriangle, CheckCircle2, Clock, Play } from 'lucide-react';

interface GanttChartProps {
  tasks: GanttTask[];
  projectStartDate: string;
  projectedEndDate: Date | null;
}

const STATUS_CONFIG = {
  planned: { color: 'bg-muted', icon: Clock, label: 'Planejado' },
  in_progress: { color: 'bg-primary', icon: Play, label: 'Em Andamento' },
  at_risk: { color: 'bg-amber-500', icon: AlertTriangle, label: 'Em Risco' },
  delayed: { color: 'bg-destructive', icon: AlertTriangle, label: 'Atrasado' },
  completed: { color: 'bg-emerald-500', icon: CheckCircle2, label: 'Concluído' }
};

export function GanttChart({ tasks, projectStartDate, projectedEndDate }: GanttChartProps) {
  const { minDate, maxDate, weeks, dayWidth, totalWidth } = useMemo(() => {
    if (tasks.length === 0) {
      return { minDate: new Date(), maxDate: new Date(), weeks: [], dayWidth: 30, totalWidth: 0 };
    }

    const allDates = tasks.flatMap(t => [t.start, t.end]);
    if (projectedEndDate) allDates.push(projectedEndDate);
    
    const min = new Date(Math.min(...allDates.map(d => d.getTime())));
    const max = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add padding
    const paddedMin = addDays(startOfWeek(min, { locale: ptBR }), -7);
    const paddedMax = addDays(max, 14);
    
    const totalDays = differenceInDays(paddedMax, paddedMin);
    const dayW = 30; // pixels per day
    
    const weeksList = eachWeekOfInterval(
      { start: paddedMin, end: paddedMax },
      { locale: ptBR }
    );

    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      weeks: weeksList,
      dayWidth: dayW,
      totalWidth: totalDays * dayW
    };
  }, [tasks, projectedEndDate]);

  const getTaskPosition = (task: GanttTask) => {
    const startOffset = differenceInDays(task.start, minDate) * dayWidth;
    const width = (differenceInDays(task.end, task.start) + 1) * dayWidth;
    return { left: startOffset, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate) * dayWidth;

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Configure as etapas para visualizar o Gráfico de Gantt
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Gráfico de Gantt</CardTitle>
          <div className="flex gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Badge key={key} variant="outline" className="gap-1 text-xs">
                <div className={`w-2 h-2 rounded-full ${config.color}`} />
                {config.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-max">
            {/* Header - Weeks */}
            <div className="flex border-b">
              <div className="w-48 shrink-0 border-r px-2 py-1 bg-muted/30 font-medium text-sm">
                Etapa
              </div>
              <div className="flex" style={{ width: totalWidth }}>
                {weeks.map((week, i) => (
                  <div
                    key={i}
                    className="border-r text-center text-xs py-1 bg-muted/30"
                    style={{ width: dayWidth * 7 }}
                  >
                    {format(week, "'Sem' w", { locale: ptBR })}
                    <div className="text-muted-foreground">
                      {format(week, 'dd/MM')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks */}
            {tasks.map((task) => {
              const pos = getTaskPosition(task);
              const statusConfig = STATUS_CONFIG[task.status];
              const StatusIcon = statusConfig.icon;

              return (
                <div key={task.id} className="flex border-b hover:bg-muted/20">
                  <div className="w-48 shrink-0 border-r px-2 py-3 flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: task.color }}
                    />
                    <span className="text-sm truncate">{task.name}</span>
                    {task.isCritical && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">
                        Crítico
                      </Badge>
                    )}
                  </div>
                  <div 
                    className="relative py-2"
                    style={{ width: totalWidth }}
                  >
                    {/* Today marker */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-primary z-10"
                      style={{ left: todayOffset }}
                    />
                    
                    {/* Task bar */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center overflow-hidden cursor-pointer transition-all hover:h-7 ${statusConfig.color}`}
                            style={{
                              left: pos.left,
                              width: pos.width,
                              minWidth: 20
                            }}
                          >
                            {/* Progress fill */}
                            <div
                              className="absolute inset-0 bg-black/20"
                              style={{ width: `${100 - task.progress}%`, right: 0, left: 'auto' }}
                            />
                            <div className="relative z-10 px-2 flex items-center gap-1 text-white text-xs font-medium">
                              <StatusIcon className="h-3 w-3" />
                              {task.progress.toFixed(0)}%
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-sm space-y-1">
                            <div className="font-medium">{task.name}</div>
                            <div>Início: {format(task.start, 'dd/MM/yyyy')}</div>
                            <div>Término: {format(task.end, 'dd/MM/yyyy')}</div>
                            <div>Progresso: {task.progress.toFixed(1)}%</div>
                            <div>Status: {statusConfig.label}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}

            {/* Projected end date marker */}
            {projectedEndDate && (
              <div className="flex border-b bg-amber-50 dark:bg-amber-950/20">
                <div className="w-48 shrink-0 border-r px-2 py-2 text-sm text-amber-600 dark:text-amber-400">
                  📅 Término Projetado
                </div>
                <div 
                  className="relative py-2"
                  style={{ width: totalWidth }}
                >
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                    style={{ left: differenceInDays(projectedEndDate, minDate) * dayWidth }}
                  />
                </div>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
