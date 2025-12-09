import { useState, useEffect, useCallback, useMemo } from "react";
import { Package, Truck, FileText, Clock, AlertTriangle, CheckCircle2, Plus, Settings, Users, Search, Filter, ChevronDown, ChevronRight, Calendar, DollarSign, Loader2, RefreshCw, Eye, Edit2, Trash2, Send, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, differenceInDays, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadTime {
  id?: string;
  category: 'material' | 'labor' | 'equipment';
  lead_time_days: number;
}

interface Supplier {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
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

const STATUS_LABELS = {
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

const STATUS_COLORS = {
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

  const [activeTab, setActiveTab] = useState<"alerts" | "quotations" | "orders" | "suppliers" | "settings">("alerts");
  const [isLoading, setIsLoading] = useState(true);
  const [leadTimes, setLeadTimes] = useState<LeadTime[]>([
    { category: 'material', lead_time_days: 15 },
    { category: 'labor', lead_time_days: 7 },
    { category: 'equipment', lead_time_days: 10 }
  ]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [quotations, setQuotations] = useState<QuotationRequest[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);

  // Dialog states
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationRequest | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  // Form states
  const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({});
  const [newQuotation, setNewQuotation] = useState<{ title: string; required_date: string; notes: string; items: string[] }>({
    title: '', required_date: '', notes: '', items: []
  });
  const [newTracking, setNewTracking] = useState<{ status: string; description: string; location: string }>({
    status: '', description: '', location: ''
  });

  // Load data
  const loadData = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);

    try {
      // Load lead times
      const { data: leadTimeData } = await supabase
        .from('category_lead_times')
        .select('*')
        .eq('project_id', projectId);

      if (leadTimeData && leadTimeData.length > 0) {
        setLeadTimes(leadTimeData.map(lt => ({
          id: lt.id,
          category: lt.category as 'material' | 'labor' | 'equipment',
          lead_time_days: lt.lead_time_days
        })));
      }

      // Load suppliers
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('project_id', projectId)
        .order('name');

      if (supplierData) {
        setSuppliers(supplierData);
      }

      // Load quotations with items
      const { data: quotationData } = await supabase
        .from('quotation_requests')
        .select(`
          *,
          quotation_items (
            *,
            supplier_quotes (
              *,
              suppliers (*)
            )
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (quotationData) {
        setQuotations(quotationData.map((q: any) => ({
          ...q,
          status: q.status as QuotationRequest['status'],
          items: q.quotation_items?.map((item: any) => ({
            ...item,
            quotes: item.supplier_quotes?.map((sq: any) => ({
              ...sq,
              supplier: sq.suppliers
            }))
          }))
        })));
      }

      // Load purchase orders with items and tracking
      const { data: orderData } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers (*),
          purchase_order_items (*),
          delivery_tracking (*)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (orderData) {
        setPurchaseOrders(orderData.map((o: any) => ({
          ...o,
          status: o.status as PurchaseOrder['status'],
          supplier: o.suppliers,
          items: o.purchase_order_items,
          tracking: o.delivery_tracking
        })));
      }

      // Load scope items for creating quotations
      const { data: scopeItemData } = await supabase
        .from('scope_items')
        .select('*')
        .eq('project_id', projectId);

      if (scopeItemData) {
        setScopeItems(scopeItemData.map(item => ({
          id: item.id,
          name: item.name,
          category: item.category as 'material' | 'labor' | 'equipment',
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_value: Number(item.unit_value)
        })));
      }

    } catch (error) {
      console.error('Error loading supplies data:', error);
      toast.error('Erro ao carregar dados de suprimentos');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate alerts based on lead times and planned productions
  const alerts = useMemo(() => {
    const alertsList: { type: 'warning' | 'urgent' | 'info'; message: string; category: string; dueDate: Date }[] = [];
    const today = new Date();

    // Check scope items that need to be ordered based on lead times
    scopeItems.forEach(item => {
      const leadTime = leadTimes.find(lt => lt.category === item.category);
      if (!leadTime) return;

      const requiredDate = addDays(today, leadTime.lead_time_days);
      
      // Check if there's a pending quotation or order for this item
      const hasQuotation = quotations.some(q => 
        q.status !== 'cancelled' && 
        q.items?.some(qi => qi.name.includes(item.name))
      );
      const hasOrder = purchaseOrders.some(o => 
        o.status !== 'cancelled' && 
        o.items?.some(oi => oi.name.includes(item.name))
      );

      if (!hasQuotation && !hasOrder && item.quantity > 0) {
        const daysUntilNeeded = differenceInDays(requiredDate, today);
        
        if (daysUntilNeeded <= 3) {
          alertsList.push({
            type: 'urgent',
            message: `${item.name} precisa ser cotado urgentemente!`,
            category: item.category,
            dueDate: requiredDate
          });
        } else if (daysUntilNeeded <= 7) {
          alertsList.push({
            type: 'warning',
            message: `${item.name} deve ser cotado em breve`,
            category: item.category,
            dueDate: requiredDate
          });
        }
      }
    });

    // Check pending quotations that need attention
    quotations.filter(q => q.status === 'pending').forEach(q => {
      const daysUntilRequired = differenceInDays(new Date(q.required_date), today);
      if (daysUntilRequired <= 3) {
        alertsList.push({
          type: 'urgent',
          message: `Cotação "${q.title}" vence em ${daysUntilRequired} dias`,
          category: 'quotation',
          dueDate: new Date(q.required_date)
        });
      }
    });

    // Check orders in transit
    purchaseOrders.filter(o => o.status === 'in_transit' && o.expected_delivery_date).forEach(o => {
      const expectedDate = new Date(o.expected_delivery_date!);
      const daysUntilDelivery = differenceInDays(expectedDate, today);
      
      if (daysUntilDelivery <= 0) {
        alertsList.push({
          type: 'urgent',
          message: `Pedido ${o.order_number} deveria ter chegado!`,
          category: 'delivery',
          dueDate: expectedDate
        });
      } else if (daysUntilDelivery <= 2) {
        alertsList.push({
          type: 'info',
          message: `Pedido ${o.order_number} chega em ${daysUntilDelivery} dias`,
          category: 'delivery',
          dueDate: expectedDate
        });
      }
    });

    return alertsList.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [scopeItems, leadTimes, quotations, purchaseOrders]);

  // Save lead time
  const saveLeadTime = async (category: string, days: number) => {
    if (!projectId) return;

    try {
      const { error } = await supabase
        .from('category_lead_times')
        .upsert({
          project_id: projectId,
          category,
          lead_time_days: days
        }, {
          onConflict: 'project_id,category'
        });

      if (error) throw error;
      toast.success('Lead time salvo!');
    } catch (error) {
      console.error('Error saving lead time:', error);
      toast.error('Erro ao salvar lead time');
    }
  };

  // Save supplier
  const saveSupplier = async () => {
    if (!projectId || !newSupplier.name) return;

    try {
      const { error } = await supabase
        .from('suppliers')
        .insert({
          project_id: projectId,
          name: newSupplier.name,
          email: newSupplier.email || null,
          phone: newSupplier.phone || null,
          address: newSupplier.address || null,
          notes: newSupplier.notes || null
        });

      if (error) throw error;
      
      toast.success('Fornecedor cadastrado!');
      setSupplierDialogOpen(false);
      setNewSupplier({});
      loadData();
    } catch (error) {
      console.error('Error saving supplier:', error);
      toast.error('Erro ao salvar fornecedor');
    }
  };

  // Create quotation request
  const createQuotation = async () => {
    if (!projectId || !newQuotation.title || !newQuotation.required_date) return;

    try {
      // Create quotation request
      const { data: quotationData, error: quotationError } = await supabase
        .from('quotation_requests')
        .insert({
          project_id: projectId,
          title: newQuotation.title,
          required_date: newQuotation.required_date,
          notes: newQuotation.notes || null
        })
        .select()
        .single();

      if (quotationError) throw quotationError;

      // Add selected items
      if (newQuotation.items.length > 0) {
        const itemsToInsert = newQuotation.items.map(itemId => {
          const item = scopeItems.find(si => si.id === itemId);
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

        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      toast.success('Mapa de cotação criado!');
      setQuotationDialogOpen(false);
      setNewQuotation({ title: '', required_date: '', notes: '', items: [] });
      loadData();
    } catch (error) {
      console.error('Error creating quotation:', error);
      toast.error('Erro ao criar cotação');
    }
  };

  // Approve quotation and create purchase order
  const approveQuotation = async (quotation: QuotationRequest) => {
    if (!projectId) return;

    // Find selected quotes for each item
    const selectedQuotes = quotation.items?.flatMap(item => 
      item.quotes?.filter(q => q.is_selected) || []
    ) || [];

    if (selectedQuotes.length === 0) {
      toast.error('Selecione pelo menos uma cotação de fornecedor');
      return;
    }

    // Group by supplier
    const bySupplier = selectedQuotes.reduce((acc, quote) => {
      if (!acc[quote.supplier_id]) {
        acc[quote.supplier_id] = [];
      }
      acc[quote.supplier_id].push(quote);
      return acc;
    }, {} as Record<string, SupplierQuote[]>);

    try {
      // Create purchase orders for each supplier
      for (const [supplierId, quotes] of Object.entries(bySupplier)) {
        const totalValue = quotes.reduce((sum, q) => sum + q.total_value, 0);
        const maxDeliveryDays = Math.max(...quotes.map(q => q.delivery_days));
        const expectedDeliveryDate = addDays(new Date(), maxDeliveryDays);

        const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

        const { data: orderData, error: orderError } = await supabase
          .from('purchase_orders')
          .insert({
            project_id: projectId,
            quotation_id: quotation.id,
            supplier_id: supplierId,
            order_number: orderNumber,
            total_value: totalValue,
            expected_delivery_date: expectedDeliveryDate.toISOString().split('T')[0]
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Add order items
        const orderItems = quotes.map(quote => {
          const quotationItem = quotation.items?.find(qi => 
            qi.quotes?.some(q => q.id === quote.id)
          );
          return {
            purchase_order_id: orderData.id,
            quotation_item_id: quotationItem?.id,
            name: quotationItem?.name || '',
            category: quotationItem?.category || 'material',
            quantity: quotationItem?.quantity || 1,
            unit: quotationItem?.unit || 'un',
            unit_value: quote.unit_value,
            total_value: quote.total_value
          };
        });

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(orderItems);

        if (itemsError) throw itemsError;
      }

      // Update quotation status
      await supabase
        .from('quotation_requests')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', quotation.id);

      toast.success('Cotação aprovada e pedidos criados!');
      loadData();
    } catch (error) {
      console.error('Error approving quotation:', error);
      toast.error('Erro ao aprovar cotação');
    }
  };

  // Add tracking event
  const addTrackingEvent = async () => {
    if (!selectedOrder || !newTracking.status) return;

    try {
      const { error } = await supabase
        .from('delivery_tracking')
        .insert({
          purchase_order_id: selectedOrder.id,
          status: newTracking.status,
          description: newTracking.description || null,
          location: newTracking.location || null
        });

      if (error) throw error;

      // Update order status if delivered
      if (newTracking.status === 'delivered') {
        await supabase
          .from('purchase_orders')
          .update({ 
            status: 'delivered', 
            actual_delivery_date: new Date().toISOString().split('T')[0] 
          })
          .eq('id', selectedOrder.id);
      } else if (newTracking.status === 'in_transit') {
        await supabase
          .from('purchase_orders')
          .update({ status: 'in_transit' })
          .eq('id', selectedOrder.id);
      }

      toast.success('Rastreamento atualizado!');
      setTrackingDialogOpen(false);
      setNewTracking({ status: '', description: '', location: '' });
      loadData();
    } catch (error) {
      console.error('Error adding tracking:', error);
      toast.error('Erro ao atualizar rastreamento');
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({ status })
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Status atualizado!');
      loadData();
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (!currentProject) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Selecione um projeto para ver suprimentos
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando suprimentos...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col h-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-5 h-10">
          <TabsTrigger value="alerts" className="gap-2 text-xs">
            <AlertTriangle className="w-4 h-4" />
            Alertas
            {alerts.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                {alerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="quotations" className="gap-2 text-xs">
            <FileText className="w-4 h-4" />
            Cotações
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2 text-xs">
            <Truck className="w-4 h-4" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2 text-xs">
            <Users className="w-4 h-4" />
            Fornecedores
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2 text-xs">
            <Settings className="w-4 h-4" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="flex-1 overflow-auto mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Alertas de Suprimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum alerta no momento. Todos os suprimentos estão em dia!
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {alerts.map((alert, idx) => (
                      <div key={idx} className={`p-4 rounded-lg border ${
                        alert.type === 'urgent' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                        alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' :
                        'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                      }`}>
                        <div className="flex items-start gap-3">
                          {alert.type === 'urgent' ? (
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                          ) : alert.type === 'warning' ? (
                            <Clock className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                          ) : (
                            <Package className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{alert.message}</p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {CATEGORY_LABELS[alert.category as keyof typeof CATEGORY_LABELS] || alert.category}
                              </Badge>
                              <span>Até {format(alert.dueDate, "dd/MM/yyyy", { locale: ptBR })}</span>
                            </div>
                          </div>
                          {canEdit && alert.category !== 'quotation' && alert.category !== 'delivery' && (
                            <Button size="sm" onClick={() => {
                              setNewQuotation({
                                ...newQuotation,
                                title: `Cotação - ${alert.message.split(' ')[0]}`,
                                required_date: format(alert.dueDate, 'yyyy-MM-dd')
                              });
                              setQuotationDialogOpen(true);
                            }}>
                              Criar Cotação
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

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium">Cotações Pendentes</span>
                </div>
                <p className="text-2xl font-bold">{quotations.filter(q => q.status === 'pending').length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-medium">Em Trânsito</span>
                </div>
                <p className="text-2xl font-bold">{purchaseOrders.filter(o => o.status === 'in_transit').length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium">Entregues</span>
                </div>
                <p className="text-2xl font-bold">{purchaseOrders.filter(o => o.status === 'delivered').length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium">Total Pedidos</span>
                </div>
                <p className="text-xl font-bold">{formatCurrency(purchaseOrders.reduce((sum, o) => sum + o.total_value, 0))}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Quotations Tab */}
        <TabsContent value="quotations" className="flex-1 overflow-auto mt-4 space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={quotationDialogOpen} onOpenChange={setQuotationDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Nova Cotação
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Criar Mapa de Cotação</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Título</Label>
                        <Input 
                          value={newQuotation.title}
                          onChange={(e) => setNewQuotation({ ...newQuotation, title: e.target.value })}
                          placeholder="Ex: Material Fundação Quadra A"
                        />
                      </div>
                      <div>
                        <Label>Data Necessária</Label>
                        <Input 
                          type="date"
                          value={newQuotation.required_date}
                          onChange={(e) => setNewQuotation({ ...newQuotation, required_date: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Observações</Label>
                      <Textarea 
                        value={newQuotation.notes}
                        onChange={(e) => setNewQuotation({ ...newQuotation, notes: e.target.value })}
                        placeholder="Observações para os fornecedores..."
                      />
                    </div>
                    <div>
                      <Label>Itens do Orçamento</Label>
                      <ScrollArea className="h-[200px] border rounded-lg p-2 mt-2">
                        <div className="space-y-2">
                          {scopeItems.map(item => (
                            <label key={item.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={newQuotation.items.includes(item.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewQuotation({ ...newQuotation, items: [...newQuotation.items, item.id] });
                                  } else {
                                    setNewQuotation({ ...newQuotation, items: newQuotation.items.filter(i => i !== item.id) });
                                  }
                                }}
                                className="rounded"
                              />
                              <span className="flex-1">{item.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {CATEGORY_LABELS[item.category]}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {item.quantity} {item.unit}
                              </span>
                            </label>
                          ))}
                          {scopeItems.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">
                              Nenhum item cadastrado no orçamento
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setQuotationDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={createQuotation} disabled={!newQuotation.title || !newQuotation.required_date}>
                      Criar Cotação
                    </Button>
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
                      <div>
                        <h3 className="font-semibold">{quotation.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Criado em {format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[quotation.status]}>
                          {STATUS_LABELS[quotation.status]}
                        </Badge>
                        <Badge variant="outline">
                          Até {format(new Date(quotation.required_date), "dd/MM/yyyy", { locale: ptBR })}
                        </Badge>
                      </div>
                    </div>
                    
                    {quotation.items && quotation.items.length > 0 && (
                      <div className="space-y-2 mb-3">
                        <p className="text-sm font-medium">{quotation.items.length} itens:</p>
                        <div className="flex flex-wrap gap-1">
                          {quotation.items.slice(0, 5).map(item => (
                            <Badge key={item.id} variant="secondary" className="text-xs">
                              {item.name}
                            </Badge>
                          ))}
                          {quotation.items.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{quotation.items.length - 5}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {canEdit && quotation.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1">
                          <Edit2 className="w-3 h-3" />
                          Editar
                        </Button>
                        <Button 
                          size="sm" 
                          className="gap-1"
                          onClick={() => approveQuotation(quotation)}
                        >
                          <Check className="w-3 h-3" />
                          Aprovar e Gerar Pedido
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {quotations.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Nenhuma cotação criada ainda
                  </CardContent>
                </Card>
              )}
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
                      <div>
                        <h3 className="font-semibold">{order.order_number}</h3>
                        <p className="text-sm text-muted-foreground">
                          {order.supplier?.name || 'Fornecedor não definido'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[order.status]}>
                          {STATUS_LABELS[order.status]}
                        </Badge>
                        <span className="font-bold">{formatCurrency(order.total_value)}</span>
                      </div>
                    </div>

                    {order.expected_delivery_date && (
                      <div className="flex items-center gap-2 mb-3 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          Previsão: {format(new Date(order.expected_delivery_date), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {order.actual_delivery_date && (
                          <Badge variant="outline" className="ml-2">
                            Entregue em {format(new Date(order.actual_delivery_date), "dd/MM/yyyy", { locale: ptBR })}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Tracking timeline */}
                    {order.tracking && order.tracking.length > 0 && (
                      <div className="border-l-2 border-muted pl-4 mb-3 space-y-2">
                        {order.tracking.slice(0, 3).map((track, idx) => (
                          <div key={track.id} className="text-sm">
                            <p className="font-medium">{track.status}</p>
                            <p className="text-muted-foreground text-xs">
                              {track.description && `${track.description} - `}
                              {format(new Date(track.tracking_date), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && order.status !== 'delivered' && order.status !== 'cancelled' && (
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedOrder(order);
                            setTrackingDialogOpen(true);
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Rastreamento
                        </Button>
                        {order.status === 'pending' && (
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, 'sent')}>
                            <Send className="w-3 h-3 mr-1" />
                            Enviar ao Fornecedor
                          </Button>
                        )}
                        {order.status === 'sent' && (
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, 'confirmed')}>
                            <Check className="w-3 h-3 mr-1" />
                            Confirmar
                          </Button>
                        )}
                        {order.status === 'confirmed' && (
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, 'in_transit')}>
                            <Truck className="w-3 h-3 mr-1" />
                            Em Trânsito
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              {purchaseOrders.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Nenhum pedido de compra ainda. Aprove uma cotação para criar pedidos.
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers" className="flex-1 overflow-auto mt-4 space-y-4">
          {canEdit && (
            <div className="flex justify-end">
              <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Fornecedor
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cadastrar Fornecedor</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Nome *</Label>
                      <Input 
                        value={newSupplier.name || ''}
                        onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                        placeholder="Nome do fornecedor"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Email</Label>
                        <Input 
                          type="email"
                          value={newSupplier.email || ''}
                          onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input 
                          value={newSupplier.phone || ''}
                          onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Endereço</Label>
                      <Input 
                        value={newSupplier.address || ''}
                        onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Observações</Label>
                      <Textarea 
                        value={newSupplier.notes || ''}
                        onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={saveSupplier} disabled={!newSupplier.name}>
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map(supplier => (
              <Card key={supplier.id}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">{supplier.name}</h3>
                  {supplier.email && (
                    <p className="text-sm text-muted-foreground">{supplier.email}</p>
                  )}
                  {supplier.phone && (
                    <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                  )}
                  {supplier.address && (
                    <p className="text-sm text-muted-foreground truncate">{supplier.address}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {suppliers.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="p-8 text-center text-muted-foreground">
                  Nenhum fornecedor cadastrado
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 overflow-auto mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Lead Times por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Defina o tempo médio de antecedência necessário para cotação e compra de cada categoria.
              </p>
              <div className="space-y-4">
                {leadTimes.map(lt => (
                  <div key={lt.category} className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{CATEGORY_LABELS[lt.category]}</p>
                      <p className="text-sm text-muted-foreground">
                        Alertas serão gerados {lt.lead_time_days} dias antes da data necessária
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input 
                        type="number"
                        value={lt.lead_time_days}
                        onChange={(e) => {
                          const newDays = parseInt(e.target.value) || 0;
                          setLeadTimes(prev => prev.map(l => 
                            l.category === lt.category 
                              ? { ...l, lead_time_days: newDays }
                              : l
                          ));
                        }}
                        className="w-20 text-center"
                        min={1}
                      />
                      <span className="text-sm text-muted-foreground">dias</span>
                      {canEdit && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => saveLeadTime(lt.category, lt.lead_time_days)}
                        >
                          Salvar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Tracking Dialog */}
      <Dialog open={trackingDialogOpen} onOpenChange={setTrackingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Rastreamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={newTracking.status} onValueChange={(v) => setNewTracking({ ...newTracking, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmado pelo Fornecedor</SelectItem>
                  <SelectItem value="processing">Em Preparação</SelectItem>
                  <SelectItem value="shipped">Despachado</SelectItem>
                  <SelectItem value="in_transit">Em Trânsito</SelectItem>
                  <SelectItem value="out_for_delivery">Saiu para Entrega</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input 
                value={newTracking.description}
                onChange={(e) => setNewTracking({ ...newTracking, description: e.target.value })}
                placeholder="Detalhes do rastreamento..."
              />
            </div>
            <div>
              <Label>Localização</Label>
              <Input 
                value={newTracking.location}
                onChange={(e) => setNewTracking({ ...newTracking, location: e.target.value })}
                placeholder="Ex: Centro de Distribuição SP"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addTrackingEvent} disabled={!newTracking.status}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
