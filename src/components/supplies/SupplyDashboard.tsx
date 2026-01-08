import { Package, Clock, AlertTriangle, CheckCircle2, Truck, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SupplyKPIs, ALERT_STATUS_COLORS } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupplyDashboardProps {
  kpis: SupplyKPIs;
  isLoading: boolean;
}

export function SupplyDashboard({ kpis, isLoading }: SupplyDashboardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Compras Pendentes */}
      <Card className="border-l-4 border-l-yellow-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Compras Pendentes
          </CardTitle>
          <Package className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? '-' : kpis.pendingAlerts}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Próxima: {formatDate(kpis.nextOrderDate)}
            </span>
          </div>
          {kpis.totalPendingValue > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {formatCurrency(kpis.totalPendingValue)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atrasos */}
      <Card className="border-l-4 border-l-red-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Atrasos
          </CardTitle>
          <AlertTriangle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? '-' : kpis.delayedAlerts}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Média: {kpis.avgDelayDays} dias
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Em Pedido */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Em Pedido
          </CardTitle>
          <Truck className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? '-' : kpis.orderedAlerts}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">
              Aguardando entrega
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Performance Logística */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Performance
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? '-' : `${kpis.onTimeDeliveryRate}%`}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Entregas no prazo
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">
              {kpis.deliveredAlerts} entregas realizadas
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
