import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ContractType {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export function ContractTypesPanel() {
  const { company, isCompanyAdmin, isSystemAdmin } = useAuth();
  const canEdit = isCompanyAdmin || isSystemAdmin;
  const [items, setItems] = useState<ContractType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ContractType | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "" });

  const load = async () => {
    if (!company?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("company_contract_types" as any)
      .select("id, nome, descricao, ativo")
      .eq("company_id", company.id)
      .order("nome");
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", descricao: "" });
    setOpen(true);
  };
  const openEdit = (item: ContractType) => {
    setEditing(item);
    setForm({ nome: item.nome, descricao: item.descricao || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!company?.id) return;
    if (!form.nome.trim()) {
      toast.error("Informe o nome do tipo.");
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from("company_contract_types" as any)
        .update({ nome: form.nome.trim(), descricao: form.descricao || null })
        .eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("company_contract_types" as any)
        .insert({ company_id: company.id, nome: form.nome.trim(), descricao: form.descricao || null });
      if (error) return toast.error(error.message);
    }
    toast.success("Tipo salvo.");
    setOpen(false);
    load();
  };

  const toggleAtivo = async (item: ContractType) => {
    const { error } = await supabase
      .from("company_contract_types" as any)
      .update({ ativo: !item.ativo })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Tipos de Contrato</Label>
          <p className="text-xs text-muted-foreground">Cadastre os tipos usados nas suas obras.</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew} className="gap-1">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum tipo cadastrado.</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2.5 rounded-md border border-border hover:bg-accent/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${!item.ativo ? "text-muted-foreground line-through" : ""}`}>
                  {item.nome}
                </p>
                {item.descricao && (
                  <p className="text-xs text-muted-foreground truncate">{item.descricao}</p>
                )}
              </div>
              {canEdit && (
                <>
                  <Switch checked={item.ativo} onCheckedChange={() => toggleAtivo(item)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)} className="h-8 w-8">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tipo" : "Novo tipo de contrato"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
