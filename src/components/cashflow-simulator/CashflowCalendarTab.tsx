import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from "date-fns";
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
  const startPad = getDay(startOfMonth(currentMonth)); // 0=Sun

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

  return (
    <>
      <Card className="border-border">
        <CardContent className="p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="text-sm font-semibold text-foreground capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map(day => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayItems = dailyMap.get(dayKey);
              const total = dayItems ? dayItems.reduce((s, i) => s + i.installment_value, 0) : 0;
              const families = dayItems ? [...new Set(dayItems.map(i => i.family))] : [];
              const intensity = maxDayValue > 0 ? Math.min(total / maxDayValue, 1) : 0;

              return (
                <button
                  key={dayKey}
                  onClick={() => handleDayClick(dayKey)}
                  className={`relative rounded-md p-1 min-h-[60px] flex flex-col items-center transition-colors border
                    ${dayItems ? "cursor-pointer hover:border-primary/50 border-border" : "border-transparent"}
                  `}
                  style={{
                    backgroundColor: dayItems ? `hsl(210 70% 55% / ${0.08 + intensity * 0.25})` : undefined,
                  }}
                >
                  <span className="text-xs text-foreground">{format(day, "d")}</span>
                  {total > 0 && (
                    <span className="text-[9px] font-semibold text-primary mt-0.5">
                      {total >= 1000 ? `${(total / 1000).toFixed(0)}k` : total.toFixed(0)}
                    </span>
                  )}
                  {families.length > 0 && (
                    <div className="flex gap-0.5 mt-auto">
                      {families.slice(0, 3).map(f => (
                        <div
                          key={f}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: getFamilyColor(f) }}
                        />
                      ))}
                      {families.length > 3 && <span className="text-[7px] text-muted-foreground">+{families.length - 3}</span>}
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
              Desembolsos — {selectedDay ? format(new Date(selectedDay + "T12:00:00"), "dd/MM/yyyy") : ""}
            </SheetTitle>
            <Badge variant="outline" className="w-fit text-primary border-primary/30">{formatCurrency(selectedTotal)}</Badge>
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
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
