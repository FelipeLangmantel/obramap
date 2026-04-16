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
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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

export function ObraAditivosTab({ obraId }: { obraId: string }) {
  const { user, profile, requireEdit } = useAuth();
  const userName = profile?.display_name || user?.email || "Usuário";
  const userId = user?.id || null;
  const invalidateHolding = useInvalidateHolding();
  const [deletingAditivoId, setDeletingAditivoId] = useState<string | null>(null);
  const [aditivos, setAditivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    num_aditivo: "", aditivo_prazo_dias: 0, aditivo_valor: 0,
    supressao_valor: 0, data: "", status: "pendente" as string,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from("aditivos_contratos").select("*").eq("obra_id", obraId).order("data");
      setAditivos(data || []);
    } catch (e) {
      console.error("[AditivosTab] Erro ao carregar:", e);
      toast.error("Erro ao carregar aditivos. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const addAditivo = async () => {
    if (!requireEdit()) return;
    const payload: any = {
      obra_id: obraId,
      num_aditivo: form.num_aditivo || null,
      aditivo_prazo_dias: form.aditivo_prazo_dias || 0,
      aditivo_valor: form.aditivo_valor || 0,
      supressao_valor: form.supressao_valor || 0,
      status: form.status,
    };
    if (form.data) payload.data = form.data;
    const { data: ins, error } = await supabase
      .from("aditivos_contratos").insert(payload).select("id").single();
    if (error) { toast.error("Erro ao salvar aditivo"); return; }

    await registrarLog(
      obraId, "aditivos_contratos", ins?.id || null,
      "criou",
      `Adicionou aditivo ${form.num_aditivo || ""} — ${BRL.format(form.aditivo_valor)} — prazo +${form.aditivo_prazo_dias} dias`,
      userId, userName
    );

    toast.success("Aditivo adicionado!");
    invalidateHolding();
    setShowForm(false);
    setForm({ num_aditivo: "", aditivo_prazo_dias: 0, aditivo_valor: 0, supressao_valor: 0, data: "", status: "pendente" });
    load();
  };

  const deleteAditivo = async (id: string) => {
    if (!requireEdit()) return;
    setDeletingAditivoId(null);
    const aditivoSnap = aditivos.find(a => a.id === id);
    const { error } = await supabase.from("aditivos_contratos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }

    await registrarLog(
      obraId, "aditivos_contratos", id,
      "excluiu",
      `Excluiu aditivo ${aditivoSnap?.num_aditivo || ""} — ${BRL.format(aditivoSnap?.aditivo_valor || 0)}`,
      userId, userName,
      { ...aditivoSnap }, {}
    );

    toast.success("Aditivo excluído.");
    invalidateHolding();
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const aprovados = aditivos.filter(a => a.status === 'aprovado');
  const totalDias = aprovados.reduce((s, a) => s + (a.aditivo_prazo_dias || 0), 0);
  const totalValor = aprovados.reduce((s, a) => s + (a.aditivo_valor || 0), 0);
  const totalSupressao = aprovados.reduce((s, a) => s + (a.supressao_valor || 0), 0);

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant="outline" className="text-xs">Prazo aprovado: +{totalDias} dias</Badge>
          <Badge variant="outline" className="text-xs">Valor aprovado: {BRL.format(totalValor)}</Badge>
          {totalSupressao > 0 && <Badge variant="outline" className="text-xs text-red-600">Supressão aprovada: {BRL.format(totalSupressao)}</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Aditivo
        </Button>
      </div>

      {showForm && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-semibold text-sm">Novo Aditivo</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><label className="text-xs text-muted-foreground">Nº Aditivo</label><Input value={form.num_aditivo} onChange={(e) => setForm({ ...form, num_aditivo: e.target.value })} placeholder="Ex: 01" /></div>
              <div><label className="text-xs text-muted-foreground">Prazo (dias)</label><Input type="number" value={form.aditivo_prazo_dias || ""} onChange={(e) => setForm({ ...form, aditivo_prazo_dias: Number(e.target.value) })} /></div>
              <div><label className="text-xs text-muted-foreground">Valor Aditivo (R$)</label>
                <CurrencyInput value={form.aditivo_valor} onChange={(v) => setForm({ ...form, aditivo_valor: v })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Supressão (R$)</label>
                <CurrencyInput value={form.supressao_valor} onChange={(v) => setForm({ ...form, supressao_valor: v })} />
              </div>
              <div><label className="text-xs text-muted-foreground">Data</label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={addAditivo}>Salvar Aditivo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Prazo (dias)</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Supressão</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aditivos.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  <span>{a.num_aditivo || "—"}</span>
                  {a.created_by_name && (
                    <span className="text-[10px] text-muted-foreground ml-1">
                      por {a.created_by_name}
                    </span>
                  )}
                </TableCell>
                <TableCell>{a.aditivo_prazo_dias > 0 ? `+${a.aditivo_prazo_dias}` : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.aditivo_valor > 0 ? BRL.format(a.aditivo_valor) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.supressao_valor > 0 ? BRL.format(a.supressao_valor) : "—"}</TableCell>
                <TableCell>{a.data ? format(new Date(a.data + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-[10px] ${a.status === "aprovado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                    {a.status === "aprovado" ? "Aprovado" : "Pendente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingAditivoId(a.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {aditivos.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aditivo.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>

      <AlertDialog open={!!deletingAditivoId} onOpenChange={(open) => !open && setDeletingAditivoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aditivo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este aditivo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deletingAditivoId && deleteAditivo(deletingAditivoId)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
