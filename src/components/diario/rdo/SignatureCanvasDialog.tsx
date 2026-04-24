import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Eraser } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entryId: string;
  companyId: string;
  slot: 1 | 2;
  signerId: string | null;
  signerName: string | null;
  onSaved: () => void;
}

export function SignatureCanvasDialog({
  open, onOpenChange, entryId, companyId, slot, signerId, signerName, onSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setHasInk(false);
  }, [open]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPos.current = p;
    setHasInk(true);
  };
  const onUp = () => { drawing.current = false; lastPos.current = null; };

  const clear = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const save = async () => {
    if (!hasInk) { toast.error("Desenhe a assinatura antes de salvar."); return; }
    const c = canvasRef.current; if (!c) return;
    setSaving(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        c.toBlob(b => b ? resolve(b) : reject(new Error("blob")), "image/png", 0.9)
      );
      const path = `${companyId}/${entryId}/signature_slot${slot}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("diary-signatures")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      // Remove assinatura antiga deste slot (caso exista)
      const { data: existing } = await supabase
        .from("diary_signatures" as any)
        .select("id, signature_data")
        .eq("diary_entry_id", entryId)
        .eq("slot", slot)
        .maybeSingle();
      if (existing && (existing as any).signature_data) {
        await supabase.storage.from("diary-signatures").remove([(existing as any).signature_data]);
      }

      const payload = {
        company_id: companyId,
        diary_entry_id: entryId,
        slot,
        signature_data: path,
        assinado_por: signerId,
        assinado_por_nome: signerName,
      };
      const { error: dbErr } = existing
        ? await supabase.from("diary_signatures" as any).update(payload).eq("id", (existing as any).id)
        : await supabase.from("diary_signatures" as any).insert(payload);
      if (dbErr) throw dbErr;

      toast.success("Assinatura salva.");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assinar — Slot {slot}</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg bg-white">
          <canvas
            ref={canvasRef}
            width={520}
            height={220}
            className="w-full h-[220px] touch-none cursor-crosshair rounded-lg"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Assine no quadro acima usando o mouse ou o dedo (touch).
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={clear} disabled={saving}>
            <Eraser className="h-4 w-4 mr-2" /> Limpar
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !hasInk}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
