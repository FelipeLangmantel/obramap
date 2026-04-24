import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  onSaved: () => void;
}

export function AddActivityDialog({ open, onOpenChange, entryId, companyId, onSaved }: Props) {
  const [descricao, setDescricao] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!descricao.trim()) { toast.error("Descrição obrigatória."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("diary_activities").insert({
        company_id: companyId,
        diary_entry_id: entryId,
        descricao: descricao.trim(),
        localizacao: localizacao.trim() || null,
      });
      if (error) throw error;
      toast.success("Atividade adicionada.");
      setDescricao(""); setLocalizacao("");
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
        <DialogHeader><DialogTitle>Adicionar atividade</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Descrição *</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1 min-h-[80px]" />
          </div>
          <div>
            <Label className="text-xs">Localização (opcional)</Label>
            <Input value={localizacao} onChange={e => setLocalizacao(e.target.value)} className="mt-1" />
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
