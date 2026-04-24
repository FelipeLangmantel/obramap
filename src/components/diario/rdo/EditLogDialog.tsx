import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Smartphone, Monitor, Tablet } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogEntry {
  id: string;
  user_nome: string | null;
  user_email: string | null;
  dispositivo: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entryId: string | null;
}

export function EditLogDialog({ open, onOpenChange, entryId }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entryId) return;
    setLoading(true);
    supabase.from("diary_edit_log" as any)
      .select("id, user_nome, user_email, dispositivo, created_at")
      .eq("diary_entry_id", entryId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setLogs((data as any[]) || []);
        setLoading(false);
      });
  }, [open, entryId]);

  const grouped = logs.reduce<Record<string, LogEntry[]>>((acc, l) => {
    const key = (l.user_nome || l.user_email || "Desconhecido") + "||" + (l.user_email || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(l);
    return acc;
  }, {});

  const deviceIcon = (d: string | null) => {
    if (d === "android" || d === "ios") return <Smartphone className="h-3.5 w-3.5" />;
    if (d === "tablet") return <Tablet className="h-3.5 w-3.5" />;
    return <Monitor className="h-3.5 w-3.5" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log de edições ({logs.length})</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma edição registrada.</p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              {Object.entries(grouped).map(([key, items]) => {
                const [nome, email] = key.split("||");
                return (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold">{nome}</p>
                      <span className="text-xs text-muted-foreground">{items.length} edição(ões)</span>
                    </div>
                    {email && <p className="text-xs text-muted-foreground mb-2">{email}</p>}
                    <div className="space-y-1">
                      {items.slice(0, 8).map(it => (
                        <div key={it.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          {deviceIcon(it.dispositivo)}
                          <span className="uppercase font-medium">{it.dispositivo || "web"}</span>
                          <span>·</span>
                          <span>{format(new Date(it.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                        </div>
                      ))}
                      {items.length > 8 && (
                        <p className="text-[11px] text-muted-foreground italic">+ {items.length - 8} edições anteriores</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
