import { useState, useMemo } from 'react';
import { useConstruction } from '@/contexts/ConstructionContext';
import { useServiceProductivity } from '@/hooks/useServiceProductivity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Settings,
  Users,
  TrendingUp,
  AlertCircle,
  ClipboardList,
  GitBranch,
  Layers,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { ServiceProductivityDialog } from './ServiceProductivityDialog';
import type { ServiceProductivity } from '@/hooks/useServiceProductivity';

interface ServiceInfo {
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
  macroColor: string;
}

type SuggestedServiceType =
  | 'physical_repetitive'
  | 'physical_one_time'
  | 'administrative_cost'
  | 'support_service'
  | 'milestone'
  | 'undefined';

interface ServiceCapacityInsight {
  service: ServiceInfo;
  productivity?: ServiceProductivity;
  type: SuggestedServiceType;
  isConfigured: boolean;
  planningSuggestion: {
    gantt: string;
    lineOfBalance: string;
    weeklyPlanning: string;
  };
}

interface SuggestedTeamGroup {
  id: string;
  title: string;
  services: ServiceCapacityInsight[];
  reasons: string[];
  hasDuplicatedCapacityRisk: boolean;
}

const TYPE_LABELS: Record<SuggestedServiceType, string> = {
  physical_repetitive: 'Fisico repetitivo',
  physical_one_time: 'Fisico pontual',
  administrative_cost: 'Administrativo/custo',
  support_service: 'Apoio/controle',
  milestone: 'Marco',
  undefined: 'Indefinido',
};

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const hasAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

const classifyService = (service: ServiceInfo): SuggestedServiceType => {
  const text = normalizeText(`${service.macroName} ${service.scopeName}`);

  if (
    hasAny(text, [
      'adm de obra',
      'administracao',
      'administrativo',
      'engenheiro',
      'mestre',
      'canteiro',
      'instalacoes provisoria',
      'mobilizacao',
      'desmobilizacao',
    ])
  ) {
    return 'administrative_cost';
  }

  if (
    hasAny(text, [
      'ensaio',
      'resistencia',
      'compressao',
      'controle tecnologico',
      'laudo',
      'teste',
      'topografia',
      'projeto',
      'documentacao',
    ])
  ) {
    return 'support_service';
  }

  if (hasAny(text, ['marco', 'vistoria', 'entrega', 'habite se', 'medicao final'])) {
    return 'milestone';
  }

  if (
    hasAny(text, [
      'radier',
      'parede',
      'piso',
      'laje',
      'oitao',
      'telhado',
      'telhamento',
      'cobertura',
      'pintura',
      'esquadria',
      'porta',
      'janela',
      'prumada',
      'barrilete',
      'caixa d agua',
      'agua',
      'esgoto',
      'revestimento',
      'fundacao',
      'concretagem',
      'graute',
      'pre mold',
      'premold',
      'moldad',
    ])
  ) {
    return 'physical_repetitive';
  }

  if (hasAny(text, ['terraplenagem', 'limpeza', 'locacao', 'infraestrutura', 'rede'])) {
    return 'physical_one_time';
  }

  return 'undefined';
};

const getPlanningSuggestion = (type: SuggestedServiceType) => {
  switch (type) {
    case 'physical_repetitive':
      return { gantt: 'Sim', lineOfBalance: 'Sim', weeklyPlanning: 'Valida capacidade' };
    case 'physical_one_time':
      return { gantt: 'Sim', lineOfBalance: 'Opcional', weeklyPlanning: 'Meta por servico' };
    case 'administrative_cost':
      return { gantt: 'Opcional', lineOfBalance: 'Nao', weeklyPlanning: 'Nao lancar como grupo' };
    case 'support_service':
      return { gantt: 'Opcional/marco', lineOfBalance: 'Nao', weeklyPlanning: 'Opcional por servico' };
    case 'milestone':
      return { gantt: 'Marco', lineOfBalance: 'Nao', weeklyPlanning: 'Nao lancar como grupo' };
    default:
      return { gantt: 'Revisar', lineOfBalance: 'Revisar', weeklyPlanning: 'Revisar' };
  }
};

