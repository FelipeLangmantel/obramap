import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  retention_percent?: number;
}

interface LaborContractsViewProps {
  prefilledScopeId?: string;
  prefilledMacroId?: string;
  prefilledScopeName?: string;
  prefilledHouses?: number;
  prefilledUnitValue?: number;
  onContractCreated?: () => void;
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

export function LaborContractsView({ 
  prefilledScopeId, 
  prefilledMacroId, 
  prefilledScopeName,
  prefilledHouses,
  prefilledUnitValue,
  onContractCreated 
}: LaborContractsViewProps = {}) {
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
  const [editingContract, setEditingContract] = useState<LaborContract | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<LaborContract | null>(null);
  
  // Form states
  const [selectedMacro, setSelectedMacro] = useState("");
  const [selectedScope, setSelectedScope] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [contractedHouses, setContractedHouses] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("5");
  const [notes, setNotes] = useState("");
  const [originalUnitValue, setOriginalUnitValue] = useState<number | null>(null);
  const [showBudgetWarning, setShowBudgetWarning] = useState(false);

  // Open dialog with prefilled data when props change
  useEffect(() => {
    if (prefilledScopeId && prefilledMacroId) {
      setSelectedMacro(prefilledMacroId);
      setSelectedScope(prefilledScopeId);
      if (prefilledHouses) setContractedHouses(prefilledHouses.toString());
      if (prefilledUnitValue) {
        setUnitValue(prefilledUnitValue.toString());
        setOriginalUnitValue(prefilledUnitValue);
      }
      setNewContractOpen(true);
    }
  }, [prefilledScopeId, prefilledMacroId, prefilledHouses, prefilledUnitValue]);
  
  // Measurement form
  const [measurementHouses, setMeasurementHouses] = useState("");
  const [measurementDate, setMeasurementDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Load data
  useEffect(() => {
    if (!projectId) return;
    
    const loadData = async () => {
      setIsLoading(true);
      
      const [contractsRes, suppliersRes, prodRes] = await Promise.all([
        supabase.from('labor_contracts').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
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

    // Handle "none" value for supplier
    const contractorName = selectedSupplier === 'none' ? null : (supplier?.name || null);

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
        contractor_name: contractorName,
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
    setOriginalUnitValue(null);
    setShowBudgetWarning(false);
  };

  // Check if unit value changed from budget
  const handleUnitValueChange = (value: string) => {
    setUnitValue(value);
    if (originalUnitValue !== null && parseFloat(value) !== originalUnitValue) {
      setShowBudgetWarning(true);
    } else {
      setShowBudgetWarning(false);
    }
  };

  // Update budget when contract is created with different value
  const updateBudgetIfNeeded = async () => {
    if (!showBudgetWarning || !prefilledScopeId) return;
    
    const newValue = parseFloat(unitValue);
    try {
      await supabase
        .from('scope_items')
        .update({ unit_value: newValue })
        .eq('scope_id', prefilledScopeId)
        .eq('category', 'labor');
      
      toast.info('Orçamento atualizado com o novo valor unitário');
    } catch (error) {
      console.error('Error updating budget:', error);
    }
  };

  // Enhanced create contract
  const handleCreateContractEnhanced = async () => {
    if (!canEdit) return;
    await handleCreateContract();
    if (showBudgetWarning) {
      await updateBudgetIfNeeded();
    }
    onContractCreated?.();
  };

  // Calculate measurements for a contract
  const getContractProgress = (contract: LaborContract) => {
    const executed = executedHouses[contract.scope_id] || 0;
    return Math.min(100, (executed / contract.contracted_houses) * 100);
  };

  // Delete contract
  const handleDeleteContract = async (contract: LaborContract) => {
    try {
      const { error } = await supabase.from('labor_contracts').delete().eq('id', contract.id);
      if (error) throw error;
      toast.success('Contrato excluído com sucesso!');
      setContracts(prev => prev.filter(c => c.id !== contract.id));
      setDeleteConfirmOpen(false);
      setContractToDelete(null);
      setSelectedContract(null);
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.error('Erro ao excluir contrato');
    }
  };

  // Update contract (auto-save)
  const handleUpdateContract = async (contract: LaborContract, updates: Partial<LaborContract>) => {
    if (!canEdit) return;
    try {
      const newValues = { ...contract, ...updates };
      // Recalculate total if houses or value changed
      if (updates.contracted_houses !== undefined || updates.unit_value !== undefined) {
        newValues.total_value = newValues.contracted_houses * newValues.unit_value;
      }
      
      const { error } = await supabase.from('labor_contracts').update({
        contracted_houses: newValues.contracted_houses,
        unit_value: newValues.unit_value,
        total_value: newValues.total_value,
        contractor_name: newValues.contractor_name,
        status: newValues.status,
        notes: newValues.notes
      }).eq('id', contract.id);
      
      if (error) throw error;
      
      setContracts(prev => prev.map(c => c.id === contract.id ? newValues : c));
      if (selectedContract?.id === contract.id) {
        setSelectedContract(newValues);
      }
      toast.success('Contrato atualizado!');
    } catch (error) {
      console.error('Error updating contract:', error);
      toast.error('Erro ao atualizar contrato');
    }
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
      <Dialog open={newContractOpen} onOpenChange={(open) => { setNewContractOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Novo Contrato de Mão de Obra
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-4 py-2 pb-4">
              {/* Prefilled info */}
              {prefilledScopeName && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Contratação baseada no orçamento do serviço:
                  </p>
                  <p className="font-semibold text-blue-800 dark:text-blue-200">{prefilledScopeName}</p>
                </div>
              )}

              {/* Step 1: Select Scope */}
              <div className="space-y-2">
                <Label>Etapa (Macro)</Label>
                <Select value={selectedMacro} onValueChange={(v) => { setSelectedMacro(v); setSelectedScope(""); }} disabled={!!prefilledMacroId}>
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
                <Select value={selectedScope} onValueChange={setSelectedScope} disabled={!selectedMacro || !!prefilledScopeId}>
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
                    <SelectItem value="none">Nenhum (informar depois)</SelectItem>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suppliers.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum fornecedor de mão de obra cadastrado. Cadastre em Suprimentos → Fornecedores.
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
                  {prefilledHouses && (
                    <p className="text-xs text-muted-foreground">
                      Orçamento: {prefilledHouses} casas
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Valor Unitário (R$)</Label>
                  <Input 
                    type="number" 
                    value={unitValue}
                    onChange={(e) => handleUnitValueChange(e.target.value)}
                    placeholder="Ex: 1500"
                    step="0.01"
                  />
                  {originalUnitValue !== null && (
                    <p className="text-xs text-muted-foreground">
                      Orçamento: {formatCurrency(originalUnitValue)}
                    </p>
                  )}
                </div>
              </div>

              {/* Budget Warning */}
              {showBudgetWarning && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-300 dark:border-amber-700">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                        Valor diferente do orçamento
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        O valor unitário será atualizado no orçamento ao criar o contrato.
                      </p>
                    </div>
                  </div>
                </div>
              )}

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
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setNewContractOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContractEnhanced}>
              Criar Contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contract Details Dialog */}
      <Dialog open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
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
                  <Label className="text-sm text-muted-foreground">Empreiteiro</Label>
                  <Input 
                    value={selectedContract.contractor_name || ''} 
                    onChange={(e) => setSelectedContract({ ...selectedContract, contractor_name: e.target.value })}
                    onBlur={() => handleUpdateContract(selectedContract, { contractor_name: selectedContract.contractor_name })}
                    placeholder="Nome do empreiteiro"
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Status</Label>
                  <Select 
                    value={selectedContract.status} 
                    onValueChange={(v) => {
                      setSelectedContract({ ...selectedContract, status: v });
                      handleUpdateContract(selectedContract, { status: v });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Casas Contratadas</Label>
                  <Input 
                    type="number"
                    value={selectedContract.contracted_houses} 
                    onChange={(e) => setSelectedContract({ ...selectedContract, contracted_houses: parseInt(e.target.value) || 0 })}
                    onBlur={() => handleUpdateContract(selectedContract, { contracted_houses: selectedContract.contracted_houses })}
                  />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Valor Unitário (R$)</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={selectedContract.unit_value} 
                    onChange={(e) => setSelectedContract({ ...selectedContract, unit_value: parseFloat(e.target.value) || 0 })}
                    onBlur={() => handleUpdateContract(selectedContract, { unit_value: selectedContract.unit_value })}
                  />
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
                      {formatCurrency(selectedContract.contracted_houses * selectedContract.unit_value)}
                    </p>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Observações</Label>
                <Textarea 
                  value={selectedContract.notes || ''} 
                  onChange={(e) => setSelectedContract({ ...selectedContract, notes: e.target.value })}
                  onBlur={() => handleUpdateContract(selectedContract, { notes: selectedContract.notes })}
                  placeholder="Observações do contrato..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {canEdit && (
              <Button 
                variant="destructive" 
                onClick={() => {
                  setContractToDelete(selectedContract);
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedContract(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato "{contractToDelete?.scope_name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => contractToDelete && handleDeleteContract(contractToDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
