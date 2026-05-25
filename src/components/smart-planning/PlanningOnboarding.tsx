import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Layers,
  ExternalLink
} from 'lucide-react';
import { ProductivityTemplate, PlanningStage, TeamComposition } from './types';
import { Macro } from '@/data/constructionData';
import { supabase } from '@/integrations/supabase/client';

interface PlanningOnboardingProps {
  projectId: string;
  totalUnits: number;
  macrosTemplate: Macro[];
  templates: ProductivityTemplate[];
  onComplete: (stages: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>[], teamCompositions: Record<string, TeamComposition>) => Promise<void>;
  onOpenProductivity?: () => void;
  onContinueWithOfficialSource?: () => void;
}

interface OfficialSourceSummary {
  loading: boolean;
  projectProductivities: number;
  teamCompositions: number;
  workGroups: number;
  workGroupServices: number;
  legacyStages: number;
  legacyTeams: number;
}

interface CountResult<T = { id: string }> {
  data: T[] | null;
  count: number | null;
}

interface ReadQuery<T = { id: string }> extends PromiseLike<CountResult<T>> {
  eq(column: string, value: string): ReadQuery<T>;
  in(column: string, values: string[]): ReadQuery<T>;
}

interface ReadOnlySupabase {
  from<T = { id: string }>(table: string): {
    select(columns: string, options?: { count?: 'exact' }): ReadQuery<T>;
  };
}

const readOnlySupabase = supabase as unknown as ReadOnlySupabase;

