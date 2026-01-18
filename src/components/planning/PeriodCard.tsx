import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Home, DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanningPeriod } from "@/hooks/usePeriodPlanning";

interface PeriodCardProps {
  period: PlanningPeriod;
  isSelected: boolean;
  onClick: () => void;
}

export function PeriodCard({ period, isSelected, onClick }: PeriodCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    return `${format(startDate, "dd/MM", { locale: ptBR })} - ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`;
  };

  const profitIsPositive = period.total_planned_profit >= 0;
  const margin = period.total_planned_revenue > 0
    ? (period.total_planned_profit / period.total_planned_revenue) * 100
    : 0;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary shadow-md"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {period.name || `Quinzena ${period.period_number}`}
          </CardTitle>
          <Badge variant={period.is_closed ? "secondary" : "outline"}>
            {period.is_closed ? "Fechado" : period.status || "Planejado"}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Calendar className="h-3 w-3" />
          {formatDateRange(period.start_date, period.end_date)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Casas */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>Casas Planejadas</span>
          </div>
          <span className="font-semibold">{period.total_planned_houses}</span>
        </div>

        {/* Custo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>Custo Previsto</span>
          </div>
          <span className="font-medium text-sm">
            {formatCurrency(period.total_planned_cost)}
          </span>
        </div>

        {/* Receita */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Receita Prevista</span>
          </div>
          <span className="font-medium text-sm">
            {formatCurrency(period.total_planned_revenue)}
          </span>
        </div>

        {/* Resultado */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2 text-sm font-medium">
            {profitIsPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span>Resultado</span>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "font-bold",
                profitIsPositive ? "text-green-600" : "text-red-600"
              )}
            >
              {formatCurrency(period.total_planned_profit)}
            </span>
            <span
              className={cn(
                "text-xs ml-2",
                margin >= 15 ? "text-green-600" : margin >= 0 ? "text-yellow-600" : "text-red-600"
              )}
            >
              ({margin.toFixed(1)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
