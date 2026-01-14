import { useState } from 'react';
import { Package, RefreshCw, AlertTriangle, FileText, ShoppingCart, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSupplyRequests, SupplyRequest, SupplyRequestStatus } from './hooks/useSupplyRequests';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TabType = 'alerts' | 'quoted' | 'ordered' | 'delivered';

export function SupplyRequestsView() {
  const { currentProject } = useConstruction();
  const { canEdit } = useAuth();
  const projectId = currentProject?.id;
  
  const [activeTab, setActiveTab] = useState<TabType>('alerts');
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const {
    isLoading,
    kpis,
    loadRequests,
    transitionStatus,
    generateFromPlanning,
    getAlerts,
    getQuoted,
    getOrdered,
    getDelivered,
    getGroupedByFamily,
    STATUS_LABELS,
  } = useSupplyRequests(projectId);

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

  const getStatusColor = (status: SupplyRequestStatus) => {
    switch (status) {
      case 'alert': return 'bg-yellow-500';
      case 'quoted': return 'bg-blue-500';
      case 'ordered': return 'bg-purple-500';
      case 'delivered': return 'bg-green-500';
      case 'cancelled': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getNextAction = (status: SupplyRequestStatus): { label: string; nextStatus: SupplyRequestStatus } | null => {
    switch (status) {
      case 'alert': return { label: 'Cotar', nextStatus: 'quoted' };
      case 'quoted': return { label: 'Pedir', nextStatus: 'ordered' };
      case 'ordered': return { label: 'Entregar', nextStatus: 'delivered' };
      default: return null;
    }
  };

  const handleTransition = async (request: SupplyRequest, newStatus: SupplyRequestStatus) => {
    await transitionStatus(request.id, newStatus);
  };

  const handleCancel = async (request: SupplyRequest) => {
    if (request.status === 'ordered' || request.status === 'delivered') {
      return; // Cannot cancel ordered or delivered
    }
    await transitionStatus(request.id, 'cancelled', 'Cancelado pelo usuário');
  };

  const renderRequestCard = (request: SupplyRequest) => {
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
              {request.quantity} {request.item_unit} • {formatCurrency(request.total_value)}
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
                  className="text-red-500 hover:text-red-700"
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

  const renderGroupedRequests = (status: SupplyRequestStatus) => {
    const grouped = getGroupedByFamily(status);
    const families = Object.values(grouped);

    if (families.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma requisição {STATUS_LABELS[status].toLowerCase()}</p>
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

  if (!projectId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Selecione uma Obra</h3>
          <p className="text-muted-foreground mt-2">
            Escolha uma obra para visualizar o painel de suprimentos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Suprimentos</h2>
          <p className="text-muted-foreground">
            Controle de requisições e compras
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => loadRequests()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {canEdit && (
            <Button onClick={() => generateFromPlanning()}>
              <Package className="h-4 w-4 mr-2" />
              Gerar do Planejamento
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-700">Alertas</p>
                <p className="text-2xl font-bold text-yellow-900">{kpis.alerts}</p>
                <p className="text-xs text-yellow-600">{formatCurrency(kpis.total_pending_value)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Cotados</p>
                <p className="text-2xl font-bold text-blue-900">{kpis.quoted}</p>
                <p className="text-xs text-blue-600">{formatCurrency(kpis.total_quoted_value)}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700">Pedidos</p>
                <p className="text-2xl font-bold text-purple-900">{kpis.ordered}</p>
                <p className="text-xs text-purple-600">{formatCurrency(kpis.total_ordered_value)}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Entregues</p>
                <p className="text-2xl font-bold text-green-900">{kpis.delivered}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {kpis.critical > 0 && (
        <Card className="bg-red-50 border-red-300">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">
                {kpis.critical} {kpis.critical === 1 ? 'item crítico precisa' : 'itens críticos precisam'} de atenção imediata
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Requisições</CardTitle>
          <CardDescription>
            Gerencie o fluxo de compras: Alerta → Cotação → Pedido → Entrega
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="alerts" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alertas
                {kpis.alerts > 0 && (
                  <Badge variant="destructive" className="ml-1">{kpis.alerts}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="quoted" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Cotações
                {kpis.quoted > 0 && (
                  <Badge variant="secondary" className="ml-1">{kpis.quoted}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="ordered" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Pedidos
                {kpis.ordered > 0 && (
                  <Badge variant="secondary" className="ml-1">{kpis.ordered}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivered" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Entregues
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px] mt-4">
              <TabsContent value="alerts" className="mt-0">
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
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