export function PlanningOnboarding({ 
  projectId, 
  totalUnits, 
  macrosTemplate,
  onOpenProductivity,
  onContinueWithOfficialSource,
}: PlanningOnboardingProps) {
  const [sourceSummary, setSourceSummary] = useState<OfficialSourceSummary>({
    loading: true,
    projectProductivities: 0,
    teamCompositions: 0,
    workGroups: 0,
    workGroupServices: 0,
    legacyStages: 0,
    legacyTeams: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSourceSummary = async () => {
      if (!projectId) return;
      setSourceSummary((current) => ({ ...current, loading: true }));

      try {
        const [
          projectProductivitiesResult,
          workGroupsResult,
          workGroupServicesResult,
          legacyStagesResult,
          legacyTeamsResult,
        ] = await Promise.all([
          readOnlySupabase
            .from<{ id: string }>('project_service_productivity')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId),
          readOnlySupabase
            .from('project_team_work_groups')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId),
          readOnlySupabase
            .from('project_team_work_group_services')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId),
          supabase
            .from('planning_stages')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId),
          supabase
            .from('planning_teams')
            .select('id', { count: 'exact' })
            .eq('project_id', projectId),
        ]);

        const productivityIds = ((projectProductivitiesResult.data as { id: string }[] | null) || [])
          .map((item) => item.id)
          .filter(Boolean);
        const teamCompositionsResult = productivityIds.length
          ? await readOnlySupabase
            .from('project_service_team_composition')
            .select('id', { count: 'exact' })
            .in('productivity_id', productivityIds)
          : { count: 0 };

        if (cancelled) return;

        setSourceSummary({
          loading: false,
          projectProductivities: projectProductivitiesResult.count || 0,
          teamCompositions: teamCompositionsResult.count || 0,
          workGroups: workGroupsResult.count || 0,
          workGroupServices: workGroupServicesResult.count || 0,
          legacyStages: legacyStagesResult.count || 0,
          legacyTeams: legacyTeamsResult.count || 0,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('[PlanningOnboarding] erro ao carregar diagnostico de fontes', error);
        setSourceSummary((current) => ({ ...current, loading: false }));
      }
    };

    void loadSourceSummary();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const hasOfficialSource =
    sourceSummary.projectProductivities > 0 ||
    sourceSummary.teamCompositions > 0 ||
    sourceSummary.workGroups > 0 ||
    sourceSummary.workGroupServices > 0;
  const hasLegacySource = sourceSummary.legacyStages > 0 || sourceSummary.legacyTeams > 0;

  if (macrosTemplate.length === 0) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-12 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhuma etapa cadastrada</h3>
          <p className="text-muted-foreground">
            Cadastre as etapas construtivas (macros) no módulo de Gerenciamento antes de iniciar o planejamento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Configurar Planejamento Inteligente
          </CardTitle>
          <CardDescription>
            A produtividade e composição de equipes são configuradas em Produtividade e Equipes.
            As etapas já estão carregadas do cadastro do projeto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" />
              {totalUnits} unidades
            </Badge>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {macrosTemplate.length} etapas cadastradas
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Fonte oficial de produtividade
          </CardTitle>
          <CardDescription className="text-amber-900 dark:text-amber-200">
            A produtividade e composição de equipes são configuradas exclusivamente em Produtividade e Equipes.
            Esta tela não cria nem edita produtividade paralela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasOfficialSource ? 'default' : 'secondary'}>
              {sourceSummary.loading
                ? 'Verificando fonte oficial...'
                : hasOfficialSource
                  ? 'Fonte oficial encontrada'
                  : 'Produtividade oficial ainda não configurada'}
            </Badge>
            {hasLegacySource && (
              <Badge variant="outline">
                Dados legados encontrados
              </Badge>
            )}
          </div>

          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-md border bg-background/70 p-3">
              <p className="text-xs text-muted-foreground">Produtividades oficiais</p>
              <p className="text-xl font-semibold">{sourceSummary.projectProductivities}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-3">
              <p className="text-xs text-muted-foreground">Composições oficiais</p>
              <p className="text-xl font-semibold">{sourceSummary.teamCompositions}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-3">
              <p className="text-xs text-muted-foreground">Frentes compartilhadas</p>
              <p className="text-xl font-semibold">{sourceSummary.workGroups}</p>
            </div>
            <div className="rounded-md border bg-background/70 p-3">
              <p className="text-xs text-muted-foreground">Vínculos em frentes</p>
              <p className="text-xl font-semibold">{sourceSummary.workGroupServices}</p>
            </div>
          </div>

          {hasOfficialSource ? (
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Este projeto possui dados oficiais e esta tela não deve criar produtividade/equipe paralela em
              <span className="font-medium"> planning_stages</span> ou <span className="font-medium">planning_teams</span>.
              Use Produtividade e Equipes para revisar ou completar os dados.
            </p>
          ) : (
            <p className="text-sm text-amber-900 dark:text-amber-100">
              Ainda não há produtividade oficial para este projeto. Configure em Produtividade e Equipes.
              Projetos antigos devem ser reconfigurados antes de gerar planejamento confiável.
            </p>
          )}

          {hasLegacySource && (
            <p className="rounded-md border bg-background/70 p-3 text-sm text-muted-foreground">
              Este projeto possui dados legados no Planejamento Inteligente: {sourceSummary.legacyStages} etapa(s)
              e {sourceSummary.legacyTeams} equipe(s). Eles não serão apagados nem migrados automaticamente.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="default" className="gap-2" onClick={onOpenProductivity}>
              <ExternalLink className="h-4 w-4" />
              Abrir Produtividade e Equipes
            </Button>
            {hasOfficialSource && (
              <Button type="button" variant="outline" className="gap-2" onClick={onContinueWithOfficialSource}>
                <ArrowRight className="h-4 w-4" />
                Continuar no Planejamento Inteligente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasOfficialSource ? (
        <Card>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="font-medium">Fonte oficial ativa</p>
                <p className="text-sm text-muted-foreground">
                  Os campos legados de produtividade, número de equipes, profissionais/equipe e ajudantes/equipe
                  foram ocultados para evitar configuração paralela. Continue no planejamento ou abra Produtividade e Equipes
                  para revisar produtividade, composição detalhada e frentes compartilhadas.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-300">
          <CardContent className="space-y-3 py-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">Produtividade não configurada</p>
                <p className="text-sm text-muted-foreground">
                  Configure este serviço em Produtividade e Equipes para liberar prazos, Gantt, Linha de Balanço e Previsão.
                  A fonte oficial de prazo e capacidade é Produtividade e Equipes.
                </p>
                <p className="text-sm text-muted-foreground">
                  Projetos antigos devem ser reconfigurados antes de gerar planejamento confiável.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      )}
    </div>
  );
}
