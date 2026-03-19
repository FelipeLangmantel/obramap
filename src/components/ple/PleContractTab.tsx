import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Sparkles, ChevronDown, ChevronRight, Check, X, ChevronsUpDown, Link2, RefreshCw, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PleImportAIDialog } from "./PleImportAIDialog";
import type { usePleData } from "@/hooks/usePleData";
import type { PleEvent } from "@/hooks/usePleData";

type PleDataReturn = ReturnType<typeof usePleData>;

interface ObraMapService {
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
}

export function PleContractTab(props: PleDataReturn) {
  const {
    currentProject, groups, events,
    createGroup, deleteGroup,
    createEvent, deleteEvent, updateEvent,
  } = props;

  const [showAIImport, setShowAIImport] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(groups.map(g => g.id)));
  const [obraMapServices, setObraMapServices] = useState<ObraMapService[]>([]);
  const [showBatchMapping, setShowBatchMapping] = useState(false);
  const [batchMappings, setBatchMappings] = useState<Record<string, string>>({});
  const [syncResult, setSyncResult] = useState<{ synced: number; projectName: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Inline editable number cell
  const InlineNumber = ({ value, eventId, field, ev }: { value: number; eventId: string; field: 'mat_unit_value' | 'mo_unit_value' | 'unit_value'; ev: PleEvent }) => {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(String(value));
    const handleBlur = () => {
      setEditing(false);
      const num = parseFloat(val) || 0;
      if (num === value) return;
      if (field === 'mat_unit_value') {
        updateEvent(eventId, { mat_unit_value: num, mo_unit_value: ev.mo_unit_value, unit_value: num + ev.mo_unit_value } as any);
      } else if (field === 'mo_unit_value') {
        updateEvent(eventId, { mat_unit_value: ev.mat_unit_value, mo_unit_value: num, unit_value: ev.mat_unit_value + num } as any);
      } else {
        updateEvent(eventId, { unit_value: num, mat_unit_value: 0, mo_unit_value: 0 } as any);
      }
    };
    if (editing) {
      return (
        <Input
          type="number"
          step="0.01"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="h-6 text-[11px] text-right font-mono w-full border-primary/50"
        />
      );
    }
    return (
      <span
        className="text-[11px] text-right font-mono text-muted-foreground cursor-pointer hover:text-primary hover:underline decoration-dashed underline-offset-2 block w-full"
        onClick={() => { setVal(String(value)); setEditing(true); }}
      >
        {fmtCur(value)}
      </span>
    );
  };

  // Billing type badge
  const BillingTypeBadge = ({ ev }: { ev: PleEvent }) => {
    const billingType = ev.billing_type || 'per_house';
    return (
      <Select
        value={billingType}
        onValueChange={(v) => updateEvent(ev.id, { billing_type: v } as any)}
      >
        <SelectTrigger className="h-5 text-[9px] w-[70px] border-dashed px-1.5 gap-0.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="per_house">Por casa</SelectItem>
          <SelectItem value="fixed">Total</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const isIntegrated = currentProject?.mode === "integrated";

  // Load ObraMap services when integrated
  useEffect(() => {
    if (!isIntegrated || !currentProject?.obramap_project_id) return;
    const load = async () => {
      const { data: project } = await supabase
        .from("projects")
        .select("macros_template")
        .eq("id", currentProject.obramap_project_id!)
        .single();
      if (project?.macros_template) {
        const services: ObraMapService[] = [];
        const template = project.macros_template as any;
        if (Array.isArray(template)) {
          template.forEach((macro: any) => {
            if (macro.scopes && Array.isArray(macro.scopes)) {
              macro.scopes.forEach((scope: any) => {
                services.push({
                  macro_id: macro.id || macro.name,
                  macro_name: macro.name,
                  scope_id: scope.id || scope.name,
                  scope_name: scope.name,
                });
              });
            }
          });
        }
        setObraMapServices(services);
      }
    };
    load();
  }, [isIntegrated, currentProject?.obramap_project_id]);

  const allExpanded = useMemo(() => groups.length > 0 && groups.every(g => expandedStages.has(g.id)), [groups, expandedStages]);
  const toggleAll = () => {
    if (allExpanded) setExpandedStages(new Set());
    else setExpandedStages(new Set(groups.map(g => g.id)));
  };

  const [newStage, setNewStage] = useState({ code: "", name: "" });
  const [newSubstage, setNewSubstage] = useState({ code: "", name: "", parent_id: "" });
  const [addingSubstageTo, setAddingSubstageTo] = useState<string | null>(null);
  const [addingEventTo, setAddingEventTo] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    group_id: "", item_code: "", description: "", discrimination: "",
    sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0,
    mat_unit_value: 0, mo_unit_value: 0, billing_type: "per_house" as string,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCur = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const stages = useMemo(() => groups.filter(g => !g.parent_id).sort((a, b) => a.display_order - b.display_order), [groups]);
  const substagesByStage = useMemo(() => {
    const map = new Map<string, typeof groups>();
    stages.forEach(s => map.set(s.id, []));
    groups.filter(g => g.parent_id).sort((a, b) => a.display_order - b.display_order).forEach(g => {
      const arr = map.get(g.parent_id!) || [];
      arr.push(g);
      map.set(g.parent_id!, arr);
    });
    return map;
  }, [groups, stages]);

  const eventsByGroup = useMemo(() => {
    const map = new Map<string, typeof events>();
    groups.forEach(g => map.set(g.id, []));
    events.forEach(e => {
      if (e.group_id) {
        const arr = map.get(e.group_id) || [];
        arr.push(e);
        map.set(e.group_id, arr);
      }
    });
    return map;
  }, [events, groups]);

  const ungroupedEvents = useMemo(() =>
    events.filter(e => !e.group_id).sort((a, b) => a.display_order - b.display_order),
    [events]
  );

  const stats = useMemo(() => {
    const totalContractual = events.reduce((s, e) => s + e.quantity * e.unit_value, 0);
    return {
      totalStages: stages.length,
      totalSubstages: groups.filter(g => g.parent_id).length,
      totalEvents: events.length,
      totalContractual,
      ungroupedCount: ungroupedEvents.length,
      mappedCount: events.filter(e => e.obramap_scope_id).length,
    };
  }, [groups, events, stages, ungroupedEvents]);

  const toggleStage = (id: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddStage = async () => {
    if (!newStage.code || !newStage.name) { toast.error("Código e nome obrigatórios"); return; }
    const result = await createGroup({ ...newStage, parent_id: null });
    if (result) {
      setExpandedStages(prev => new Set(prev).add(result.id));
      setNewStage({ code: "", name: "" });
    }
  };

  const handleAddSubstage = async (stageId: string) => {
    if (!newSubstage.code || !newSubstage.name) { toast.error("Código e nome obrigatórios"); return; }
    const result = await createGroup({ ...newSubstage, parent_id: stageId });
    if (result) {
      setExpandedStages(prev => new Set(prev).add(result.id));
      setNewSubstage({ code: "", name: "", parent_id: "" });
      setAddingSubstageTo(null);
    }
  };

  const handleAddEvent = async (substageId: string) => {
    if (!newEvent.item_code || !newEvent.description) { toast.error("Item e descrição obrigatórios"); return; }
    const computedUnitValue = newEvent.mat_unit_value + newEvent.mo_unit_value;
    const finalUnitValue = computedUnitValue > 0 ? computedUnitValue : newEvent.unit_value;
    await createEvent({
      ...newEvent,
      unit_value: finalUnitValue,
      group_id: substageId,
    } as any);
    setNewEvent({ group_id: "", item_code: "", description: "", discrimination: "", sinapi_code: "", unit: "UN", quantity: 0, unit_value: 0, mat_unit_value: 0, mo_unit_value: 0 });
    setAddingEventTo(null);
  };

  const handleMapService = async (eventId: string, serviceKey: string) => {
    if (serviceKey === "__none__") {
      await updateEvent(eventId, {
        obramap_macro_id: null, obramap_macro_name: null,
        obramap_scope_id: null, obramap_scope_name: null,
      } as any);
      return;
    }
    const svc = obraMapServices.find(s => `${s.macro_id}::${s.scope_id}` === serviceKey);
    if (!svc) return;
    await updateEvent(eventId, {
      obramap_macro_id: svc.macro_id,
      obramap_macro_name: svc.macro_name,
      obramap_scope_id: svc.scope_id,
      obramap_scope_name: svc.scope_name,
    } as any);
  };

  // Batch mapping
  const unmappedEvents = useMemo(() => events.filter(e => !e.obramap_scope_id), [events]);

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
    setShowBatchMapping(false);
    setBatchMappings({});
  };

  // Sync with contract
  const handleSync = async () => {
    if (!currentProject) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.rpc("sync_contract_from_ple", {
        p_ple_project_id: currentProject.id,
      });
      if (error) { toast.error(error.message); return; }
      const result = data as any;
      if (result?.success) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", currentProject.obramap_project_id!)
          .single();
        setSyncResult({ synced: result.synced_services, projectName: proj?.name || "" });
        toast.success(`${result.synced_services} serviços sincronizados!`);
      } else {
        toast.error(result?.message || "Erro na sincronização");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync summary data
  const syncSummary = useMemo(() => {
    if (!isIntegrated) return [];
    const byScope = new Map<string, { scopeName: string; count: number; totalMat: number; totalMo: number; totalUnit: number }>();
    events.filter(e => e.obramap_scope_id).forEach(e => {
      const key = e.obramap_scope_id!;
      const existing = byScope.get(key) || { scopeName: e.obramap_scope_name || "", count: 0, totalMat: 0, totalMo: 0, totalUnit: 0 };
      existing.count++;
      existing.totalMat += e.quantity * (e.mat_unit_value || 0);
      existing.totalMo += e.quantity * (e.mo_unit_value || 0);
      existing.totalUnit += e.quantity * e.unit_value;
      byScope.set(key, existing);
    });
    return Array.from(byScope.values());
  }, [events, isIntegrated]);

  const handleAIImport = async (
    newGroups: { code: string; name: string; parent_code?: string }[],
    importedEvents: { item_code: string; discrimination: string; sinapi_code: string; description: string; unit: string; quantity: number; unit_value: number; group_code: string; group_name: string; stage_code?: string; stage_name?: string }[]
  ) => {
    const groupIdMap = new Map<string, string>();
    groups.forEach(g => groupIdMap.set(g.code, g.id));
    const stagesFirst = newGroups.filter(g => !g.parent_code);
    const subsAfter = newGroups.filter(g => g.parent_code);
    for (const g of stagesFirst) {
      if (!groupIdMap.has(g.code)) {
        const result = await createGroup({ code: g.code, name: g.name, parent_id: null });
        if (result) { groupIdMap.set(g.code, result.id); setExpandedStages(prev => new Set(prev).add(result.id)); }
      }
    }
    for (const g of subsAfter) {
      if (!groupIdMap.has(g.code)) {
        const parentId = g.parent_code ? groupIdMap.get(g.parent_code) || null : null;
        const result = await createGroup({ code: g.code, name: g.name, parent_id: parentId });
        if (result) { groupIdMap.set(g.code, result.id); setExpandedStages(prev => new Set(prev).add(result.id)); }
      }
    }
    for (const ev of importedEvents) {
      const groupId = groupIdMap.get(ev.group_code) || null;
      await createEvent({
        group_id: groupId, item_code: ev.item_code, description: ev.description,
        discrimination: ev.discrimination, sinapi_code: ev.sinapi_code,
        unit: ev.unit, quantity: ev.quantity, unit_value: ev.unit_value,
      } as any);
    }
    toast.success(`${importedEvents.length} serviços importados com sucesso!`);
  };

  const getSubstageTotal = (substageId: string) => {
    return (eventsByGroup.get(substageId) || []).reduce((s, e) => s + e.quantity * e.unit_value, 0);
  };

  const getStageTotal = (stageId: string) => {
    const substages = substagesByStage.get(stageId) || [];
    return substages.reduce((s, sub) => s + getSubstageTotal(sub.id), 0);
  };

  const ServiceMappingSelect = ({ event }: { event: PleEvent }) => {
    const currentValue = event.obramap_scope_id
      ? `${event.obramap_macro_id}::${event.obramap_scope_id}`
      : "__none__";

    // Group services by macro
    const groupedServices = useMemo(() => {
      const groups = new Map<string, ObraMapService[]>();
      obraMapServices.forEach(s => {
        const arr = groups.get(s.macro_name) || [];
        arr.push(s);
        groups.set(s.macro_name, arr);
      });
      return groups;
    }, []);

    return (
      <Select value={currentValue} onValueChange={(v) => handleMapService(event.id, v)}>
        <SelectTrigger className="h-6 text-[10px] w-[140px] border-dashed">
          <SelectValue placeholder="Vincular..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            <span className="text-muted-foreground">Não vinculado</span>
          </SelectItem>
          {Array.from(groupedServices.entries()).map(([macroName, svcs]) => (
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
    );
  };

  if (!currentProject) return null;

  const totalHouses = currentProject.total_houses || 1;

  return (
    <div className="h-full flex flex-col gap-3 sm:gap-4 overflow-hidden">
      {/* Sync bar for integrated mode */}
      {isIntegrated && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 px-2">
            {stats.mappedCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing}
                className="gap-1.5 text-xs h-7 border-primary/40 text-primary hover:bg-primary/10"
              >
                <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                Sincronizar com Contrato da Obra
              </Button>
            )}
            {unmappedEvents.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowBatchMapping(true)} className="gap-1.5 text-xs h-7">
                <Layers className="h-3 w-3" /> Mapear em lote ({unmappedEvents.length})
              </Button>
            )}
            <Badge variant="outline" className="text-[10px]">
              {stats.mappedCount}/{stats.totalEvents} mapeados
            </Badge>
          </div>

          {/* Sync result summary */}
          {syncResult && (
            <div className="mx-2 p-2 rounded-md bg-green-500/10 border border-green-500/30 text-xs text-green-700 dark:text-green-400">
              ✓ {syncResult.synced} serviços sincronizados com o contrato de <strong>{syncResult.projectName}</strong>
            </div>
          )}

          {/* Sync summary table */}
          {syncSummary.length > 0 && (
            <div className="mx-2 border rounded-md overflow-hidden">
              <div className="grid grid-cols-[1fr_60px_80px_80px_80px] gap-0 bg-muted/50 px-2 py-1 text-[9px] font-bold text-muted-foreground uppercase">
                <span>Serviço</span>
                <span className="text-center">Itens</span>
                <span className="text-right">MAT</span>
                <span className="text-right">MO</span>
                <span className="text-right">Unit./casa</span>
              </div>
              {syncSummary.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_80px_80px] gap-0 px-2 py-1 border-t text-[10px]">
                  <span className="truncate font-medium">{s.scopeName}</span>
                  <span className="text-center text-muted-foreground">{s.count}</span>
                  <span className="text-right font-mono">{fmtCur(s.totalMat)}</span>
                  <span className="text-right font-mono">{fmtCur(s.totalMo)}</span>
                  <span className="text-right font-mono font-semibold">{fmtCur(s.totalUnit / totalHouses)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Budget Spreadsheet */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 sm:mb-3 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-xs sm:text-sm font-bold text-foreground">Planilha Orçamentária</h2>
            <div className="flex gap-1.5">
              <Badge variant="secondary" className="text-[9px] sm:text-[10px]">{stats.totalStages} etapas</Badge>
              <Badge variant="outline" className="text-[9px] sm:text-[10px]">{stats.totalEvents} serviços</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll} className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs h-7">
              <ChevronsUpDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> {allExpanded ? "Recolher" : "Expandir"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAIImport(true)} className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs h-7">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500" /> <span className="hidden sm:inline">Importar via IA</span><span className="sm:hidden">IA</span>
            </Button>
          </div>
        </div>

        {stats.ungroupedCount > 0 && (
          <div className="mb-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
              ⚠️ {stats.ungroupedCount} itens importados sem grupo atribuído — eles aparecem abaixo para edição/exclusão.
            </span>
          </div>
        )}

        <ScrollArea className="flex-1 border rounded-lg">
          <div className="lg:min-w-[950px]">
            {/* Table Header */}
            <div className={`hidden sm:grid gap-0 bg-muted/50 border-b px-2 py-2 sticky top-0 z-10 ${
              isIntegrated
                ? "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_70px_80px_80px_90px_110px_140px_36px]"
                : "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px]"
            }`}>
              <span />
              <span className="text-[10px] font-bold text-muted-foreground uppercase">ITEM</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">DISCRIM.</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">CÓD. SINAPI</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">DESCRIÇÃO SINAPI</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-center">UNID</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">QTDE</span>
              {isIntegrated && (
                <>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase text-center">TIPO</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">MAT UNIT.</span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">MO UNIT.</span>
                </>
              )}
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">UNITÁRIO</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase text-right">TOTAL</span>
              {isIntegrated && (
                <span className="text-[10px] font-bold text-muted-foreground uppercase text-center">SERVIÇO</span>
              )}
              <span />
            </div>

            {/* Mobile Header */}
            <div className="sm:hidden grid grid-cols-[60px_1fr_40px_70px] gap-0 bg-muted/50 border-b px-2 py-1.5 sticky top-0 z-10">
              <span className="text-[9px] font-bold text-muted-foreground uppercase">ITEM</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">DESCRIÇÃO</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase text-center">UN</span>
              <span className="text-[9px] font-bold text-muted-foreground uppercase text-right">TOTAL</span>
            </div>

            {/* ETAPAS */}
            {stages.map(stage => {
              const stageTotal = getStageTotal(stage.id);
              const subs = substagesByStage.get(stage.id) || [];
              const isExpanded = expandedStages.has(stage.id);

              return (
                <div key={stage.id}>
                  <div
                    className="flex items-center gap-1.5 bg-primary/15 border-b border-primary/25 px-2 py-1.5 sm:py-2 cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => toggleStage(stage.id)}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />}
                    <span className="text-[10px] sm:text-xs font-extrabold text-primary shrink-0">{stage.code}</span>
                    <span className="text-[10px] sm:text-xs font-extrabold text-foreground tracking-wide truncate flex-1">{stage.name.toUpperCase()}</span>
                    <span className="text-[10px] sm:text-xs font-extrabold font-mono text-primary shrink-0">{fmtCur(stageTotal)}</span>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={e => { e.stopPropagation(); deleteGroup(stage.id); }}>
                      <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <>
                      {subs.map(sub => {
                        const subEvents = (eventsByGroup.get(sub.id) || []).sort((a, b) => a.display_order - b.display_order);
                        const subTotal = getSubstageTotal(sub.id);
                        const isSubExpanded = expandedStages.has(sub.id);

                        return (
                          <div key={sub.id}>
                            <div
                              className="flex items-center gap-1.5 bg-accent/40 border-b pl-4 sm:pl-6 pr-2 py-1.5 cursor-pointer hover:bg-accent/60 transition-colors"
                              onClick={() => toggleStage(sub.id)}
                            >
                              {isSubExpanded ? <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />}
                              <span className="text-[10px] sm:text-[11px] font-bold text-foreground shrink-0">{sub.code}</span>
                              <span className="text-[10px] sm:text-[11px] font-bold text-foreground truncate flex-1">{sub.name}</span>
                              <span className="text-[9px] sm:text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{subEvents.length} itens</span>
                              <span className="text-[10px] sm:text-[11px] font-bold font-mono shrink-0">{fmtCur(subTotal)}</span>
                              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={e => { e.stopPropagation(); deleteGroup(sub.id); }}>
                                <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                              </Button>
                            </div>

                            {isSubExpanded && (
                              <>
                                {subEvents.map(ev => (
                                  <div key={ev.id}>
                                    {/* Desktop row */}
                                    <div className={`hidden sm:grid gap-0 border-b px-2 py-1.5 hover:bg-accent/20 transition-colors items-center group/row ${
                                      isIntegrated
                                        ? "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_70px_80px_80px_90px_110px_140px_36px]"
                                        : "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px]"
                                    }`}>
                                      <span />
                                      <span className="text-[11px] font-mono text-muted-foreground pl-3">{ev.item_code}</span>
                                      <span className="text-[10px] text-muted-foreground truncate">{ev.discrimination || "—"}</span>
                                      <span className="text-[10px] font-mono text-muted-foreground">{ev.sinapi_code || "—"}</span>
                                      <span className="text-[11px] text-foreground truncate pr-2" title={ev.description}>{ev.description}</span>
                                      <span className="text-[11px] text-center text-muted-foreground">{ev.unit}</span>
                                      <span className="text-[11px] text-right font-mono">{fmt(ev.quantity)}</span>
                                      {isIntegrated && (
                                        <>
                                          <span className="flex justify-center"><BillingTypeBadge ev={ev} /></span>
                                          <InlineNumber value={ev.mat_unit_value || 0} eventId={ev.id} field="mat_unit_value" ev={ev} />
                                          <InlineNumber value={ev.mo_unit_value || 0} eventId={ev.id} field="mo_unit_value" ev={ev} />
                                        </>
                                      )}
                                      <span className="text-[11px] text-right font-mono">{fmtCur(ev.unit_value)}</span>
                                      <span className="text-[11px] text-right font-mono font-semibold">{fmtCur(ev.quantity * ev.unit_value)}</span>
                                      {isIntegrated && (
                                        <span className="flex justify-center">
                                          {ev.obramap_scope_name ? (
                                            <Badge variant="secondary" className="text-[9px] truncate max-w-[130px] cursor-pointer" title={`${ev.obramap_macro_name} > ${ev.obramap_scope_name}`}>
                                              <Link2 className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                                              {ev.obramap_scope_name}
                                            </Badge>
                                          ) : (
                                            <ServiceMappingSelect event={ev} />
                                          )}
                                        </span>
                                      )}
                                      <span className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteEvent(ev.id)}>
                                          <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                                        </Button>
                                      </span>
                                    </div>
                                    {/* Mobile row */}
                                    <div className="sm:hidden grid grid-cols-[60px_1fr_40px_70px] gap-0 border-b px-2 py-1.5 hover:bg-accent/20 items-center">
                                      <span className="text-[10px] font-mono text-muted-foreground">{ev.item_code}</span>
                                      <span className="text-[10px] text-foreground truncate pr-1" title={ev.description}>{ev.description}</span>
                                      <span className="text-[10px] text-center text-muted-foreground">{ev.unit}</span>
                                      <span className="text-[10px] text-right font-mono font-semibold">{fmtCur(ev.quantity * ev.unit_value)}</span>
                                    </div>
                                  </div>
                                ))}

                                {/* Add service */}
                                {addingEventTo === sub.id ? (
                                  <div className="border-b px-2 py-1.5 bg-accent/10 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <Input value={newEvent.item_code} onChange={e => setNewEvent(ev => ({ ...ev, item_code: e.target.value }))} placeholder="Item" className="h-7 text-[11px] border-dashed w-16" />
                                      <Input value={newEvent.description} onChange={e => setNewEvent(ev => ({ ...ev, description: e.target.value }))} placeholder="Descrição" className="h-7 text-[11px] border-dashed flex-1" />
                                      <Input value={newEvent.unit} onChange={e => setNewEvent(ev => ({ ...ev, unit: e.target.value }))} className="h-7 text-[11px] border-dashed w-12 text-center" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Input value={newEvent.sinapi_code} onChange={e => setNewEvent(ev => ({ ...ev, sinapi_code: e.target.value }))} placeholder="Cód. SINAPI" className="h-7 text-[11px] border-dashed w-24 hidden sm:block" />
                                      <Input value={newEvent.discrimination} onChange={e => setNewEvent(ev => ({ ...ev, discrimination: e.target.value }))} placeholder="Discrim." className="h-7 text-[11px] border-dashed w-24 hidden sm:block" />
                                      <Input type="number" value={newEvent.quantity || ""} onChange={e => setNewEvent(ev => ({ ...ev, quantity: parseFloat(e.target.value) || 0 }))} placeholder="Qtde" className="h-7 text-[11px] border-dashed w-16 text-right" />
                                      {isIntegrated && (
                                        <>
                                          <Input type="number" step="0.01" value={newEvent.mat_unit_value || ""} onChange={e => {
                                            const mat = parseFloat(e.target.value) || 0;
                                            setNewEvent(ev => ({ ...ev, mat_unit_value: mat, unit_value: mat + ev.mo_unit_value }));
                                          }} placeholder="MAT" className="h-7 text-[11px] border-dashed w-16 text-right" />
                                          <Input type="number" step="0.01" value={newEvent.mo_unit_value || ""} onChange={e => {
                                            const mo = parseFloat(e.target.value) || 0;
                                            setNewEvent(ev => ({ ...ev, mo_unit_value: mo, unit_value: ev.mat_unit_value + mo }));
                                          }} placeholder="MO" className="h-7 text-[11px] border-dashed w-16 text-right" />
                                        </>
                                      )}
                                      <Input type="number" step="0.01" value={newEvent.unit_value || ""} onChange={e => {
                                        const val = parseFloat(e.target.value) || 0;
                                        if (isIntegrated) {
                                          setNewEvent(ev => ({ ...ev, unit_value: val, mat_unit_value: 0, mo_unit_value: 0 }));
                                        } else {
                                          setNewEvent(ev => ({ ...ev, unit_value: val }));
                                        }
                                      }} placeholder="Unit." className="h-7 text-[11px] border-dashed w-20 text-right" />
                                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{fmtCur(newEvent.quantity * newEvent.unit_value)}</span>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleAddEvent(sub.id)}><Check className="h-3 w-3 text-green-500" /></Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setAddingEventTo(null)}><X className="h-3 w-3 text-muted-foreground" /></Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="border-b px-2 py-1">
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1 ml-4 sm:ml-10" onClick={() => setAddingEventTo(sub.id)}>
                                      <Plus className="h-3 w-3" /> Adicionar serviço
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}

                      {/* Add substage */}
                      {addingSubstageTo === stage.id ? (
                        <div className="px-2 py-1.5 border-b bg-accent/10 flex items-center gap-1.5 pl-6 sm:pl-10">
                          <Input value={newSubstage.code} onChange={e => setNewSubstage(s => ({ ...s, code: e.target.value }))} placeholder="Ex: 1.1" className="h-7 text-xs w-16 sm:w-20 border-dashed" />
                          <Input value={newSubstage.name} onChange={e => setNewSubstage(s => ({ ...s, name: e.target.value }))} placeholder="Nome da subetapa" className="h-7 text-xs flex-1 border-dashed" />
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleAddSubstage(stage.id)}><Check className="h-3 w-3 text-green-500" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddingSubstageTo(null)}><X className="h-3 w-3 text-muted-foreground" /></Button>
                        </div>
                      ) : (
                        <div className="border-b px-2 py-1">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-primary gap-1 ml-4 sm:ml-6" onClick={() => setAddingSubstageTo(stage.id)}>
                            <Plus className="h-3 w-3" /> Adicionar subetapa
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* UNGROUPED EVENTS */}
            {ungroupedEvents.length > 0 && (
              <div>
                <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/30 px-2 py-2">
                  <span className="text-[10px] sm:text-xs font-extrabold text-amber-600 dark:text-amber-400">ITENS SEM GRUPO ({ungroupedEvents.length})</span>
                  <span className="ml-auto text-[10px] sm:text-xs font-extrabold font-mono text-amber-600 dark:text-amber-400">
                    {fmtCur(ungroupedEvents.reduce((s, e) => s + e.quantity * e.unit_value, 0))}
                  </span>
                </div>
                {ungroupedEvents.map(ev => (
                  <div key={ev.id}>
                    <div className={`hidden sm:grid gap-0 border-b px-2 py-1.5 hover:bg-accent/20 transition-colors items-center group/row ${
                      isIntegrated
                        ? "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_70px_80px_80px_90px_110px_140px_36px]"
                        : "grid-cols-[36px_70px_90px_80px_1fr_50px_70px_90px_110px_36px]"
                    }`}>
                      <span />
                      <span className="text-[11px] font-mono text-muted-foreground pl-3">{ev.item_code}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{ev.discrimination || "—"}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{ev.sinapi_code || "—"}</span>
                      <span className="text-[11px] text-foreground truncate pr-2" title={ev.description}>{ev.description}</span>
                      <span className="text-[11px] text-center text-muted-foreground">{ev.unit}</span>
                      <span className="text-[11px] text-right font-mono">{fmt(ev.quantity)}</span>
                      {isIntegrated && (
                        <>
                          <span className="flex justify-center"><BillingTypeBadge ev={ev} /></span>
                          <InlineNumber value={ev.mat_unit_value || 0} eventId={ev.id} field="mat_unit_value" ev={ev} />
                          <InlineNumber value={ev.mo_unit_value || 0} eventId={ev.id} field="mo_unit_value" ev={ev} />
                        </>
                      )}
                      <span className="text-[11px] text-right font-mono">{fmtCur(ev.unit_value)}</span>
                      <span className="text-[11px] text-right font-mono font-semibold">{fmtCur(ev.quantity * ev.unit_value)}</span>
                      {isIntegrated && (
                        <span className="flex justify-center">
                          <ServiceMappingSelect event={ev} />
                        </span>
                      )}
                      <span className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteEvent(ev.id)}>
                          <Trash2 className="h-3 w-3 text-destructive/60 hover:text-destructive" />
                        </Button>
                      </span>
                    </div>
                    <div className="sm:hidden grid grid-cols-[60px_1fr_40px_70px] gap-0 border-b px-2 py-1.5 hover:bg-accent/20 items-center">
                      <span className="text-[10px] font-mono text-muted-foreground">{ev.item_code}</span>
                      <span className="text-[10px] text-foreground truncate pr-1">{ev.description}</span>
                      <span className="text-[10px] text-center text-muted-foreground">{ev.unit}</span>
                      <span className="text-[10px] text-right font-mono font-semibold">{fmtCur(ev.quantity * ev.unit_value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add new stage */}
            <div className="px-2 py-2 border-b bg-muted/20">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Input value={newStage.code} onChange={e => setNewStage(s => ({ ...s, code: e.target.value }))} placeholder="Ex: 3.0" className="h-7 text-xs w-16 sm:w-20 border-dashed" />
                <Input value={newStage.name} onChange={e => setNewStage(s => ({ ...s, name: e.target.value }))} placeholder="Nome da nova etapa" className="h-7 text-xs flex-1 border-dashed" />
                <Button size="sm" variant="outline" onClick={handleAddStage} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Etapa
                </Button>
              </div>
            </div>

            {/* Grand Total */}
            <div className="flex items-center justify-between bg-muted/50 px-2 py-2 sm:py-2.5 sticky bottom-0 border-t-2 border-primary/30">
              <span className="text-[10px] sm:text-xs font-bold text-foreground uppercase">TOTAL GERAL</span>
              <span className="text-xs sm:text-sm font-bold font-mono text-primary">{fmtCur(stats.totalContractual)}</span>
            </div>
          </div>
        </ScrollArea>
      </div>

      {showAIImport && (
        <PleImportAIDialog
          open={showAIImport}
          onClose={() => setShowAIImport(false)}
          existingGroups={groups}
          onImport={handleAIImport}
        />
      )}

      {/* Batch Mapping Dialog */}
      <Dialog open={showBatchMapping} onOpenChange={setShowBatchMapping}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Mapear Itens em Lote
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 p-1">
              {unmappedEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono text-primary">{ev.item_code}</span>
                    <span className="text-[11px] text-foreground ml-2 truncate">{ev.description}</span>
                  </div>
                  <Select
                    value={batchMappings[ev.id] || ""}
                    onValueChange={v => setBatchMappings(prev => ({ ...prev, [ev.id]: v }))}
                  >
                    <SelectTrigger className="h-7 text-[10px] w-[180px]">
                      <SelectValue placeholder="Selecionar serviço..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        obraMapServices.reduce((groups, s) => {
                          const arr = groups.get(s.macro_name) || [];
                          arr.push(s);
                          groups.set(s.macro_name, arr);
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
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowBatchMapping(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleBatchMap} disabled={Object.values(batchMappings).filter(Boolean).length === 0}>
              Mapear {Object.values(batchMappings).filter(Boolean).length} itens
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
