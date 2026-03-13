import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  nextNumber: number;
  onSave: (data: { measurement_number: number; period_label: string; start_date?: string; end_date?: string }) => Promise<any>;
}

export function PleNewMeasurementDialog({ open, onClose, nextNumber, onSave }: Props) {
  const [form, setForm] = useState({
    measurement_number: nextNumber,
    period_label: "",
    start_date: "",
    end_date: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.period_label) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Medição</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nº da Medição</Label><Input type="number" value={form.measurement_number} onChange={e => setForm(f => ({ ...f, measurement_number: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Período (ex: Janeiro/2025)</Label><Input value={form.period_label} onChange={e => setForm(f => ({ ...f, period_label: e.target.value }))} className="h-8 text-xs" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Data Início</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Data Fim</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.period_label}>Criar Medição</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
