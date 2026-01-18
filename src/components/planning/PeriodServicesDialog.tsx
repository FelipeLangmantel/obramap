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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PlanningPeriod, PeriodService } from "@/hooks/usePeriodPlanning";

interface PeriodServicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: PlanningPeriod | null;
  services: PeriodService[];
  isLoading: boolean;
}

export function PeriodServicesDialog({
  open,
  onOpenChange,
  period,
  services,
  isLoading,
}: PeriodServicesDialogProps) {
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

  // Totais
  const totals = services.reduce(
    (acc, s) => ({
      houses: acc.houses + s.target_houses,
      cost: acc.cost + s.planned_cost,
      revenue: acc.revenue + s.planned_revenue,
      profit: acc.profit + s.projected_result,
    }),
    { houses: 0, cost: 0, revenue: 0, profit: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {period?.name || `Quinzena ${period?.period_number}`}
          </DialogTitle>
          {period && (
            <p className="text-sm text-muted-foreground">
              Período: {formatDateRange(period.start_date, period.end_date)}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum serviço planejado para este período.
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="min-w-[200px]">Serviço</TableHead>
                    <TableHead className="text-right">Casas</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service, index) => {
                    const margin = service.planned_revenue > 0
                      ? (service.projected_result / service.planned_revenue) * 100
                      : 0;

                    return (
                      <TableRow
                        key={service.id}
                        className={cn(index % 2 === 0 ? "bg-background" : "bg-muted/20")}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{service.macro_name}</p>
                            <p className="text-xs text-muted-foreground">{service.scope_name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {service.target_houses}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(service.planned_cost)}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(service.planned_revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div>
                            <span
                              className={cn(
                                "font-medium text-sm",
                                service.projected_result >= 0 ? "text-green-600" : "text-red-600"
                              )}
                            >
                              {formatCurrency(service.projected_result)}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({margin.toFixed(1)}%)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(service.status)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {/* Linha de totais */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{totals.houses}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.revenue)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(totals.profit >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(totals.profit)}
                      </span>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
