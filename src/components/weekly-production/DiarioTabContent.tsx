import React, { useState, useEffect, useMemo } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
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
}

const CLIMA_LABEL: Record<string, string> = {
  sol: "☀️ Sol", nublado: "🌥️ Nublado", chuva_fraca: "🌦️ Chuva fraca",
  chuva_forte: "⛈️ Chuva forte", vento: "💨 Vento",
};

export default function DiarioTabContent() {
  const { currentProject } = useConstruction();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [weekRef, setWeekRef] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const semanaInicio = format(weekRef, "yyyy-MM-dd");
  const semanaFim = format(endOfWeek(weekRef, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!currentProject?.id) return;
    loadData();
  }, [currentProject?.id, semanaInicio, semanaFim]);

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
      if (ids.length > 0) {
        const { data } = await supabase
          .from("diary_items")
          .select("id, diary_entry_id, macro_id, macro_name, scope_id, scope_name, house_ids, percentual_executado")
          .in("diary_entry_id", ids);
        itemsData = (data || []).map(d => ({
          ...d,
          house_ids: d.house_ids || [],
          percentual_executado: Number(d.percentual_executado),
        }));
      }
      setItems(itemsData);
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
  const consolidado = useMemo(() => {
    const map = new Map<string, { macro: string; scope: string; casas: Set<number>; pcts: number[] }>();
    for (const it of items) {
      const key = `${it.macro_id}|${it.scope_id}`;
      if (!map.has(key)) {
        map.set(key, { macro: it.macro_name, scope: it.scope_name, casas: new Set(), pcts: [] });
      }
      const entry = map.get(key)!;
      it.house_ids.forEach(h => entry.casas.add(h));
      entry.pcts.push(it.percentual_executado);
    }
    return Array.from(map.values()).map(g => ({
      macro: g.macro,
      scope: g.scope,
      casasCount: g.casas.size,
      pctMedio: g.pcts.length > 0 ? Math.round(g.pcts.reduce((s, p) => s + p, 0) / g.pcts.length) : 0,
    }));
  }, [items]);

  const hasOpenEntries = entries.some(e => e.status !== "finalizado");

  const handleCloseWeek = async () => {
    if (!currentProject?.id) return;
    setClosing(true);
    try {
      // Passo 1 — finalizar diários
      await supabase.from("diary_entries")
        .update({ status: "finalizado" })
        .eq("project_id", currentProject.id)
        .gte("entry_date", semanaInicio)
        .lte("entry_date", semanaFim);

      // Passo 2 — calcular desvios
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
                    <TableHead className="text-center">Casas distintas</TableHead>
                    <TableHead className="text-right">% médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consolidado.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.macro}</TableCell>
                      <TableCell>{c.scope}</TableCell>
                      <TableCell className="text-center">{c.casasCount}</TableCell>
                      <TableCell className="text-right font-bold">{c.pctMedio}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmação */}
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
    </div>
  );
}
