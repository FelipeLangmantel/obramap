import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {} from "@/components/ui/card";
import { DEFAULT_HEALTH_THRESHOLDS, loadHealthThresholds, HEALTH_THRESHOLDS, type HealthThresholds } from "@/components/holding/HoldingDashboardView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Building2, FileText, FlaskConical, Plus, Pencil, Trash2, GripVertical, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface HoldingEmpresa {
  id: string; company_id: string; nome: string; cnpj: string | null;
  responsavel: string | null; telefone: string | null; email: string | null;
  ativo: boolean; created_at: string;
}

interface DocTipo {
  id: string; company_id: string; nome: string;
  categoria: "doc_obra" | "ensaios_projetos";
  obrigatorio: boolean; ordem: number; ativo: boolean;
}

export default function HoldingConfigPage() {
  const { company, isCompanyAdmin } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // === Data ===
  const { data, isLoading } = useQuery({
    queryKey: ["holding-config", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const [empresasRes, docTiposRes] = await Promise.all([
        supabase.from("holding_empresas").select("*").eq("company_id", company!.id).order("nome"),
        supabase.from("holding_doc_tipos").select("*").eq("company_id", company!.id).order("ordem"),
      ]);
      return {
        empresas: (empresasRes.data || []) as HoldingEmpresa[],
        docTipos: (docTiposRes.data || []) as DocTipo[],
      };
    },
  });

  const empresas = data?.empresas || [];
  const docTipos = data?.docTipos || [];
  const docObra = useMemo(() => docTipos.filter(d => d.categoria === "doc_obra"), [docTipos]);
  const ensaios = useMemo(() => docTipos.filter(d => d.categoria === "ensaios_projetos"), [docTipos]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["holding-config"] });

  // === Empresa state ===
  const [showEmpresaDialog, setShowEmpresaDialog] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<HoldingEmpresa | null>(null);
  const [empresaForm, setEmpresaForm] = useState({ nome: "", cnpj: "", responsavel: "", telefone: "", email: "" });
  const [deletingEmpresaId, setDeletingEmpresaId] = useState<string | null>(null);

  const openNewEmpresa = () => {
    setEditingEmpresa(null);
    setEmpresaForm({ nome: "", cnpj: "", responsavel: "", telefone: "", email: "" });
    setShowEmpresaDialog(true);
  };
  const openEditEmpresa = (e: HoldingEmpresa) => {
    setEditingEmpresa(e);
    setEmpresaForm({ nome: e.nome, cnpj: e.cnpj || "", responsavel: e.responsavel || "", telefone: e.telefone || "", email: e.email || "" });
    setShowEmpresaDialog(true);
  };

  const saveEmpresa = async () => {
    if (!isCompanyAdmin) return;
    if (!empresaForm.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editingEmpresa) {
      const { error } = await supabase.from("holding_empresas").update(empresaForm as any).eq("id", editingEmpresa.id);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Empresa atualizada!");
    } else {
      const { error } = await supabase.from("holding_empresas").insert({ ...empresaForm, company_id: company!.id } as any);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Empresa criada!");
    }
    setShowEmpresaDialog(false);
    invalidate();
  };

  const deleteEmpresa = async () => {
    if (!isCompanyAdmin) return;
    if (!deletingEmpresaId) return;
    const { error } = await supabase.from("holding_empresas").delete().eq("id", deletingEmpresaId);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Empresa removida!");
    setDeletingEmpresaId(null);
    invalidate();
  };

  const toggleEmpresaAtivo = async (e: HoldingEmpresa) => {
    if (!isCompanyAdmin) return;
    await supabase.from("holding_empresas").update({ ativo: !e.ativo } as any).eq("id", e.id);
    invalidate();
  };

  // === Doc Tipo state ===
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocTipo | null>(null);
  const [docForm, setDocForm] = useState({ nome: "", obrigatorio: true });
  const [docCategoria, setDocCategoria] = useState<"doc_obra" | "ensaios_projetos">("doc_obra");
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const openNewDoc = (cat: "doc_obra" | "ensaios_projetos") => {
    setDocCategoria(cat);
    setEditingDoc(null);
    setDocForm({ nome: "", obrigatorio: true });
    setShowDocDialog(true);
  };
  const openEditDoc = (d: DocTipo) => {
    setDocCategoria(d.categoria);
    setEditingDoc(d);
    setDocForm({ nome: d.nome, obrigatorio: d.obrigatorio });
    setShowDocDialog(true);
  };

  const saveDocTipo = async () => {
    if (!isCompanyAdmin) return;
    if (!docForm.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editingDoc) {
      const { error } = await supabase.from("holding_doc_tipos").update({ nome: docForm.nome, obrigatorio: docForm.obrigatorio } as any).eq("id", editingDoc.id);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Documento atualizado!");
    } else {
      const existingCount = docTipos.filter(d => d.categoria === docCategoria).length;
      const { error } = await supabase.from("holding_doc_tipos").insert({
        company_id: company!.id, nome: docForm.nome, categoria: docCategoria,
        obrigatorio: docForm.obrigatorio, ordem: existingCount,
      } as any);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Documento criado!");
    }
    setShowDocDialog(false);
    invalidate();
  };

  const deleteDocTipo = async () => {
    if (!isCompanyAdmin) return;
    if (!deletingDocId) return;
    // First remove all obra_docs entries that reference this doc type
    await supabase.from("holding_obra_docs").delete().eq("doc_tipo_id", deletingDocId);
    // Then delete the doc type itself
    const { error } = await supabase.from("holding_doc_tipos").delete().eq("id", deletingDocId);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Documento removido!");
    setDeletingDocId(null);
    invalidate();
    // Also invalidate holding portfolio so dashboard updates
    queryClient.invalidateQueries({ queryKey: ["holding-portfolio"] });
  };

  const toggleDocAtivo = async (d: DocTipo) => {
    if (!isCompanyAdmin) return;
    await supabase.from("holding_doc_tipos").update({ ativo: !d.ativo } as any).eq("id", d.id);
    invalidate();
  };

  // === Render doc tab helper ===
  const renderDocTab = (categoria: "doc_obra" | "ensaios_projetos", items: DocTipo[]) => (
    <div className="space-y-4">
      <div className="bg-muted/50 border rounded-lg p-4 text-sm text-muted-foreground">
        Estes são os documentos padrão. Ao criar uma nova obra, todos serão adicionados
        automaticamente ao checklist. Você pode personalizar por obra na aba Documentos da obra.
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => openNewDoc(categoria)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Documento
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Nenhum documento configurado.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-center w-28">Obrigatório</TableHead>
                <TableHead className="text-center w-24">Status</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d, i) => (
                <TableRow key={d.id} className={!d.ativo ? "opacity-50" : ""}>
                  <TableCell><GripVertical className="h-4 w-4 text-muted-foreground" /></TableCell>
                  <TableCell className="font-medium">{d.nome}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={d.obrigatorio ? "default" : "secondary"} className="text-[10px]">
                      {d.obrigatorio ? "Obrigatório" : "Opcional"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={d.ativo} onCheckedChange={() => toggleDocAtivo(d)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDoc(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingDocId(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Configurações da Holding
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-10">
            Gerencie empresas, tipos de documentos e configurações globais
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={invalidate}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="empresas">
        <TabsList>
          <TabsTrigger value="empresas" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Empresas ({empresas.length})
          </TabsTrigger>
          <TabsTrigger value="doc_obra" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Pré Obra ({docObra.length})
          </TabsTrigger>
          <TabsTrigger value="ensaios" className="gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" /> Ensaios e Projetos ({ensaios.length})
          </TabsTrigger>
        </TabsList>

        {/* === EMPRESAS === */}
        <TabsContent value="empresas" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewEmpresa}>
              <Plus className="h-4 w-4 mr-1" /> Nova Empresa
            </Button>
          </div>

          {empresas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center w-20">Status</TableHead>
                    <TableHead className="text-right w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresas.map(e => (
                    <TableRow key={e.id} className={!e.ativo ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{e.nome}</TableCell>
                      <TableCell className="text-sm">{e.cnpj || "—"}</TableCell>
                      <TableCell className="text-sm">{e.responsavel || "—"}</TableCell>
                      <TableCell className="text-sm">{e.telefone || "—"}</TableCell>
                      <TableCell className="text-sm">{e.email || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={e.ativo} onCheckedChange={() => toggleEmpresaAtivo(e)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEmpresa(e)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingEmpresaId(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* === DOCUMENTOS BASE === */}
        <TabsContent value="doc_obra" className="mt-4">
          {renderDocTab("doc_obra", docObra)}
        </TabsContent>

        {/* === ENSAIOS E PROJETOS === */}
        <TabsContent value="ensaios" className="mt-4">
          {renderDocTab("ensaios_projetos", ensaios)}
        </TabsContent>
      </Tabs>

      {/* === EMPRESA DIALOG === */}
      <Dialog open={showEmpresaDialog} onOpenChange={setShowEmpresaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmpresa ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={empresaForm.nome} onChange={e => setEmpresaForm(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input value={empresaForm.cnpj} onChange={e => setEmpresaForm(p => ({ ...p, cnpj: e.target.value }))} />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input value={empresaForm.responsavel} onChange={e => setEmpresaForm(p => ({ ...p, responsavel: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefone</Label>
                <Input value={empresaForm.telefone} onChange={e => setEmpresaForm(p => ({ ...p, telefone: e.target.value }))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={empresaForm.email} onChange={e => setEmpresaForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmpresaDialog(false)}>Cancelar</Button>
            <Button onClick={saveEmpresa}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === DOC TIPO DIALOG === */}
      <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDoc ? "Editar Documento" : "Novo Documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do documento *</Label>
              <Input value={docForm.nome} onChange={e => setDocForm(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Este documento é obrigatório para todas as obras</Label>
              <Switch checked={docForm.obrigatorio} onCheckedChange={v => setDocForm(p => ({ ...p, obrigatorio: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocDialog(false)}>Cancelar</Button>
            <Button onClick={saveDocTipo}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === DELETE EMPRESA CONFIRM === */}
      <AlertDialog open={!!deletingEmpresaId} onOpenChange={open => !open && setDeletingEmpresaId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A empresa será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEmpresa} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === DELETE DOC CONFIRM === */}
      <AlertDialog open={!!deletingDocId} onOpenChange={open => !open && setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se este documento estiver em uso por alguma obra, ele será desativado em vez de excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDocTipo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
