import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ViewRow {
  id: string;
  user_nome: string | null;
  viewed_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entryId: string | null;
}

export function ViewsDialog({ open, onOpenChange, entryId }: Props) {
  const [views, setViews] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entryId) return;
    setLoading(true);
    supabase.from("diary_views" as any)
      .select("id, user_nome, viewed_at")
      .eq("diary_entry_id", entryId)
      .order("viewed_at", { ascending: false })
      .then(({ data }) => {
        setViews((data as any[]) || []);
        setLoading(false);
      });
  }, [open, entryId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Visualizações ({views.length})</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : views.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma visualização registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead className="text-right">Última visualização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {views.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="text-sm">{v.user_nome || "—"}</TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">
                    {format(new Date(v.viewed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
