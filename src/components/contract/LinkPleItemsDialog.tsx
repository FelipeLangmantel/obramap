import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Link2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PleEventLite {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_value: number;
  billing_type: string;
  group_id: string | null;
  obramap_macro_id: string | null;
  obramap_scope_id: string | null;
}

interface PleGroupLite {
  id: string;
  code: string;
  name: string;
  parent_id: string | null;
  display_order: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;          // obramap project_id
  totalHouses: number;
  macroId: string;
  macroName: string;
  scopeId: string;
  scopeName: string;
  onConfirm: (totalRevenue: number, linkedCount: number) => void;
}

export function LinkPleItemsDialog({
  open, onClose, projectId, totalHouses,
  macroId, macroName, scopeId, scopeName, onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pleProjectId, setPleProjectId] = useState<string | null>(null);
  const [groups, setGroups] = useState<PleGroupLite[]>([]);
  const [events, setEvents] = useState<PleEventLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    (async () => {
      try {
        // Find PLE project linked to this obramap project
        const { data: pleProj } = await supabase
          .from("ple_projects")
          .select("id")
          .eq("obramap_project_id", projectId)
          .maybeSingle();

        if (!pleProj) {
          toast.error("Nenhum projeto PLE vinculado a esta obra");
          setLoading(false);
          return;
        }
        setPleProjectId(pleProj.id);

        const [gRes, eRes] = await Promise.all([
          supabase.from("ple_event_groups").select("*").eq("ple_project_id", pleProj.id).order("display_order"),
          supabase.from("ple_events").select("*").eq("ple_project_id", pleProj.id).order("display_order"),
        ]);

        if (gRes.data) {
          setGroups(gRes.data as any);
          setExpanded(new Set(gRes.data.map((g: any) => g.id)));
        }
        if (eRes.data) {
          const evs = eRes.data as any as PleEventLite[];
          setEvents(evs);
          // Pré-selecionar itens já vinculados a este serviço
          const preSelected = new Set(
            evs.filter(e => e.obramap_macro_id === macroId && e.obramap_scope_id === scopeId).map(e => e.id)
          );
          setSelected(preSelected);
        }
      } catch (err: any) {
        toast.error("Erro ao carregar itens PLE: " + (err.message || ""));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, projectId, macroId, scopeId]);

  const stages = useMemo(() => groups.filter(g => !g.parent_id), [groups]);
  const substagesByStage = useMemo(() => {
    const m = new Map<string, PleGroupLite[]>();
    groups.filter(g => g.parent_id).forEach(g => {
      const arr = m.get(g.parent_id!) || [];
      arr.push(g);
      m.set(g.parent_id!, arr);
    });
    return m;
  }, [groups]);
  const eventsByGroup = useMemo(() => {
    const m = new Map<string, PleEventLite[]>();
    events.forEach(e => {
      const k = e.group_id || "__none__";
      const arr = m.get(k) || [];
      arr.push(e);
      m.set(k, arr);
    });
    return m;
  }, [events]);

  const matchesSearch = (e: PleEventLite) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return e.description.toLowerCase().includes(q) || e.item_code.toLowerCase().includes(q);
  };

  const toggleEvent = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleGroup = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAllInSubstage = (substageId: string) => {
    const ids = (eventsByGroup.get(substageId) || []).filter(matchesSearch).map(e => e.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };

  // Total a vincular: soma dos selecionados.
  // - per_house: quantidade × unit_value × total_houses
  // - fixed: quantidade × unit_value
  const totalRevenue = useMemo(() => {
    let total = 0;
    events.forEach(e => {
      if (!selected.has(e.id)) return;
      const lineTotal = e.quantity * e.unit_value;
      total += e.billing_type === "fixed" ? lineTotal : lineTotal * (totalHouses || 1);
    });
    return total;
  }, [events, selected, totalHouses]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleConfirm = async () => {
    if (!pleProjectId) return;
    setSaving(true);
    try {
      // 1) Desvincular tudo que estava vinculado a este serviço mas não está mais selecionado
      const previouslyLinked = events.filter(
        e => e.obramap_macro_id === macroId && e.obramap_scope_id === scopeId
      );
      const toUnlink = previouslyLinked.filter(e => !selected.has(e.id)).map(e => e.id);
      if (toUnlink.length > 0) {
        await supabase
          .from("ple_events")
          .update({
            obramap_macro_id: null, obramap_macro_name: null,
            obramap_scope_id: null, obramap_scope_name: null,
          } as any)
          .in("id", toUnlink);
      }
      // 2) Vincular os novos selecionados
      const toLink = Array.from(selected).filter(
        id => !previouslyLinked.find(p => p.id === id)
      );
      if (toLink.length > 0) {
        await supabase
          .from("ple_events")
          .update({
            obramap_macro_id: macroId, obramap_macro_name: macroName,
            obramap_scope_id: scopeId, obramap_scope_name: scopeName,
          } as any)
          .in("id", toLink);
      }
      onConfirm(totalRevenue, selected.size);
      toast.success(`${selected.size} itens PLE vinculados ao serviço`);
      onClose();
    } catch (err: any) {
      toast.error("Erro ao salvar vínculos: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Vincular itens da PLE ao serviço
          </DialogTitle>
          <div className="text-xs text-muted-foreground mt-1">
            <span className="font-semibold text-foreground">{macroName}</span> →{" "}
            <span className="font-semibold text-foreground">{scopeName}</span>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 px-6 py-2 border-b flex-shrink-0">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Badge variant="secondary" className="text-xs">
            {selected.size} selecionados
          </Badge>
          <Badge className="text-xs bg-primary/15 text-primary border-primary/30">
            Total: {fmt(totalRevenue)}
          </Badge>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-6 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhum item cadastrado na PLE deste projeto.
            </div>
          ) : (
            <div className="space-y-1 pb-2 min-w-[1150px]">
              {stages.map(stage => {
                const isExp = expanded.has(stage.id);
                const subs = substagesByStage.get(stage.id) || [];
                return (
                  <div key={stage.id} className="border border-border rounded-md overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 bg-primary/10 cursor-pointer hover:bg-primary/15"
                      onClick={() => toggleGroup(stage.id)}
                    >
                      {isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="font-bold text-xs text-primary">{stage.code}</span>
                      <span className="text-xs font-bold uppercase">{stage.name}</span>
                    </div>
                    {isExp && subs.map(sub => {
                      const subItems = (eventsByGroup.get(sub.id) || []).filter(matchesSearch);
                      const allSel = subItems.length > 0 && subItems.every(e => selected.has(e.id));
                      const someSel = subItems.some(e => selected.has(e.id));
                      return (
                        <div key={sub.id}>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/50 border-t">
                            <Checkbox
                              checked={allSel ? true : (someSel ? "indeterminate" : false)}
                              onCheckedChange={() => toggleSelectAllInSubstage(sub.id)}
                            />
                            <span className="text-[11px] font-bold">{sub.code}</span>
                            <span className="text-[11px] font-medium">{sub.name}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground">{subItems.length} itens</span>
                          </div>
                          {subItems.map(e => {
                            const isLinkedElsewhere = e.obramap_scope_id && e.obramap_scope_id !== scopeId;
                            const lineTotal = e.quantity * e.unit_value;
                            const valueShown = e.billing_type === "fixed" ? lineTotal : lineTotal * (totalHouses || 1);
                            return (
                              <div
                                key={e.id}
                                className={`flex items-center gap-2 min-w-[1150px] px-6 py-1.5 border-t hover:bg-muted/30 cursor-pointer ${selected.has(e.id) ? "bg-primary/5" : ""}`}
                                onClick={() => toggleEvent(e.id)}
                              >
                                <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleEvent(e.id)} />
                                <span className="text-[10px] font-mono w-14 flex-shrink-0 text-muted-foreground">{e.item_code}</span>
                                <span className="text-[11px] flex-1 min-w-0 truncate" title={e.description}>{e.description}</span>
                                {isLinkedElsewhere && (
                                  <Badge variant="outline" className="max-w-48 flex-shrink-0 truncate text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                                    Já vinculado
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground w-8 flex-shrink-0 text-right">{e.unit}</span>
                                <span className="text-[10px] font-mono w-16 flex-shrink-0 text-right">{e.quantity.toFixed(2)}</span>
                                <span className="text-[10px] font-mono w-24 flex-shrink-0 text-right">{fmt(e.unit_value)}</span>
                                <span className="text-[10px] font-mono w-28 flex-shrink-0 text-right font-semibold text-primary">{fmt(valueShown)}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-3 flex-shrink-0">
          <div className="text-xs text-muted-foreground mr-auto">
            {totalHouses} casas · O valor "por casa" multiplica pelo nº de casas; "fixo" usa o total do item.
          </div>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            Aplicar e atualizar Preço Contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
