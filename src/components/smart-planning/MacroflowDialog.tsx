import { useEffect, useMemo, useState } from 'react';
import { Link2, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

import { GanttService } from './hooks/useStrategicGanttData';
import {
  MacroflowDependencyInput,
  MacroflowPackageOption,
  MacroflowRelationType,
  usePlanningMacroflow,
} from './hooks/usePlanningMacroflow';

interface MacroflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  packages: GanttService[];
  canEdit: boolean;
  onChanged?: () => Promise<void> | void;
}

const packageTypeLabel = (type: string) => type === 'work_group' ? 'Frente' : 'Serviço';

const relationLabel = (relation: MacroflowRelationType) =>
  relation === 'SS' ? 'Inicia para iniciar (SS)' : 'Termina para iniciar (FS)';

const describeLag = (lagDays: number) => {
  if (lagDays === 0) return 'sem defasagem';
  return lagDays > 0 ? `${lagDays} dia(s) depois` : `${Math.abs(lagDays)} dia(s) antes`;
};

const describeDependency = (dependency: {
  predecessorLabel: string;
  successorLabel: string;
  relationType: MacroflowRelationType;
  lagDays: number;
}) => {
  const relation = dependency.relationType === 'SS' ? 'começa' : 'começa depois do término';
  return `${dependency.successorLabel} ${relation} de ${dependency.predecessorLabel}, ${describeLag(dependency.lagDays)}.`;
};

export function MacroflowDialog({
  open,
  onOpenChange,
  projectId,
  packages,
  canEdit,
  onChanged,
}: MacroflowDialogProps) {
  const packageOptions = useMemo<MacroflowPackageOption[]>(() => packages.map((pkg) => ({
    key: pkg.id,
    type: pkg.package_type === 'work_group' ? 'work_group' : 'service',
    label: pkg.scope_name || pkg.name,
    hasProductivity: pkg.has_productivity,
  })), [packages]);

  const {
    macroflow,
    dependencies,
    loading,
    hasCycle,
    addDependency,
    updateDependency,
    removeDependency,
  } = usePlanningMacroflow(projectId, packageOptions);

  const [predecessorKey, setPredecessorKey] = useState('');
  const [successorKey, setSuccessorKey] = useState('');
  const [relationType, setRelationType] = useState<MacroflowRelationType>('FS');
  const [lagDays, setLagDays] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
    }
  }, [open]);

  const predecessor = packageOptions.find((option) => option.key === predecessorKey);
  const successor = packageOptions.find((option) => option.key === successorKey);

  const resetForm = () => {
    setPredecessorKey('');
    setSuccessorKey('');
    setRelationType('FS');
    setLagDays(0);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!predecessor || !successor) return;
    const payload: MacroflowDependencyInput = {
      predecessorType: predecessor.type,
      predecessorKey: predecessor.key,
      predecessorLabel: predecessor.label,
      successorType: successor.type,
      successorKey: successor.key,
      successorLabel: successor.label,
      relationType,
      lagDays: Number.isFinite(Number(lagDays)) ? Number(lagDays) : 0,
    };

    const saved = editingId
      ? await updateDependency(editingId, payload)
      : await addDependency(payload);
    if (saved) {
      resetForm();
      await onChanged?.();
    }
  };

  const handleRemove = async (dependencyId: string) => {
    const removed = await removeDependency(dependencyId);
    if (removed) await onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Macrofluxo do Planejamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Configure predecessoras entre frentes e serviços fora de frente. O macrofluxo altera apenas o planejamento visual e não altera produção, diário, medição ou Mapa 3D.
          </div>

          <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_160px_120px_auto]">
            <div className="space-y-1">
              <Label className="text-xs">Predecessor</Label>
              <Select value={predecessorKey} onValueChange={setPredecessorKey} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {packageOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sucessor</Label>
              <Select value={successorKey} onValueChange={setSuccessorKey} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {packageOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Relação</Label>
              <Select value={relationType} onValueChange={(value) => setRelationType(value as MacroflowRelationType)} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FS">Termina para iniciar (FS)</SelectItem>
                  <SelectItem value="SS">Inicia para iniciar (SS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Defasagem</Label>
              <Input
                type="number"
                value={lagDays}
                onChange={(event) => setLagDays(Number(event.target.value))}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-2"
                onClick={handleSubmit}
                disabled={!canEdit || !predecessor || !successor || loading}
              >
                <Plus className="h-4 w-4" />
                {editingId ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </div>

          {successor && predecessor && (
            <p className="text-xs text-muted-foreground">
              Exemplo: {describeDependency({
                predecessorLabel: predecessor.label,
                successorLabel: successor.label,
                relationType,
                lagDays,
              })}
            </p>
          )}

          {hasCycle && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Macrofluxo possui ciclo. Revise predecessoras antes de usar o cronograma como referência.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[240px_1fr]">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium">Pacotes disponíveis</p>
              <div className="mt-2 space-y-2">
                {packageOptions.map((option) => (
                  <div key={option.key} className="rounded-md bg-muted/40 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{option.label}</span>
                      <Badge variant={option.type === 'work_group' ? 'secondary' : 'outline'} className="text-[10px]">
                        {packageTypeLabel(option.type)}
                      </Badge>
                    </div>
                    {!option.hasProductivity && (
                      <p className="mt-1 text-[11px] text-amber-700">Sem produtividade cadastrada.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Relações salvas</p>
                <Badge variant="outline">{macroflow?.name || 'Sem macrofluxo ativo'}</Badge>
              </div>
              <ScrollArea className="mt-2 max-h-[300px] pr-3">
                {dependencies.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma relação cadastrada. Adicione a primeira predecessora para ativar o macrofluxo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dependencies.map((dependency) => (
                      <div key={dependency.id} className="rounded-md border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{describeDependency(dependency)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {relationLabel(dependency.relationType)} • {describeLag(dependency.lagDays)}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!canEdit}
                              onClick={() => {
                                setEditingId(dependency.id);
                                setPredecessorKey(dependency.predecessorKey);
                                setSuccessorKey(dependency.successorKey);
                                setRelationType(dependency.relationType);
                                setLagDays(dependency.lagDays);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!canEdit}
                              onClick={() => handleRemove(dependency.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
