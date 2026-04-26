import { useEffect, useMemo, useState } from 'react';
import { ServiceProductivity, TeamMemberRow } from '@/hooks/useServiceProductivity';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Users, Calculator, Ruler, Info, Plus, Trash2, HardHat } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useConstruction } from '@/contexts/ConstructionContext';
import { isPhysicalUnit } from '@/hooks/useServiceCapacities';
import {
  groupProfessionsByCategory,
  findProfession,
  PROFESSIONS_CATALOG,
} from '@/data/professionsCatalog';
import { cn } from '@/lib/utils';

interface Props {
  service: {
    macroId: string;
    scopeId: string;
    macroName: string;
    scopeName: string;
    macroColor: string;
  };
  existingProductivity?: ServiceProductivity;
  onClose: () => void;
  onSave: (input: {
    macro_id: string;
    scope_id: string;
    productivity_value: number;
    productivity_unit: string;
    working_days_per_week?: number;
    default_team_count?: number;
    professionals_per_team?: number;
    helpers_per_team?: number;
    notes?: string;
    team_composition?: TeamMemberRow[];
  }) => Promise<any>;
}

function buildProductivityUnit(symbol: string | null | undefined, label: string | null | undefined) {
  const sym = (symbol || '').trim();
  const lbl = (label || '').trim();
  if (!sym) {
    return {
      symbol: 'casa',
      label: 'Casa',
      perDay: 'casas/dia',
      perWeek: 'casas/semana',
      isPhysical: false,
    };
  }
  if (isPhysicalUnit(sym)) {
    return {
      symbol: sym,
      label: lbl || sym,
      perDay: `${sym}/dia`,
      perWeek: `${sym}/semana`,
      isPhysical: true,
    };
  }
  return {
    symbol: sym,
    label: lbl || sym,
    perDay: `${sym}/dia`,
    perWeek: `${sym}/semana`,
    isPhysical: false,
  };
}

