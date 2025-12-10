import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Users, 
  Plus, 
  FileText, 
  DollarSign, 
  Home, 
  Percent,
  TrendingUp,
  Calendar,
  Building,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  ClipboardList
} from "lucide-react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  supplier_type: string;
}

interface LaborContract {
  id: string;
  project_id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  contracted_houses: number;
  executed_houses: number;
  unit_value: number;
  total_value: number;
  contractor_name: string | null;
  status: string;
  notes: string | null;
}

interface ContractMeasurement {
  id: string;
  contract_id: string;
  measurement_number: number;
  houses_count: number;
  value: number;
  retention_percent: number;
  retention_value: number;
  net_value: number;
  measurement_date: string;
  status: string;
}

export function LaborContractsView() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const projectId = currentProject?.id;
  const macros = currentProject?.macrosTemplate || [];

  const [contracts, setContracts] = useState<LaborContract[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [executedHouses, setExecutedHouses] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog states
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [measurementDialogOpen, setMeasurementDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<LaborContract | null>(null);
  
  // Form states
  const [selectedMacro, setSelectedMacro] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [contractedHouses, setContractedHouses] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("5");
  const [notes, setNotes] = useState("");
  
  // Measurement form
  const [measurementHouses, setMeasurementHouses] = useState("");
  const [measurementDate, setMeasurementDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Load data
  useEffect(() => {
    if (!projectId) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      const [contractsRes, suppliersRes, prodRes] = await Promise.all([
        supabase.from('labor_contracts').select('*').eq('project_id', projectId),
        supabase.from('suppliers').select('*').eq('project_id', projectId).eq('supplier_type', 'labor'),
        supabase.from('weekly_productions').select('scope_id, house_ids').eq('project_id', projectId)
      ]);

      if (contractsRes.data) setContracts(contractsRes.data);
      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      
      if (prodRes.data) {
        const executed: Record<string, number> = {};
        prodRes.data.forEach(p => {
          if (!executed[p.scope_id]) executed[p.scope_id] = 0;
          executed[p.scope_id] += (p.house_ids?.length || 0);
        });
        setExecutedHouses(executed);
      }
      
      setIsLoading(false);
    };

    loadData();
  }, [projectId]);

  // Get scopes for selected macro
  const scopes = useMemo(() => {
    if (!selectedMacro) return [];
    const macro = macros.find(m => m.id === selectedMacro);
    return macro?.scopes || [];
  }, [selectedMacro, macros]);

  // Get all labor scopes from macros
  const allLaborScopes = useMemo(() => {
    const scopeList: { id: string; name: string; macroId: string; macroName: string; macroColor: string }[] = [];
    macros.forEach(macro => {
      macro.scopes.forEach(scope => {
        scopeList.push({ 
          id: scope.id, 
          name: scope.name, 
          macroId: macro.id,
          macroName: macro.name,
          macroColor: macro.color
        });
      });
    });
    return scopeList;
  }, [macros]);

  // Stats
  const stats = useMemo(() => {
    const activeContracts = contracts.filter(c => c.status === 'active');
    const totalContracted = activeContracts.reduce((sum, c) => sum + c.contracted_houses, 0);
    const totalExecuted = activeContracts.reduce((sum, c) => sum + (executedHouses[c.scope_id] || 0), 0);
    const totalValue = activeContracts.reduce((sum, c) => sum + c.total_value, 0);
    const pendingRenewal = activeContracts.filter(c => (executedHouses[c.scope_id] || 0) >= c.contracted_houses * 0.9);
    
    return { 
      activeContracts: activeContracts.length, 
      totalContracted, 
      totalExecuted, 
      totalValue,
      pendingRenewal: pendingRenewal.length
    };
  }, [contracts, executedHouses]);

  // Create contract
  const handleCreateContract = async () => {
    if (!projectId || !selectedScope || !contractedHouses || !unitValue) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const macro = macros.find(m => m.id === selectedMacro);
    const scope = scopes.find(s => s.id === selectedScope);
    const supplier = suppliers.find(s => s.id === selectedSupplier);

    if (!macro || !scope) return;

    const houses = parseInt(contractedHouses);
    const value = parseFloat(unitValue);

    try {
      const { error } = await supabase.from('labor_contracts').insert({
        project_id: projectId,
        scope_id: scope.id,
        scope_name: scope.name,
        macro_id: macro.id,
        macro_name: macro.name,
        contracted_houses: houses,
        unit_value: value,
        total_value: houses * value,
        contractor_name: supplier?.name || null,
        status: 'active',
        notes: notes || null
      });

      if (error) throw error;

      toast.success('Contrato criado com sucesso!');
      setNewContractOpen(false);
      resetForm();
      
      // Reload contracts
      const { data } = await supabase.from('labor_contracts').select('*').eq('project_id', projectId);
      if (data) setContracts(data);
    } catch (error) {
      console.error('Error creating contract:', error);
      toast.error('Erro ao criar contrato');
    }
  };

  const resetForm = () => {
    setSelectedMacro("");
    setSelectedScope("");
    setSelectedSupplier("");
    setContractedHouses("");
    setUnitValue("");
    setRetentionPercent("5");
    setNotes("");
  };

  // Calculate measurements for a contract
  const getContractProgress = (contract: LaborContract) => {
    const executed = executedHouses[contract.scope_id] || 0;
    return Math.min(100, (executed / contract.contracted_houses) * 100);
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto para gerenciar contratações
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FileText className="w-4 h-4" />
              <span className="text-xs">Contratos Ativos</span>
            </div>
            <span className="text-2xl font-bold">{stats.activeContracts}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Home className="w-4 h-4" />
              <span className="text-xs">Casas Contratadas</span>
            </div>
            <span className="text-2xl font-bold">{stats.totalContracted}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Casas Executadas</span>
            </div>
            <span className="text-2xl font-bold text-green-600">{stats.totalExecuted}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Valor Total</span>
            </div>
            <span className="text-lg font-bold">{formatCurrency(stats.totalValue)}</span>
          </CardContent>
        </Card>
        <Card className={stats.pendingRenewal > 0 ? 'border-amber-500' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs">Renovação Pendente</span>
            </div>
            <span className={`text-2xl font-bold ${stats.pendingRenewal > 0 ? 'text-amber-600' : ''}`}>
              {stats.pendingRenewal}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Contratos de Mão de Obra
          </CardTitle>
          {canEdit && (
            <Button onClick={() => setNewContractOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Contrato
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground">Carregando...</span>
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum contrato cadastrado</h3>
              <p className="text-muted-foreground mb-4">Comece criando um contrato de mão de obra</p>
              {canEdit && (
                <Button onClick={() => setNewContractOpen(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeiro Contrato
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {contracts.map(contract => {
                  const executed = executedHouses[contract.scope_id] || 0;
                  const progress = getContractProgress(contract);
                  const isNearLimit = executed >= contract.contracted_houses * 0.9;
                  const isOverLimit = executed >= contract.contracted_houses;
                  
                  return (
                    <Card 
                      key={contract.id} 
                      className={`cursor-pointer hover:shadow-md transition-shadow ${
                        isOverLimit ? 'border-red-400 bg-red-50/50 dark:bg-red-900/10' :
                        isNearLimit ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10' : ''
                      }`}
                      onClick={() => setSelectedContract(contract)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold">{contract.scope_name}</h4>
                              <Badge variant="outline" className="text-xs">
                                {contract.macro_name}
                              </Badge>
                              <Badge variant={contract.status === 'active' ? 'default' : 'secondary'}>
                                {contract.status === 'active' ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                            {contract.contractor_name && (
                              <p className="text-sm text-muted-foreground">
                                Empreiteiro: {contract.contractor_name}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold">{formatCurrency(contract.total_value)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(contract.unit_value)}/casa
                            </p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>Execução</span>
                            <span className={`font-medium ${
                              isOverLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : ''
                            }`}>
                              {executed}/{contract.contracted_houses} casas
                            </span>
                          </div>
                          <Progress 
                            value={progress} 
                            className={`h-2 ${
                              isOverLimit ? '[&>div]:bg-red-500' : 
                              isNearLimit ? '[&>div]:bg-amber-500' : ''
                            }`}
                          />
                          {isOverLimit && (
                            <div className="flex items-center gap-1 text-xs text-red-600">
                              <AlertCircle className="w-3 h-3" />
                              Contrato esgotado - renovação necessária
                            </div>
                          )}
                          {isNearLimit && !isOverLimit && (
                            <div className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertCircle className="w-3 h-3" />
                              Próximo do limite contratado
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* New Contract Dialog */}
      <Dialog open={newContractOpen} onOpenChange={setNewContractOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Novo Contrato de Mão de Obra
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Step 1: Select Scope */}
            <div className="space-y-2">
              <Label>Etapa (Macro)</Label>
              <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {macros.map(macro => (
                    <SelectItem key={macro.id} value={macro.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: macro.color }} />
                        {macro.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select value={selectedScope} onValueChange={setSelectedScope} disabled={!selectedMacro}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o serviço" />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map(scope => (
                    <SelectItem key={scope.id} value={scope.id}>
                      {scope.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Supplier */}
            <div className="space-y-2">
              <Label>Empreiteiro (opcional)</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o empreiteiro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum (informar depois)</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum fornecedor de mão de obra cadastrado. Cadastre em Insumos → Fornecedores.
                </p>
              )}
            </div>

            {/* Step 3: Values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Casas Contratadas</Label>
                <Input 
                  type="number" 
                  value={contractedHouses}
                  onChange={(e) => setContractedHouses(e.target.value)}
                  placeholder="Ex: 50"
                />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$)</Label>
                <Input 
                  type="number" 
                  value={unitValue}
                  onChange={(e) => setUnitValue(e.target.value)}
                  placeholder="Ex: 1500"
                  step="0.01"
                />
              </div>
            </div>

            {/* Total Preview */}
            {contractedHouses && unitValue && (
              <div className="p-4 bg-primary/10 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Valor Total do Contrato</p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(parseInt(contractedHouses || '0') * parseFloat(unitValue || '0'))}
                </p>
              </div>
            )}

            {/* Retention */}
            <div className="space-y-2">
              <Label>Retenção por Medição (%)</Label>
              <Input 
                type="number" 
                value={retentionPercent}
                onChange={(e) => setRetentionPercent(e.target.value)}
                placeholder="Ex: 5"
                min="0"
                max="100"
              />
              <p className="text-xs text-muted-foreground">
                Percentual retido em cada medição para liberação após conclusão
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condições especiais, cronograma, etc."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContractOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContract}>
              Criar Contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Details Dialog */}
      <Dialog open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Detalhes do Contrato
            </DialogTitle>
          </DialogHeader>
          
          {selectedContract && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Serviço</p>
                  <p className="font-semibold">{selectedContract.scope_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Etapa</p>
                  <p className="font-semibold">{selectedContract.macro_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Empreiteiro</p>
                  <p className="font-semibold">{selectedContract.contractor_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={selectedContract.status === 'active' ? 'default' : 'secondary'}>
                    {selectedContract.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>

              <div className="p-4 bg-secondary/50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{selectedContract.contracted_houses}</p>
                    <p className="text-xs text-muted-foreground">Contratadas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">
                      {executedHouses[selectedContract.scope_id] || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Executadas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(selectedContract.total_value)}
                    </p>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                  </div>
                </div>
              </div>

              {/* Measurements Table */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Medições
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº</TableHead>
                      <TableHead>Casas</TableHead>
                      <TableHead>Valor Bruto</TableHead>
                      <TableHead>Retenção</TableHead>
                      <TableHead>Valor Líquido</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        As medições são registradas automaticamente com base nas produções lançadas
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {selectedContract.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="text-sm mt-1">{selectedContract.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedContract(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
