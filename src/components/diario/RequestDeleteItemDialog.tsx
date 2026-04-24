import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  itemDescription?: string;
  onRequested?: () => void;
}

/**
 * Diálogo para o engenheiro abrir pedido de exclusão de um lançamento de produção (diary_item).
 * A exclusão NÃO é imediata: gera um pedido que precisa ser aprovado pelo coordenador.
 */
export function RequestDeleteItemDialog({ open, onOpenChange, itemId, itemDescription, onRequested }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!itemId) return;
    if (reason.trim().length < 5) {
      toast.error("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("request_diary_item_deletion", {
        p_item_id: itemId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success("Pedido de exclusão enviado ao coordenador.");
      setReason("");
      onOpenChange(false);
      onRequested?.();
    } catch (err: any) {
      toast.error("Erro ao solicitar exclusão: " + (err.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar exclusão de lançamento</DialogTitle>
          <DialogDescription>
            A exclusão será enviada para aprovação do coordenador. O lançamento permanece visível até a decisão.
          </DialogDescription>
        </DialogHeader>
        {itemDescription && (
          <p className="text-sm text-muted-foreground border-l-2 border-muted pl-3">{itemDescription}</p>
        )}
        <div className="space-y-2">
          <Label htmlFor="reason">Motivo da exclusão *</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Ex.: erro de digitação no percentual, casa errada, lançamento duplicado..."
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar pedido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
