import { ClipboardList, Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Priority = 'Alta' | 'Media' | 'Baixa';

interface ExecutiveAction {
  id: string;
  service: {
    scopeName: string;
  };
  frontName: string | null;
  actionLabel: string;
  priority: Priority;
  justification: string;
}

interface ProductivityExecutiveSummaryProps {
  cards: Array<[string, number]>;
  topActions: ExecutiveAction[];
  additionalPeople: number;
}

const priorityVariant = (priority: Priority): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (priority === 'Alta') return 'destructive';
  if (priority === 'Media') return 'secondary';
  return 'outline';
};

export function ProductivityExecutiveSummary({
  cards,
  topActions,
  additionalPeople,
}: ProductivityExecutiveSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Resumo executivo de produtividade
            </CardTitle>
            <CardDescription>
              Leitura rapida das produtividades, frentes e acoes que precisam de decisao operacional.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit gap-1">
            <Info className="h-3 w-3" />
            Diagnostico
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Prioridades de acao</h3>
                <p className="text-sm text-muted-foreground">As 5 recomendacoes mais urgentes para revisar agora.</p>
              </div>
              {additionalPeople > 0 && (
                <Badge variant="secondary">{additionalPeople} pessoa(s) adicionais estimadas</Badge>
              )}
            </div>
            <div className="space-y-3">
              {topActions.map((action) => (
                <div key={action.id} className="rounded-md border bg-background p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-medium">{action.service.scopeName || 'Servico sem nome'}</div>
                      <div className="text-xs text-muted-foreground">
                        {action.frontName ? `Frente: ${action.frontName}` : 'Sem frente vinculada'}
                      </div>
                    </div>
                    <Badge variant={priorityVariant(action.priority)}>{action.priority}</Badge>
                  </div>
                  <div className="mt-2 text-sm font-medium">{action.actionLabel}</div>
                  <div className="text-xs text-muted-foreground">{action.justification}</div>
                </div>
              ))}
              {topActions.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Nenhuma acao recomendada disponivel. Cadastre planejamento e produtividade para gerar diagnosticos.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Proximos passos sugeridos</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Cadastrar produtividade dos servicos sem parametro.</li>
              <li>Revisar frentes com sobrecarga.</li>
              <li>Comparar produtividade real com produtividade necessaria.</li>
              <li>Redistribuir metas semanais quando houver sobrecarga.</li>
              <li>Usar o simulador de capacidade antes de alterar equipes.</li>
            </ul>
            <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Este resumo e diagnostico. Nao altera produtividade, equipes, metas, producao, diario, medicao ou planejamento oficial.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
