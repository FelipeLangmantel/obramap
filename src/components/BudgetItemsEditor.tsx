import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Save, Package, Hammer, Wrench, Search, Filter, X, Check, ChevronDown, ChevronRight, GripVertical, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ScopeItem {
  id?: string;
  scopeId: string;
  macroId: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  materialFamily: string;
  unitValue: number;
  quantity: number;
  unit: string;
  notes?: string;
  isNew?: boolean;
  isEditing?: boolean;
  inputId?: string;
}

interface MaterialFamily {
  id: string;
  name: string;
  icon: string;
  color: string;
  displayOrder: number;
}

interface InputItem {
  id: string;
  name: string;
  unit: string;
  category: 'material' | 'labor' | 'equipment';
  material_family_id: string | null;
  material_family_name?: string;
  unit_value?: number;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
}

interface Macro {
  id: string;
  name: string;
  color: string;
  scopes: { id: string; name: string }[];
}

interface BudgetItemsEditorProps {
  projectId: string;
  scopeId: string;
  macroId: string;
  scopeName: string;
  onTotalChange?: (total: { material: number; labor: number; equipment: number }) => void;
  onClose?: () => void;
  compact?: boolean;
}

const DEFAULT_FAMILIES: Omit<MaterialFamily, 'id'>[] = [
  { name: 'Hidráulica', icon: 'droplet', color: '#3b82f6', displayOrder: 0 },
  { name: 'Elétrica', icon: 'zap', color: '#eab308', displayOrder: 1 },
  { name: 'Aço', icon: 'construction', color: '#6b7280', displayOrder: 2 },
  { name: 'Alvenaria', icon: 'brick-wall', color: '#f97316', displayOrder: 3 },
  { name: 'Agregados', icon: 'mountain', color: '#a3a3a3', displayOrder: 4 },
  { name: 'Madeira', icon: 'tree-pine', color: '#854d0e', displayOrder: 5 },
  { name: 'Pintura', icon: 'paintbrush', color: '#ec4899', displayOrder: 6 },
  { name: 'Cerâmica', icon: 'square', color: '#14b8a6', displayOrder: 7 },
  { name: 'Geral', icon: 'package', color: '#9ca3af', displayOrder: 99 },
];

