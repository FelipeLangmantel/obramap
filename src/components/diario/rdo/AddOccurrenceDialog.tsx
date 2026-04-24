import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import type { OccurrenceTag } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  onSaved: () => void;
}

export function AddOccurrenceDialog({ open, onOpenChange, entryId, companyId, onSaved }: Props) {
  const [tags, setTags] = useState<OccurrenceTag[]>([]);
  const [descricao, setDescricao] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [search, setSearch] = useState("");
  const [novaTag, setNovaTag] = useState("");
  const [saving, setSaving] = useState(false);

  const loadTags = async () => {
    const { data } = await supabase.from("occurrence_tags").select("id, nome").order("nome");
    setTags((data as any) || []);
  };

  useEffect(() => {
    if (open) {
      loadTags();
      setDescricao(""); setSelectedTags([]); setShowMore(false); setSearch(""); setNovaTag("");
    }
  }, [open]);

  const filtered = tags.filter(t => !search || t.nome.toLowerCase().includes(search.toLowerCase()));
  const visible = showMore ? filtered : filtered.slice(0, 6);

  const toggleTag = (nome: string) => {
    setSelectedTags(prev => prev.includes(nome) ? prev.filter(x => x !== nome) : [...prev, nome]);
  };

  const handleNovaTag = async () => {
    if (!novaTag.trim()) return;
    try {
      const { data, error } = await supabase
        .from("occurrence_tags")
        .insert({ nome: novaTag.trim(), is_default: false, company_id: companyId })
        .select("id, nome").single();
      if (error) throw error;
      setTags(prev => [...prev, data as any]);
      setSelectedTags(prev => [...prev, data.nome]);
      setNovaTag("");
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  const handleSave = async () => {
    if (!descricao.trim()) { toast.error("Descrição obrigatória."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("diary_occurrences").insert({
        company_id: companyId,
        diary_entry_id: entryId,
        descricao: descricao.trim(),
        tags: selectedTags,
      });
      if (error) throw error;
      toast.success("Ocorrência adicionada.");
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
        <DialogHeader><DialogTitle>Adicionar ocorrência</DialogTitle></DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1 min-h-[80px]" />
          </div>

          <div>
            <Label className="text-xs">Tipos de ocorrência</Label>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {selectedTags.map(t => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => toggleTag(t)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              <Checkbox id="showmore" checked={showMore} onCheckedChange={c => setShowMore(!!c)} />
              <Label htmlFor="showmore" className="text-xs cursor-pointer">Exibir mais opções</Label>
            </div>

            {showMore && (
              <div className="relative mt-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Pesquisar tag..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
              </div>
            )}

            <div className="flex flex-wrap gap-1 mt-2">
              {visible.map(t => {
                const isSel = selectedTags.includes(t.nome);
                return (
                  <Badge
                    key={t.id}
                    variant={isSel ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(t.nome)}
                  >
                    {t.nome}
                  </Badge>
                );
              })}
            </div>

            {showMore && (
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Input placeholder="Nova tag" value={novaTag} onChange={e => setNovaTag(e.target.value)} className="h-8" />
                <Button size="sm" variant="outline" onClick={handleNovaTag} disabled={!novaTag.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !descricao.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
