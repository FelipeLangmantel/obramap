import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

export interface ServiceRef {
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
}

export interface TeamWorkGroupDialogValues {
  name: string;
  description?: string;
  base_unit?: string;
  productivity_value?: number | null;
  productivity_unit?: string;
  working_days_per_week?: number;
  simultaneous_team_count?: number;
  professional_count?: number;
  auxiliary_count?: number;
  services: ServiceRef[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialValues?: Partial<TeamWorkGroupDialogValues>;
  onSubmit: (values: TeamWorkGroupDialogValues) => Promise<void> | void;
  title?: string;
}

export function TeamWorkGroupDialog({ open, onClose, initialValues, onSubmit, title }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUnit, setBaseUnit] = useState('');
  const [productivityValue, setProductivityValue] = useState<string>('');
  const [productivityUnit, setProductivityUnit] = useState('');
  const [workingDays, setWorkingDays] = useState<string>('5');
  const [simultaneousTeams, setSimultaneousTeams] = useState<string>('1');
  const [professionals, setProfessionals] = useState<string>('0');
  const [auxiliaries, setAuxiliaries] = useState<string>('0');
  const [services, setServices] = useState<ServiceRef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? '');
    setDescription(initialValues?.description ?? '');
    setBaseUnit(initialValues?.base_unit ?? '');
    setProductivityValue(initialValues?.productivity_value != null ? String(initialValues.productivity_value) : '');
    setProductivityUnit(initialValues?.productivity_unit ?? '');
    setWorkingDays(String(initialValues?.working_days_per_week ?? 5));
    setSimultaneousTeams(String(initialValues?.simultaneous_team_count ?? 1));
    setProfessionals(String(initialValues?.professional_count ?? 0));
    setAuxiliaries(String(initialValues?.auxiliary_count ?? 0));
    setServices(initialValues?.services ?? []);
  }, [open, initialValues]);

  const totalPeople = useMemo(
    () => (Number(professionals) || 0) + (Number(auxiliaries) || 0),
    [professionals, auxiliaries],
  );

  const handleRemoveService = (scopeId: string) => {
    setServices((prev) => prev.filter((s) => s.scopeId !== scopeId));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        base_unit: baseUnit.trim() || undefined,
        productivity_value: productivityValue.trim() ? Number(productivityValue) : null,
        productivity_unit: productivityUnit.trim() || undefined,
        working_days_per_week: Number(workingDays) || 5,
        simultaneous_team_count: Number(simultaneousTeams) || 1,
        professional_count: Number(professionals) || 0,
        auxiliary_count: Number(auxiliaries) || 0,
        services,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? (initialValues?.name ? 'Editar frente' : 'Nova frente compartilhada')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Montagem Pre-Moldado" />
          </div>

          <div className="grid gap-2">
            <Label>Descricao</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Unidade base</Label>
              <Input value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} placeholder="m2, m3, un..." />
            </div>
            <div className="grid gap-2">
              <Label>Produtividade</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={productivityValue}
                onChange={(e) => setProductivityValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label>Unidade da produtividade</Label>
              <Input
                value={productivityUnit}
                onChange={(e) => setProductivityUnit(e.target.value)}
                placeholder="m2/dia, un/sem..."
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-2">
              <Label>Dias/semana</Label>
              <Input type="number" min={1} max={7} value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Equipes simult.</Label>
              <Input type="number" min={1} value={simultaneousTeams} onChange={(e) => setSimultaneousTeams(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Profissionais</Label>
              <Input type="number" min={0} value={professionals} onChange={(e) => setProfessionals(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Auxiliares</Label>
              <Input type="number" min={0} value={auxiliaries} onChange={(e) => setAuxiliaries(e.target.value)} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Total de pessoas por equipe: <span className="font-medium text-foreground">{totalPeople}</span>
          </div>

          {services.length > 0 && (
            <div className="grid gap-2">
              <Label>Servicos vinculados</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                {services.map((s) => (
                  <Badge key={s.scopeId} variant="secondary" className="gap-1">
                    {s.scopeName}
                    <button
                      type="button"
                      onClick={() => handleRemoveService(s.scopeId)}
                      className="ml-1 rounded hover:bg-background/60"
                      aria-label={`Remover ${s.scopeName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A frente apenas agrega capacidade. Os lancamentos de Producao, Diario, desvios, saldo, Mapa 3D e medicao
                continuam por servico.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
