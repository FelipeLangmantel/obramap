import { useState, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, AlertTriangle } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlanningPeriod, ServiceRow, PeriodSummary } from "@/hooks/useLongTermPlanning";

interface LongTermPlanningMatrixProps {
  periods: PlanningPeriod[];
  serviceRows: ServiceRow[];
  periodSummaries: PeriodSummary[];
  totalHouses: number;
  onCellChange: (macroId: string, scopeId: string, periodId: string, value: number) => void;
}

export function LongTermPlanningMatrix({
  periods,
  serviceRows,
  periodSummaries,
  totalHouses,
  onCellChange,
}: LongTermPlanningMatrixProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPeriodHeader = (period: PlanningPeriod) => {
    const start = parseISO(period.start_date);
    const end = parseISO(period.end_date);
    return `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`;
  };

  const getCellKey = (macroId: string, scopeId: string, periodId: string) => {
    return `${macroId}_${scopeId}_${periodId}`;
  };

  const handleCellClick = (macroId: string, scopeId: string, periodId: string, isClosed: boolean) => {
    if (isClosed) return;
    setEditingCell(getCellKey(macroId, scopeId, periodId));
  };

  const handleCellBlur = (
    macroId: string,
    scopeId: string,
    periodId: string,
    currentValue: number
  ) => {
    const inputValue = inputRef.current?.value;
    const newValue = parseInt(inputValue || "0", 10) || 0;
    
    if (newValue !== currentValue) {
      onCellChange(macroId, scopeId, periodId, newValue);
    }
    setEditingCell(null);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    macroId: string,
    scopeId: string,
    periodId: string,
    currentValue: number
  ) => {
    if (e.key === "Enter") {
      handleCellBlur(macroId, scopeId, periodId, currentValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleCellBlur(macroId, scopeId, periodId, currentValue);
      // Navegar para próxima célula
      const currentPeriodIndex = periods.findIndex(p => p.id === periodId);
      if (currentPeriodIndex < periods.length - 1) {
        const nextPeriod = periods[currentPeriodIndex + 1];
        if (!nextPeriod.is_closed) {
          setTimeout(() => {
            setEditingCell(getCellKey(macroId, scopeId, nextPeriod.id));
          }, 0);
        }
      }
    }
  };

  const getSummaryForPeriod = (periodId: string) => {
    return periodSummaries.find(s => s.period_id === periodId);
  };

  const getServiceTotalWarning = (row: ServiceRow) => {
    if (row.total_planned > totalHouses) {
      return `Total planejado (${row.total_planned}) excede o total de casas do projeto (${totalHouses})`;
    }
    return null;
  };

  return (
    <div className="relative overflow-auto border rounded-lg bg-background">
      <Table>
        <TableHeader className="sticky top-0 z-20 bg-muted/95 backdrop-blur">
          <TableRow>
            {/* Colunas fixas */}
            <TableHead className="sticky left-0 z-30 bg-muted min-w-[200px] font-semibold">
              Serviço
            </TableHead>
            <TableHead className="sticky left-[200px] z-30 bg-muted w-[80px] text-center font-semibold">
              Banco
            </TableHead>
            <TableHead className="sticky left-[280px] z-30 bg-muted w-[80px] text-center font-semibold">
              Total
            </TableHead>

            {/* Colunas de períodos */}
            {periods.map((period) => (
              <TableHead
                key={period.id}
                className="min-w-[100px] text-center font-semibold"
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    P{period.period_number}
                  </span>
                  <span className="text-xs">{formatPeriodHeader(period)}</span>
                  {period.is_closed && (
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </TableHead>
            ))}
          </TableRow>

          {/* Linha de resumo por período */}
          <TableRow className="bg-muted/50">
            <TableCell className="sticky left-0 z-30 bg-muted/50 font-medium text-xs">
              Totais do Período
            </TableCell>
            <TableCell className="sticky left-[200px] z-30 bg-muted/50" />
            <TableCell className="sticky left-[280px] z-30 bg-muted/50" />
            {periods.map((period) => {
              const summary = getSummaryForPeriod(period.id);
              return (
                <TableCell key={period.id} className="text-center p-1">
                  <div className="flex flex-col gap-0.5 text-xs">
                    <span className="font-semibold">{summary?.total_houses || 0}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(summary?.total_revenue || 0)}
                    </span>
                  </div>
                </TableCell>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {serviceRows.map((row) => {
            const warning = getServiceTotalWarning(row);
            
            return (
              <TableRow key={`${row.macro_id}_${row.scope_id}`} className="hover:bg-muted/30">
                {/* Serviço */}
                <TableCell className="sticky left-0 z-10 bg-background border-r">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: row.macro_color }}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{row.macro_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {row.scope_name}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Banco Inicial */}
                <TableCell className="sticky left-[200px] z-10 bg-background border-r text-center">
                  <span className="text-sm text-muted-foreground">
                    {row.initial_bank}
                  </span>
                </TableCell>

                {/* Total */}
                <TableCell className="sticky left-[280px] z-10 bg-background border-r text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn(
                      "font-semibold text-sm",
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

                {/* Células de períodos */}
                {periods.map((period) => {
                  const cellData = row.periodValues[period.id];
                  const cellKey = getCellKey(row.macro_id, row.scope_id, period.id);
                  const isEditing = editingCell === cellKey;
                  const isClosed = period.is_closed || false;

                  return (
                    <TableCell
                      key={period.id}
                      className={cn(
                        "text-center p-1",
                        isClosed && "bg-muted/30",
                        !isClosed && "cursor-pointer hover:bg-accent/50"
                      )}
                      onClick={() => handleCellClick(row.macro_id, row.scope_id, period.id, isClosed)}
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
                        <span className={cn(
                          "text-sm",
                          (cellData?.target_houses || 0) === 0 && "text-muted-foreground"
                        )}>
                          {cellData?.target_houses || 0}
                        </span>
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
  );
}
