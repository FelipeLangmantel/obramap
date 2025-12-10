import { useState, useEffect, useCallback, useMemo } from "react";
import { Package, Truck, FileText, Clock, AlertTriangle, CheckCircle2, Plus, Settings, Users, Search, Calendar, DollarSign, Loader2, Eye, Edit2, Trash2, Send, Check, X, Box, Layers, Hammer, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
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
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
}

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  supplier_type: 'material' | 'labor' | 'equipment';
}

interface QuotationRequest {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  required_date: string;
  notes: string | null;
  created_at: string;
  items?: QuotationItem[];
}

interface QuotationItem {
  id: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  quantity: number;
  unit: string;
  estimated_unit_value: number;
  quotes?: SupplierQuote[];
}

interface SupplierQuote {
  id: string;
  supplier_id: string;
  supplier?: Supplier;
  unit_value: number;
  total_value: number;
  delivery_days: number;
  notes: string | null;
  is_selected: boolean;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  supplier?: Supplier;
  status: 'pending' | 'sent' | 'confirmed' | 'in_transit' | 'delivered' | 'cancelled';
  total_value: number;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  notes: string | null;
  created_at: string;
  items?: PurchaseOrderItem[];
  tracking?: DeliveryTracking[];
}

interface PurchaseOrderItem {
  id: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  quantity: number;
  unit: string;
  unit_value: number;
  total_value: number;
}

interface DeliveryTracking {
  id: string;
  status: string;
  description: string | null;
  location: string | null;
  tracking_date: string;
}

interface LaborContract {
  id: string;
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
}

interface ScopeItem {
  id: string;
  name: string;
  category: 'material' | 'labor' | 'equipment';
  quantity: number;
  unit: string;
  unit_value: number;
}

const CATEGORY_LABELS = {
  material: 'Material',
  labor: 'Mão de Obra',
  equipment: 'Equipamento'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em Andamento',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  in_transit: 'Em Trânsito',
  delivered: 'Entregue'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500',
  in_progress: 'bg-blue-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-500',
  sent: 'bg-blue-400',
  confirmed: 'bg-blue-600',
  in_transit: 'bg-orange-500',
  delivered: 'bg-green-600'
};

