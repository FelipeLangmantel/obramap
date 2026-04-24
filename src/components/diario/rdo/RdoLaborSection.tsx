import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RdoLabor } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoLabor[];
  onAdd?: () => void;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoLaborSection({ items, onAdd, disabled, onChanged }: Props) {
  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_labor").delete().eq("id", id);
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  const propria = items.filter(i => i.categoria === "propria");
  const terceiros = items.filter(i => i.categoria === "terceiros");

  return (
    <RdoSectionShell
      id="mao-obra"
      title="Mão de obra"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhuma mão de obra registrada."
    >
      {items.length > 0 && (
        <div className="space-y-3">
          {propria.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1.5">Própria ({propria.length})</h5>
              <div className="flex flex-wrap gap-1.5">
                {propria.map(it => (
                  <Badge key={it.id} variant="secondary" className="gap-1.5 py-1 px-2">
                    <span>{it.nome}</span>
                    <span className="font-bold">×{it.quantidade}</span>
                    {!disabled && (
                      <button onClick={() => handleRemove(it.id)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {terceiros.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-muted-foreground mb-1.5">Terceiros ({terceiros.length})</h5>
              <div className="flex flex-wrap gap-1.5">
                {terceiros.map(it => (
                  <Badge key={it.id} variant="outline" className="gap-1.5 py-1 px-2">
                    <span>{it.nome}</span>
                    <span className="font-bold">×{it.quantidade}</span>
                    {!disabled && (
                      <button onClick={() => handleRemove(it.id)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </RdoSectionShell>
  );
}
