import { useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanningPeriod, PeriodService } from "@/hooks/usePeriodPlanning";
import { AddServiceDialog } from "@/components/planning/AddServiceDialog";

interface PeriodServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: PlanningPeriod | null;
  services: PeriodService[];
  isLoading: boolean;
  canEdit: boolean;
  projectId: string;
  companyId: string;
  onRefresh: () => void;
  onDeleteService: (serviceId: string) => Promise<boolean>;
  onUpdateHouses?: (serviceId: string, newHouses: number) => Promise<boolean>;
}

export function PeriodServicesDialog({
  open,
  onOpenChange,
  period,
  services,
  isLoading,
  canEdit,
  projectId,
  companyId,
  onRefresh,
  onDeleteService,
  onUpdateHouses,
}: PeriodServicesDialogProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    return `${format(startDate, "dd/MM", { locale: ptBR })} a ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "ok":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">OK</Badge>;
      case "attention":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Atenção</Badge>;
      case "critical":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Crítico</Badge>;
      default:
        return <Badge variant="outline">Planejado</Badge>;
    }
  };

  // Filter out services with 0 target houses
  const activeServices = services.filter(s => s.target_houses > 0);

  // Period is editable only in draft status
  const isEditable = canEdit && period?.status === "draft";

  // Totais
  const totals = activeServices.reduce(
    (acc, s) => ({
      houses: acc.houses + s.target_houses,
      cost: acc.cost + s.planned_cost,
      revenue: acc.revenue + s.planned_revenue,
      profit: acc.profit + s.projected_result,
    }),
    { houses: 0, cost: 0, revenue: 0, profit: 0 }
  );

  const handleStartEdit = useCallback((service: PeriodService) => {
    if (!isEditable) return;
    setEditingId(service.id);
    setEditValue(String(service.target_houses));
  }, [isEditable]);

  const handleSaveEdit = useCallback(async (serviceId: string) => {
    const newValue = parseInt(editValue, 10);
    if (isNaN(newValue) || newValue < 0) {
      setEditingId(null);
      return;
    }
    if (onUpdateHouses) {
      await onUpdateHouses(serviceId, newValue);
    }
    setEditingId(null);
  }, [editValue, onUpdateHouses]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, serviceId: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(serviceId);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }, [handleSaveEdit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] sm:max-w-[95vw] w-full max-h-[95vh] sm:max-h-[92vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader className="pb-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base sm:text-lg">
                {period?.name || `Medição ${period?.period_number}`}
              </DialogTitle>
              {period && (
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {formatDateRange(period.start_date, period.end_date)}
                  {period.status !== "draft" && (
                    <Badge variant="secondary" className="ml-2 text-[10px] sm:text-xs">
                      {period.status === "approved" ? "Aprovado" : 
                       period.status === "released_to_weekly" ? "Liberado" : 
                       period.status === "closed" ? "Fechado" : "Rascunho"}
                    </Badge>
                  )}
                </p>
              )}
            </div>
            {isEditable && (
              <Button
                size="sm"
                onClick={() => { setEditingService(null); setAddServiceOpen(true); }}
                className="gap-1.5 shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Adicionar Serviço</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : activeServices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum serviço planejado para este período.</p>
              <p className="text-sm mt-2">Defina metas no Planejamento de Longo Prazo.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table className="text-xs sm:text-sm">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[140px] sm:min-w-[220px] py-2">Serviço</TableHead>
                    <TableHead className="text-right w-[60px] sm:w-[90px] py-2">
                      {isEditable ? "Casas ✎" : "Casas"}
                    </TableHead>
                    <TableHead className="text-right py-2 hidden sm:table-cell">Custo</TableHead>
                    <TableHead className="text-right py-2 hidden sm:table-cell">Receita</TableHead>
                    <TableHead className="text-right py-2">Resultado</TableHead>
                    <TableHead className="text-center w-[50px] sm:w-[70px] py-2">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeServices.map((service, index) => {
                    const margin = service.planned_revenue > 0
                      ? (service.projected_result / service.planned_revenue) * 100
                      : 0;
                    const isEditingThis = editingId === service.id;

                    return (
                      <TableRow
                        key={service.id}
                        className={cn(index % 2 === 0 ? "bg-background" : "bg-muted/20")}
                      >
                        <TableCell className="py-1.5 sm:py-2">
                          <p className="font-medium text-xs sm:text-sm leading-tight">{service.scope_name}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{service.macro_name}</p>
                        </TableCell>
                        <TableCell className="text-right py-1.5 sm:py-2">
                          {isEditingThis ? (
                            <Input
                              type="number"
                              min={0}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSaveEdit(service.id)}
                              onKeyDown={(e) => handleKeyDown(e, service.id)}
                              className="w-14 sm:w-20 h-7 text-right ml-auto text-xs"
                              autoFocus
                            />
                          ) : (
                            <span
                              className={cn(
                                "font-medium cursor-default",
                                isEditable && "cursor-pointer hover:bg-muted px-1.5 py-0.5 rounded transition-colors"
                              )}
                              onClick={() => handleStartEdit(service)}
                            >
                              {service.target_houses}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-1.5 sm:py-2 hidden sm:table-cell">
                          {formatCurrency(service.planned_cost)}
                        </TableCell>
                        <TableCell className="text-right py-1.5 sm:py-2 hidden sm:table-cell">
                          {formatCurrency(service.planned_revenue)}
                        </TableCell>
                        <TableCell className="text-right py-1.5 sm:py-2">
                          <span
                            className={cn(
                              "font-medium",
                              service.projected_result >= 0 ? "text-green-600" : "text-red-600"
                            )}
                          >
                            {formatCurrency(service.projected_result)}
                          </span>
                          <span className="text-[10px] sm:text-xs text-muted-foreground ml-0.5">
                            ({margin.toFixed(1)}%)
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-1.5 sm:py-2">
                          {getStatusBadge(service.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell className="py-1.5 sm:py-2 text-xs sm:text-sm">Total ({activeServices.length})</TableCell>
                    <TableCell className="text-right py-1.5 sm:py-2">{totals.houses}</TableCell>
                    <TableCell className="text-right py-1.5 sm:py-2 hidden sm:table-cell">{formatCurrency(totals.cost)}</TableCell>
                    <TableCell className="text-right py-1.5 sm:py-2 hidden sm:table-cell">{formatCurrency(totals.revenue)}</TableCell>
                    <TableCell className="text-right py-1.5 sm:py-2">
                      <span className={cn(totals.profit >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(totals.profit)}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 sm:py-2" />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>

      {period && (
        <AddServiceDialog
          open={addServiceOpen}
          onOpenChange={setAddServiceOpen}
          projectId={projectId}
          periodId={period.id}
          companyId={companyId}
          existingService={editingService}
          onSave={() => { setAddServiceOpen(false); onRefresh(); }}
        />
      )}
    </Dialog>
  );
}
