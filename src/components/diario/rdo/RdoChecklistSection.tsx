import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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
  const handleToggle = async (id: string, current: boolean) => {
    try {
      await supabase.from("diary_checklist").update({ concluido: !current }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_checklist").delete().eq("id", id);
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
                disabled={disabled}
              />
              <span className={cn("flex-1 text-sm", it.concluido && "line-through text-muted-foreground")}>
                {it.item}
              </span>
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(it.id)}>
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
