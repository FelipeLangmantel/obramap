import { useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, ClipboardCheck, Target, Home, CheckCircle2, ListChecks, ChevronRight, Plus, AlertCircle } from "lucide-react";
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
  registeredScopeIds: string[]; // Services already registered for this measurement
  selectedMeasurement: number | null;
  onMeasurementChange: (measurement: number | null) => void;
  selectedPeriod: PlannedPeriod | null;
  onPeriodChange: (period: PlannedPeriod | null) => void;
  onApplyService: (period: PlannedPeriod) => void;
  onAddUnplannedService: () => void;
}

export function MeasurementSelector({
  plannedPeriods,
  registeredScopeIds,
  selectedMeasurement,
  onMeasurementChange,
  selectedPeriod,
  onPeriodChange,
  onApplyService,
  onAddUnplannedService
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

  // Available measurements with summary info
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

  // Periods for selected measurement - filter out already registered services
  const periodsForMeasurement = useMemo(() => {
    if (selectedMeasurement === null) return [];
    return plannedPeriods
      .filter(p => (p.measurement_number || 1) === selectedMeasurement)
      .filter(p => !registeredScopeIds.includes(p.id)); // Exclude already registered
  }, [plannedPeriods, selectedMeasurement, registeredScopeIds]);

  // Count of registered services for this measurement
  const registeredCount = useMemo(() => {
    if (selectedMeasurement === null) return 0;
    const allPeriods = plannedPeriods.filter(p => (p.measurement_number || 1) === selectedMeasurement);
    return allPeriods.filter(p => registeredScopeIds.includes(p.id)).length;
  }, [plannedPeriods, selectedMeasurement, registeredScopeIds]);

  const totalServicesInMeasurement = useMemo(() => {
    if (selectedMeasurement === null) return 0;
    return plannedPeriods.filter(p => (p.measurement_number || 1) === selectedMeasurement).length;
  }, [plannedPeriods, selectedMeasurement]);

  // Current measurement info
  const currentMeasurementInfo = useMemo(() => {
    return availableMeasurements.find(m => m.number === selectedMeasurement);
  }, [availableMeasurements, selectedMeasurement]);

  // Auto-select first service when measurement changes
  useEffect(() => {
    if (selectedMeasurement !== null && periodsForMeasurement.length > 0 && !selectedPeriod) {
      onPeriodChange(periodsForMeasurement[0]);
    }
  }, [selectedMeasurement, periodsForMeasurement, selectedPeriod, onPeriodChange]);

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-transparent to-primary/5">
      <CardContent className="p-4">
        {/* Main Measurement Selector */}
        <div className="flex flex-col gap-4">
          {/* Header Row */}
          <div className="flex items-center gap-4 flex-wrap">
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
                  onPeriodChange(null); // Reset period when measurement changes
                }}
              >
                <SelectTrigger className="h-12 text-lg font-semibold bg-background border-2 border-primary/20 hover:border-primary/40 transition-colors">
                  <SelectValue placeholder="Selecione a medição..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMeasurements.map(m => (
                    <SelectItem key={m.number} value={m.number.toString()}>
                      <div className="flex items-center gap-3 py-1">
                        <Badge className="text-base px-3 bg-primary">{m.number}ª Medição</Badge>
                        <div className="flex flex-col text-left">
                          <span className="text-sm font-medium">
                            {m.periodsCount} serviço(s) · {m.totalHouses} casas
                          </span>
                          {m.dateRange && (
                            <span className="text-xs text-muted-foreground">
                              {format(parseISO(m.dateRange.start), 'dd/MM', { locale: ptBR })} - {format(parseISO(m.dateRange.end), 'dd/MM', { locale: ptBR })}
                            </span>
                          )}
                        </div>
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

            {/* Quick Stats for selected measurement */}
            {currentMeasurementInfo && (
              <div className="flex gap-3 flex-wrap">
                <div className="bg-background rounded-lg p-3 text-center min-w-[90px] border">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <ListChecks className="w-4 h-4" />
                    <span className="text-xs">Pendentes</span>
                  </div>
                  <span className="text-2xl font-bold text-primary">{periodsForMeasurement.length}</span>
                  {registeredCount > 0 && (
                    <span className="text-xs text-muted-foreground block">de {totalServicesInMeasurement}</span>
                  )}
                </div>
                {registeredCount > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center min-w-[90px] border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs">Lançados</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{registeredCount}</span>
                  </div>
                )}
                <div className="bg-background rounded-lg p-3 text-center min-w-[90px] border">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                    <Home className="w-4 h-4" />
                    <span className="text-xs">Casas</span>
                  </div>
                  <span className="text-2xl font-bold text-primary">{currentMeasurementInfo.totalHouses}</span>
                </div>
                {currentMeasurementInfo.dateRange && (
                  <div className="bg-background rounded-lg p-3 text-center min-w-[120px] border">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs">Período</span>
                    </div>
                    <span className="text-sm font-medium">
                      {format(parseISO(currentMeasurementInfo.dateRange.start), 'dd/MM', { locale: ptBR })} - {format(parseISO(currentMeasurementInfo.dateRange.end), 'dd/MM', { locale: ptBR })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Services List for Selected Measurement */}
          {selectedMeasurement !== null && periodsForMeasurement.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Serviços Planejados</Label>
              </div>
              <ScrollArea className="max-h-[200px]">
                <div className="grid gap-2">
                  {periodsForMeasurement.map((period) => {
                    const isSelected = selectedPeriod?.id === period.id;
                    return (
                      <div
                        key={period.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-primary bg-primary/10 shadow-sm' 
                            : 'border-border/50 hover:border-primary/30 hover:bg-muted/30'
                        }`}
                        onClick={() => onPeriodChange(period)}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full shrink-0 ${isSelected ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : ''}`}
                          style={{ backgroundColor: period.macro_color || '#6b7280' }} 
                        />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm" title={period.scope_name}>{period.scope_name}</span>
                            <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5">
                              {period.macro_name}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium">{period.planned_houses} casas</span>
                            <span>·</span>
                            <span>
                              {format(parseISO(period.week_start), 'dd/MM', { locale: ptBR })} - {format(parseISO(period.week_end), 'dd/MM', { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <Button
                            size="sm"
                            className="shrink-0 gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              onApplyService(period);
                            }}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Aplicar
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Empty State - All services registered */}
          {selectedMeasurement !== null && periodsForMeasurement.length === 0 && totalServicesInMeasurement > 0 && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="text-sm font-medium text-green-600">Todos os serviços desta medição foram lançados!</p>
              <p className="text-xs text-muted-foreground mt-1">{registeredCount} serviços registrados</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3 gap-2"
                onClick={onAddUnplannedService}
              >
                <Plus className="w-4 h-4" />
                Adicionar serviço não previsto
              </Button>
            </div>
          )}

          {/* Empty State - No services at all */}
          {selectedMeasurement !== null && totalServicesInMeasurement === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum serviço planejado para esta medição</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3 gap-2"
                onClick={onAddUnplannedService}
              >
                <Plus className="w-4 h-4" />
                Adicionar serviço não previsto
              </Button>
            </div>
          )}

          {/* Add unplanned service button (always visible when measurement selected) */}
          {selectedMeasurement !== null && periodsForMeasurement.length > 0 && (
            <div className="flex justify-end pt-2 border-t">
              <Button 
                variant="ghost" 
                size="sm" 
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={onAddUnplannedService}
              >
                <Plus className="w-4 h-4" />
                Adicionar serviço não previsto
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
