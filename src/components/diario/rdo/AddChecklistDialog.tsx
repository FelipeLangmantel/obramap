import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  onSaved: () => void;
}

interface DraftItem { item: string; concluido: boolean; }

export function AddChecklistDialog({ open, onOpenChange, entryId, companyId, onSaved }: Props) {
  const [items, setItems] = useState<DraftItem[]>([{ item: "", concluido: false }]);
  const [saving, setSaving] = useState(false);

  const addRow = () => setItems(prev => [...prev, { item: "", concluido: false }]);
  const removeRow = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<DraftItem>) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const handleSave = async () => {
    const valid = items.filter(it => it.item.trim());
    if (valid.length === 0) { toast.error("Adicione ao menos 1 item."); return; }
    setSaving(true);
    try {
      const rows = valid.map(it => ({
        company_id: companyId,
        diary_entry_id: entryId,
        item: it.item.trim(),
        concluido: it.concluido,
      }));
      const { error } = await supabase.from("diary_checklist").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} item(s) adicionado(s).`);
      setItems([{ item: "", concluido: false }]);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Adicionar checklist</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox checked={it.concluido} onCheckedChange={c => update(i, { concluido: !!c })} />
              <Input
                value={it.item}
                onChange={e => update(i, { item: e.target.value })}
                placeholder="Item do checklist"
                className="flex-1"
              />
              {items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow} className="w-full">
            <Plus className="h-4 w-4 mr-1" />Adicionar mais um
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
