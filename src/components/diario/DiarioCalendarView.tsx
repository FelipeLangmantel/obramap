import { useMemo, useState } from "react";
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday, isBefore,
  isWeekend, addMonths, subMonths, isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChevronLeft, ChevronRight, ClipboardList, CheckCircle2, Clock,
  AlertCircle, Calendar as CalendarIcon, Building2, FileSignature,
  MapPin, UserCheck, ScrollText, Loader2, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useDiaryMonthEntries, type DiaryDayEntry } from "@/hooks/useDiaryMonthEntries";
import { useDiaryLegalConfig } from "@/hooks/useDiaryLegalConfig";

interface Props {
  /** Chamado quando o usuário clica em um card de dia para editar/criar o RDO */
  onSelectDay: (dateISO: string) => void;
}

export function DiarioCalendarView({ onSelectDay }: Props) {
  const { currentProject } = useConstruction();
  const [cursor, setCursor] = useState<Date>(new Date());
  const { entries, loading } = useDiaryMonthEntries(currentProject?.id, cursor);
  const { config: legalConfig } = useDiaryLegalConfig(currentProject?.id);

  // Indexa entries por data
  const byDate = useMemo(() => {
    const m = new Map<string, DiaryDayEntry>();
    entries.forEach(e => m.set(e.entry_date, e));
    return m;
  }, [entries]);

  // Dias visíveis (semanas completas)
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  // KPIs do mês
  const kpis = useMemo(() => {
    const aprovados = entries.filter(e => e.status_aprovacao === "aprovado").length;
    const revisando = entries.filter(e => e.status_aprovacao === "revisando").length;
    const preenchendo = entries.filter(e => e.status_aprovacao === "preenchendo").length;
    // dias úteis no mês até hoje sem RDO
    const hoje = new Date();
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const limit = isAfter(hoje, monthEnd) ? monthEnd : hoje;
    const diasMesAteHoje = eachDayOfInterval({ start: monthStart, end: limit });
    const atrasados = diasMesAteHoje.filter(d => {
      if (isWeekend(d)) return false;
      if (isToday(d)) return false;
      const k = format(d, "yyyy-MM-dd");
      return !byDate.has(k);
    }).length;
    return { aprovados, revisando, preenchendo, atrasados, total: entries.length };
  }, [entries, byDate, cursor]);

  if (!currentProject) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Selecione uma obra para visualizar o calendário do diário.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* ── Cabeçalho da obra (informações gerais) ── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold truncate">{currentProject.name}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Diário de Obras (RDO) — Documento jurídico de comprovação da execução
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            {legalConfig?.contratante_nome && (
              <InfoRow icon={Building2} label="Contratante" value={legalConfig.contratante_nome} />
            )}
            {legalConfig?.contratada_razao_social && (
              <InfoRow icon={Building2} label="Contratada" value={legalConfig.contratada_razao_social} />
            )}
            {legalConfig?.contrato_numero && (
              <InfoRow icon={ScrollText} label="Contrato nº" value={legalConfig.contrato_numero} />
            )}
            {legalConfig?.responsavel_tecnico_nome && (
              <InfoRow icon={UserCheck} label="Resp. Técnico" value={legalConfig.responsavel_tecnico_nome} />
            )}
            {(legalConfig?.contratante_municipio || legalConfig?.contratante_estado) && (
              <InfoRow
                icon={MapPin}
                label="Local"
                value={[legalConfig?.contratante_municipio, legalConfig?.contratante_estado].filter(Boolean).join(" / ")}
              />
            )}
          </div>
          {!legalConfig?.contrato_numero && (
            <Alert className="mt-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <FileSignature className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                Configure os dados jurídicos da obra na aba <strong>Configuração</strong> para que apareçam no PDF oficial do RDO.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ── KPIs do mês ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <KpiCard label="Aprovados" value={kpis.aprovados} color="text-emerald-600" bg="bg-emerald-500/10" icon={CheckCircle2} />
        <KpiCard label="Em análise" value={kpis.revisando} color="text-blue-600" bg="bg-blue-500/10" icon={Clock} />
        <KpiCard label="Preenchendo" value={kpis.preenchendo} color="text-amber-600" bg="bg-amber-500/10" icon={FileText} />
        <KpiCard label="Atrasados" value={kpis.atrasados} color="text-red-600" bg="bg-red-500/10" icon={AlertCircle} />
      </div>

      {/* ── Navegação do mês ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <span className="capitalize">{format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setCursor(d => subMonths(d, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" onClick={() => setCursor(d => addMonths(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Cabeçalho dias da semana */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => (
              <div
                key={d}
                className={cn(
                  "text-[10px] sm:text-xs font-semibold text-center py-1 uppercase tracking-wide",
                  (i === 0 || i === 6) ? "text-muted-foreground/60" : "text-muted-foreground"
                )}
              >
                {d}
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {days.map(day => {
                const key = format(day, "yyyy-MM-dd");
                const entry = byDate.get(key);
                const inMonth = isSameMonth(day, cursor);
                const today = isToday(day);
                const future = isAfter(day, new Date()) && !today;
                const weekend = isWeekend(day);
                const past = isBefore(day, new Date()) && !today;

                // Status de cor
                let statusClass = "border-border bg-muted/40 hover:bg-muted";
                let statusLabel: string | null = null;
                let StatusIcon: any = null;

                if (entry?.status_aprovacao === "aprovado") {
                  statusClass = "border-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 dark:border-emerald-700";
                  statusLabel = "Aprovado";
                  StatusIcon = CheckCircle2;
                } else if (entry?.status_aprovacao === "revisando") {
                  statusClass = "border-amber-400 bg-amber-500/15 hover:bg-amber-500/25 dark:border-amber-700";
                  statusLabel = "Em análise";
                  StatusIcon = Clock;
                } else if (entry?.status_aprovacao === "preenchendo") {
                  statusClass = "border-blue-400 bg-blue-500/10 hover:bg-blue-500/20 dark:border-blue-700";
                  statusLabel = "Rascunho";
                  StatusIcon = FileText;
                } else if (past && !weekend) {
                  // dia útil passado sem lançamento
                  statusClass = "border-red-400 bg-red-500/10 hover:bg-red-500/20 dark:border-red-700";
                  statusLabel = "Atrasado";
                  StatusIcon = AlertCircle;
                } else if (weekend) {
                  statusClass = "border-border bg-muted/20 hover:bg-muted/40";
                }

                return (
                  <button
                    key={key}
                    onClick={() => onSelectDay(key)}
                    disabled={!inMonth}
                    className={cn(
                      "relative aspect-square sm:aspect-[4/5] rounded-md border-2 p-1 sm:p-1.5 flex flex-col items-stretch transition-all text-left",
                      statusClass,
                      !inMonth && "opacity-30 cursor-not-allowed",
                      today && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      weekend && inMonth && "italic"
                    )}
                    title={statusLabel ? `${format(day, "dd/MM/yyyy")} — ${statusLabel}` : format(day, "dd/MM/yyyy")}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-xs sm:text-sm font-bold leading-none",
                        today && "text-primary",
                        weekend && !entry && "text-muted-foreground"
                      )}>
                        {format(day, "d")}
                      </span>
                      {entry?.num_relatorio != null && (
                        <span className="text-[8px] sm:text-[9px] font-mono text-muted-foreground">
                          #{entry.num_relatorio}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 flex items-center justify-center">
                      {StatusIcon && <StatusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 opacity-80" />}
                    </div>

                    {statusLabel && (
                      <span className="text-[8px] sm:text-[9px] leading-none text-center font-medium opacity-90 truncate">
                        {statusLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legenda */}
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] sm:text-xs text-muted-foreground">
            <LegendItem color="bg-emerald-500" label="Aprovado" />
            <LegendItem color="bg-amber-500" label="Em análise" />
            <LegendItem color="bg-blue-500" label="Rascunho" />
            <LegendItem color="bg-red-500" label="Atrasado (dia útil sem RDO)" />
            <LegendItem color="bg-muted-foreground/30" label="Fim de semana" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, bg, icon: Icon }: { label: string; value: number; color: string; bg: string; icon: any }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className={cn("p-2 rounded-md shrink-0", bg)}>
          <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", color)} />
        </div>
        <div className="min-w-0">
          <div className="text-lg sm:text-2xl font-bold leading-none">{value}</div>
          <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block w-2.5 h-2.5 rounded-sm", color)} />
      <span>{label}</span>
    </div>
  );
}
