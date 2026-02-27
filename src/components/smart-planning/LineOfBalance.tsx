import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { differenceInDays, startOfDay, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { GanttService } from './hooks/useStrategicGanttData';

interface LineOfBalanceProps {
  ganttServices: GanttService[];
  projectStartDate: string;
}

const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export function LineOfBalance({ ganttServices, projectStartDate }: LineOfBalanceProps) {
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
  const today = differenceInDays(new Date(), startDate);

  // Find max day across all services
  const maxDay = Math.max(
    ...ganttServices.map(s => differenceInDays(s.planned_end, startDate))
  );

  // Build chart data: for each day, each service has a Y value (units completed up to that day)
  const chartData: Record<string, number>[] = [];
  for (let day = 0; day <= maxDay; day++) {
    const point: Record<string, number> = { day };

    ganttServices.forEach((svc, idx) => {
      const svcStartDay = differenceInDays(svc.planned_start, startDate);
      const svcEndDay = differenceInDays(svc.planned_end, startDate);
      const key = `svc_${idx}`;

      if (day < svcStartDay) {
        // Before service starts - show executed houses (already done)
        point[key] = svc.executed_houses;
      } else if (day >= svcStartDay && day <= svcEndDay) {
        // During service - linear interpolation from executed to total
        const progress = (day - svcStartDay) / Math.max(1, svcEndDay - svcStartDay);
        point[key] = svc.executed_houses + svc.remaining_houses * progress;
      } else {
        // After service ends
        point[key] = svc.total_houses;
      }
    });

    chartData.push(point);
  }

  // Also add actual progress points (executed_houses as horizontal line until today)
  ganttServices.forEach((svc, idx) => {
    const key = `svc_${idx}_actual`;
    const svcStartDay = differenceInDays(svc.planned_start, startDate);
    chartData.forEach(point => {
      const day = point.day as number;
      if (day <= Math.max(today, svcStartDay)) {
        point[key] = svc.executed_houses;
      }
    });
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Linha de Balanço</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {ganttServices.map((svc, idx) => (
              <Badge
                key={svc.id}
                variant="outline"
                style={{ borderColor: COLORS[idx % COLORS.length], color: COLORS[idx % COLORS.length] }}
                className="text-xs"
              >
                {svc.name.length > 25 ? svc.name.substring(0, 25) + '…' : svc.name}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="day"
                tickFormatter={(day) => `D${day}`}
                className="text-xs"
              />
              <YAxis
                domain={[0, 'auto']}
                tickFormatter={(value) => `${Math.round(value)}`}
                className="text-xs"
                label={{ value: 'Unidades', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const idx = parseInt(name.replace('svc_', '').replace('_actual', ''));
                  const svc = ganttServices[idx];
                  const isActual = name.includes('_actual');
                  return [
                    `${Math.round(value)} un`,
                    `${svc?.name || name} (${isActual ? 'Realizado' : 'Planejado'})`
                  ];
                }}
                labelFormatter={(day) => `Dia ${day}`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                  fontSize: 12,
                }}
              />

              {/* Today reference line */}
              <ReferenceLine
                x={today}
                stroke="hsl(var(--primary))"
                strokeDasharray="5 5"
                label={{ value: 'Hoje', position: 'top', style: { fontSize: 11 } }}
              />

              {/* Total units reference */}
              {ganttServices.length > 0 && (
                <ReferenceLine
                  y={ganttServices[0].total_houses}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  label={{ value: `Meta: ${ganttServices[0].total_houses}`, position: 'right', style: { fontSize: 10 } }}
                />
              )}

              {/* Planned lines - dashed */}
              {ganttServices.map((svc, idx) => (
                <Line
                  key={`planned_${idx}`}
                  type="monotone"
                  dataKey={`svc_${idx}`}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                  name={`svc_${idx}`}
                />
              ))}

              {/* Actual lines - solid */}
              {ganttServices.map((svc, idx) => (
                svc.executed_houses > 0 && (
                  <Line
                    key={`actual_${idx}`}
                    type="monotone"
                    dataKey={`svc_${idx}_actual`}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={3}
                    dot={false}
                    connectNulls
                    name={`svc_${idx}_actual`}
                  />
                )
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-dashed border-muted-foreground" />
            <span>Planejado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-t-2 border-muted-foreground" />
            <span>Realizado</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
