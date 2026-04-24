import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entryId: string;
  companyId: string;
  autorId: string | null;
  autorNome: string;
  onSaved: () => void;
}

export function AddCommentDialog({ open, onOpenChange, entryId, companyId, autorId, autorNome, onSaved }: Props) {
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!texto.trim()) { toast.error("Comentário obrigatório."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("diary_comments").insert({
        company_id: companyId,
        diary_entry_id: entryId,
        texto: texto.trim(),
        autor_id: autorId,
        autor_nome: autorNome,
      });
      if (error) throw error;
      toast.success("Comentário adicionado.");
      setTexto("");
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
        <DialogHeader><DialogTitle>Adicionar comentário</DialogTitle></DialogHeader>
        <Textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Seu comentário..."
          className="min-h-[120px]"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !texto.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
