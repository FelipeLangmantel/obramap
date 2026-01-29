import { useState, useEffect } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Loader2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PlanningPeriod } from "@/hooks/usePeriodPlanning";

interface EditPeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: PlanningPeriod | null;
  onSave: (periodId: string, startDate: string, endDate: string) => Promise<boolean>;
}

export function EditPeriodDialog({
  open,
  onOpenChange,
  period,
  onSave,
}: EditPeriodDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when period changes
  useEffect(() => {
    if (period) {
      setStartDate(parseISO(period.start_date));
      setEndDate(parseISO(period.end_date));
    }
  }, [period]);

  // Check if editing is allowed based on status
  const isReadOnly = period?.status === "released_to_weekly" || period?.status === "closed";
  const readOnlyMessage = period?.status === "released_to_weekly" 
    ? "Período já liberado para planejamento semanal"
    : period?.status === "closed" 
    ? "Período fechado não pode ser editado"
    : "";

  // Calculate period duration
  const duration = startDate && endDate 
    ? differenceInDays(endDate, startDate) + 1 
    : 0;

  const handleSave = async () => {
    if (!period || !startDate || !endDate) return;

    // Validate dates
    if (endDate < startDate) {
      return;
    }

    setIsSaving(true);
    const success = await onSave(
      period.id,
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd")
    );
    setIsSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Editar Período - {period?.name || `Quinzena ${period?.period_number}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isReadOnly && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>{readOnlyMessage}</span>
            </div>
          )}

          {/* Data Inicial */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Data Inicial</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground",
                            isReadOnly && "opacity-60 cursor-not-allowed"
                          )}
                          disabled={isReadOnly}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {startDate ? (
                            format(startDate, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione a data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      {!isReadOnly && (
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={startDate}
                            onSelect={setStartDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      )}
                    </Popover>
                  </div>
                </TooltipTrigger>
                {isReadOnly && (
                  <TooltipContent>
                    <p>{readOnlyMessage}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Data Final */}
          <div className="space-y-2">
            <Label htmlFor="endDate">Data Final</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground",
                            isReadOnly && "opacity-60 cursor-not-allowed"
                          )}
                          disabled={isReadOnly}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {endDate ? (
                            format(endDate, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione a data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      {!isReadOnly && (
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={endDate}
                            onSelect={setEndDate}
                            disabled={(date) => startDate ? date < startDate : false}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      )}
                    </Popover>
                  </div>
                </TooltipTrigger>
                {isReadOnly && (
                  <TooltipContent>
                    <p>{readOnlyMessage}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Duração calculada */}
          {startDate && endDate && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Duração do Período:</span>
              <span className="font-medium">{duration} dias</span>
            </div>
          )}

          {/* Validação de datas */}
          {startDate && endDate && endDate < startDate && (
            <p className="text-sm text-destructive">
              A data final deve ser maior ou igual à data inicial.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          {!isReadOnly && (
            <Button
              onClick={handleSave}
              disabled={isSaving || !startDate || !endDate || (endDate < startDate)}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
