import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckSquare, 
  Home, 
  Calendar,
  Plus,
  Check,
  ClipboardList
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MeasurementWithServices, MeasurementService } from "@/hooks/useMeasurements";

interface MeasurementSelectorNewProps {
  measurements: MeasurementWithServices[];
  selectedMeasurement: MeasurementWithServices | null;
  onMeasurementSelect: (measurement: MeasurementWithServices | null) => void;
  selectedService: MeasurementService | null;
  onServiceSelect: (service: MeasurementService | null) => void;
  registeredServiceIds: string[];
  onAddUnplannedService?: () => void;
  isLoading?: boolean;
}

export function MeasurementSelectorNew({
  measurements,
  selectedMeasurement,
  onMeasurementSelect,
  selectedService,
  onServiceSelect,
  registeredServiceIds,
  onAddUnplannedService,
  isLoading
}: MeasurementSelectorNewProps) {
  // Filter only valid measurements (in case of stale data)
  const validMeasurements = useMemo(() => {
    return measurements.filter(m => m && m.id);
  }, [measurements]);

  // Services for selected measurement
  const servicesForMeasurement = useMemo(() => {
    if (!selectedMeasurement) return [];
    return selectedMeasurement.services || [];
  }, [selectedMeasurement]);

  // Stats for selected measurement
  const measurementStats = useMemo(() => {
    if (!selectedMeasurement) return null;
    
    const totalServices = selectedMeasurement.servicesCount || 0;
    const registeredCount = servicesForMeasurement.filter(s => 
      registeredServiceIds.includes(s.id)
    ).length;
    const pendingCount = totalServices - registeredCount;
    
    return {
      totalServices,
      registeredCount,
      pendingCount,
      totalHouses: selectedMeasurement.totalHouses || 0
    };
  }, [selectedMeasurement, servicesForMeasurement, registeredServiceIds]);

  // Show loading state or empty state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-12 w-12 bg-muted rounded-full mb-3" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (validMeasurements.length === 0) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="p-6 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            Nenhuma medição encontrada. Crie um planejamento semanal primeiro.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckSquare className="w-5 h-5" />
          Medição
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Measurement selector */}
        <Select
          value={selectedMeasurement?.id || ""}
          onValueChange={(value) => {
            const measurement = validMeasurements.find(m => m.id === value) || null;
            onMeasurementSelect(measurement);
            onServiceSelect(null);
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione a medição..." />
          </SelectTrigger>
          <SelectContent>
            {validMeasurements.map(m => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex items-center gap-3 py-1">
                  <Badge variant="default" className="text-xs">
                    {m.measurement_number}ª Medição
                  </Badge>
                  <span className="text-sm">
                    {m.servicesCount} serviço(s) · {m.totalHouses} casas
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(m.start_date), 'dd/MM', { locale: ptBR })} - {format(parseISO(m.end_date), 'dd/MM', { locale: ptBR })}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Measurement stats */}
        {measurementStats && (
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-lg font-bold text-amber-600">{measurementStats.pendingCount}</div>
              <div className="text-xs text-muted-foreground">Pendentes</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-lg font-bold text-green-600">{measurementStats.registeredCount}</div>
              <div className="text-xs text-muted-foreground">Registrados</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-lg font-bold">{measurementStats.totalHouses}</div>
              <div className="text-xs text-muted-foreground">Casas</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2">
              <div className="text-lg font-bold">
                {format(parseISO(selectedMeasurement!.start_date), 'dd/MM', { locale: ptBR })}
              </div>
              <div className="text-xs text-muted-foreground">
                até {format(parseISO(selectedMeasurement!.end_date), 'dd/MM', { locale: ptBR })}
              </div>
            </div>
          </div>
        )}

        {/* Services list */}
        {selectedMeasurement && servicesForMeasurement.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Serviços da Medição:</div>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {servicesForMeasurement.map(service => {
                  const isRegistered = registeredServiceIds.includes(service.id);
                  const isSelected = selectedService?.id === service.id;
                  
                  return (
                    <button
                      key={service.id}
                      onClick={() => !isRegistered && onServiceSelect(isSelected ? null : service)}
                      disabled={isRegistered}
                      className={cn(
                        "w-full p-3 rounded-lg border text-left transition-all",
                        isRegistered 
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 opacity-60 cursor-not-allowed"
                          : isSelected
                            ? "bg-primary/10 border-primary ring-2 ring-primary/20"
                            : "bg-background hover:bg-muted/50 border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: service.macro_color }}
                          />
                          <span className="font-medium text-sm">{service.scope_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {service.macro_name}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            <Home className="w-3 h-3 mr-1" />
                            {service.planned_houses}
                          </Badge>
                          {isRegistered && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                      </div>
                      {service.planned_house_ids.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Casas: {service.planned_house_ids.slice(0, 10).join(', ')}
                          {service.planned_house_ids.length > 10 && ` +${service.planned_house_ids.length - 10}`}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Empty state for services */}
        {selectedMeasurement && servicesForMeasurement.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum serviço planejado nesta medição</p>
          </div>
        )}

        {/* All services registered */}
        {selectedMeasurement && servicesForMeasurement.length > 0 && 
         measurementStats?.pendingCount === 0 && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center">
            <Check className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              Todos os serviços desta medição foram registrados!
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {onAddUnplannedService && (
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={onAddUnplannedService}
            >
              <Plus className="w-4 h-4 mr-2" />
              Serviço não previsto
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
