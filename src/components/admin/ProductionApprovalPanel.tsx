import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X, Trash2, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type PendingItem = {
  id: string;
  diary_entry_id: string;
  macro_name: string;
  scope_name: string;
  macro_color: string;
  house_ids: number[];
  percentual_executado: number;
  observacao: string | null;
  created_at: string;
  created_by: string | null;
  previous_percentual: number | null;
  regression_reason: string | null;
  project_id: string;
  project_nome: string;
  data_relatorio: string;
  created_by_name?: string | null;
};

type DeleteRequest = {
  id: string;
  diary_item_id: string;
  reason: string;
  status: string;
  requested_at: string;
  requested_by: string;
  project_id: string;
  diary_entry_id: string;
  item?: {
    macro_name: string;
    scope_name: string;
    house_ids: number[];
    percentual_executado: number;
  };
  project_nome?: string;
  requested_by_name?: string | null;
};

/**
 * Painel para o coordenador/admin governar os lançamentos de produção:
 * - Aprovar/rejeitar lançamentos pendentes (diary_items com review_status='pendente')
 * - Aprovar/rejeitar pedidos de exclusão (diary_item_delete_requests)
 *
 * Apenas itens APROVADOS são considerados nos mapas, gráficos e regressões.
 */
export function ProductionApprovalPanel() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [decisionItem, setDecisionItem] = useState<PendingItem | null>(null);
  const [decisionMode, setDecisionMode] = useState<"aprovar" | "rejeitar">("aprovar");
  const [decisionNote, setDecisionNote] = useState("");
  const [deletionReq, setDeletionReq] = useState<DeleteRequest | null>(null);
  const [deletionMode, setDeletionMode] = useState<"aprovar" | "rejeitar">("aprovar");
  const [processing, setProcessing] = useState(false);

  // ---------- Lançamentos pendentes ----------
  const { data: pending = [], isLoading: loadingItems } = useQuery({
    queryKey: ["production-approval-pending", company?.id],
    queryFn: async () => {
      if (!company?.id) return [] as PendingItem[];
      const { data, error } = await (supabase as any)
        .from("diary_items")
        .select(`
          id, diary_entry_id, macro_name, scope_name, macro_color,
          house_ids, percentual_executado, observacao, created_at, created_by,
          previous_percentual, regression_reason,
          diary_entries!inner(project_id, data_relatorio, projects!inner(nome, company_id))
        `)
        .eq("review_status", "pendente")
        .is("deleted_at", null)
        .eq("diary_entries.projects.company_id", company.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const items: PendingItem[] = (data || []).map((r: any) => ({
        id: r.id,
        diary_entry_id: r.diary_entry_id,
        macro_name: r.macro_name,
        scope_name: r.scope_name,
        macro_color: r.macro_color,
        house_ids: r.house_ids || [],
        percentual_executado: Number(r.percentual_executado || 0),
        observacao: r.observacao,
        created_at: r.created_at,
        created_by: r.created_by,
        previous_percentual: r.previous_percentual,
        regression_reason: r.regression_reason,
        project_id: r.diary_entries?.project_id,
        project_nome: r.diary_entries?.projects?.nome || "—",
        data_relatorio: r.diary_entries?.data_relatorio,
      }));
      // Hidrata nomes
      const ids = Array.from(new Set(items.map(i => i.created_by).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await (supabase as any).from("profiles").select("id, display_name").in("id", ids);
        const map = new Map<string, string>((profs || []).map((p: any) => [p.id, p.display_name]));
        items.forEach(i => { if (i.created_by) i.created_by_name = map.get(i.created_by) || null; });
      }
      return items;
    },
    enabled: !!company?.id,
  });

  // ---------- Pedidos de exclusão ----------
  const { data: deletes = [], isLoading: loadingDel } = useQuery({
    queryKey: ["production-deletion-pending", company?.id],
    queryFn: async () => {
      if (!company?.id) return [] as DeleteRequest[];
      const { data, error } = await (supabase as any)
        .from("diary_item_delete_requests")
        .select(`
          id, diary_item_id, diary_entry_id, project_id, reason, status, requested_at, requested_by,
          diary_items(macro_name, scope_name, house_ids, percentual_executado),
          projects(nome)
        `)
        .eq("status", "pendente")
        .eq("company_id", company.id)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      const reqs: DeleteRequest[] = (data || []).map((r: any) => ({
        id: r.id,
        diary_item_id: r.diary_item_id,
        diary_entry_id: r.diary_entry_id,
        project_id: r.project_id,
        reason: r.reason,
        status: r.status,
        requested_at: r.requested_at,
        requested_by: r.requested_by,
        item: r.diary_items
          ? {
              macro_name: r.diary_items.macro_name,
              scope_name: r.diary_items.scope_name,
              house_ids: r.diary_items.house_ids || [],
              percentual_executado: Number(r.diary_items.percentual_executado || 0),
            }
          : undefined,
        project_nome: r.projects?.nome || "—",
      }));
      const userIds = Array.from(new Set(reqs.map(r => r.requested_by))) as string[];
      if (userIds.length) {
        const { data: profs } = await (supabase as any).from("profiles").select("id, display_name").in("id", userIds);
        const map = new Map<string, string>((profs || []).map((p: any) => [p.id, p.display_name]));
        reqs.forEach(r => { r.requested_by_name = map.get(r.requested_by) || null; });
      }
      return reqs;
    },
    enabled: !!company?.id,
  });

  const totalPendentes = pending.length + deletes.length;

  // ---------- Ações ----------
  const submitDecision = async () => {
    if (!decisionItem) return;
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("approve_diary_item_review", {
        p_item_id: decisionItem.id,
        p_decision: decisionMode === "aprovar" ? "aprovado" : "rejeitado",
        p_note: decisionNote.trim() || null,
      });
      if (error) throw error;
      toast.success(decisionMode === "aprovar" ? "Lançamento aprovado." : "Lançamento rejeitado.");
      setDecisionItem(null);
      setDecisionNote("");
      qc.invalidateQueries({ queryKey: ["production-approval-pending"] });
      qc.invalidateQueries({ queryKey: ["houses"] });
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setProcessing(false);
    }
  };

  const submitDeletionDecision = async () => {
    if (!deletionReq) return;
    setProcessing(true);
    try {
      const fn = deletionMode === "aprovar" ? "approve_diary_item_deletion" : "reject_diary_item_deletion";
      const { error } = await supabase.rpc(fn, {
        p_request_id: deletionReq.id,
        p_note: decisionNote.trim() || null,
      });
      if (error) throw error;
      toast.success(deletionMode === "aprovar" ? "Exclusão aprovada e progresso revertido." : "Pedido de exclusão rejeitado.");
      setDeletionReq(null);
      setDecisionNote("");
      qc.invalidateQueries({ queryKey: ["production-deletion-pending"] });
      qc.invalidateQueries({ queryKey: ["houses"] });
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Aprovações de Produção
          {totalPendentes > 0 && <Badge variant="destructive">{totalPendentes}</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Lançamentos pendentes só propagam para mapas, gráficos e planejamento após sua aprovação.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="lancamentos">
          <TabsList>
            <TabsTrigger value="lancamentos">
              Lançamentos pendentes {pending.length > 0 && <Badge variant="secondary" className="ml-2">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="exclusoes">
              Pedidos de exclusão {deletes.length > 0 && <Badge variant="secondary" className="ml-2">{deletes.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lancamentos" className="mt-4">
            {loadingItems ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum lançamento pendente. Tudo em dia.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obra</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Casas</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead>Lançado por</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map(item => {
                      const isReg = item.previous_percentual !== null && item.percentual_executado < (item.previous_percentual || 0);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.project_nome}</TableCell>
                          <TableCell>{format(new Date(item.data_relatorio), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-6 rounded-full" style={{ backgroundColor: item.macro_color }} />
                              <div>
                                <div className="text-sm">{item.scope_name}</div>
                                <div className="text-xs text-muted-foreground">{item.macro_name}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{item.house_ids.length}</TableCell>
                          <TableCell>
                            <Badge variant={isReg ? "destructive" : "secondary"}>
                              {item.percentual_executado}%
                              {isReg && item.previous_percentual != null && (
                                <span className="ml-1 text-[10px]">↓ de {item.previous_percentual}%</span>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{item.created_by_name || "—"}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button size="sm" variant="default" onClick={() => { setDecisionItem(item); setDecisionMode("aprovar"); }}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setDecisionItem(item); setDecisionMode("rejeitar"); }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="exclusoes" className="mt-4">
            {loadingDel ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : deletes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhum pedido de exclusão pendente.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obra</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Data pedido</TableHead>
                      <TableHead>Lançamento</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletes.map(req => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.project_nome}</TableCell>
                        <TableCell className="text-xs">{req.requested_by_name || "—"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(req.requested_at), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell className="text-xs">
                          {req.item ? `${req.item.scope_name} (${req.item.percentual_executado}% • ${req.item.house_ids.length} casas)` : "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[280px] truncate" title={req.reason}>{req.reason}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="destructive" onClick={() => { setDeletionReq(req); setDeletionMode("aprovar"); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setDeletionReq(req); setDeletionMode("rejeitar"); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Diálogo de decisão de lançamento */}
      <Dialog open={!!decisionItem} onOpenChange={(v) => { if (!v) { setDecisionItem(null); setDecisionNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionMode === "aprovar" ? "Aprovar lançamento" : "Rejeitar lançamento"}</DialogTitle>
            <DialogDescription>
              {decisionMode === "aprovar"
                ? "Ao aprovar, o percentual será propagado para mapa, gráficos e planejamento."
                : "Ao rejeitar, o lançamento ficará marcado como rejeitado e não impactará indicadores."}
            </DialogDescription>
          </DialogHeader>
          {decisionItem && (
            <div className="text-sm space-y-1 border-l-2 border-muted pl-3">
              <div><b>Obra:</b> {decisionItem.project_nome}</div>
              <div><b>Serviço:</b> {decisionItem.scope_name} ({decisionItem.macro_name})</div>
              <div><b>%:</b> {decisionItem.percentual_executado}% em {decisionItem.house_ids.length} casas</div>
              {decisionItem.regression_reason && (
                <div className="text-amber-600"><b>Justificativa de regressão:</b> {decisionItem.regression_reason}</div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="note">Observação (opcional)</Label>
            <Textarea id="note" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionItem(null)} disabled={processing}>Cancelar</Button>
            <Button variant={decisionMode === "aprovar" ? "default" : "destructive"} onClick={submitDecision} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {decisionMode === "aprovar" ? "Aprovar" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de decisão de exclusão */}
      <Dialog open={!!deletionReq} onOpenChange={(v) => { if (!v) { setDeletionReq(null); setDecisionNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deletionMode === "aprovar" ? "Aprovar exclusão" : "Rejeitar exclusão"}</DialogTitle>
            <DialogDescription>
              {deletionMode === "aprovar"
                ? "Ao aprovar, o lançamento será removido (soft-delete) e o progresso revertido nos mapas."
                : "Ao rejeitar, o lançamento permanece ativo. O solicitante pode abrir novo pedido depois."}
            </DialogDescription>
          </DialogHeader>
          {deletionReq?.item && (
            <div className="text-sm space-y-1 border-l-2 border-muted pl-3">
              <div><b>Obra:</b> {deletionReq.project_nome}</div>
              <div><b>Lançamento:</b> {deletionReq.item.scope_name} — {deletionReq.item.percentual_executado}% em {deletionReq.item.house_ids.length} casas</div>
              <div className="text-muted-foreground"><b>Motivo do solicitante:</b> {deletionReq.reason}</div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="note2">Observação da decisão (opcional)</Label>
            <Textarea id="note2" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletionReq(null)} disabled={processing}>Cancelar</Button>
            <Button variant={deletionMode === "aprovar" ? "destructive" : "default"} onClick={submitDeletionDecision} disabled={processing}>
              {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deletionMode === "aprovar" ? "Aprovar exclusão" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
