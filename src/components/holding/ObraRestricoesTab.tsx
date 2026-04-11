import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Loader2, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const TIPO_BADGE: Record<string, { label: string; cls: string }> = {
  material: { label: "Material", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  mao_de_obra: { label: "Mão de Obra", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  administrativa: { label: "Administrativa", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

async function registrarLog(
  obraId: string, tabela: string, registroId: string | null,
  acao: string, descricao: string, userId: string | null, userName: string,
  dadosAnteriores?: Record<string, unknown>, dadosNovos?: Record<string, unknown>
) {
  try {
    await supabase.from("holding_audit_log").insert([{
      obra_id: obraId, tabela, registro_id: registroId, acao, descricao,
      dados_anteriores: (dadosAnteriores || {}) as any,
      dados_novos: (dadosNovos || {}) as any,
      realizado_por: userId, realizado_por_nome: userName,
    }]);
  } catch (e) {
    console.error("[AuditLog] Erro ao registrar:", e);
  }
}

function useInvalidateHolding() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["holding-portfolio"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-receitas"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-despesas"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-prd"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-documentos"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-aditivos-pendentes"], exact: false });
    qc.invalidateQueries({ queryKey: ["holding-insights-data"], exact: false });
  };
}

export function ObraRestricoesTab({ obraId }: { obraId: string }) {
  const { user, profile, requireEdit, isCompanyAdmin, isSystemAdmin } = useAuth();
  const isAdmin = isCompanyAdmin || isSystemAdmin;
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
  const invalidateHolding = useInvalidateHolding();

  const [items, setItems] = useState<any[]>([]);
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({ valor_pago: 0, forma_resolucao: "pago" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    tipo: "", descricao: "", valor: 0, impacto_medicao: 0,
    medicao_id: "", data_limite: "",
  });

  const companyId = profile?.company_id || "";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: restricoes }, { data: meds }] = await Promise.all([
        supabase.from("restricoes_financeiras").select("*").eq("obra_id", obraId).order("resolvida").order("data_limite"),
        supabase.from("medicoes_ple").select("id, num_medicao, status_medicao, data_previsao_medicao").eq("obra_id", obraId),
      ]);
      setItems(restricoes || []);
      setMedicoes((meds || []).filter((m: any) => m.status_medicao === "prevista" || m.status_medicao === "nao_iniciada" || m.status_medicao === "enviada"));
    } catch (e) {
      console.error("[RestricoesTab] Erro ao carregar:", e);
      toast.error("Erro ao carregar restrições. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!requireEdit()) return;
    setConfirmSave(false);
    if (!form.tipo || !form.descricao.trim() || !form.data_limite) {
      toast.warning("Preencha tipo, descrição e data limite.");
      return;
    }

    const payload: any = {
      obra_id: obraId,
      company_id: companyId,
      tipo: form.tipo,
      descricao: form.descricao,
      valor: form.valor || 0,
      impacto_medicao: form.impacto_medicao || 0,
      data_limite: form.data_limite,
      medicao_id: form.medicao_id && form.medicao_id !== "none" ? form.medicao_id : null,
      created_by: userId,
      created_by_name: userName,
    };

    if (editingId) {
      const { error } = await supabase.from("restricoes_financeiras").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao editar restrição"); return; }
      await registrarLog(obraId, "restricoes_financeiras", editingId, "editou",
        `Editou restrição: ${form.tipo} — ${form.descricao}`, userId, userName);
      toast.success("Restrição atualizada!");
    } else {
      const { data: ins, error } = await supabase.from("restricoes_financeiras").insert(payload).select("id").single();
      if (error) { toast.error("Erro ao salvar restrição"); return; }
      await registrarLog(obraId, "restricoes_financeiras", ins?.id || null, "criou",
        `Nova restrição (${form.tipo}): ${form.descricao} — Valor: ${BRL.format(form.valor)} — Impacto: ${BRL.format(form.impacto_medicao)}`,
        userId, userName);
      toast.success("Restrição adicionada!");
    }

    invalidateHolding();
    setShowForm(false);
    setEditingId(null);
    setForm({ tipo: "", descricao: "", valor: 0, impacto_medicao: 0, medicao_id: "", data_limite: "" });
    load();
  };

  const handleResolve = async () => {
    if (!resolvingId || !requireEdit()) return;
    const { error } = await supabase.from("restricoes_financeiras").update({
      resolvida: true,
      resolvida_em: new Date().toISOString(),
      resolvida_por: userId,
      resolvida_por_nome: userName,
      valor_pago: resolveForm.valor_pago || 0,
      forma_resolucao: resolveForm.forma_resolucao,
    }).eq("id", resolvingId);
    if (error) { toast.error("Erro ao resolver"); return; }
    const item = items.find(i => i.id === resolvingId);
    await registrarLog(obraId, "restricoes_financeiras", resolvingId, "resolveu",
      `Resolveu restrição: ${item?.descricao || ""} — Forma: ${resolveForm.forma_resolucao} — Pago: ${BRL.format(resolveForm.valor_pago)}`,
      userId, userName);
    // Gerar notificação de conclusão
    try {
      await supabase.from("system_notifications").insert({
        company_id: companyId,
        obra_id: obraId,
        tipo: "restricao_resolvida",
        titulo: `Restrição resolvida — ${item?.descricao?.substring(0, 40) || ""}`,
        mensagem: `Restrição "${item?.descricao || ""}" foi resolvida por ${userName}. Forma: ${resolveForm.forma_resolucao}. Valor pago: ${BRL.format(resolveForm.valor_pago)}.`,
      });
    } catch (e) { console.error("Erro ao criar notificação:", e); }
    toast.success("Restrição resolvida!");
    setResolvingId(null);
    setResolveForm({ valor_pago: 0, forma_resolucao: "pago" });
    invalidateHolding();
    load();
  };

  const handleDelete = async () => {
    if (!deletingId || !requireEdit()) return;
    const item = items.find(i => i.id === deletingId);
    const { error } = await supabase.from("restricoes_financeiras").delete().eq("id", deletingId);
    if (error) { toast.error("Erro ao excluir"); return; }
    await registrarLog(obraId, "restricoes_financeiras", deletingId, "excluiu",
      `Excluiu restrição: ${item?.descricao || ""}`, userId, userName, { ...item }, {});
    // Gerar notificação de recusa/remoção
    try {
      await supabase.from("system_notifications").insert({
        company_id: companyId,
        obra_id: obraId,
        tipo: "restricao_recusada",
        titulo: `Restrição removida — ${item?.descricao?.substring(0, 40) || ""}`,
        mensagem: `Restrição "${item?.descricao || ""}" foi removida por ${userName}.`,
      });
    } catch (e) { console.error("Erro ao criar notificação:", e); }
    toast.success("Restrição excluída.");
    setDeletingId(null);
    invalidateHolding();
    load();
  };

  const startEdit = (item: any) => {
    setForm({
      tipo: item.tipo, descricao: item.descricao, valor: item.valor || 0,
      impacto_medicao: item.impacto_medicao || 0,
      medicao_id: item.medicao_id || "", data_limite: item.data_limite || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const abertas = items.filter(i => !i.resolvida);
  const resolvidas = items.filter(i => i.resolvida);
  const totalAberto = abertas.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const totalImpacto = abertas.reduce((s, i) => s + (Number(i.impacto_medicao) || 0), 0);
  const vencidas = abertas.filter(i => i.data_limite && new Date(i.data_limite + "T23:59:59") < new Date()).length;

  const renderCard = (item: any) => {
    const isVencida = !item.resolvida && item.data_limite && new Date(item.data_limite + "T23:59:59") < new Date();
    const tipoBadge = TIPO_BADGE[item.tipo] || { label: item.tipo, cls: "bg-muted text-muted-foreground" };
    const medVinculada = medicoes.find((m: any) => m.id === item.medicao_id);

    return (
      <Card key={item.id} className={isVencida ? "border-destructive" : ""}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className={`text-[10px] ${tipoBadge.cls}`}>{tipoBadge.label}</Badge>
              {isVencida && <Badge variant="destructive" className="text-[10px]">Vencida</Badge>}
              {item.resolvida && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Resolvida</Badge>}
            </div>
            {!item.resolvida && (
              <div className="flex gap-1 shrink-0">
                {isAdmin && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span>💡 Para resolver, use o Painel Financeiro</span>
                </p>
              </div>
            )}
          </div>
          <p className="text-sm">{item.descricao}</p>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span>Valor: <strong className="text-foreground">{BRL.format(Number(item.valor) || 0)}</strong></span>
            <span>Impacto: <strong className="text-foreground">{BRL.format(Number(item.impacto_medicao) || 0)}</strong></span>
            <span>Prazo: <strong className={isVencida ? "text-destructive" : "text-foreground"}>{item.data_limite ? format(new Date(item.data_limite + "T12:00:00"), "dd/MM/yyyy") : "—"}</strong></span>
            {medVinculada && <span>Medição: <strong className="text-foreground">Nº {medVinculada.num_medicao}</strong></span>}
          </div>
          {item.resolvida && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">
              Resolvida em {item.resolvida_em ? format(new Date(item.resolvida_em), "dd/MM/yy HH:mm") : "—"} por {item.resolvida_por_nome || "—"} | Forma: {item.forma_resolucao || "—"} | Pago: {BRL.format(Number(item.valor_pago) || 0)}
            </div>
          )}
          {item.created_by_name && (
            <p className="text-[10px] text-muted-foreground">Criada por {item.created_by_name}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Total Aberto</p><p className="text-lg font-bold">{BRL.format(totalAberto)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Impacto Total</p><p className="text-lg font-bold">{BRL.format(totalImpacto)}</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-xs text-muted-foreground">Vencidas</p><p className={`text-lg font-bold ${vencidas > 0 ? "text-destructive" : ""}`}>{vencidas}</p></CardContent></Card>
        </div>

        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Restrições ({items.length})</h4>
          <Button size="sm" variant="outline" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ tipo: "", descricao: "", valor: 0, impacto_medicao: 0, medicao_id: "", data_limite: "" }); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Restrição
          </Button>
        </div>

        {showForm && (
          <Card className="border-dashed">
            <CardContent className="p-4 space-y-3">
              <h4 className="font-semibold text-sm">{editingId ? "Editar Restrição" : "Nova Restrição"}</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Tipo *</label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">Material</SelectItem>
                      <SelectItem value="mao_de_obra">Mão de Obra</SelectItem>
                      <SelectItem value="administrativa">Administrativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Valor da Restrição (R$) *</label>
                  <CurrencyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Impacto na Medição (R$) *</label>
                  <CurrencyInput value={form.impacto_medicao} onChange={(v) => setForm({ ...form, impacto_medicao: v })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Data Limite *</label>
                  <Input type="date" value={form.data_limite} onChange={(e) => setForm({ ...form, data_limite: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Medição Vinculada</label>
                  <Select value={form.medicao_id} onValueChange={(v) => setForm({ ...form, medicao_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {medicoes.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>Nº {m.num_medicao} — {m.status_medicao}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Descrição *</label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva a restrição..." rows={2} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setConfirmSave(true)}>
                  {editingId ? "Salvar Alteração" : "Salvar Restrição"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Abertas */}
        {abertas.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Abertas ({abertas.length})</p>
            {abertas.map(renderCard)}
          </div>
        )}

        {/* Resolvidas */}
        {resolvidas.length > 0 && (
          <div className="space-y-2">
            <Separator />
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Resolvidas ({resolvidas.length})</p>
            {resolvidas.map(renderCard)}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma restrição cadastrada.</div>
        )}
      </div>

      {/* Confirm Save */}
      <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar restrição</AlertDialogTitle>
            <AlertDialogDescription>
              <p>Tipo: <strong>{TIPO_BADGE[form.tipo]?.label || form.tipo}</strong></p>
              <p>Valor: <strong>{BRL.format(form.valor)}</strong> — Impacto na medição: <strong>{BRL.format(form.impacto_medicao)}</strong></p>
              <p>Prazo: <strong>{form.data_limite}</strong></p>
              <p className="mt-2">{form.descricao}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resolve Dialog */}
      <AlertDialog open={!!resolvingId} onOpenChange={(open) => !open && setResolvingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolver Restrição</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground">Valor Pago (R$)</label>
                  <CurrencyInput value={resolveForm.valor_pago} onChange={(v) => setResolveForm({ ...resolveForm, valor_pago: v })} />
                </div>
                <div><label className="text-xs text-muted-foreground">Forma de Resolução</label>
                  <Select value={resolveForm.forma_resolucao} onValueChange={(v) => setResolveForm({ ...resolveForm, forma_resolucao: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="negociado">Negociado</SelectItem>
                      <SelectItem value="dispensado">Dispensado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve}>Resolver</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir restrição</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
