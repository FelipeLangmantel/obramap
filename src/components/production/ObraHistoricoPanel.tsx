import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, PlusCircle, Pencil, Trash2, Loader2, FileText } from "lucide-react";

interface ObraHistoricoPanelProps {
  projectId: string;
}

const TABLE_LABELS: Record<string, string> = {
  productions: "Produção",
  weekly_productions: "Prod. Semanal",
  planned_productions: "Planejamento Semanal",
  service_planning_by_period: "Planejamento Estratégico",
  diary_entries: "Diário",
};

const ACTION_CONFIG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  INSERT: {
    label: "Criação",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300/50",
    icon: <PlusCircle className="h-3.5 w-3.5" />,
  },
  UPDATE: {
    label: "Edição",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300/50",
    icon: <Pencil className="h-3.5 w-3.5" />,
  },
  DELETE: {
    label: "Exclusão",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300/50",
    icon: <Trash2 className="h-3.5 w-3.5" />,
  },
};

function describeChange(log: any): string {
  const novo = log.dados_novos || {};
  const ant = log.dados_anteriores || {};
  const d = Object.keys(novo).length ? novo : ant;

  const parts: string[] = [];
  if (d.macro_name) parts.push(d.macro_name);
  if (d.scope_name) parts.push(d.scope_name);
  if (Array.isArray(d.house_ids) && d.house_ids.length > 0) {
    const ids = d.house_ids.slice(0, 6).join(", ");
    parts.push(`Casas: ${ids}${d.house_ids.length > 6 ? `… (+${d.house_ids.length - 6})` : ""}`);
  }
  if (log.tabela === "diary_entries" && d.entry_date) {
    parts.push(`Diário ${format(parseISO(d.entry_date), "dd/MM/yyyy")}`);
  }
  return parts.join(" · ") || (log.registro_id?.slice(0, 8) || "—");
}

export function ObraHistoricoPanel({ projectId }: ObraHistoricoPanelProps) {
  const [filterTable, setFilterTable] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<string>("30");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["obra-historico", projectId, filterTable, filterPeriod],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("id, tabela, acao, dados_anteriores, dados_novos, user_name, created_at, project_id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filterTable !== "all") query = query.eq("tabela", filterTable);
      if (filterPeriod !== "all") {
        const days = parseInt(filterPeriod, 10);
        query = query.gte("created_at", subDays(new Date(), days).toISOString());
      }

      const { data } = await query;
      return data || [];
    },
    enabled: !!projectId,
  });

  const stats = useMemo(() => {
    const c = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    logs.forEach((l: any) => {
      if (c[l.acao as keyof typeof c] !== undefined) c[l.acao as keyof typeof c]++;
    });
    return c;
  }, [logs]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Histórico Completo da Obra
          <Badge variant="secondary" className="ml-auto text-xs">{logs.length} eventos</Badge>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap pt-2">
          <Select value={filterTable} onValueChange={setFilterTable}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Todos os módulos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os módulos</SelectItem>
              <SelectItem value="productions">Produção</SelectItem>
              <SelectItem value="weekly_productions">Prod. Semanal</SelectItem>
              <SelectItem value="planned_productions">Planejamento Semanal</SelectItem>
              <SelectItem value="service_planning_by_period">Planejamento Estratégico</SelectItem>
              <SelectItem value="diary_entries">Diário</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPeriod} onValueChange={setFilterPeriod}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
            <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300/40">
              +{stats.INSERT}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 border-amber-300/40">
              ✎{stats.UPDATE}
            </Badge>
            <Badge variant="outline" className="text-[10px] bg-red-50 dark:bg-red-950/40 border-red-300/40">
              ×{stats.DELETE}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
            <History className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhum evento registrado para esta obra no período selecionado.</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-2">
              {logs.map((log: any) => {
                const cfg = ACTION_CONFIG[log.acao] || { label: log.acao, cls: "", icon: null };
                const tableLabel = TABLE_LABELS[log.tabela] || log.tabela;
                const description = describeChange(log);
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                  >
                    <div className={`shrink-0 p-1.5 rounded-md border ${cfg.cls}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] h-5">{tableLabel}</Badge>
                        <span className="text-xs font-medium">{cfg.label}</span>
                        <span className="text-[11px] text-muted-foreground">por <strong>{log.user_name || "Sistema"}</strong></span>
                      </div>
                      <p className="text-sm mt-1 truncate">{description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {format(parseISO(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
