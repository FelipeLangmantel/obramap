import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { useProfessions, type Profession } from "@/hooks/useProfessions";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const DEFAULT_CATEGORIES = [
  "Estrutura / Alvenaria",
  "Instalações",
  "Acabamentos",
  "Cobertura",
  "Externos / Apoio",
  "Outros",
];

export function ProfessionsManagementDialog({ open, onOpenChange }: Props) {
  const { canEdit } = useAuth();
  const { professions, create, update, remove } = useProfessions();
  const [editing, setEditing] = useState<Profession | null>(null);
  const [form, setForm] = useState<Partial<Profession>>({ active: true, worker_type: "professional", category: "Outros" });
  const [showForm, setShowForm] = useState(false);

  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...professions.map(p => p.category)]));

  const grouped = categories
    .map(cat => [cat, professions.filter(p => p.category === cat)] as const)
    .filter(([_, list]) => list.length > 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ active: true, worker_type: "professional", category: "Outros" });
    setShowForm(true);
  };
  const openEdit = (p: Profession) => {
    setEditing(p);
    setForm(p);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    if (editing) await update(editing.id, form);
    else await create(form);
    setShowForm(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Catálogo de Profissões
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Profissões usadas no Diário de Obras (apontamento de trabalhadores) e em
            Produtividade & Equipes (composição de equipe). Desativar não remove
            apontamentos existentes.
          </p>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {professions.filter(p => p.active).length} ativas / {professions.length} total
          </div>
          {canEdit && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Nova profissão
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-auto space-y-4">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1 px-1">{cat}</h4>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs w-32">Tipo</TableHead>
                      <TableHead className="text-xs w-24 text-center">Status</TableHead>
                      <TableHead className="text-xs w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map(p => (
                      <TableRow key={p.id} className={!p.active ? "opacity-50" : ""}>
                        <TableCell className="text-sm">{p.name}</TableCell>
                        <TableCell className="text-xs">
                          {p.worker_type === "helper" ? "Ajudante" : "Profissional"}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.active
                            ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">Ativa</Badge>
                            : <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {canEdit && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
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
                                      <AlertDialogTitle>Remover "{p.name}"?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        A profissão será removida do catálogo. Lançamentos antigos no
                                        Diário continuam preservados (o nome permanece como texto).
                                        Para apenas ocultar nas listas, prefira desativar.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => remove(p.id)}>Remover</AlertDialogAction>
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
            </div>
          ))}
        </div>

        {showForm && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-semibold">{editing ? "Editar profissão" : "Nova profissão"}</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Nome *</Label>
                <Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category || "Outros"} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            <div className="flex items-center gap-2">
              <Switch checked={form.active ?? true} onCheckedChange={v => setForm({ ...form, active: v })} />
              <Label className="text-xs">Ativa</Label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button size="sm" onClick={save} disabled={!form.name?.trim()}>
                {editing ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
