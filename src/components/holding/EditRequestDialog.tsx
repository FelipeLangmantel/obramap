import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obraId: string;
  obraNome: string;
}

export function EditRequestDialog({ open, onOpenChange, obraId, obraNome }: Props) {
  const { user, profile } = useAuth();
  const [justificativa, setJustificativa] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!justificativa.trim()) {
      toast.error("Justificativa é obrigatória.");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("edit_requests").insert({
      obra_id: obraId,
      user_id: user?.id,
      user_name: profile?.display_name || user?.email || "Usuário",
      justificativa: justificativa.trim(),
      status: "pendente",
    } as any);

    if (error) {
      toast.error("Erro ao enviar solicitação.");
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
            Solicitar permissão de edição
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Para editar campos protegidos da obra <strong>{obraNome}</strong>, é necessária a autorização do administrador.
        </p>
        <div>
          <Label className="text-xs">Justificativa *</Label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Descreva o motivo da edição solicitada..."
            className="mt-1"
            rows={3}
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
