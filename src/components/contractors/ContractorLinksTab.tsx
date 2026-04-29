import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Link2, AlertTriangle, Users, Building2, Filter, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import type { ContractorContract, Contractor } from "@/hooks/useContractors";

const NONE = "none";

interface Props {
  contractors: Contractor[];
  contracts: ContractorContract[];
  onRefresh?: () => void;
}

interface DiaryItemRow {
  id: string;
  diary_entry_id: string;
  entry_date: string;
  scope_id: string;
  scope_name: string;
  macro_name: string;
  house_ids: number[] | null;
  houses_count: number | null;
  percentual_executado: number | null;
  contractor_contract_id: string | null;
  workers_count: number;
}

interface DiaryWorkerRow {
  id: string;
  worker_name: string;
  profession: string;
  hours_worked: number;
  cost_per_hour: number | null;
  contractor_contract_id: string | null;
  diary_entry_id: string;
  entry_date: string;
}

function firstOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function lastOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function ContractorLinksTab({ contractors, contracts, onRefresh }: Props) {
  const { currentProject } = useConstruction();
  const projectId = currentProject?.id;

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(lastOfMonth());
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [houseFilter, setHouseFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<DiaryItemRow[]>([]);
  const [workers, setWorkers] = useState<DiaryWorkerRow[]>([]);
  const [tab, setTab] = useState("services");

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [bulkContract, setBulkContract] = useState<string>(NONE);
  const [saving, setSaving] = useState(false);

  const contractorById = useMemo(() => {
    const map = new Map(contractors.map((c) => [c.id, c]));
    return map;
  }, [contractors]);

  const contractsForProject = useMemo(
    () => contracts.filter((c) => c.project_id === projectId),
    [contracts, projectId]
  );

  const contractLabel = (id: string | null) => {
    if (!id) return "—";
    const c = contractsForProject.find((x) => x.id === id);
    if (!c) return "Contrato removido";
    const name = contractorById.get(c.contractor_id)?.name || "?";
    return `${name}${c.contract_number ? ` (${c.contract_number})` : ""}`;
  };

  const houseOptions = useMemo(() => {
    const set = new Set<number>();
    items.forEach((i) => (i.house_ids || []).forEach((h) => set.add(h)));
    return Array.from(set).sort((a, b) => a - b);
  }, [items]);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // 1) Diary items no período
      const { data: entries, error: e1 } = await (supabase as any)
        .from("diary_entries")
        .select("id, entry_date")
        .eq("project_id", projectId)
        .gte("entry_date", from)
        .lte("entry_date", to);
      if (e1) throw e1;
      const entryMap = new Map<string, string>((entries || []).map((e: any) => [e.id, e.entry_date]));
      const entryIds = Array.from(entryMap.keys());

      if (entryIds.length === 0) {
        setItems([]); setWorkers([]); setLoading(false); return;
      }

      const { data: rawItems, error: e2 } = await (supabase as any)
        .from("diary_items")
        .select("id, diary_entry_id, scope_id, scope_name, macro_name, house_ids, houses_count, percentual_executado, contractor_contract_id")
        .in("diary_entry_id", entryIds)
        .is("deleted_at", null);
      if (e2) throw e2;

      const itemIds = (rawItems || []).map((i: any) => i.id);
      const { data: links } = itemIds.length
        ? await (supabase as any)
            .from("diary_item_workers")
            .select("diary_item_id, diary_worker_id")
            .in("diary_item_id", itemIds)
        : { data: [] };
      const linkCount = new Map<string, number>();
      (links || []).forEach((l: any) =>
        linkCount.set(l.diary_item_id, (linkCount.get(l.diary_item_id) || 0) + 1)
      );

      const mappedItems: DiaryItemRow[] = (rawItems || []).map((i: any) => ({
        id: i.id,
        diary_entry_id: i.diary_entry_id,
        entry_date: entryMap.get(i.diary_entry_id) || "",
        scope_id: i.scope_id,
        scope_name: i.scope_name,
        macro_name: i.macro_name,
        house_ids: i.house_ids,
        houses_count: i.houses_count,
        percentual_executado: i.percentual_executado,
        contractor_contract_id: i.contractor_contract_id,
        workers_count: linkCount.get(i.id) || 0,
      }));
      mappedItems.sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      setItems(mappedItems);

      // 2) Diary workers no período
      const { data: rawWorkers, error: e3 } = await (supabase as any)
        .from("diary_workers")
        .select("id, worker_name, profession, hours_worked, cost_per_hour, contractor_contract_id, diary_entry_id")
        .in("diary_entry_id", entryIds);
      if (e3) throw e3;
      const mappedWorkers: DiaryWorkerRow[] = (rawWorkers || []).map((w: any) => ({
        ...w,
        entry_date: entryMap.get(w.diary_entry_id) || "",
      }));
      mappedWorkers.sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      setWorkers(mappedWorkers);

      setSelectedItems(new Set());
      setSelectedWorkers(new Set());
    } catch (err: any) {
      console.error("[ContractorLinksTab]", err);
      toast.error("Erro ao carregar vínculos: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [projectId, from, to]);

  // Filtros aplicados em memória
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (contractFilter === "orphans" && i.contractor_contract_id) return false;
      if (contractFilter !== "all" && contractFilter !== "orphans" && i.contractor_contract_id !== contractFilter) return false;
      if (houseFilter !== "all") {
        const h = Number(houseFilter);
        if (!(i.house_ids || []).includes(h)) return false;
      }
      return true;
    });
  }, [items, contractFilter, houseFilter]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (contractFilter === "orphans" && w.contractor_contract_id) return false;
      if (contractFilter !== "all" && contractFilter !== "orphans" && w.contractor_contract_id !== contractFilter) return false;
      return true;
    });
  }, [workers, contractFilter]);

  const orphanCount = items.filter((i) => !i.contractor_contract_id).length;

  // Resumo por contrato
  const summary = useMemo(() => {
    const map = new Map<string, { contract_id: string; itens: number; trabalhadores: number; horas: number; custo: number }>();
    contractsForProject.forEach((c) => map.set(c.id, { contract_id: c.id, itens: 0, trabalhadores: 0, horas: 0, custo: 0 }));
    items.forEach((i) => {
      if (i.contractor_contract_id && map.has(i.contractor_contract_id)) {
        map.get(i.contractor_contract_id)!.itens += 1;
      }
    });
    workers.forEach((w) => {
      if (w.contractor_contract_id && map.has(w.contractor_contract_id)) {
        const s = map.get(w.contractor_contract_id)!;
        s.trabalhadores += 1;
        s.horas += Number(w.hours_worked || 0);
        s.custo += Number(w.hours_worked || 0) * Number(w.cost_per_hour || 0);
      }
    });
    return Array.from(map.values()).filter((s) => s.itens > 0 || s.trabalhadores > 0);
  }, [items, workers, contractsForProject]);

  // Mutations
  const reassignItems = async (newContractId: string | null) => {
    if (selectedItems.size === 0) { toast.info("Selecione ao menos 1 lançamento."); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("diary_items")
        .update({ contractor_contract_id: newContractId })
        .in("id", Array.from(selectedItems));
      if (error) throw error;
      toast.success(`${selectedItems.size} lançamento(s) atualizado(s).`);
      await load();
      onRefresh?.();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const reassignWorkers = async (newContractId: string | null) => {
    if (selectedWorkers.size === 0) { toast.info("Selecione ao menos 1 trabalhador."); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("diary_workers")
        .update({ contractor_contract_id: newContractId })
        .in("id", Array.from(selectedWorkers));
      if (error) throw error;
      toast.success(`${selectedWorkers.size} trabalhador(es) atualizado(s).`);
      await load();
      onRefresh?.();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleBulkApply = async () => {
    const target = bulkContract === NONE ? null : bulkContract;
    if (tab === "services") await reassignItems(target);
    else if (tab === "workers") await reassignWorkers(target);
  };

  const toggleAllItems = (checked: boolean) => {
    setSelectedItems(checked ? new Set(filteredItems.map((i) => i.id)) : new Set());
  };
  const toggleAllWorkers = (checked: boolean) => {
    setSelectedWorkers(checked ? new Set(filteredWorkers.map((w) => w.id)) : new Set());
  };

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <Card className="table-card">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filtros
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs w-[140px]" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Contrato</Label>
              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="h-8 text-xs w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="orphans">⚠ Sem contrato (órfãos)</SelectItem>
                  {contractsForProject.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{contractLabel(c.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Casa</Label>
              <Select value={houseFilter} onValueChange={setHouseFilter}>
                <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {houseOptions.map((h) => (
                    <SelectItem key={h} value={String(h)}>Casa {h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs / resumo por contrato */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="table-card">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Lançamentos</div>
            <div className="text-2xl font-bold">{items.length}</div>
            <div className="text-[11px] text-muted-foreground">no período</div>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Trabalhadores</div>
            <div className="text-2xl font-bold">{workers.length}</div>
            <div className="text-[11px] text-muted-foreground">apontamentos</div>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Sem contrato</div>
            <div className={`text-2xl font-bold ${orphanCount > 0 ? "text-amber-600" : ""}`}>{orphanCount}</div>
            <div className="text-[11px] text-muted-foreground">serviços órfãos</div>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Contratos com atividade</div>
            <div className="text-2xl font-bold">{summary.length}</div>
            <div className="text-[11px] text-muted-foreground">de {contractsForProject.length}</div>
          </CardContent>
        </Card>
      </div>

      {summary.length > 0 && (
        <Card className="table-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Resumo por contrato</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-48">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Contrato</TableHead>
                    <TableHead className="text-xs text-right">Itens RDO</TableHead>
                    <TableHead className="text-xs text-right">Trabalhadores</TableHead>
                    <TableHead className="text-xs text-right">Horas</TableHead>
                    <TableHead className="text-xs text-right">Custo MO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((s) => (
                    <TableRow key={s.contract_id}>
                      <TableCell className="text-xs cell-truncate">{contractLabel(s.contract_id)}</TableCell>
                      <TableCell className="text-xs text-right">{s.itens}</TableCell>
                      <TableCell className="text-xs text-right">{s.trabalhadores}</TableCell>
                      <TableCell className="text-xs text-right">{s.horas.toFixed(1)}h</TableCell>
                      <TableCell className="text-xs text-right">
                        {s.custo > 0 ? `R$ ${s.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Ações em massa */}
      <Card className="table-card border-dashed">
        <CardContent className="p-3 flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Link2 className="h-3.5 w-3.5" /> Ações em massa
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Reatribuir para</Label>
            <Select value={bulkContract} onValueChange={setBulkContract}>
              <SelectTrigger className="h-8 text-xs w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— Mão de obra própria (remover vínculo)</SelectItem>
                {contractsForProject.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{contractLabel(c.id)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleBulkApply} disabled={saving} size="sm" className="h-8">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Aplicar a {tab === "services" ? selectedItems.size : selectedWorkers.size} selecionado(s)
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Aplica na aba ativa ({tab === "services" ? "Serviços" : "Trabalhadores"})
          </span>
        </CardContent>
      </Card>

      {/* Listagens */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="services" className="gap-1.5 text-xs px-3 h-7">
            <Link2 className="h-3.5 w-3.5" /> Serviços ({filteredItems.length})
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-1.5 text-xs px-3 h-7">
            <Users className="h-3.5 w-3.5" /> Trabalhadores ({filteredWorkers.length})
          </TabsTrigger>
          <TabsTrigger value="orphans" className="gap-1.5 text-xs px-3 h-7" onClick={() => setContractFilter("orphans")}>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Órfãos ({orphanCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="mt-3">
          <Card className="table-card">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[55vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={filteredItems.length > 0 && selectedItems.size === filteredItems.length}
                          onCheckedChange={(c) => toggleAllItems(!!c)}
                        />
                      </TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Macro / Serviço</TableHead>
                      <TableHead className="text-xs">Casas</TableHead>
                      <TableHead className="text-xs text-right">%</TableHead>
                      <TableHead className="text-xs">Equipe vinculada</TableHead>
                      <TableHead className="text-xs">Contrato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sem lançamentos no filtro.</TableCell></TableRow>
                    ) : filteredItems.map((i) => {
                      const checked = selectedItems.has(i.id);
                      const orphan = !i.contractor_contract_id;
                      return (
                        <TableRow key={i.id} className={orphan ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                          <TableCell>
                            <Checkbox checked={checked} onCheckedChange={(c) => {
                              const next = new Set(selectedItems);
                              if (c) next.add(i.id); else next.delete(i.id);
                              setSelectedItems(next);
                            }} />
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{i.entry_date.split("-").reverse().join("/")}</TableCell>
                          <TableCell className="text-xs cell-truncate max-w-[260px]">
                            <div className="font-medium truncate">{i.scope_name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{i.macro_name}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {(i.houses_count ?? (i.house_ids || []).length) || 0}{" "}
                            <span className="text-muted-foreground">[{(i.house_ids || []).slice(0, 4).join(", ")}{(i.house_ids || []).length > 4 ? "…" : ""}]</span>
                          </TableCell>
                          <TableCell className="text-xs text-right">{i.percentual_executado != null ? `${Number(i.percentual_executado).toFixed(0)}%` : "—"}</TableCell>
                          <TableCell className="text-xs">
                            {i.workers_count > 0 ? <Badge variant="secondary" className="text-[10px]">{i.workers_count}</Badge> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {orphan ? (
                              <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Sem contrato
                              </Badge>
                            ) : (
                              <span className="truncate">{contractLabel(i.contractor_contract_id)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers" className="mt-3">
          <Card className="table-card">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[55vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={filteredWorkers.length > 0 && selectedWorkers.size === filteredWorkers.length}
                          onCheckedChange={(c) => toggleAllWorkers(!!c)}
                        />
                      </TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Trabalhador</TableHead>
                      <TableHead className="text-xs">Função</TableHead>
                      <TableHead className="text-xs text-right">Horas</TableHead>
                      <TableHead className="text-xs text-right">R$/h</TableHead>
                      <TableHead className="text-xs">Contrato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkers.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sem trabalhadores no filtro.</TableCell></TableRow>
                    ) : filteredWorkers.map((w) => {
                      const checked = selectedWorkers.has(w.id);
                      const orphan = !w.contractor_contract_id;
                      return (
                        <TableRow key={w.id} className={orphan ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                          <TableCell>
                            <Checkbox checked={checked} onCheckedChange={(c) => {
                              const next = new Set(selectedWorkers);
                              if (c) next.add(w.id); else next.delete(w.id);
                              setSelectedWorkers(next);
                            }} />
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{w.entry_date.split("-").reverse().join("/")}</TableCell>
                          <TableCell className="text-xs font-medium cell-truncate max-w-[180px]">{w.worker_name}</TableCell>
                          <TableCell className="text-xs cell-truncate max-w-[140px]">{w.profession}</TableCell>
                          <TableCell className="text-xs text-right">{Number(w.hours_worked).toFixed(1)}h</TableCell>
                          <TableCell className="text-xs text-right">{w.cost_per_hour != null ? `R$ ${Number(w.cost_per_hour).toFixed(2)}` : "—"}</TableCell>
                          <TableCell className="text-xs">
                            {orphan ? (
                              <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 dark:text-amber-400">
                                Mão própria / sem contrato
                              </Badge>
                            ) : (
                              <span className="truncate">{contractLabel(w.contractor_contract_id)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orphans" className="mt-3">
          <Card className="table-card border-amber-300/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Serviços sem contrato vinculado
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground mb-2">
                Selecione os itens abaixo e use a barra de "Ações em massa" para vincular ao contrato correto, ou marque
                como mão de obra própria definitivamente.
              </p>
              <ScrollArea className="max-h-[50vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={(() => {
                            const orphs = items.filter((i) => !i.contractor_contract_id);
                            return orphs.length > 0 && orphs.every((i) => selectedItems.has(i.id));
                          })()}
                          onCheckedChange={(c) => {
                            const orphs = items.filter((i) => !i.contractor_contract_id);
                            const next = new Set(selectedItems);
                            if (c) orphs.forEach((i) => next.add(i.id));
                            else orphs.forEach((i) => next.delete(i.id));
                            setSelectedItems(next);
                            setTab("services");
                          }}
                        />
                      </TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Serviço</TableHead>
                      <TableHead className="text-xs">Casas</TableHead>
                      <TableHead className="text-xs">Equipe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.filter((i) => !i.contractor_contract_id).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                          🎉 Nenhum serviço órfão no período.
                        </TableCell>
                      </TableRow>
                    ) : items.filter((i) => !i.contractor_contract_id).map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.has(i.id)}
                            onCheckedChange={(c) => {
                              const next = new Set(selectedItems);
                              if (c) next.add(i.id); else next.delete(i.id);
                              setSelectedItems(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{i.entry_date.split("-").reverse().join("/")}</TableCell>
                        <TableCell className="text-xs cell-truncate max-w-[260px]">
                          <div className="font-medium truncate">{i.scope_name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{i.macro_name}</div>
                        </TableCell>
                        <TableCell className="text-xs">{(i.houses_count ?? (i.house_ids || []).length) || 0}</TableCell>
                        <TableCell className="text-xs">{i.workers_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
