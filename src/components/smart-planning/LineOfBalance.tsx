import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LineOfBalancePoint } from './types';
import { Badge } from '@/components/ui/badge';

interface LineOfBalanceProps {
  data: LineOfBalancePoint[];
  totalUnits: number;
  projectStartDate: string;
}

export function LineOfBalance({ data, totalUnits, projectStartDate }: LineOfBalanceProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Configure as etapas para visualizar a Linha de Balanço
        </CardContent>
      </Card>
    );
  }

  // Convert data to chart format
  const startDate = parseISO(projectStartDate);
  
  // Create combined dataset
  const allPoints: { day: number; [key: string]: number }[] = [];
  const maxDay = Math.max(
    ...data.flatMap(d => [
      ...d.plannedLine.map(p => differenceInDays(p.x, startDate)),
      ...d.actualLine.map(p => differenceInDays(p.x, startDate))
    ])
  );

  for (let day = 0; day <= maxDay; day++) {
    const point: { day: number; [key: string]: number } = { day };
    
    data.forEach(line => {
      // Planned line - interpolate
      const plannedPoint = line.plannedLine.find(
        p => differenceInDays(p.x, startDate) === day
      );
      if (plannedPoint) {
        point[`${line.teamName}_planned`] = plannedPoint.y;
      } else {
        // Interpolate between points
        const prevPoint = [...line.plannedLine]
          .reverse()
          .find(p => differenceInDays(p.x, startDate) < day);
        const nextPoint = line.plannedLine
          .find(p => differenceInDays(p.x, startDate) > day);
        
        if (prevPoint && nextPoint) {
          const ratio = (day - differenceInDays(prevPoint.x, startDate)) / 
            (differenceInDays(nextPoint.x, startDate) - differenceInDays(prevPoint.x, startDate));
          point[`${line.teamName}_planned`] = prevPoint.y + (nextPoint.y - prevPoint.y) * ratio;
        } else if (prevPoint) {
          point[`${line.teamName}_planned`] = prevPoint.y;
        }
      }
      
      // Actual line
      const actualPoint = line.actualLine.find(
        p => differenceInDays(p.x, startDate) === day
      );
      if (actualPoint) {
        point[`${line.teamName}_actual`] = actualPoint.y;
      }
    });
    
    allPoints.push(point);
  }

  // Get unique colors per stage
  const stageColors = [...new Set(data.map(d => d.color))];
  const colorMap = new Map<string, string>();
  data.forEach(d => colorMap.set(d.stageName, d.color));

  // Group by stage
  const stageGroups = data.reduce((acc, d) => {
    if (!acc[d.stageName]) acc[d.stageName] = [];
    acc[d.stageName].push(d);
    return acc;
  }, {} as Record<string, LineOfBalancePoint[]>);

  const today = differenceInDays(new Date(), startDate);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Linha de Balanço</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stageGroups).map(([stageName, points]) => (
              <Badge 
                key={stageName} 
                variant="outline"
                style={{ borderColor: points[0].color, color: points[0].color }}
              >
                {stageName}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={allPoints}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="day" 
                tickFormatter={(day) => `Dia ${day}`}
                className="text-xs"
              />
              <YAxis 
                domain={[0, totalUnits]}
                tickFormatter={(value) => `${value} un`}
                className="text-xs"
              />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)} unidades`,
                  name.includes('_planned') 
                    ? `${name.replace('_planned', '')} (Planejado)`
                    : `${name.replace('_actual', '')} (Realizado)`
                ]}
                labelFormatter={(day) => `Dia ${day}`}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  borderColor: 'hsl(var(--border))' 
                }}
              />
              <Legend 
                formatter={(value) => {
                  if (value.includes('_planned')) {
                    return `${value.replace('_planned', '')} (Planejado)`;
                  }
                  return `${value.replace('_actual', '')} (Realizado)`;
                }}
              />
              
              {/* Today reference line */}
              <ReferenceLine 
                x={today} 
                stroke="hsl(var(--primary))" 
                strokeDasharray="5 5"
                label={{ value: 'Hoje', position: 'top' }}
              />

              {/* Target units reference line */}
              <ReferenceLine 
                y={totalUnits} 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="3 3"
                label={{ value: `Meta: ${totalUnits}`, position: 'right' }}
              />
              
              {/* Lines for each team */}
              {data.map((lineData, index) => (
                <React.Fragment key={`${lineData.teamId}-${index}`}>
                  {/* Planned line - dashed */}
                  <Line
                    type="monotone"
                    dataKey={`${lineData.teamName}_planned`}
                    stroke={lineData.color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    connectNulls
                  />
                  {/* Actual line - solid */}
                  {lineData.actualLine.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey={`${lineData.teamName}_actual`}
                      stroke={lineData.color}
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  )}
                </React.Fragment>
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
