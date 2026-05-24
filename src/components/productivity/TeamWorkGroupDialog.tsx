import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Users, X } from 'lucide-react';
import { useProfessions } from '@/hooks/useProfessions';
import { ServiceProductivity, TeamMemberRow } from '@/hooks/useServiceProductivity';
import type { TeamWorkGroupComposition } from '@/hooks/useTeamWorkGroups';
import { findProfession, groupProfessionsByCategory, PROFESSIONS_CATALOG } from '@/data/professionsCatalog';
import { cn } from '@/lib/utils';

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
  composition?: TeamWorkGroupComposition[];
  services: ServiceRef[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialValues?: Partial<TeamWorkGroupDialogValues>;
  serviceProductivities?: ServiceProductivity[];
  onSubmit: (values: TeamWorkGroupDialogValues) => Promise<void> | void;
  title?: string;
}

const normalizeProfessionName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function TeamWorkGroupDialog({
  open,
  onClose,
  initialValues,
  serviceProductivities = [],
  onSubmit,
  title,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUnit, setBaseUnit] = useState('');
  const [productivityValue, setProductivityValue] = useState<string>('');
  const [productivityUnit, setProductivityUnit] = useState('');
  const [workingDays, setWorkingDays] = useState<string>('5');
  const [simultaneousTeams, setSimultaneousTeams] = useState<string>('1');
  const [teamComposition, setTeamComposition] = useState<TeamWorkGroupComposition[]>([]);
  const [picker, setPicker] = useState('');
  const [services, setServices] = useState<ServiceRef[]>([]);
  const [saving, setSaving] = useState(false);
  const { professions: dbProfessions, groupedByCategory } = useProfessions({ onlyActive: true });

  const groupedProfessions = useMemo(() => {
    if (dbProfessions.length > 0) {
      return groupedByCategory().map(([category, list]) =>
        [category, list.map((profession) => ({
          name: profession.name,
          type: profession.worker_type,
          category,
        }))] as const
      );
    }
    return groupProfessionsByCategory();
  }, [dbProfessions, groupedByCategory]);

  const suggestedComposition = useMemo(() => {
    const selectedScopeIds = new Set((services || []).map((service) => service.scopeId));
    const byProfession = new Map<string, TeamWorkGroupComposition>();
    serviceProductivities
      .filter((productivity) => selectedScopeIds.has(productivity.scope_id))
      .flatMap((productivity) => productivity.team_composition || [])
      .forEach((row: TeamMemberRow) => {
        const nameValue = row.role_name?.trim();
        if (!nameValue) return;
        const role = row.role_type === 'helper' ? 'helper' : 'professional';
        const normalized = normalizeProfessionName(nameValue);
        const key = `${normalized}::${role}`;
        const quantity = Number(row.quantity) || 0;
        const current = byProfession.get(key);
        if (!current || quantity > Number(current.quantity || 0)) {
          byProfession.set(key, {
            profession_name: nameValue,
            normalized_profession_name: normalized,
            role,
            quantity,
          });
        }
      });
    return Array.from(byProfession.values());
  }, [serviceProductivities, services]);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? '');
    setDescription(initialValues?.description ?? '');
    setBaseUnit(initialValues?.base_unit ?? '');
    setProductivityValue(initialValues?.productivity_value != null ? String(initialValues.productivity_value) : '');
    setProductivityUnit(initialValues?.productivity_unit ?? '');
    setWorkingDays(String(initialValues?.working_days_per_week ?? 5));
    setSimultaneousTeams(String(initialValues?.simultaneous_team_count ?? 1));
    setServices(initialValues?.services ?? []);

    const savedComposition = initialValues?.composition ?? [];
    if (savedComposition.length) {
      setTeamComposition(savedComposition.map((row) => ({ ...row })));
    } else {
      setTeamComposition([]);
    }
    setPicker('');
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    if (initialValues?.composition?.length) return;
    if (teamComposition.length > 0) return;
    if (suggestedComposition.length > 0) {
      setTeamComposition(suggestedComposition.map((row) => ({ ...row })));
    }
  }, [open, initialValues?.composition?.length, suggestedComposition, teamComposition.length]);

  const compositionTotals = useMemo(() => {
    const professional_count = teamComposition
      .filter((row) => row.role === 'professional')
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const auxiliary_count = teamComposition
      .filter((row) => row.role === 'helper')
      .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    return {
      professional_count,
      auxiliary_count,
      totalPeople: professional_count + auxiliary_count,
    };
  }, [teamComposition]);

  const handleRemoveService = (scopeId: string) => {
    setServices((prev) => prev.filter((service) => service.scopeId !== scopeId));
  };

  const addRoleFromPicker = (professionName: string) => {
    if (!professionName) return;
    if (teamComposition.some((row) => normalizeProfessionName(row.profession_name) === normalizeProfessionName(professionName))) return;
    const dynamicProfession = dbProfessions.find((profession) => normalizeProfessionName(profession.name) === normalizeProfessionName(professionName));
    const catalogProfession = dynamicProfession ? null : findProfession(professionName);
    setTeamComposition((prev) => [
      ...prev,
      {
        profession_name: professionName,
        normalized_profession_name: normalizeProfessionName(professionName),
        role: dynamicProfession?.worker_type || catalogProfession?.type || 'professional',
        quantity: 1,
      },
    ]);
    setPicker('');
  };

  const updateCompositionRow = (index: number, patch: Partial<TeamWorkGroupComposition>) => {
    setTeamComposition((prev) => prev.map((row, currentIndex) => (
      currentIndex === index
        ? {
            ...row,
            ...patch,
            normalized_profession_name: patch.profession_name !== undefined
              ? normalizeProfessionName(patch.profession_name)
              : row.normalized_profession_name,
          }
        : row
    )));
  };

  const removeCompositionRow = (index: number) => {
    setTeamComposition((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const normalizedComposition = teamComposition
        .filter((row) => row.profession_name?.trim() && Number(row.quantity) > 0)
        .map((row) => ({
          ...row,
          profession_name: row.profession_name.trim(),
          normalized_profession_name: normalizeProfessionName(row.profession_name),
          quantity: Number(row.quantity) || 0,
        }));
      const hasDetailedComposition = normalizedComposition.length > 0;
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        base_unit: baseUnit.trim() || undefined,
        productivity_value: productivityValue.trim() ? Number(productivityValue) : null,
        productivity_unit: productivityUnit.trim() || undefined,
        working_days_per_week: Number(workingDays) || 5,
        simultaneous_team_count: Number(simultaneousTeams) || 1,
        professional_count: hasDetailedComposition
          ? compositionTotals.professional_count
          : Number(initialValues?.professional_count) || 0,
        auxiliary_count: hasDetailedComposition
          ? compositionTotals.auxiliary_count
          : Number(initialValues?.auxiliary_count) || 0,
        composition: hasDetailedComposition ? normalizedComposition : undefined,
        services,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isAlreadyAdded = (professionName: string) =>
    teamComposition.some((row) => normalizeProfessionName(row.profession_name) === normalizeProfessionName(professionName));

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? (initialValues?.name ? 'Editar frente' : 'Nova frente compartilhada')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Nome *</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Montagem Pre-Moldado" />
          </div>

          <div className="grid gap-2">
            <Label>Descricao</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Unidade base</Label>
              <Input value={baseUnit} onChange={(event) => setBaseUnit(event.target.value)} placeholder="m2, m3, un..." />
            </div>
            <div className="grid gap-2">
              <Label>Produtividade</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={productivityValue}
                onChange={(event) => setProductivityValue(event.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label>Unidade da produtividade</Label>
              <Input
                value={productivityUnit}
                onChange={(event) => setProductivityUnit(event.target.value)}
                placeholder="m2/dia, un/sem..."
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Dias/semana</Label>
              <Input type="number" min={1} max={7} value={workingDays} onChange={(event) => setWorkingDays(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Equipes simult.</Label>
              <Input type="number" min={1} value={simultaneousTeams} onChange={(event) => setSimultaneousTeams(event.target.value)} />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-primary" />
                  Composicao da equipe por profissao
                </h4>
                <p className="text-xs text-muted-foreground">
                  Defina uma equipe-padrao da frente. Os totais agregados serao sincronizados automaticamente.
                </p>
              </div>
              {suggestedComposition.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTeamComposition(suggestedComposition.map((row) => ({ ...row })))}
                >
                  Preencher a partir dos servicos
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Select value={picker} onValueChange={(value) => addRoleFromPicker(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="+ Adicionar profissao..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {groupedProfessions.map(([category, items]) => (
                    <SelectGroup key={category}>
                      <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {category}
                      </SelectLabel>
                      {items.map((profession) => (
                        <SelectItem
                          key={profession.name}
                          value={profession.name}
                          disabled={isAlreadyAdded(profession.name)}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                profession.type === 'professional' ? 'bg-primary' : 'bg-amber-500',
                              )}
                            />
                            {profession.name}
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {profession.type === 'professional' ? 'prof.' : 'aux.'}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setTeamComposition((prev) => [
                  ...prev,
                  {
                    profession_name: '',
                    normalized_profession_name: '',
                    role: 'professional',
                    quantity: 1,
                  },
                ])}
                title="Adicionar profissao personalizada"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {teamComposition.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhuma profissao adicionada. Vincule servicos com composicao cadastrada ou adicione uma profissao.
              </div>
            ) : (
              <div className="space-y-2">
                {teamComposition.map((row, index) => (
                  <div key={`${row.id ?? 'new'}-${index}`} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                    <Input
                      list="work-group-profession-suggestions"
                      placeholder="Nome da profissao"
                      value={row.profession_name}
                      onChange={(event) => updateCompositionRow(index, { profession_name: event.target.value })}
                      className="h-8 min-w-0 flex-1 text-sm"
                    />
                    <Select
                      value={row.role}
                      onValueChange={(value) => updateCompositionRow(index, { role: value as TeamWorkGroupComposition['role'] })}
                    >
                      <SelectTrigger className="h-8 w-[120px] shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Profissional</SelectItem>
                        <SelectItem value="helper">Auxiliar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      value={row.quantity}
                      onChange={(event) => updateCompositionRow(index, { quantity: Number(event.target.value) || 0 })}
                      className="h-8 w-16 shrink-0 text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeCompositionRow(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <datalist id="work-group-profession-suggestions">
                  {[...dbProfessions.map((profession) => profession.name), ...PROFESSIONS_CATALOG.map((profession) => profession.name)]
                    .filter(Boolean)
                    .map((professionName) => (
                      <option key={professionName} value={professionName} />
                    ))}
                </datalist>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 border-t pt-2 text-xs">
              <Badge variant="secondary" className="justify-center font-mono">
                {compositionTotals.professional_count} prof./eq.
              </Badge>
              <Badge variant="outline" className="justify-center font-mono">
                {compositionTotals.auxiliary_count} aux./eq.
              </Badge>
              <Badge className="justify-center border-primary/20 bg-primary/10 font-mono text-primary">
                {compositionTotals.totalPeople} pessoas/eq.
              </Badge>
            </div>
          </div>

          {services.length > 0 && (
            <div className="grid gap-2">
              <Label>Servicos vinculados</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                {services.map((service) => (
                  <Badge key={service.scopeId} variant="secondary" className="gap-1">
                    {service.scopeName}
                    <button
                      type="button"
                      onClick={() => handleRemoveService(service.scopeId)}
                      className="ml-1 rounded hover:bg-background/60"
                      aria-label={`Remover ${service.scopeName}`}
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
