import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RdoActivity } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoActivity[];
  onAdd?: () => void;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoActivitiesSection({ items, onAdd, disabled, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (item: RdoActivity) => {
    setEditingId(item.id);
    setDraft(item.descricao);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const handleSave = async (id: string) => {
    const descricao = draft.trim();
    if (!descricao) {
      toast.error("Informe a descrição da atividade.");
      return;
    }
    try {
      const { error } = await supabase
        .from("diary_activities")
        .update({ descricao })
        .eq("id", id);
      if (error) throw error;
      cancelEdit();
      onChanged();
      toast.success("Atividade atualizada.");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_activities").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  return (
    <RdoSectionShell
      id="atividades"
      title="Atividades"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhuma atividade descritiva registrada."
    >
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(a => (
            <div key={a.id} className="flex items-start gap-2 p-2 rounded border bg-card">
              <div className="flex-1">
                {editingId === a.id ? (
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-[72px] text-sm"
                  />
                ) : (
                  <p className="text-sm">{a.descricao}</p>
                )}
                {a.localizacao && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />{a.localizacao}
                  </p>
                )}
              </div>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  {editingId === a.id ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(a.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(a)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(a.id)}>
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