export function BudgetItemsEditor({
  projectId,
  scopeId,
  macroId,
  scopeName,
  onTotalChange,
  onClose,
  compact = false
}: BudgetItemsEditorProps) {
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterFamily, setFilterFamily] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [inputSuggestions, setInputSuggestions] = useState<InputItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null);
  const [catalogSearchTerm, setCatalogSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ index: number; item: ScopeItem } | null>(null);

  // Load families and items
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load families
      const { data: familiesData } = await supabase
        .from('material_families')
        .select('*')
        .eq('project_id', projectId)
        .order('display_order');

      if (familiesData && familiesData.length > 0) {
        setFamilies(familiesData.map(f => ({
          id: f.id,
          name: f.name,
          icon: f.icon || 'package',
          color: f.color || '#9ca3af',
          displayOrder: f.display_order
        })));
      } else {
        // Create default families
        const insertData = DEFAULT_FAMILIES.map(f => ({
          project_id: projectId,
          name: f.name,
          icon: f.icon,
          color: f.color,
          display_order: f.displayOrder
        }));
        
        const { data: newFamilies } = await supabase
          .from('material_families')
          .insert(insertData)
          .select();
        
        if (newFamilies) {
          setFamilies(newFamilies.map(f => ({
            id: f.id,
            name: f.name,
            icon: f.icon || 'package',
            color: f.color || '#9ca3af',
            displayOrder: f.display_order
          })));
        }
      }

      // Load items for this scope
      const { data: itemsData } = await supabase
        .from('scope_items')
        .select('*')
        .eq('project_id', projectId)
        .eq('scope_id', scopeId);

      if (itemsData) {
        setItems(itemsData.map(item => ({
          id: item.id,
          scopeId: item.scope_id,
          macroId: item.macro_id,
          name: item.name,
          category: item.category as 'material' | 'labor' | 'equipment',
          materialFamily: item.material_family || 'Geral',
          unitValue: Number(item.unit_value) || 0,
          quantity: Number(item.quantity) || 1,
          unit: item.unit || 'un',
          notes: item.notes || undefined,
          inputId: item.input_id || undefined
        })));
      }

      // Load inputs catalog
      const { data: inputsData } = await supabase
        .from('inputs')
        .select('*, material_families(name)')
        .eq('project_id', projectId)
        .order('name');

      if (inputsData) {
        setInputs(inputsData.map((i: any) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          category: i.category as 'material' | 'labor' | 'equipment',
          material_family_id: i.material_family_id,
          material_family_name: i.material_families?.name,
          unit_value: i.unit_value || 0
        })));
      }

      // Load units
      const { data: unitsData } = await supabase
        .from('units')
        .select('*')
        .eq('project_id', projectId);

      if (unitsData) {
        setUnits(unitsData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, scopeId]);

  // Search inputs as user types
  const searchInputs = useCallback((query: string, categoryFilter?: string) => {
    if (!query || query.length < 2) {
      setInputSuggestions([]);
      return;
    }
    const filtered = inputs.filter(i => {
      const matchesName = i.name.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !categoryFilter || categoryFilter === 'all' || i.category === categoryFilter;
      return matchesName && matchesCategory;
    }).slice(0, 8);
    setInputSuggestions(filtered);
  }, [inputs]);

  // Select an input from suggestions
  const selectInput = (index: number, input: InputItem) => {
    const familyName = input.material_family_name || families.find(f => f.id === input.material_family_id)?.name || 'Geral';
    updateItem(index, 'name', input.name);
    updateItem(index, 'unit', input.unit);
    updateItem(index, 'materialFamily', familyName);
    updateItem(index, 'inputId', input.id);
    setShowSuggestions(null);
    setInputSuggestions([]);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate totals and notify parent
  useEffect(() => {
    if (onTotalChange) {
      const totals = items.reduce(
        (acc, item) => {
          const total = item.unitValue * item.quantity;
          if (item.category === 'material') acc.material += total;
          else if (item.category === 'labor') acc.labor += total;
          else acc.equipment += total;
          return acc;
        },
        { material: 0, labor: 0, equipment: 0 }
      );
      onTotalChange(totals);
    }
  }, [items, onTotalChange]);

  // Add new item from input catalog only
  const addItemFromInput = (input: InputItem) => {
    const familyName = input.material_family_name || families.find(f => f.id === input.material_family_id)?.name || 'Geral';
    const newItem: ScopeItem = {
      scopeId,
      macroId,
      name: input.name,
      category: input.category || 'material',
      materialFamily: familyName,
      unitValue: input.unit_value || 0,
      quantity: 1,
      unit: input.unit,
      isNew: true,
      isEditing: true,
      inputId: input.id
    };
    setItems([...items, newItem]);
    setShowSuggestions(null);
    setInputSuggestions([]);
    setCatalogSearchTerm("");
  };

  // Save item
  const saveItem = async (index: number) => {
    const item = items[index];
    if (!item.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        project_id: projectId,
        scope_id: scopeId,
        macro_id: macroId,
        name: item.name,
        category: item.category,
        material_family: item.materialFamily,
        unit_value: item.unitValue,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes || null
      };

      if (item.id) {
        await supabase.from('scope_items').update(payload).eq('id', item.id);
      } else {
        const { data } = await supabase.from('scope_items').insert(payload).select().single();
        if (data) {
          const updated = [...items];
          updated[index] = { ...item, id: data.id, isNew: false, isEditing: false };
          setItems(updated);
          return;
        }
      }

      const updated = [...items];
      updated[index] = { ...item, isNew: false, isEditing: false };
      setItems(updated);
      toast.success('Item salvo!');
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete item
  const confirmDeleteItem = (index: number) => {
    const item = items[index];
    setItemToDelete({ index, item });
    setDeleteDialogOpen(true);
  };

  // Delete item after confirmation
  const executeDeleteItem = async () => {
    if (!itemToDelete) return;
    
    const { index, item } = itemToDelete;
    if (item.id) {
      try {
        await supabase.from('scope_items').delete().eq('id', item.id);
      } catch (error) {
        console.error('Error deleting:', error);
        toast.error('Erro ao remover');
        setDeleteDialogOpen(false);
        setItemToDelete(null);
        return;
      }
    }
    setItems(items.filter((_, i) => i !== index));
    toast.success('Item removido permanentemente');
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  // Update item field
  const updateItem = (index: number, field: keyof ScopeItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = !searchTerm || 
        item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFamily = filterFamily === 'all' || item.materialFamily === filterFamily;
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      return matchesSearch && matchesFamily && matchesCategory;
    });
  }, [items, searchTerm, filterFamily, filterCategory]);

  // Group items by family
  const itemsByFamily = useMemo(() => {
    const grouped: Record<string, ScopeItem[]> = {};
    filteredItems.forEach(item => {
      const family = item.category === 'material' ? item.materialFamily : 
        item.category === 'labor' ? 'Mão de Obra' : 'Equipamentos';
      if (!grouped[family]) grouped[family] = [];
      grouped[family].push(item);
    });
    return grouped;
  }, [filteredItems]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'material': return <Package className="w-3.5 h-3.5 text-blue-500" />;
      case 'labor': return <Hammer className="w-3.5 h-3.5 text-orange-500" />;
      case 'equipment': return <Wrench className="w-3.5 h-3.5 text-green-500" />;
      default: return <Package className="w-3.5 h-3.5" />;
    }
  };

  const toggleFamily = (family: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Carregando itens...
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-[400px]' : 'h-full'}`}>
      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o item "{itemToDelete?.item.name}"? 
              Esta ação é permanente e os valores serão recalculados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header with filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filtrar itens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="material">Material</SelectItem>
            <SelectItem value="labor">Mão de Obra</SelectItem>
            <SelectItem value="equipment">Equipamento</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterFamily} onValueChange={setFilterFamily}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Família" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {families.map(f => (
              <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add item from catalog */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar insumo, mão de obra ou equipamento no cadastro..."
            value={catalogSearchTerm}
            onChange={(e) => {
              setCatalogSearchTerm(e.target.value);
              searchInputs(e.target.value, filterCategory);
              setShowSuggestions(-1);
            }}
            onFocus={() => {
              if (catalogSearchTerm.length >= 2) {
                searchInputs(catalogSearchTerm, filterCategory);
                setShowSuggestions(-1);
              }
            }}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(null), 200);
            }}
            className="h-9 pl-8"
          />
          {showSuggestions === -1 && inputSuggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-[250px] overflow-auto">
              {inputSuggestions.map(input => (
                <div
                  key={input.id}
                  className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addItemFromInput(input)}
                >
                  {input.category === 'material' ? <Package className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : 
                   input.category === 'labor' ? <Hammer className="w-3.5 h-3.5 text-orange-500 shrink-0" /> : 
                   <Wrench className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  <span className="flex-1 truncate">{input.name}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{input.unit}</span>
                  {input.unit_value && input.unit_value > 0 && (
                    <span className="text-green-600 text-xs font-medium shrink-0">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.unit_value)}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1">{input.material_family_name || 'Geral'}</Badge>
                </div>
              ))}
            </div>
          )}
          {showSuggestions === -1 && catalogSearchTerm.length >= 2 && inputSuggestions.length === 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
              Nenhum insumo encontrado. Cadastre no módulo de Suprimentos.
            </div>
          )}
        </div>
      </div>

      {/* Items list grouped by family */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {Object.entries(itemsByFamily).map(([family, familyItems]) => {
            const isExpanded = expandedFamilies.has(family);
            const familyTotal = familyItems.reduce((sum, i) => sum + i.unitValue * i.quantity, 0);
            const familyData = families.find(f => f.name === family);
            
            return (
              <Collapsible key={family} open={isExpanded} onOpenChange={() => toggleFamily(family)}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      {familyData && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: familyData.color }} />}
                      <span className="font-medium text-sm">{family}</span>
                      <Badge variant="secondary" className="text-xs">{familyItems.length}</Badge>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(familyTotal)}</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1 mt-1 pl-2">
                    {familyItems.map((item, idx) => {
                      const originalIndex = items.findIndex(i => i === item);
                      const isEditing = item.isEditing || item.isNew;
                      
                      return (
                        <div
                          key={item.id || `new-${idx}`}
                          className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                            isEditing ? 'bg-accent border-primary/50' : 'bg-background hover:bg-muted/30'
                          }`}
                        >
                          {isEditing ? (
                            <>
                              <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-4">
                                  <Input
                                    value={item.name}
                                    placeholder="Nome do item"
                                    className="h-8 text-sm bg-muted/50 cursor-not-allowed"
                                    readOnly
                                    disabled
                                    title="Itens devem ser selecionados do cadastro de insumos"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(originalIndex, 'quantity', parseFloat(e.target.value) || 0)}
                                    placeholder="Qtd"
                                    className="h-8 text-sm"
                                    min="0"
                                    step="0.01"
                                  />
                                </div>
                                <div className="col-span-1">
                                  <Input
                                    value={item.unit}
                                    className="h-8 text-xs px-2 bg-muted/50 cursor-not-allowed"
                                    readOnly
                                    disabled
                                    title="Unidade definida no cadastro de insumos"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    type="number"
                                    value={item.unitValue}
                                    onChange={(e) => updateItem(originalIndex, 'unitValue', parseFloat(e.target.value) || 0)}
                                    placeholder="R$ Unit"
                                    className="h-8 text-sm"
                                    min="0"
                                    step="0.01"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <Input
                                    value={item.materialFamily}
                                    className="h-8 text-xs px-2 bg-muted/50 cursor-not-allowed"
                                    readOnly
                                    disabled
                                    title="Família definida no cadastro de insumos"
                                  />
                                </div>
                                <div className="col-span-1 flex justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-green-600"
                                    onClick={() => saveItem(originalIndex)}
                                    disabled={isSaving}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => confirmDeleteItem(originalIndex)}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="w-5">{getCategoryIcon(item.category)}</div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.quantity} {item.unit} × {formatCurrency(item.unitValue)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold">{formatCurrency(item.unitValue * item.quantity)}</p>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => updateItem(originalIndex, 'isEditing', true)}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => confirmDeleteItem(originalIndex)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {items.length === 0 ? 'Nenhum item cadastrado. Use os botões acima para adicionar.' : 'Nenhum item encontrado com os filtros aplicados.'}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Summary footer */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Package className="w-4 h-4 text-blue-500" />
            {formatCurrency(items.filter(i => i.category === 'material').reduce((s, i) => s + i.unitValue * i.quantity, 0))}
          </span>
          <span className="flex items-center gap-1">
            <Hammer className="w-4 h-4 text-orange-500" />
            {formatCurrency(items.filter(i => i.category === 'labor').reduce((s, i) => s + i.unitValue * i.quantity, 0))}
          </span>
          <span className="flex items-center gap-1">
            <Wrench className="w-4 h-4 text-green-500" />
            {formatCurrency(items.filter(i => i.category === 'equipment').reduce((s, i) => s + i.unitValue * i.quantity, 0))}
          </span>
        </div>
        <div className="font-bold">
          Total: {formatCurrency(items.reduce((s, i) => s + i.unitValue * i.quantity, 0))}
        </div>
      </div>

    </div>
  );
}