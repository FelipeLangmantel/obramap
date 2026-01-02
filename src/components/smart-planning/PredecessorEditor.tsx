import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowRight, Link2, Unlink, Clock, Plus, Trash2 } from 'lucide-react';
import { PlanningStage } from './types';

interface PredecessorEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PlanningStage[];
  currentStage: PlanningStage;
  onSave: (predecessorId: string | null, latencyDays: number) => Promise<void>;
}

export function PredecessorEditor({
  open,
  onOpenChange,
  stages,
  currentStage,
  onSave
}: PredecessorEditorProps) {
  const [selectedPredecessor, setSelectedPredecessor] = useState<string | null>(
    currentStage.depends_on || null
  );
  const [latencyDays, setLatencyDays] = useState(0);
  const [saving, setSaving] = useState(false);

  // Filter out current stage and stages that depend on it (to prevent circular dependencies)
  const availableStages = stages.filter(s => {
    if (s.id === currentStage.id) return false;
    // Check for circular dependency
    let checkId: string | null = s.depends_on;
    while (checkId) {
      if (checkId === currentStage.id) return false;
      const parent = stages.find(st => st.id === checkId);
      checkId = parent?.depends_on || null;
    }
    return true;
  });

  const predecessorStage = selectedPredecessor 
    ? stages.find(s => s.id === selectedPredecessor)
    : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedPredecessor, latencyDays);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePredecessor = () => {
    setSelectedPredecessor(null);
    setLatencyDays(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Editar Predecessora
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Stage */}
          <Card className="bg-muted/30">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: currentStage.color }}
                />
                <div>
                  <p className="font-medium">{currentStage.name}</p>
                  <p className="text-xs text-muted-foreground">Etapa atual</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Predecessor Selection */}
          <div className="space-y-2">
            <Label>Predecessora (opcional)</Label>
            <Select
              value={selectedPredecessor || 'none'}
              onValueChange={(v) => setSelectedPredecessor(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa predecessora" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Nenhuma predecessora</span>
                </SelectItem>
                {availableStages.map(stage => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Latency */}
          {selectedPredecessor && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Latência (dias de folga)
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={-30}
                  max={60}
                  value={latencyDays}
                  onChange={(e) => setLatencyDays(parseInt(e.target.value) || 0)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {latencyDays > 0 
                    ? `Aguarda ${latencyDays} dia(s) após término`
                    : latencyDays < 0
                    ? `Inicia ${Math.abs(latencyDays)} dia(s) antes do término`
                    : 'Inicia imediatamente após término'
                  }
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Use valores negativos para iniciar antes da predecessora terminar (sobreposição).
              </p>
            </div>
          )}

          {/* Preview */}
          {predecessorStage && (
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Visualização da Dependência</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-3 justify-center">
                  <Badge 
                    variant="outline"
                    style={{ borderColor: predecessorStage.color }}
                    className="gap-1"
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: predecessorStage.color }}
                    />
                    {predecessorStage.name}
                  </Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    {latencyDays !== 0 && (
                      <span className="text-xs font-mono">
                        {latencyDays > 0 ? '+' : ''}{latencyDays}d
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <Badge 
                    variant="outline"
                    style={{ borderColor: currentStage.color }}
                    className="gap-1"
                  >
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: currentStage.color }}
                    />
                    {currentStage.name}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          {currentStage.depends_on && (
            <Button
              variant="outline"
              onClick={handleRemovePredecessor}
              className="mr-auto gap-1 text-destructive"
            >
              <Unlink className="h-4 w-4" />
              Remover Vínculo
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            <Link2 className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
