import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, DollarSign } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, getFamilyColor } from "./utils";
import type { useCashflowSimulator } from "@/hooks/useCashflowSimulator";
import type { CashflowInstallment } from "@/hooks/useCashflowSimulator";

interface Props {
  simulator: ReturnType<typeof useCashflowSimulator>;
}

export function CashflowCalendarTab({ simulator }: Props) {
  const { dailyMap, installments } = simulator;

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (installments.length > 0) return startOfMonth(installments[0].installment_date);
    return startOfMonth(new Date());
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startPad = getDay(startOfMonth(currentMonth));

  const maxDayValue = useMemo(() => {
    let max = 0;
    dailyMap.forEach((items) => {
      const total = items.reduce((s, i) => s + i.installment_value, 0);
      if (total > max) max = total;
    });
    return max;
  }, [dailyMap]);

  const handleDayClick = (dayKey: string) => {
    if (dailyMap.has(dayKey)) {
      setSelectedDay(dayKey);
      setSheetOpen(true);
    }
  };

  const selectedItems = selectedDay ? (dailyMap.get(selectedDay) || []) : [];
  const selectedTotal = selectedItems.reduce((s, i) => s + i.installment_value, 0);

  const formatCompact = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return value.toFixed(0);
  };

  return (
    <>
      <Card className="border-border overflow-hidden">
        <CardContent className="p-5">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-5">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-base font-bold text-foreground capitalize tracking-wide">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </h3>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map(day => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayItems = dailyMap.get(dayKey);
              const total = dayItems ? dayItems.reduce((s, i) => s + i.installment_value, 0) : 0;
              const families = dayItems ? [...new Set(dayItems.map(i => i.family))] : [];
              const intensity = maxDayValue > 0 ? Math.min(total / maxDayValue, 1) : 0;
              const today = isToday(day);
              const hasData = !!dayItems;
              const itemCount = dayItems?.length || 0;

              return (
                <button
                  key={dayKey}
                  onClick={() => handleDayClick(dayKey)}
                  className={`
                    relative rounded-xl p-2 min-h-[90px] flex flex-col transition-all duration-200 border-2
                    ${hasData
                      ? "cursor-pointer hover:scale-[1.03] hover:shadow-lg hover:border-primary/60 border-primary/20 bg-card"
                      : "border-transparent bg-muted/30 hover:bg-muted/50"
                    }
                    ${today ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}
                  `}
                >
                  {/* Date badge */}
                  <div className={`
                    self-start rounded-lg w-8 h-8 flex items-center justify-center text-sm font-bold mb-1
                    ${today
                      ? "bg-primary text-primary-foreground shadow-md"
                      : hasData
                        ? "bg-accent text-accent-foreground"
                        : "bg-transparent text-muted-foreground"
                    }
                  `}>
                    {format(day, "d")}
                  </div>

                  {/* Value display */}
                  {total > 0 && (
                    <div className="flex items-center gap-1 mt-auto">
                      <DollarSign className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="text-xs font-bold text-primary truncate">
                        {formatCompact(total)}
                      </span>
                    </div>
                  )}

                  {/* Family dots + count */}
                  {hasData && (
                    <div className="flex items-center gap-1 mt-1">
                      <div className="flex -space-x-0.5">
                        {families.slice(0, 4).map(f => (
                          <div
                            key={f}
                            className="w-2 h-2 rounded-full border border-background"
                            style={{ backgroundColor: getFamilyColor(f) }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {itemCount} {itemCount === 1 ? "item" : "itens"}
                      </span>
                    </div>
                  )}

                  {/* Intensity bar */}
                  {hasData && (
                    <div className="absolute bottom-0 left-2 right-2 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/70 transition-all duration-500"
                        style={{ width: `${Math.max(intensity * 100, 8)}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[450px] sm:max-w-[450px]">
          <SheetHeader>
            <SheetTitle>
              Desembolsos previstos — {selectedDay ? format(new Date(selectedDay + "T12:00:00"), "dd/MM/yyyy") : ""}
            </SheetTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="w-fit text-primary border-primary/30">{formatCurrency(selectedTotal)}</Badge>
              <Badge variant="secondary">Previsto</Badge>
              <Badge variant="secondary">Simulado</Badge>
            </div>
          </SheetHeader>
          <div className="mt-4 space-y-2 max-h-[calc(100vh-120px)] overflow-auto scrollbar-none">
            {selectedItems.map(item => (
              <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{item.input_name}</span>
                  <span className="text-sm font-semibold text-primary">{formatCurrency(item.installment_value)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{item.supplier_name}</span>
                  <span className="mx-1">•</span>
                  <span>Parcela {item.installment_number} ({item.installment_pct}%)</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{item.macro_name} › {item.scope_name}</span>
                  <span className="mx-1">•</span>
                  <span>{item.period_name}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  <Badge variant="outline" className="text-[10px]">Orçamento/planejamento</Badge>
                  <Badge variant="secondary" className="text-[10px]">Não consolidado como conta a pagar</Badge>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
