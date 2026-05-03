import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Layers, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { usePleData } from "@/hooks/usePleData";
import type { PleEvent } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface ObraMapService {
  macro_id: string; macro_name: string;
  scope_id: string; scope_name: string;
}

export function PleSyncTab(props: PleDataReturn) {
  const { currentProject, events, updateEvent } = props;
  const isIntegrated = currentProject?.mode === "integrated";

  const [obraMapServices, setObraMapServices] = useState<ObraMapService[]>([]);
  const [showBatchMapping, setShowBatchMapping] = useState(false);
  const [batchMappings, setBatchMappings] = useState<Record<string, string>>({});
  const [syncResult, setSyncResult] = useState<{ synced: number; projectName: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!isIntegrated || !currentProject?.obramap_project_id) return;
    (async () => {
      const { data: project } = await supabase
        .from("projects").select("macros_template")
        .eq("id", currentProject.obramap_project_id!).single();
      if (project?.macros_template) {
        const services: ObraMapService[] = [];
        const tpl = project.macros_template as any;
        if (Array.isArray(tpl)) tpl.forEach((macro: any) => {
          (macro.scopes || []).forEach((scope: any) => services.push({
            macro_id: macro.id || macro.name, macro_name: macro.name,
            scope_id: scope.id || scope.name, scope_name: scope.name,
          }));
        });
        setObraMapServices(services);
      }
    })();
  }, [isIntegrated, currentProject?.obramap_project_id]);

  const houseCount = Math.max(1, Number(currentProject?.total_houses) || 1);
  const lineFactor = (ev: PleEvent) => (ev.billing_type || 'per_house') === 'per_house' ? houseCount : 1;
  const lineMat = (ev: PleEvent) => (ev.quantity || 0) * (ev.mat_unit_value || 0) * lineFactor(ev);
  const lineMo  = (ev: PleEvent) => (ev.quantity || 0) * (ev.mo_unit_value || 0) * lineFactor(ev);
  const lineTotal = (ev: PleEvent) => (ev.quantity || 0) * (ev.unit_value || 0) * lineFactor(ev);

  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const mappedCount = events.filter(e => e.obramap_scope_id).length;
  const unmappedEvents = useMemo(() => events.filter(e => !e.obramap_scope_id), [events]);

  const syncSummary = useMemo(() => {
    if (!isIntegrated) return [];
    const byScope = new Map<string, { scopeName: string; count: number; totalMat: number; totalMo: number; totalUnit: number }>();
    events.filter(e => e.obramap_scope_id).forEach(e => {
      const key = e.obramap_scope_id!;
      const existing = byScope.get(key) || { scopeName: e.obramap_scope_name || "", count: 0, totalMat: 0, totalMo: 0, totalUnit: 0 };
      existing.count++;
      existing.totalMat += lineMat(e);
      existing.totalMo += lineMo(e);
      existing.totalUnit += lineTotal(e);
      byScope.set(key, existing);
    });
    return Array.from(byScope.values());
  }, [events, isIntegrated, houseCount]);

  const handleSync = async () => {
    if (!currentProject) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.rpc("sync_contract_from_ple", { p_ple_project_id: currentProject.id });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.success) {
        const { data: proj } = await supabase.from("projects").select("name").eq("id", currentProject.obramap_project_id!).single();
        setSyncResult({ synced: result.synced_services, projectName: proj?.name || "" });
        toast.success(`${result.synced_services} serviços sincronizados!`);
      } else toast.error(result?.message || "Erro na sincronização");
    } finally { setIsSyncing(false); }
  };

  const handleBatchMap = async () => {
    let count = 0;
    for (const [eventId, serviceKey] of Object.entries(batchMappings)) {
      if (serviceKey && serviceKey !== "__none__") {
        const svc = obraMapServices.find(s => `${s.macro_id}::${s.scope_id}` === serviceKey);
        if (svc) {
          await updateEvent(eventId, {
            obramap_macro_id: svc.macro_id, obramap_macro_name: svc.macro_name,
            obramap_scope_id: svc.scope_id, obramap_scope_name: svc.scope_name,
          } as any);
          count++;
        }
      }
    }
    toast.success(`${count} itens mapeados com sucesso!`);
    setShowBatchMapping(false); setBatchMappings({});
  };

  if (!currentProject) return null;

  if (!isIntegrated) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Sincronização disponível apenas em projetos no modo integrado com obra.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden p-1">
      {/* KPIs globais e por unidade */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-[10px] uppercase font-semibold text-muted-foreground">Mapeados</p>
          <p className="text-base font-bold font-mono text-primary">{mappedCount}/{events.length}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-[10px] uppercase font-semibold text-amber-600">Pendentes</p>
          <p className="text-base font-bold font-mono text-amber-600">{unmappedEvents.length}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <p className="text-[10px] uppercase font-semibold text-emerald-600">Total mapeado</p>
          <p className="text-sm font-bold font-mono text-emerald-600 truncate">{fmtCur(syncSummary.reduce((s, x) => s + x.totalUnit, 0))}</p>
          <p className="text-[9px] font-mono text-emerald-600/70 truncate">{fmtCur(syncSummary.reduce((s, x) => s + x.totalUnit, 0) / houseCount)} / un. hab.</p>
        </div>
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
          <p className="text-[10px] uppercase font-semibold text-blue-600">Unidades</p>
          <p className="text-base font-bold font-mono text-blue-600">{houseCount} casas</p>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {mappedCount > 0 && (
          <Button size="sm" variant="default" onClick={handleSync} disabled={isSyncing} className="gap-1.5 text-xs h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            Sincronizar com Contrato da Obra
          </Button>
        )}
        {unmappedEvents.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setShowBatchMapping(true)} className="gap-1.5 text-xs h-8">
            <Layers className="h-3.5 w-3.5" /> Mapear em lote ({unmappedEvents.length})
          </Button>
        )}
      </div>

      {syncResult && (
        <div className="p-2 rounded-md bg-green-500/10 border border-green-500/30 text-xs text-green-700 dark:text-green-400">
          ✓ {syncResult.synced} serviços sincronizados com o contrato de <strong>{syncResult.projectName}</strong>
        </div>
      )}

      {/* Sync summary table */}
      <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
        <div className="grid grid-cols-[1fr_60px_110px_110px_110px_110px] gap-0 bg-muted/50 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase border-b flex-shrink-0">
          <span>Serviço</span>
          <span className="text-center">Itens</span>
          <span className="text-right">MAT</span>
          <span className="text-right">MO</span>
          <span className="text-right">Total Global</span>
          <span className="text-right">Unit./Casa</span>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          {syncSummary.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum item mapeado ainda. Use "Mapear em lote" ou vincule item a item na aba Orçamento.
            </div>
          ) : syncSummary.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_60px_110px_110px_110px_110px] gap-0 px-3 py-1.5 border-b text-[11px] hover:bg-accent/20">
              <span className="truncate font-medium">{s.scopeName}</span>
              <span className="text-center text-muted-foreground">{s.count}</span>
              <span className="text-right font-mono text-blue-600">{fmtCur(s.totalMat)}</span>
              <span className="text-right font-mono text-emerald-600">{fmtCur(s.totalMo)}</span>
              <span className="text-right font-mono font-bold text-primary">{fmtCur(s.totalUnit)}</span>
              <span className="text-right font-mono text-muted-foreground">{fmtCur(s.totalUnit / houseCount)}</span>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Batch dialog */}
      <Dialog open={showBatchMapping} onOpenChange={setShowBatchMapping}>
        <DialogContent className="max-w-3xl w-[95vw] h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
            <DialogTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Mapear Itens em Lote ({unmappedEvents.length})
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 px-6">
            <div className="space-y-2 py-2">
              {unmappedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono text-primary">{ev.item_code}</span>
                    <span className="text-[11px] text-foreground ml-2 truncate">{ev.description}</span>
                  </div>
                  <Select value={batchMappings[ev.id] || ""} onValueChange={v => setBatchMappings(prev => ({ ...prev, [ev.id]: v }))}>
                    <SelectTrigger className="h-7 text-[10px] w-[180px]"><SelectValue placeholder="Selecionar serviço..." /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {Array.from(
                        obraMapServices.reduce((groups, s) => {
                          const arr = groups.get(s.macro_name) || [];
                          arr.push(s); groups.set(s.macro_name, arr);
                          return groups;
                        }, new Map<string, ObraMapService[]>())
                      ).map(([macroName, svcs]) => (
                        <SelectGroup key={macroName}>
                          <SelectLabel className="text-[10px] font-bold">{macroName}</SelectLabel>
                          {svcs.map(s => (
                            <SelectItem key={`${s.macro_id}::${s.scope_id}`} value={`${s.macro_id}::${s.scope_id}`}>
                              {s.scope_name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-3 border-t flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShowBatchMapping(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleBatchMap} disabled={Object.values(batchMappings).filter(Boolean).length === 0}>
              Mapear {Object.values(batchMappings).filter(Boolean).length} itens
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
