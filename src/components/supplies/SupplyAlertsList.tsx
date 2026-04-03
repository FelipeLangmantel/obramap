import { useState } from 'react';
import { Package, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Calendar, HardHat } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger as TabTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SupplyAlert, ALERT_STATUS_LABELS, ALERT_STATUS_COLORS, SupplyAlertStatus } from './types';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupplyAlertsListProps {
  alerts: SupplyAlert[];
  isLoading: boolean;
  canEdit: boolean;
  onUpdateStatus: (alertId: string, status: SupplyAlertStatus) => void;
}

export function SupplyAlertsList({ alerts, isLoading, canEdit, onUpdateStatus }: SupplyAlertsListProps) {
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const toggleExpanded = (id: string) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [activeSection, setActiveSection] = useState<'material' | 'labor'>('material');

  const filteredAlerts = alerts.filter(a => 
    filterStatus === 'all' || a.status === filterStatus
  );

  const materialAlerts = filteredAlerts.filter(a => !a.is_labor);
  const laborAlerts = filteredAlerts.filter(a => a.is_labor);

  const currentAlerts = activeSection === 'material' ? materialAlerts : laborAlerts;

  const groupedByStatus = {
    delayed: currentAlerts.filter(a => a.status === 'delayed'),
    pending: currentAlerts.filter(a => a.status === 'pending'),
    ordered: currentAlerts.filter(a => a.status === 'ordered'),
    delivered: currentAlerts.filter(a => a.status === 'delivered')
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getDaysUntilDue = (orderByDate: string) => {
    const days = differenceInDays(new Date(orderByDate), new Date());
    if (days < 0) return `${Math.abs(days)} dias atrasado`;
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Amanhã';
    return `em ${days} dias`;
  };

  const getUrgencyColor = (orderByDate: string, status: string) => {
    if (status === 'delivered') return 'text-green-600 dark:text-green-400';
    if (status === 'delayed' || isPast(new Date(orderByDate))) return 'text-red-600 dark:text-red-400';
    const days = differenceInDays(new Date(orderByDate), new Date());
    if (days <= 3) return 'text-orange-600 dark:text-orange-400';
    if (days <= 7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  };

  const renderAlertCard = (alert: SupplyAlert) => {
    const isExpanded = expandedAlerts.has(alert.id);
    const urgencyColor = getUrgencyColor(alert.order_by_date, alert.status);
    
    return (
      <Card key={alert.id} className="mb-2">
        <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(alert.id)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" className="p-0 h-auto">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: alert.family?.color || '#9ca3af' }}
                  />
                  <div>
                    <span className="font-medium">
                      {alert.family?.name || 'Família não definida'}
                    </span>
                    {alert.measurement && (
                      <span className="text-xs text-muted-foreground ml-2">
                        Medição {alert.measurement.measurement_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`text-sm ${urgencyColor}`}>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {getDaysUntilDue(alert.order_by_date)}
                    </span>
                  </div>
                  <Badge className={ALERT_STATUS_COLORS[alert.status]}>
                    {ALERT_STATUS_LABELS[alert.status]}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Data de Execução:</span>
                    <span>{formatDate(alert.required_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pedir até:</span>
                    <span className={urgencyColor}>{formatDate(alert.order_by_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quantidade:</span>
                    <span>{alert.total_quantity.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor Estimado:</span>
                    <span className="font-medium">{formatCurrency(alert.total_value)}</span>
                  </div>
                </div>
                
                {canEdit && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Alterar Status:</label>
                    <Select 
                      value={alert.status} 
                      onValueChange={(value) => onUpdateStatus(alert.id, value as SupplyAlertStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="ordered">Pedido Realizado</SelectItem>
                        <SelectItem value="delivered">Entregue</SelectItem>
                        <SelectItem value="delayed">Atrasado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {alert.notes && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="text-sm">{alert.notes}</p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-2">Carregando alertas...</p>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium">Nenhuma compra pendente no momento</h3>
          <p className="text-muted-foreground mt-2">
            Os alertas serão gerados automaticamente quando houver planejamento de produção.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-medium">Alertas de Compra</h3>
        <div className="flex items-center gap-2">
          <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as 'material' | 'labor')}>
            <TabsList className="h-8">
              <TabTrigger value="material" className="text-xs gap-1">
                <Package className="h-3 w-3" />
                Materiais ({materialAlerts.length})
              </TabTrigger>
              <TabTrigger value="labor" className="text-xs gap-1">
                <HardHat className="h-3 w-3" />
                Mão de Obra ({laborAlerts.length})
              </TabTrigger>
            </TabsList>
          </Tabs>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="delayed">Atrasados</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="ordered">Em Pedido</SelectItem>
              <SelectItem value="delivered">Entregues</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeSection === 'labor' && laborAlerts.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border border-border">
          <HardHat className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">
            Mão de obra e equipamentos são gerenciados via contratos de empreiteiros.
          </span>
          <Button variant="outline" size="sm" className="text-xs" asChild>
            <a href="/contractors">Ver Contratos</a>
          </Button>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-400px)]">
        {/* Atrasados primeiro */}
        {groupedByStatus.delayed.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-red-600 dark:text-red-400">Atrasados ({groupedByStatus.delayed.length})</span>
            </div>
            {groupedByStatus.delayed.map(renderAlertCard)}
          </div>
        )}

        {/* Pendentes */}
        {groupedByStatus.pending.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="font-medium text-yellow-600 dark:text-yellow-400">Pendentes ({groupedByStatus.pending.length})</span>
            </div>
            {groupedByStatus.pending.map(renderAlertCard)}
          </div>
        )}

        {/* Em Pedido */}
        {groupedByStatus.ordered.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">Em Pedido ({groupedByStatus.ordered.length})</span>
            </div>
            {groupedByStatus.ordered.map(renderAlertCard)}
          </div>
        )}

        {/* Entregues */}
        {groupedByStatus.delivered.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="font-medium text-green-600 dark:text-green-400">Entregues ({groupedByStatus.delivered.length})</span>
            </div>
            {groupedByStatus.delivered.map(renderAlertCard)}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
