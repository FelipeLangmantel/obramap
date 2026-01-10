import { Save, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PlanningVersion } from "@/hooks/useLongTermPlanning";

interface PlanningHeaderProps {
  versions: PlanningVersion[];
  selectedVersionId: string | null;
  onVersionChange: (versionId: string) => void;
  overallTotals: {
    total_houses: number;
    total_cost: number;
    total_revenue: number;
    projected_result: number;
  };
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onRefresh: () => void;
}

export function PlanningHeader({
  versions,
  selectedVersionId,
  onVersionChange,
  overallTotals,
  hasChanges,
  saving,
  onSave,
  onRefresh,
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

  const getResultStatus = () => {
    const margin = overallTotals.total_revenue > 0
      ? (overallTotals.projected_result / overallTotals.total_revenue) * 100
      : 0;

    if (margin >= 15) return { label: "Saudável", color: "bg-emerald-500", textColor: "text-emerald-600" };
    if (margin >= 8) return { label: "Atenção", color: "bg-yellow-500", textColor: "text-yellow-600" };
    return { label: "Crítico", color: "bg-destructive", textColor: "text-destructive" };
  };

  const status = getResultStatus();

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-muted-foreground">
            Versão:
          </label>
          <Select
            value={selectedVersionId || ""}
            onValueChange={onVersionChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione uma versão" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((version) => (
                <SelectItem key={version.id} value={version.id}>
                  <div className="flex items-center gap-2">
                    <span>{version.name}</span>
                    {version.is_active && (
                      <Badge variant="secondary" className="text-xs">
                        Ativa
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={saving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!hasChanges || saving}
            className={cn(hasChanges && "animate-pulse")}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Salvando..." : "Salvar Planejamento"}
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Casas</div>
            <div className="text-2xl font-bold">{overallTotals.total_houses}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Receita Prevista</div>
            <div className="text-xl font-bold text-primary">
              {formatCurrency(overallTotals.total_revenue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Custo Previsto</div>
            <div className="text-xl font-bold">
              {formatCurrency(overallTotals.total_cost)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Resultado Projetado</div>
            <div className={cn(
              "text-xl font-bold flex items-center gap-1",
              overallTotals.projected_result >= 0 ? "text-emerald-600" : "text-destructive"
            )}>
              {overallTotals.projected_result >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {formatCurrency(overallTotals.projected_result)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="flex items-center gap-2 mt-1">
              <div className={cn("w-3 h-3 rounded-full", status.color)} />
              <span className={cn("font-semibold", status.textColor)}>
                {status.label}
              </span>
              <span className="text-sm text-muted-foreground">
                ({marginPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
