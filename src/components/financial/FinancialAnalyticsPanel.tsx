import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Wallet,
  PieChart
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

interface FinancialEntry {
  id: string;
  category: string;
  description: string;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: string;
}

interface FinancialAnalyticsPanelProps {
  entries: FinancialEntry[];
  categories: string[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function FinancialAnalyticsPanel({ entries, categories }: FinancialAnalyticsPanelProps) {
  const today = new Date();
  const currentMonthStart = startOfMonth(today);
  const currentMonthEnd = endOfMonth(today);
  
  // Calculate totals
  const totalPending = entries
    .filter(e => e.status === 'pending')
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const totalPaid = entries
    .filter(e => e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const totalOverdue = entries
    .filter(e => e.status === 'overdue')
    .reduce((sum, e) => sum + Number(e.amount), 0);
    
  const totalAll = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  
  // Current month totals
  const currentMonthEntries = entries.filter(e => {
    const dueDate = parseISO(e.due_date);
    return isWithinInterval(dueDate, { start: currentMonthStart, end: currentMonthEnd });
  });
  
  const currentMonthTotal = currentMonthEntries.reduce((sum, e) => sum + Number(e.amount), 0);
  const currentMonthPaid = currentMonthEntries
    .filter(e => e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.amount), 0);
  
  // Category breakdown
  const categoryData = categories.map(cat => ({
    name: cat.length > 15 ? cat.substring(0, 15) + '...' : cat,
    fullName: cat,
    value: entries.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount), 0),
    pending: entries.filter(e => e.category === cat && e.status === 'pending').reduce((sum, e) => sum + Number(e.amount), 0),
    paid: entries.filter(e => e.category === cat && e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0)
  })).filter(c => c.value > 0);
  
  // Monthly trend (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = subMonths(today, 5 - i);
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    
    const monthEntries = entries.filter(e => {
      const dueDate = parseISO(e.due_date);
      return isWithinInterval(dueDate, { start: monthStart, end: monthEnd });
    });
    
    return {
      month: format(month, 'MMM', { locale: ptBR }),
      total: monthEntries.reduce((sum, e) => sum + Number(e.amount), 0),
      paid: monthEntries.filter(e => e.status === 'paid').reduce((sum, e) => sum + Number(e.amount), 0),
      pending: monthEntries.filter(e => e.status !== 'paid').reduce((sum, e) => sum + Number(e.amount), 0)
    };
  });
  
  // Status distribution for pie chart
  const statusData = [
    { name: 'Pago', value: totalPaid, color: '#22c55e' },
    { name: 'Pendente', value: totalPending, color: '#eab308' },
    { name: 'Atrasado', value: totalOverdue, color: '#ef4444' }
  ].filter(s => s.value > 0);
  
  // Calculate percentages
  const paidPercentage = totalAll > 0 ? ((totalPaid / totalAll) * 100).toFixed(1) : '0';
  const pendingPercentage = totalAll > 0 ? ((totalPending / totalAll) * 100).toFixed(1) : '0';
  
  const formatCurrency = (value: number) => 
    `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold flex items-center gap-2">
        <PieChart className="h-5 w-5" />
        Análise Financeira
      </h3>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                {paidPercentage}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Total Pago</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Clock className="h-8 w-8 text-yellow-500" />
              <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">
                {pendingPercentage}%
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Pendente</p>
            <p className="text-xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <Badge variant="destructive">Atenção</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Atrasado</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Wallet className="h-8 w-8 text-primary" />
              <Badge variant="outline">Total</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Total Geral</p>
            <p className="text-xl font-bold">{formatCurrency(totalAll)}</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Current Month Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Mês Atual - {format(today, 'MMMM yyyy', { locale: ptBR })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{formatCurrency(currentMonthTotal)}</p>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(currentMonthPaid)} pago de {formatCurrency(currentMonthTotal)}
              </p>
            </div>
            <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${currentMonthTotal > 0 ? (currentMonthPaid / currentMonthTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Evolução Mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis 
                    className="text-xs" 
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="paid" name="Pago" fill="#22c55e" stackId="a" />
                  <Bar dataKey="pending" name="Pendente" fill="#eab308" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </RePieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Category Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gastos por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryData.map((cat, i) => (
              <div key={cat.fullName} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1" title={cat.fullName}>{cat.fullName}</span>
                  <span className="font-medium ml-2">{formatCurrency(cat.value)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${totalAll > 0 ? (cat.value / totalAll) * 100 : 0}%`,
                      backgroundColor: COLORS[i % COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
