import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export function ObraHistoricoTab({ obraId }: { obraId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("holding_audit_log")
      .select("*")
      .eq("obra_id", obraId)
      .order("realizado_em", { ascending: false })
      .limit(100)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, [obraId]);

  const TABELA_BADGE: Record<string, { label: string; cls: string }> = {
    obras_portfolio: { label: "Obra", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
    holding_obra_docs: { label: "Documentos", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
    holding_doc_files: { label: "Documentos", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
    despesas_mensais: { label: "Despesas", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    medicoes_ple: { label: "Medições", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    aditivos_contratos: { label: "Aditivos", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    restricoes_financeiras: { label: "Restrições", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  };

  const ACAO_ICON: Record<string, string> = {
    criou: "✅", editou: "✏️", excluiu: "🗑️",
    aprovou: "✔️", cancelou: "❌",
  };
  const ACAO_COLOR: Record<string, string> = {
    criou: "text-emerald-600", editou: "text-amber-600",
    excluiu: "text-destructive", aprovou: "text-blue-600", cancelou: "text-muted-foreground",
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (logs.length === 0) return (
    <div className="text-center py-10 text-muted-foreground text-sm">
      Nenhuma ação registrada ainda.
    </div>
  );

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3">
        Histórico completo de alterações — {logs.length} registro{logs.length !== 1 ? "s" : ""}
      </p>
      <div className="relative pl-4">
        <div className="absolute left-[7px] top-0 bottom-0 w-[2px] bg-border" />
        {logs.map((log) => {
          const data = new Date(log.realizado_em);
          const dataFmt = data.toLocaleDateString("pt-BR");
          const horaFmt = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={log.id} className="relative flex gap-3 pb-4">
              <div className="absolute left-[-9px] top-[4px] w-[10px] h-[10px] rounded-full bg-background border-2 border-border" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs">
                    <span className={`font-semibold ${ACAO_COLOR[log.acao] || ""}`}>
                      {ACAO_ICON[log.acao] || "•"} {log.realizado_por_nome}
                    </span>
                    {" "}<span className="text-muted-foreground">{log.descricao}</span>
                    {log.tabela && TABELA_BADGE[log.tabela] && (
                      <Badge variant="secondary" className={`text-[9px] ml-1.5 px-1 py-0 ${TABELA_BADGE[log.tabela].cls}`}>
                        {TABELA_BADGE[log.tabela].label}
                      </Badge>
                    )}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                    {dataFmt} {horaFmt}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
