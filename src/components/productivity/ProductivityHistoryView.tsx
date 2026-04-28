import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { TrendingUp, Users, Hammer, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DailyAggregate {
  scope_id: string;
  scope_name: string;
  macro_name: string;
  unit_symbol: string;
  date: string;
  quantity: number;
  hh_total: number; // homem-hora (assumimos jornada de 8h por trabalhador)
  rup: number; // hh / qtd  (menor é melhor)
}

interface ServiceRup {
  scope_id: string;
  scope_name: string;
  macro_name: string;
  unit_symbol: string;
  total_qty: number;
  total_hh: number;
  rup: number;
  days: number;
  rup_min: number;
  rup_max: number;
  /** RUP planejado a partir de project_service_productivity (HH / un). null se não cadastrado. */
  rup_planned: number | null;
}

const DAILY_HOURS = 8; // jornada padrão para cálculo de HH

/**
 * Painel de RUP (Razão Unitária de Produção) por serviço.
 * Cruza weekly_productions (em unidade física) com diary_labor (mão de obra
 * presente naquela data) para calcular HH/unidade — e compara com a
 * produtividade planejada cadastrada em "Produtividade & Equipes".
 */
export function ProductivityHistoryView() {
  const { currentProject } = useConstruction();
  const [loading, setLoading] = useState(false);
  const [daily, setDaily] = useState<DailyAggregate[]>([]);
  const [planned, setPlanned] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!currentProject?.id) return;
    void load(currentProject.id);
  }, [currentProject?.id]);

  const load = async (projectId: string) => {
    setLoading(true);
    try {
      // 1) Produções com quantidade física
      const { data: prods } = await supabase
        .from("weekly_productions")
        .select(
          "scope_id, scope_name, macro_name, week_start, week_end, quantity, unit_symbol, house_ids"
        )
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .not("quantity", "is", null)
        .gt("quantity", 0)
        .in("unit_symbol", ["m²", "m2", "m³", "m3", "m", "ml"]);

      // 2) Mão de obra de todos os diários da obra
      const { data: entries } = await supabase
        .from("diary_entries")
        .select("id, entry_date")
        .eq("project_id", projectId);

      const entryById = new Map<string, string>();
      (entries || []).forEach((e: any) => entryById.set(e.id, e.entry_date));

      const entryIds = (entries || []).map((e: any) => e.id);
      let laborByDate = new Map<string, number>(); // data -> total trabalhadores
      if (entryIds.length > 0) {
        const { data: labor } = await supabase
          .from("diary_labor")
          .select("diary_entry_id, quantidade")
          .in("diary_entry_id", entryIds);
        (labor || []).forEach((l: any) => {
          const date = entryById.get(l.diary_entry_id);
          if (!date) return;
          laborByDate.set(date, (laborByDate.get(date) || 0) + (l.quantidade || 0));
        });
      }

      // 2.5) Produtividade planejada (RUP planejado = HH / un)
      const { data: prodPlan } = await supabase
        .from("project_service_productivity" as any)
        .select(
          "scope_id, productivity_value, productivity_unit, professionals_per_team, helpers_per_team, default_team_count"
        )
        .eq("project_id", projectId)
        .eq("is_active", true);

      const plannedMap = new Map<string, number>();
      ((prodPlan as any[]) || []).forEach((p) => {
        // produtividade = un / dia (por equipe). Equipe total = (prof + help) * teams.
        // RUP planejado = (workers * 8h) / (productivity_value * teams)
        const workers =
          (Number(p.professionals_per_team) || 0) +
          (Number(p.helpers_per_team) || 0);
        const teams = Math.max(1, Number(p.default_team_count) || 1);
        const dailyOutput = (Number(p.productivity_value) || 0) * teams;
        if (dailyOutput > 0 && workers > 0) {
          plannedMap.set(p.scope_id, (workers * teams * DAILY_HOURS) / dailyOutput);
        }
      });
      setPlanned(plannedMap);

      // 3) Consolida por serviço × dia (distribui qty pelos dias úteis do período)
      const out: DailyAggregate[] = [];
      (prods || []).forEach((p: any) => {
        const start = parseISO(p.week_start);
        const end = parseISO(p.week_end);
        const days: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          days.push(format(cur, "yyyy-MM-dd"));
          cur.setDate(cur.getDate() + 1);
        }
        const qPerDay = (p.quantity || 0) / Math.max(1, days.length);
        days.forEach((d) => {
          const workers = laborByDate.get(d) || 0;
          const hh = workers * DAILY_HOURS;
          if (qPerDay > 0 && hh > 0) {
            out.push({
              scope_id: p.scope_id,
              scope_name: p.scope_name,
              macro_name: p.macro_name,
              unit_symbol: p.unit_symbol,
              date: d,
              quantity: qPerDay,
              hh_total: hh,
              rup: hh / qPerDay,
            });
          }
        });
      });
      setDaily(out);
    } finally {
      setLoading(false);
    }
  };

  const byService: ServiceRup[] = useMemo(() => {
    const map = new Map<string, ServiceRup>();
    daily.forEach((d) => {
      const cur = map.get(d.scope_id);
      if (!cur) {
        map.set(d.scope_id, {
          scope_id: d.scope_id,
          scope_name: d.scope_name,
          macro_name: d.macro_name,
          unit_symbol: d.unit_symbol,
          total_qty: d.quantity,
          total_hh: d.hh_total,
          rup: d.hh_total / d.quantity,
          days: 1,
          rup_min: d.rup,
          rup_max: d.rup,
          rup_planned: planned.get(d.scope_id) ?? null,
        });
      } else {
        cur.total_qty += d.quantity;
        cur.total_hh += d.hh_total;
        cur.rup = cur.total_hh / cur.total_qty;
        cur.days += 1;
        cur.rup_min = Math.min(cur.rup_min, d.rup);
        cur.rup_max = Math.max(cur.rup_max, d.rup);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.rup - b.rup);
  }, [daily, planned]);

  const totals = useMemo(() => {
    const totalHH = daily.reduce((s, d) => s + d.hh_total, 0);
    const totalQty = daily.reduce((s, d) => s + d.quantity, 0);
    return {
      services: byService.length,
      days: daily.length,
      hh: totalHH,
      qty: totalQty,
      rup: totalQty > 0 ? totalHH / totalQty : 0,
    };
  }, [daily, byService]);

  if (!currentProject) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>Selecione uma obra para ver o histórico de produtividade.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Histórico de Produtividade (RUP)
        </h1>
        <p className="text-sm text-muted-foreground">
          Razão Unitária de Produção em <strong>HH/un</strong> — cruza produção
          (em unidade física) com mão de obra registrada no Diário de Obras.
          Quanto menor, mais produtivo.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Hammer className="h-3 w-3" />
              Serviços com RUP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.services}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Dias úteis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.days}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              HH total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.hh.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">RUP médio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.rup.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">HH / unidade</p>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {!loading && byService.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Ainda não há dados para calcular RUP. Lance produção em <strong>m²</strong>,{" "}
            <strong>m³</strong> ou <strong>m linear</strong> e registre a mão de obra
            no Diário de Obras das mesmas datas.
          </AlertDescription>
        </Alert>
      )}

      {byService.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">RUP por serviço</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa / Serviço</TableHead>
                    <TableHead className="text-right">Qtd total</TableHead>
                    <TableHead className="text-right">HH total</TableHead>
                    <TableHead className="text-right">RUP médio</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Min / Max</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Dias</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byService.map((s) => (
                    <TableRow key={s.scope_id}>
                      <TableCell>
                        <div className="font-medium text-sm">{s.scope_name}</div>
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {s.macro_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s.total_qty.toFixed(1)} {s.unit_symbol}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s.total_hh.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {s.rup.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell">
                        {s.rup_min.toFixed(2)} / {s.rup_max.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden md:table-cell">
                        {s.days}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Cálculo: <code>HH = trabalhadores × {DAILY_HOURS}h</code>. A produção é
          distribuída uniformemente pelos dias do período de medição. Para resultados
          mais precisos, lance produção em períodos curtos (preferencialmente diários).
        </AlertDescription>
      </Alert>
    </div>
  );
}
