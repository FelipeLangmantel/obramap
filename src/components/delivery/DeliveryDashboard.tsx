import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  AlertTriangle, 
  Clock, 
  CheckCircle2,
  BarChart3
} from "lucide-react";

interface DeliveryDashboardProps {
  inspections: any[];
  issues: any[];
}

export const DeliveryDashboard: React.FC<DeliveryDashboardProps> = ({
  inspections,
  issues
}) => {
  const totalDelivered = inspections.filter(i => 
    ['entregue_sem_pendencias', 'entregue_com_pendencias', 'unidade_encerrada'].includes(i.status)
  ).length;

  const withOpenIssues = inspections.filter(i => 
    i.status === 'entregue_com_pendencias' || i.status === 'pos_obra_em_atendimento'
  ).length;

  const openIssues = issues.filter(i => i.status !== 'encerrada');
  
  // Calculate average resolution time (in days)
  const resolvedIssues = issues.filter(i => i.status === 'encerrada' && i.resolved_at);
  const avgResolutionDays = resolvedIssues.length > 0
    ? Math.round(resolvedIssues.reduce((acc, issue) => {
        const created = new Date(issue.created_at);
        const resolved = new Date(issue.resolved_at);
        return acc + (resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      }, 0) / resolvedIssues.length)
    : 0;

  // Issues by category
  const issuesByCategory = openIssues.reduce((acc, issue) => {
    acc[issue.category] = (acc[issue.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Issues by responsible
  const issuesByResponsible = openIssues.reduce((acc, issue) => {
    const name = issue.responsible_name || 'Não atribuído';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusLabels: Record<string, { label: string; color: string }> = {
    em_vistoria: { label: 'Em Vistoria', color: 'bg-blue-500' },
    entrega_agendada: { label: 'Entrega Agendada', color: 'bg-purple-500' },
    entregue_sem_pendencias: { label: 'Entregue s/ Pendências', color: 'bg-green-500' },
    entregue_com_pendencias: { label: 'Entregue c/ Pendências', color: 'bg-amber-500' },
    pos_obra_em_atendimento: { label: 'Pós-Obra em Atendimento', color: 'bg-orange-500' },
    unidade_encerrada: { label: 'Unidade Encerrada', color: 'bg-emerald-600' }
  };

  const statusCounts = inspections.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Home className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Entregues</p>
                <p className="text-2xl font-bold">{totalDelivered}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Com Pendências Abertas</p>
                <p className="text-2xl font-bold">{withOpenIssues}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio Resolução</p>
                <p className="text-2xl font-bold">{avgResolutionDays} dias</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendências Abertas</p>
                <p className="text-2xl font-bold">{openIssues.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Status das Unidades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusLabels).map(([status, { label, color }]) => (
              <div key={status} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-sm">{label}</span>
                <Badge variant="secondary">{statusCounts[status] || 0}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Issues by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Pendências por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(issuesByCategory).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(issuesByCategory)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between">
                      <span className="text-sm">{category}</span>
                      <Badge variant="outline">{count as number}</Badge>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma pendência aberta</p>
            )}
          </CardContent>
        </Card>

        {/* Issues by Responsible */}
        <Card>
          <CardHeader>
            <CardTitle>Pendências por Responsável</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(issuesByResponsible).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(issuesByResponsible)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([responsible, count]) => (
                    <div key={responsible} className="flex items-center justify-between">
                      <span className="text-sm">{responsible}</span>
                      <Badge variant="outline">{count as number}</Badge>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma pendência aberta</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
