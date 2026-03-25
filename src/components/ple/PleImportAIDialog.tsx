import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { Loader2, Upload, Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { canEdit, requireEdit } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [stages, setStages] = useState<ExtractedStage[]>([]);
  const [substages, setSubstages] = useState<ExtractedSubstage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
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
      // Auto-expand all stages
      const allStageCodes = new Set<string>((data.stages || []).map((s: ExtractedStage) => s.code));
      setExpandedStages(allStageCodes);
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

  const toggleStageExpand = (code: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(code)) { next.delete(code); } else { next.add(code); }
      return next;
    });
  };

  const handleImport = async () => {
    if (!requireEdit()) return;
    const selected = items.filter(it => it.selected);
    if (!selected.length) { toast.error("Selecione pelo menos um item"); return; }

    setIsImporting(true);
    try {
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
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Group items by stage → substage for hierarchical display
  const hierarchicalView = () => {
    const stageMap = new Map<string, { stage: ExtractedStage; substages: Map<string, { substage: ExtractedSubstage; items: (ExtractedItem & { idx: number })[] }> }>();

    stages.forEach(s => stageMap.set(s.code, { stage: s, substages: new Map() }));
    substages.forEach(sub => {
      const parent = stageMap.get(sub.stage_code);
      if (parent) parent.substages.set(sub.code, { substage: sub, items: [] });
    });

    items.forEach((it, idx) => {
      const stageEntry = stageMap.get(it.stage_code);
      if (stageEntry) {
        const subEntry = stageEntry.substages.get(it.group_code);
        if (subEntry) {
          subEntry.items.push({ ...it, idx });
          return;
        }
      }
      // Orphaned - will show at bottom
    });

    return stageMap;
  };

  const orphanedItems = items.map((it, idx) => ({ ...it, idx })).filter(it => {
    const stageEntry = stages.find(s => s.code === it.stage_code);
    if (!stageEntry) return true;
    const subEntry = substages.find(s => s.code === it.group_code && s.stage_code === it.stage_code);
    return !subEntry;
  });

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
              <Badge className="text-xs bg-primary/10 text-primary border-primary/30">
                Total: {fmtCur(items.filter(it => it.selected).reduce((s, it) => s + it.total_value, 0))}
              </Badge>
            </div>
          )}

          {/* Hierarchical Results */}
          {items.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <Checkbox checked={selectedCount === items.length} onCheckedChange={(v) => toggleAll(!!v)} />
                  <span className="text-xs font-medium text-foreground">{selectedCount} de {items.length} selecionados</span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[45vh]">
                <div className="min-w-[900px]">
                  {/* Table Header */}
                  <div className="grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 bg-muted/30 border-b px-2 py-1.5 sticky top-0 z-10">
                    <span />
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">ITEM</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">DISCRIM.</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">SINAPI</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase">DESCRIÇÃO</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase text-center">UNID</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase text-right">QTDE</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase text-right">UNITÁRIO</span>
                    <span className="text-[9px] font-bold text-muted-foreground uppercase text-right">TOTAL</span>
                  </div>

                  {/* Hierarchical content */}
                  {Array.from(hierarchicalView().entries()).map(([stageCode, { stage, substages: subs }]) => {
                    const isExpanded = expandedStages.has(stageCode);
                    const stageItems = Array.from(subs.values()).flatMap(s => s.items);
                    const stageTotal = stageItems.filter(it => it.selected).reduce((s, it) => s + it.total_value, 0);

                    return (
                      <div key={stageCode}>
                        {/* ETAPA ROW */}
                        <div
                          className="grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 bg-primary/15 border-b border-primary/25 px-2 py-1.5 cursor-pointer hover:bg-primary/20 transition-colors items-center"
                          onClick={() => toggleStageExpand(stageCode)}
                        >
                          <span className="flex items-center justify-center">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                          </span>
                          <span className="text-[11px] font-extrabold text-primary">{stage.code}</span>
                          <span className="text-[10px] text-muted-foreground">Etapa</span>
                          <span />
                          <span className="text-[11px] font-extrabold text-foreground">{stage.name}</span>
                          <span />
                          <span />
                          <span />
                          <span className="text-[11px] font-extrabold text-right font-mono text-primary">{fmtCur(stageTotal)}</span>
                        </div>

                        {isExpanded && Array.from(subs.entries()).map(([subCode, { substage, items: subItems }]) => {
                          const subTotal = subItems.filter(it => it.selected).reduce((s, it) => s + it.total_value, 0);
                          return (
                            <div key={subCode}>
                              {/* SUBETAPA ROW */}
                              <div className="grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 bg-accent/40 border-b px-2 py-1 items-center">
                                <span />
                                <span className="text-[11px] font-bold text-foreground pl-2">{substage.code}</span>
                                <span className="text-[10px] text-muted-foreground">Subetapa</span>
                                <span />
                                <span className="text-[11px] font-bold text-foreground">{substage.name}</span>
                                <span />
                                <span className="text-[10px] text-muted-foreground text-right">{subItems.length} itens</span>
                                <span />
                                <span className="text-[11px] font-bold text-right font-mono">{fmtCur(subTotal)}</span>
                              </div>

                              {/* SERVIÇOS */}
                              {subItems.map(it => (
                                <div key={it.idx} className={`grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 border-b px-2 py-1 items-center ${!it.selected ? "opacity-40" : ""}`}>
                                  <span className="flex items-center justify-center pl-1">
                                    <Checkbox checked={it.selected} onCheckedChange={() => toggleItem(it.idx)} />
                                  </span>
                                  <span className="text-[10px] font-mono text-muted-foreground pl-4">{it.item_code}</span>
                                  <span className="text-[10px] text-muted-foreground truncate">{it.discrimination}</span>
                                  <span className="text-[10px] font-mono text-muted-foreground">{it.sinapi_code}</span>
                                  <span className="text-[10px] text-foreground truncate pr-2" title={it.description}>{it.description}</span>
                                  <span className="text-[10px] text-center text-muted-foreground">{it.unit}</span>
                                  <span className="text-[10px] text-right font-mono">{fmt(it.quantity)}</span>
                                  <span className="text-[10px] text-right font-mono">{fmtCur(it.unit_value)}</span>
                                  <span className="text-[10px] text-right font-mono font-semibold">{fmtCur(it.total_value)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Orphaned items */}
                  {orphanedItems.length > 0 && (
                    <div>
                      <div className="grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 bg-amber-500/10 border-b px-2 py-1.5 items-center">
                        <span />
                        <span className="text-[11px] font-bold text-amber-600 col-span-4">ITENS SEM GRUPO ({orphanedItems.length})</span>
                        <span /><span /><span /><span />
                      </div>
                      {orphanedItems.map(it => (
                        <div key={it.idx} className={`grid grid-cols-[32px_60px_80px_70px_1fr_45px_65px_85px_100px] gap-0 border-b px-2 py-1 items-center ${!it.selected ? "opacity-40" : ""}`}>
                          <span className="flex items-center justify-center">
                            <Checkbox checked={it.selected} onCheckedChange={() => toggleItem(it.idx)} />
                          </span>
                          <span className="text-[10px] font-mono">{it.item_code}</span>
                          <span className="text-[10px] truncate">{it.discrimination}</span>
                          <span className="text-[10px] font-mono">{it.sinapi_code}</span>
                          <span className="text-[10px] truncate">{it.description}</span>
                          <span className="text-[10px] text-center">{it.unit}</span>
                          <span className="text-[10px] text-right font-mono">{fmt(it.quantity)}</span>
                          <span className="text-[10px] text-right font-mono">{fmtCur(it.unit_value)}</span>
                          <span className="text-[10px] text-right font-mono font-semibold">{fmtCur(it.total_value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleImport} disabled={!canEdit || isImporting || selectedCount === 0}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Importar {selectedCount} itens
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
