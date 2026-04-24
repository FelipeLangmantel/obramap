import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  diaryEntryId: string;
  projectId: string;
  companyId: string;
  userId: string;
  userName: string;
  numRelatorio: number | null;
  entryDate: string;
}

export function RdoEditRequestDialog({
  open, onOpenChange, diaryEntryId, projectId, companyId,
  userId, userName, numRelatorio, entryDate,
}: Props) {
  const [justificativa, setJustificativa] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!justificativa.trim()) {
      toast.error("Justificativa é obrigatória.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("diary_edit_requests" as any).insert({
      diary_entry_id: diaryEntryId,
      project_id: projectId,
      company_id: companyId,
      requested_by: userId,
      requested_by_name: userName,
      justificativa: justificativa.trim(),
      status: "pendente",
    });

    if (error) {
      toast.error("Erro ao enviar solicitação: " + error.message);
      setSending(false);
      return;
    }
    toast.success("Solicitação enviada ao administrador.");
    setJustificativa("");
    setSending(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            Solicitar edição do RDO
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Este relatório está bloqueado{numRelatorio ? <> (n° <strong>{numRelatorio}</strong>)</> : null} de {entryDate}.
          Justifique a alteração desejada para o administrador analisar.
        </p>
        <div>
          <Label className="text-xs">Justificativa *</Label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Descreva o motivo e o que precisa ser corrigido..."
            className="mt-1"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={sending || !justificativa.trim()}>
            {sending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Enviar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
