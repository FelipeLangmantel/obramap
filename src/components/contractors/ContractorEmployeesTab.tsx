import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, UserCheck, UserX, Users, Search } from "lucide-react";
import { useEmployees, type Employee } from "@/hooks/useEmployees";
import { useProfessions } from "@/hooks/useProfessions";
import { useAuth } from "@/contexts/AuthContext";

export function ContractorEmployeesTab() {
  const { canEdit } = useAuth();
  const { employees, create, update, remove, internalContractId } = useEmployees();
  const { professions } = useProfessions({ onlyActive: true });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [form, setForm] = useState<Partial<Employee>>({});

  const openCreate = () => {
    setEditing(null);
    setForm({ active: true, worker_type: "professional" });
    setOpen(true);
  };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm(e);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    if (editing) await update(editing.id, form);
    else await create(form);
    setOpen(false);
  };

  const filtered = employees.filter(e => {
    if (!showInactive && !e.active) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const ativos = employees.filter(e => e.active).length;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Funcionários Próprios
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Mão de obra própria da empresa. Vinculada ao contrato interno
                <Badge variant="outline" className="ml-1 text-[10px]">Mão de Obra Própria</Badge>
                {internalContractId ? "" : " (será criado ao apontar)"}
              </p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Novo funcionário
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-[10px] uppercase text-muted-foreground">Total</div>
              <div className="text-xl font-bold">{employees.length}</div>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-[10px] uppercase text-muted-foreground">Ativos</div>
              <div className="text-xl font-bold text-green-600">{ativos}</div>
            </div>
            <div className="p-2 rounded border bg-muted/30">
              <div className="text-[10px] uppercase text-muted-foreground">Inativos</div>
              <div className="text-xl font-bold text-muted-foreground">{employees.length - ativos}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              <span>Mostrar inativos</span>
            </div>
          </div>

          <div className="rounded border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Função</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs text-right">Custo/h</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                      Nenhum funcionário {search ? "encontrado" : "cadastrado"}.
                    </TableCell>
                  </TableRow>
                ) : filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm font-medium">{e.name}</TableCell>
                    <TableCell className="text-xs">{e.profession || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {e.worker_type === "helper" ? "Ajudante" : "Profissional"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{e.cpf || "—"}</TableCell>
                    <TableCell className="text-xs text-right">
                      {e.cost_per_hour != null
                        ? e.cost_per_hour.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {e.active
                        ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]"><UserCheck className="h-3 w-3 mr-1" />Ativo</Badge>
                        : <Badge variant="outline" className="text-[10px]"><UserX className="h-3 w-3 mr-1" />Inativo</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover {e.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. Apontamentos de RDO já feitos
                                    em nome desse funcionário não serão alterados, mas ele não
                                    aparecerá mais para novos lançamentos.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => remove(e.id)}>Remover</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Função</Label>
                <Select
                  value={form.profession || ""}
                  onValueChange={v => {
                    const p = professions.find(x => x.name === v);
                    setForm({ ...form, profession: v, worker_type: p?.worker_type || form.worker_type });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {professions.map(p => (
                      <SelectItem key={p.id} value={p.name}>
                        {p.name} {p.worker_type === "helper" && <span className="text-muted-foreground text-xs">(aux.)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.worker_type || "professional"} onValueChange={v => setForm({ ...form, worker_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Profissional</SelectItem>
                    <SelectItem value="helper">Ajudante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">CPF (opcional)</Label>
                <Input value={form.cpf || ""} onChange={e => setForm({ ...form, cpf: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Custo/hora (R$)</Label>
                <Input
                  type="number" step="0.01" min={0}
                  value={form.cost_per_hour ?? ""}
                  onChange={e => setForm({ ...form, cost_per_hour: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Data de admissão</Label>
              <Input
                type="date"
                value={form.hire_date || ""}
                onChange={e => setForm({ ...form, hire_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.active ?? true} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!form.name?.trim()}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