export function SuppliesView() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const projectId = currentProject?.id;

  const [activeTab, setActiveTab] = useState<"alerts" | "inputs" | "quotations" | "orders" | "suppliers" | "settings">("alerts");
  const [isLoading, setIsLoading] = useState(true);
  
  // Data states - loaded on demand
  const [inputs, setInputs] = useState<InputItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [families, setFamilies] = useState<MaterialFamily[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [quotations, setQuotations] = useState<QuotationRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [laborContracts, setLaborContracts] = useState<LaborContract[]>([]);
  const [executedHouses, setExecutedHouses] = useState<Record<string, number>>({});
  const [alertsData, setAlertsData] = useState<{ scopeItems: ScopeItem[], pendingQuotations: number, inTransitOrders: number }>({ scopeItems: [], pendingQuotations: 0, inTransitOrders: 0 });
  const [dataLoaded, setDataLoaded] = useState<Record<string, boolean>>({});

  // Dialog states
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [quoteDetailsDialogOpen, setQuoteDetailsDialogOpen] = useState(false);
  const [orderEditDialogOpen, setOrderEditDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationRequest | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingInput, setEditingInput] = useState<InputItem | null>(null);

  // Form states
  const [newInput, setNewInput] = useState<{ name: string; unit: string; category: string; material_family_id: string; description: string; unit_value: number }>({
    name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0
  });
  const [newUnit, setNewUnit] = useState<{ name: string; abbreviation: string }>({ name: '', abbreviation: '' });
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ supplier_type: 'material' });
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [newFamily, setNewFamily] = useState<{ name: string; color: string }>({ name: '', color: '#3b82f6' });
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editingFamily, setEditingFamily] = useState<MaterialFamily | null>(null);
  const [newQuotation, setNewQuotation] = useState<{ title: string; required_date: string; notes: string; items: string[] }>({
    title: '', required_date: '', notes: '', items: []
  });
  const [supplierQuotes, setSupplierQuotes] = useState<Record<string, { supplier_id: string; unit_value: number; delivery_days: number; notes: string }[]>>({});
  const [newTracking, setNewTracking] = useState<{ status: string; description: string; location: string }>({
    status: '', description: '', location: ''
  });
  const [searchInput, setSearchInput] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<string>('all');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [deleteInputDialogOpen, setDeleteInputDialogOpen] = useState(false);
  const [inputToDelete, setInputToDelete] = useState<InputItem | null>(null);

  // Load minimal data for alerts on mount
  const loadAlertData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);

    try {
      const [scopeRes, quotRes, ordersRes, laborRes, prodRes] = await Promise.all([
        supabase.from('scope_items').select('id, name, category, quantity, unit, unit_value').eq('project_id', projectId),
        supabase.from('quotation_requests').select('id, status').eq('project_id', projectId).eq('status', 'pending'),
        supabase.from('purchase_orders').select('id, status').eq('project_id', projectId).eq('status', 'in_transit'),
        supabase.from('labor_contracts').select('*').eq('project_id', projectId),
        supabase.from('weekly_productions').select('scope_id, house_ids').eq('project_id', projectId)
      ]);

      if (scopeRes.data) {
        setAlertsData(prev => ({ ...prev, scopeItems: scopeRes.data.map(item => ({
          ...item, category: item.category as 'material' | 'labor' | 'equipment'
        })) }));
      }
      if (quotRes.data) setAlertsData(prev => ({ ...prev, pendingQuotations: quotRes.data.length }));
      if (ordersRes.data) setAlertsData(prev => ({ ...prev, inTransitOrders: ordersRes.data.length }));
      if (laborRes.data) setLaborContracts(laborRes.data);
      
      if (prodRes.data) {
        const executed: Record<string, number> = {};
        prodRes.data.forEach(p => {
          if (!executed[p.scope_id]) executed[p.scope_id] = 0;
          executed[p.scope_id] += (p.house_ids?.length || 0);
        });
        setExecutedHouses(executed);
      }
    } catch (error) {
      console.error('Error loading alert data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Load tab-specific data on demand
  const loadTabData = useCallback(async (tab: string) => {
    if (!projectId || dataLoaded[tab]) return;

    try {
      if (tab === 'inputs') {
        const [inputsRes, unitsRes, familiesRes] = await Promise.all([
          supabase.from('inputs').select('*, material_families(*)').eq('project_id', projectId).order('name'),
          supabase.from('units').select('*').eq('project_id', projectId).order('name'),
          supabase.from('material_families').select('*').eq('project_id', projectId).order('display_order')
        ]);
        if (inputsRes.data) setInputs(inputsRes.data.map((i: any) => ({ ...i, material_family: i.material_families, category: i.category as 'material' | 'labor' | 'equipment', unit_value: i.unit_value || 0 })));
        if (unitsRes.data) setUnits(unitsRes.data);
        if (familiesRes.data) setFamilies(familiesRes.data.map(f => ({ id: f.id, name: f.name, color: f.color || '#9ca3af' })));
      } else if (tab === 'quotations') {
        const { data } = await supabase.from('quotation_requests').select(`*, quotation_items (*, supplier_quotes (*, suppliers (*)))`).eq('project_id', projectId).order('created_at', { ascending: false });
        if (data) setQuotations(data.map((q: any) => ({ ...q, status: q.status as QuotationRequest['status'], items: q.quotation_items?.map((item: any) => ({ ...item, quotes: item.supplier_quotes?.map((sq: any) => ({ ...sq, supplier: sq.suppliers })) })) })));
      } else if (tab === 'orders') {
        const { data } = await supabase.from('purchase_orders').select(`*, suppliers (*), purchase_order_items (*), delivery_tracking (*)`).eq('project_id', projectId).order('created_at', { ascending: false });
        if (data) setPurchaseOrders(data.map((o: any) => ({ ...o, status: o.status as PurchaseOrder['status'], supplier: o.suppliers, items: o.purchase_order_items, tracking: o.delivery_tracking })));
      } else if (tab === 'suppliers') {
        const { data } = await supabase.from('suppliers').select('*').eq('project_id', projectId).order('name');
        if (data) setSuppliers(data.map(s => ({ ...s, supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' })));
      }

      setDataLoaded(prev => ({ ...prev, [tab]: true }));
    } catch (error) {
      console.error(`Error loading ${tab} data:`, error);
    }
  }, [projectId, dataLoaded]);

  useEffect(() => {
    loadAlertData();
  }, [loadAlertData]);

  useEffect(() => {
    if (activeTab !== 'alerts' && activeTab !== 'settings') {
      loadTabData(activeTab);
    }
  }, [activeTab, loadTabData]);

  // Calculate alerts
  const alerts = useMemo(() => {
    const alertsList: { type: 'warning' | 'urgent' | 'info'; message: string; category: string; dueDate: Date; scopeId?: string }[] = [];
    const today = new Date();

    // Labor alerts - only show if executed houses exceed contracted
    alertsData.scopeItems.filter(item => item.category === 'labor').forEach(item => {
      const contract = laborContracts.find(c => c.scope_id === item.id && c.status === 'active');
      const executed = executedHouses[item.id] || 0;
      
      if (contract) {
        if (executed >= contract.contracted_houses) {
          alertsList.push({
            type: 'urgent',
            message: `Mão de obra para "${item.name}" precisa ser renovada (${executed}/${contract.contracted_houses} casas)`,
            category: 'labor',
            dueDate: today,
            scopeId: item.id
          });
        }
      } else if (item.quantity > 0) {
        alertsList.push({
          type: 'warning',
          message: `Contratar mão de obra para "${item.name}"`,
          category: 'labor',
          dueDate: addDays(today, 7),
          scopeId: item.id
        });
      }
    });

    return alertsList.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [alertsData.scopeItems, laborContracts, executedHouses]);

  // CRUD operations
  const saveInput = async () => {
    if (!projectId || !newInput.name.trim()) return;
    
    // Check for duplicates
    const normalizedName = newInput.name.trim().toLowerCase();
    const existingInput = inputs.find(i => 
      i.id !== editingInput?.id && 
      i.name.toLowerCase() === normalizedName
    );
    
    if (existingInput) {
      toast.error(`Já existe um insumo com o nome "${existingInput.name}". Verifique se não é duplicado.`);
      return;
    }
    
    // Check for similar names
    const similarInputs = inputs.filter(i => 
      i.id !== editingInput?.id && 
      (i.name.toLowerCase().includes(normalizedName) || normalizedName.includes(i.name.toLowerCase()))
    );
    
    if (similarInputs.length > 0 && !editingInput) {
      const similarNames = similarInputs.slice(0, 3).map(i => i.name).join(', ');
      if (!window.confirm(`Foram encontrados insumos semelhantes: ${similarNames}. Deseja continuar mesmo assim?`)) {
        return;
      }
    }
    
    try {
      const payload = {
        project_id: projectId,
        name: newInput.name.trim(),
        unit: newInput.unit,
        category: newInput.category,
        material_family_id: newInput.material_family_id || null,
        description: newInput.description || null,
        unit_value: newInput.unit_value || 0
      };
      
      if (editingInput) {
        await supabase.from('inputs').update(payload).eq('id', editingInput.id);
        toast.success('Insumo atualizado!');
      } else {
        await supabase.from('inputs').insert(payload);
        toast.success('Insumo cadastrado!');
      }
      setInputDialogOpen(false);
      setNewInput({ name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0 });
      setEditingInput(null);
      setDataLoaded(prev => ({ ...prev, inputs: false }));
      loadTabData('inputs');
    } catch (error) {
      console.error('Error saving input:', error);
      toast.error('Erro ao salvar insumo');
    }
  };

  const confirmDeleteInput = (input: InputItem) => {
    setInputToDelete(input);
    setDeleteInputDialogOpen(true);
  };

  const executeDeleteInput = async () => {
    if (!inputToDelete) return;
    try {
      await supabase.from('inputs').delete().eq('id', inputToDelete.id);
      toast.success('Insumo removido permanentemente');
      setInputs(prev => prev.filter(i => i.id !== inputToDelete.id));
    } catch (error) {
      console.error('Error deleting input:', error);
      toast.error('Erro ao remover');
    } finally {
      setDeleteInputDialogOpen(false);
      setInputToDelete(null);
    }
  };

  const saveUnit = async () => {
    if (!projectId || !newUnit.name.trim() || !newUnit.abbreviation.trim()) return;
    
    // Check for duplicate abbreviation
    const existingUnit = units.find(u => 
      u.id !== editingUnit?.id && 
      u.abbreviation.toLowerCase() === newUnit.abbreviation.trim().toLowerCase()
    );
    
    if (existingUnit) {
      toast.error(`Já existe uma unidade com a abreviação "${existingUnit.abbreviation}".`);
      return;
    }
    
    try {
      if (editingUnit) {
        await supabase.from('units').update({ name: newUnit.name.trim(), abbreviation: newUnit.abbreviation.trim() }).eq('id', editingUnit.id);
        toast.success('Unidade atualizada!');
      } else {
        await supabase.from('units').insert({ project_id: projectId, name: newUnit.name.trim(), abbreviation: newUnit.abbreviation.trim() });
        toast.success('Unidade cadastrada!');
      }
      setUnitDialogOpen(false);
      setNewUnit({ name: '', abbreviation: '' });
      setEditingUnit(null);
      setDataLoaded(prev => ({ ...prev, inputs: false }));
      loadTabData('inputs');
    } catch (error) {
      console.error('Error saving unit:', error);
      toast.error('Erro ao salvar unidade');
    }
  };

  const saveFamily = async () => {
    if (!projectId || !newFamily.name.trim()) return;
    
    // Check for duplicate family name
    const existingFamily = families.find(f => 
      f.id !== editingFamily?.id && 
      f.name.toLowerCase() === newFamily.name.trim().toLowerCase()
    );
    
    if (existingFamily) {
      toast.error(`Já existe uma família com o nome "${existingFamily.name}".`);
      return;
    }
    
    try {
      if (editingFamily) {
        await supabase.from('material_families').update({ name: newFamily.name.trim(), color: newFamily.color }).eq('id', editingFamily.id);
        toast.success('Família atualizada!');
      } else {
        await supabase.from('material_families').insert({ project_id: projectId, name: newFamily.name.trim(), color: newFamily.color, display_order: families.length });
        toast.success('Família cadastrada!');
      }
      setFamilyDialogOpen(false);
      setNewFamily({ name: '', color: '#3b82f6' });
      setEditingFamily(null);
      setDataLoaded(prev => ({ ...prev, inputs: false }));
      loadTabData('inputs');
    } catch (error) {
      console.error('Error saving family:', error);
      toast.error('Erro ao salvar família');
    }
  };

  const deleteFamily = async (id: string) => {
    try {
      // Update inputs to remove family reference
      await supabase.from('inputs').update({ material_family_id: null }).eq('material_family_id', id);
      await supabase.from('material_families').delete().eq('id', id);
      toast.success('Família removida');
      setFamilies(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      console.error('Error deleting family:', error);
      toast.error('Erro ao remover');
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await supabase.from('units').delete().eq('id', id);
      toast.success('Unidade removida');
      setUnits(prev => prev.filter(u => u.id !== id));
    } catch (error) {
      console.error('Error deleting unit:', error);
      toast.error('Erro ao remover');
    }
  };

  const saveSupplier = async () => {
    if (!projectId || !newSupplier.name) return;
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
        await supabase.from('suppliers').insert({ ...payload, project_id: projectId });
        toast.success('Fornecedor cadastrado!');
      }
      setSupplierDialogOpen(false);
      setNewSupplier({ supplier_type: 'material' });
      setEditingSupplier(null);
      setDataLoaded(prev => ({ ...prev, suppliers: false }));
      loadTabData('suppliers');
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

  const createQuotation = async () => {
    if (!projectId || !newQuotation.title || !newQuotation.required_date) return;
    try {
      const { data: quotationData, error } = await supabase.from('quotation_requests').insert({
        project_id: projectId,
        title: newQuotation.title,
        required_date: newQuotation.required_date,
        notes: newQuotation.notes || null
      }).select().single();
      if (error) throw error;

      if (newQuotation.items.length > 0) {
        const itemsToInsert = newQuotation.items.map(itemId => {
          const item = alertsData.scopeItems.find(si => si.id === itemId);
          return {
            quotation_id: quotationData.id,
            scope_item_id: itemId,
            name: item?.name || '',
            category: item?.category || 'material',
            quantity: item?.quantity || 1,
            unit: item?.unit || 'un',
            estimated_unit_value: item?.unit_value || 0
          };
        });
        await supabase.from('quotation_items').insert(itemsToInsert);
      }

      toast.success('Cotação criada!');
      setQuotationDialogOpen(false);
      setNewQuotation({ title: '', required_date: '', notes: '', items: [] });
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
    } catch (error) {
      console.error('Error creating quotation:', error);
      toast.error('Erro ao criar cotação');
    }
  };

  const selectQuote = async (quotationItemId: string, quoteId: string) => {
    try {
      await supabase.from('supplier_quotes').update({ is_selected: false }).eq('quotation_item_id', quotationItemId);
      await supabase.from('supplier_quotes').update({ is_selected: true }).eq('id', quoteId);
      toast.success('Cotação selecionada!');
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
    } catch (error) {
      console.error('Error selecting quote:', error);
      toast.error('Erro ao selecionar');
    }
  };

  const saveSupplierQuotes = async (quotationItemId: string, quotes: { supplier_id: string; unit_value: number; delivery_days: number; notes: string }[]) => {
    try {
      await supabase.from('supplier_quotes').delete().eq('quotation_item_id', quotationItemId);
      const quotesToInsert = quotes.filter(q => q.supplier_id && q.unit_value > 0).map(q => ({
        quotation_item_id: quotationItemId,
        supplier_id: q.supplier_id,
        unit_value: q.unit_value,
        total_value: 0,
        delivery_days: q.delivery_days || 0,
        notes: q.notes || null,
        is_selected: false
      }));
      if (quotesToInsert.length > 0) {
        await supabase.from('supplier_quotes').insert(quotesToInsert);
      }
      toast.success('Cotações salvas!');
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
    } catch (error) {
      console.error('Error saving quotes:', error);
      toast.error('Erro ao salvar cotações');
    }
  };

  const approveQuotation = async (quotation: QuotationRequest) => {
    if (!projectId) return;

    const itemsWithoutSelection = quotation.items?.filter(item => !item.quotes?.some(q => q.is_selected));
    if (itemsWithoutSelection && itemsWithoutSelection.length > 0) {
      toast.error(`Selecione um fornecedor para: ${itemsWithoutSelection.map(i => i.name).join(', ')}`);
      return;
    }

    const selectedQuotes = quotation.items?.flatMap(item => 
      item.quotes?.filter(q => q.is_selected).map(q => ({ ...q, itemName: item.name, itemQuantity: item.quantity, itemUnit: item.unit, itemCategory: item.category })) || []
    ) || [];

    const bySupplier = selectedQuotes.reduce((acc, quote) => {
      if (!acc[quote.supplier_id]) acc[quote.supplier_id] = [];
      acc[quote.supplier_id].push(quote);
      return acc;
    }, {} as Record<string, typeof selectedQuotes>);

    try {
      for (const [supplierId, quotes] of Object.entries(bySupplier)) {
        const totalValue = quotes.reduce((sum, q) => sum + (q.unit_value * q.itemQuantity), 0);
        const maxDeliveryDays = Math.max(...quotes.map(q => q.delivery_days));
        const expectedDeliveryDate = addDays(new Date(), maxDeliveryDays);
        const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

        const { data: orderData, error } = await supabase.from('purchase_orders').insert({
          project_id: projectId,
          quotation_id: quotation.id,
          supplier_id: supplierId,
          order_number: orderNumber,
          total_value: totalValue,
          expected_delivery_date: expectedDeliveryDate.toISOString().split('T')[0]
        }).select().single();

        if (error) throw error;

        const orderItems = quotes.map(quote => ({
          purchase_order_id: orderData.id,
          name: quote.itemName,
          category: quote.itemCategory,
          quantity: quote.itemQuantity,
          unit: quote.itemUnit,
          unit_value: quote.unit_value,
          total_value: quote.unit_value * quote.itemQuantity
        }));
        await supabase.from('purchase_order_items').insert(orderItems);
      }

      await supabase.from('quotation_requests').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', quotation.id);
      toast.success('Cotação aprovada e pedidos gerados!');
      setDataLoaded(prev => ({ ...prev, quotations: false, orders: false }));
      loadTabData('quotations');
    } catch (error) {
      console.error('Error approving quotation:', error);
      toast.error('Erro ao aprovar cotação');
    }
  };

  const updateOrder = async (orderId: string, updates: Partial<PurchaseOrder>) => {
    try {
      await supabase.from('purchase_orders').update(updates).eq('id', orderId);
      toast.success('Pedido atualizado!');
      setDataLoaded(prev => ({ ...prev, orders: false }));
      loadTabData('orders');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Erro ao atualizar');
    }
  };

  const addTrackingEvent = async () => {
    if (!selectedOrder || !newTracking.status) return;
    try {
      await supabase.from('delivery_tracking').insert({
        purchase_order_id: selectedOrder.id,
        status: newTracking.status,
        description: newTracking.description || null,
        location: newTracking.location || null
      });
      if (newTracking.status === 'delivered') {
        await supabase.from('purchase_orders').update({ status: 'delivered', actual_delivery_date: new Date().toISOString().split('T')[0] }).eq('id', selectedOrder.id);
      } else if (newTracking.status === 'in_transit') {
        await supabase.from('purchase_orders').update({ status: 'in_transit' }).eq('id', selectedOrder.id);
      }
      toast.success('Rastreamento atualizado!');
      setTrackingDialogOpen(false);
      setNewTracking({ status: '', description: '', location: '' });
      setDataLoaded(prev => ({ ...prev, orders: false }));
      loadTabData('orders');
    } catch (error) {
      console.error('Error adding tracking:', error);
      toast.error('Erro ao atualizar rastreamento');
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Filtered data
  const toggleFamily = (familyName: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(familyName)) next.delete(familyName);
      else next.add(familyName);
      return next;
    });
  };

  const filteredInputs = useMemo(() => {
    return inputs.filter(i => {
      const matchSearch = !searchInput || i.name.toLowerCase().includes(searchInput.toLowerCase());
      const matchCategory = filterCategory === 'all' || i.category === filterCategory;
      return matchSearch && matchCategory;
    });
  }, [inputs, searchInput, filterCategory]);

  // Group inputs by family
  const inputsByFamily = useMemo(() => {
    const grouped: Record<string, InputItem[]> = {};
    filteredInputs.forEach(input => {
      const familyName = input.material_family?.name || 'Sem Família';
      if (!grouped[familyName]) grouped[familyName] = [];
      grouped[familyName].push(input);
    });
    return grouped;
  }, [filteredInputs]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => supplierTypeFilter === 'all' || s.supplier_type === supplierTypeFilter);
  }, [suppliers, supplierTypeFilter]);

  if (!currentProject) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Selecione um projeto para ver suprimentos</CardContent></Card>;
  }

  if (isLoading) {
    return <Card><CardContent className="p-8 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Carregando...</span></CardContent></Card>;
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-6 h-10">
          <TabsTrigger value="alerts" className="gap-1 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />Alertas
            {alerts.length > 0 && <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px]">{alerts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="inputs" className="gap-1 text-xs"><Box className="w-3.5 h-3.5" />Insumos</TabsTrigger>
          <TabsTrigger value="quotations" className="gap-1 text-xs"><FileText className="w-3.5 h-3.5" />Cotações</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1 text-xs"><Truck className="w-3.5 h-3.5" />Pedidos</TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-1 text-xs"><Users className="w-3.5 h-3.5" />Fornecedores</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1 text-xs"><Settings className="w-3.5 h-3.5" />Config</TabsTrigger>
        </TabsList>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 overflow-auto mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="w-5 h-5 text-yellow-500" />Alertas ({alerts.length})</CardTitle></CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Todos os suprimentos em dia!</p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {alerts.map((alert, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border ${alert.type === 'urgent' ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20'}`}>
                        <div className="flex items-center gap-3">
                          {alert.type === 'urgent' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-yellow-500" />}
                          <div className="flex-1">
                            <p className="font-medium text-sm">{alert.message}</p>
                            <Badge variant="outline" className="text-xs mt-1">{CATEGORY_LABELS[alert.category as keyof typeof CATEGORY_LABELS] || alert.category}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><FileText className="w-4 h-4 text-blue-500" /><span className="text-xs">Cotações Pendentes</span></div><p className="text-2xl font-bold">{alertsData.pendingQuotations}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-orange-500" /><span className="text-xs">Em Trânsito</span></div><p className="text-2xl font-bold">{alertsData.inTransitOrders}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><CheckCircle2 className="w-4 h-4 text-green-500" /><span className="text-xs">Insumos Cadastrados</span></div><p className="text-2xl font-bold">{inputs.length || '-'}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4" /><span className="text-xs">Fornecedores</span></div><p className="text-2xl font-bold">{suppliers.length || '-'}</p></CardContent></Card>
          </div>
        </TabsContent>

        {/* Inputs Tab */}
        <TabsContent value="inputs" className="flex-1 overflow-auto mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar insumo..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-8" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="labor">Mão de Obra</SelectItem>
                  <SelectItem value="equipment">Equipamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {/* Families Dialog */}
              <Dialog open={familyDialogOpen} onOpenChange={(o) => { setFamilyDialogOpen(o); if (!o) { setEditingFamily(null); setNewFamily({ name: '', color: '#3b82f6' }); } }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Package className="w-4 h-4 mr-1" />Famílias</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Famílias de Materiais</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input placeholder="Nova família..." value={newFamily.name} onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })} className="flex-1" />
                      <Input type="color" value={newFamily.color} onChange={(e) => setNewFamily({ ...newFamily, color: e.target.value })} className="w-12 p-1 h-10" />
                      <Button onClick={saveFamily}><Plus className="w-4 h-4" /></Button>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {families.map(f => (
                          <div key={f.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
                              <span>{f.name}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingFamily(f); setNewFamily({ name: f.name, color: f.color }); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteFamily(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter><Button onClick={() => setFamilyDialogOpen(false)}>Fechar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Units Dialog */}
              <Dialog open={unitDialogOpen} onOpenChange={(o) => { setUnitDialogOpen(o); if (!o) { setEditingUnit(null); setNewUnit({ name: '', abbreviation: '' }); } }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Layers className="w-4 h-4 mr-1" />Unidades</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Unidades</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input placeholder="Nome" value={newUnit.name} onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} />
                      <Input placeholder="Abreviação" value={newUnit.abbreviation} onChange={(e) => setNewUnit({ ...newUnit, abbreviation: e.target.value })} className="w-24" />
                      <Button onClick={saveUnit}><Plus className="w-4 h-4" /></Button>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {units.map(u => (
                          <div key={u.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <span>{u.name} ({u.abbreviation})</span>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingUnit(u); setNewUnit({ name: u.name, abbreviation: u.abbreviation }); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteUnit(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter><Button onClick={() => setUnitDialogOpen(false)}>Fechar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              
              {canEdit && (
                <Dialog open={inputDialogOpen} onOpenChange={(o) => { setInputDialogOpen(o); if (!o) { setEditingInput(null); setNewInput({ name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0 }); } }}>
                  <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Novo Insumo</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{editingInput ? 'Editar' : 'Cadastrar'} Insumo</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div><Label>Nome *</Label><Input value={newInput.name} onChange={(e) => setNewInput({ ...newInput, name: e.target.value })} /></div>
                      <div className="grid grid-cols-4 gap-4">
                        <div><Label>Categoria *</Label>
                          <Select value={newInput.category} onValueChange={(v) => setNewInput({ ...newInput, category: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labor">Mão de Obra</SelectItem>
                              <SelectItem value="equipment">Equipamento</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Unidade</Label>
                          <Select value={newInput.unit} onValueChange={(v) => setNewInput({ ...newInput, unit: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {units.length > 0 ? units.map(u => <SelectItem key={u.id} value={u.abbreviation}>{u.abbreviation}</SelectItem>) : ['un', 'kg', 'm', 'm²', 'm³', 'l', 'pç', 'vb'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Família</Label>
                          <Select value={newInput.material_family_id} onValueChange={(v) => setNewInput({ ...newInput, material_family_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div><Label>Valor Unitário (R$)</Label>
                          <Input 
                            type="number" 
                            value={newInput.unit_value} 
                            onChange={(e) => setNewInput({ ...newInput, unit_value: parseFloat(e.target.value) || 0 })} 
                            placeholder="0,00"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
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

          {/* Delete input confirmation dialog */}
          <AlertDialog open={deleteInputDialogOpen} onOpenChange={setDeleteInputDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o insumo "{inputToDelete?.name}"? 
                  Esta ação é permanente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setInputToDelete(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={executeDeleteInput} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Inputs grouped by family - collapsible */}
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-2">
              {Object.entries(inputsByFamily).map(([familyName, familyInputs]) => {
                const family = families.find(f => f.name === familyName);
                const isExpanded = expandedFamilies.has(familyName);
                
                return (
                  <Collapsible key={familyName} open={isExpanded} onOpenChange={() => toggleFamily(familyName)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {family && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: family.color }} />}
                          <span className="font-medium">{familyName}</span>
                          <Badge variant="secondary">{familyInputs.length}</Badge>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Card className="mt-1 border-l-4" style={{ borderLeftColor: family?.color || '#9ca3af' }}>
                        <CardContent className="p-0">
                          <Table>
                            <TableBody>
                              {familyInputs.map(input => (
                                <TableRow key={input.id}>
                                  <TableCell className="w-10">
                                    {input.category === 'material' ? <Package className="w-4 h-4 text-blue-500" /> : input.category === 'labor' ? <Hammer className="w-4 h-4 text-orange-500" /> : <Wrench className="w-4 h-4 text-green-500" />}
                                  </TableCell>
                                  <TableCell className="font-medium">{input.name}</TableCell>
                                  <TableCell className="w-20">{input.unit}</TableCell>
                                  <TableCell className="w-28 text-right">
                                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.unit_value || 0)}
                                  </TableCell>
                                  <TableCell className="w-24">
                                    <Badge variant="outline">{CATEGORY_LABELS[input.category]}</Badge>
                                  </TableCell>
                                  <TableCell className="w-20">
                                    {canEdit && (
                                      <div className="flex gap-1">
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingInput(input); setNewInput({ name: input.name, unit: input.unit, category: input.category, material_family_id: input.material_family_id || '', description: input.description || '', unit_value: input.unit_value || 0 }); setInputDialogOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => confirmDeleteInput(input)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
              {Object.keys(inputsByFamily).length === 0 && (
                <Card><CardContent className="p-8 text-center text-muted-foreground">{inputs.length === 0 ? 'Nenhum insumo cadastrado' : 'Nenhum insumo encontrado'}</CardContent></Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Quotations Tab */}
        <TabsContent value="quotations" className="flex-1 overflow-auto mt-4 space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={quotationDialogOpen} onOpenChange={setQuotationDialogOpen}>
                <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nova Cotação</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Criar Mapa de Cotação</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Título</Label><Input value={newQuotation.title} onChange={(e) => setNewQuotation({ ...newQuotation, title: e.target.value })} /></div>
                      <div><Label>Data Necessária</Label><Input type="date" value={newQuotation.required_date} onChange={(e) => setNewQuotation({ ...newQuotation, required_date: e.target.value })} /></div>
                    </div>
                    <div><Label>Observações</Label><Textarea value={newQuotation.notes} onChange={(e) => setNewQuotation({ ...newQuotation, notes: e.target.value })} /></div>
                    <div><Label>Itens do Orçamento</Label>
                      <ScrollArea className="h-[200px] border rounded-lg p-2 mt-2">
                        <div className="space-y-1">
                          {alertsData.scopeItems.filter(i => i.category === 'material').map(item => (
                            <label key={item.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                              <input type="checkbox" checked={newQuotation.items.includes(item.id)} onChange={(e) => {
                                if (e.target.checked) setNewQuotation({ ...newQuotation, items: [...newQuotation.items, item.id] });
                                else setNewQuotation({ ...newQuotation, items: newQuotation.items.filter(i => i !== item.id) });
                              }} className="rounded" />
                              <span className="flex-1">{item.name}</span>
                              <span className="text-sm text-muted-foreground">{item.quantity} {item.unit}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setQuotationDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={createQuotation} disabled={!newQuotation.title || !newQuotation.required_date}>Criar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-3">
              {quotations.map(quotation => (
                <Card key={quotation.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div><h3 className="font-semibold">{quotation.title}</h3><p className="text-sm text-muted-foreground">{format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: ptBR })}</p></div>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[quotation.status]}>{STATUS_LABELS[quotation.status]}</Badge>
                        <Badge variant="outline">Até {format(new Date(quotation.required_date), "dd/MM/yyyy", { locale: ptBR })}</Badge>
                      </div>
                    </div>
                    {quotation.items && quotation.items.length > 0 && (
                      <div className="space-y-2 mb-3">
                        <Table>
                          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qtd</TableHead><TableHead>Cotação 1</TableHead><TableHead>Cotação 2</TableHead><TableHead>Cotação 3</TableHead><TableHead className="w-[80px]">Seleção</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {quotation.items.map(item => {
                              const quotes = item.quotes || [];
                              const selectedQuote = quotes.find(q => q.is_selected);
                              return (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium">{item.name}</TableCell>
                                  <TableCell>{item.quantity} {item.unit}</TableCell>
                                  {[0, 1, 2].map(i => {
                                    const quote = quotes[i];
                                    return (
                                      <TableCell key={i} className={quote?.is_selected ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                                        {quote ? (
                                          <div className="text-sm">
                                            <p className="font-medium">{quote.supplier?.name}</p>
                                            <p className="text-muted-foreground">{formatCurrency(quote.unit_value)}/un</p>
                                            <p className="text-xs text-muted-foreground">{quote.delivery_days} dias</p>
                                            {canEdit && quotation.status === 'pending' && (
                                              <Button size="sm" variant={quote.is_selected ? "default" : "outline"} className="mt-1 h-6 text-xs" onClick={() => selectQuote(item.id, quote.id)}>
                                                {quote.is_selected ? <Check className="w-3 h-3" /> : 'Selecionar'}
                                              </Button>
                                            )}
                                          </div>
                                        ) : <span className="text-muted-foreground text-sm">-</span>}
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell>{selectedQuote && <Badge variant="outline" className="bg-green-100">{selectedQuote.supplier?.name}</Badge>}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {canEdit && quotation.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedQuotation(quotation); setQuoteDetailsDialogOpen(true); }}><Edit2 className="w-3 h-3 mr-1" />Editar Cotações</Button>
                        <Button size="sm" onClick={() => approveQuotation(quotation)}><Check className="w-3 h-3 mr-1" />Aprovar e Gerar Pedido</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {quotations.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma cotação criada</CardContent></Card>}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="flex-1 overflow-auto mt-4 space-y-4">
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-3">
              {purchaseOrders.map(order => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div><h3 className="font-semibold">{order.order_number}</h3><p className="text-sm text-muted-foreground">{order.supplier?.name}</p></div>
                      <div className="flex items-center gap-2"><Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge><span className="font-bold">{formatCurrency(order.total_value)}</span></div>
                    </div>
                    {order.items && order.items.length > 0 && (
                      <div className="mb-3 text-sm"><p className="font-medium mb-1">Itens:</p><div className="flex flex-wrap gap-1">{order.items.map(item => <Badge key={item.id} variant="secondary">{item.name} ({item.quantity} {item.unit})</Badge>)}</div></div>
                    )}
                    {order.expected_delivery_date && (
                      <div className="flex items-center gap-2 mb-3 text-sm">
                        <Calendar className="w-4 h-4" /><span>Previsão: {format(new Date(order.expected_delivery_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                        {order.actual_delivery_date && <Badge variant="outline">Entregue: {format(new Date(order.actual_delivery_date), "dd/MM/yyyy", { locale: ptBR })}</Badge>}
                      </div>
                    )}
                    {canEdit && order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedOrder(order); setOrderEditDialogOpen(true); }}><Edit2 className="w-3 h-3 mr-1" />Editar</Button>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedOrder(order); setTrackingDialogOpen(true); }}><Plus className="w-3 h-3 mr-1" />Rastreamento</Button>
                        {order.status === 'pending' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'sent' })}><Send className="w-3 h-3 mr-1" />Enviar</Button>}
                        {order.status === 'sent' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'confirmed' })}><Check className="w-3 h-3 mr-1" />Confirmar</Button>}
                        {order.status === 'confirmed' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'in_transit' })}><Truck className="w-3 h-3 mr-1" />Em Trânsito</Button>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {purchaseOrders.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum pedido. Aprove uma cotação para criar pedidos.</CardContent></Card>}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers" className="flex-1 overflow-auto mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Select value={supplierTypeFilter} onValueChange={setSupplierTypeFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
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
                    <div><Label>Tipo *</Label>
                      <Select value={newSupplier.supplier_type || 'material'} onValueChange={(v: 'material' | 'labor' | 'equipment') => setNewSupplier({ ...newSupplier, supplier_type: v })}>
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
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 overflow-auto mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" />Configurações</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">Configurações de suprimentos em desenvolvimento...</p></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Quotes Dialog */}
      <Dialog open={quoteDetailsDialogOpen} onOpenChange={setQuoteDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Editar Cotações - {selectedQuotation?.title}</DialogTitle></DialogHeader>
          {selectedQuotation?.items?.map(item => (
            <div key={item.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.quantity} {item.unit}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map(i => {
                  const existingQuote = item.quotes?.[i];
                  const currentQuotes = supplierQuotes[item.id] || [];
                  const quote = currentQuotes[i] || { supplier_id: existingQuote?.supplier_id || '', unit_value: existingQuote?.unit_value || 0, delivery_days: existingQuote?.delivery_days || 0, notes: existingQuote?.notes || '' };
                  return (
                    <div key={i} className="space-y-2 p-3 bg-muted/30 rounded">
                      <p className="text-sm font-medium">Cotação {i + 1}</p>
                      <Select value={quote.supplier_id} onValueChange={(v) => {
                        const updated = [...currentQuotes];
                        updated[i] = { ...quote, supplier_id: v };
                        setSupplierQuotes({ ...supplierQuotes, [item.id]: updated });
                      }}>
                        <SelectTrigger><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                        <SelectContent>{suppliers.filter(s => s.supplier_type === 'material').map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" placeholder="Valor unitário" value={quote.unit_value || ''} onChange={(e) => {
                        const updated = [...currentQuotes];
                        updated[i] = { ...quote, unit_value: parseFloat(e.target.value) || 0 };
                        setSupplierQuotes({ ...supplierQuotes, [item.id]: updated });
                      }} />
                      <Input type="number" placeholder="Dias entrega" value={quote.delivery_days || ''} onChange={(e) => {
                        const updated = [...currentQuotes];
                        updated[i] = { ...quote, delivery_days: parseInt(e.target.value) || 0 };
                        setSupplierQuotes({ ...supplierQuotes, [item.id]: updated });
                      }} />
                    </div>
                  );
                })}
              </div>
              <Button size="sm" onClick={() => saveSupplierQuotes(item.id, supplierQuotes[item.id] || [])}>Salvar Cotações</Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>

      {/* Edit Order Dialog */}
      <Dialog open={orderEditDialogOpen} onOpenChange={setOrderEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Pedido - {selectedOrder?.order_number}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div><Label>Fornecedor</Label>
                <Select value={selectedOrder.supplier_id} onValueChange={(v) => setSelectedOrder({ ...selectedOrder, supplier_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{suppliers.filter(s => s.supplier_type === 'material').map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Data Prevista</Label><Input type="date" value={selectedOrder.expected_delivery_date || ''} onChange={(e) => setSelectedOrder({ ...selectedOrder, expected_delivery_date: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={selectedOrder.notes || ''} onChange={(e) => setSelectedOrder({ ...selectedOrder, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => { if (selectedOrder) { updateOrder(selectedOrder.id, { supplier_id: selectedOrder.supplier_id, expected_delivery_date: selectedOrder.expected_delivery_date, notes: selectedOrder.notes }); setOrderEditDialogOpen(false); } }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking Dialog */}
      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Rastreamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Status</Label>
              <Select value={newTracking.status} onValueChange={(v) => setNewTracking({ ...newTracking, status: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="processing">Em Preparação</SelectItem>
                  <SelectItem value="shipped">Despachado</SelectItem>
                  <SelectItem value="in_transit">Em Trânsito</SelectItem>
                  <SelectItem value="out_for_delivery">Saiu para Entrega</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Descrição</Label><Input value={newTracking.description} onChange={(e) => setNewTracking({ ...newTracking, description: e.target.value })} /></div>
            <div><Label>Localização</Label><Input value={newTracking.location} onChange={(e) => setNewTracking({ ...newTracking, location: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialogOpen(false)}>Cancelar</Button>
            <Button onClick={addTrackingEvent} disabled={!newTracking.status}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