const getGroupToken = (service: ServiceInfo) => {
  const text = normalizeText(`${service.macroName} ${service.scopeName}`);
  const groups = [
    {
      id: 'pre_moldado',
      title: 'Montagem Pre-Moldado',
      terms: ['pre mold', 'premold', 'moldad', 'oitao', 'laje pre', 'parede pre'],
    },
    {
      id: 'cobertura',
      title: 'Cobertura',
      terms: ['telhado', 'telhamento', 'cobertura'],
    },
    {
      id: 'esquadrias',
      title: 'Esquadrias',
      terms: ['esquadria', 'janela', 'porta', 'vidro', 'aluminio'],
    },
    {
      id: 'hidraulica',
      title: 'Hidraulica e prumadas',
      terms: ['prumada', 'barrilete', 'caixa d agua', 'agua fria', 'agua quente', 'esgoto'],
    },
    {
      id: 'fundacao',
      title: 'Fundacao',
      terms: ['radier', 'fundacao', 'concretagem'],
    },
    {
      id: 'pintura',
      title: 'Pintura',
      terms: ['pintura', 'emassamento', 'massa corrida', 'textura'],
    },
  ];

  return groups.find((group) => hasAny(text, group.terms)) || null;
};

const normalizeUnit = (productivity?: ServiceProductivity) =>
  normalizeText(productivity?.productivity_unit)
    .replace(/\bpor\b/g, '')
    .replace(/\bdia\b/g, '')
    .replace(/\bsemana\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const dailyProductivity = (productivity?: ServiceProductivity) => {
  if (!productivity?.productivity_value) return null;
  const unit = normalizeText(productivity.productivity_unit);
  const value = Number(productivity.productivity_value) || 0;
  if (!value) return null;
  if (unit.includes('semana')) {
    return value / Math.max(Number(productivity.working_days_per_week) || 5, 1);
  }
  return value;
};

const hasSimilarProductivity = (items: ServiceCapacityInsight[]) => {
  const values = items
    .map((item) => dailyProductivity(item.productivity))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min > 0 && max / min <= 1.35;
};

const hasCompatibleComposition = (items: ServiceCapacityInsight[]) => {
  const signatures = items
    .filter((item) => item.productivity)
    .map((item) => {
      const productivity = item.productivity!;
      const roles = (productivity.team_composition || [])
        .map((role) => `${normalizeText(role.role_name)}:${role.role_type}:${role.quantity}`)
        .sort()
        .join('|');
      return [
        productivity.professionals_per_team,
        productivity.helpers_per_team,
        productivity.default_team_count,
        roles,
      ].join(':');
    });
  return signatures.length >= 2 && new Set(signatures).size === 1;
};

const buildSuggestedTeamGroups = (insights: ServiceCapacityInsight[]): SuggestedTeamGroup[] => {
  const grouped = new Map<string, { tokenTitle: string; items: ServiceCapacityInsight[] }>();

  insights
    .filter((insight) => insight.type === 'physical_repetitive')
    .forEach((insight) => {
      const token = getGroupToken(insight.service);
      if (!token) return;
      const key = `${insight.service.macroId}:${token.id}`;
      const current = grouped.get(key) || { tokenTitle: token.title, items: [] };
      current.items.push(insight);
      grouped.set(key, current);
    });

  return Array.from(grouped.entries())
    .filter(([, group]) => group.items.length >= 2)
    .map(([id, group]) => {
      const unitCount = new Set(group.items.map((item) => normalizeUnit(item.productivity))).size;
      const reasons = [
        `mesma etapa ${group.items[0].service.macroName}`,
        'nomes relacionados',
      ];

      if (unitCount <= 1) reasons.push('mesma unidade');
      if (hasSimilarProductivity(group.items)) reasons.push('produtividade semelhante');
      if (hasCompatibleComposition(group.items)) reasons.push('composicao de equipe compativel');

      const configuredCount = group.items.filter((item) => item.productivity).length;

      return {
        id,
        title: group.tokenTitle,
        services: group.items,
        reasons,
        hasDuplicatedCapacityRisk: configuredCount >= 2,
      };
    });
};

const formatSharedCapacity = (services: ServiceCapacityInsight[]) => {
  const configured = services.filter((item) => item.productivity);
  if (!configured.length) return 'Sem produtividade configurada para estimar capacidade.';

  const reference = configured[0].productivity!;
  return `Referencia: ${reference.productivity_value} ${reference.productivity_unit} com ${reference.default_team_count} equipe(s).`;
};

export function ServiceProductivityView() {
  const { currentProject } = useConstruction();
  const { productivities, isLoading, saveProductivity } = useServiceProductivity(currentProject?.id);
  const [selectedService, setSelectedService] = useState<ServiceInfo | null>(null);

  const allServices = useMemo(() => {
    if (!currentProject?.macrosTemplate) return [];

    const services: ServiceInfo[] = [];
    currentProject.macrosTemplate.forEach((macro: any) => {
      macro.scopes?.forEach((scope: any) => {
        services.push({
          macroId: macro.id,
          scopeId: scope.id,
          macroName: macro.name,
          scopeName: scope.name,
          macroColor: macro.color || '#6b7280',
        });
      });
    });
    return services;
  }, [currentProject]);

  const stats = useMemo(() => {
    const total = allServices.length;
    const configured = allServices.filter(s =>
      productivities.some(p => p.scope_id === s.scopeId)
    ).length;
    const missing = total - configured;
    const totalProfessionals = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.professionals_per_team, 0
    );
    const totalHelpers = productivities.reduce(
      (sum, p) => sum + p.default_team_count * p.helpers_per_team, 0
    );
    return { total, configured, missing, totalProfessionals, totalHelpers };
  }, [allServices, productivities]);

  const capacityDiagnostics = useMemo(() => {
    const productivityByScope = new Map(productivities.map((item) => [item.scope_id, item]));
    const serviceInsights: ServiceCapacityInsight[] = allServices.map((service) => {
      const type = classifyService(service);
      return {
        service,
        productivity: productivityByScope.get(service.scopeId),
        type,
        isConfigured: productivityByScope.has(service.scopeId),
        planningSuggestion: getPlanningSuggestion(type),
      };
    });

    const suggestedGroups = buildSuggestedTeamGroups(serviceInsights);

    return {
      serviceInsights,
      suggestedGroups,
      likelyAdministrative: serviceInsights.filter((item) => item.type === 'administrative_cost').length,
      physicalRepetitive: serviceInsights.filter((item) => item.type === 'physical_repetitive').length,
      duplicatedCapacityRisk: suggestedGroups.filter((group) => group.hasDuplicatedCapacityRisk).length,
    };
  }, [allServices, productivities]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione um projeto para gerenciar produtividade
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Produtividade e Equipes
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Defina produtividade e dimensionamento de equipes por serviço
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Serviços</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Configurados</p>
                <p className="text-xl font-bold text-foreground">{stats.configured}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-xl font-bold text-foreground">{stats.missing}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Profissionais</p>
                <p className="text-xl font-bold text-foreground">{stats.totalProfessionals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-violet-500" />
              <div>
                <p className="text-xs text-muted-foreground">Auxiliares</p>
                <p className="text-xl font-bold text-foreground">{stats.totalHelpers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capacity Diagnostic */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5 text-primary" />
                Diagnostico de capacidade
              </CardTitle>
              <CardDescription>
                Leitura local para identificar frentes de trabalho compartilhadas, sem unir os lancamentos por servico.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit gap-1">
              <Info className="h-3 w-3" />
              Somente leitura
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Servicos configurados</p>
              <p className="text-xl font-semibold">{stats.configured}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Servicos pendentes</p>
              <p className="text-xl font-semibold">{stats.missing}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Sem produtividade</p>
              <p className="text-xl font-semibold">{stats.missing}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Administrativos provaveis</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.likelyAdministrative}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Fisicos repetitivos</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.physicalRepetitive}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Frentes compartilhadas</p>
              <p className="text-xl font-semibold">{capacityDiagnostics.suggestedGroups.length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-medium">Grupo sugerido aqui significa capacidade compartilhada.</p>
            <p className="mt-1 text-xs">
              Os servicos continuam separados na Producao, Diario, desvios, saldo, Mapa 3D e medicao. A frente compartilhada
              serve apenas para Gantt, Linha de Balanco, capacidade semanal/mensal, alerta de sobrecarga, simulacao e replanejamento.
            </p>
          </div>

          {capacityDiagnostics.duplicatedCapacityRisk > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Possivel capacidade duplicada no planejamento</p>
                  <p className="text-xs">
                    Alguns servicos parecem disputar a mesma equipe. Eles continuam sendo lancados separadamente,
                    mas o planejamento deve somar as metas desses servicos para validar sobrecarga da frente.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="h-4 w-4 text-primary" />
                Frentes de trabalho compartilhadas
              </h3>
              <Badge variant="secondary">Acao futura</Badge>
            </div>

            {capacityDiagnostics.suggestedGroups.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {capacityDiagnostics.suggestedGroups.map((group) => (
                  <div key={group.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium">{group.title}</p>
                      <Badge variant="outline">Capacidade compartilhada</Badge>
                      {group.hasDuplicatedCapacityRisk && (
                        <Badge variant="secondary" className="text-amber-700 dark:text-amber-300">
                          revisar capacidade
                        </Badge>
                      )}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {group.services.map((item) => (
                        <Badge key={item.service.scopeId} variant="secondary" className="font-normal">
                          {item.service.scopeName}
                        </Badge>
                      ))}
                    </div>
                    <div className="mb-3 grid gap-2 rounded-md bg-muted/40 p-2 text-xs md:grid-cols-2">
                      <span>Gantt: capacidade compartilhada</span>
                      <span>Linha: fluxo da frente</span>
                      <span>Semanal: valida sobrecarga por servico</span>
                      <span>Producao/Diario: lancamento separado</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Motivos: {group.reasons.join(', ')}.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSharedCapacity(group.services)} Nao une lancamentos de producao.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhuma frente compartilhada sugerida com os dados atuais.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Classificacao sugerida dos servicos</h3>
            <ScrollArea className="h-72 rounded-lg border">
              <div className="divide-y">
                {capacityDiagnostics.serviceInsights.map((item) => (
                  <div key={item.service.scopeId} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(240px,1fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.service.scopeName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.service.macroName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.isConfigured ? 'default' : 'outline'}>
                        {item.isConfigured ? 'Configurado' : 'Sem produtividade'}
                      </Badge>
                      <Badge variant="secondary">{TYPE_LABELS[item.type]}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="rounded border px-2 py-1">Gantt: {item.planningSuggestion.gantt}</span>
                      <span className="rounded border px-2 py-1">Linha: {item.planningSuggestion.lineOfBalance}</span>
                      <span className="rounded border px-2 py-1">Semanal: {item.planningSuggestion.weeklyPlanning}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              O Planejamento Semanal continua por servico. Para uma frente compartilhada, a validacao futura deve somar as metas
              dos servicos da mesma frente para detectar sobrecarga, sem transformar tudo em um lancamento unico.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Services List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Serviços da Obra</CardTitle>
          <CardDescription>Configure produtividade e equipes para cada serviço</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-420px)]">
            <div className="space-y-2">
              {allServices.map((service) => {
                const productivity = productivities.find(p => p.scope_id === service.scopeId);
                const isConfigured = !!productivity;

                return (
                  <div
                    key={service.scopeId}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: service.macroColor }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {service.scopeName}
                        </p>
                        <p className="text-xs text-muted-foreground">{service.macroName}</p>

                        {productivity && (
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>
                              {productivity.productivity_value} {productivity.productivity_unit}
                            </span>
                            <span>•</span>
                            <span>
                              {productivity.professionals_per_team} prof. + {productivity.helpers_per_team} aux.
                            </span>
                            <span>•</span>
                            <span>{productivity.default_team_count} equipe(s)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {isConfigured ? (
                        <Badge variant="default" className="text-xs">Configurado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Pendente
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={isConfigured ? 'outline' : 'default'}
                        onClick={() => setSelectedService(service)}
                      >
                        {isConfigured ? 'Editar' : 'Configurar'}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {allServices.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum serviço cadastrado. Configure as etapas e serviços primeiro.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Dialog */}
      {selectedService && (
        <ServiceProductivityDialog
          service={selectedService}
          existingProductivity={productivities.find(p => p.scope_id === selectedService.scopeId)}
          onClose={() => setSelectedService(null)}
          onSave={saveProductivity}
        />
      )}
    </div>
  );
}
