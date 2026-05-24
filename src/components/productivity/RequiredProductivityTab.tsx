import { Info, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductivityDecisionSimulator } from './ProductivityDecisionSimulator';

type RequiredProductivityStatus =
  | 'ok'
  | 'attention'
  | 'below_required'
  | 'missing_registered'
  | 'missing_real'
  | 'missing_planning';

type RecommendedProductivityActionType =
  | 'register_productivity'
  | 'collect_real_data'
  | 'keep_team'
  | 'review_registered_productivity'
  | 'increase_team'
  | 'redistribute_targets'
  | 'extend_deadline'
  | 'review_planning';

type RecommendedProductivityPriority = 'Alta' | 'Media' | 'Baixa';

interface ServiceLabel {
  scopeId: string;
  scopeName: string;
  macroName: string;
}

interface RequiredProductivityRowView {
  service: ServiceLabel;
  frontName: string | null;
  registeredLabel: string;
  registeredProductivity: number | null;
  realProductivity: number | null;
  requiredProductivity: number | null;
  plannedDemand: number | null;
  planningDays: number | null;
  capacityPerTeam: number | null;
  diffRegisteredPercent: number | null;
  diffRealPercent: number | null;
  status: RequiredProductivityStatus;
  recommendation: string;
}

interface RecommendedProductivityActionView {
  id: string;
  service: ServiceLabel;
  frontName: string | null;
  status: RequiredProductivityStatus;
  diffPercent: number | null;
  actionType: RecommendedProductivityActionType;
  actionLabel: string;
  priority: RecommendedProductivityPriority;
  justification: string;
}

interface RequiredProductivityTabProps {
  summary: {
    analyzed: number;
    ok: number;
    below: number;
    missingRegistered: number;
    missingReal: number;
  };
  requiredFilter: 'all' | RequiredProductivityStatus;
  onRequiredFilterChange: (value: 'all' | RequiredProductivityStatus) => void;
  frontFilter: string;
  onFrontFilterChange: (value: string) => void;
  frontOptions: string[];
  loading: boolean;
  rows: RequiredProductivityRowView[];
  simulatorRows: RequiredProductivityRowView[];
  actionSummary: {
    high: number;
    register: number;
    collect: number;
    keep: number;
    reviewPlanning: number;
  };
  actionFilter: 'all' | 'high' | RecommendedProductivityActionType;
  onActionFilterChange: (value: 'all' | 'high' | RecommendedProductivityActionType) => void;
  actions: RecommendedProductivityActionView[];
  formatNumber: (value: number | null | undefined, digits?: number) => string;
}

const REQUIRED_STATUS_LABELS: Record<RequiredProductivityStatus, string> = {
  ok: 'OK',
  attention: 'Atencao',
  below_required: 'Abaixo do necessario',
  missing_registered: 'Sem produtividade cadastrada',
  missing_real: 'Sem dados reais',
  missing_planning: 'Sem planejamento suficiente',
};

const requiredStatusVariant = (status: RequiredProductivityStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'below_required') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

const priorityVariant = (priority: RecommendedProductivityPriority): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (priority === 'Alta') return 'destructive';
  if (priority === 'Media') return 'secondary';
  return 'outline';
};

