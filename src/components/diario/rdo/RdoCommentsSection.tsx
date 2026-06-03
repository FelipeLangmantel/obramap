import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, X } from "lucide-react";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (item: RdoComment) => {
    setEditingId(item.id);
    setDraft(item.texto);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const handleSave = async (id: string) => {
    const texto = draft.trim();
    if (!texto) {
      toast.error("Informe o comentário.");
      return;
    }
    try {
      const { error } = await supabase
        .from("diary_comments")
        .update({ texto })
        .eq("id", id);
      if (error) throw error;
      cancelEdit();
      onChanged();
      toast.success("Comentário atualizado.");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

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
                {editingId === c.id ? (
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-[72px] text-sm"
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
                )}
              </div>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  {editingId === c.id ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(c.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(c.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </RdoSectionShell>
  );
}