export function ServiceProductivityDialog({ service, existingProductivity, onClose, onSave }: Props) {
  const { currentProject } = useConstruction();
  const [isSaving, setIsSaving] = useState(false);
  const [unitInfo, setUnitInfo] = useState(buildProductivityUnit(null, null));
  const [unitLoaded, setUnitLoaded] = useState(false);

  const [formData, setFormData] = useState({
    productivity_value: existingProductivity?.productivity_value || 1,
    productivity_unit: existingProductivity?.productivity_unit || '',
    working_days_per_week: existingProductivity?.working_days_per_week || 5,
    default_team_count: existingProductivity?.default_team_count || 1,
    notes: existingProductivity?.notes || '',
  });

  // Composição da equipe (cada linha = uma profissão por equipe)
  const [team, setTeam] = useState<TeamMemberRow[]>(
    existingProductivity?.team_composition?.length
      ? existingProductivity.team_composition.map((t) => ({ ...t }))
      : []
  );
  const [picker, setPicker] = useState<string>('');

  const grouped = useMemo(() => groupProfessionsByCategory(), []);

  useEffect(() => {
    let cancelled = false;
    const resolveUnit = async () => {
      if (!currentProject?.id) return;
      try {
        const { data: contractRow } = await supabase
          .from('project_contract_services')
          .select('unit_label, unit_symbol')
          .eq('project_id', currentProject.id)
          .eq('scope_id', service.scopeId)
          .maybeSingle();

        let symbol = contractRow?.unit_symbol || null;
        let label = contractRow?.unit_label || null;

        if (!symbol) {
          const { data: projRow } = await supabase
            .from('projects')
            .select('default_unit_label, default_unit_symbol')
            .eq('id', currentProject.id)
            .maybeSingle();
          symbol = projRow?.default_unit_symbol || null;
          label = projRow?.default_unit_label || null;
        }

        if (cancelled) return;
        const info = buildProductivityUnit(symbol, label);
        setUnitInfo(info);

        if (!existingProductivity) {
          setFormData((prev) => ({
            ...prev,
            productivity_unit: prev.productivity_unit || info.perWeek,
          }));
        }
        setUnitLoaded(true);
      } catch (err) {
        console.error('[ServiceProductivityDialog] resolveUnit', err);
        setUnitLoaded(true);
      }
    };
    resolveUnit();
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, service.scopeId, existingProductivity]);

  const addRoleFromPicker = (name: string) => {
    if (!name) return;
    if (team.some((t) => t.role_name.toLowerCase() === name.toLowerCase())) return;
    const cat = findProfession(name);
    setTeam((prev) => [
      ...prev,
      {
        role_name: name,
        role_type: cat?.type || 'professional',
        quantity: 1,
      },
    ]);
    setPicker('');
  };

  const updateRow = (idx: number, patch: Partial<TeamMemberRow>) => {
    setTeam((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setTeam((prev) => prev.filter((_, i) => i !== idx));
  };

  const totals = useMemo(() => {
    const profPerTeam = team
      .filter((t) => t.role_type === 'professional')
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const helpPerTeam = team
      .filter((t) => t.role_type === 'helper')
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    const teams = formData.default_team_count;
    return {
      profPerTeam,
      helpPerTeam,
      perTeam: profPerTeam + helpPerTeam,
      totalProf: profPerTeam * teams,
      totalHelp: helpPerTeam * teams,
      totalPeople: (profPerTeam + helpPerTeam) * teams,
    };
  }, [team, formData.default_team_count]);

  const handleSave = async () => {
    if (team.length === 0) {
      // Permitir mas avisar
      const ok = window.confirm(
        'Você não adicionou nenhuma profissão à equipe. Deseja salvar mesmo assim? (O serviço aparecerá como "sem equipe configurada" no histograma.)'
      );
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      await onSave({
        macro_id: service.macroId,
        scope_id: service.scopeId,
        productivity_value: formData.productivity_value,
        productivity_unit: formData.productivity_unit,
        working_days_per_week: formData.working_days_per_week,
        default_team_count: formData.default_team_count,
        professionals_per_team: totals.profPerTeam,
        helpers_per_team: totals.helpPerTeam,
        notes: formData.notes,
        team_composition: team,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const totalCapacity = formData.default_team_count * formData.productivity_value;

  const unitOptions = [
    { value: unitInfo.perWeek, label: unitInfo.perWeek },
    { value: unitInfo.perDay, label: unitInfo.perDay },
  ];

  // Profissões disponíveis (que ainda não foram adicionadas)
  const isAlreadyAdded = (name: string) =>
    team.some((t) => t.role_name.toLowerCase() === name.toLowerCase());

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: service.macroColor }} />
            <span className="truncate">{service.scopeName}</span>
          </DialogTitle>
          <DialogDescription>
            Configure produtividade e a composição detalhada da equipe para {service.macroName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Unidade base */}
          <div className="rounded-lg border bg-muted/40 p-3 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 text-sm min-w-0">
              <span className="text-muted-foreground">Unidade base do serviço:</span>{' '}
              <Badge variant="secondary" className="font-mono ml-1">
                {unitInfo.symbol}
              </Badge>
              {unitInfo.symbol === 'casa' && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  Esta obra não tem tipologia/unidade cadastrada — o sistema adota{' '}
                  <strong>1 casa</strong> como unidade padrão.
                </p>
              )}
            </div>
          </div>

          {/* Produtividade */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Produtividade Base
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor *</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0.01}
                  value={formData.productivity_value}
                  onChange={(e) =>
                    setFormData({ ...formData, productivity_value: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade *</Label>
                <Select
                  value={formData.productivity_unit}
                  onValueChange={(value) => setFormData({ ...formData, productivity_unit: value })}
                  disabled={!unitLoaded}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={unitLoaded ? 'Selecione...' : 'Carregando...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Dias úteis por semana</Label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={formData.working_days_per_week}
                  onChange={(e) =>
                    setFormData({ ...formData, working_days_per_week: parseInt(e.target.value) || 5 })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Equipes simultâneas</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.default_team_count}
                  onChange={(e) =>
                    setFormData({ ...formData, default_team_count: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
          </div>

          {/* Composição da equipe — DETALHADA POR PROFISSÃO */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Composição da Equipe (por profissão)
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Defina <strong>1 equipe-padrão</strong> — multiplicada pelo nº de equipes simultâneas.
              </p>
            </div>

            {/* Picker rápido */}
            <div className="flex gap-2">
              <Select value={picker} onValueChange={(v) => addRoleFromPicker(v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="+ Adicionar profissão..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {grouped.map(([cat, items]) => (
                    <SelectGroup key={cat}>
                      <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {cat}
                      </SelectLabel>
                      {items.map((p) => (
                        <SelectItem
                          key={p.name}
                          value={p.name}
                          disabled={isAlreadyAdded(p.name)}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                p.type === 'professional' ? 'bg-primary' : 'bg-amber-500'
                              )}
                            />
                            {p.name}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {p.type === 'professional' ? 'prof.' : 'aux.'}
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
                onClick={() =>
                  setTeam((prev) => [
                    ...prev,
                    { role_name: '', role_type: 'professional', quantity: 1 },
                  ])
                }
                title="Adicionar profissão personalizada"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Lista das funções */}
            {team.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Nenhuma profissão adicionada ainda. Selecione acima
                (ex.: <strong>Pedreiro</strong>, <strong>Auxiliar de Pedreiro</strong>).
              </div>
            ) : (
              <div className="space-y-2">
                {team.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 p-2"
                  >
                    <Input
                      list="profession-suggestions"
                      placeholder="Nome da profissão"
                      value={row.role_name}
                      onChange={(e) => updateRow(idx, { role_name: e.target.value })}
                      className="flex-1 min-w-0 h-8 text-sm"
                    />
                    <Select
                      value={row.role_type}
                      onValueChange={(v) =>
                        updateRow(idx, { role_type: v as 'professional' | 'helper' })
                      }
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Profissional</SelectItem>
                        <SelectItem value="helper">Auxiliar</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(idx, { quantity: parseInt(e.target.value) || 1 })
                      }
                      className="w-16 h-8 text-sm shrink-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeRow(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <datalist id="profession-suggestions">
                  {PROFESSIONS_CATALOG.map((p) => (
                    <option key={p.name} value={p.name} />
                  ))}
                </datalist>
              </div>
            )}

            {/* Resumo da equipe */}
            {team.length > 0 && (
              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                <Badge variant="secondary" className="justify-center font-mono">
                  {totals.profPerTeam} prof./eq.
                </Badge>
                <Badge variant="outline" className="justify-center font-mono">
                  {totals.helpPerTeam} aux./eq.
                </Badge>
                <Badge className="justify-center font-mono bg-primary/10 text-primary border-primary/20">
                  {totals.perTeam} pessoas/eq.
                </Badge>
              </div>
            )}
          </div>

          {/* Resumo */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <HardHat className="h-4 w-4 text-primary" />
              Resumo do dimensionamento
            </h4>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{formData.default_team_count}</strong>{' '}
              equipe(s) × <strong className="text-foreground">{totals.perTeam}</strong>{' '}
              pessoa(s) por equipe ={' '}
              <span className="font-semibold text-foreground">
                {totals.totalPeople} pessoa(s) total
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              ({totals.totalProf} profissionais + {totals.totalHelp} auxiliares)
            </p>
            <p className="text-sm text-muted-foreground">
              Capacidade estimada:{' '}
              <span className="font-semibold text-foreground">
                {totalCapacity} {formData.productivity_unit}
              </span>
            </p>
          </div>

          {/* Observações */}
          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea
              placeholder="Notas opcionais..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !unitLoaded}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
