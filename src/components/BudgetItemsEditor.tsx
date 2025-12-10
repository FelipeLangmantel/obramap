import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Save, Package, Hammer, Wrench, Search, Filter, Settings, X, Check, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  material_family_id: string | null;
  material_family_name?: string;
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
  const [showFamilySettings, setShowFamilySettings] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set(['all']));
  const [inputSuggestions, setInputSuggestions] = useState<InputItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<number | null>(null);

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
          material_family_id: i.material_family_id,
          material_family_name: i.material_families?.name
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
  const searchInputs = (query: string) => {
    if (!query || query.length < 2) {
      setInputSuggestions([]);
      return;
    }
    const filtered = inputs.filter(i => i.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
    setInputSuggestions(filtered);
  };

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
      category: 'material', // Will be set from input
      materialFamily: familyName,
      unitValue: 0,
      quantity: 1,
      unit: input.unit,
      isNew: true,
      isEditing: true,
      inputId: input.id
    };
    setItems([...items, newItem]);
    setShowSuggestions(null);
    setInputSuggestions([]);
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

  // Delete item
  const deleteItem = async (index: number) => {
    const item = items[index];
    if (item.id) {
      try {
        await supabase.from('scope_items').delete().eq('id', item.id);
      } catch (error) {
        console.error('Error deleting:', error);
        toast.error('Erro ao remover');
        return;
      }
    }
    setItems(items.filter((_, i) => i !== index));
    toast.success('Item removido');
  };

  // Update item field
  const updateItem = (index: number, field: keyof ScopeItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Add family
  const addFamily = async () => {
    if (!newFamilyName.trim()) return;
    
    try {
      const { data } = await supabase
        .from('material_families')
        .insert({
          project_id: projectId,
          name: newFamilyName.trim(),
          display_order: families.length
        })
        .select()
        .single();

      if (data) {
        setFamilies([...families, {
          id: data.id,
          name: data.name,
          icon: data.icon || 'package',
          color: data.color || '#9ca3af',
          displayOrder: data.display_order
        }]);
        setNewFamilyName('');
        toast.success('Família adicionada');
      }
    } catch (error) {
      console.error('Error adding family:', error);
      toast.error('Erro ao adicionar');
    }
  };

  // Delete family
  const deleteFamily = async (familyId: string, familyName: string) => {
    if (familyName === 'Geral') {
      toast.error('Não é possível remover a família Geral');
      return;
    }
    
    try {
      // Update items to use 'Geral' instead
      await supabase
        .from('scope_items')
        .update({ material_family: 'Geral' })
        .eq('project_id', projectId)
        .eq('material_family', familyName);

      await supabase.from('material_families').delete().eq('id', familyId);
      
      setFamilies(families.filter(f => f.id !== familyId));
      toast.success('Família removida');
    } catch (error) {
      console.error('Error deleting family:', error);
      toast.error('Erro ao remover');
    }
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
      {/* Header with filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar item..."
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

        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setShowFamilySettings(true)}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {/* Add item from catalog */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Input
            placeholder="Buscar insumo no cadastro para adicionar..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              searchInputs(e.target.value);
              setShowSuggestions(-1);
            }}
            onFocus={() => setShowSuggestions(-1)}
            className="h-9"
          />
          {showSuggestions === -1 && inputSuggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-auto">
              {inputSuggestions.map(input => (
                <div
                  key={input.id}
                  className="px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center justify-between"
                  onClick={() => { addItemFromInput(input); setSearchTerm(''); }}
                >
                  <span>{input.name}</span>
                  <span className="text-muted-foreground text-xs">{input.unit} - {input.material_family_name || 'Geral'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Items list grouped by family */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {Object.entries(itemsByFamily).map(([family, familyItems]) => {
            const isExpanded = expandedFamilies.has(family) || expandedFamilies.has('all');
            const familyTotal = familyItems.reduce((sum, i) => sum + i.unitValue * i.quantity, 0);
            
            return (
              <Collapsible key={family} open={isExpanded} onOpenChange={() => toggleFamily(family)}>
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
                                    onChange={(e) => updateItem(originalIndex, 'name', e.target.value)}
                                    placeholder="Nome do item"
                                    className="h-8 text-sm"
                                    autoFocus
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
                                  <Select
                                    value={item.unit}
                                    onValueChange={(v) => updateItem(originalIndex, 'unit', v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs px-2">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {units.length > 0 ? units.map(u => (
                                        <SelectItem key={u.id} value={u.abbreviation}>{u.abbreviation}</SelectItem>
                                      )) : ['un', 'kg', 'm', 'm²', 'm³', 'l', 'pç', 'vb'].map(u => (
                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
                                {item.category === 'material' && (
                                  <div className="col-span-2">
                                    <Select
                                      value={item.materialFamily}
                                      onValueChange={(v) => updateItem(originalIndex, 'materialFamily', v)}
                                    >
                                      <SelectTrigger className="h-8 text-xs px-2">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {families.map(f => (
                                          <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                <div className={`${item.category === 'material' ? 'col-span-1' : 'col-span-3'} flex justify-end gap-1`}>
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
                                    onClick={() => deleteItem(originalIndex)}
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
                                  <Settings className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => deleteItem(originalIndex)}
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

      {/* Family Settings Dialog */}
      <Dialog open={showFamilySettings} onOpenChange={setShowFamilySettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Famílias de Materiais</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nova família..."
                value={newFamilyName}
                onChange={(e) => setNewFamilyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addFamily()}
              />
              <Button onClick={addFamily} disabled={!newFamilyName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {families.map(family => (
                  <div key={family.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: family.color }}
                      />
                      <span className="text-sm">{family.name}</span>
                    </div>
                    {family.name !== 'Geral' && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteFamily(family.id, family.name)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowFamilySettings(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}