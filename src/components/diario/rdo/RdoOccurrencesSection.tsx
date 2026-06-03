import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RdoOccurrence } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoOccurrence[];
  onAdd?: () => void;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoOccurrencesSection({ items, onAdd, disabled, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (item: RdoOccurrence) => {
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
      toast.error("Informe a ocorrência.");
      return;
    }
    try {
      const { error } = await supabase
        .from("diary_occurrences")
        .update({ descricao })
        .eq("id", id);
      if (error) throw error;
      cancelEdit();
      onChanged();
      toast.success("Ocorrência atualizada.");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_occurrences").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  return (
    <RdoSectionShell
      id="ocorrencias"
      title="Ocorrências"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhuma ocorrência registrada."
    >
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map(o => (
            <div key={o.id} className="flex items-start gap-2 p-2 rounded border bg-card">
              <div className="flex-1 space-y-1">
                {editingId === o.id ? (
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-[72px] text-sm"
                  />
                ) : (
                  <p className="text-sm">{o.descricao}</p>
                )}
                {o.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {o.tags.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0 h-5">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
              {!disabled && (
                <div className="flex shrink-0 gap-1">
                  {editingId === o.id ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(o.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(o)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(o.id)}>
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
