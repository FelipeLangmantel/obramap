import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Home, DollarSign, TrendingUp, TrendingDown, CheckCircle2, Lock, Loader2, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanningPeriod, PeriodStatus } from "@/hooks/usePeriodPlanning";

interface PeriodCardProps {
  period: PlanningPeriod;
  isSelected: boolean;
  onClick: () => void;
  onApprove?: (periodId: string) => void;
  isApproving?: boolean;
  canApprove?: boolean;
}

const getStatusConfig = (status: PeriodStatus) => {
  switch (status) {
    case "approved":
      return { label: "Aprovado", variant: "default" as const, icon: CheckCircle2, className: "bg-blue-500" };
    case "executing":
      return { label: "Em Execução", variant: "default" as const, icon: null, className: "bg-amber-500" };
    case "closed":
      return { label: "Fechado", variant: "secondary" as const, icon: Lock, className: "" };
    default:
      return { label: "Rascunho", variant: "outline" as const, icon: null, className: "" };
  }
};

export function PeriodCard({ 
  period, 
  isSelected, 
  onClick, 
  onApprove,
  isApproving,
  canApprove = true 
}: PeriodCardProps) {
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

  const statusConfig = getStatusConfig(period.status);
  const isDraft = period.status === "draft" || period.status === "planned";
  const isLocked = !isDraft;

  const handleApproveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onApprove && isDraft) {
      onApprove(period.id);
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary shadow-md",
        isLocked && "opacity-90"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">
              {period.name || `Quinzena ${period.period_number}`}
            </CardTitle>
            {isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <Badge variant={statusConfig.variant} className={statusConfig.className}>
            {statusConfig.icon && <statusConfig.icon className="h-3 w-3 mr-1" />}
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Calendar className="h-3 w-3" />
          {formatDateRange(period.start_date, period.end_date)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Casas e Capacidade */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="h-4 w-4" />
            <span>Casas Planejadas</span>
          </div>
          <span className="font-semibold">{period.total_planned_houses}</span>
        </div>

        {/* Capacidade Produtiva */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Capacidade</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{period.total_capacity}</span>
            {period.capacity_gap < 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                -{Math.abs(period.capacity_gap)}
              </Badge>
            )}
            {period.capacity_gap > 0 && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                +{period.capacity_gap}
              </Badge>
            )}
          </div>
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

        {/* Botão Aprovar Período */}
        {isDraft && canApprove && onApprove && (
          <Button
            className="w-full mt-2"
            variant="default"
            size="sm"
            onClick={handleApproveClick}
            disabled={isApproving}
          >
            {isApproving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Aprovando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aprovar Período
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
