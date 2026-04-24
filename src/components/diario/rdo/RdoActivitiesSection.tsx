import { Button } from "@/components/ui/button";
import { MapPin, X } from "lucide-react";
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
  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_activities").delete().eq("id", id);
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
                <p className="text-sm">{a.descricao}</p>
                {a.localizacao && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />{a.localizacao}
                  </p>
                )}
              </div>
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(a.id)}>
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
