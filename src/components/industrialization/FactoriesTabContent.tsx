import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Calendar, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface FactoriesTabProps {
  companyId: string;
  contextId: string;
  contextType: "integrated" | "standalone";
}

interface IndPeriod {
  id: string; context_id: string; name: string; start_date: string;
  end_date: string; target_units: number; status: string;
}

interface IndService {
  id: string; context_id: string; name: string; category: string | null;
  display_order: number;
}

const EMPTY_PERIOD = {
  name: "", start_date: "", end_date: "", target_units: 0,
};

const EMPTY_SERVICE = { name: "", category: "", display_order: 0 };

export function FactoriesTabContent({ companyId, contextId }: FactoriesTabProps) {
  const { canEdit, requireEdit } = useAuth();
  const [periods, setPeriods] = useState<IndPeriod[]>([]);
  const [services, setServices] = useState<IndService[]>([]);

  const [periodDialog, setPeriodDialog] = useState(false);
  const [periodForm, setPeriodForm] = useState(EMPTY_PERIOD);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);

  const [serviceDialog, setServiceDialog] = useState(false);
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const [pRes, sRes] = await Promise.all([
      supabase.from("ind_periods").select("*").eq("context_id", contextId).order("start_date"),
      supabase.from("ind_services").select("*").eq("context_id", contextId).order("display_order"),
    ]);
    setPeriods((pRes.data || []) as IndPeriod[]);
    setServices((sRes.data || []) as IndService[]);
  }, [contextId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Period CRUD ───
  const openNewPeriod = () => { setPeriodForm({ ...EMPTY_PERIOD }); setEditingPeriodId(null); setPeriodDialog(true); };
  const openEditPeriod = (p: IndPeriod) => {
    setPeriodForm({ name: p.name, start_date: p.start_date, end_date: p.end_date, target_units: p.target_units });
    setEditingPeriodId(p.id);
    setPeriodDialog(true);
  };
  const savePeriod = async () => {
    if (!requireEdit()) return;
    if (!periodForm.name.trim() || !periodForm.start_date || !periodForm.end_date) { toast.error("Preencha todos os campos"); return; }
    const payload = { ...periodForm, context_id: contextId, company_id: companyId };
    if (editingPeriodId) {
      const { error } = await supabase.from("ind_periods").update(payload as any).eq("id", editingPeriodId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Período atualizado!");
    } else {
      const { error } = await supabase.from("ind_periods").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Período criado!");
    }
    setPeriodDialog(false);
    fetchAll();
  };

  // ─── Service CRUD ───
  const openNewService = () => { setServiceForm({ ...EMPTY_SERVICE }); setEditingServiceId(null); setServiceDialog(true); };
  const openEditService = (s: IndService) => {
    setServiceForm({ name: s.name, category: s.category || "", display_order: s.display_order });
    setEditingServiceId(s.id);
    setServiceDialog(true);
  };
  const saveService = async () => {
    if (!requireEdit()) return;
    if (!serviceForm.name.trim()) { toast.error("Nome obrigatório"); return; }
    const payload = { ...serviceForm, context_id: contextId, company_id: companyId, category: serviceForm.category || null };
    if (editingServiceId) {
      const { error } = await supabase.from("ind_services").update(payload as any).eq("id", editingServiceId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Serviço atualizado!");
    } else {
      const { error } = await supabase.from("ind_services").insert(payload as any);
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Serviço criado!");
    }
    setServiceDialog(false);
    fetchAll();
  };

  // ─── Delete handler ───
  const handleDelete = async () => {
    if (!requireEdit()) return;
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    const table = type === "period" ? "ind_periods" : "ind_services";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error(`Erro ao excluir: ${error.message}`); setDeleteTarget(null); return; }
    toast.success("Excluído!");
    setDeleteTarget(null);
    fetchAll();
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="periodos" className="w-full">
        <TabsList>
          <TabsTrigger value="periodos" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Períodos ({periods.length})
          </TabsTrigger>
          <TabsTrigger value="servicos" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Serviços ({services.length})
          </TabsTrigger>
        </TabsList>

        {/* ═══ PERÍODOS ═══ */}
        <TabsContent value="periodos" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewPeriod} className="gap-1.5" disabled={!canEdit}>
              <Plus className="h-4 w-4" /> Novo Período
            </Button>
          </div>

          {periods.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum período cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Início</TableHead>
                  <TableHead className="text-xs">Fim</TableHead>
                  <TableHead className="text-xs text-right">Meta</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.start_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.end_date + "T12:00:00"), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{p.target_units} un</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">{p.status || "draft"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditPeriod(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "period", id: p.id, label: p.name })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ═══ SERVIÇOS ═══ */}
        <TabsContent value="servicos" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openNewService} className="gap-1.5" disabled={!canEdit}>
              <Plus className="h-4 w-4" /> Novo Serviço
            </Button>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Wrench className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum serviço cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ordem</TableHead>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-muted-foreground">{s.display_order}</TableCell>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.category || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditService(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteTarget({ type: "service", id: s.id, label: s.name })}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOGS ═══ */}

      {/* Period Dialog */}
      <Dialog open={periodDialog} onOpenChange={setPeriodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingPeriodId ? "Editar Período" : "Novo Período"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={periodForm.name} onChange={e => setPeriodForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Quinzena 1 — Abril/2026" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Início</Label><Input type="date" value={periodForm.start_date} onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs" /></div>
              <div><Label className="text-xs">Fim</Label><Input type="date" value={periodForm.end_date} onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs" /></div>
            </div>
            <div><Label className="text-xs">Meta de Unidades</Label><Input type="number" value={periodForm.target_units} onChange={e => setPeriodForm(f => ({ ...f, target_units: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPeriodDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={savePeriod}>{editingPeriodId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Dialog */}
      <Dialog open={serviceDialog} onOpenChange={setServiceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingServiceId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Parede + Laje" /></div>
            <div><Label className="text-xs">Categoria</Label><Input value={serviceForm.category} onChange={e => setServiceForm(f => ({ ...f, category: e.target.value }))} className="h-8 text-xs" placeholder="Ex: Estrutural" /></div>
            <div><Label className="text-xs">Ordem de Exibição</Label><Input type="number" value={serviceForm.display_order} onChange={e => setServiceForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setServiceDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={saveService}>{editingServiceId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir <strong>{deleteTarget?.label}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
