import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Plus, Search, Trash2, Edit2, Layers, Check, Upload, Package, Hammer, Wrench, ChevronDown, ChevronRight, ArrowRightLeft, AlertTriangle, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImportInputsDialog } from "./ImportInputsDialog";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
  lead_time_days: number;
  project_id: string;
}

interface InputItem {
  id: string;
  name: string;
  unit: string;
  category: 'material' | 'labor' | 'equipment';
  material_family_id: string | null;
  material_family?: MaterialFamily;
  description: string | null;
  unit_value: number;
  stock_quantity: number;
  project_id: string;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
  project_id: string;
}

const CATEGORY_LABELS = {
  material: 'Material',
  labor: 'Mão de Obra',
  equipment: 'Equipamento'
};

export function InputsManagementView() {
  const { canEdit } = useAuth();
  const { currentProject, projects } = useConstruction();
  
  // Use first project as default for creating new items
  const defaultProjectId = currentProject?.id || projects[0]?.id;

  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchInput, setSearchInput] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [deleteInputDialogOpen, setDeleteInputDialogOpen] = useState(false);
  const [bulkFamilyDialogOpen, setBulkFamilyDialogOpen] = useState(false);
  
  const [editingInput, setEditingInput] = useState<InputItem | null>(null);
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editingFamily, setEditingFamily] = useState<MaterialFamily | null>(null);
  const [inputToDelete, setInputToDelete] = useState<InputItem | null>(null);
  const [inputInBudget, setInputInBudget] = useState<string[]>([]);
  
  // Bulk selection
  const [selectedInputIds, setSelectedInputIds] = useState<Set<string>>(new Set());
  const [bulkTargetFamily, setBulkTargetFamily] = useState<string>('');
  
  const [newInput, setNewInput] = useState<{ name: string; unit: string; category: string; material_family_id: string; description: string; unit_value: number; stock_quantity: number }>({
    name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0, stock_quantity: 0
  });
  const [newUnit, setNewUnit] = useState<{ name: string; abbreviation: string }>({ name: '', abbreviation: '' });
  const [newFamily, setNewFamily] = useState<{ name: string; color: string }>({ name: '', color: '#3b82f6' });

  // Load ALL inputs globally (no project filter)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [inputsRes, unitsRes, familiesRes] = await Promise.all([
        supabase.from('inputs').select('*, material_families(*)').order('name'),
        supabase.from('units').select('*').order('name'),
        supabase.from('material_families').select('*').order('display_order').order('name')
      ]);
      
      if (inputsRes.data) {
        setInputs(inputsRes.data.map((i: any) => ({ 
          ...i, 
          material_family: i.material_families, 
          category: i.category as 'material' | 'labor' | 'equipment', 
          unit_value: i.unit_value || 0, 
          stock_quantity: i.stock_quantity || 0 
        })));
      }
      let currentUnits = unitsRes.data || [];
      
      // Auto-seed units from existing inputs if units table is sparse
      if (inputsRes.data && defaultProjectId) {
        const existingAbbreviations = new Set(currentUnits.map(u => u.abbreviation.toLowerCase()));
        const inputUnits = new Set(
          inputsRes.data
            .map((i: any) => i.unit?.trim())
            .filter((u: string) => u && u.length > 0)
        );
        const missingUnits = [...inputUnits].filter(u => !existingAbbreviations.has((u as string).toLowerCase()));
        
        if (missingUnits.length > 0) {
          const toInsert = missingUnits.map(u => ({
            project_id: defaultProjectId,
            name: u as string,
            abbreviation: u as string,
          }));
          const { data: inserted } = await supabase.from('units').insert(toInsert).select();
          if (inserted) {
            currentUnits = [...currentUnits, ...inserted];
          }
        }
      }
      
      setUnits(currentUnits);
      if (familiesRes.data) setFamilies(familiesRes.data.map(f => ({ 
        id: f.id, 
        name: f.name, 
        color: f.color || '#9ca3af', 
        lead_time_days: f.lead_time_days || 7,
        project_id: f.project_id
      })));
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredInputs = useMemo(() => {
    return inputs.filter(input => {
      const matchesSearch = !searchInput || input.name.toLowerCase().includes(searchInput.toLowerCase());
      const matchesCategory = filterCategory === 'all' || input.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [inputs, searchInput, filterCategory]);

  const groupedByFamily = useMemo(() => {
    const grouped: Record<string, InputItem[]> = {};
    filteredInputs.forEach(input => {
      const familyName = input.material_family?.name || 'Sem Família';
      if (!grouped[familyName]) grouped[familyName] = [];
      grouped[familyName].push(input);
    });
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'Sem Família') return 1;
      if (b === 'Sem Família') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    return Object.fromEntries(sortedEntries);
  }, [filteredInputs]);

  const inputCountByFamily = useMemo(() => {
    const counts: Record<string, number> = {};
    inputs.forEach(input => {
      if (input.material_family_id) {
        counts[input.material_family_id] = (counts[input.material_family_id] || 0) + 1;
      }
    });
    return counts;
  }, [inputs]);

  const saveInput = async () => {
    if (!defaultProjectId || !newInput.name.trim()) {
      toast.error('Preencha o nome do insumo');
      return;
    }
    try {
      const payload = {
        name: newInput.name.trim(),
        unit: newInput.unit,
        category: newInput.category,
        material_family_id: newInput.material_family_id || null,
        description: newInput.description || null,
        unit_value: newInput.unit_value || 0,
        stock_quantity: newInput.stock_quantity || 0
      };
      
      if (editingInput) {
        await supabase.from('inputs').update(payload).eq('id', editingInput.id);
        toast.success('Insumo atualizado!');
      } else {
        await supabase.from('inputs').insert({ ...payload, project_id: defaultProjectId });
        toast.success('Insumo cadastrado!');
      }
      setInputDialogOpen(false);
      setNewInput({ name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0, stock_quantity: 0 });
      setEditingInput(null);
      loadData();
    } catch (error) {
      console.error('Error saving input:', error);
      toast.error('Erro ao salvar insumo');
    }
  };

  // Check if input is used in any budget (scope_items)
  const checkInputInBudget = async (inputId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('scope_items')
        .select('macro_id, scope_id, name')
        .eq('input_id', inputId);
      
      if (error) throw error;
      return data?.map(item => `${item.macro_id} > ${item.scope_id} (${item.name})`) || [];
    } catch (error) {
      console.error('Error checking budget:', error);
      return [];
    }
  };

  const handleDeleteClick = async (input: InputItem) => {
    setInputToDelete(input);
    const budgetUsage = await checkInputInBudget(input.id);
    setInputInBudget(budgetUsage);
    setDeleteInputDialogOpen(true);
  };

  const confirmDeleteInput = async () => {
    if (!inputToDelete) return;
    
    // If input is used in budget, prevent deletion
    if (inputInBudget.length > 0) {
      toast.error('Não é possível excluir insumo vinculado a orçamentos');
      setDeleteInputDialogOpen(false);
      setInputToDelete(null);
      setInputInBudget([]);
      return;
    }
    
    try {
      await supabase.from('inputs').delete().eq('id', inputToDelete.id);
      toast.success('Insumo removido');
      setInputs(prev => prev.filter(i => i.id !== inputToDelete.id));
      setSelectedInputIds(prev => {
        const next = new Set(prev);
        next.delete(inputToDelete.id);
        return next;
      });
      setDeleteInputDialogOpen(false);
      setInputToDelete(null);
      setInputInBudget([]);
    } catch (error) {
      console.error('Error deleting input:', error);
      toast.error('Erro ao remover');
    }
  };

  // Bulk family change
  const handleBulkFamilyChange = async () => {
    if (selectedInputIds.size === 0) {
      toast.error('Selecione pelo menos um insumo');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('inputs')
        .update({ material_family_id: bulkTargetFamily === 'none' ? null : bulkTargetFamily })
        .in('id', Array.from(selectedInputIds));
      
      if (error) throw error;
      
      toast.success(`${selectedInputIds.size} insumo(s) atualizado(s)`);
      setBulkFamilyDialogOpen(false);
      setBulkTargetFamily('');
      setSelectedInputIds(new Set());
      loadData();
    } catch (error) {
      console.error('Error updating inputs:', error);
      toast.error('Erro ao atualizar insumos');
    }
  };

  const toggleInputSelection = (inputId: string) => {
    setSelectedInputIds(prev => {
      const next = new Set(prev);
      if (next.has(inputId)) next.delete(inputId);
      else next.add(inputId);
      return next;
    });
  };

  const toggleSelectAllInFamily = (familyInputs: InputItem[]) => {
    const allSelected = familyInputs.every(i => selectedInputIds.has(i.id));
    setSelectedInputIds(prev => {
      const next = new Set(prev);
      familyInputs.forEach(i => {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      });
      return next;
    });
  };

  const saveUnit = async () => {
    if (!defaultProjectId || !newUnit.name.trim() || !newUnit.abbreviation.trim()) return;
    
    // Check for duplicates (case-insensitive)
    const normalizedName = newUnit.name.trim().toLowerCase();
    const normalizedAbbr = newUnit.abbreviation.trim().toLowerCase();
    const isDuplicate = units.some(u => 
      u.id !== editingUnit?.id && 
      (u.name.toLowerCase() === normalizedName || u.abbreviation.toLowerCase() === normalizedAbbr)
    );
    
    if (isDuplicate) {
      toast.error('Já existe uma unidade com este nome ou abreviação');
      return;
    }
    
    try {
      if (editingUnit) {
        const oldAbbreviation = editingUnit.abbreviation;
        const newAbbreviation = newUnit.abbreviation.trim();
        
        await supabase.from('units').update({ name: newUnit.name.trim(), abbreviation: newAbbreviation }).eq('id', editingUnit.id);
        
        // If abbreviation changed, auto-update all inputs using the old abbreviation
        if (oldAbbreviation.toLowerCase() !== newAbbreviation.toLowerCase()) {
          const { data: affectedInputs } = await supabase
            .from('inputs')
            .select('id')
            .ilike('unit', oldAbbreviation);
          
          if (affectedInputs && affectedInputs.length > 0) {
            await supabase
              .from('inputs')
              .update({ unit: newAbbreviation })
              .ilike('unit', oldAbbreviation);
            
            toast.success(`Unidade atualizada! ${affectedInputs.length} insumo(s) atualizado(s) automaticamente.`);
          } else {
            toast.success('Unidade atualizada!');
          }
        } else {
          toast.success('Unidade atualizada!');
        }
      } else {
        await supabase.from('units').insert({ name: newUnit.name.trim(), abbreviation: newUnit.abbreviation.trim(), project_id: defaultProjectId });
        toast.success('Unidade cadastrada!');
      }
      setNewUnit({ name: '', abbreviation: '' });
      setEditingUnit(null);
      loadData();
    } catch (error) {
      console.error('Error saving unit:', error);
      toast.error('Erro ao salvar');
    }
  };

  // Count inputs using each unit
  const inputCountByUnit = useMemo(() => {
    const counts: Record<string, number> = {};
    inputs.forEach(input => {
      const unitKey = input.unit?.toLowerCase().trim();
      if (unitKey) {
        // Match by abbreviation (case-insensitive)
        const matchingUnit = units.find(u => u.abbreviation.toLowerCase() === unitKey);
        if (matchingUnit) {
          counts[matchingUnit.id] = (counts[matchingUnit.id] || 0) + 1;
        }
      }
    });
    return counts;
  }, [inputs, units]);

  const deleteUnit = async (id: string) => {
    // Check if unit has inputs associated
    if (inputCountByUnit[id] > 0) {
      toast.error('Não é possível remover unidade com insumos vinculados');
      return;
    }
    try {
      await supabase.from('units').delete().eq('id', id);
      toast.success('Unidade removida');
      setUnits(prev => prev.filter(u => u.id !== id));
    } catch (error) {
      console.error('Error deleting unit:', error);
      toast.error('Erro ao remover');
    }
  };

  const saveFamily = async () => {
    if (!defaultProjectId || !newFamily.name.trim()) {
      toast.error('Preencha o nome da família');
      return;
    }
    
    const normalizedName = newFamily.name.trim();
    
    try {
      // Check for duplicates directly in database (case-insensitive)
      const { data: existingFamilies, error: checkError } = await supabase
        .from('material_families')
        .select('id, name')
        .ilike('name', normalizedName);
      
      if (checkError) throw checkError;
      
      // Check if any existing family (other than the one being edited) has the same name
      const isDuplicate = existingFamilies?.some(f => 
        f.id !== editingFamily?.id && f.name.toLowerCase() === normalizedName.toLowerCase()
      );
      
      if (isDuplicate) {
        toast.error(`A família "${normalizedName}" já existe no sistema. Escolha outro nome.`, {
          duration: 5000
        });
        return;
      }
      
      if (editingFamily) {
        const { error } = await supabase
          .from('material_families')
          .update({ name: normalizedName, color: newFamily.color })
          .eq('id', editingFamily.id);
        if (error) throw error;
        toast.success('Família atualizada!');
      } else {
        const maxOrder = families.length > 0 ? Math.max(...families.map(f => f.lead_time_days)) + 1 : 0;
        const { error } = await supabase.from('material_families').insert({ 
          name: normalizedName, 
          color: newFamily.color, 
          project_id: defaultProjectId,
          display_order: maxOrder
        });
        if (error) throw error;
        toast.success('Família cadastrada!');
      }
      setFamilyDialogOpen(false);
      setNewFamily({ name: '', color: '#3b82f6' });
      setEditingFamily(null);
      loadData();
    } catch (error) {
      console.error('Error saving family:', error);
      toast.error('Erro ao salvar família');
    }
  };

  const deleteFamily = async (id: string) => {
    if (inputCountByFamily[id] > 0) {
      toast.error('Não é possível remover família com insumos vinculados');
      return;
    }
    try {
      await supabase.from('material_families').delete().eq('id', id);
      toast.success('Família removida');
      setFamilies(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error('Error deleting family:', error);
      toast.error('Erro ao remover');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'material': return <Package className="w-3.5 h-3.5" />;
      case 'labor': return <Hammer className="w-3.5 h-3.5" />;
      case 'equipment': return <Wrench className="w-3.5 h-3.5" />;
      default: return <Box className="w-3.5 h-3.5" />;
    }
  };

  if (!defaultProjectId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Cadastre uma obra primeiro para gerenciar insumos
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
            <Box className="w-5 h-5" />
            Cadastro de Insumos (Base Global)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Insumos cadastrados aqui ficam disponíveis para todas as obras do sistema.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar insumo..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-8" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="material">Materiais</SelectItem>
                  <SelectItem value="labor">Mão de Obra</SelectItem>
                  <SelectItem value="equipment">Equipamentos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              {selectedInputIds.size > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setBulkFamilyDialogOpen(true)}>
                  <ArrowRightLeft className="w-4 h-4 mr-1" />
                  Mover {selectedInputIds.size} para família
                </Button>
              )}
              
              <Dialog open={familyDialogOpen} onOpenChange={(o) => { setFamilyDialogOpen(o); if (!o) { setEditingFamily(null); setNewFamily({ name: '', color: '#3b82f6' }); } }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Layers className="w-4 h-4 mr-1" />Famílias</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Famílias</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input placeholder="Nome da família" value={newFamily.name} onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })} className="flex-1" />
                      <Input type="color" value={newFamily.color} onChange={(e) => setNewFamily({ ...newFamily, color: e.target.value })} className="w-16" />
                      <Button onClick={saveFamily} disabled={!newFamily.name.trim()}>
                        {editingFamily ? <><Check className="w-4 h-4 mr-1" />Salvar</> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
                      </Button>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {families.map(f => (
                          <div key={f.id} className={`flex items-center justify-between p-2 rounded ${editingFamily?.id === f.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: f.color }} />
                              <span>{f.name}</span>
                              {inputCountByFamily[f.id] > 0 && <Badge variant="secondary" className="text-xs">{inputCountByFamily[f.id]}</Badge>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { 
                                if (editingFamily?.id === f.id) {
                                  setEditingFamily(null);
                                  setNewFamily({ name: '', color: '#3b82f6' });
                                } else {
                                  setEditingFamily(f); 
                                  setNewFamily({ name: f.name, color: f.color }); 
                                }
                              }}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteFamily(f.id)} disabled={inputCountByFamily[f.id] > 0}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    {editingFamily && (
                      <Button variant="outline" onClick={() => { setEditingFamily(null); setNewFamily({ name: '', color: '#3b82f6' }); }}>
                        Cancelar Edição
                      </Button>
                    )}
                    <Button onClick={() => setFamilyDialogOpen(false)}>Fechar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Dialog open={unitDialogOpen} onOpenChange={(o) => { setUnitDialogOpen(o); if (!o) { setEditingUnit(null); setNewUnit({ name: '', abbreviation: '' }); } }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Layers className="w-4 h-4 mr-1" />Unidades</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Unidades</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input placeholder="Nome" value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} className="flex-1" />
                      <Input placeholder="Abreviação" value={newUnit.abbreviation} onChange={(e) => setNewUnit({ ...newUnit, abbreviation: e.target.value })} className="w-24" />
                      <Button onClick={saveUnit} disabled={!newUnit.name.trim() || !newUnit.abbreviation.trim()}>
                        {editingUnit ? <><Check className="w-4 h-4 mr-1" />Salvar</> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
                      </Button>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {units.map(u => (
                          <div key={u.id} className={`flex items-center justify-between p-2 rounded ${editingUnit?.id === u.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                            <div className="flex items-center gap-2">
                              <span>{u.name} ({u.abbreviation})</span>
                              {inputCountByUnit[u.id] > 0 && <Badge variant="secondary" className="text-xs">{inputCountByUnit[u.id]}</Badge>}
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { 
                                if (editingUnit?.id === u.id) {
                                  setEditingUnit(null);
                                  setNewUnit({ name: '', abbreviation: '' });
                                } else {
                                  setEditingUnit(u); 
                                  setNewUnit({ name: u.name, abbreviation: u.abbreviation }); 
                                }
                              }}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteUnit(u.id)} disabled={inputCountByUnit[u.id] > 0}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    {editingUnit && (
                      <Button variant="outline" onClick={() => { setEditingUnit(null); setNewUnit({ name: '', abbreviation: '' }); }}>
                        Cancelar Edição
                      </Button>
                    )}
                    <Button onClick={() => setUnitDialogOpen(false)}>Fechar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-1" />
                  Importar
                </Button>
              )}
              
              {canEdit && (
                <Dialog open={inputDialogOpen} onOpenChange={(o) => { setInputDialogOpen(o); if (!o) { setEditingInput(null); setNewInput({ name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0, stock_quantity: 0 }); } }}>
                  <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Novo Insumo</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingInput ? 'Editar' : 'Cadastrar'} Insumo</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div><Label>Nome *</Label><Input value={newInput.name} onChange={(e) => setNewInput({ ...newInput, name: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Categoria *</Label>
                          <Select value={newInput.category} onValueChange={(v) => {
                            if (v === 'labor') {
                              const servicosFamily = families.find(f => f.name.toLowerCase() === 'serviços');
                              setNewInput({ ...newInput, category: v, unit: 'casa', material_family_id: servicosFamily?.id || newInput.material_family_id });
                            } else {
                              setNewInput({ ...newInput, category: v });
                            }
                          }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labor">Mão de Obra</SelectItem>
                              <SelectItem value="equipment">Equipamento</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Unidade</Label>
                          <Select value={newInput.unit} onValueChange={(v) => setNewInput({ ...newInput, unit: v })} disabled={newInput.category === 'labor'}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {newInput.category === 'labor' ? (
                                <SelectItem value="casa">casa</SelectItem>
                              ) : (
                                units.length > 0 ? units.map(u => <SelectItem key={u.id} value={u.abbreviation}>{u.abbreviation}</SelectItem>) : ['un', 'kg', 'm', 'm²', 'm³', 'l', 'pç', 'vb', 'casa'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Família</Label>
                          <Select value={newInput.material_family_id || "none"} onValueChange={(v) => setNewInput({ ...newInput, material_family_id: v === "none" ? "" : v })} disabled={newInput.category === 'labor'}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem família</SelectItem>
                              {families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Valor Unitário (R$)</Label>
                          <Input type="number" value={newInput.unit_value} onChange={(e) => setNewInput({ ...newInput, unit_value: parseFloat(e.target.value) || 0 })} placeholder="0,00" min="0" step="0.01" />
                        </div>
                      </div>
                      {newInput.category === 'material' && (
                        <div><Label>Quantidade em Estoque</Label>
                          <Input type="number" value={newInput.stock_quantity} onChange={(e) => setNewInput({ ...newInput, stock_quantity: parseFloat(e.target.value) || 0 })} placeholder="0" min="0" />
                        </div>
                      )}
                      <div><Label>Descrição</Label><Textarea value={newInput.description} onChange={(e) => setNewInput({ ...newInput, description: e.target.value })} /></div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInputDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={saveInput} disabled={!newInput.name.trim()}>Salvar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-2 pr-4">
              {Object.entries(groupedByFamily).map(([familyName, familyInputs]) => {
                const isExpanded = expandedFamilies.has(familyName);
                const family = families.find(f => f.name === familyName);
                return (
                  <Collapsible key={familyName} open={isExpanded} onOpenChange={() => {
                    setExpandedFamilies(prev => {
                      const next = new Set(prev);
                      if (next.has(familyName)) next.delete(familyName);
                      else next.add(familyName);
                      return next;
                    });
                  }}>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 flex-1 cursor-pointer">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {family && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: family.color }} />}
                          <span className="font-medium">{familyName}</span>
                          <Badge variant="secondary" className="text-xs">{familyInputs.length}</Badge>
                        </div>
                      </CollapsibleTrigger>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={(e) => { e.stopPropagation(); toggleSelectAllInFamily(familyInputs); }}
                        >
                          <CheckSquare className="w-3.5 h-3.5 mr-1" />
                          {familyInputs.every(i => selectedInputIds.has(i.id)) ? 'Desmarcar' : 'Selecionar'}
                        </Button>
                      )}
                    </div>
                    <CollapsibleContent>
                      <div className="mt-1 space-y-1 ml-6">
                        {familyInputs.map(input => (
                          <div key={input.id} className={`flex items-center justify-between p-2 border rounded-lg bg-card hover:bg-muted/30 ${selectedInputIds.has(input.id) ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {canEdit && (
                                <Checkbox
                                  checked={selectedInputIds.has(input.id)}
                                  onCheckedChange={() => toggleInputSelection(input.id)}
                                  className="shrink-0"
                                />
                              )}
                              {getCategoryIcon(input.category)}
                              <span className="truncate">{input.name}</span>
                              <Badge variant="outline" className="text-xs shrink-0">{input.unit}</Badge>
                              <Badge variant="secondary" className="text-xs shrink-0">{CATEGORY_LABELS[input.category]}</Badge>
                              {input.unit_value > 0 && <span className="text-xs text-muted-foreground shrink-0">R$ {input.unit_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                            </div>
                            {canEdit && (
                              <div className="flex gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                  setEditingInput(input);
                                  setNewInput({
                                    name: input.name,
                                    unit: input.unit,
                                    category: input.category,
                                    material_family_id: input.material_family_id || '',
                                    description: input.description || '',
                                    unit_value: input.unit_value,
                                    stock_quantity: input.stock_quantity
                                  });
                                  setInputDialogOpen(true);
                                }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteClick(input)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              {Object.keys(groupedByFamily).length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhum insumo cadastrado</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <AlertDialog open={deleteInputDialogOpen} onOpenChange={(open) => { setDeleteInputDialogOpen(open); if (!open) { setInputInBudget([]); setInputToDelete(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {inputInBudget.length > 0 && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {inputInBudget.length > 0 ? 'Exclusão Bloqueada' : 'Confirmar exclusão'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {inputInBudget.length > 0 ? (
                  <div className="space-y-2">
                    <p>O insumo <strong>"{inputToDelete?.name}"</strong> está vinculado aos seguintes orçamentos:</p>
                    <ul className="list-disc pl-4 text-sm space-y-1 max-h-40 overflow-y-auto">
                      {inputInBudget.map((budget, i) => (
                        <li key={i}>{budget}</li>
                      ))}
                    </ul>
                    <p className="text-amber-600 font-medium">Remova o insumo dos orçamentos antes de excluí-lo.</p>
                  </div>
                ) : (
                  <p>Tem certeza que deseja excluir o insumo "{inputToDelete?.name}"? Esta ação não pode ser desfeita.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {inputInBudget.length === 0 && (
              <AlertDialogAction onClick={confirmDeleteInput} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Family Change Dialog */}
      <Dialog open={bulkFamilyDialogOpen} onOpenChange={setBulkFamilyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover Insumos para Família</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedInputIds.size} insumo(s) selecionado(s) serão movidos para a família escolhida.
            </p>
            <div>
              <Label>Nova Família</Label>
              <Select value={bulkTargetFamily} onValueChange={setBulkTargetFamily}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a família destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem família</SelectItem>
                  {families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
                        {f.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkFamilyDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleBulkFamilyChange} disabled={!bulkTargetFamily}>
              <ArrowRightLeft className="w-4 h-4 mr-1" />
              Mover Insumos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportInputsDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen}
        projectId={defaultProjectId}
        families={families.map(f => ({ id: f.id, name: f.name, color: f.color }))}
        units={units.map(u => ({ abbreviation: u.abbreviation, name: u.name }))}
        existingInputs={inputs.map(i => ({ name: i.name }))}
        onSuccess={loadData}
      />
    </div>
  );
}
