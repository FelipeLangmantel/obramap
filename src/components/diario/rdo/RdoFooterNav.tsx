import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, History, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditLogDialog } from "./EditLogDialog";
import { ViewsDialog } from "./ViewsDialog";

interface Neighbor { id: string; entry_date: string; num_relatorio: number | null; }

interface Props {
  entryId: string | null;
  projectId: string | null;
  entryDate: string;
  onNavigate: (newDate: string) => void;
  createdByName?: string | null;
  createdAt?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

export function RdoFooterNav({
  entryId, projectId, entryDate, onNavigate,
  createdByName, createdAt, updatedByName, updatedAt,
}: Props) {
  const [prev, setPrev] = useState<Neighbor | null>(null);
  const [next, setNext] = useState<Neighbor | null>(null);
  const [editLogOpen, setEditLogOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [editCount, setEditCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: ant }, { data: pos }] = await Promise.all([
        supabase.from("diary_entries")
          .select("id, entry_date, num_relatorio")
          .eq("project_id", projectId)
          .lt("entry_date", entryDate)
          .order("entry_date", { ascending: false })
          .limit(1),
        supabase.from("diary_entries")
          .select("id, entry_date, num_relatorio")
          .eq("project_id", projectId)
          .gt("entry_date", entryDate)
          .order("entry_date", { ascending: true })
          .limit(1),
      ]);
      setPrev((ant?.[0] as any) || null);
      setNext((pos?.[0] as any) || null);
    })();
  }, [projectId, entryDate]);

  useEffect(() => {
    if (!entryId) { setEditCount(0); setViewCount(0); return; }
    (async () => {
      const [{ count: ec }, { count: vc }] = await Promise.all([
        supabase.from("diary_edit_log" as any).select("id", { count: "exact", head: true }).eq("diary_entry_id", entryId),
        supabase.from("diary_views" as any).select("id", { count: "exact", head: true }).eq("diary_entry_id", entryId),
      ]);
      setEditCount(ec || 0);
      setViewCount(vc || 0);
    })();
  }, [entryId]);

  return (
    <div className="border-t pt-4 mt-6 space-y-3">
      {/* Navegação anterior/próximo */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!prev}
          onClick={() => prev && onNavigate(prev.entry_date)}
          className="flex-1 max-w-[180px] justify-start">
          <ChevronLeft className="h-4 w-4 mr-1" />
          <div className="text-left min-w-0">
            <div className="text-xs text-muted-foreground">Anterior</div>
            {prev ? (
              <div className="text-xs font-medium truncate">
                {format(parseISO(prev.entry_date), "dd/MM/yyyy", { locale: ptBR })}
                {prev.num_relatorio && ` · n°${prev.num_relatorio}`}
              </div>
            ) : <div className="text-xs italic">—</div>}
          </div>
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditLogOpen(true)} disabled={!entryId}>
            <History className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Log ({editCount})</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setViewsOpen(true)} disabled={!entryId}>
            <Eye className="h-3.5 w-3.5 mr-1" />
            <span className="text-xs">Views ({viewCount})</span>
          </Button>
        </div>

        <Button variant="outline" size="sm" disabled={!next}
          onClick={() => next && onNavigate(next.entry_date)}
          className="flex-1 max-w-[180px] justify-end">
          <div className="text-right min-w-0">
            <div className="text-xs text-muted-foreground">Próximo</div>
            {next ? (
              <div className="text-xs font-medium truncate">
                {format(parseISO(next.entry_date), "dd/MM/yyyy", { locale: ptBR })}
                {next.num_relatorio && ` · n°${next.num_relatorio}`}
              </div>
            ) : <div className="text-xs italic">—</div>}
          </div>
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Autoria */}
      {(createdByName || updatedByName) && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          {createdByName && createdAt && (
            <p>Criado por <strong>{createdByName}</strong> ({format(new Date(createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })})</p>
          )}
          {updatedByName && updatedAt && (
            <p>Última modificação: <strong>{updatedByName}</strong> ({format(new Date(updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })})</p>
          )}
        </div>
      )}

      <EditLogDialog open={editLogOpen} onOpenChange={setEditLogOpen} entryId={entryId} />
      <ViewsDialog open={viewsOpen} onOpenChange={setViewsOpen} entryId={entryId} />
    </div>
  );
}
