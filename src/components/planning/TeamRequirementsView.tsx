import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  HardHat,
  AlertTriangle,
  Layers,
  CalendarRange,
  RefreshCcw,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConstruction } from "@/contexts/ConstructionContext";
import {
  useTeamRequirementsByPeriod,
  PeriodTeamRequirements,
} from "@/hooks/useTeamRequirementsByPeriod";

function formatRange(start: string, end: string) {
  return `${format(parseISO(start), "dd/MM", { locale: ptBR })} – ${format(parseISO(end), "dd/MM/yy", { locale: ptBR })}`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    approved: { label: "Aprovado", className: "bg-blue-100 text-blue-800 border-blue-200" },
    released_to_weekly: { label: "Liberado", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    closed: { label: "Fechado", className: "bg-zinc-200 text-zinc-700" },
  };
  const cfg = map[status] || map.draft;
  return (
    <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function exportCsv(data: PeriodTeamRequirements[]) {
  const lines: string[] = [
    "Período;Etapa;Serviço;Equipes;Prof./Eq.;Aux./Eq.;Profissionais;Auxiliares;Total Pessoas",
  ];
  data.forEach((p) => {
    p.rows.forEach((r) => {
      lines.push(
        [
          p.period_name,
          r.macro_name,
          r.scope_name,
          r.team_count,
          r.professionals_per_team,
          r.helpers_per_team,
          r.total_professionals,
          r.total_helpers,
          r.total_people,
        ].join(";")
      );
    });
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `equipe-necessaria-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TeamRequirementsView() {
  const { currentProject } = useConstruction();
  const { requirements, consolidatedByMacro, consolidatedByRole, loading, refresh } =
    useTeamRequirementsByPeriod(currentProject?.id);
  const [tab, setTab] = useState("by-period");

  const grandTotals = useMemo(() => {
    return requirements.reduce(
      (acc, p) => ({
        professionals: acc.professionals + p.totals.professionals,
        helpers: acc.helpers + p.totals.helpers,
        people: acc.people + p.totals.people,
        services_missing: acc.services_missing + p.totals.services_missing_productivity,
        services_missing_team:
          acc.services_missing_team + p.totals.services_missing_team,
        periods: acc.periods + (p.totals.services > 0 ? 1 : 0),
      }),
      {
        professionals: 0,
        helpers: 0,
        people: 0,
        services_missing: 0,
        services_missing_team: 0,
        periods: 0,
      }
    );
  }, [requirements]);

  const peakPeople = useMemo(
    () => requirements.reduce((max, p) => Math.max(max, p.totals.people), 0),
    [requirements]
  );

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione um projeto para ver a equipe necessária
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="h-6 w-6 text-primary" />
            Equipe Necessária
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Quantos profissionais cada período precisa, calculado a partir do planejamento e
            da configuração de Produtividade & Equipes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(requirements)}
            disabled={loading || requirements.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Aviso de dados incompletos */}
      {grandTotals.services_missing > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900 text-sm">
            {grandTotals.services_missing} serviço(s) sem produtividade configurada
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800">
            Esses serviços aparecem com 0 pessoas no cálculo. Configure em{" "}
            <strong>Produtividade &amp; Equipes</strong> para que a estimativa fique correta.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Períodos com plano</p>
              <p className="text-xl font-bold">{grandTotals.periods}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Pico de pessoas/período</p>
              <p className="text-xl font-bold">{peakPeople}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <HardHat className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">Profissionais (somatório)</p>
              <p className="text-xl font-bold">{grandTotals.professionals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Layers className="h-5 w-5 text-violet-500" />
            <div>
              <p className="text-xs text-muted-foreground">Auxiliares (somatório)</p>
              <p className="text-xl font-bold">{grandTotals.helpers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de visualização */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="by-period">
            <CalendarRange className="h-4 w-4 mr-1.5" /> Por período
          </TabsTrigger>
          <TabsTrigger value="by-macro">
            <Layers className="h-4 w-4 mr-1.5" /> Pico por etapa
          </TabsTrigger>
        </TabsList>

        {/* === Por período === */}
        <TabsContent value="by-period" className="mt-3">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : requirements.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Nenhum período de medição cadastrado ainda.
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-450px)] pr-2">
              <div className="space-y-4">
                {requirements.map((period) => (
                  <Card key={period.period_id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {period.period_name}
                            {statusBadge(period.status)}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {formatRange(period.start_date, period.end_date)} •{" "}
                            {period.totals.services} serviço(s)
                          </CardDescription>
                        </div>
                        <div className="flex gap-3 text-xs">
                          <Badge variant="secondary" className="font-mono">
                            {period.totals.professionals} prof.
                          </Badge>
                          <Badge variant="secondary" className="font-mono">
                            {period.totals.helpers} aux.
                          </Badge>
                          <Badge className="font-mono bg-primary/10 text-primary border-primary/20">
                            {period.totals.people} total
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {period.rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3">
                          Sem serviços planejados.
                        </p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <Table className="text-xs">
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="py-2">Serviço</TableHead>
                                <TableHead className="text-right py-2">Equipes</TableHead>
                                <TableHead className="text-right py-2 hidden sm:table-cell">
                                  Prof./Eq.
                                </TableHead>
                                <TableHead className="text-right py-2 hidden sm:table-cell">
                                  Aux./Eq.
                                </TableHead>
                                <TableHead className="text-right py-2">Profis.</TableHead>
                                <TableHead className="text-right py-2">Aux.</TableHead>
                                <TableHead className="text-right py-2 font-semibold">
                                  Total
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {period.rows.map((r) => (
                                <TableRow
                                  key={r.scope_id}
                                  className={cn(
                                    !r.has_productivity_config && "bg-amber-50/50"
                                  )}
                                >
                                  <TableCell className="py-1.5">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{
                                          backgroundColor: r.macro_color || "#9ca3af",
                                        }}
                                      />
                                      <div className="min-w-0">
                                        <p className="font-medium leading-tight truncate">
                                          {r.scope_name}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground leading-tight">
                                          {r.macro_name}
                                          {!r.has_productivity_config && (
                                            <span className="text-amber-700 ml-1">
                                              • produtividade não configurada
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 font-mono">
                                    {r.team_count}
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 hidden sm:table-cell font-mono">
                                    {r.professionals_per_team}
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 hidden sm:table-cell font-mono">
                                    {r.helpers_per_team}
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 font-mono">
                                    {r.total_professionals}
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 font-mono">
                                    {r.total_helpers}
                                  </TableCell>
                                  <TableCell className="text-right py-1.5 font-mono font-semibold">
                                    {r.total_people}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/30 font-semibold">
                                <TableCell className="py-1.5">Total do período</TableCell>
                                <TableCell />
                                <TableCell className="hidden sm:table-cell" />
                                <TableCell className="hidden sm:table-cell" />
                                <TableCell className="text-right py-1.5 font-mono">
                                  {period.totals.professionals}
                                </TableCell>
                                <TableCell className="text-right py-1.5 font-mono">
                                  {period.totals.helpers}
                                </TableCell>
                                <TableCell className="text-right py-1.5 font-mono">
                                  {period.totals.people}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* === Pico por etapa === */}
        <TabsContent value="by-macro" className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pico de equipe por etapa</CardTitle>
              <CardDescription className="text-xs">
                Maior necessidade simultânea de pessoas para cada etapa, considerando o pico
                em qualquer período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {consolidatedByMacro.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  Sem dados consolidados ainda.
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Etapa</TableHead>
                        <TableHead className="text-right">Profissionais (pico)</TableHead>
                        <TableHead className="text-right">Auxiliares (pico)</TableHead>
                        <TableHead className="text-right">Total (pico)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidatedByMacro
                        .sort((a, b) => b.people - a.people)
                        .map((m) => (
                          <TableRow key={m.macro_id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: m.macro_color || "#9ca3af" }}
                                />
                                <span className="font-medium">{m.macro_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{m.professionals}</TableCell>
                            <TableCell className="text-right font-mono">{m.helpers}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {m.people}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
