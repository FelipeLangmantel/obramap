import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Layers, 
  Users, 
  Zap,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { ProductivityTemplate, PlanningStage } from './types';

interface StageInput {
  name: string;
  sequence_order: number;
  planned_productivity: number;
  planned_teams: number;
  depends_on: string | null;
  color: string;
}

interface PlanningOnboardingProps {
  projectId: string;
  totalUnits: number;
  templates: ProductivityTemplate[];
  onComplete: (stages: Omit<PlanningStage, 'id' | 'created_at' | 'updated_at'>[]) => Promise<void>;
}

const STAGE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899'
];

export function PlanningOnboarding({ 
  projectId, 
  totalUnits, 
  templates, 
  onComplete 
}: PlanningOnboardingProps) {
  const [stages, setStages] = useState<StageInput[]>([]);
  const [saving, setSaving] = useState(false);

  const addStage = () => {
    const nextOrder = stages.length + 1;
    const defaultTemplate = templates.find(t => !t.project_id);
    
    setStages([...stages, {
      name: '',
      sequence_order: nextOrder,
      planned_productivity: defaultTemplate?.default_productivity || 1,
      planned_teams: 1,
      depends_on: stages.length > 0 ? `stage-${stages.length - 1}` : null,
      color: STAGE_COLORS[nextOrder % STAGE_COLORS.length]
    }]);
  };

  const updateStage = (index: number, updates: Partial<StageInput>) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], ...updates };
    setStages(updated);
  };

  const removeStage = (index: number) => {
    const updated = stages.filter((_, i) => i !== index);
    // Reorder sequences
    updated.forEach((s, i) => {
      s.sequence_order = i + 1;
      if (s.depends_on === `stage-${index}`) {
        s.depends_on = index > 0 ? `stage-${index - 1}` : null;
      }
    });
    setStages(updated);
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === stages.length - 1) return;
    
    const updated = [...stages];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    
    updated.forEach((s, i) => {
      s.sequence_order = i + 1;
    });
    
    setStages(updated);
  };

  const applySuggestion = (stageName: string, index: number) => {
    const template = templates.find(
      t => t.stage_name.toLowerCase() === stageName.toLowerCase()
    );
    if (template) {
      updateStage(index, {
        planned_productivity: template.default_productivity
      });
    }
  };

  const calculateDuration = (stage: StageInput) => {
    const effectiveProductivity = stage.planned_productivity * stage.planned_teams;
    return Math.ceil(totalUnits / effectiveProductivity);
  };

  const handleComplete = async () => {
    if (stages.length === 0) return;
    
    setSaving(true);
    try {
      const stagesData = stages.map((s, index) => ({
        project_id: projectId,
        name: s.name,
        sequence_order: s.sequence_order,
        planned_productivity: s.planned_productivity,
        planned_teams: s.planned_teams,
        duration_days: calculateDuration(s),
        depends_on: index > 0 ? null : null, // Will be set after creation
        color: s.color
      }));
      
      await onComplete(stagesData);
    } finally {
      setSaving(false);
    }
  };

  const totalDuration = stages.reduce((sum, s) => sum + calculateDuration(s), 0);
  const isValid = stages.length > 0 && stages.every(s => s.name.trim());

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Configurar Etapas Construtivas
          </CardTitle>
          <CardDescription>
            Defina as etapas da obra, produtividade planejada e número de equipes.
            O sistema irá gerar automaticamente o Gantt e a Linha de Balanço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" />
              {totalUnits} unidades
            </Badge>
            {stages.length > 0 && (
              <>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {stages.length} etapas
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Zap className="h-3 w-3" />
                  ~{totalDuration} dias
                </Badge>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {stages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma etapa definida</h3>
            <p className="text-muted-foreground mb-6">
              Adicione as etapas construtivas para iniciar o planejamento.
            </p>
            <Button onClick={addStage}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Primeira Etapa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {stages.map((stage, index) => (
            <Card key={index} className="relative">
              <div 
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
                style={{ backgroundColor: stage.color }}
              />
              <CardContent className="pt-4 pl-5">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStage(index, 'up')}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <span className="text-center text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveStage(index, 'down')}
                      disabled={index === stages.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                      <Label>Nome da Etapa</Label>
                      <div className="flex gap-2">
                        <Input
                          value={stage.name}
                          onChange={(e) => {
                            updateStage(index, { name: e.target.value });
                            applySuggestion(e.target.value, index);
                          }}
                          placeholder="Ex: Fundação, Alvenaria..."
                          list={`suggestions-${index}`}
                        />
                        <datalist id={`suggestions-${index}`}>
                          {templates.map(t => (
                            <option key={t.id} value={t.stage_name} />
                          ))}
                        </datalist>
                        <input
                          type="color"
                          value={stage.color}
                          onChange={(e) => updateStage(index, { color: e.target.value })}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        Produtividade
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={stage.planned_productivity}
                          onChange={(e) => updateStage(index, { 
                            planned_productivity: parseFloat(e.target.value) || 0.1 
                          })}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          un/dia
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Equipes
                      </Label>
                      <Select
                        value={stage.planned_teams.toString()}
                        onValueChange={(v) => updateStage(index, { 
                          planned_teams: parseInt(v) 
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} equipe{n > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge variant="secondary">
                      ~{calculateDuration(stage)} dias
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeStage(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {index > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    Inicia após: {stages[index - 1]?.name || 'etapa anterior'}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addStage} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Etapa
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button
          size="lg"
          onClick={handleComplete}
          disabled={!isValid || saving}
        >
          {saving ? 'Salvando...' : 'Iniciar Planejamento'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
