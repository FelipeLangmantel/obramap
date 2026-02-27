import { useState, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, AlertTriangle, ShieldCheck, Trash2, CalendarClock, CheckCircle2, Ban, Users } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditPeriodDialog } from "@/components/planning/EditPeriodDialog";
import type { PlanningPeriod, ServiceRow, PeriodSummary, PeriodStatus } from "@/hooks/useLongTermPlanning";

interface LongTermPlanningMatrixProps {
  periods: PlanningPeriod[];
  serviceRows: ServiceRow[];
  periodSummaries: PeriodSummary[];
  totalHouses: number;
  onCellChange: (macroId: string, scopeId: string, periodId: string, value: number) => void;
  onDeletePeriod?: (periodId: string) => void;
  onUpdatePeriodDates?: (periodId: string, startDate: string, endDate: string) => Promise<boolean>;
  onConfigureProductivity?: (service: { macro_id: string; scope_id: string; macro_name: string; scope_name: string }) => void;
}

const isEditable = (status: PeriodStatus): boolean => {
  return status === "draft" || status === "planned";
};

const getStatusBadge = (status: PeriodStatus) => {
  switch (status) {
    case "approved":
      return { label: "Aprovado", className: "bg-primary/15 text-primary border-primary/30" };
    case "executing":
      return { label: "Em Execução", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
    case "closed":
      return { label: "Fechado", className: "bg-muted text-muted-foreground border-border" };
    default:
      return null;
  }
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function LongTermPlanningMatrix({
  periods,
  serviceRows,
  periodSummaries,
  totalHouses,
  onCellChange,
  onDeletePeriod,
  onUpdatePeriodDates,
  onConfigureProductivity,
}: LongTermPlanningMatrixProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [periodToDelete, setPeriodToDelete] = useState<PlanningPeriod | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<PlanningPeriod | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const formatPeriodHeader = (period: PlanningPeriod) => {
    const start = parseISO(period.start_date);
    const end = parseISO(period.end_date);
    return `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`;
  };

  const getCellKey = (macroId: string, scopeId: string, periodId: string) => {
    return `${macroId}_${scopeId}_${periodId}`;
  };

  const handleCellClick = (macroId: string, scopeId: string, periodId: string, period: PlanningPeriod, row: ServiceRow) => {
    if (!isEditable(period.status)) return;
    if (row.is_completed) return;
    setEditingCell(getCellKey(macroId, scopeId, periodId));
  };

  const handleCellBlur = (macroId: string, scopeId: string, periodId: string, currentValue: number) => {
    const inputValue = inputRef.current?.value;
    const newValue = parseInt(inputValue || "0", 10) || 0;
    if (newValue !== currentValue) {
      onCellChange(macroId, scopeId, periodId, newValue);
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, macroId: string, scopeId: string, periodId: string, currentValue: number) => {
    if (e.key === "Enter") {
      handleCellBlur(macroId, scopeId, periodId, currentValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleCellBlur(macroId, scopeId, periodId, currentValue);
      const currentPeriodIndex = periods.findIndex(p => p.id === periodId);
      for (let i = currentPeriodIndex + 1; i < periods.length; i++) {
        const nextPeriod = periods[i];
        if (isEditable(nextPeriod.status)) {
          setTimeout(() => setEditingCell(getCellKey(macroId, scopeId, nextPeriod.id)), 0);
          break;
        }
      }
    }
  };

  const getSummaryForPeriod = (periodId: string) => {
    return periodSummaries.find(s => s.period_id === periodId);
  };

  const getServiceProgress = (row: ServiceRow) => {
    // Use completion_percent from RPC if available, otherwise calculate
    if (row.completion_percent > 0) return row.completion_percent;
    const total = row.initial_bank + row.total_planned;
    return totalHouses > 0 ? Math.min(100, (total / totalHouses) * 100) : 0;
  };

  const getOverPlanningWarning = (row: ServiceRow) => {
    if (row.total_planned > row.available_houses && totalHouses > 0) {
      return `Planejado ${row.total_planned}, mas restam apenas ${row.available_houses} casas disponíveis`;
    }
    return null;
  };

  return (
    <div className="space-y-0">
      {/* Matrix */}
      <div className="relative overflow-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader className="sticky top-0 z-20">
            <TableRow className="bg-secondary/5 hover:bg-secondary/5">
              {/* Fixed columns */}
              <TableHead className="sticky left-0 z-30 bg-card min-w-[220px] border-r font-semibold text-foreground">
                Serviço
              </TableHead>
              <TableHead className="sticky left-[220px] z-30 bg-card w-[90px] text-center border-r font-semibold text-foreground">
                Executado
              </TableHead>
              <TableHead className="sticky left-[310px] z-30 bg-card w-[90px] text-center border-r font-semibold text-foreground">
                A Planejar
              </TableHead>
              <TableHead className="sticky left-[400px] z-30 bg-card w-[90px] text-center border-r font-semibold text-foreground">
                Planejado
              </TableHead>

              {/* Period columns */}
              {periods.map((period) => {
                const periodEditable = isEditable(period.status);
                const statusBadge = getStatusBadge(period.status);
                
                return (
                  <TableHead
                    key={period.id}
                    className={cn(
                      "min-w-[120px] text-center border-l",
                      !periodEditable && "bg-muted/30"
                    )}
                  >
                    <div className="flex flex-col items-center gap-1 py-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground text-sm">
                          P{period.period_number}
                        </span>
                        {!periodEditable && (
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        )}
                        {periodEditable && onDeletePeriod && periods.length > 1 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPeriodToDelete(period);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Excluir período</p></TooltipContent>
                          </Tooltip>
                        )}
                        {periodEditable && onUpdatePeriodDates && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="text-muted-foreground hover:text-primary transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPeriod(period);
                                }}
                              >
                                <CalendarClock className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Editar datas</p></TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">{formatPeriodHeader(period)}</span>
                      {statusBadge && (
                        <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5 border", statusBadge.className)}>
                          {statusBadge.label}
                        </Badge>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>

            {/* Period financial summary row */}
            <TableRow className="bg-primary/[0.03] hover:bg-primary/[0.03]">
              <TableCell className="sticky left-0 z-30 bg-primary/[0.03] font-semibold text-xs border-r text-foreground">
                Resumo Financeiro
              </TableCell>
              <TableCell className="sticky left-[220px] z-30 bg-primary/[0.03] border-r" />
              <TableCell className="sticky left-[310px] z-30 bg-primary/[0.03] border-r" />
              <TableCell className="sticky left-[400px] z-30 bg-primary/[0.03] border-r" />
              {periods.map((period) => {
                const summary = getSummaryForPeriod(period.id);
                return (
                  <TableCell key={period.id} className="text-center p-2 border-l">
                    <div className="flex flex-col gap-0.5 text-[11px]">
                      <span className="font-bold text-foreground">{summary?.total_houses || 0} un</span>
                      <span className="text-emerald-600">
                        {formatCurrency(summary?.total_revenue || 0)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatCurrency(summary?.total_cost || 0)}
                      </span>
                      <span className={cn(
                        "font-semibold",
                        (summary?.projected_result || 0) >= 0 ? "text-emerald-600" : "text-destructive"
                      )}>
                        {formatCurrency(summary?.projected_result || 0)}
                      </span>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {serviceRows.map((row) => {
              const warning = getOverPlanningWarning(row);
              const progress = getServiceProgress(row);
              
              return (
                <TableRow
                  key={`${row.macro_id}_${row.scope_id}`}
                  className={cn(
                    "transition-colors",
                    row.is_completed && "opacity-60 bg-muted/10"
                  )}
                >
                  {/* Service name */}
                  <TableCell className="sticky left-0 z-10 bg-card border-r">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-1 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: row.macro_color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm uppercase truncate">{row.scope_name}</span>
                          {row.is_completed && (
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Serviço 100% executado</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {row.macro_name}
                        </div>
                        <Progress value={progress} className="h-1 mt-1" />
                      </div>
                    </div>
                  </TableCell>

                  {/* Executed (initial bank) */}
                  <TableCell className="sticky left-[220px] z-10 bg-card border-r text-center">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "text-sm font-semibold",
                        row.initial_bank > 0 ? "text-primary" : "text-muted-foreground"
                      )}>
                        {row.initial_bank}/{totalHouses}
                      </span>
                      {row.is_completed ? (
                        <Badge variant="outline" className="text-[9px] px-1 h-4 mt-0.5 text-emerald-600 border-emerald-300 bg-emerald-50">
                          Concluído
                        </Badge>
                      ) : row.completion_percent > 0 ? (
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {row.completion_percent}%
                        </span>
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Remaining to plan */}
                  <TableCell className="sticky left-[310px] z-10 bg-card border-r text-center">
                    <span className={cn(
                      "text-sm font-medium",
                      row.remaining_to_plan === 0 && !row.is_completed && "text-emerald-600",
                      row.remaining_to_plan > 0 && "text-amber-600",
                      row.is_completed && "text-muted-foreground"
                    )}>
                      {row.is_completed ? "—" : row.remaining_to_plan}
                    </span>
                  </TableCell>

                  {/* Total planned */}
                  <TableCell className="sticky left-[400px] z-10 bg-card border-r text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className={cn(
                        "font-bold text-sm",
                        warning && "text-destructive"
                      )}>
                        {row.total_planned}
                      </span>
                      {warning && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{warning}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>

                  {/* Period cells */}
                  {periods.map((period) => {
                    const cellData = row.periodValues[period.id];
                    const cellKey = getCellKey(row.macro_id, row.scope_id, period.id);
                    const isEditing = editingCell === cellKey;
                    const periodEditable = isEditable(period.status);
                    const cellBlocked = row.is_completed;

                    return (
                      <TableCell
                        key={period.id}
                        className={cn(
                          "text-center p-1 border-l transition-colors",
                          cellBlocked && "bg-muted/10",
                          !cellBlocked && !periodEditable && "bg-muted/20",
                          !cellBlocked && periodEditable && "cursor-pointer hover:bg-primary/5"
                        )}
                        onClick={() => handleCellClick(row.macro_id, row.scope_id, period.id, period, row)}
                      >
                        {isEditing ? (
                          <Input
                            ref={inputRef}
                            type="number"
                            min={0}
                            defaultValue={cellData?.target_houses || 0}
                            className="h-7 w-16 text-center mx-auto text-sm"
                            onBlur={() => handleCellBlur(row.macro_id, row.scope_id, period.id, cellData?.target_houses || 0)}
                            onKeyDown={(e) => handleKeyDown(e, row.macro_id, row.scope_id, period.id, cellData?.target_houses || 0)}
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {cellBlocked ? (
                              <Ban className="h-3 w-3 text-muted-foreground/50" />
                            ) : (
                              <>
                                <span className={cn(
                                  "text-sm",
                                  (cellData?.target_houses || 0) === 0 && "text-muted-foreground/50",
                                  (cellData?.target_houses || 0) > 0 && "font-semibold text-foreground"
                                )}>
                                  {cellData?.target_houses || 0}
                                </span>
                                {!periodEditable && (cellData?.target_houses || 0) > 0 && (
                                  <ShieldCheck className="h-3 w-3 text-primary/60" />
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!periodToDelete} onOpenChange={(open) => !open && setPeriodToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Período P{periodToDelete?.period_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso excluirá todos os serviços planejados deste período. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (periodToDelete && onDeletePeriod) {
                  onDeletePeriod(periodToDelete.id);
                }
                setPeriodToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit period dialog */}
      {onUpdatePeriodDates && (
        <EditPeriodDialog
          open={!!editingPeriod}
          onOpenChange={(open) => !open && setEditingPeriod(null)}
          period={editingPeriod}
          onSave={onUpdatePeriodDates}
        />
      )}
    </div>
  );
}
