import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LaborType } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  onSaved: () => void;
}

export function AddLaborDialog({ open, onOpenChange, entryId, companyId, onSaved }: Props) {
  const [types, setTypes] = useState<LaborType[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<"todos" | "propria" | "terceiros">("todos");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [novoNome, setNovoNome] = useState("");
  const [novoCat, setNovoCat] = useState<"propria" | "terceiros">("propria");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadTypes = async () => {
    const { data } = await supabase
      .from("labor_types")
      .select("id, nome, categoria")
      .order("categoria")
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

  const filtered = types.filter(t => {
    if (filterCat !== "todos" && t.categoria !== filterCat) return false;
    if (search && !t.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = {
    propria: filtered.filter(t => t.categoria === "propria"),
    terceiros: filtered.filter(t => t.categoria === "terceiros"),
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = 1;
      return next;
    });
  };

  const setQty = (id: string, qty: number) => {
    setSelected(prev => ({ ...prev, [id]: Math.max(1, qty) }));
  };

  const handleCriarNovo = async () => {
    if (!novoNome.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("labor_types")
        .insert({ nome: novoNome.trim(), categoria: novoCat, company_id: companyId })
        .select("id, nome, categoria")
        .single();
      if (error) throw error;
      setTypes(prev => [...prev, data as any]);
      setSelected(prev => ({ ...prev, [data.id]: 1 }));
      setNovoNome("");
      toast.success("Tipo de mão de obra criado.");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    const ids = Object.keys(selected);
    if (ids.length === 0) {
      toast.error("Selecione ao menos um item.");
      return;
    }
    setSaving(true);
    try {
      const rows = ids.map(id => {
        const t = types.find(x => x.id === id)!;
        return {
          company_id: companyId,
          diary_entry_id: entryId,
          nome: t.nome,
          categoria: t.categoria,
          quantidade: selected[id],
        };
      });
      const { error } = await supabase.from("diary_labor").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} item(s) adicionado(s).`);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar mão de obra</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterCat} onValueChange={v => setFilterCat(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="propria">Própria</SelectItem>
              <SelectItem value="terceiros">Terceiros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 -mx-6 px-6">
          {(["propria", "terceiros"] as const).map(cat => (
            grouped[cat].length > 0 && (
              <div key={cat}>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  Mão de obra {cat === "propria" ? "Própria" : "Terceiros"}
                </h4>
                <div className="space-y-1">
                  {grouped[cat].map(t => {
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
                            onChange={e => setQty(t.id, Number(e.target.value))}
                            className="w-20 h-8"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
        </div>

        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs">Adicionar nova mão de obra</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Nome"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              className="flex-1"
            />
            <Select value={novoCat} onValueChange={v => setNovoCat(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="propria">Própria</SelectItem>
                <SelectItem value="terceiros">Terceiros</SelectItem>
              </SelectContent>
            </Select>
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
