import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FolderOpen, FileCheck2, AlertTriangle, CheckCircle2, XCircle, Download, Building2, ClipboardList, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

// ─── Constants ───
const DOC_OBRA_FIELDS = [
  { key: "ata", label: "Ata" },
  { key: "ois", label: "OIS" },
  { key: "art", label: "ART" },
  { key: "cno", label: "CNO" },
  { key: "impl", label: "Impl" },
  { key: "scp", label: "SCP" },
] as const;

const ENSAIOS_FIELDS = [
  { key: "sondagem_spt", label: "Sondagem SPT" },
  { key: "planta_localizacao", label: "Planta Localiz." },
  { key: "plano_altimetrico", label: "Plano Altim." },
  { key: "painel_bordo", label: "Painel Bordo" },
  { key: "checklist_seguranca", label: "Check Seg." },
] as const;

function countDocObra(docs: any): number {
  if (!docs) return 0;
  return DOC_OBRA_FIELDS.reduce((s, f) => s + (docs[f.key] ? 1 : 0), 0);
}

function countAcomp(docs: any): number {
  if (!docs) return 0;
  return ACOMP_FIELDS.reduce((s, f) => s + (docs[f.key] ? 1 : 0), 0);
}

function healthDocs(docCount: number, acompCount: number): "verde" | "amarelo" | "vermelho" {
  if (docCount >= 5 && acompCount >= 4) return "verde";
  if (docCount >= 3 && acompCount >= 2) return "amarelo";
  return "vermelho";
}

const HEALTH_DOT: Record<string, string> = {
  verde: "text-emerald-500",
  amarelo: "text-amber-500",
  vermelho: "text-red-500",
};

interface ObraDoc {
  id: string;
  nome: string;
  empresa: string | null;
  uh: number | null;
  tipo_contrato: string | null;
  status: string;
  docs: any;
  docCount: number;
  acompCount: number;
  health: "verde" | "amarelo" | "vermelho";
  pendenciasAbertas: number;
}

