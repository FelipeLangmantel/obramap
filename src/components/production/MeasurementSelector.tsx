import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar, ClipboardCheck, Target, TrendingUp, Home, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PlannedPeriod {
  id: string;
  week_start: string;
  week_end: string;
  scope_name: string;
  scope_id: string;
  macro_name: string;
  macro_id: string;
  macro_color?: string;
  planned_house_ids: number[];
  planned_houses: number;
  measurement_number: number | null;
}

interface MeasurementSelectorProps {
  plannedPeriods: PlannedPeriod[];
  selectedMeasurement: number | null;
  onMeasurementChange: (measurement: number | null) => void;
  selectedPeriod: PlannedPeriod | null;
  onPeriodChange: (period: PlannedPeriod | null) => void;
}

export function MeasurementSelector({
  plannedPeriods,
  selectedMeasurement,
  onMeasurementChange,
  selectedPeriod,
  onPeriodChange
}: MeasurementSelectorProps) {
  // Group periods by measurement number
  const measurementGroups = useMemo(() => {
    const groups = new Map<number, PlannedPeriod[]>();
    plannedPeriods.forEach(period => {
      const measurementNum = period.measurement_number || 1;
      if (!groups.has(measurementNum)) {
        groups.set(measurementNum, []);
      }
      groups.get(measurementNum)!.push(period);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]); // Most recent first
  }, [plannedPeriods]);

  // Available measurements
  const availableMeasurements = useMemo(() => {
    return measurementGroups.map(([num, periods]) => ({
      number: num,
      periodsCount: periods.length,
      totalHouses: periods.reduce((sum, p) => sum + p.planned_houses, 0),
      dateRange: periods.length > 0 ? {
        start: periods.reduce((min, p) => p.week_start < min ? p.week_start : min, periods[0].week_start),
        end: periods.reduce((max, p) => p.week_end > max ? p.week_end : max, periods[0].week_end)
      } : null
    }));
  }, [measurementGroups]);

  // Periods for selected measurement
  const periodsForMeasurement = useMemo(() => {
    if (selectedMeasurement === null) return [];
    return plannedPeriods.filter(p => (p.measurement_number || 1) === selectedMeasurement);
  }, [plannedPeriods, selectedMeasurement]);

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          {/* Measurement Selector */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              <Label className="font-semibold text-base">Medição</Label>
            </div>
            <Select 
              value={selectedMeasurement?.toString() || ""} 
              onValueChange={(v) => {
                const num = v ? parseInt(v) : null;
                onMeasurementChange(num);
                onPeriodChange(null);
              }}
            >
              <SelectTrigger className="h-12 text-lg font-semibold bg-background">
                <SelectValue placeholder="Selecione a medição" />
              </SelectTrigger>
              <SelectContent>
                {availableMeasurements.map(m => (
                  <SelectItem key={m.number} value={m.number.toString()}>
                    <div className="flex items-center gap-3">
                      <Badge className="text-base px-3">{m.number}ª</Badge>
                      <span className="text-sm text-muted-foreground">
                        {m.periodsCount} serviço(s) · {m.totalHouses} casas
                      </span>
                    </div>
                  </SelectItem>
                ))}
                {availableMeasurements.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhuma medição planejada
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Period Info */}
          {selectedMeasurement !== null && (
            <div className="flex-1 min-w-[250px]">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <Label className="font-medium">Serviço Planejado</Label>
              </div>
              <Select
                value={selectedPeriod?.id || ""}
                onValueChange={(v) => {
                  const period = periodsForMeasurement.find(p => p.id === v);
                  onPeriodChange(period || null);
                }}
              >
                <SelectTrigger className="h-12 bg-background">
                  <SelectValue placeholder="Selecione o serviço" />
                </SelectTrigger>
                <SelectContent>
                  {periodsForMeasurement.map(period => (
                    <SelectItem key={period.id} value={period.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: period.macro_color || '#6b7280' }} 
                        />
                        <span className="font-medium">{period.scope_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {period.planned_houses} casas
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quick Stats */}
          {selectedPeriod && (
            <div className="flex gap-3">
              <div className="bg-background rounded-lg p-3 text-center min-w-[100px]">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs">Previsto</span>
                </div>
                <span className="text-2xl font-bold text-primary">{selectedPeriod.planned_houses}</span>
                <span className="text-xs text-muted-foreground ml-1">casas</span>
              </div>
              <div className="bg-background rounded-lg p-3 text-center min-w-[120px]">
                <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Período</span>
                </div>
                <span className="text-sm font-medium">
                  {format(parseISO(selectedPeriod.week_start), 'dd/MM', { locale: ptBR })} - {format(parseISO(selectedPeriod.week_end), 'dd/MM', { locale: ptBR })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Validation Alert */}
        {selectedMeasurement && !selectedPeriod && periodsForMeasurement.length > 0 && (
          <div className="mt-3 flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Selecione um serviço para validar a produção
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