export function RequiredProductivityTab({
  summary,
  requiredFilter,
  onRequiredFilterChange,
  frontFilter,
  onFrontFilterChange,
  frontOptions,
  loading,
  rows,
  simulatorRows,
  actionSummary,
  actionFilter,
  onActionFilterChange,
  actions,
  formatNumber,
}: RequiredProductivityTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
              Produtividade necessaria
            </CardTitle>
            <CardDescription>
              Compara produtividade necessaria, cadastrada e real sem alterar produtividade, producao, diario,
              medicao, planejamento ou equipes.
            </CardDescription>
          </div>
          <Badge variant="outline" className="w-fit gap-1">
            <Info className="h-3 w-3" />
            Somente leitura
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ['Servicos analisados', summary.analyzed],
            ['Servicos OK', summary.ok],
            ['Abaixo/atencao', summary.below],
            ['Sem produtividade', summary.missingRegistered],
            ['Sem dados reais', summary.missingReal],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Este diagnostico e apenas leitura. Ele nao altera produtividade, producao, diario, medicao,
          planejamento, equipes, Gantt, Linha de Balanco, Semanal ou Previsao oficial.
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="required-productivity-status">
              Status
            </label>
            <select
              id="required-productivity-status"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={requiredFilter}
              onChange={(event) => onRequiredFilterChange(event.target.value as 'all' | RequiredProductivityStatus)}
            >
              <option value="all">Todos</option>
              <option value="below_required">Abaixo do necessario</option>
              <option value="attention">Atencao</option>
              <option value="missing_registered">Sem produtividade</option>
              <option value="missing_real">Sem dados reais</option>
              <option value="missing_planning">Sem planejamento</option>
              <option value="ok">OK</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="required-productivity-front">
              Frente
            </label>
            <select
              id="required-productivity-front"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={frontFilter}
              onChange={(event) => onFrontFilterChange(event.target.value)}
            >
              <option value="all">Todas</option>
              {frontOptions.map((frontName) => (
                <option key={frontName} value={frontName}>{frontName}</option>
              ))}
            </select>
          </div>
          {loading && (
            <div className="pb-2 text-sm text-muted-foreground">Carregando fontes de produtividade real...</div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-base font-semibold">Acoes recomendadas</h3>
              <p className="text-sm text-muted-foreground">
                Recomendacoes praticas geradas a partir da produtividade necessaria, cadastrada e real.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">Diagnostico local</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['Alta prioridade', actionSummary.high],
              ['Precisam produtividade', actionSummary.register],
              ['Precisam dados reais', actionSummary.collect],
              ['Equipe adequada', actionSummary.keep],
              ['Revisar planejamento', actionSummary.reviewPlanning],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            Estas acoes sao recomendacoes de diagnostico. Elas nao alteram produtividade, equipes, metas,
            producao, diario, medicao ou planejamento oficial.
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="recommended-action-filter">
              Filtrar acoes
            </label>
            <select
              id="recommended-action-filter"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={actionFilter}
              onChange={(event) => onActionFilterChange(event.target.value as 'all' | 'high' | RecommendedProductivityActionType)}
            >
              <option value="all">Todas</option>
              <option value="high">Alta prioridade</option>
              <option value="register_productivity">Cadastrar produtividade</option>
              <option value="increase_team">Aumentar equipe</option>
              <option value="collect_real_data">Coletar dados reais</option>
              <option value="keep_team">Manter equipe</option>
              <option value="review_planning">Revisar planejamento</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Prioridade</th>
                  <th className="p-2">Servico</th>
                  <th className="p-2">Frente</th>
                  <th className="p-2">Acao recomendada</th>
                  <th className="p-2">Justificativa</th>
                  <th className="p-2">Diferenca</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action.id} className="border-b last:border-0">
                    <td className="p-2">
                      <Badge variant={priorityVariant(action.priority)}>{action.priority}</Badge>
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{action.service.scopeName || 'Servico sem nome'}</div>
                      <div className="text-xs text-muted-foreground">{action.service.macroName || 'Etapa nao informada'}</div>
                    </td>
                    <td className="p-2">{action.frontName ?? 'Sem frente'}</td>
                    <td className="p-2 font-medium">{action.actionLabel}</td>
                    <td className="p-2">{action.justification}</td>
                    <td className="p-2">
                      {action.diffPercent === null ? '-' : `${formatNumber(action.diffPercent, 1)}%`}
                    </td>
                    <td className="p-2">
                      <Badge variant={requiredStatusVariant(action.status)}>
                        {REQUIRED_STATUS_LABELS[action.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {actions.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                      Nenhuma acao encontrada para o filtro selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ProductivityDecisionSimulator rows={simulatorRows} formatNumber={formatNumber} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Servico</th>
                <th className="p-2">Frente</th>
                <th className="p-2">Necessaria</th>
                <th className="p-2">Cadastrada</th>
                <th className="p-2">Real</th>
                <th className="p-2">Dif. cadastrada</th>
                <th className="p-2">Dif. real</th>
                <th className="p-2">Status</th>
                <th className="p-2">Recomendacao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.service.scopeId} className="border-b last:border-0">
                  <td className="p-2">
                    <div className="font-medium">{row.service.scopeName}</div>
                    <div className="text-xs text-muted-foreground">{row.service.macroName}</div>
                  </td>
                  <td className="p-2">{row.frontName ?? 'Sem frente'}</td>
                  <td className="p-2">
                    {row.requiredProductivity === null ? 'Sem planejamento suficiente' : `${formatNumber(row.requiredProductivity, 2)}/dia`}
                  </td>
                  <td className="p-2">{row.registeredLabel}</td>
                  <td className="p-2">
                    {row.realProductivity === null ? 'Sem dados reais' : `${formatNumber(row.realProductivity, 2)}/dia`}
                  </td>
                  <td className="p-2">
                    {row.diffRegisteredPercent === null ? '-' : `${formatNumber(row.diffRegisteredPercent, 1)}%`}
                  </td>
                  <td className="p-2">
                    {row.diffRealPercent === null ? '-' : `${formatNumber(row.diffRealPercent, 1)}%`}
                  </td>
                  <td className="p-2">
                    <Badge variant={requiredStatusVariant(row.status)}>
                      {REQUIRED_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="p-2">{row.recommendation}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={9}>
                    Nenhum servico encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {summary.analyzed === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Sem planejamento suficiente para calcular produtividade necessaria. Revise metas semanais ou planejamento por periodo.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
