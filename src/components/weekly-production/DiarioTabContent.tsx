import React, { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, BookOpen, ChevronLeft, ChevronRight, History, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface EntryRow {
  id: string;
  entry_date: string;
  engineer_name: string;
  clima: string | null;
  equipe_presente: number | null;
  status: string;
}
interface ItemRow {
  id: string;
  diary_entry_id: string;
  macro_id: string;
  macro_name: string;
  scope_id: string;
  scope_name: string;
  house_ids: number[];
  percentual_executado: number;
  production_id: string | null;
}

interface ConsolidadoRow {
  macroId: string;
  scopeId: string;
  macro: string;
  scope: string;
  casasCount: number;
  pctMedio: number;
  casasList: number[];
  itensIndividuais: {
    id: string;
    diary_entry_id: string;
    house_ids: number[];
    percentual_executado: number;
    production_id: string | null;
  }[];
}

interface CorrecaoRow {
  id: string;
  tipo: string;
  macro_name: string;
  scope_name: string;
  house_ids_anterior: number[];
  house_ids_posterior: number[] | null;
  percentual_anterior: number;
  percentual_posterior: number | null;
  justificativa: string;
  corrigido_por_nome: string;
  created_at: string;
}

const CLIMA_LABEL: Record<string, string> = {
  sol: "☀️ Sol", nublado: "🌥️ Nublado", chuva_fraca: "🌦️ Chuva fraca",
  chuva_forte: "⛈️ Chuva forte", vento: "💨 Vento",
};

export default function DiarioTabContent() {
  const { currentProject, updateBatchScopeProgress } = useConstruction();
  const houses = currentProject?.houses || [];
  const { user, profile, isCompanyAdmin, isSystemAdmin } = useAuth();
  const queryClient = useQueryClient();
  const podeCorrigir = isCompanyAdmin || isSystemAdmin;

  const [weekRef, setWeekRef] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const semanaInicio = format(weekRef, "yyyy-MM-dd");
  const semanaFim = format(endOfWeek(weekRef, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [correcoes, setCorrecoes] = useState<CorrecaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Correção state
  const [correcaoItem, setCorrecaoItem] = useState<ConsolidadoRow | null>(null);
  const [tipoCorrecao, setTipoCorrecao] = useState<"exclusao" | "ajuste_casas" | "ajuste_percentual">("exclusao");
  const [novasCasas, setNovasCasas] = useState<number[]>([]);
  const [novoPercentual, setNovoPercentual] = useState(100);
  const [justificativa, setJustificativa] = useState("");
  const [corrigindo, setCorrigindo] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<ConsolidadoRow["itensIndividuais"][0] | null>(null);
  const [selecionarItemOpen, setSelecionarItemOpen] = useState(false);

  useEffect(() => {
    if (!currentProject?.id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, semanaInicio, semanaFim]);

  // Reset form quando item de correção muda (apenas tipo + justificativa; casas/% vêm do item selecionado)
  useEffect(() => {
    if (correcaoItem) {
      setTipoCorrecao("exclusao");
      setJustificativa("");
    } else {
      setItemSelecionado(null);
    }
  }, [correcaoItem]);

  const loadData = async () => {
    if (!currentProject?.id) return;
    setLoading(true);
    try {
      const { data: entriesData } = await supabase
        .from("diary_entries")
        .select("id, entry_date, engineer_name, clima, equipe_presente, status")
        .eq("project_id", currentProject.id)
        .gte("entry_date", semanaInicio)
        .lte("entry_date", semanaFim)
        .order("entry_date", { ascending: true });

      setEntries(entriesData || []);

      const ids = (entriesData || []).map(e => e.id);
      let itemsData: ItemRow[] = [];
      let correcoesData: CorrecaoRow[] = [];
      if (ids.length > 0) {
        const [{ data: itemsRes }, { data: corrRes }] = await Promise.all([
          supabase
            .from("diary_items")
            .select("id, diary_entry_id, macro_id, macro_name, scope_id, scope_name, house_ids, percentual_executado, production_id")
            .in("diary_entry_id", ids),
          supabase
            .from("diary_item_corrections")
            .select("id, tipo, macro_name, scope_name, house_ids_anterior, house_ids_posterior, percentual_anterior, percentual_posterior, justificativa, corrigido_por_nome, created_at")
            .in("diary_entry_id", ids)
            .order("created_at", { ascending: false }),
        ]);
        itemsData = (itemsRes || []).map(d => ({
          ...d,
          house_ids: d.house_ids || [],
          percentual_executado: Number(d.percentual_executado),
        }));
        correcoesData = (corrRes || []).map((c: any) => ({
          ...c,
          house_ids_anterior: c.house_ids_anterior || [],
          house_ids_posterior: c.house_ids_posterior || null,
          percentual_anterior: Number(c.percentual_anterior),
          percentual_posterior: c.percentual_posterior !== null ? Number(c.percentual_posterior) : null,
        }));
      }
      setItems(itemsData);
      setCorrecoes(correcoesData);
    } finally {
      setLoading(false);
    }
  };

  // Itens por entry
  const itemsByEntry = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.diary_entry_id, (map.get(it.diary_entry_id) || 0) + 1);
    return map;
  }, [items]);

  // Consolidado por serviço
  const consolidado = useMemo<ConsolidadoRow[]>(() => {
    const map = new Map<string, { macroId: string; scopeId: string; macro: string; scope: string; casas: Set<number>; pcts: number[]; itensIndividuais: ConsolidadoRow["itensIndividuais"] }>();
    for (const it of items) {
      const key = `${it.macro_id}|${it.scope_id}`;
      if (!map.has(key)) {
        map.set(key, { macroId: it.macro_id, scopeId: it.scope_id, macro: it.macro_name, scope: it.scope_name, casas: new Set(), pcts: [], itensIndividuais: [] });
      }
      const entry = map.get(key)!;
      it.house_ids.forEach(h => entry.casas.add(h));
      entry.pcts.push(it.percentual_executado);
      entry.itensIndividuais.push({
        id: it.id,
        diary_entry_id: it.diary_entry_id,
        house_ids: it.house_ids,
        percentual_executado: it.percentual_executado,
        production_id: it.production_id,
      });
    }
    return Array.from(map.values()).map(g => ({
      macroId: g.macroId,
      scopeId: g.scopeId,
      macro: g.macro,
      scope: g.scope,
      casasCount: g.casas.size,
      pctMedio: g.pcts.length > 0 ? Math.round(g.pcts.reduce((s, p) => s + p, 0) / g.pcts.length) : 0,
      casasList: [...g.casas].sort((a, b) => a - b),
      itensIndividuais: g.itensIndividuais,
    }));
  }, [items]);

  const hasOpenEntries = entries.some(e => e.status !== "finalizado");

  const handleCloseWeek = async () => {
    if (!currentProject?.id) return;
    setClosing(true);
    try {
      await supabase.from("diary_entries")
        .update({ status: "finalizado" })
        .eq("project_id", currentProject.id)
        .gte("entry_date", semanaInicio)
        .lte("entry_date", semanaFim);

      const { data: planejados } = await supabase
        .from("planned_productions")
        .select("id, scope_id, scope_name, macro_id, macro_name, macro_color, planned_house_ids")
        .eq("project_id", currentProject.id)
        .gte("week_start", semanaInicio)
        .lte("week_end", semanaFim);

      let deviationsCount = 0;
      for (const plan of planejados || []) {
        const executedHouseIds = [...new Set(
          items
            .filter(i => i.scope_id === plan.scope_id)
            .flatMap(i => i.house_ids)
        )];
        const plannedIds: number[] = (plan.planned_house_ids as number[]) || [];
        if (plannedIds.length === 0) continue;
        const missingIds = plannedIds.filter(id => !executedHouseIds.includes(id));
        const unplannedIds = executedHouseIds.filter(id => !plannedIds.includes(id));

        if (missingIds.length > 0) {
          const pct = (missingIds.length / plannedIds.length) * 100;
          await supabase.from("production_deviations").insert({
            project_id: currentProject.id,
            company_id: profile?.company_id,
            week_start: semanaInicio,
            week_end: semanaFim,
            scope_id: plan.scope_id,
            scope_name: plan.scope_name,
            macro_id: plan.macro_id,
            macro_name: plan.macro_name,
            planned_count: plannedIds.length,
            actual_count: executedHouseIds.length,
            deviation: executedHouseIds.length - plannedIds.length,
            planned_house_ids: plannedIds,
            actual_house_ids: executedHouseIds,
            missing_house_ids: missingIds,
            unplanned_house_ids: unplannedIds,
            severity: pct > 40 ? "critical" : pct > 20 ? "warning" : "info",
            status: "open",
          });
          deviationsCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["production_deviations"] });
      toast.success(`Semana fechada! ${deviationsCount} desvio(s) registrado(s).`);
      loadData();
    } catch (err: any) {
      toast.error("Erro ao fechar semana: " + (err.message || ""));
    } finally {
      setClosing(false);
      setConfirmOpen(false);
    }
  };

  const shiftWeek = (delta: number) => {
    const newRef = new Date(weekRef);
    newRef.setDate(newRef.getDate() + delta * 7);
    setWeekRef(startOfWeek(newRef, { weekStartsOn: 1 }));
  };

  const handleCorrecao = async () => {
    if (!correcaoItem || !itemSelecionado || justificativa.trim().length < 20 || !currentProject) return;
    setCorrigindo(true);
    try {
      const item = itemSelecionado;
      const houseIdsAnterior: number[] = item.house_ids;

      // 1. Gravar auditoria
      await supabase.from("diary_item_corrections").insert({
        company_id: profile?.company_id,
        project_id: currentProject.id,
        diary_entry_id: item.diary_entry_id,
        diary_item_id: item.id,
        tipo: tipoCorrecao,
        house_ids_anterior: houseIdsAnterior,
        percentual_anterior: item.percentual_executado,
        house_ids_posterior: tipoCorrecao === "exclusao" ? null : novasCasas,
        percentual_posterior: tipoCorrecao === "exclusao" ? null : novoPercentual,
        macro_id: correcaoItem.macroId,
        macro_name: correcaoItem.macro,
        scope_id: correcaoItem.scopeId,
        scope_name: correcaoItem.scope,
        justificativa: justificativa.trim(),
        corrigido_por: user?.id,
        corrigido_por_nome: profile?.display_name || user?.email || "Coordenador",
      });

      // 2. Aplicar correção no item
      if (tipoCorrecao === "exclusao") {
        if (item.production_id) await supabase.from("productions").delete().eq("id", item.production_id);
        await supabase.from("diary_items").delete().eq("id", item.id);
        const revertMap: Record<number, number> = {};
        for (const hId of houseIdsAnterior) {
          const h = houses.find(h => h.id === hId);
          const hMacro = (h?.macros as any[])?.find(m => m.id === correcaoItem.macroId);
          const hScope = hMacro?.scopes?.find((s: any) => s.id === correcaoItem.scopeId);
          revertMap[hId] = Math.max(0, (hScope?.progress || 0) - Number(item.percentual_executado));
        }
        await updateBatchScopeProgress(houseIdsAnterior, correcaoItem.macroId, correcaoItem.scopeId, 100, revertMap);

      } else if (tipoCorrecao === "ajuste_casas") {
        const removidas = houseIdsAnterior.filter(h => !novasCasas.includes(h));
        await supabase.from("diary_items").update({ house_ids: novasCasas, houses_count: novasCasas.length }).eq("id", item.id);
        if (removidas.length > 0) {
          const revertMap: Record<number, number> = {};
          for (const hId of removidas) {
            const h = houses.find(h => h.id === hId);
            const hMacro = (h?.macros as any[])?.find(m => m.id === correcaoItem.macroId);
            const hScope = hMacro?.scopes?.find((s: any) => s.id === correcaoItem.scopeId);
            revertMap[hId] = Math.max(0, (hScope?.progress || 0) - Number(item.percentual_executado));
          }
          await updateBatchScopeProgress(removidas, correcaoItem.macroId, correcaoItem.scopeId, 100, revertMap);
        }

      } else if (tipoCorrecao === "ajuste_percentual") {
        const delta = novoPercentual - Number(item.percentual_executado);
        await supabase.from("diary_items").update({ percentual_executado: novoPercentual }).eq("id", item.id);
        const adjustMap: Record<number, number> = {};
        for (const hId of houseIdsAnterior) {
          const h = houses.find(h => h.id === hId);
          const hMacro = (h?.macros as any[])?.find(m => m.id === correcaoItem.macroId);
          const hScope = hMacro?.scopes?.find((s: any) => s.id === correcaoItem.scopeId);
          adjustMap[hId] = Math.min(100, Math.max(0, (hScope?.progress || 0) + delta));
        }
        await updateBatchScopeProgress(houseIdsAnterior, correcaoItem.macroId, correcaoItem.scopeId, 100, adjustMap);
      }

      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["weekly_productions"] });
      queryClient.invalidateQueries({ queryKey: ["houses"] });
      toast.success("Correção aplicada — mapa atualizado.");
      setCorrecaoItem(null);
      setItemSelecionado(null);
      setJustificativa("");
      loadData();
    } catch (err: any) {
      toast.error("Erro na correção: " + (err.message || ""));
    } finally {
      setCorrigindo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header / Week picker */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => shiftWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-[200px]">
              <div className="text-xs text-muted-foreground">Semana de</div>
              <div className="text-base font-semibold">
                {format(parseISO(semanaInicio), "dd/MM", { locale: ptBR })} a {format(parseISO(semanaFim), "dd/MM/yyyy", { locale: ptBR })}
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={() => shiftWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={semanaInicio}
              onChange={(e) => {
                if (!e.target.value) return;
                setWeekRef(startOfWeek(parseISO(e.target.value), { weekStartsOn: 1 }));
              }}
              className="w-[160px]"
            />
            <Button
              variant="default"
              disabled={!hasOpenEntries || entries.length === 0 || closing}
              onClick={() => setConfirmOpen(true)}
              className="ml-auto bg-emerald-600 hover:bg-emerald-700"
            >
              {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Fechar Semana
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumo da semana */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            Diários da Semana
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum diário lançado nesta semana.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Engenheiro</TableHead>
                    <TableHead>Clima</TableHead>
                    <TableHead className="text-center">Equipe</TableHead>
                    <TableHead className="text-center">Itens</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {format(parseISO(e.entry_date), "EEE dd/MM", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{e.engineer_name}</TableCell>
                      <TableCell className="text-xs">{e.clima ? CLIMA_LABEL[e.clima] || e.clima : "—"}</TableCell>
                      <TableCell className="text-center">{e.equipe_presente || 0}</TableCell>
                      <TableCell className="text-center">{itemsByEntry.get(e.id) || 0}</TableCell>
                      <TableCell>
                        {e.status === "finalizado" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Finalizado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300">
                            Rascunho
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consolidado por serviço */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consolidado por Serviço</CardTitle>
        </CardHeader>
        <CardContent>
          {consolidado.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum item lançado nesta semana.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-center w-12">Qtd</TableHead>
                    <TableHead>Casas executadas</TableHead>
                    <TableHead className="text-right">% médio</TableHead>
                    {podeCorrigir && <TableHead className="text-right w-32">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolidado.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.macro}</TableCell>
                      <TableCell>{c.scope}</TableCell>
                      <TableCell className="text-center font-bold">{c.casasCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.casasList.map((id: number) => (
                            <span key={id} className="inline-flex items-center justify-center h-6 w-7 rounded text-[10px] font-bold bg-muted border border-border">
                              {String(id).padStart(2, "0")}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">{c.pctMedio}%</TableCell>
                      {podeCorrigir && (
                        <TableCell className="text-right">
                          {hasOpenEntries ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                setCorrecaoItem(c);
                                if (c.itensIndividuais.length === 1) {
                                  const only = c.itensIndividuais[0];
                                  setItemSelecionado(only);
                                  setNovasCasas(only.house_ids);
                                  setNovoPercentual(only.percentual_executado);
                                } else {
                                  setSelecionarItemOpen(true);
                                }
                              }}
                            >
                              ✏️ Corrigir
                            </Button>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block">
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled>
                                      ✏️ Corrigir
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Semana fechada. Solicite ao administrador para corrigir.</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de correções */}
      {correcoes.length > 0 && (
        <Card>
          <Collapsible open={historicoOpen} onOpenChange={setHistoricoOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/40 transition-colors">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  📋 Histórico de Correções ({correcoes.length})
                  <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${historicoOpen ? "rotate-180" : ""}`} />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-2">
                  {correcoes.map(c => {
                    const tipoLabel = c.tipo === "exclusao" ? "exclusão" : c.tipo === "ajuste_casas" ? "ajuste de casas" : "ajuste de %";
                    const removidas = c.tipo === "ajuste_casas" && c.house_ids_posterior
                      ? c.house_ids_anterior.filter(h => !c.house_ids_posterior!.includes(h))
                      : [];
                    return (
                      <div key={c.id} className="text-xs p-3 rounded-md border bg-muted/30">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-muted-foreground">[{format(parseISO(c.created_at), "dd/MM HH:mm", { locale: ptBR })}]</span>
                          <strong>{c.corrigido_por_nome}</strong>
                          <Badge variant="outline" className="text-[10px]">{tipoLabel}</Badge>
                          <span className="text-muted-foreground">— {c.macro_name} / {c.scope_name}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Casas anteriores: {c.house_ids_anterior.map(h => String(h).padStart(2, "0")).join(" ")}
                          {c.tipo === "ajuste_casas" && removidas.length > 0 && (
                            <> · removidas: {removidas.map(h => String(h).padStart(2, "0")).join(" ")}</>
                          )}
                          {c.tipo === "ajuste_percentual" && c.percentual_posterior !== null && (
                            <> · {c.percentual_anterior}% → <strong>{c.percentual_posterior}%</strong></>
                          )}
                        </div>
                        <div className="mt-1 italic">"{c.justificativa}"</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Confirmação de fechar semana */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar Semana</AlertDialogTitle>
            <AlertDialogDescription>
              Ao fechar a semana, todos os diários do período serão marcados como finalizados e os desvios serão calculados automaticamente em relação ao planejamento.
              <br /><br />
              Esta ação não pode ser desfeita facilmente. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseWeek} disabled={closing}>
              {closing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de seleção de item (quando há múltiplos lançamentos) */}
      <Dialog open={selecionarItemOpen} onOpenChange={setSelecionarItemOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Qual lançamento corrigir?</DialogTitle>
            <DialogDescription>
              {correcaoItem?.macro} — {correcaoItem?.scope}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {correcaoItem?.itensIndividuais.map((item, idx) => {
              const entry = entries.find(e => e.id === item.diary_entry_id);
              return (
                <Button
                  key={item.id}
                  variant="outline"
                  className="w-full justify-start text-left h-auto py-3"
                  onClick={() => {
                    setItemSelecionado(item);
                    setNovasCasas(item.house_ids);
                    setNovoPercentual(item.percentual_executado);
                    setSelecionarItemOpen(false);
                  }}
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {entry ? format(parseISO(entry.entry_date), "EEE dd/MM", { locale: ptBR }) : `Lançamento ${idx + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Casas: {item.house_ids.join(", ")} — {item.percentual_executado}%
                    </p>
                  </div>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de correção */}
      <Dialog open={!!correcaoItem && !!itemSelecionado && !selecionarItemOpen} onOpenChange={(o) => { if (!o) { setCorrecaoItem(null); setItemSelecionado(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Corrigir lançamento — {correcaoItem?.macro} / {correcaoItem?.scope}</DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação afeta os itens deste serviço lançados na semana e gera registro de auditoria.
            </DialogDescription>
          </DialogHeader>

          {correcaoItem && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Casas originais</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {correcaoItem.casasList.map(id => (
                    <span key={id} className="inline-flex items-center justify-center h-6 w-7 rounded text-[10px] font-bold bg-muted border border-border">
                      {String(id).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-2 block">Tipo de correção</Label>
                <RadioGroup value={tipoCorrecao} onValueChange={(v) => setTipoCorrecao(v as any)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="exclusao" id="r-exc" />
                    <Label htmlFor="r-exc" className="text-sm font-normal cursor-pointer">Excluir item inteiro</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ajuste_casas" id="r-cas" />
                    <Label htmlFor="r-cas" className="text-sm font-normal cursor-pointer">Remover casas específicas</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ajuste_percentual" id="r-pct" />
                    <Label htmlFor="r-pct" className="text-sm font-normal cursor-pointer">Ajustar percentual</Label>
                  </div>
                </RadioGroup>
              </div>

              {tipoCorrecao === "ajuste_casas" && (
                <div>
                  <Label className="text-xs mb-2 block">Marque as casas que devem permanecer</Label>
                  <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 border rounded">
                    {correcaoItem.casasList.map(id => (
                      <label key={id} className="flex items-center gap-1 text-xs cursor-pointer">
                        <Checkbox
                          checked={novasCasas.includes(id)}
                          onCheckedChange={(checked) => {
                            setNovasCasas(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
                          }}
                        />
                        {String(id).padStart(2, "0")}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {tipoCorrecao === "ajuste_percentual" && (
                <div>
                  <Label className="text-xs mb-1 block">Novo percentual</Label>
                  <div className="text-2xl font-bold text-primary text-center my-2">{novoPercentual}%</div>
                  <Slider min={0} max={100} step={5} value={[novoPercentual]} onValueChange={(v) => setNovoPercentual(v[0])} />
                </div>
              )}

              <div>
                <Label className="text-xs mb-1 block">Justificativa (mínimo 20 caracteres)</Label>
                <Textarea
                  value={justificativa}
                  onChange={e => setJustificativa(e.target.value)}
                  placeholder="Descreva o motivo da correção..."
                  className="min-h-[80px]"
                />
                <div className="text-[11px] text-muted-foreground mt-1 text-right">
                  {justificativa.trim().length}/20
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCorrecaoItem(null); setItemSelecionado(null); }} disabled={corrigindo}>Cancelar</Button>
            <Button
              onClick={handleCorrecao}
              disabled={corrigindo || justificativa.trim().length < 20}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {corrigindo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
