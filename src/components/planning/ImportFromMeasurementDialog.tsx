import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Download, 
  CalendarDays, 
  ClipboardList,
  Home,
  AlertTriangle,
  CheckCircle2,
  Info
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useMeasurementSuggestions, 
  MeasurementSuggestion,
  PeriodForImport 
} from "@/hooks/useMeasurementSuggestions";

interface ImportFromMeasurementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | undefined;
  onImport: (suggestions: MeasurementSuggestion[], period: PeriodForImport) => void;
}

export function ImportFromMeasurementDialog({
  open,
  onOpenChange,
  projectId,
  onImport,
}: ImportFromMeasurementDialogProps) {
  const {
    periods,
    selectedPeriod,
    selectedPeriodId,
    suggestions,
    isLoading,
    isLoadingSuggestions,
    selectPeriod,
  } = useMeasurementSuggestions({ projectId });

  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());

  // Toggle seleção individual
  const toggleSuggestion = (id: string) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Selecionar/desmarcar todas
  const toggleAll = () => {
    if (selectedSuggestionIds.size === suggestions.length) {
      setSelectedSuggestionIds(new Set());
    } else {
      setSelectedSuggestionIds(new Set(suggestions.map((s) => s.id)));
    }
  };

  // Sugestões selecionadas
  const selectedSuggestions = useMemo(() => {
    return suggestions.filter((s) => selectedSuggestionIds.has(s.id));
  }, [suggestions, selectedSuggestionIds]);

  // Total de casas nas sugestões selecionadas
  const totalSelectedHouses = useMemo(() => {
    return selectedSuggestions.reduce((sum, s) => sum + s.target_houses, 0);
  }, [selectedSuggestions]);

  // Handler para confirmar importação
  const handleConfirmImport = () => {
    if (selectedSuggestions.length > 0 && selectedPeriod) {
      onImport(selectedSuggestions, selectedPeriod);
      onOpenChange(false);
      // Reset state
      setSelectedSuggestionIds(new Set());
      selectPeriod(null);
    }
  };

  // Reset quando fechar
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedSuggestionIds(new Set());
      selectPeriod(null);
    }
    onOpenChange(newOpen);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Importar Dados do Planejamento de Medições
          </DialogTitle>
          <DialogDescription className="flex items-start gap-2 text-sm">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Selecione um período e os serviços que deseja importar como sugestão. 
              Os dados serão preenchidos no formulário para você editar antes de salvar.
              <strong className="block mt-1 text-muted-foreground/80">
                Nenhum dado será gravado automaticamente.
              </strong>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Seletor de Período */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Período de Planejamento</Label>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : periods.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-warning" />
                  <p>Nenhum período de planejamento encontrado.</p>
                  <p className="text-xs mt-1">
                    Crie períodos no módulo de Planejamento de Longo Prazo primeiro.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Select
                value={selectedPeriodId || ""}
                onValueChange={(value) => selectPeriod(value || null)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione um período..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">
                            {period.period_number}ª Medição
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {format(parseISO(period.start_date), "dd/MM", { locale: ptBR })} - {format(parseISO(period.end_date), "dd/MM", { locale: ptBR })}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {period.total_services} serviços
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {period.total_houses} casas
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Lista de Sugestões */}
          {selectedPeriodId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Serviços Disponíveis</Label>
                {suggestions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={toggleAll}
                  >
                    {selectedSuggestionIds.size === suggestions.length
                      ? "Desmarcar Todos"
                      : "Selecionar Todos"}
                  </Button>
                )}
              </div>

              {isLoadingSuggestions ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : suggestions.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum serviço cadastrado neste período.</p>
                  </CardContent>
                </Card>
              ) : (
                <ScrollArea className="h-[280px] rounded-lg border">
                  <div className="p-2 space-y-2">
                    {suggestions.map((suggestion) => {
                      const isSelected = selectedSuggestionIds.has(suggestion.id);
                      return (
                        <div
                          key={suggestion.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                              : "border-border hover:border-primary/50 hover:bg-muted/30"
                          }`}
                          onClick={() => toggleSuggestion(suggestion.id)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSuggestion(suggestion.id)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {suggestion.macro_name}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-sm text-muted-foreground">
                                  {suggestion.scope_name}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Home className="w-3 h-3" />
                                  {suggestion.target_houses} casas
                                </span>
                                <span>
                                  Receita: {formatCurrency(suggestion.planned_revenue)}
                                </span>
                                <span>
                                  Custo: {formatCurrency(suggestion.planned_cost)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedSuggestions.length > 0 && (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  {selectedSuggestions.length} serviço(s) selecionado(s) •{" "}
                  {totalSelectedHouses} casas
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={selectedSuggestions.length === 0}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Importar Selecionados
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
