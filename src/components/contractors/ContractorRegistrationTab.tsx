import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit2, Building2, Phone, Mail, Landmark } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Contractor } from "@/hooks/useContractors";

interface Props {
  contractors: Contractor[];
  onCreateContractor: (data: Partial<Contractor>) => Promise<any>;
  onUpdateContractor: (id: string, data: Partial<Contractor>) => Promise<boolean>;
}

const emptyForm = (): Partial<Contractor> => ({
  name: "", cpf_cnpj: "", phone: "", email: "",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "corrente",
  pix_key: "", pix_key_type: "", address: "", city: "", state: "", notes: "",
});

export function ContractorRegistrationTab({ contractors, onCreateContractor, onUpdateContractor }: Props) {
  const { canEdit, requireEdit } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Contractor>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm(emptyForm()); setEditingId(null); setDialogOpen(true); };
  const openEdit = (c: Contractor) => { setForm(c); setEditingId(c.id); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    if (editingId) {
      await onUpdateContractor(editingId, form);
    } else {
      await onCreateContractor(form);
    }
    setSaving(false);
    setDialogOpen(false);
  };

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Empreiteiros Cadastrados</h3>
        <Button size="sm" onClick={openNew} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Novo Empreiteiro
        </Button>
      </div>

      {contractors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum empreiteiro cadastrado.</p>
            <p className="text-xs mt-1">Clique em "Novo Empreiteiro" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">CPF/CNPJ</TableHead>
                <TableHead className="hidden md:table-cell">Telefone</TableHead>
                <TableHead className="hidden md:table-cell">Banco</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contractors.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{c.cpf_cnpj || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs">{c.phone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs">{c.bank_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {c.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Empreiteiro" : "Novo Empreiteiro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Dados básicos */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Identificação</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Nome *</Label><Input value={form.name || ""} onChange={e => set("name", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">CPF/CNPJ</Label><Input value={form.cpf_cnpj || ""} onChange={e => set("cpf_cnpj", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Telefone</Label><Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">E-mail</Label><Input value={form.email || ""} onChange={e => set("email", e.target.value)} className="h-8 text-sm" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Endereço</Label><Input value={form.address || ""} onChange={e => set("address", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Cidade</Label><Input value={form.city || ""} onChange={e => set("city", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Estado</Label><Input value={form.state || ""} onChange={e => set("state", e.target.value)} className="h-8 text-sm" /></div>
              </div>
            </div>

            {/* Dados bancários */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Dados Bancários</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Banco</Label><Input value={form.bank_name || ""} onChange={e => set("bank_name", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Agência</Label><Input value={form.bank_agency || ""} onChange={e => set("bank_agency", e.target.value)} className="h-8 text-sm" /></div>
                <div>
                  <Label className="text-xs">Tipo Conta</Label>
                  <Select value={form.bank_account_type || "corrente"} onValueChange={v => set("bank_account_type", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corrente">Corrente</SelectItem>
                      <SelectItem value="poupanca">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><Label className="text-xs">Conta</Label><Input value={form.bank_account || ""} onChange={e => set("bank_account", e.target.value)} className="h-8 text-sm" /></div>
                <div>
                  <Label className="text-xs">Tipo PIX</Label>
                  <Select value={form.pix_key_type || ""} onValueChange={v => set("pix_key_type", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="random">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Chave PIX</Label><Input value={form.pix_key || ""} onChange={e => set("pix_key", e.target.value)} className="h-8 text-sm" /></div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.name?.trim()}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
