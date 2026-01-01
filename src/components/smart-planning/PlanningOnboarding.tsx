import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Zap,
  CheckCircle2,
  ArrowRight,
  Layers,
  PlayCircle,
  User,
  HardHat
} from 'lucide-react';
import { ProductivityTemplate, PlanningStage, StageConfigInput, TeamComposition } from './types';
import { Macro } from '@/data/constructionData';

interface PlanningOnboardingProps {
  projectId: string;
  totalUnits: number;
  macrosTemplate: Macro[];
  templates: ProductivityTemplate[];
  onComplete: (stages: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>[], teamCompositions: Record<string, TeamComposition>) => Promise<void>;
}

export function PlanningOnboarding({ 
  projectId, 
  totalUnits, 
  macrosTemplate,
  templates, 
  onComplete 
}: PlanningOnboardingProps) {
  // Initialize stages from macros template
  const initialStages: StageConfigInput[] = useMemo(() => {
    return macrosTemplate.map((macro, index) => {
      // Find matching template for productivity suggestion
      const template = templates.find(
        t => t.stage_name.toLowerCase() === macro.name.toLowerCase()
      );
      
      return {
        macroId: macro.id,
        macroName: macro.name,
        color: macro.color,
        planned_productivity: template?.default_productivity || 1,
        planned_teams: 1,
        team_composition: { professionals: 1, helpers: 1 },
        depends_on: index > 0 ? macrosTemplate[index - 1].id : null,
        sequence_order: index + 1
      };
    });
  }, [macrosTemplate, templates]);

  const [stages, setStages] = useState<StageConfigInput[]>(initialStages);
  const [saving, setSaving] = useState(false);

  const updateStage = (macroId: string, updates: Partial<StageConfigInput>) => {
    setStages(prev => prev.map(s => 
      s.macroId === macroId ? { ...s, ...updates } : s
    ));
  };

  const updateTeamComposition = (macroId: string, field: 'professionals' | 'helpers', value: number) => {
    setStages(prev => prev.map(s => 
      s.macroId === macroId 
        ? { 
            ...s, 
            team_composition: { 
              ...s.team_composition, 
              [field]: value 
            } 
          } 
        : s
    ));
  };

  const calculateDuration = (stage: StageConfigInput) => {
    const effectiveProductivity = stage.planned_productivity * stage.planned_teams;
    return effectiveProductivity > 0 ? Math.ceil(totalUnits / effectiveProductivity) : 0;
  };

  const handleComplete = async () => {
    if (stages.length === 0) return;
    
    setSaving(true);
    try {
      const stagesData = stages.map(s => ({
        project_id: projectId,
        name: s.macroName,
        sequence_order: s.sequence_order,
        planned_productivity: s.planned_productivity,
        planned_teams: s.planned_teams,
        duration_days: calculateDuration(s),
        depends_on: null,
        color: s.color,
        is_baseline: false,
        baseline_created_at: null,
        macro_id: s.macroId
      }));
      
      const teamCompositions: Record<string, TeamComposition> = {};
      stages.forEach(s => {
        teamCompositions[s.macroId] = s.team_composition;
      });
      
      await onComplete(stagesData, teamCompositions);
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = stages.reduce((sum, s) => sum + calculateDuration(s), 0);
  const totalTeams = stages.reduce((sum, s) => sum + s.planned_teams, 0);
  const totalProfessionals = stages.reduce((sum, s) => sum + (s.planned_teams * s.team_composition.professionals), 0);
  const totalHelpers = stages.reduce((sum, s) => sum + (s.planned_teams * s.team_composition.helpers), 0);

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
            Configure a produtividade e composição de equipes para cada etapa.
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
              {stages.length} etapas
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {totalTeams} equipes
            </Badge>
            <Badge variant="outline" className="gap-1">
              <User className="h-3 w-3" />
              {totalProfessionals} profissionais
            </Badge>
            <Badge variant="outline" className="gap-1">
              <HardHat className="h-3 w-3" />
              {totalHelpers} ajudantes
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Zap className="h-3 w-3" />
              ~{totalDuration} dias estimados
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stages Configuration */}
      <div className="space-y-4">
        {stages.map((stage, index) => (
          <Card key={stage.macroId} className="relative overflow-hidden">
            <div 
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: stage.color }}
            />
            <CardContent className="pt-4 pl-5">
              <div className="flex items-center gap-4 mb-4">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                  style={{ backgroundColor: stage.color }}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{stage.macroName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {index > 0 && `Inicia após: ${stages[index - 1]?.macroName}`}
                    {index === 0 && 'Primeira etapa'}
                  </p>
                </div>
                <Badge variant="secondary">
                  ~{calculateDuration(stage)} dias
                </Badge>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Productivity */}
                <div>
                  <Label className="flex items-center gap-1 text-xs">
                    <Zap className="h-3 w-3" />
                    Produtividade (un/dia/equipe)
                  </Label>
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={stage.planned_productivity}
                    onChange={(e) => updateStage(stage.macroId, { 
                      planned_productivity: parseFloat(e.target.value) || 0.1 
                    })}
                    className="mt-1"
                  />
                </div>

                {/* Number of Teams */}
                <div>
                  <Label className="flex items-center gap-1 text-xs">
                    <Users className="h-3 w-3" />
                    Número de Equipes
                  </Label>
                  <Select
                    value={stage.planned_teams.toString()}
                    onValueChange={(v) => updateStage(stage.macroId, { 
                      planned_teams: parseInt(v) 
                    })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} equipe{n > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Team Composition - Professionals */}
                <div>
                  <Label className="flex items-center gap-1 text-xs">
                    <User className="h-3 w-3" />
                    Profissionais/Equipe
                  </Label>
                  <Select
                    value={stage.team_composition.professionals.toString()}
                    onValueChange={(v) => updateTeamComposition(stage.macroId, 'professionals', parseInt(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} profissional{n > 1 ? 'is' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Team Composition - Helpers */}
                <div>
                  <Label className="flex items-center gap-1 text-xs">
                    <HardHat className="h-3 w-3" />
                    Ajudantes/Equipe
                  </Label>
                  <Select
                    value={stage.team_composition.helpers.toString()}
                    onValueChange={(v) => updateTeamComposition(stage.macroId, 'helpers', parseInt(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} ajudante{n !== 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Team summary */}
              <div className="mt-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                <span className="font-medium">Resumo:</span> {stage.planned_teams} equipe{stage.planned_teams > 1 ? 's' : ''} × 
                ({stage.team_composition.professionals} prof. + {stage.team_composition.helpers} aj.) = 
                <span className="font-medium text-foreground ml-1">
                  {stage.planned_teams * stage.team_composition.professionals} profissionais + {stage.planned_teams * stage.team_composition.helpers} ajudantes
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Button */}
      <div className="flex justify-end gap-3 pt-4 pb-8">
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={saving}
          className="gap-2"
        >
          <PlayCircle className="h-5 w-5" />
          {saving ? 'Salvando...' : 'Iniciar Planejamento'}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
