import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
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
  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_occurrences").delete().eq("id", id);
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
                <p className="text-sm">{o.descricao}</p>
                {o.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {o.tags.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] py-0 h-5">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(o.id)}>
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