export default function HoldingDocumentosPage() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("geral");
  const [filterEmpresa, setFilterEmpresa] = useState("all");
  const [filterSaude, setFilterSaude] = useState("all");
  const [filterPendStatus, setFilterPendStatus] = useState("abertas");
  const [filterPendObra, setFilterPendObra] = useState("all");
  const [detailObra, setDetailObra] = useState<ObraDoc | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["holding-documentos", company?.id],
    queryFn: async () => {
      const [obrasRes, docsRes, pendRes] = await Promise.all([
        supabase.from("obras_portfolio").select("id, nome, empresa, uh, tipo_contrato, status").eq("company_id", company!.id),
        supabase.from("documentos_obra").select("*"),
        supabase.from("pendencias_projeto").select("*"),
      ]);
      return {
        obras: obrasRes.data || [],
        docs: docsRes.data || [],
        pendencias: pendRes.data || [],
      };
    },
    enabled: !!company?.id,
  });

  const obras = data?.obras || [];
  const docsRaw = data?.docs || [];
  const pendencias = data?.pendencias || [];

  const docsMap = useMemo(() => new Map(docsRaw.map((d: any) => [d.obra_id, d])), [docsRaw]);
  const pendMap = useMemo(() => {
    const m = new Map<string, number>();
    pendencias.forEach((p: any) => {
      if (!p.concluido) m.set(p.obra_id, (m.get(p.obra_id) || 0) + 1);
    });
    return m;
  }, [pendencias]);

  const obrasDoc: ObraDoc[] = useMemo(() => {
    return obras.map(o => {
      const docs = docsMap.get(o.id) || null;
      const dc = countDocObra(docs);
      const ac = countAcomp(docs);
      return {
        id: o.id, nome: o.nome, empresa: o.empresa, uh: o.uh,
        tipo_contrato: o.tipo_contrato, status: o.status,
        docs, docCount: dc, acompCount: ac,
        health: healthDocs(dc, ac),
        pendenciasAbertas: pendMap.get(o.id) || 0,
      };
    });
  }, [obras, docsMap, pendMap]);

  const obrasFiltradas = useMemo(() => {
    return obrasDoc.filter(o => {
      if (filterEmpresa !== "all" && o.empresa !== filterEmpresa) return false;
      if (filterSaude !== "all" && o.health !== filterSaude) return false;
      return true;
    });
  }, [obrasDoc, filterEmpresa, filterSaude]);

  const uniqueEmpresas = useMemo(() => [...new Set(obras.map(o => o.empresa).filter(Boolean))], [obras]);

  const kpis = useMemo(() => {
    const completa = obrasDoc.filter(o => o.docCount >= 6 && o.acompCount >= 5).length;
    const parcial = obrasDoc.filter(o => o.health === "amarelo").length;
    const critica = obrasDoc.filter(o => o.docCount < 3).length;
    const pendAberta = pendencias.filter((p: any) => !p.concluido).length;
    return { total: obrasDoc.length, completa, parcial, critica, pendAberta };
  }, [obrasDoc, pendencias]);

  const avgDoc = obrasDoc.length > 0 ? obrasDoc.reduce((s, o) => s + o.docCount, 0) / obrasDoc.length : 0;
  const avgAcomp = obrasDoc.length > 0 ? obrasDoc.reduce((s, o) => s + o.acompCount, 0) / obrasDoc.length : 0;

  const pendenciasFiltradas = useMemo(() => {
    return pendencias.filter((p: any) => {
      if (filterPendObra !== "all" && p.obra_id !== filterPendObra) return false;
      if (filterPendStatus === "abertas" && p.concluido) return false;
      if (filterPendStatus === "concluidas" && !p.concluido) return false;
      return true;
    }).map((p: any) => {
      const obra = obras.find(o => o.id === p.obra_id);
      return { ...p, obra_nome: obra?.nome || "—", obra_empresa: obra?.empresa || "" };
    });
  }, [pendencias, filterPendObra, filterPendStatus, obras]);

  const exportCSV = () => {
    const h = ["Obra", "Empresa", "Doc_Obra", "Acomp_Obra", "Saúde", "Pendências Abertas",
      ...DOC_OBRA_FIELDS.map(f => f.label), ...ACOMP_FIELDS.map(f => f.label)];
    const rows = obrasFiltradas.map(o => [
      o.nome, o.empresa || "", `${o.docCount}/6`, `${o.acompCount}/5`, o.health, o.pendenciasAbertas,
      ...DOC_OBRA_FIELDS.map(f => o.docs?.[f.key] ? "Sim" : "Não"),
      ...ACOMP_FIELDS.map(f => o.docs?.[f.key] ? "Sim" : "Não"),
    ]);
    const csv = [h, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `documentacao-holding-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  if (isLoading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <div className="h-screen flex w-full overflow-hidden">
          <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
          <main className="flex-1 min-w-0 h-full overflow-auto flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </main>
        </div>
      </SidebarProvider>
    );
  }

  const kpiCards = [
    { label: "Total Obras", value: kpis.total, border: "border-b-primary", icon: Building2 },
    { label: "Doc Completa", value: kpis.completa, border: "border-b-emerald-500", icon: CheckCircle2 },
    { label: "Doc Parcial", value: kpis.parcial, border: "border-b-amber-500", icon: AlertTriangle },
    { label: "Doc Crítica", value: kpis.critica, border: "border-b-red-500", icon: XCircle },
    { label: "Pendências Abertas", value: kpis.pendAberta, border: "border-b-amber-500", icon: ClipboardList },
  ];

  const CheckMark = ({ ok }: { ok: boolean }) => ok
    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : <XCircle className="h-4 w-4 text-muted-foreground/40" />;

  const scoreColor = (count: number, max: number) =>
    count >= max ? "text-emerald-600" : count >= max * 0.5 ? "text-amber-600" : "text-red-600";

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar activeView="holding-dashboard" onViewChange={() => navigate("/dashboard")} />
        <main className="flex-1 min-w-0 h-full overflow-auto">
    <div className="space-y-6 p-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> Documentação das Obras
          </h1>
          <p className="text-xs text-muted-foreground">Controle consolidado de documentos — todas as obras</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["holding-documentos"] })}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpiCards.map((k, i) => (
          <Card key={i} className={`border-b-2 ${k.border}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <p className="text-xl font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="doc_obra">Doc_Obra</TabsTrigger>
          <TabsTrigger value="acomp">Acomp_Obra</TabsTrigger>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
        </TabsList>

        {/* ═══ VISÃO GERAL ═══ */}
        <TabsContent value="geral" className="space-y-4 mt-4">
          {/* Progress bars */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Documentação média do portfólio</p>
                <Progress value={(avgDoc / 6) * 100} className="h-3" />
                <p className="text-xs text-right mt-1 text-muted-foreground">{avgDoc.toFixed(1)}/6 ({((avgDoc / 6) * 100).toFixed(0)}%)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Acompanhamento médio</p>
                <Progress value={(avgAcomp / 5) * 100} className="h-3" />
                <p className="text-xs text-right mt-1 text-muted-foreground">{avgAcomp.toFixed(1)}/5 ({((avgAcomp / 5) * 100).toFixed(0)}%)</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueEmpresas.map(e => <SelectItem key={e!} value={e!}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSaude} onValueChange={setFilterSaude}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Saúde Docs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="verde">✅ Completa</SelectItem>
                <SelectItem value="amarelo">⚠️ Parcial</SelectItem>
                <SelectItem value="vermelho">🔴 Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs text-center">Doc_Obra</TableHead>
                  <TableHead className="text-xs text-center">Acomp_Obra</TableHead>
                  <TableHead className="text-xs text-center">Saúde</TableHead>
                  <TableHead className="text-xs">Status Obra</TableHead>
                  <TableHead className="text-xs text-center">Pendências</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obrasFiltradas.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma obra encontrada</TableCell></TableRow>
                ) : obrasFiltradas.map((o, i) => (
                  <TableRow key={o.id} className={`cursor-pointer hover:bg-muted/40 ${i % 2 ? "bg-muted/20" : ""}`} onClick={() => setDetailObra(o)}>
                    <TableCell className="text-xs font-medium">{o.nome}</TableCell>
                    <TableCell className="text-xs">{o.empresa || "—"}</TableCell>
                    <TableCell className={`text-xs text-center font-semibold ${scoreColor(o.docCount, 6)}`}>{o.docCount}/6</TableCell>
                    <TableCell className={`text-xs text-center font-semibold ${scoreColor(o.acompCount, 5)}`}>{o.acompCount}/5</TableCell>
                    <TableCell className="text-center"><span className={`text-lg ${HEALTH_DOT[o.health]}`}>●</span></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{o.status?.replace("_", " ") || "—"}</Badge></TableCell>
                    <TableCell className="text-center">
                      {o.pendenciasAbertas > 0
                        ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]">{o.pendenciasAbertas}</Badge>
                        : <span className="text-xs text-muted-foreground">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══ DOC_OBRA ═══ */}
        <TabsContent value="doc_obra" className="mt-4">
          <div className="border rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  {DOC_OBRA_FIELDS.map(f => <TableHead key={f.key} className="text-xs text-center">{f.label}</TableHead>)}
                  <TableHead className="text-xs text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obrasFiltradas.map((o, i) => (
                  <TableRow key={o.id} className={i % 2 ? "bg-muted/20" : ""}>
                    <TableCell className="text-xs font-medium">{o.nome}</TableCell>
                    <TableCell className="text-xs">{o.empresa || "—"}</TableCell>
                    {DOC_OBRA_FIELDS.map(f => (
                      <TableCell key={f.key} className="text-center"><CheckMark ok={!!o.docs?.[f.key]} /></TableCell>
                    ))}
                    <TableCell className={`text-xs text-center font-semibold ${scoreColor(o.docCount, 6)}`}>{o.docCount}/6</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══ ACOMP_OBRA ═══ */}
        <TabsContent value="acomp" className="mt-4">
          <div className="border rounded-lg overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  {ACOMP_FIELDS.map(f => <TableHead key={f.key} className="text-xs text-center">{f.label}</TableHead>)}
                  <TableHead className="text-xs text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obrasFiltradas.map((o, i) => (
                  <TableRow key={o.id} className={i % 2 ? "bg-muted/20" : ""}>
                    <TableCell className="text-xs font-medium">{o.nome}</TableCell>
                    {ACOMP_FIELDS.map(f => (
                      <TableCell key={f.key} className="text-center"><CheckMark ok={!!o.docs?.[f.key]} /></TableCell>
                    ))}
                    <TableCell className={`text-xs text-center font-semibold ${scoreColor(o.acompCount, 5)}`}>{o.acompCount}/5</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ═══ PENDÊNCIAS ═══ */}
        <TabsContent value="pendencias" className="space-y-3 mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterPendObra} onValueChange={setFilterPendObra}>
              <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Obras</SelectItem>
                {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPendStatus} onValueChange={setFilterPendStatus}>
              <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="abertas">Abertas</SelectItem>
                <SelectItem value="concluidas">Concluídas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {pendenciasFiltradas.length} pendência{pendenciasFiltradas.length !== 1 ? "s" : ""} encontrada{pendenciasFiltradas.length !== 1 ? "s" : ""} em {new Set(pendenciasFiltradas.map((p: any) => p.obra_id)).size} obra{new Set(pendenciasFiltradas.map((p: any) => p.obra_id)).size !== 1 ? "s" : ""}
          </p>

          <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Empresa</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendenciasFiltradas.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma pendência encontrada</TableCell></TableRow>
                ) : pendenciasFiltradas.map((p: any, i: number) => (
                  <TableRow key={p.id} className={i % 2 ? "bg-muted/20" : ""}>
                    <TableCell className="text-xs font-medium">{p.obra_nome}</TableCell>
                    <TableCell className="text-xs">{p.obra_empresa || "—"}</TableCell>
                    <TableCell className="text-xs">{p.tipo || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate">{p.descricao || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={p.concluido ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px]" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px]"}>
                        {p.concluido ? "Concluída" : "Aberta"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!detailObra} onOpenChange={(o) => !o && setDetailObra(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5" /> {detailObra?.nome}
            </DialogTitle>
          </DialogHeader>
          {detailObra && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Documentos Base ({detailObra.docCount}/6)</p>
                <div className="grid grid-cols-2 gap-2">
                  {DOC_OBRA_FIELDS.map(f => (
                    <div key={f.key} className="flex items-center gap-2 text-xs">
                      <CheckMark ok={!!detailObra.docs?.[f.key]} />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Acompanhamento ({detailObra.acompCount}/5)</p>
                <div className="grid grid-cols-2 gap-2">
                  {ACOMP_FIELDS.map(f => (
                    <div key={f.key} className="flex items-center gap-2 text-xs">
                      <CheckMark ok={!!detailObra.docs?.[f.key]} />
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className={`text-lg ${HEALTH_DOT[detailObra.health]}`}>●</span>
                <span className="text-xs">Saúde: <strong>{detailObra.health}</strong></span>
                {detailObra.pendenciasAbertas > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] ml-auto">{detailObra.pendenciasAbertas} pendência(s)</Badge>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
