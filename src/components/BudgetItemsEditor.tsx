import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, Save, Package, Hammer, Wrench, Search, Filter, X, Check, ChevronDown, ChevronRight, GripVertical, Edit2, FileUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImportBudgetItemsDialog } from "./ImportBudgetItemsDialog";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import { useAuth } from "@/contexts/AuthContext";

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
  inputCode?: string;
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
  code: string | null;
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
  macroName?: string;
  onTotalChange?: (total: { material: number; labor: number; equipment: number }) => void;
  onClose?: () => void;
  compact?: boolean;
  scrollPositionKey?: string;
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
  { name: 'Ferramentas', icon: 'wrench', color: '#64748b', displayOrder: 8 },
  { name: 'Geral', icon: 'package', color: '#9ca3af', displayOrder: 99 },
];

export function BudgetItemsEditor({
  projectId,
  scopeId,
  macroId,
  scopeName,
  macroName,
  onTotalChange,
  onClose,
  compact = false,
  scrollPositionKey
}: BudgetItemsEditorProps) {
  const { currentStep, advanceToStep } = useProjectSetupFlow();
  const { company, canEdit, requireEdit } = useAuth();
  const companyId = company?.id;

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
  const [catalogFamilyFilter, setCatalogFamilyFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ index: number; item: ScopeItem } | null>(null);
  const [selectedInputsForMass, setSelectedInputsForMass] = useState<Set<string>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [allFamiliesExpanded, setAllFamiliesExpanded] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Load families and items
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load families globally (all families available for all projects)
      const { data: familiesData } = await supabase
        .from('material_families')
        .select('*')
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
          company_id: companyId!,
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
          inputId: item.input_id || undefined,
          inputCode: (item as any).input_code || undefined
        })));
      }

      // Load inputs catalog globally (all inputs available for all projects)
      const { data: inputsData } = await supabase
        .from('inputs')
        .select('*, material_families(name)')
        .order('name');

      if (inputsData) {
        setInputs(inputsData.map((i: any) => ({
          id: i.id,
          code: i.code || null,
          name: i.name,
          unit: i.unit,
          category: i.category as 'material' | 'labor' | 'equipment',
          material_family_id: i.material_family_id,
          material_family_name: i.material_families?.name,
          unit_value: i.unit_value || 0
        })));
      }

      // Load units globally
      const { data: unitsData } = await supabase
        .from('units')
        .select('*');

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

  // Search inputs as user types - with family filter
  const searchInputs = useCallback((query: string, categoryFilter?: string, familyFilter?: string) => {
    const searchQuery = query || '';
    const filtered = inputs.filter(i => {
      const matchesName = searchQuery.length < 2 || 
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (i.code && i.code.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !categoryFilter || categoryFilter === 'all' || i.category === categoryFilter;
      const matchesFamily = !familyFilter || familyFilter === 'all' || i.material_family_id === familyFilter;
      return matchesName && matchesCategory && matchesFamily;
    }).slice(0, 100);
    setInputSuggestions(filtered);
  }, [inputs]);

  // Select an input from suggestions
  const selectInput = (index: number, input: InputItem) => {
    const familyName = input.material_family_name || families.find(f => f.id === input.material_family_id)?.name || 'Geral';
    updateItem(index, 'name', input.name);
    updateItem(index, 'unit', input.unit);
    updateItem(index, 'materialFamily', familyName);
    updateItem(index, 'inputId', input.id);
    updateItem(index, 'inputCode', input.code || undefined);
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

  // Ref para focar na quantidade ao adicionar item
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const [newItemIndex, setNewItemIndex] = useState<number | null>(null);

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
    const newItems = [...items, newItem];
    setItems(newItems);
    setNewItemIndex(newItems.length - 1);
    // Expand the family so user sees the new item
    const family = newItem.category === 'material' ? newItem.materialFamily : 
      newItem.category === 'labor' ? 'Mão de Obra' : 'Equipamentos';
    setExpandedFamilies(prev => new Set([...prev, family]));
    setSelectedInputsForMass(new Set());
  };

  // Add multiple items from input catalog (mass selection)
  const addItemsFromInputsMass = () => {
    const inputsToAdd = inputs.filter(i => selectedInputsForMass.has(i.id));
    if (inputsToAdd.length === 0) {
      toast.warning('Selecione pelo menos um insumo');
      return;
    }

    const newItems: ScopeItem[] = inputsToAdd.map(input => {
      const familyName = input.material_family_name || families.find(f => f.id === input.material_family_id)?.name || 'Geral';
      return {
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
        inputId: input.id,
        inputCode: input.code || undefined
      };
    });

    // Expand all relevant families
    const familyNames = new Set(newItems.map(i => i.category === 'material' ? i.materialFamily : 
      i.category === 'labor' ? 'Mão de Obra' : 'Equipamentos'));
    setExpandedFamilies(prev => new Set([...prev, ...familyNames]));

    setItems(prev => [...prev, ...newItems]);
    setSelectedInputsForMass(new Set());
    setShowSuggestions(null);
    setInputSuggestions([]);
    setCatalogSearchTerm("");
    setCatalogFamilyFilter("all");
    toast.success(`${newItems.length} insumos adicionados!`);
  };

  // Handle imported items from file - AUTO SAVE
  const handleImportedItems = async (importedItems: {
    name: string;
    category: 'material' | 'labor' | 'equipment';
    quantity: number;
    unit: string;
    unitValue: number;
    materialFamily: string;
    inputId?: string;
  }[]) => {
    if (!requireEdit()) return;
    setIsSaving(true);
    
    try {
      // Save all items directly to database
      const savedItems: ScopeItem[] = [];
      
      for (const item of importedItems) {
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
          input_id: item.inputId || null,
          notes: null
        };

        const { data, error } = await supabase
          .from('scope_items')
          .insert(payload)
          .select()
          .single();

        if (error) {
          console.error('Error saving item:', error);
          continue;
        }

        if (data) {
          savedItems.push({
            id: data.id,
            scopeId: data.scope_id,
            macroId: data.macro_id,
            name: data.name,
            category: data.category as 'material' | 'labor' | 'equipment',
            materialFamily: data.material_family || 'Geral',
            unitValue: Number(data.unit_value) || 0,
            quantity: Number(data.quantity) || 1,
            unit: data.unit || 'un',
            notes: data.notes || undefined,
            inputId: data.input_id || undefined,
            isNew: false,
            isEditing: false
          });
        }
      }

      // Expand all relevant families
      const familyNames = new Set(savedItems.map(i => i.category === 'material' ? i.materialFamily : 
        i.category === 'labor' ? 'Mão de Obra' : 'Equipamentos'));
      setExpandedFamilies(prev => new Set([...prev, ...familyNames]));

      setItems(prev => [...prev, ...savedItems]);
      toast.success(`${savedItems.length} itens importados e salvos automaticamente!`);
    } catch (error) {
      console.error('Error importing items:', error);
      toast.error('Erro ao importar itens');
    } finally {
      setIsSaving(false);
    }
  };


  // Save and restore scroll position
  useEffect(() => {
    if (scrollPositionKey) {
      const savedPosition = sessionStorage.getItem(`budget_scroll_${scrollPositionKey}`);
      if (savedPosition && scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          setTimeout(() => {
            viewport.scrollTop = parseInt(savedPosition, 10);
          }, 100);
        }
      }
    }
  }, [scrollPositionKey, isLoading]);

  // Save scroll position on unmount or when scrolling
  useEffect(() => {
    if (!scrollPositionKey) return;
    
    const saveScrollPosition = () => {
      if (scrollAreaRef.current) {
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          sessionStorage.setItem(`budget_scroll_${scrollPositionKey}`, String(viewport.scrollTop));
        }
      }
    };

    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.addEventListener('scroll', saveScrollPosition);
      return () => viewport.removeEventListener('scroll', saveScrollPosition);
    }
  }, [scrollPositionKey, isLoading]);

  // Focus on quantity input when new item is added
  useEffect(() => {
    if (newItemIndex !== null && quantityInputRef.current) {
      quantityInputRef.current.focus();
      quantityInputRef.current.select();
      setNewItemIndex(null);
    }
  }, [newItemIndex, items]);

  // Save item
  const saveItem = async (index: number) => {
    if (!requireEdit()) return;
    const item = items[index];
    if (!item.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        project_id: projectId,
        scope_id: scopeId,
        macro_id: macroId,
        name: item.name,
        category: item.category,
        material_family: item.materialFamily,
        unit_value: item.unitValue,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes || null,
        input_id: item.inputId || null,
        input_code: item.inputCode || null
      };

      if (item.id) {
        await supabase.from('scope_items').update(payload).eq('id', item.id);
      } else {
        const { data } = await supabase.from('scope_items').insert(payload).select().single();
        if (data) {
          const updated = [...items];
          updated[index] = { ...item, id: data.id, isNew: false, isEditing: false };
          setItems(updated);

          // ✅ Orçamento salvo -> liberar Contrato da Obra (avança setup_step para budget_defined)
          if (currentStep === "project_created" || currentStep === "blocks_configured" || currentStep === "services_defined") {
            await advanceToStep("budget_defined");
          }

          return;
        }
      }

      const updated = [...items];
      updated[index] = { ...item, isNew: false, isEditing: false };
      setItems(updated);

      // ✅ Orçamento salvo -> liberar Contrato da Obra (avança setup_step para budget_defined)
      if (currentStep === "project_created" || currentStep === "blocks_configured" || currentStep === "services_defined") {
        await advanceToStep("budget_defined");
      }

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
    if (!requireEdit()) return;
    if (!itemToDelete) return;
    
    const { index, item } = itemToDelete;
    
    // Primeiro atualiza o estado local imediatamente
    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    setDeleteDialogOpen(false);
    setItemToDelete(null);
    
    // Depois deleta do banco de dados
    if (item.id) {
      try {
        const { error } = await supabase.from('scope_items').delete().eq('id', item.id);
        if (error) {
          console.error('Error deleting:', error);
          toast.error('Erro ao remover do banco de dados');
          // Reverte a mudança local se falhou
          loadData();
          return;
        }
        toast.success('Item removido permanentemente');
      } catch (error) {
        console.error('Error deleting:', error);
        toast.error('Erro ao remover');
        // Reverte a mudança local se falhou
        loadData();
      }
    } else {
      toast.success('Item removido');
    }
  };

  // Update item field
  const updateItem = (index: number, field: keyof ScopeItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Filter items - show all items (filters removed)
  const filteredItems = useMemo(() => {
    return items;
  }, [items]);

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

  // Expand/collapse all families
  const toggleAllFamilies = () => {
    if (allFamiliesExpanded) {
      setExpandedFamilies(new Set());
      setAllFamiliesExpanded(false);
    } else {
      const allFamilyNames = Object.keys(itemsByFamily);
      setExpandedFamilies(new Set(allFamilyNames));
      setAllFamiliesExpanded(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Carregando itens...
      </div>
    );
  }

  return (
    <div className={`flex flex-col w-full min-w-0 overflow-hidden ${compact ? 'h-[400px]' : 'h-full'}`}>
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

      {/* Import budget items dialog */}
      <ImportBudgetItemsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        projectId={projectId}
        scopeId={scopeId}
        macroId={macroId}
        existingInputs={inputs}
        families={families}
        onImport={handleImportedItems}
      />

      {/* Removed filters - search only via catalog */}

      {/* Add item from catalog - allows multiple selection with family filter */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setImportDialogOpen(true)}
        >
          <FileUp className="w-4 h-4" />
          Importar
        </Button>
        
        {/* Expand/Collapse all families button */}
        {Object.keys(itemsByFamily).length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={toggleAllFamilies}
          >
            <ChevronsUpDown className="w-4 h-4" />
            {allFamiliesExpanded ? 'Recolher Todas' : 'Expandir Todas'}
          </Button>
        )}
        <Select value={catalogFamilyFilter} onValueChange={(val) => {
          setCatalogFamilyFilter(val);
          searchInputs(catalogSearchTerm, 'all', val);
          setShowSuggestions(-1);
          setSelectedInputsForMass(new Set());
        }}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Filtrar por família" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as famílias</SelectItem>
            {families.map(f => (
              <SelectItem key={f.id} value={f.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                  {f.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar insumo, mão de obra ou equipamento no cadastro..."
            value={catalogSearchTerm}
            onChange={(e) => {
              setCatalogSearchTerm(e.target.value);
              searchInputs(e.target.value, 'all', catalogFamilyFilter);
              setShowSuggestions(-1);
            }}
            onFocus={() => {
              searchInputs(catalogSearchTerm, 'all', catalogFamilyFilter);
              setShowSuggestions(-1);
            }}
            className="h-9 pl-8"
          />
          {showSuggestions === -1 && inputSuggestions.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg">
              <div className="p-2 border-b bg-muted/50 text-xs text-muted-foreground flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    checked={selectedInputsForMass.size > 0 && inputSuggestions.filter(i => !items.some(item => item.inputId === i.id)).every(i => selectedInputsForMass.has(i.id))}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const availableIds = inputSuggestions.filter(i => !items.some(item => item.inputId === i.id)).map(i => i.id);
                        setSelectedInputsForMass(new Set(availableIds));
                      } else {
                        setSelectedInputsForMass(new Set());
                      }
                    }}
                  />
                  <span>
                    {selectedInputsForMass.size > 0 
                      ? `${selectedInputsForMass.size} selecionado(s)` 
                      : 'Selecionar todos'}
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">{inputSuggestions.length} encontrados</Badge>
              </div>
              <ScrollArea className="h-[350px]">
                <div className="p-1">
                  {inputSuggestions.map(input => {
                    const alreadyAdded = items.some(item => item.inputId === input.id);
                    const isSelected = selectedInputsForMass.has(input.id);
                    return (
                      <div
                        key={input.id}
                        className={`px-3 py-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-2 rounded-md mb-0.5 ${
                          alreadyAdded ? 'bg-green-50/50 dark:bg-green-900/10 opacity-50' : 
                          isSelected ? 'bg-primary/10 border border-primary/30' : ''
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (!alreadyAdded) {
                            setSelectedInputsForMass(prev => {
                              const next = new Set(prev);
                              if (next.has(input.id)) {
                                next.delete(input.id);
                              } else {
                                next.add(input.id);
                              }
                              return next;
                            });
                          }
                        }}
                      >
                        <Checkbox 
                          checked={alreadyAdded || isSelected} 
                          disabled={alreadyAdded}
                          onCheckedChange={() => {}}
                          className="pointer-events-none"
                        />
                        {alreadyAdded && <Check className="w-4 h-4 text-green-500 shrink-0" />}
                        {!alreadyAdded && (
                          input.category === 'material' ? <Package className="w-4 h-4 text-blue-500 shrink-0" /> : 
                          input.category === 'labor' ? <Hammer className="w-4 h-4 text-orange-500 shrink-0" /> : 
                          <Wrench className="w-4 h-4 text-green-500 shrink-0" />
                        )}
                        {input.code && <span className="text-muted-foreground text-[10px] font-mono shrink-0">{input.code}</span>}
                        <span className="flex-1 truncate font-medium">{input.name}</span>
                        <span className="text-muted-foreground text-xs shrink-0">{input.unit}</span>
                        {input.unit_value && input.unit_value > 0 && (
                          <span className="text-green-600 text-xs font-medium shrink-0">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.unit_value)}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] px-1">{input.material_family_name || 'Geral'}</Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="p-2 border-t bg-muted/30 sticky bottom-0 flex gap-2">
                {selectedInputsForMass.size > 0 && (
                  <Button size="sm" className="flex-1" onClick={addItemsFromInputsMass}>
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar {selectedInputsForMass.size} selecionado(s)
                  </Button>
                )}
                <Button size="sm" variant="outline" className={selectedInputsForMass.size > 0 ? '' : 'w-full'} onClick={() => {
                  setShowSuggestions(null);
                  setSelectedInputsForMass(new Set());
                }}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
          {showSuggestions === -1 && catalogSearchTerm.length >= 2 && inputSuggestions.length === 0 && catalogFamilyFilter === 'all' && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
              Nenhum insumo encontrado. Cadastre no módulo de Suprimentos.
            </div>
          )}
          {showSuggestions === -1 && inputSuggestions.length === 0 && catalogFamilyFilter !== 'all' && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
              Nenhum insumo encontrado nesta família.
            </div>
          )}
        </div>
      </div>

      {/* Items list grouped by family */}
      <ScrollArea className="flex-1 w-full min-w-0" ref={scrollAreaRef}>
        <div className="space-y-2 pr-2 min-w-0">
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
                                    ref={item.isNew ? quantityInputRef : undefined}
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(originalIndex, 'quantity', parseFloat(e.target.value) || 0)}
                                    placeholder="Qtd"
                                    className="h-8 text-sm"
                                    min="0"
                                    step="0.01"
                                    autoFocus={item.isNew}
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
                                <div className="flex items-center gap-1.5">
                                  {item.inputCode && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{item.inputCode}</span>}
                                  <p className="text-sm font-medium truncate">{item.name}</p>
                                </div>
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