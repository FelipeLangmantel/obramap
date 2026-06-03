import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Edit2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { RdoChecklistItem } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoChecklistItem[];
  onAdd?: () => void;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoChecklistSection({ items, onAdd, disabled, onChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (item: RdoChecklistItem) => {
    setEditingId(item.id);
    setDraft(item.item);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const handleSave = async (id: string) => {
    const item = draft.trim();
    if (!item) {
      toast.error("Informe o item do checklist.");
      return;
    }
    try {
      const { error } = await supabase
        .from("diary_checklist")
        .update({ item })
        .eq("id", id);
      if (error) throw error;
      cancelEdit();
      onChanged();
      toast.success("Item do checklist atualizado.");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await supabase.from("diary_checklist").update({ concluido: !current }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_checklist").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  return (
    <RdoSectionShell
      id="checklist"
      title="Checklist"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhum item no checklist."
    >
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map(it => (
            <div key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
              <Checkbox
                checked={it.concluido}
                onCheckedChange={() => !disabled && handleToggle(it.id, it.concluido)}
                disabled={disabled || editingId === it.id}
              />
              {editingId === it.id ? (
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-8 flex-1 text-sm"
                />
              ) : (
                <span className={cn("flex-1 text-sm", it.concluido && "line-through text-muted-foreground")}>
                  {it.item}
                </span>
              )}
              {!disabled && (
                <div className="flex gap-1">
                  {editingId === it.id ? (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSave(it.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(it.id)}>
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
