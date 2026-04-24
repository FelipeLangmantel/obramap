import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EquipmentType } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  onSaved: () => void;
}

export function AddEquipmentDialog({ open, onOpenChange, entryId, companyId, onSaved }: Props) {
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [novoNome, setNovoNome] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTypes = async () => {
    const { data } = await supabase
      .from("equipment_types")
      .select("id, nome")
      .order("nome");
    setTypes((data as any) || []);
  };

  useEffect(() => {
    if (open) {
      loadTypes();
      setSelected({});
      setSearch("");
      setNovoNome("");
    }
  }, [open]);

  const filtered = types.filter(t =>
    !search || t.nome.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = 1;
      return next;
    });
  };

  const handleCriarNovo = async () => {
    if (!novoNome.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("equipment_types")
        .insert({ nome: novoNome.trim(), company_id: companyId })
        .select("id, nome")
        .single();
      if (error) throw error;
      setTypes(prev => [...prev, data as any]);
      setSelected(prev => ({ ...prev, [data.id]: 1 }));
      setNovoNome("");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    const ids = Object.keys(selected);
    if (ids.length === 0) { toast.error("Selecione ao menos um equipamento."); return; }
    setSaving(true);
    try {
      const rows = ids.map(id => {
        const t = types.find(x => x.id === id)!;
        return {
          company_id: companyId,
          diary_entry_id: entryId,
          nome: t.nome,
          quantidade: selected[id],
        };
      });
      const { error } = await supabase.from("diary_equipment").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} equipamento(s) adicionado(s).`);
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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Adicionar equipamento</DialogTitle></DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 -mx-6 px-6">
          {filtered.map(t => {
            const isSel = t.id in selected;
            return (
              <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted">
                <Checkbox checked={isSel} onCheckedChange={() => toggle(t.id)} />
                <span className="flex-1 text-sm">{t.nome}</span>
                {isSel && (
                  <Input
                    type="number"
                    min={1}
                    value={selected[t.id]}
                    onChange={e => setSelected(prev => ({ ...prev, [t.id]: Math.max(1, Number(e.target.value)) }))}
                    className="w-20 h-8"
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs">Adicionar novo equipamento</Label>
          <div className="flex gap-2">
            <Input placeholder="Nome do equipamento" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
            <Button variant="outline" size="icon" onClick={handleCriarNovo} disabled={creating || !novoNome.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving || Object.keys(selected).length === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar ({Object.keys(selected).length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
