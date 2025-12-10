import { useState, useEffect, useCallback, useMemo } from "react";
import { Users, Plus, Trash2, Edit2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  supplier_type: 'material' | 'labor' | 'equipment';
  project_id: string;
}

export function SuppliersManagementView() {
  const { canEdit } = useAuth();
  const { currentProject, projects } = useConstruction();
  
  const defaultProjectId = currentProject?.id || projects[0]?.id;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<string>('all');
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ supplier_type: 'material' });

  // Load ALL suppliers globally (no project filter)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase.from('suppliers').select('*').order('name');
      if (data) setSuppliers(data.map(s => ({ ...s, supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' | 'equipment' })));
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast.error('Erro ao carregar fornecedores');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => supplierTypeFilter === 'all' || s.supplier_type === supplierTypeFilter);
  }, [suppliers, supplierTypeFilter]);

  const saveSupplier = async () => {
    if (!defaultProjectId || !newSupplier.name) {
      toast.error('Preencha o nome do fornecedor');
      return;
    }
    try {
      const payload = {
        name: newSupplier.name,
        email: newSupplier.email || null,
        phone: newSupplier.phone || null,
        address: newSupplier.address || null,
        notes: newSupplier.notes || null,
        supplier_type: newSupplier.supplier_type || 'material'
      };
      
      if (editingSupplier) {
        await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
        toast.success('Fornecedor atualizado!');
      } else {
        await supabase.from('suppliers').insert({ ...payload, project_id: defaultProjectId });
        toast.success('Fornecedor cadastrado!');
      }
      setSupplierDialogOpen(false);
      setNewSupplier({ supplier_type: 'material' });
      setEditingSupplier(null);
      loadData();
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast.error('Erro ao salvar fornecedor');
    }
  };

  const deleteSupplier = async (id: string) => {
    try {
      await supabase.from('suppliers').delete().eq('id', id);
      toast.success('Fornecedor removido');
      setSuppliers(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting supplier:', error);
      toast.error('Erro ao remover');
    }
  };

  if (!defaultProjectId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Cadastre uma obra primeiro para gerenciar fornecedores
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Carregando...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Cadastro de Fornecedores (Base Global)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Fornecedores cadastrados aqui ficam disponíveis para todas as obras do sistema.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 mb-4">
            <Select value={supplierTypeFilter} onValueChange={setSupplierTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="material">Materiais</SelectItem>
                <SelectItem value="labor">Mão de Obra</SelectItem>
                <SelectItem value="equipment">Equipamentos</SelectItem>
              </SelectContent>
            </Select>
            
            {canEdit && (
              <Dialog open={supplierDialogOpen} onOpenChange={(o) => { setSupplierDialogOpen(o); if (!o) { setEditingSupplier(null); setNewSupplier({ supplier_type: 'material' }); } }}>
                <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Novo Fornecedor</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editingSupplier ? 'Editar' : 'Cadastrar'} Fornecedor</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Nome *</Label><Input value={newSupplier.name || ''} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} /></div>
                    <div><Label>Tipo</Label>
                      <Select value={newSupplier.supplier_type || 'material'} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_type: v as 'material' | 'labor' | 'equipment' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="material">Materiais</SelectItem>
                          <SelectItem value="labor">Mão de Obra</SelectItem>
                          <SelectItem value="equipment">Equipamentos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Email</Label><Input type="email" value={newSupplier.email || ''} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} /></div>
                      <div><Label>Telefone</Label><Input value={newSupplier.phone || ''} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} /></div>
                    </div>
                    <div><Label>Endereço</Label><Input value={newSupplier.address || ''} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} /></div>
                    <div><Label>Observações</Label><Textarea value={newSupplier.notes || ''} onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveSupplier} disabled={!newSupplier.name}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map(supplier => (
              <Card key={supplier.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{supplier.name}</h3>
                        <Badge variant="outline" className={supplier.supplier_type === 'labor' ? 'border-orange-500 text-orange-600' : supplier.supplier_type === 'equipment' ? 'border-green-500 text-green-600' : 'border-blue-500 text-blue-600'}>
                          {supplier.supplier_type === 'labor' ? 'MO' : supplier.supplier_type === 'equipment' ? 'EQP' : 'MAT'}
                        </Badge>
                      </div>
                      {supplier.email && <p className="text-sm text-muted-foreground">{supplier.email}</p>}
                      {supplier.phone && <p className="text-sm text-muted-foreground">{supplier.phone}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingSupplier(supplier); setNewSupplier(supplier); setSupplierDialogOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSupplier(supplier.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredSuppliers.length === 0 && <Card className="col-span-full"><CardContent className="p-8 text-center text-muted-foreground">Nenhum fornecedor cadastrado</CardContent></Card>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
