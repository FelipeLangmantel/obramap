import { Save, RefreshCw, TrendingUp, TrendingDown, Plus, Building2, DollarSign, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PlanningVersion } from "@/hooks/useLongTermPlanning";

interface PlanningHeaderProps {
  activeVersion: PlanningVersion | null;
  overallTotals: {
    total_houses: number;
    total_cost: number;
    total_revenue: number;
    projected_result: number;
  };
  totalHouses: number;
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onRefresh: () => void;
  onAddPeriod?: () => void;
}

export function PlanningHeader({
  activeVersion,
  overallTotals,
  totalHouses,
  hasChanges,
  saving,
  onSave,
  onRefresh,
  onAddPeriod,
}: PlanningHeaderProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const marginPercent = overallTotals.total_revenue > 0
    ? ((overallTotals.projected_result / overallTotals.total_revenue) * 100).toFixed(1)
    : "0";

  const planningProgress = totalHouses > 0
    ? Math.min(100, (overallTotals.total_houses / totalHouses) * 100)
    : 0;

  const getResultStatus = () => {
    const margin = overallTotals.total_revenue > 0
      ? (overallTotals.projected_result / overallTotals.total_revenue) * 100
      : 0;

    if (margin >= 15) return { label: "Saudável", color: "text-emerald-500" };
    if (margin >= 8) return { label: "Atenção", color: "text-amber-500" };
    return { label: "Crítico", color: "text-destructive" };
  };

  const status = getResultStatus();

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {activeVersion && (
            <Badge variant="secondary" className="text-sm font-medium px-3 py-1">
              {activeVersion.name}
            </Badge>
          )}
          {onAddPeriod && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAddPeriod}
              disabled={saving}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Período
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={saving}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!hasChanges || saving}
            className={cn(
              "gap-2 transition-all",
              hasChanges && "shadow-md shadow-primary/25"
            )}
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Progresso de Planejamento */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Casas Planejadas</p>
              <p className="text-lg font-bold">{overallTotals.total_houses} <span className="text-sm font-normal text-muted-foreground">/ {totalHouses}</span></p>
            </div>
          </div>
          <Progress value={planningProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{planningProgress.toFixed(0)}% do empreendimento</p>
        </div>

        {/* Receita */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-xs text-muted-foreground">Receita Prevista</p>
          </div>
          <p className="text-lg font-bold text-emerald-600">
            {formatCurrency(overallTotals.total_revenue)}
          </p>
        </div>

        {/* Custo */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-xs text-muted-foreground">Custo Previsto</p>
          </div>
          <p className="text-lg font-bold">
            {formatCurrency(overallTotals.total_cost)}
          </p>
        </div>

        {/* Resultado */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              overallTotals.projected_result >= 0 ? "bg-emerald-500/10" : "bg-destructive/10"
            )}>
              {overallTotals.projected_result >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Resultado</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={cn(
              "text-lg font-bold",
              overallTotals.projected_result >= 0 ? "text-emerald-600" : "text-destructive"
            )}>
              {formatCurrency(overallTotals.projected_result)}
            </p>
            <Badge variant="outline" className={cn("text-xs", status.color)}>
              {marginPercent}%
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
