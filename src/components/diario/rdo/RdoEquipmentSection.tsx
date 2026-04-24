import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RdoEquipment } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  items: RdoEquipment[];
  onAdd?: () => void;
  disabled?: boolean;
  onChanged: () => void;
}

export function RdoEquipmentSection({ items, onAdd, disabled, onChanged }: Props) {
  const handleRemove = async (id: string) => {
    try {
      await supabase.from("diary_equipment").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      onChanged();
    } catch (err: any) { toast.error("Erro: " + (err.message || "")); }
  };

  return (
    <RdoSectionShell
      id="equipamentos"
      title="Equipamentos"
      count={items.length}
      onAdd={onAdd}
      disabled={disabled}
      emptyText="Nenhum equipamento registrado."
    >
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map(it => (
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
      )}
    </RdoSectionShell>
  );
}
