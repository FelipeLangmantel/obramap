import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Package, Truck, FileText, Clock, AlertTriangle, CheckCircle2, Plus, Settings, Users, Search, Calendar, DollarSign, Loader2, Eye, Edit2, Trash2, Send, Check, X, Box, Layers, Hammer, Wrench, ChevronDown, ChevronRight, ClipboardList, Upload, RefreshCw } from "lucide-react";
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
import { LaborContractsView } from "./LaborContractsView";
import { ImportInputsDialog } from "./ImportInputsDialog";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
  lead_time_days: number;
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
  scope_id: string;
  macro_id: string;
  material_family?: string;
}

interface PlannedProduction {
  id: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  planned_houses: number;
  planned_house_ids: number[];
  week_start: string;
  week_end: string;
}

interface MaterialAlert {
  familyId: string;
  familyName: string;
  familyColor: string;
  leadTimeDays: number;
  priority: 'urgent' | 'warning' | 'info';
  dueDate: Date;
  daysUntilDue: number;
  items: {
    id: string;
    name: string;
    totalQuantity: number;
    stockQuantity: number;
    needQuantity: number;
    unit: string;
    unitValue: number;
    totalValue: number;
    houseIds: number[];
  }[];
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

type TabType = "alerts" | "quotations" | "orders" | "contracts" | "leadtime";

interface SuppliesViewProps {
  initialTab?: TabType;
}

export function SuppliesView({ initialTab = "alerts" }: SuppliesViewProps) {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const projectId = currentProject?.id;

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
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
  const [newInput, setNewInput] = useState<{ name: string; unit: string; category: string; material_family_id: string; description: string; unit_value: number; stock_quantity: number }>({
    name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0, stock_quantity: 0
  });
  const [inputStockEdit, setInputStockEdit] = useState<Record<string, number>>({});
  const [newUnit, setNewUnit] = useState<{ name: string; abbreviation: string }>({ name: '', abbreviation: '' });
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ supplier_type: 'material' });
  const [familyDialogOpen, setFamilyDialogOpen] = useState(false);
  const [newFamily, setNewFamily] = useState<{ name: string; color: string }>({ name: '', color: '#3b82f6' });
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editingFamily, setEditingFamily] = useState<MaterialFamily | null>(null);
  const [newQuotation, setNewQuotation] = useState<{ title: string; required_date: string; notes: string; items: string[]; customItems: { name: string; quantity: number; unit: string; estimatedValue: number }[] }>({
    title: '', required_date: '', notes: '', items: [], customItems: []
  });
  const [newCustomItem, setNewCustomItem] = useState<{ name: string; quantity: number; unit: string; estimatedValue: number }>({ name: '', quantity: 1, unit: 'un', estimatedValue: 0 });
  const [expandedPendingQuotations, setExpandedPendingQuotations] = useState<Set<string>>(new Set());
  const [deleteOrderDialogOpen, setDeleteOrderDialogOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);
  const [deleteQuotationDialogOpen, setDeleteQuotationDialogOpen] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState<QuotationRequest | null>(null);
  const [editingQuotationItem, setEditingQuotationItem] = useState<{ itemId: string; name: string; quantity: number; unit: string } | null>(null);
  const [supplierQuotes, setSupplierQuotes] = useState<Record<string, { supplier_id: string; unit_value: number; delivery_days: number; notes: string }[]>>({});
  const [newTracking, setNewTracking] = useState<{ status: string; description: string; location: string }>({
    status: '', description: '', location: ''
  });
  const [searchInput, setSearchInput] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<string>('all');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [expandedQuotations, setExpandedQuotations] = useState<Set<string>>(new Set());
  const [deleteInputDialogOpen, setDeleteInputDialogOpen] = useState(false);
  const [inputToDelete, setInputToDelete] = useState<InputItem | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Labor contract prefill from alert
  const [laborContractPrefill, setLaborContractPrefill] = useState<{
    scopeId: string;
    macroId: string;
    scopeName: string;
    houses: number;
    unitValue: number;
  } | null>(null);
  
  // Search for quotation items
  const [quotationItemSearch, setQuotationItemSearch] = useState('');

  // State for material alerts
  const [plannedProductions, setPlannedProductions] = useState<PlannedProduction[]>([]);
  const [alertFamilies, setAlertFamilies] = useState<MaterialFamily[]>([]);
  const [expandedAlertFamilies, setExpandedAlertFamilies] = useState<Set<string>>(new Set());

  // Refs for scrolling to alert sections
  const materialAlertsRef = useRef<HTMLDivElement>(null);
  const laborAlertsRef = useRef<HTMLDivElement>(null);

  // Load minimal data for alerts on mount
  const loadAlertData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);

    try {
      const [scopeRes, quotRes, ordersRes, laborRes, prodRes, plannedRes, familiesRes] = await Promise.all([
        supabase.from('scope_items').select('id, name, category, quantity, unit, unit_value, scope_id, macro_id, material_family').eq('project_id', projectId),
        supabase.from('quotation_requests').select('id, status').eq('project_id', projectId).eq('status', 'pending'),
        supabase.from('purchase_orders').select('id, status').eq('project_id', projectId).eq('status', 'in_transit'),
        supabase.from('labor_contracts').select('*').eq('project_id', projectId),
        // Only get non-initial database productions for executed count
        supabase.from('weekly_productions').select('scope_id, house_ids, is_initial_database').eq('project_id', projectId),
        supabase.from('planned_productions').select('*').eq('project_id', projectId).gte('week_start', new Date().toISOString().split('T')[0]),
        supabase.from('material_families').select('*').order('display_order')
      ]);

      if (scopeRes.data) {
        setAlertsData(prev => ({ ...prev, scopeItems: scopeRes.data.map(item => ({
          ...item, category: item.category as 'material' | 'labor' | 'equipment'
        })) }));
      }
      if (quotRes.data) setAlertsData(prev => ({ ...prev, pendingQuotations: quotRes.data.length }));
      if (ordersRes.data) setAlertsData(prev => ({ ...prev, inTransitOrders: ordersRes.data.length }));
      if (laborRes.data) setLaborContracts(laborRes.data);
      if (plannedRes.data) setPlannedProductions(plannedRes.data as PlannedProduction[]);
      if (familiesRes.data) setAlertFamilies(familiesRes.data.map(f => ({ 
        id: f.id, 
        name: f.name, 
        color: f.color || '#9ca3af', 
        lead_time_days: f.lead_time_days || 7 
      })));
      
      if (prodRes.data) {
        const executed: Record<string, number> = {};
        // Only count non-initial database productions (already contracted/purchased)
        prodRes.data.filter(p => !p.is_initial_database).forEach(p => {
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
          supabase.from('material_families').select('*').eq('project_id', projectId).order('display_order').order('name')
        ]);
        if (inputsRes.data) setInputs(inputsRes.data.map((i: any) => ({ ...i, material_family: i.material_families, category: i.category as 'material' | 'labor' | 'equipment', unit_value: i.unit_value || 0, stock_quantity: i.stock_quantity || 0 })));
        if (unitsRes.data) setUnits(unitsRes.data);
        if (familiesRes.data) setFamilies(familiesRes.data.map(f => ({ id: f.id, name: f.name, color: f.color || '#9ca3af', lead_time_days: f.lead_time_days || 7 })));
      } else if (tab === 'quotations') {
        // Load suppliers first to have them available for quotation details
        const [quotRes, suppliersRes] = await Promise.all([
          supabase.from('quotation_requests').select(`*, quotation_items (*, supplier_quotes (*, suppliers (*)))`).eq('project_id', projectId).order('created_at', { ascending: false }),
          supabase.from('suppliers').select('*').order('name')
        ]);
        if (quotRes.data) setQuotations(quotRes.data.map((q: any) => ({ ...q, status: q.status as QuotationRequest['status'], items: q.quotation_items?.map((item: any) => ({ ...item, quotes: item.supplier_quotes?.map((sq: any) => ({ ...sq, supplier: sq.suppliers })) })) })));
        if (suppliersRes.data) setSuppliers(suppliersRes.data.map(s => ({ ...s, supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' })));
      } else if (tab === 'orders') {
        const { data } = await supabase.from('purchase_orders').select(`*, suppliers (*), purchase_order_items (*), delivery_tracking (*)`).eq('project_id', projectId).order('created_at', { ascending: false });
        if (data) setPurchaseOrders(data.map((o: any) => ({ ...o, status: o.status as PurchaseOrder['status'], supplier: o.suppliers, items: o.purchase_order_items, tracking: o.delivery_tracking })));
      } else if (tab === 'suppliers') {
        const { data } = await supabase.from('suppliers').select('*').order('name');
        if (data) setSuppliers(data.map(s => ({ ...s, supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' })));
      }

      setDataLoaded(prev => ({ ...prev, [tab]: true }));
    } catch (error) {
      console.error(`Error loading ${tab} data:`, error);
    }
  }, [projectId, dataLoaded]);

  // Reset dataLoaded when project changes
  useEffect(() => {
    setDataLoaded({});
    setSuppliers([]);
    setQuotations([]);
    setPurchaseOrders([]);
    setInputs([]);
    setUnits([]);
    setFamilies([]);
  }, [projectId]);

  useEffect(() => {
    loadAlertData();
  }, [loadAlertData]);

  useEffect(() => {
    if (activeTab !== 'alerts') {
      // Lead time tab needs families from inputs tab data
      if (activeTab === 'leadtime') {
        loadTabData('inputs');
      } else {
        loadTabData(activeTab);
      }
    }
  }, [activeTab, loadTabData]);

  // Get scopes that have planned production (future only) - match by ID and by name
  const scopesWithPlannedProduction = useMemo(() => {
    const scopeIds = new Set(plannedProductions.map(pp => pp.scope_id));
    const scopeNames = new Set(plannedProductions.map(pp => pp.scope_name.toLowerCase().trim()));
    return { scopeIds, scopeNames };
  }, [plannedProductions]);

  // Calculate labor alerts
  const laborAlerts = useMemo(() => {
    const alertsList: { type: 'warning' | 'urgent' | 'info'; message: string; category: string; dueDate: Date; scopeId?: string; macroId?: string; scopeName?: string; unitValue?: number }[] = [];
    const today = new Date();

    // Labor alerts - only show for scopes with planned production and if executed houses exceed contracted
    alertsData.scopeItems.filter(item => item.category === 'labor').forEach(item => {
      // Only show alerts for scopes that have planned production - match by ID or name
      const itemNameLower = item.name.toLowerCase().trim();
      const hasPlannedProduction = scopesWithPlannedProduction.scopeIds.has(item.scope_id) || 
                                    scopesWithPlannedProduction.scopeNames.has(itemNameLower);
      if (!hasPlannedProduction) return;
      
      const contract = laborContracts.find(c => c.scope_id === item.scope_id && c.status === 'active');
      const executed = executedHouses[item.scope_id] || 0;
      
      if (contract) {
        // Only show if executed houses exceed contracted
        if (executed >= contract.contracted_houses) {
          alertsList.push({
            type: 'urgent',
            message: `Mão de obra para "${item.name}" precisa ser renovada (${executed}/${contract.contracted_houses} casas)`,
            category: 'labor',
            dueDate: today,
            scopeId: item.id,
            macroId: item.macro_id,
            scopeName: item.name,
            unitValue: item.unit_value
          });
        }
      } else if (item.quantity > 0) {
        alertsList.push({
          type: 'warning',
          message: `Contratar mão de obra para "${item.name}"`,
          category: 'labor',
          dueDate: addDays(today, 7),
          scopeId: item.id,
          macroId: item.macro_id,
          scopeName: item.name,
          unitValue: item.unit_value
        });
      }
    });

    return alertsList.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [alertsData.scopeItems, laborContracts, executedHouses, scopesWithPlannedProduction]);

  // State to track which alerts have been quoted (by family ID)
  const [quotedAlertFamilies, setQuotedAlertFamilies] = useState<Set<string>>(new Set());

  // Calculate material alerts based on lead time - only for planned future production
  // GROUP ITEMS BY NAME within each family and sum quantities
  const materialAlerts = useMemo((): MaterialAlert[] => {
    const today = new Date();
    
    if (alertFamilies.length === 0 || plannedProductions.length === 0) return [];
    
    // Get total planned houses from future productions - map by both ID and name for matching
    const plannedHousesByScope: Record<string, number[]> = {};
    const plannedHousesByScopeName: Record<string, number[]> = {};
    plannedProductions.forEach(pp => {
      if (!plannedHousesByScope[pp.scope_id]) plannedHousesByScope[pp.scope_id] = [];
      plannedHousesByScope[pp.scope_id].push(...pp.planned_house_ids);
      
      const scopeNameKey = pp.scope_name.toLowerCase().trim();
      if (!plannedHousesByScopeName[scopeNameKey]) plannedHousesByScopeName[scopeNameKey] = [];
      plannedHousesByScopeName[scopeNameKey].push(...pp.planned_house_ids);
    });
    
    // Group material scope items by family, only for scopes with planned production
    // Match by ID or by scope name
    const materialItems = alertsData.scopeItems.filter(item => {
      if (item.category !== 'material') return false;
      const itemNameKey = item.name.toLowerCase().trim();
      return plannedHousesByScope[item.scope_id] || plannedHousesByScopeName[itemNameKey];
    });
    
    const itemsByFamily: Record<string, { item: typeof materialItems[0]; plannedHouses: number; plannedHouseIds: number[] }[]> = {};
    
    materialItems.forEach(item => {
      const familyName = item.material_family || 'Geral';
      if (!itemsByFamily[familyName]) itemsByFamily[familyName] = [];
      // Get planned houses by ID or by name
      const itemNameKey = item.name.toLowerCase().trim();
      const plannedHouseIds = [...new Set(plannedHousesByScope[item.scope_id] || plannedHousesByScopeName[itemNameKey] || [])];
      const plannedHouses = plannedHouseIds.length;
      if (plannedHouses > 0) {
        itemsByFamily[familyName].push({ item, plannedHouses, plannedHouseIds });
      }
    });
    
    // Create alerts for each family based on lead time
    const alerts: MaterialAlert[] = [];
    
    Object.entries(itemsByFamily).forEach(([familyName, itemsData]) => {
      const family = alertFamilies.find(f => f.name === familyName);
      if (!family || itemsData.length === 0) return;
      
      const leadTimeDays = family.lead_time_days || 7;
      
      // GROUP AND SUM items with the same name within the family
      const groupedByName: Record<string, {
        totalQuantity: number;
        stockQuantity: number;
        unit: string;
        unitValue: number;
        houseIds: Set<number>;
        ids: string[];
      }> = {};
      
      itemsData.forEach(({ item, plannedHouses, plannedHouseIds }) => {
        const normalizedName = item.name.trim().toLowerCase();
        const matchingInput = inputs.find(i => i.name.toLowerCase() === normalizedName && i.category === 'material');
        const stockQuantity = matchingInput?.stock_quantity || 0;
        
        if (!groupedByName[normalizedName]) {
          groupedByName[normalizedName] = {
            totalQuantity: 0,
            stockQuantity,
            unit: item.unit,
            unitValue: item.unit_value,
            houseIds: new Set(),
            ids: []
          };
        }
        
        groupedByName[normalizedName].totalQuantity += item.quantity * plannedHouses;
        groupedByName[normalizedName].ids.push(item.id);
        plannedHouseIds.forEach(h => groupedByName[normalizedName].houseIds.add(h));
        // Use the highest unit value if there are different values
        if (item.unit_value > groupedByName[normalizedName].unitValue) {
          groupedByName[normalizedName].unitValue = item.unit_value;
        }
      });
      
      // Convert grouped items to alert items
      const alertItems = Object.entries(groupedByName).map(([name, data]) => {
        const needQuantity = Math.max(0, data.totalQuantity - data.stockQuantity);
        // Find the original item name with proper casing
        const originalItem = itemsData.find(d => d.item.name.trim().toLowerCase() === name);
        
        return {
          id: data.ids.join(','), // Store all IDs
          name: originalItem?.item.name || name,
          totalQuantity: data.totalQuantity,
          stockQuantity: data.stockQuantity,
          needQuantity,
          unit: data.unit,
          unitValue: data.unitValue,
          totalValue: needQuantity * data.unitValue,
          houseIds: Array.from(data.houseIds)
        };
      }).filter(item => item.needQuantity > 0); // Only show items that need to be purchased
      
      // Skip families with no items to purchase
      if (alertItems.length === 0) return;
      
      // Due date is based on earliest planned production for this family
      const earliestPlanned = plannedProductions
        .filter(pp => itemsData.some(id => id.item.scope_id === pp.scope_id))
        .sort((a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime())[0];
      
      const dueDate = earliestPlanned 
        ? addDays(new Date(earliestPlanned.week_start), -leadTimeDays)
        : addDays(today, leadTimeDays);
      
      const daysUntilDue = differenceInDays(dueDate, today);
      
      // Determine priority based on days until due
      let priority: 'urgent' | 'warning' | 'info' = 'info';
      if (daysUntilDue <= 3) priority = 'urgent';
      else if (daysUntilDue <= 7) priority = 'warning';
      
      alerts.push({
        familyId: family.id,
        familyName: family.name,
        familyColor: family.color,
        leadTimeDays,
        priority,
        dueDate,
        daysUntilDue,
        items: alertItems
      });
    });
    
    // Sort by days until due (most urgent first)
    return alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [alertsData.scopeItems, alertFamilies, plannedProductions, inputs]);

  // Filter out alerts that already have pending quotations
  const visibleMaterialAlerts = useMemo(() => {
    return materialAlerts.filter(alert => !quotedAlertFamilies.has(alert.familyId));
  }, [materialAlerts, quotedAlertFamilies]);

  // Check for existing quotations that match alert families and mark them as quoted
  useEffect(() => {
    if (quotations.length > 0 && materialAlerts.length > 0) {
      const quoted = new Set<string>();
      quotations.filter(q => q.status === 'pending').forEach(q => {
        materialAlerts.forEach(alert => {
          // If quotation title contains family name, consider it quoted
          if (q.title.toLowerCase().includes(alert.familyName.toLowerCase())) {
            quoted.add(alert.familyId);
          }
        });
      });
      setQuotedAlertFamilies(quoted);
    }
  }, [quotations, materialAlerts]);

  // Combined alerts count - use visible alerts
  const totalAlertsCount = laborAlerts.length + visibleMaterialAlerts.length;

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
        unit_value: newInput.unit_value || 0,
        stock_quantity: newInput.stock_quantity || 0
      };
      
      if (editingInput) {
        await supabase.from('inputs').update(payload).eq('id', editingInput.id);
        
        // Auto-update scope_items that use this input
        const { error: updateError } = await supabase
          .from('scope_items')
          .update({ 
            name: newInput.name.trim(), 
            unit: newInput.unit,
            unit_value: newInput.unit_value || 0 
          })
          .eq('input_id', editingInput.id);
        
        if (updateError) {
          console.error('Error updating scope_items:', updateError);
        }
        
        toast.success('Insumo atualizado! Orçamentos atualizados automaticamente.');
      } else {
        await supabase.from('inputs').insert(payload);
        toast.success('Insumo cadastrado!');
      }
      setInputDialogOpen(false);
      setNewInput({ name: '', unit: 'un', category: 'material', material_family_id: '', description: '', unit_value: 0, stock_quantity: 0 });
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
        const oldAbbreviation = editingUnit.abbreviation;
        const newAbbreviation = newUnit.abbreviation.trim();
        
        await supabase.from('units').update({ name: newUnit.name.trim(), abbreviation: newAbbreviation }).eq('id', editingUnit.id);
        
        // Update all inputs using this unit
        await supabase.from('inputs').update({ unit: newAbbreviation }).eq('project_id', projectId).eq('unit', oldAbbreviation);
        
        // Update all scope_items using this unit
        await supabase.from('scope_items').update({ unit: newAbbreviation }).eq('project_id', projectId).eq('unit', oldAbbreviation);
        
        toast.success('Unidade atualizada! Orçamentos atualizados automaticamente.');
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
        setFamilies(prev => prev.map(f => f.id === editingFamily.id ? { ...f, name: newFamily.name.trim(), color: newFamily.color } : f));
        toast.success('Família atualizada!');
      } else {
        const { data, error } = await supabase.from('material_families').insert({ project_id: projectId, name: newFamily.name.trim(), color: newFamily.color, display_order: families.length }).select().single();
        if (error) throw error;
        if (data) {
          setFamilies(prev => [...prev, { id: data.id, name: data.name, color: data.color || '#9ca3af', lead_time_days: data.lead_time_days || 7 }]);
        }
        toast.success('Família cadastrada!');
      }
      setFamilyDialogOpen(false);
      setNewFamily({ name: '', color: '#3b82f6' });
      setEditingFamily(null);
    } catch (error) {
      console.error('Error saving family:', error);
      toast.error('Erro ao salvar família');
    }
  };

  const deleteFamily = async (id: string, inputCount: number) => {
    if (inputCount > 0) {
      toast.error(`Não é possível excluir. Esta família possui ${inputCount} insumo(s) cadastrado(s).`);
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

  // Create quotation directly from alert - no item selection needed
  const createQuotationFromAlert = async (alert: MaterialAlert) => {
    if (!projectId) return;
    try {
      const title = `Cotação ${alert.familyName} - ${format(new Date(), 'dd/MM/yyyy')}`;
      const required_date = format(alert.dueDate, 'yyyy-MM-dd');
      
      const { data: quotationData, error } = await supabase.from('quotation_requests').insert({
        project_id: projectId,
        title,
        required_date,
        notes: `Lead time: ${alert.leadTimeDays} dias | ${alert.items.length} itens agrupados`
      }).select().single();
      if (error) throw error;

      // Insert all items from the alert (already grouped and summed)
      const itemsToInsert = alert.items.map(item => ({
        quotation_id: quotationData.id,
        scope_item_id: null, // Items are grouped, so we don't link to single scope item
        name: item.name,
        category: 'material',
        quantity: item.needQuantity, // Use the quantity to purchase (total - stock)
        unit: item.unit,
        estimated_unit_value: item.unitValue
      }));

      if (itemsToInsert.length > 0) {
        await supabase.from('quotation_items').insert(itemsToInsert);
      }

      // Mark alert as quoted
      setQuotedAlertFamilies(prev => new Set(prev).add(alert.familyId));

      toast.success(`Cotação criada para ${alert.familyName}!`);
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
      setActiveTab('quotations');
    } catch (error) {
      console.error('Error creating quotation:', error);
      toast.error('Erro ao criar cotação');
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

      const itemsToInsert: any[] = [];

      // Add budget items
      if (newQuotation.items.length > 0) {
        newQuotation.items.forEach(itemId => {
          const item = alertsData.scopeItems.find(si => si.id === itemId);
          if (item) {
            itemsToInsert.push({
              quotation_id: quotationData.id,
              scope_item_id: itemId,
              name: item.name,
              category: item.category,
              quantity: item.quantity || 1,
              unit: item.unit || 'un',
              estimated_unit_value: item.unit_value || 0
            });
          }
        });
      }

      // Add custom items (unplanned costs)
      if (newQuotation.customItems.length > 0) {
        newQuotation.customItems.forEach(customItem => {
          itemsToInsert.push({
            quotation_id: quotationData.id,
            scope_item_id: null,
            name: `[EXTRA] ${customItem.name}`,
            category: 'material',
            quantity: customItem.quantity || 1,
            unit: customItem.unit || 'un',
            estimated_unit_value: customItem.estimatedValue || 0
          });
        });
      }

      if (itemsToInsert.length > 0) {
        await supabase.from('quotation_items').insert(itemsToInsert);
      }

      toast.success('Cotação criada!');
      setQuotationDialogOpen(false);
      setNewQuotation({ title: '', required_date: '', notes: '', items: [], customItems: [] });
      setNewCustomItem({ name: '', quantity: 1, unit: 'un', estimatedValue: 0 });
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
      setActiveTab('quotations');
    } catch (error) {
      console.error('Error creating quotation:', error);
      toast.error('Erro ao criar cotação');
    }
  };

  const deleteQuotation = async (id: string, quotation?: QuotationRequest) => {
    try {
      // If quotation has associated orders, delete them first (cascade delete)
      const { data: relatedOrders } = await supabase.from('purchase_orders').select('id').eq('quotation_id', id);
      if (relatedOrders && relatedOrders.length > 0) {
        for (const order of relatedOrders) {
          await supabase.from('purchase_order_items').delete().eq('purchase_order_id', order.id);
          await supabase.from('delivery_tracking').delete().eq('purchase_order_id', order.id);
        }
        await supabase.from('purchase_orders').delete().eq('quotation_id', id);
      }
      
      // Delete supplier quotes for all items
      const { data: items } = await supabase.from('quotation_items').select('id').eq('quotation_id', id);
      if (items) {
        for (const item of items) {
          await supabase.from('supplier_quotes').delete().eq('quotation_item_id', item.id);
        }
      }
      
      await supabase.from('quotation_items').delete().eq('quotation_id', id);
      await supabase.from('quotation_requests').delete().eq('id', id);
      
      // Re-enable the alert for this family if we can identify it
      if (quotation) {
        const matchingAlert = materialAlerts.find(a => 
          quotation.title.toLowerCase().includes(a.familyName.toLowerCase())
        );
        if (matchingAlert) {
          setQuotedAlertFamilies(prev => {
            const next = new Set(prev);
            next.delete(matchingAlert.familyId);
            return next;
          });
        }
      }
      
      toast.success('Cotação excluída!');
      setQuotations(prev => prev.filter(q => q.id !== id));
      setDataLoaded(prev => ({ ...prev, orders: false }));
      loadTabData('orders');
    } catch (error) {
      console.error('Error deleting quotation:', error);
      toast.error('Erro ao excluir cotação');
    }
  };

  const updateQuotationItem = async (itemId: string, updates: { name?: string; quantity?: number; unit?: string }) => {
    try {
      await supabase.from('quotation_items').update(updates).eq('id', itemId);
      toast.success('Item atualizado!');
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
      setEditingQuotationItem(null);
    } catch (error) {
      console.error('Error updating quotation item:', error);
      toast.error('Erro ao atualizar item');
    }
  };

  const deleteQuotationItem = async (quotationId: string, itemId: string) => {
    try {
      await supabase.from('quotation_items').delete().eq('id', itemId);
      toast.success('Item removido!');
      setDataLoaded(prev => ({ ...prev, quotations: false }));
      loadTabData('quotations');
    } catch (error) {
      console.error('Error deleting quotation item:', error);
      toast.error('Erro ao remover item');
    }
  };

  const deleteOrder = async (id: string) => {
    try {
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
      await supabase.from('delivery_tracking').delete().eq('purchase_order_id', id);
      await supabase.from('purchase_orders').delete().eq('id', id);
      toast.success('Pedido excluído!');
      setPurchaseOrders(prev => prev.filter(o => o.id !== id));
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Erro ao excluir pedido');
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

  // Group inputs by family - sorted alphabetically
  const inputsByFamily = useMemo(() => {
    const grouped: Record<string, InputItem[]> = {};
    filteredInputs.forEach(input => {
      const familyName = input.material_family?.name || 'Sem Família';
      if (!grouped[familyName]) grouped[familyName] = [];
      grouped[familyName].push(input);
    });
    // Sort by family name alphabetically (Sem Família at the end)
    const sortedEntries = Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'Sem Família') return 1;
      if (b === 'Sem Família') return -1;
      return a.localeCompare(b, 'pt-BR');
    });
    return Object.fromEntries(sortedEntries);
  }, [filteredInputs]);

  // Count inputs per family for delete protection
  const inputCountByFamily = useMemo(() => {
    const counts: Record<string, number> = {};
    inputs.forEach(input => {
      if (input.material_family_id) {
        counts[input.material_family_id] = (counts[input.material_family_id] || 0) + 1;
      }
    });
    return counts;
  }, [inputs]);

  // Filter families by search for autocomplete suggestions
  const [familySearch, setFamilySearch] = useState('');
  const filteredFamilySuggestions = useMemo(() => {
    if (!familySearch.trim()) return [];
    const search = familySearch.toLowerCase();
    return families.filter(f => 
      f.name.toLowerCase().includes(search) && 
      f.name.toLowerCase() !== search
    ).slice(0, 5);
  }, [families, familySearch]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => supplierTypeFilter === 'all' || s.supplier_type === supplierTypeFilter);
  }, [suppliers, supplierTypeFilter]);

  if (!currentProject) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Selecione um projeto para ver suprimentos</CardContent></Card>;
  }

  if (isLoading) {
    return <Card><CardContent className="p-8 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /><span>Carregando...</span></CardContent></Card>;
  }

  // JIT Alert regeneration
  const regenerateJITAlerts = async () => {
    if (!projectId) return;
    try {
      const { error } = await supabase.rpc('regenerate_supply_alerts', {
        p_project_id: projectId
      });
      if (error) throw error;
      toast.success('Alertas JIT regenerados com sucesso');
      loadAlertData();
    } catch (error) {
      console.error('Error regenerating JIT alerts:', error);
      toast.error('Erro ao regenerar alertas JIT');
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col overflow-hidden">
      {/* Header with JIT regeneration */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight">Suprimentos JIT</h2>
          <p className="text-xs md:text-sm text-muted-foreground">
            Gestão de compras Just-in-Time baseada no planejamento
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={regenerateJITAlerts}>
            <RefreshCw className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Recalcular</span>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col h-full overflow-hidden">
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <TabsList className="grid w-full min-w-[400px] grid-cols-5 h-9 md:h-10">
            <TabsTrigger value="alerts" className="gap-0.5 md:gap-1 text-[10px] md:text-xs px-1">
              <AlertTriangle className="w-3 h-3 md:w-3.5 md:h-3.5" />
              <span className="hidden sm:inline">Alertas</span>
              {totalAlertsCount > 0 && <Badge variant="destructive" className="ml-0.5 h-4 w-4 p-0 text-[10px]">{totalAlertsCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="quotations" className="gap-0.5 md:gap-1 text-[10px] md:text-xs px-1"><FileText className="w-3 h-3 md:w-3.5 md:h-3.5" /><span className="hidden sm:inline">Cotações</span></TabsTrigger>
            <TabsTrigger value="orders" className="gap-0.5 md:gap-1 text-[10px] md:text-xs px-1"><Truck className="w-3 h-3 md:w-3.5 md:h-3.5" /><span className="hidden sm:inline">Pedidos</span></TabsTrigger>
            <TabsTrigger value="contracts" className="gap-0.5 md:gap-1 text-[10px] md:text-xs px-1"><ClipboardList className="w-3 h-3 md:w-3.5 md:h-3.5" /><span className="hidden sm:inline">Contratações</span></TabsTrigger>
            <TabsTrigger value="leadtime" className="gap-0.5 md:gap-1 text-[10px] md:text-xs px-1"><Clock className="w-3 h-3 md:w-3.5 md:h-3.5" /><span className="hidden sm:inline">Lead Time</span></TabsTrigger>
          </TabsList>
        </div>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 overflow-y-auto mt-2 md:mt-4 space-y-3 md:space-y-4">
          {/* Material Alerts by Family */}
          {visibleMaterialAlerts.length > 0 && (
            <Card 
              ref={materialAlertsRef}
              className="cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => materialAlertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="w-5 h-5 text-blue-500" />
                  Alertas de Cotação - Lead Time ({visibleMaterialAlerts.length} famílias)
                </CardTitle>
              </CardHeader>
          <CardContent onClick={(e) => e.stopPropagation()}>
                <ScrollArea className="h-[300px] md:h-[400px]">
                  <div className="space-y-2 pr-2 md:pr-4">
                    {visibleMaterialAlerts.map((alert) => {
                      const isExpanded = expandedAlertFamilies.has(alert.familyId);
                      const totalValue = alert.items.reduce((sum, i) => sum + i.totalValue, 0);
                      
                      return (
                        <Collapsible key={alert.familyId} open={isExpanded} onOpenChange={() => {
                          setExpandedAlertFamilies(prev => {
                            const next = new Set(prev);
                            if (next.has(alert.familyId)) next.delete(alert.familyId);
                            else next.add(alert.familyId);
                            return next;
                          });
                        }}>
                          <CollapsibleTrigger asChild>
                            <div className={`p-2 md:p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                              alert.priority === 'urgent' ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 
                              alert.priority === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20' : 
                              'bg-blue-50 border-blue-200 dark:bg-blue-900/20'
                            }`}>
                              <div className="flex items-start md:items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap">
                                {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 md:mt-0" /> : <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 md:mt-0" />}
                                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alert.familyColor }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                                    <p className="font-medium text-xs md:text-sm">{alert.familyName}</p>
                                    <Badge variant="secondary" className="text-[10px] md:text-xs">{alert.items.length} itens</Badge>
                                  </div>
                                  <p className="text-[10px] md:text-xs text-muted-foreground">
                                    Lead: {alert.leadTimeDays}d • 
                                    {alert.daysUntilDue <= 0 ? ' Vencido!' : ` ${alert.daysUntilDue}d`}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-medium text-xs md:text-sm">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}</p>
                                  <Badge className={`text-[10px] md:text-xs ${
                                    alert.priority === 'urgent' ? 'bg-red-500' : 
                                    alert.priority === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                                  }`}>
                                    {alert.priority === 'urgent' ? 'Urgente' : alert.priority === 'warning' ? 'Atenção' : 'Programado'}
                                  </Badge>
                                </div>
                                {canEdit && (
                                <Button 
                                    size="sm" 
                                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-[10px] md:text-xs h-7 md:h-8 px-2 md:px-3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      createQuotationFromAlert(alert);
                                    }}
                                  >
                                    <FileText className="w-3 h-3 mr-0.5 md:mr-1" />
                                    <span className="hidden md:inline">Cotar Agora</span>
                                    <span className="md:hidden">Cotar</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="mt-1 ml-2 md:ml-6 border rounded-lg overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/30">
                                    <TableHead className="text-[10px] md:text-xs">Insumo</TableHead>
                                    <TableHead className="text-[10px] md:text-xs text-right">A Comprar</TableHead>
                                    <TableHead className="text-[10px] md:text-xs">Un</TableHead>
                                    <TableHead className="text-[10px] md:text-xs text-right hidden sm:table-cell">Valor Unit.</TableHead>
                                    <TableHead className="text-[10px] md:text-xs text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {alert.items.map(item => (
                                    <TableRow key={item.id}>
                                      <TableCell className="text-xs md:text-sm max-w-[120px] truncate">{item.name}</TableCell>
                                      <TableCell className="text-xs md:text-sm text-right font-medium text-orange-600">{item.needQuantity.toLocaleString('pt-BR')}</TableCell>
                                      <TableCell className="text-xs md:text-sm">{item.unit}</TableCell>
                                      <TableCell className="text-xs md:text-sm text-right hidden sm:table-cell">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unitValue)}</TableCell>
                                      <TableCell className="text-xs md:text-sm text-right font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.totalValue)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Labor Alerts */}
          <Card 
            ref={laborAlertsRef}
            className="cursor-pointer hover:border-orange-400 transition-colors"
            onClick={() => laborAlertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Hammer className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                Alertas Mão de Obra ({laborAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent onClick={(e) => e.stopPropagation()}>
              {laborAlerts.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 md:py-8 text-sm">Nenhum alerta de mão de obra</p>
              ) : (
                <ScrollArea className="h-[200px] md:h-[300px]">
                  <div className="space-y-2 pr-2 md:pr-4">
                    {laborAlerts.map((alert, idx) => (
                      <div key={idx} className={`p-2 md:p-3 rounded-lg border ${alert.type === 'urgent' ? 'bg-red-50 border-red-200 dark:bg-red-900/20' : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20'}`}>
                        <div className="flex items-start md:items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap">
                          {alert.type === 'urgent' ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5 md:mt-0" /> : <Clock className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5 md:mt-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs md:text-sm">{alert.message}</p>
                            <Badge variant="outline" className="text-[10px] md:text-xs mt-1">{CATEGORY_LABELS[alert.category as keyof typeof CATEGORY_LABELS] || alert.category}</Badge>
                          </div>
                          {canEdit && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="shrink-0 text-[10px] md:text-xs h-7 md:h-8 px-2 md:px-3"
                              onClick={() => {
                                const scopeItem = alertsData.scopeItems.find(s => s.id === alert.scopeId);
                                if (scopeItem) {
                                  setLaborContractPrefill({
                                    scopeId: scopeItem.scope_id,
                                    macroId: alert.macroId || scopeItem.macro_id,
                                    scopeName: alert.scopeName || scopeItem.name,
                                    houses: currentProject?.totalHouses || 0,
                                    unitValue: alert.unitValue || scopeItem.unit_value || 0
                                  });
                                }
                                setActiveTab('contracts');
                              }}
                            >
                              <ClipboardList className="w-3 h-3 mr-0.5 md:mr-1" />
                              <span className="hidden md:inline">Contratar</span>
                              <span className="md:hidden">+</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-2 md:gap-3">
            <Card><CardContent className="pt-3 md:pt-4 p-3"><div className="flex items-center gap-1.5 md:gap-2 mb-1"><FileText className="w-3 h-3 md:w-4 md:h-4 text-blue-500" /><span className="text-[10px] md:text-xs">Cotações Pendentes</span></div><p className="text-lg md:text-2xl font-bold">{alertsData.pendingQuotations}</p></CardContent></Card>
            <Card><CardContent className="pt-3 md:pt-4 p-3"><div className="flex items-center gap-1.5 md:gap-2 mb-1"><Truck className="w-3 h-3 md:w-4 md:h-4 text-orange-500" /><span className="text-[10px] md:text-xs">Em Trânsito</span></div><p className="text-lg md:text-2xl font-bold">{alertsData.inTransitOrders}</p></CardContent></Card>
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
              <Dialog open={familyDialogOpen} onOpenChange={(o) => { 
                setFamilyDialogOpen(o); 
                if (!o) { 
                  setEditingFamily(null); 
                  setNewFamily({ name: '', color: '#3b82f6' }); 
                  setFamilySearch('');
                  // Reload families para atualizar filtros
                  setDataLoaded(prev => ({ ...prev, inputs: false }));
                  loadTabData('inputs');
                } 
              }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Package className="w-4 h-4 mr-1" />Famílias</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Famílias de Materiais</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input 
                            placeholder="Nova família..." 
                            value={newFamily.name} 
                            onChange={(e) => { 
                              setNewFamily({ ...newFamily, name: e.target.value }); 
                              setFamilySearch(e.target.value);
                            }} 
                          />
                          {filteredFamilySuggestions.length > 0 && !editingFamily && (
                            <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg">
                              <p className="px-3 py-1.5 text-xs text-muted-foreground border-b">Famílias semelhantes:</p>
                              {filteredFamilySuggestions.map(f => (
                                <div 
                                  key={f.id} 
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer"
                                  onClick={() => {
                                    setNewFamily({ name: f.name, color: f.color });
                                    setFamilySearch('');
                                  }}
                                >
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
                                  <span className="text-sm">{f.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Input type="color" value={newFamily.color} onChange={(e) => setNewFamily({ ...newFamily, color: e.target.value })} className="w-12 p-1 h-10" />
                        <Button onClick={() => { saveFamily(); setFamilySearch(''); }} disabled={!newFamily.name.trim()}>
                          {editingFamily ? <><Check className="w-4 h-4 mr-1" />Salvar</> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(f => {
                          const count = inputCountByFamily[f.id] || 0;
                          return (
                            <div key={f.id} className={`flex items-center justify-between p-2 rounded ${editingFamily?.id === f.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: f.color }} />
                                <span>{f.name}</span>
                                {count > 0 && (
                                  <Badge variant="secondary" className="text-xs">{count} insumo(s)</Badge>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { 
                                  if (editingFamily?.id === f.id) {
                                    setEditingFamily(null);
                                    setNewFamily({ name: '', color: '#3b82f6' });
                                    setFamilySearch('');
                                  } else {
                                    setEditingFamily(f); 
                                    setNewFamily({ name: f.name, color: f.color }); 
                                    setFamilySearch('');
                                  }
                                }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className={`h-7 w-7 ${count > 0 ? 'text-muted-foreground cursor-not-allowed' : 'text-destructive'}`}
                                  onClick={() => deleteFamily(f.id, count)}
                                  title={count > 0 ? `Não pode excluir: ${count} insumo(s) cadastrado(s)` : 'Excluir família'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>
                  <DialogFooter>
                    {editingFamily && (
                      <Button variant="outline" onClick={() => { setEditingFamily(null); setNewFamily({ name: '', color: '#3b82f6' }); setFamilySearch(''); }}>
                        Cancelar Edição
                      </Button>
                    )}
                    <Button onClick={() => setFamilyDialogOpen(false)}>Fechar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Units Dialog */}
              <Dialog open={unitDialogOpen} onOpenChange={(o) => { 
                setUnitDialogOpen(o); 
                if (!o) { 
                  setEditingUnit(null); 
                  setNewUnit({ name: '', abbreviation: '' }); 
                  // Reload para atualizar lista
                  setDataLoaded(prev => ({ ...prev, inputs: false }));
                  loadTabData('inputs');
                } 
              }}>
                <DialogTrigger asChild><Button variant="outline" size="sm"><Layers className="w-4 h-4 mr-1" />Unidades</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Gerenciar Unidades</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input 
                            placeholder="Nome" 
                            value={newUnit.name} 
                            onChange={(e) => setNewUnit({ ...newUnit, name: e.target.value })} 
                          />
                          {/* Autocomplete suggestions */}
                          {newUnit.name.trim() && !editingUnit && (
                            (() => {
                              const suggestions = units.filter(u => 
                                u.name.toLowerCase().includes(newUnit.name.toLowerCase()) ||
                                u.abbreviation.toLowerCase().includes(newUnit.name.toLowerCase())
                              ).slice(0, 5);
                              return suggestions.length > 0 ? (
                                <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md">
                                  {suggestions.map(u => (
                                    <div 
                                      key={u.id}
                                      className="px-3 py-2 text-sm cursor-pointer hover:bg-muted flex justify-between"
                                      onClick={() => {
                                        setEditingUnit(u);
                                        setNewUnit({ name: u.name, abbreviation: u.abbreviation });
                                      }}
                                    >
                                      <span>{u.name}</span>
                                      <Badge variant="secondary" className="text-xs">{u.abbreviation}</Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()
                          )}
                        </div>
                        <Input placeholder="Abreviação" value={newUnit.abbreviation} onChange={(e) => setNewUnit({ ...newUnit, abbreviation: e.target.value })} className="w-24" />
                        <Button onClick={saveUnit} disabled={!newUnit.name.trim() || !newUnit.abbreviation.trim()}>
                          {editingUnit ? <><Check className="w-4 h-4 mr-1" />Salvar</> : <><Plus className="w-4 h-4 mr-1" />Adicionar</>}
                        </Button>
                      </div>
                      {newUnit.name.trim() && !editingUnit && units.some(u => u.name.toLowerCase() === newUnit.name.toLowerCase().trim()) && (
                        <p className="text-xs text-amber-600">Unidade já cadastrada. Clique na sugestão para editar.</p>
                      )}
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="space-y-1">
                        {units.map(u => (
                          <div key={u.id} className={`flex items-center justify-between p-2 rounded ${editingUnit?.id === u.id ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                            <span>{u.name} ({u.abbreviation})</span>
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
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteUnit(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                            // Auto-set family and unit for labor category
                            if (v === 'labor') {
                              const servicosFamily = families.find(f => f.name.toLowerCase() === 'serviços');
                              setNewInput({ 
                                ...newInput, 
                                category: v, 
                                unit: 'casa',
                                material_family_id: servicosFamily?.id || newInput.material_family_id
                              });
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
                          <Select 
                            value={newInput.unit} 
                            onValueChange={(v) => setNewInput({ ...newInput, unit: v })}
                            disabled={newInput.category === 'labor'}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {newInput.category === 'labor' ? (
                                <SelectItem value="casa">casa</SelectItem>
                              ) : (
                                units.length > 0 ? units.map(u => <SelectItem key={u.id} value={u.abbreviation}>{u.abbreviation}</SelectItem>) : ['un', 'kg', 'm', 'm²', 'm³', 'l', 'pç', 'vb', 'casa'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)
                              )}
                            </SelectContent>
                          </Select>
                          {newInput.category === 'labor' && (
                            <p className="text-xs text-muted-foreground mt-1">Unidade fixa para mão de obra</p>
                          )}
                        </div>
                        <div><Label>Família</Label>
                          <Select 
                            value={newInput.material_family_id || "none"} 
                            onValueChange={(v) => setNewInput({ ...newInput, material_family_id: v === "none" ? "" : v })}
                            disabled={newInput.category === 'labor'}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem família</SelectItem>
                              {families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {newInput.category === 'labor' && (
                            <p className="text-xs text-muted-foreground mt-1">Família Serviços (automático)</p>
                          )}
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
                      {newInput.category === 'material' && (
                        <div>
                          <Label>Quantidade em Estoque</Label>
                          <Input 
                            type="number" 
                            value={newInput.stock_quantity} 
                            onChange={(e) => setNewInput({ ...newInput, stock_quantity: parseFloat(e.target.value) || 0 })} 
                            placeholder="0"
                            min="0"
                            step="0.01"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Quantidade atual em estoque para desconto nas compras</p>
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
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingInput(input); setNewInput({ name: input.name, unit: input.unit, category: input.category, material_family_id: input.material_family_id || '', description: input.description || '', unit_value: input.unit_value || 0, stock_quantity: input.stock_quantity || 0 }); setInputDialogOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
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
          {/* Delete Quotation Dialog */}
          <AlertDialog open={deleteQuotationDialogOpen} onOpenChange={setDeleteQuotationDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Cotação</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir a cotação "{quotationToDelete?.title}"? 
                  {quotationToDelete?.status === 'approved' && (
                    <span className="block mt-2 text-destructive font-medium">
                      Atenção: Esta cotação está aprovada. Todos os pedidos relacionados também serão excluídos!
                    </span>
                  )}
                  Todos os itens e cotações de fornecedores serão removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => { 
                    if (quotationToDelete) { 
                      deleteQuotation(quotationToDelete.id, quotationToDelete); 
                      setDeleteQuotationDialogOpen(false); 
                      setQuotationToDelete(null); 
                    } 
                  }} 
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={quotationDialogOpen} onOpenChange={setQuotationDialogOpen}>
                <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" />Nova Cotação</Button></DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                  <DialogHeader><DialogTitle>Criar Mapa de Cotação</DialogTitle></DialogHeader>
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label>Título</Label><Input value={newQuotation.title} onChange={(e) => setNewQuotation({ ...newQuotation, title: e.target.value })} /></div>
                        <div><Label>Data Necessária</Label><Input type="date" value={newQuotation.required_date} onChange={(e) => setNewQuotation({ ...newQuotation, required_date: e.target.value })} /></div>
                      </div>
                      <div><Label>Observações</Label><Textarea value={newQuotation.notes} onChange={(e) => setNewQuotation({ ...newQuotation, notes: e.target.value })} /></div>
                      
                      {/* Budget Items Section */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label>Itens do Orçamento</Label>
                          {newQuotation.items.length > 0 && (
                            <Badge variant="secondary">{newQuotation.items.length} selecionado(s)</Badge>
                          )}
                        </div>
                        <div className="relative mb-2">
                          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                          <Input 
                            placeholder="Buscar insumo..." 
                            className="pl-8"
                            value={quotationItemSearch}
                            onChange={(e) => setQuotationItemSearch(e.target.value)}
                          />
                        </div>
                        <ScrollArea className="h-[200px] border rounded-lg p-2">
                          <div className="space-y-1">
                            {alertsData.scopeItems
                              .filter(i => i.category === 'material')
                              .filter(i => !quotationItemSearch || i.name.toLowerCase().includes(quotationItemSearch.toLowerCase()))
                              .map(item => (
                                <label 
                                  key={item.id} 
                                  className={`flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer transition-colors ${
                                    newQuotation.items.includes(item.id) ? 'bg-primary/10 border border-primary/30' : ''
                                  }`}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={newQuotation.items.includes(item.id)} 
                                    onChange={(e) => {
                                      if (e.target.checked) setNewQuotation({ ...newQuotation, items: [...newQuotation.items, item.id] });
                                      else setNewQuotation({ ...newQuotation, items: newQuotation.items.filter(i => i !== item.id) });
                                    }} 
                                    className="rounded w-4 h-4" 
                                  />
                                  <span className="flex-1 text-sm">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                                </label>
                              ))}
                            {alertsData.scopeItems.filter(i => i.category === 'material').filter(i => !quotationItemSearch || i.name.toLowerCase().includes(quotationItemSearch.toLowerCase())).length === 0 && (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                {quotationItemSearch ? 'Nenhum item encontrado' : 'Nenhum item de material no orçamento'}
                              </p>
                            )}
                          </div>
                        </ScrollArea>
                        {(newQuotation.items.length > 0 || alertsData.scopeItems.filter(i => i.category === 'material').length > 0) && (
                          <div className="flex justify-between mt-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setNewQuotation({ ...newQuotation, items: [] })}
                            >
                              Limpar seleção
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setNewQuotation({ 
                                ...newQuotation, 
                                items: alertsData.scopeItems.filter(i => i.category === 'material').map(i => i.id) 
                              })}
                            >
                              Selecionar todos
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Custom Items Section (Unplanned Costs) */}
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                            Itens Extras (Custo Não Previsto)
                          </Label>
                          {newQuotation.customItems.length > 0 && (
                            <Badge variant="outline" className="border-orange-500 text-orange-600">{newQuotation.customItems.length} extra(s)</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Adicione itens que não estão no orçamento original. Eles serão marcados como [EXTRA].</p>
                        
                        {/* Add new custom item form */}
                        <div className="grid grid-cols-5 gap-2 mb-3">
                          <Input 
                            placeholder="Nome do item" 
                            className="col-span-2"
                            value={newCustomItem.name}
                            onChange={(e) => setNewCustomItem({ ...newCustomItem, name: e.target.value })}
                          />
                          <Input 
                            type="number"
                            placeholder="Qtd"
                            min="1"
                            value={newCustomItem.quantity}
                            onChange={(e) => setNewCustomItem({ ...newCustomItem, quantity: parseFloat(e.target.value) || 1 })}
                          />
                          <Input 
                            placeholder="Un"
                            value={newCustomItem.unit}
                            onChange={(e) => setNewCustomItem({ ...newCustomItem, unit: e.target.value })}
                          />
                          <Button 
                            type="button"
                            size="sm"
                            disabled={!newCustomItem.name.trim()}
                            onClick={() => {
                              if (newCustomItem.name.trim()) {
                                setNewQuotation({
                                  ...newQuotation,
                                  customItems: [...newQuotation.customItems, { ...newCustomItem }]
                                });
                                setNewCustomItem({ name: '', quantity: 1, unit: 'un', estimatedValue: 0 });
                              }
                            }}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* List of custom items */}
                        {newQuotation.customItems.length > 0 && (
                          <div className="border rounded-lg divide-y">
                            {newQuotation.customItems.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 bg-orange-50/50 dark:bg-orange-900/10">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-orange-600 border-orange-400">EXTRA</Badge>
                                  <span className="text-sm font-medium">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">{item.quantity} {item.unit}</span>
                                </div>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => setNewQuotation({
                                    ...newQuotation,
                                    customItems: newQuotation.customItems.filter((_, i) => i !== idx)
                                  })}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter className="mt-4 pt-4 border-t">
                    <Button variant="outline" onClick={() => { setQuotationDialogOpen(false); setNewQuotation({ title: '', required_date: '', notes: '', items: [], customItems: [] }); }}>Cancelar</Button>
                    <Button onClick={createQuotation} disabled={!newQuotation.title || !newQuotation.required_date || (newQuotation.items.length === 0 && newQuotation.customItems.length === 0)}>
                      Criar ({newQuotation.items.length + newQuotation.customItems.length} itens)
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-4">
              {quotations.map(quotation => {
                const allItemsHaveSelection = quotation.items?.every(item => item.quotes?.some(q => q.is_selected)) || false;
                const totalValue = quotation.items?.reduce((sum, item) => {
                  const selectedQuote = item.quotes?.find(q => q.is_selected);
                  return sum + (selectedQuote ? selectedQuote.unit_value * item.quantity : 0);
                }, 0) || 0;
                
                return (
                  <Card 
                    key={quotation.id} 
                    className={`transition-all ${
                      quotation.status === 'approved' 
                        ? 'border-green-300 bg-green-50/30 dark:bg-green-900/10' 
                        : quotation.status === 'pending' && allItemsHaveSelection 
                          ? 'border-blue-300 ring-2 ring-blue-100' 
                          : ''
                    }`}
                  >
                    <CardContent className="p-0">
                      {/* Header - Always visible */}
                      <div 
                        className="flex items-center justify-between p-4 border-b bg-muted/30 cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          if (quotation.status === 'approved') {
                            setExpandedQuotations(prev => {
                              const next = new Set(prev);
                              if (next.has(quotation.id)) next.delete(quotation.id);
                              else next.add(quotation.id);
                              return next;
                            });
                          } else if (quotation.status === 'pending') {
                            setExpandedPendingQuotations(prev => {
                              const next = new Set(prev);
                              if (next.has(quotation.id)) next.delete(quotation.id);
                              else next.add(quotation.id);
                              return next;
                            });
                          }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {quotation.status === 'pending' ? (
                            expandedPendingQuotations.has(quotation.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            quotation.status === 'approved' 
                              ? 'bg-green-100 text-green-600' 
                              : quotation.status === 'pending' 
                                ? 'bg-yellow-100 text-yellow-600' 
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {quotation.status === 'approved' ? <CheckCircle2 className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-base">{quotation.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              <span>Criada em {format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                              {quotation.status !== 'approved' && (
                                <>
                                  <span>•</span>
                                  <span>Necessária até {format(new Date(quotation.required_date), "dd/MM/yyyy", { locale: ptBR })}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{quotation.items?.length || 0} itens</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {canEdit && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuotationToDelete(quotation);
                                setDeleteQuotationDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Badge className={`${STATUS_COLORS[quotation.status]} text-white`}>{STATUS_LABELS[quotation.status]}</Badge>
                          {totalValue > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Total</p>
                              <p className="font-bold text-lg text-green-600">{formatCurrency(totalValue)}</p>
                            </div>
                          )}
                          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${
                            (quotation.status === 'approved' && expandedQuotations.has(quotation.id)) ||
                            (quotation.status === 'pending' && expandedPendingQuotations.has(quotation.id))
                              ? 'rotate-180' : ''
                          }`} />
                        </div>
                      </div>
                      
                      {/* Items - Show when expanded */}
                      {quotation.items && quotation.items.length > 0 && (
                        (quotation.status === 'pending' && expandedPendingQuotations.has(quotation.id)) ||
                        (quotation.status === 'approved' && expandedQuotations.has(quotation.id))
                      ) && (
                        <div className="p-4">
                          <div className="grid gap-3">
                            {quotation.items.map(item => {
                              const quotes = item.quotes || [];
                              const selectedQuote = quotes.find(q => q.is_selected);
                              const lowestQuote = quotes.length > 0 ? quotes.reduce((min, q) => q.unit_value < min.unit_value ? q : min, quotes[0]) : null;
                              
                              return (
                                <div key={item.id} className={`p-3 rounded-lg border ${selectedQuote ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : item.name.startsWith('[EXTRA]') ? 'border-orange-200 bg-orange-50/30' : 'border-muted'}`}>
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      {item.name.startsWith('[EXTRA]') ? (
                                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                                      ) : (
                                        <Package className="w-4 h-4 text-blue-500" />
                                      )}
                                      {editingQuotationItem?.itemId === item.id ? (
                                        <div className="flex items-center gap-2">
                                          <Input 
                                            className="h-7 w-40"
                                            value={editingQuotationItem.name}
                                            onChange={(e) => setEditingQuotationItem({ ...editingQuotationItem, name: e.target.value })}
                                          />
                                          <Input 
                                            type="number"
                                            className="h-7 w-16"
                                            value={editingQuotationItem.quantity}
                                            onChange={(e) => setEditingQuotationItem({ ...editingQuotationItem, quantity: parseFloat(e.target.value) || 1 })}
                                          />
                                          <Input 
                                            className="h-7 w-14"
                                            value={editingQuotationItem.unit}
                                            onChange={(e) => setEditingQuotationItem({ ...editingQuotationItem, unit: e.target.value })}
                                          />
                                          <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-7 w-7"
                                            onClick={() => updateQuotationItem(item.id, { 
                                              name: editingQuotationItem.name, 
                                              quantity: editingQuotationItem.quantity, 
                                              unit: editingQuotationItem.unit 
                                            })}
                                          >
                                            <Check className="w-3 h-3" />
                                          </Button>
                                          <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-7 w-7"
                                            onClick={() => setEditingQuotationItem(null)}
                                          >
                                            <X className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <>
                                          <span className="font-medium">{item.name}</span>
                                          <Badge variant="secondary" className="text-xs">{item.quantity} {item.unit}</Badge>
                                          {canEdit && quotation.status === 'pending' && (
                                            <div className="flex gap-1 ml-2">
                                              <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="h-6 w-6"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setEditingQuotationItem({ itemId: item.id, name: item.name, quantity: item.quantity, unit: item.unit });
                                                }}
                                              >
                                                <Edit2 className="w-3 h-3" />
                                              </Button>
                                              <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                className="h-6 w-6 text-destructive"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  deleteQuotationItem(quotation.id, item.id);
                                                }}
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    {selectedQuote && (
                                      <div className="flex items-center gap-2">
                                        <Check className="w-4 h-4 text-green-500" />
                                        <span className="text-sm font-medium text-green-600">{selectedQuote.supplier?.name}</span>
                                        <span className="text-sm font-bold">{formatCurrency(selectedQuote.unit_value * item.quantity)}</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Quote cards - only show for pending */}
                                  {quotation.status !== 'approved' && (
                                    <div className="grid grid-cols-3 gap-2">
                                      {[0, 1, 2].map(i => {
                                        const quote = quotes[i];
                                        const isLowest = quote && lowestQuote && quote.id === lowestQuote.id;
                                        
                                        return (
                                          <div 
                                            key={i} 
                                            className={`p-2 rounded-lg border-2 transition-all cursor-pointer ${
                                              quote?.is_selected 
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                                                : quote 
                                                  ? 'border-muted hover:border-primary/50 hover:bg-muted/50' 
                                                  : 'border-dashed border-muted-foreground/20'
                                            }`}
                                            onClick={() => {
                                              if (quote && canEdit && quotation.status === 'pending') {
                                                selectQuote(item.id, quote.id);
                                              }
                                            }}
                                          >
                                            {quote ? (
                                              <div className="text-center">
                                                <p className="font-medium text-sm truncate">{quote.supplier?.name}</p>
                                                <p className={`text-lg font-bold ${isLowest ? 'text-green-600' : ''}`}>
                                                  {formatCurrency(quote.unit_value)}
                                                  <span className="text-xs font-normal text-muted-foreground">/un</span>
                                                </p>
                                                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-1">
                                                  <Truck className="w-3 h-3" />
                                                  {quote.delivery_days} dias
                                                </div>
                                                {isLowest && !quote.is_selected && (
                                                  <Badge variant="secondary" className="text-[10px] mt-1 bg-green-100 text-green-700">Menor preço</Badge>
                                                )}
                                                {quote.is_selected && (
                                                  <Badge className="text-[10px] mt-1 bg-green-500">
                                                    <Check className="w-2.5 h-2.5 mr-0.5" />Selecionado
                                                  </Badge>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="text-center py-2 text-muted-foreground text-xs">
                                                Cotação {i + 1}
                                                <br />
                                                <span className="text-[10px]">Não preenchida</span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Footer actions */}
                      {canEdit && quotation.status === 'pending' && (
                        <div className="flex items-center justify-between p-4 border-t bg-muted/20">
                          <Button size="sm" variant="outline" onClick={async () => { 
                            // Ensure suppliers are loaded before opening dialog
                            if (suppliers.length === 0) {
                              const { data } = await supabase.from('suppliers').select('*').order('name');
                              if (data) setSuppliers(data.map(s => ({ ...s, supplier_type: (s.supplier_type || 'material') as 'material' | 'labor' })));
                            }
                            setSelectedQuotation(quotation); 
                            setQuoteDetailsDialogOpen(true); 
                          }}>
                            <Edit2 className="w-3 h-3 mr-1" />Editar Cotações
                          </Button>
                          <Button 
                            size="default" 
                            className={allItemsHaveSelection ? 'bg-green-600 hover:bg-green-700' : ''}
                            disabled={!allItemsHaveSelection}
                            onClick={() => approveQuotation(quotation)}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            {allItemsHaveSelection ? `Aprovar e Gerar Pedido (${formatCurrency(totalValue)})` : 'Selecione todos os fornecedores'}
                          </Button>
                        </div>
                      )}
                      
                      {quotation.status === 'pending' && !expandedPendingQuotations.has(quotation.id) && (
                        <div className="flex items-center justify-center p-3 border-t bg-yellow-50/50 dark:bg-yellow-900/10">
                          <div className="flex items-center gap-2 text-yellow-600 text-sm">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">Cotação pendente</span>
                            <span className="text-muted-foreground">• Clique para expandir</span>
                          </div>
                        </div>
                      )}
                      
                      {quotation.status === 'approved' && !expandedQuotations.has(quotation.id) && (
                        <div className="flex items-center justify-center p-3 border-t bg-green-50/50 dark:bg-green-900/10">
                          <div className="flex items-center gap-2 text-green-600 text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-medium">Cotação aprovada</span>
                            <span className="text-muted-foreground">• Clique para ver detalhes</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {quotations.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhuma cotação criada</CardContent></Card>}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="flex-1 overflow-auto mt-4 space-y-4">
          {/* Delete Order Dialog */}
          <AlertDialog open={deleteOrderDialogOpen} onOpenChange={setDeleteOrderDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Pedido</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o pedido "{orderToDelete?.order_number}"? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => { if (orderToDelete) { deleteOrder(orderToDelete.id); setDeleteOrderDialogOpen(false); setOrderToDelete(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="space-y-3">
              {purchaseOrders.map(order => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div><h3 className="font-semibold">{order.order_number}</h3><p className="text-sm text-muted-foreground">{order.supplier?.name}</p></div>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                        <span className="font-bold">{formatCurrency(order.total_value)}</span>
                      </div>
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
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setSelectedOrder(order); setOrderEditDialogOpen(true); }}><Edit2 className="w-3 h-3 mr-1" />Editar</Button>
                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setSelectedOrder(order); setTrackingDialogOpen(true); }}><Plus className="w-3 h-3 mr-1" />Rastreamento</Button>
                            {order.status === 'pending' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'sent' })}><Send className="w-3 h-3 mr-1" />Enviar</Button>}
                            {order.status === 'sent' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'confirmed' })}><Check className="w-3 h-3 mr-1" />Confirmar</Button>}
                            {order.status === 'confirmed' && <Button size="sm" onClick={() => updateOrder(order.id, { status: 'in_transit' })}><Truck className="w-3 h-3 mr-1" />Em Trânsito</Button>}
                          </>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => { setOrderToDelete(order); setDeleteOrderDialogOpen(true); }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />Excluir
                        </Button>
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

        {/* Contracts Tab - Labor Contracts */}
        <TabsContent value="contracts" className="flex-1 overflow-auto mt-4">
          <LaborContractsView 
            prefilledScopeId={laborContractPrefill?.scopeId}
            prefilledMacroId={laborContractPrefill?.macroId}
            prefilledScopeName={laborContractPrefill?.scopeName}
            prefilledHouses={laborContractPrefill?.houses}
            prefilledUnitValue={laborContractPrefill?.unitValue}
            onContractCreated={() => {
              setLaborContractPrefill(null);
              loadAlertData();
            }}
          />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="leadtime" className="flex-1 overflow-auto mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5" />Lead Time por Família de Material</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Configure o prazo de antecedência (em dias) para iniciar cotações de cada família de materiais.
              </p>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {families.map(family => (
                    <div key={family.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: family.color }} />
                        <span className="font-medium">{family.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max="90"
                          className="w-20 h-8"
                          value={family.lead_time_days}
                          onChange={async (e) => {
                            const newDays = parseInt(e.target.value) || 7;
                            try {
                              await supabase.from('material_families').update({ lead_time_days: newDays }).eq('id', family.id);
                              setFamilies(prev => prev.map(f => f.id === family.id ? { ...f, lead_time_days: newDays } : f));
                              setAlertFamilies(prev => prev.map(f => f.id === family.id ? { ...f, lead_time_days: newDays } : f));
                            } catch (error) {
                              console.error('Error updating lead time:', error);
                            }
                          }}
                        />
                        <span className="text-sm text-muted-foreground">dias</span>
                      </div>
                    </div>
                  ))}
                  {families.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      Cadastre famílias de materiais na aba Insumos
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Quotes Dialog - Improved for faster bulk entry */}
      <Dialog open={quoteDetailsDialogOpen} onOpenChange={(open) => {
        setQuoteDetailsDialogOpen(open);
        if (!open) {
          setSupplierQuotes({});
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Mapa de Cotação - {selectedQuotation?.title}</DialogTitle>
            <p className="text-sm text-muted-foreground">Preencha os valores por fornecedor. Prazo de entrega é geral para todo o pedido.</p>
          </DialogHeader>
          
          {selectedQuotation && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Global delivery days selector */}
              <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200">
                <Truck className="w-5 h-5 text-blue-500" />
                <Label className="font-medium">Prazo de Entrega Geral:</Label>
                <Input 
                  type="number" 
                  className="w-24"
                  placeholder="Dias"
                  min="1"
                  onChange={(e) => {
                    const days = parseInt(e.target.value) || 0;
                    // Apply to all items
                    const updated: typeof supplierQuotes = {};
                    selectedQuotation.items?.forEach(item => {
                      const current = supplierQuotes[item.id] || [];
                      updated[item.id] = [0, 1, 2].map(i => ({
                        ...(current[i] || { supplier_id: item.quotes?.[i]?.supplier_id || '', unit_value: item.quotes?.[i]?.unit_value || 0, notes: '' }),
                        delivery_days: days
                      }));
                    });
                    setSupplierQuotes(updated);
                  }}
                />
                <span className="text-sm text-muted-foreground">dias para todos os itens</span>
              </div>

              {/* Quick supplier assignment */}
              <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                {[0, 1, 2].map(i => (
                  <div key={i} className="space-y-2">
                    <Label className="text-sm font-medium">Fornecedor {i + 1}</Label>
                    <Select 
                      value=""
                      onValueChange={(supplierId) => {
                        // Apply this supplier to all items at position i
                        const updated: typeof supplierQuotes = { ...supplierQuotes };
                        selectedQuotation.items?.forEach(item => {
                          const current = updated[item.id] || [];
                          const existingQuote = item.quotes?.[i];
                          updated[item.id] = [...current];
                          updated[item.id][i] = {
                            supplier_id: supplierId,
                            unit_value: current[i]?.unit_value || existingQuote?.unit_value || 0,
                            delivery_days: current[i]?.delivery_days || existingQuote?.delivery_days || 0,
                            notes: current[i]?.notes || existingQuote?.notes || ''
                          };
                        });
                        setSupplierQuotes(updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Aplicar fornecedor a todos" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.filter(s => s.supplier_type === 'material').map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Items table for quick price entry */}
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[200px]">Item</TableHead>
                      <TableHead className="text-center w-[80px]">Qtd</TableHead>
                      <TableHead className="text-center">Fornecedor 1</TableHead>
                      <TableHead className="text-center">Fornecedor 2</TableHead>
                      <TableHead className="text-center">Fornecedor 3</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedQuotation.items?.map(item => {
                      const currentQuotes = supplierQuotes[item.id] || [];
                      
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-center text-sm">{item.quantity} {item.unit}</TableCell>
                          {[0, 1, 2].map(i => {
                            const existingQuote = item.quotes?.[i];
                            const quote = currentQuotes[i] || { 
                              supplier_id: existingQuote?.supplier_id || '', 
                              unit_value: existingQuote?.unit_value || 0, 
                              delivery_days: existingQuote?.delivery_days || 0, 
                              notes: '' 
                            };
                            const supplier = suppliers.find(s => s.id === quote.supplier_id);
                            
                            return (
                              <TableCell key={i} className="p-1">
                                <div className="space-y-1">
                                  {!supplier ? (
                                    <Select 
                                      value={quote.supplier_id} 
                                      onValueChange={(v) => {
                                        const updated = [...currentQuotes];
                                        updated[i] = { ...quote, supplier_id: v };
                                        setSupplierQuotes({ ...supplierQuotes, [item.id]: updated });
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Fornecedor" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {suppliers.filter(s => s.supplier_type === 'material').map(s => (
                                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs w-full justify-center">
                                      {supplier.name}
                                    </Badge>
                                  )}
                                  <Input 
                                    type="number" 
                                    className="h-8 text-center"
                                    placeholder="R$ 0,00"
                                    value={quote.unit_value || ''} 
                                    onChange={(e) => {
                                      const updated = [...currentQuotes];
                                      updated[i] = { ...quote, unit_value: parseFloat(e.target.value) || 0 };
                                      setSupplierQuotes({ ...supplierQuotes, [item.id]: updated });
                                    }}
                                  />
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
          
          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setQuoteDetailsDialogOpen(false)}>Cancelar</Button>
            <Button 
              onClick={async () => {
                // Save all quotes at once
                if (selectedQuotation?.items) {
                  for (const item of selectedQuotation.items) {
                    const quotes = supplierQuotes[item.id];
                    if (quotes && quotes.some(q => q.supplier_id && q.unit_value > 0)) {
                      await saveSupplierQuotes(item.id, quotes);
                    }
                  }
                }
                setQuoteDetailsDialogOpen(false);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-1" />
              Salvar Todas as Cotações
            </Button>
          </DialogFooter>
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

      {/* Import Inputs Dialog */}
      {projectId && (
        <ImportInputsDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          projectId={projectId}
          families={families}
          units={units}
          onSuccess={() => {
            setDataLoaded(prev => ({ ...prev, inputs: false }));
            loadTabData('inputs');
          }}
        />
      )}
    </div>
  );
}
