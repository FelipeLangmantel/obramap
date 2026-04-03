import { Package, Clock, AlertTriangle, CheckCircle2, Truck, TrendingUp, DollarSign, Calendar, XCircle, Pause } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupplyKPIs } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SupplyDashboardProps {
  kpis: SupplyKPIs | null;
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

  if (!kpis && !isLoading) {
    return (
      <div className="text-center text-muted-foreground py-4">
        Sem dados disponíveis
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Pedidos Atrasados */}
      <Card className="border-l-4 border-l-red-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pedidos Atrasados
          </CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {isLoading ? '-' : kpis?.delayed_orders || 0}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Média: {kpis?.avg_delay_days || 0} dias
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Entregas no Prazo */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Entregas no Prazo
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {isLoading ? '-' : kpis?.on_time_delivered || 0}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Atrasadas: {kpis?.late_delivered || 0}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Compras Críticas */}
      <Card className="border-l-4 border-l-orange-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Compras Críticas
          </CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {isLoading ? '-' : kpis?.critical_purchases || 0}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Próxima: {formatDate(kpis?.next_order_date || null)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Produção Parada */}
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Produção Parada
          </CardTitle>
          <Pause className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600">
            {isLoading ? '-' : kpis?.production_stopped || 0}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Package className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Sem pedido: {kpis?.planned_without_order || 0}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Valor Total Pendente - Full Width */}
      <Card className="border-l-4 border-l-blue-500 md:col-span-2 lg:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Valor Total de Compras Pendentes
          </CardTitle>
          <DollarSign className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">
            {isLoading ? '-' : formatCurrency(kpis?.total_pending_value || 0)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
