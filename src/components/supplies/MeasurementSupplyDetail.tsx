import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Package, AlertTriangle, FileText, ShoppingCart, CheckCircle, XCircle, Warehouse, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSupplyRequests } from './hooks/useSupplyRequests';
import { useMeasurementStock } from './hooks/useMeasurementStock';
import { MeasurementSupplySummary, MeasurementSupplyRequest, MeasurementSupplyKPIs } from './hooks/useMeasurementSupplies';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MeasurementSupplyDetailProps {
  projectId: string;
  measurement: MeasurementSupplySummary;
  requests: MeasurementSupplyRequest[];
  kpis: MeasurementSupplyKPIs | null;
  isLoading: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onGenerate: () => void;
  getGroupedByFamily: (status?: string) => Record<string, {
    family_id: string | null;
    family_name: string;
    family_color: string | null;
    items: MeasurementSupplyRequest[];
    total_value: number;
    total_quantity: number;
  }>;
}

type TabType = 'all' | 'alert' | 'quoted' | 'ordered' | 'delivered' | 'stock';

export function MeasurementSupplyDetail({
  projectId,
  measurement,
  requests,
  kpis,
  isLoading,
  onBack,
  onRefresh,
  onGenerate,
  getGroupedByFamily,
}: MeasurementSupplyDetailProps) {
  const { canEdit } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const { transitionStatus } = useSupplyRequests(projectId);
  const {
    stockEntries,
    isLoading: isLoadingStock,
    isSaving,
    isConfirmed,
    totalInStock,
    totalToPurchase,
    loadStockEntries,
    updateStockQuantity,
    saveStockEntries,
  } = useMeasurementStock(projectId);

  // Load stock entries when measurement or requests change
  useEffect(() => {
    if (measurement.measurement_id && requests.length > 0) {
      loadStockEntries(measurement.measurement_id, requests);
    }
  }, [measurement.measurement_id, requests, loadStockEntries]);

  const toggleFamily = (familyName: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(familyName)) {
        next.delete(familyName);
      } else {
        next.add(familyName);
      }
      return next;
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = format(new Date(start), 'dd/MM/yyyy', { locale: ptBR });
    const endDate = format(new Date(end), 'dd/MM/yyyy', { locale: ptBR });
    return `${startDate} a ${endDate}`;
  };

  const getNextAction = (status: string): { label: string; nextStatus: string } | null => {
    switch (status) {
      case 'alert': return { label: 'Cotar', nextStatus: 'quoted' };
      case 'quoted': return { label: 'Pedir', nextStatus: 'ordered' };
      case 'ordered': return { label: 'Entregar', nextStatus: 'delivered' };
      default: return null;
    }
  };

  const handleTransition = async (request: MeasurementSupplyRequest, newStatus: string) => {
    await transitionStatus(request.id, newStatus as any);
    onRefresh();
  };

  const handleCancel = async (request: MeasurementSupplyRequest) => {
    if (request.status === 'ordered' || request.status === 'delivered') return;
    await transitionStatus(request.id, 'cancelled' as any, 'Cancelado pelo usuário');
    onRefresh();
  };

  const handleSaveStock = async () => {
    await saveStockEntries(measurement.measurement_id);
  };

  const renderRequestCard = (request: MeasurementSupplyRequest) => {
    const nextAction = getNextAction(request.status);

    return (
      <div 
        key={request.id} 
        className={`p-3 rounded-lg border ${request.is_critical ? 'border-red-300 bg-red-50' : 'border-border bg-card'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{request.item_name}</span>
              {request.is_critical && (
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {request.quantity} {request.item_unit} • {formatCurrency(request.total_value || 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Prazo: {formatDate(request.order_by_date)} | Uso: {formatDate(request.required_date)}
            </div>
          </div>
          
          {canEdit && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {nextAction && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTransition(request, nextAction.nextStatus)}
                >
                  {nextAction.label}
                </Button>
              )}
              {(request.status === 'alert' || request.status === 'quoted') && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancel(request)}
                  className="text-destructive hover:text-destructive"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGroupedRequests = (status?: string) => {
    const grouped = getGroupedByFamily(status);
    const families = Object.values(grouped);

    if (families.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum material {status ? `com status "${status}"` : ''}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {families.map(family => (
          <Collapsible
            key={family.family_name}
            open={expandedFamilies.has(family.family_name)}
            onOpenChange={() => toggleFamily(family.family_name)}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-2">
                  {expandedFamilies.has(family.family_name) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: family.family_color || '#888' }}
                  />
                  <span className="font-medium">{family.family_name}</span>
                  <Badge variant="secondary">{family.items.length}</Badge>
                </div>
                <span className="text-sm font-medium">
                  {formatCurrency(family.total_value)}
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-2 pl-6">
                {family.items.map(renderRequestCard)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  const renderStockTab = () => {
    if (isLoadingStock) {
      return (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }

    if (stockEntries.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Warehouse className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="font-medium">Nenhum insumo gerado</p>
          <p className="text-sm mt-1">Gere os suprimentos do planejamento primeiro para lançar o estoque.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-muted/30">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Itens no estoque</p>
              <p className="text-lg font-bold">{stockEntries.filter(e => e.quantity_in_stock > 0).length}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-green-700">Total em estoque</p>
              <p className="text-lg font-bold text-green-800">{totalInStock.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-yellow-700">A comprar (saldo)</p>
              <p className="text-lg font-bold text-yellow-800">{totalToPurchase.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Status banner */}
        {isConfirmed ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm font-medium">Estoque confirmado — descontos aplicados na lista de compras</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">Preencha as quantidades em estoque e salve para descontar da lista de compras. Mesmo que não haja estoque, o salvamento é obrigatório.</span>
          </div>
        )}

        {/* Stock table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left p-3 font-medium">Insumo</th>
                <th className="text-left p-3 font-medium">Família</th>
                <th className="text-right p-3 font-medium">Necessário</th>
                <th className="text-right p-3 font-medium w-36">Em Estoque</th>
                <th className="text-right p-3 font-medium">A Comprar</th>
              </tr>
            </thead>
            <tbody>
              {stockEntries.map((entry, idx) => (
                <tr key={entry.item_id} className={`border-b last:border-0 ${idx % 2 === 0 ? '' : 'bg-muted/20'}`}>
                  <td className="p-3">
                    <div className="font-medium">{entry.item_name}</div>
                    {entry.item_unit && <div className="text-xs text-muted-foreground">{entry.item_unit}</div>}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {entry.family_id && (
                        <div className="w-2 h-2 rounded-full bg-primary opacity-70" />
                      )}
                      <span className="text-muted-foreground text-xs">{entry.family_name || '—'}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono">
                    {entry.quantity_required.toFixed(2)}
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      min={0}
                      max={entry.quantity_required}
                      step={0.01}
                      value={entry.quantity_in_stock}
                      onChange={e => updateStockQuantity(entry.item_id, parseFloat(e.target.value) || 0)}
                      className="h-8 text-right font-mono w-full"
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={entry.quantity_to_purchase > 0 ? 'text-yellow-700 font-semibold' : 'text-green-700'}>
                      {entry.quantity_to_purchase.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Save button */}
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSaveStock} disabled={isSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {isSaving ? 'Salvando...' : isConfirmed ? 'Atualizar Estoque' : 'Salvar e Aplicar Desconto'}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const getTabCount = (status?: string) => {
    if (!status) return requests.length;
    return requests.filter(r => r.status === status).length;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-xl font-bold">Medição {measurement.measurement_number}</h2>
            </div>
            <p className="text-muted-foreground text-sm">
              {formatDateRange(measurement.start_date, measurement.end_date)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {canEdit && (
            <Button onClick={onGenerate}>
              <Package className="h-4 w-4 mr-2" />
              Gerar do Planejamento
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-yellow-700">Alertas</p>
                  <p className="text-xl font-bold text-yellow-900">{kpis.items_alert}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-700">Cotados</p>
                  <p className="text-xl font-bold text-blue-900">{kpis.items_quoted}</p>
                </div>
                <FileText className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-purple-700">Pedidos</p>
                  <p className="text-xl font-bold text-purple-900">{kpis.items_ordered}</p>
                </div>
                <ShoppingCart className="h-6 w-6 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-green-700">Entregues</p>
                  <p className="text-xl font-bold text-green-900">{kpis.items_delivered}</p>
                </div>
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardContent className="pt-4 pb-3">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{formatCurrency(kpis.total_value)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={kpis.percent_purchased} className="flex-1 h-1.5" />
                  <span className="text-xs">{kpis.percent_purchased}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Critical Alert */}
      {kpis && kpis.critical_items > 0 && (
        <Card className="bg-red-50 border-red-300">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">
                {kpis.critical_items} {kpis.critical_items === 1 ? 'item crítico precisa' : 'itens críticos precisam'} de atenção imediata
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Materiais da Medição</CardTitle>
          <CardDescription>
            Fluxo: Alerta → Cotação → Pedido → Entrega
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="all" className="flex items-center gap-1">
                <Package className="h-4 w-4" />
                Todos
                <Badge variant="secondary" className="ml-1">{getTabCount()}</Badge>
              </TabsTrigger>
              <TabsTrigger value="alert" className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Alertas
                {getTabCount('alert') > 0 && (
                  <Badge variant="destructive" className="ml-1">{getTabCount('alert')}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="quoted" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Cotações
              </TabsTrigger>
              <TabsTrigger value="ordered" className="flex items-center gap-1">
                <ShoppingCart className="h-4 w-4" />
                Pedidos
              </TabsTrigger>
              <TabsTrigger value="delivered" className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Entregues
              </TabsTrigger>
              <TabsTrigger value="stock" className="flex items-center gap-1">
                <Warehouse className="h-4 w-4" />
                Estoque
                {isConfirmed && (
                  <CheckCircle className="h-3 w-3 text-green-600 ml-1" />
                )}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[400px] mt-4">
              <TabsContent value="all" className="mt-0">
                {renderGroupedRequests()}
              </TabsContent>
              <TabsContent value="alert" className="mt-0">
                {renderGroupedRequests('alert')}
              </TabsContent>
              <TabsContent value="quoted" className="mt-0">
                {renderGroupedRequests('quoted')}
              </TabsContent>
              <TabsContent value="ordered" className="mt-0">
                {renderGroupedRequests('ordered')}
              </TabsContent>
              <TabsContent value="delivered" className="mt-0">
                {renderGroupedRequests('delivered')}
              </TabsContent>
              <TabsContent value="stock" className="mt-0">
                {renderStockTab()}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
