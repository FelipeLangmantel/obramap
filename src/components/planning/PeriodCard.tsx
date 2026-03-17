import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Home, DollarSign, TrendingUp, TrendingDown, CheckCircle2, Lock, Loader2, Users, AlertTriangle, Play, Archive, Package, RefreshCw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlanningPeriod, PeriodStatus } from "@/hooks/usePeriodPlanning";

interface PeriodCardProps {
  period: PlanningPeriod;
  isSelected: boolean;
  onClick: () => void;
  onStatusChange?: (periodId: string, newStatus: PeriodStatus) => void;
  onGenerateSupplies?: (periodId: string) => void;
  isChangingStatus?: boolean;
  isGeneratingSupplies?: boolean;
  canEdit?: boolean;
}

const getStatusConfig = (status: PeriodStatus) => {
  switch (status) {
    case "approved":
      return { label: "Aprovado", variant: "default" as const, icon: CheckCircle2, className: "bg-blue-500" };
    case "released_to_weekly":
      return { label: "Liberado", variant: "default" as const, icon: Play, className: "bg-amber-500" };
    case "closed":
      return { label: "Fechado", variant: "secondary" as const, icon: Lock, className: "" };
    default:
      return { label: "Rascunho", variant: "outline" as const, icon: null, className: "" };
  }
};

const getNextAction = (status: PeriodStatus) => {
  switch (status) {
    case "draft":
      return { nextStatus: "approved" as PeriodStatus, label: "Aprovar", icon: CheckCircle2 };
    case "approved":
      return { nextStatus: "released_to_weekly" as PeriodStatus, label: "Liberar Semanal", icon: Play };
    case "released_to_weekly":
      return { nextStatus: "closed" as PeriodStatus, label: "Fechar", icon: Archive };
    default:
      return null;
  }
};

const canRevert = (status: PeriodStatus) => {
  return status === "approved" || status === "released_to_weekly";
};

export function PeriodCard({ 
  period, 
  isSelected, 
  onClick, 
  onStatusChange,
  onGenerateSupplies,
  isChangingStatus,
  isGeneratingSupplies,
  canEdit = true 
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
  const nextAction = getNextAction(period.status);
  const isLocked = period.status === "closed";

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange && nextAction) {
      onStatusChange(period.id, nextAction.nextStatus);
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
              {period.name || `Medição ${period.period_number}`}
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

        {/* Indicador de Suprimentos (apenas para aprovados ou posterior) */}
        {(period.status === "approved" || period.status === "released_to_weekly" || period.status === "closed") && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              <span>Suprimentos</span>
            </div>
            <div className="flex items-center gap-2">
              {period.supplies_generated_at ? (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Gerados
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">
                  Pendente
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Botão de Ação de Status */}
        {nextAction && canEdit && onStatusChange && (
          <Button
            className="w-full mt-2"
            variant={period.status === "released_to_weekly" ? "secondary" : "default"}
            size="sm"
            onClick={handleActionClick}
            disabled={isChangingStatus || isGeneratingSupplies}
          >
            {isChangingStatus ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <nextAction.icon className="h-4 w-4 mr-2" />
                {nextAction.label}
              </>
            )}
          </Button>
        )}

        {/* Botão de Regerar Suprimentos (apenas para aprovados) */}
        {period.status === "approved" && canEdit && onGenerateSupplies && (
          <Button
            className="w-full mt-2"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSupplies(period.id);
            }}
            disabled={isGeneratingSupplies || isChangingStatus}
          >
            {isGeneratingSupplies ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {period.supplies_generated_at ? "Regerar Suprimentos" : "Gerar Suprimentos"}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
