import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileText, ClipboardCheck, Plus, Loader2, ListChecks } from "lucide-react";
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { format } from "date-fns";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface ObraDetailDrawerProps {
  obraId: string | null;
  obraNome: string;
  obraUH?: number | null;
  obraResponsavel?: string | null;
  obraTipoContrato?: string | null;
  onClose: () => void;
}

export default function ObraDetailDrawer({ obraId, obraNome, obraUH, obraResponsavel, obraTipoContrato, onClose }: ObraDetailDrawerProps) {
  return (
    <Sheet open={!!obraId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-[60vw] overflow-y-auto p-0">
        {obraId && <ObraDetailContent obraId={obraId} obraNome={obraNome} obraUH={obraUH} obraResponsavel={obraResponsavel} obraTipoContrato={obraTipoContrato} />}
      </SheetContent>
    </Sheet>
  );
}

function ObraDetailContent({ obraId, obraNome, obraUH, obraResponsavel, obraTipoContrato }: { obraId: string; obraNome: string; obraUH?: number | null; obraResponsavel?: string | null; obraTipoContrato?: string | null }) {
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-6 pt-6 pb-4">
        <SheetTitle className="text-lg">{obraNome}</SheetTitle>
        <div className="flex items-center gap-2 flex-wrap">
          {obraTipoContrato && <Badge variant="outline" className="text-[10px]">{obraTipoContrato}</Badge>}
          {obraUH && <Badge variant="secondary" className="text-[10px]">{obraUH} UH</Badge>}
          {obraResponsavel && <span className="text-[10px] text-muted-foreground">👤 {obraResponsavel}</span>}
        </div>
      </SheetHeader>
      <Tabs defaultValue="documentos" className="flex-1 flex flex-col">
        <TabsList className="mx-6 w-fit">
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="medicoes">Medições</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="aditivos">Aditivos</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <TabsContent value="documentos" className="mt-0"><DocumentosTab obraId={obraId} /></TabsContent>
          <TabsContent value="medicoes" className="mt-0"><MedicoesTab obraId={obraId} /></TabsContent>
          <TabsContent value="financeiro" className="mt-0"><FinanceiroTab obraId={obraId} /></TabsContent>
          <TabsContent value="aditivos" className="mt-0"><AditivosTab obraId={obraId} /></TabsContent>
          <TabsContent value="pendencias" className="mt-0"><PendenciasTab obraId={obraId} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 1 — DOCUMENTOS
   ══════════════════════════════════════════════ */

const DOC_OBRA_FIELDS: { key: string; label: string }[] = [
  { key: "ata", label: "Ata" },
  { key: "ois", label: "OIS" },
  { key: "art", label: "ART" },
  { key: "cno", label: "CNO" },
  { key: "impl", label: "Implantação" },
  { key: "scp", label: "SCP" },
];

const ACOMP_OBRA_FIELDS: { key: string; label: string }[] = [
  { key: "sondagem_spt", label: "Sondagem e SPT" },
  { key: "planta_localizacao", label: "Planta Localização" },
  { key: "plano_altimetrico", label: "Plano Altimétrico" },
  { key: "painel_bordo", label: "Painel de Bordo" },
  { key: "checklist_seguranca", label: "Checklist Segurança" },
];

function DocumentosTab({ obraId }: { obraId: string }) {
  const [docs, setDocs] = useState<Record<string, boolean> | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("documentos_obra")
      .select("*")
      .eq("obra_id", obraId)
      .maybeSingle();

    if (data) {
      setDocId(data.id);
      const { id: _id, obra_id: _oid, ...fields } = data as any;
      setDocs(fields);
    } else {
      // Create doc row
      const { data: created } = await supabase
        .from("documentos_obra")
        .insert({ obra_id: obraId } as any)
        .select()
        .single();
      if (created) {
        setDocId(created.id);
        const { id: _id2, obra_id: _oid2, ...fields } = created as any;
        setDocs(fields);
      }
    }
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, value: boolean) => {
    if (!docId) return;
    setDocs((prev) => prev ? { ...prev, [key]: value } : prev);
    await supabase.from("documentos_obra").update({ [key]: value } as any).eq("id", docId);
  };

  if (loading || !docs) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const docObraCount = DOC_OBRA_FIELDS.filter((f) => docs[f.key]).length;
  const acompCount = ACOMP_OBRA_FIELDS.filter((f) => docs[f.key]).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Doc_Obra
            </h4>
            <Badge variant={docObraCount === 6 ? "default" : "secondary"} className={docObraCount === 6 ? "bg-emerald-600" : ""}>
              {docObraCount}/6
            </Badge>
          </div>
          {DOC_OBRA_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between">
              <span className="text-sm">{f.label}</span>
              <Switch checked={!!docs[f.key]} onCheckedChange={(v) => toggle(f.key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4" /> Acomp_Obra
            </h4>
            <Badge variant={acompCount === 5 ? "default" : "secondary"} className={acompCount === 5 ? "bg-emerald-600" : ""}>
              {acompCount}/5
            </Badge>
          </div>
          {ACOMP_OBRA_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between">
              <span className="text-sm">{f.label}</span>
              <Switch checked={!!docs[f.key]} onCheckedChange={(v) => toggle(f.key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 2 — MEDIÇÕES
   ══════════════════════════════════════════════ */

const MEDICAO_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aprovada: { label: "Aprovada", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  enviada: { label: "Enviada", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciada: { label: "Não Iniciada", cls: "bg-muted text-muted-foreground" },
};

const NF_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  recebido: { label: "Recebido", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  aguardando_aprovacao: { label: "Aguardando", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
};

function MedicoesTab({ obraId }: { obraId: string }) {
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(),
    data_envio: "", data_aprovacao: "", status_medicao: "nao_iniciada",
    valor_medicao: 0, num_nf: "", data_pagamento: "", status_nf: "pendente",
  });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("medicoes_ple")
      .select("*")
      .eq("obra_id", obraId)
      .order("ano_referencia", { ascending: false });
    setMedicoes(data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const addMedicao = async () => {
    const payload: any = { obra_id: obraId, ...form };
    if (!payload.data_envio) delete payload.data_envio;
    if (!payload.data_aprovacao) delete payload.data_aprovacao;
    if (!payload.data_pagamento) delete payload.data_pagamento;
    const { error } = await supabase.from("medicoes_ple").insert(payload);
    if (error) { toast.error("Erro ao salvar medição"); return; }
    toast.success("Medição adicionada");
    setShowForm(false);
    setForm({ num_medicao: "", mes_referencia: "", ano_referencia: new Date().getFullYear(), data_envio: "", data_aprovacao: "", status_medicao: "nao_iniciada", valor_medicao: 0, num_nf: "", data_pagamento: "", status_nf: "pendente" });
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Medições ({medicoes.length})</h4>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Medição
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-muted-foreground">Nº Medição</label><Input value={form.num_medicao} onChange={(e) => setForm({ ...form, num_medicao: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Mês Ref.</label>
              <Select value={form.mes_referencia} onValueChange={(v) => setForm({ ...form, mes_referencia: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">Ano Ref.</label><Input type="number" value={form.ano_referencia} onChange={(e) => setForm({ ...form, ano_referencia: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">Valor</label><Input type="number" value={form.valor_medicao} onChange={(e) => setForm({ ...form, valor_medicao: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">Data Envio</label><Input type="date" value={form.data_envio} onChange={(e) => setForm({ ...form, data_envio: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Data Aprovação</label><Input type="date" value={form.data_aprovacao} onChange={(e) => setForm({ ...form, data_aprovacao: e.target.value })} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Status Medição</label>
              <Select value={form.status_medicao} onValueChange={(v) => setForm({ ...form, status_medicao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao_iniciada">Não Iniciada</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="aprovada">Aprovada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">Nº NF</label><Input value={form.num_nf} onChange={(e) => setForm({ ...form, num_nf: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Data Pagamento</label><Input type="date" value={form.data_pagamento} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Status NF</label>
              <Select value={form.status_nf} onValueChange={(v) => setForm({ ...form, status_nf: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aguardando_aprovacao">Aguardando</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button size="sm" onClick={addMedicao}>Salvar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Mês/Ano</TableHead>
              <TableHead>Envio</TableHead>
              <TableHead>Aprovação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Status NF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {medicoes.map((m) => {
              const ms = MEDICAO_STATUS_BADGE[m.status_medicao] || MEDICAO_STATUS_BADGE.nao_iniciada;
              const ns = NF_STATUS_BADGE[m.status_nf] || NF_STATUS_BADGE.pendente;
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.num_medicao || "—"}</TableCell>
                  <TableCell>{m.mes_referencia}/{m.ano_referencia}</TableCell>
                  <TableCell>{m.data_envio ? format(new Date(m.data_envio), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell>{m.data_aprovacao ? format(new Date(m.data_aprovacao), "dd/MM/yy") : "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-[10px] ${ms.cls}`}>{ms.label}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{BRL.format(m.valor_medicao)}</TableCell>
                  <TableCell>{m.num_nf || "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-[10px] ${ns.cls}`}>{ns.label}</Badge></TableCell>
                </TableRow>
              );
            })}
            {medicoes.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma medição.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 3 — FINANCEIRO
   ══════════════════════════════════════════════ */

const DESPESA_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  fechado: { label: "Fechado", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  em_fechamento: { label: "Em Fechamento", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  nao_iniciado: { label: "Não Iniciado", cls: "bg-muted text-muted-foreground" },
};

function FinanceiroTab({ obraId }: { obraId: string }) {
  const [despesas, setDespesas] = useState<any[]>([]);
  const [medicoes, setMedicoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDespesa, setShowNewDespesa] = useState(false);
  const [newDespesa, setNewDespesa] = useState({ mes_referencia: "", ano_referencia: String(new Date().getFullYear()), valor: "", status: "nao_iniciado" });
  const [savingDespesa, setSavingDespesa] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      supabase.from("despesas_mensais").select("*").eq("obra_id", obraId).order("ano_referencia").order("mes_referencia"),
      supabase.from("medicoes_ple").select("*").eq("obra_id", obraId).eq("status_medicao", "aprovada"),
    ]).then(([dRes, mRes]) => {
      setDespesas(dRes.data || []);
      setMedicoes(mRes.data || []);
      setLoading(false);
    });
  }, [obraId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveDespesa = async () => {
    if (!newDespesa.mes_referencia || !newDespesa.valor) {
      toast.warning("Preencha mês e valor.");
      return;
    }
    setSavingDespesa(true);
    const { error } = await supabase.from("despesas_mensais").insert({
      obra_id: obraId,
      mes_referencia: newDespesa.mes_referencia,
      ano_referencia: Number(newDespesa.ano_referencia),
      valor: Number(newDespesa.valor),
      status: newDespesa.status as any,
    });
    setSavingDespesa(false);
    if (error) { toast.error("Erro ao salvar despesa."); return; }
    toast.success("Despesa adicionada!");
    setNewDespesa({ mes_referencia: "", ano_referencia: String(new Date().getFullYear()), valor: "", status: "nao_iniciado" });
    setShowNewDespesa(false);
    loadData();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const monthMap = new Map<string, { despesa: number; receita: number }>();
  despesas.forEach((d) => {
    const key = `${d.mes_referencia}/${d.ano_referencia}`;
    const entry = monthMap.get(key) || { despesa: 0, receita: 0 };
    entry.despesa += d.valor || 0;
    monthMap.set(key, entry);
  });
  medicoes.forEach((m) => {
    const key = `${m.mes_referencia}/${m.ano_referencia}`;
    const entry = monthMap.get(key) || { despesa: 0, receita: 0 };
    entry.receita += m.valor_medicao || 0;
    monthMap.set(key, entry);
  });
  const chartData = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  return (
    <div className="space-y-6">
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold text-sm mb-3">Despesas × Receitas</h4>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => BRL.format(v)} />
                <Bar dataKey="despesa" fill="hsl(var(--destructive))" name="Despesas" radius={[4, 4, 0, 0]} />
                <Line dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} name="Receitas" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">Despesas</h4>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewDespesa(!showNewDespesa)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nova Despesa
        </Button>
      </div>

      {showNewDespesa && (
        <Card className="border-dashed">
          <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Mês</label>
                <Select value={newDespesa.mes_referencia} onValueChange={(v) => setNewDespesa(p => ({ ...p, mes_referencia: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ano</label>
                <Input type="number" value={newDespesa.ano_referencia} onChange={(e) => setNewDespesa(p => ({ ...p, ano_referencia: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Valor (R$)</label>
                <Input type="number" value={newDespesa.valor} onChange={(e) => setNewDespesa(p => ({ ...p, valor: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={newDespesa.status} onValueChange={(v) => setNewDespesa(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_iniciado">Não Iniciado</SelectItem>
                    <SelectItem value="em_fechamento">Em Fechamento</SelectItem>
                    <SelectItem value="fechado">Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-xs" onClick={handleSaveDespesa} disabled={savingDespesa}>
                {savingDespesa ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês/Ano</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despesas.map((d) => {
              const s = DESPESA_STATUS_BADGE[d.status] || DESPESA_STATUS_BADGE.nao_iniciado;
              return (
                <TableRow key={d.id}>
                  <TableCell>{d.mes_referencia}/{d.ano_referencia}</TableCell>
                  <TableCell className="text-right font-mono">{BRL.format(d.valor)}</TableCell>
                  <TableCell><Badge variant="secondary" className={`text-[10px] ${s.cls}`}>{s.label}</Badge></TableCell>
                </TableRow>
              );
            })}
            {despesas.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhuma despesa registrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 4 — ADITIVOS
   ══════════════════════════════════════════════ */

function AditivosTab({ obraId }: { obraId: string }) {
  const [aditivos, setAditivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("aditivos_contratos").select("*").eq("obra_id", obraId).order("data")
      .then(({ data }) => { setAditivos(data || []); setLoading(false); });
  }, [obraId]);

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const totalDias = aditivos.reduce((s, a) => s + (a.aditivo_prazo_dias || 0), 0);
  const totalValor = aditivos.reduce((s, a) => s + (a.aditivo_valor || 0), 0);
  const totalSupressao = aditivos.reduce((s, a) => s + (a.supressao_valor || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Badge variant="outline" className="text-xs">Total dias aditivados: {totalDias}</Badge>
        <Badge variant="outline" className="text-xs">Total valor: {BRL.format(totalValor)}</Badge>
        {totalSupressao > 0 && <Badge variant="outline" className="text-xs text-red-600">Supressão: {BRL.format(totalSupressao)}</Badge>}
      </div>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {aditivos.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.num_aditivo || "—"}</TableCell>
                <TableCell>{a.aditivo_prazo_dias > 0 ? `+${a.aditivo_prazo_dias}` : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.aditivo_valor > 0 ? BRL.format(a.aditivo_valor) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{a.supressao_valor > 0 ? BRL.format(a.supressao_valor) : "—"}</TableCell>
                <TableCell>{a.data ? format(new Date(a.data), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-[10px] ${a.status === "aprovado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                    {a.status === "aprovado" ? "Aprovado" : "Pendente"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {aditivos.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum aditivo.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   TAB 5 — PENDÊNCIAS
   ══════════════════════════════════════════════ */

function PendenciasTab({ obraId }: { obraId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTipo, setNewTipo] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("pendencias_projeto").select("*").eq("obra_id", obraId).order("concluido").order("tipo");
    setItems(data || []);
    setLoading(false);
  }, [obraId]);

  useEffect(() => { load(); }, [load]);

  const toggleConcluido = async (id: string, value: boolean) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, concluido: value } : i));
    await supabase.from("pendencias_projeto").update({ concluido: value } as any).eq("id", id);
  };

  const addPendencia = async () => {
    if (!newDesc.trim()) { toast.warning("Preencha a descrição"); return; }
    await supabase.from("pendencias_projeto").insert({ obra_id: obraId, tipo: newTipo || null, descricao: newDesc } as any);
    setNewTipo(""); setNewDesc("");
    toast.success("Pendência adicionada");
    load();
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mt-8" />;

  const pendentes = items.filter((i) => !i.concluido).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" /> Pendências
          {pendentes > 0 && <Badge variant="destructive" className="text-[10px] ml-1">{pendentes}</Badge>}
        </h4>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={`flex items-start gap-3 rounded-md border px-3 py-2 ${item.concluido ? "bg-muted/30 opacity-60" : ""}`}>
            <Checkbox checked={item.concluido} onCheckedChange={(v) => toggleConcluido(item.id, !!v)} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              {item.tipo && <Badge variant="outline" className="text-[10px] mr-1.5">{item.tipo}</Badge>}
              <span className={`text-sm ${item.concluido ? "line-through text-muted-foreground" : ""}`}>{item.descricao}</span>
            </div>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex items-end gap-2">
        <div className="flex-shrink-0">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Input value={newTipo} onChange={(e) => setNewTipo(e.target.value)} placeholder="Ex: Alvará" className="w-32" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Descrição</label>
          <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descreva a pendência..." />
        </div>
        <Button size="sm" onClick={addPendencia}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
      </div>
    </div>
  );
}
