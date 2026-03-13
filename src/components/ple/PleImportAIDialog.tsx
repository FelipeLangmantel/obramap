import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Sparkles, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExtractedItem {
  item_code: string;
  discrimination: string;
  sinapi_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  group_code: string;
  group_name: string;
  stage_code: string;
  stage_name: string;
  selected: boolean;
}

interface ExtractedStage {
  code: string;
  name: string;
}

interface ExtractedSubstage {
  code: string;
  name: string;
  stage_code: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  existingGroups: { id: string; code: string; name: string; parent_id: string | null }[];
  onImport: (
    groups: { code: string; name: string; parent_code?: string }[],
    events: Omit<ExtractedItem, "selected" | "total_value">[]
  ) => Promise<void>;
}

export function PleImportAIDialog({ open, onClose, existingGroups, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [stages, setStages] = useState<ExtractedStage[]>([]);
  const [substages, setSubstages] = useState<ExtractedSubstage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setItems([]);
    setStages([]);
    setSubstages([]);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleProcess = async () => {
    if (!preview) return;
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-ple-budget", {
        body: { fileBase64: preview, existingGroups: existingGroups.map(g => ({ code: g.code, name: g.name })) },
      });
      if (error) throw error;
      if (!data?.success || !data?.items?.length) {
        toast.error(data?.message || "Nenhum item encontrado na imagem");
        return;
      }
      setStages(data.stages || []);
      setSubstages(data.substages || []);
      setItems(data.items.map((it: any) => ({ ...it, selected: true })));
      toast.success(data.message || `${data.items.length} itens extraídos pela IA`);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao processar imagem: " + (err.message || ""));
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItem = (idx: number) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  const toggleAll = (val: boolean) => setItems(prev => prev.map(it => ({ ...it, selected: val })));
  const updateItem = (idx: number, field: keyof ExtractedItem, value: any) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleImport = async () => {
    const selected = items.filter(it => it.selected);
    if (!selected.length) { toast.error("Selecione pelo menos um item"); return; }

    setIsImporting(true);
    try {
      // Build group list: stages first (no parent), then substages (with parent_code)
      const existingCodes = new Set(existingGroups.map(g => g.code));
      const newGroups: { code: string; name: string; parent_code?: string }[] = [];

      stages.forEach(s => {
        if (!existingCodes.has(s.code)) {
          newGroups.push({ code: s.code, name: s.name });
          existingCodes.add(s.code);
        }
      });
      substages.forEach(s => {
        if (!existingCodes.has(s.code)) {
          newGroups.push({ code: s.code, name: s.name, parent_code: s.stage_code });
          existingCodes.add(s.code);
        }
      });

      const events = selected.map(({ selected: _, total_value: __, ...rest }) => rest);
      await onImport(newGroups, events);
      toast.success(`${selected.length} itens importados!`);
      onClose();
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err.message || ""));
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = items.filter(it => it.selected).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importar Serviços via IA
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Upload */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
              {preview ? (
                <div className="flex items-center gap-3">
                  <img src={preview} alt="Preview" className="h-16 rounded border border-border" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">Clique para trocar a imagem</p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Envie um print da planilha de orçamento</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou PDF</p>
                </div>
              )}
            </div>
            <Button onClick={handleProcess} disabled={!preview || isProcessing} className="h-12 px-6">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isProcessing ? "Processando..." : "Analisar com IA"}
            </Button>
          </div>

          {/* Summary badges */}
          {items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">{stages.length} etapas</Badge>
              <Badge variant="outline" className="text-xs">{substages.length} subetapas</Badge>
              <Badge variant="outline" className="text-xs">{items.length} serviços</Badge>
            </div>
          )}

          {/* Results table */}
          {items.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                <div className="flex items-center gap-2">
                  <Checkbox checked={selectedCount === items.length} onCheckedChange={(v) => toggleAll(!!v)} />
                  <span className="text-xs font-medium text-foreground">{selectedCount} de {items.length} selecionados</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Total: R$ {items.filter(it => it.selected).reduce((s, it) => s + it.total_value, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </Badge>
              </div>
              <div className="overflow-x-auto max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left">Discrim.</th>
                      <th className="p-2 text-left">SINAPI</th>
                      <th className="p-2 text-left">Descrição</th>
                      <th className="p-2 text-left">Unid</th>
                      <th className="p-2 text-right">Qtde</th>
                      <th className="p-2 text-right">Valor Unit.</th>
                      <th className="p-2 text-right">Total</th>
                      <th className="p-2 text-left">Etapa</th>
                      <th className="p-2 text-left">Subetapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className={`border-t border-border ${!it.selected ? "opacity-40" : ""}`}>
                        <td className="p-2"><Checkbox checked={it.selected} onCheckedChange={() => toggleItem(idx)} /></td>
                        <td className="p-2"><Input value={it.item_code} onChange={e => updateItem(idx, "item_code", e.target.value)} className="h-6 text-xs w-16 px-1" /></td>
                        <td className="p-2"><Input value={it.discrimination} onChange={e => updateItem(idx, "discrimination", e.target.value)} className="h-6 text-xs w-24 px-1" /></td>
                        <td className="p-2"><Input value={it.sinapi_code} onChange={e => updateItem(idx, "sinapi_code", e.target.value)} className="h-6 text-xs w-16 px-1" /></td>
                        <td className="p-2"><Input value={it.description} onChange={e => updateItem(idx, "description", e.target.value)} className="h-6 text-xs min-w-[200px] px-1" /></td>
                        <td className="p-2"><Input value={it.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="h-6 text-xs w-12 px-1" /></td>
                        <td className="p-2 text-right"><Input type="number" step="0.01" value={it.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)} className="h-6 text-xs w-16 px-1 text-right" /></td>
                        <td className="p-2 text-right"><Input type="number" step="0.01" value={it.unit_value} onChange={e => updateItem(idx, "unit_value", parseFloat(e.target.value) || 0)} className="h-6 text-xs w-20 px-1 text-right" /></td>
                        <td className="p-2 text-right font-mono">{(it.quantity * it.unit_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2"><span className="text-[10px] text-primary font-bold">{it.stage_code}</span></td>
                        <td className="p-2"><span className="text-[10px] text-muted-foreground">{it.group_code} {it.group_name}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleImport} disabled={isImporting || selectedCount === 0}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Importar {selectedCount} itens
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
