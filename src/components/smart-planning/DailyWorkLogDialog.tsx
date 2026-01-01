import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Cloud, CloudRain, Sun } from 'lucide-react';
import { PlanningStage, PlanningTeam, DailyWorkLog } from './types';
import { format } from 'date-fns';

interface DailyWorkLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  stages: PlanningStage[];
  teams: PlanningTeam[];
  onSubmit: (log: Omit<DailyWorkLog, 'id' | 'created_at' | 'updated_at'>) => Promise<DailyWorkLog | null>;
}

export function DailyWorkLogDialog({
  open,
  onOpenChange,
  projectId,
  stages,
  teams,
  onSubmit
}: DailyWorkLogDialogProps) {
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [unitsCompleted, setUnitsCompleted] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [weather, setWeather] = useState<'sol' | 'nublado' | 'chuva' | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredTeams = teams.filter(t => t.stage_id === selectedStage);

  const handleSubmit = async () => {
    if (!selectedStage || unitsCompleted <= 0) return;
    
    setSaving(true);
    try {
      await onSubmit({
        project_id: projectId,
        stage_id: selectedStage,
        team_id: selectedTeam || null,
        log_date: logDate,
        units_completed: unitsCompleted,
        house_ids: [],
        notes: notes || null,
        weather,
        created_by: null
      });
      
      // Reset form
      setSelectedStage('');
      setSelectedTeam('');
      setUnitsCompleted(0);
      setNotes('');
      setWeather(null);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Registro do Diário de Obra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date */}
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Stage */}
          <div>
            <Label>Etapa</Label>
            <Select value={selectedStage} onValueChange={(v) => {
              setSelectedStage(v);
              setSelectedTeam('');
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(stage => (
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

          {/* Team */}
          {selectedStage && filteredTeams.length > 0 && (
            <div>
              <Label>Equipe (opcional)</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todas as equipes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as equipes</SelectItem>
                  {filteredTeams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Units Completed */}
          <div>
            <Label>Quantidade Executada</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={unitsCompleted}
              onChange={(e) => setUnitsCompleted(parseFloat(e.target.value) || 0)}
              placeholder="Ex: 5"
              className="mt-1"
            />
          </div>

          {/* Weather */}
          <div>
            <Label>Clima</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                variant={weather === 'sol' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWeather(weather === 'sol' ? null : 'sol')}
                className="gap-1"
              >
                <Sun className="h-4 w-4" />
                Sol
              </Button>
              <Button
                type="button"
                variant={weather === 'nublado' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWeather(weather === 'nublado' ? null : 'nublado')}
                className="gap-1"
              >
                <Cloud className="h-4 w-4" />
                Nublado
              </Button>
              <Button
                type="button"
                variant={weather === 'chuva' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setWeather(weather === 'chuva' ? null : 'chuva')}
                className="gap-1"
              >
                <CloudRain className="h-4 w-4" />
                Chuva
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações do dia..."
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!selectedStage || unitsCompleted <= 0 || saving}
          >
            {saving ? 'Salvando...' : 'Registrar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
