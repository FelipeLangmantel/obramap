import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RdoComment } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoComment[];
  onAdd?: () => void;
  disabled?: boolean;
  currentUserId: string | null;
  onChanged: () => void;
}

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export function RdoCommentsSection({ items, onAdd, disabled, onChanged }: Props) {
  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_comments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  return (
    <RdoSectionShell
      id="comentarios"
      title="Comentários"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhum comentário ainda."
    >
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map(c => (
            <div key={c.id} className="flex gap-2">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[10px]">{initials(c.autor_nome)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 bg-muted rounded-lg p-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold">{c.autor_nome || "—"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
              </div>
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(c.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </RdoSectionShell>
  );
}
