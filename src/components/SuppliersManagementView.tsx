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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  supplier_scope: 'project' | 'global';
  project_id: string;
  pix_key: string | null;
  pix_key_type: string | null;
  cnpj_cpf: string | null;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account: string | null;
}

export function SuppliersManagementView() {
  const { canEdit, company } = useAuth();
  const companyId = company?.id;
  const { currentProject, projects } = useConstruction();
  
  const defaultProjectId = currentProject?.id || projects[0]?.id;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier & { selected_project_id?: string }>>({ 
    supplier_type: 'material',
    supplier_scope: 'project',
    selected_project_id: defaultProjectId
  });

  const loadData = useCallback(async () => {
    if (!defaultProjectId) return;
    setIsLoading(true);
    try {
      // Load suppliers that are global OR belong to current project
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .or(`project_id.eq.${defaultProjectId},supplier_scope.eq.global`)
        .order('name');
      
      if (data) setSuppliers(data.map(s => ({ 
        ...s, 
        supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' | 'equipment',
        supplier_scope: (s.supplier_scope || 'project') as 'project' | 'global'
      })));
    } catch (error) {
      console.error('Error loading suppliers:', error);
      toast.error('Erro ao carregar fornecedores');
    } finally {
      setIsLoading(false);
    }
  }, [defaultProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchesType = supplierTypeFilter === 'all' || s.supplier_type === supplierTypeFilter;
      const matchesScope = scopeFilter === 'all' || s.supplier_scope === scopeFilter;
      return matchesType && matchesScope;
    });
  }, [suppliers, supplierTypeFilter, scopeFilter]);

  const projectSuppliers = filteredSuppliers.filter(s => s.supplier_scope === 'project');
  const globalSuppliers = filteredSuppliers.filter(s => s.supplier_scope === 'global');

  const saveSupplier = async () => {
    if (!newSupplier.name) {
      toast.error('Preencha o nome do fornecedor');
      return;
    }
    
    const projectIdToUse = newSupplier.supplier_scope === 'global' 
      ? defaultProjectId 
      : (newSupplier.selected_project_id || defaultProjectId);
      
    if (!projectIdToUse) {
      toast.error('Selecione uma obra');
      return;
    }
    
    try {
      const payload = {
        name: newSupplier.name,
        email: newSupplier.email || null,
        phone: newSupplier.phone || null,
        address: newSupplier.address || null,
        notes: newSupplier.notes || null,
        supplier_type: newSupplier.supplier_type || 'material',
        supplier_scope: newSupplier.supplier_scope || 'project',
        pix_key: newSupplier.pix_key || null,
        pix_key_type: newSupplier.pix_key_type || null,
        cnpj_cpf: newSupplier.cnpj_cpf || null,
        bank_name: newSupplier.bank_name || null,
        bank_agency: newSupplier.bank_agency || null,
        bank_account: newSupplier.bank_account || null
      };
      
      if (editingSupplier) {
        await supabase.from('suppliers').update({ ...payload, project_id: projectIdToUse }).eq('id', editingSupplier.id);
        toast.success('Fornecedor atualizado!');
      } else {
        await supabase.from('suppliers').insert({ ...payload, project_id: projectIdToUse });
        toast.success('Fornecedor cadastrado!');
      }
      setSupplierDialogOpen(false);
      setNewSupplier({ supplier_type: 'material', supplier_scope: 'project', selected_project_id: defaultProjectId });
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

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    return project?.name || 'Obra não encontrada';
  };

  const SupplierCard = ({ supplier }: { supplier: Supplier }) => (
    <Card key={supplier.id}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold">{supplier.name}</h3>
              <Badge variant="outline" className={
                supplier.supplier_type === 'labor' ? 'border-orange-500 text-orange-600' : 
                supplier.supplier_type === 'equipment' ? 'border-green-500 text-green-600' : 
                'border-blue-500 text-blue-600'
              }>
                {supplier.supplier_type === 'labor' ? 'MO' : supplier.supplier_type === 'equipment' ? 'EQP' : 'MAT'}
              </Badge>
              {supplier.supplier_scope === 'global' ? (
                <Badge variant="default" className="text-xs bg-primary">
                  Todas as Obras
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {getProjectName(supplier.project_id)}
                </Badge>
              )}
            </div>
            {supplier.cnpj_cpf && <p className="text-sm text-muted-foreground">CPF/CNPJ: {supplier.cnpj_cpf}</p>}
            {supplier.email && <p className="text-sm text-muted-foreground">{supplier.email}</p>}
            {supplier.phone && <p className="text-sm text-muted-foreground">{supplier.phone}</p>}
            {supplier.pix_key && (
              <p className="text-sm text-muted-foreground">PIX: {supplier.pix_key}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { 
                setEditingSupplier(supplier); 
                setNewSupplier({ ...supplier, selected_project_id: supplier.project_id }); 
                setSupplierDialogOpen(true); 
              }}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteSupplier(supplier.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

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
            Cadastro de Fornecedores
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Gerencie fornecedores específicos desta obra ou fornecedores gerais disponíveis para todas as obras.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div className="flex gap-2">
              <Select value={supplierTypeFilter} onValueChange={setSupplierTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="material">Materiais</SelectItem>
                  <SelectItem value="labor">Mão de Obra</SelectItem>
                  <SelectItem value="equipment">Equipamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {canEdit && (
              <Dialog open={supplierDialogOpen} onOpenChange={(o) => { 
                setSupplierDialogOpen(o); 
                if (!o) { 
                  setEditingSupplier(null); 
                  setNewSupplier({ supplier_type: 'material', supplier_scope: 'project', selected_project_id: defaultProjectId });
                } 
              }}>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-1" />Novo Fornecedor</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingSupplier ? 'Editar' : 'Cadastrar'} Fornecedor</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <div>
                      <Label>Nome *</Label>
                      <Input value={newSupplier.name || ''} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={newSupplier.supplier_type || 'material'} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_type: v as 'material' | 'labor' | 'equipment' })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="material">Materiais</SelectItem>
                            <SelectItem value="labor">Mão de Obra</SelectItem>
                            <SelectItem value="equipment">Equipamentos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Disponível para</Label>
                        <Select value={newSupplier.supplier_scope || 'project'} onValueChange={(v) => setNewSupplier({ ...newSupplier, supplier_scope: v as 'project' | 'global' })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="project">Uma Obra específica</SelectItem>
                            <SelectItem value="global">Todas as Obras</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {newSupplier.supplier_scope === 'project' && (
                      <div>
                        <Label>Obra *</Label>
                        <Select 
                          value={newSupplier.selected_project_id || defaultProjectId || ''} 
                          onValueChange={(v) => setNewSupplier({ ...newSupplier, selected_project_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a obra">
                              {newSupplier.selected_project_id 
                                ? projects.find(p => p.id === newSupplier.selected_project_id)?.name 
                                : 'Selecione a obra'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map(project => (
                              <SelectItem key={project.id} value={project.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{project.name}</span>
                                  <span className="text-xs text-muted-foreground">{project.location}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>CPF/CNPJ</Label>
                        <Input value={newSupplier.cnpj_cpf || ''} onChange={(e) => setNewSupplier({ ...newSupplier, cnpj_cpf: e.target.value })} />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input value={newSupplier.phone || ''} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={newSupplier.email || ''} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} />
                    </div>
                    <div>
                      <Label>Endereço</Label>
                      <Input value={newSupplier.address || ''} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} />
                    </div>
                    
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Dados Financeiros</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Chave PIX</Label>
                          <Input value={newSupplier.pix_key || ''} onChange={(e) => setNewSupplier({ ...newSupplier, pix_key: e.target.value })} />
                        </div>
                        <div>
                          <Label>Tipo PIX</Label>
                          <Select value={newSupplier.pix_key_type || 'cpf'} onValueChange={(v) => setNewSupplier({ ...newSupplier, pix_key_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="cnpj">CNPJ</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="phone">Telefone</SelectItem>
                              <SelectItem value="random">Aleatória</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div>
                          <Label>Banco</Label>
                          <Input value={newSupplier.bank_name || ''} onChange={(e) => setNewSupplier({ ...newSupplier, bank_name: e.target.value })} placeholder="Ex: Itaú" />
                        </div>
                        <div>
                          <Label>Agência</Label>
                          <Input value={newSupplier.bank_agency || ''} onChange={(e) => setNewSupplier({ ...newSupplier, bank_agency: e.target.value })} />
                        </div>
                        <div>
                          <Label>Conta</Label>
                          <Input value={newSupplier.bank_account || ''} onChange={(e) => setNewSupplier({ ...newSupplier, bank_account: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <Label>Observações</Label>
                      <Textarea value={newSupplier.notes || ''} onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={saveSupplier} disabled={!newSupplier.name}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          
          <Tabs defaultValue="project" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="project">
                Fornecedores da Obra ({projectSuppliers.length})
              </TabsTrigger>
              <TabsTrigger value="global">
                Fornecedores Gerais ({globalSuppliers.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="project">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projectSuppliers.map(supplier => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
                {projectSuppliers.length === 0 && (
                  <Card className="col-span-full">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Nenhum fornecedor específico desta obra cadastrado
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="global">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {globalSuppliers.map(supplier => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
                {globalSuppliers.length === 0 && (
                  <Card className="col-span-full">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      Nenhum fornecedor geral cadastrado
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
