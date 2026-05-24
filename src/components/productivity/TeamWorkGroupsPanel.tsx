import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Pencil, Plus, Power, Trash2, GitBranch, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTeamWorkGroups, type TeamWorkGroup } from '@/hooks/useTeamWorkGroups';
import { useServiceProductivity } from '@/hooks/useServiceProductivity';
import { usePlanningCapacityModel } from '@/components/smart-planning/hooks/usePlanningCapacityModel';
import { TeamWorkGroupDialog, type ServiceRef, type TeamWorkGroupDialogValues } from './TeamWorkGroupDialog';
import { AddServiceToGroupDialog } from './AddServiceToGroupDialog';
import { toast } from 'sonner';

type SizingStatus = 'ok' | 'attention' | 'overloaded' | 'missing_productivity' | 'no_demand';

const normalizeUnitText = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const formatNumber = (value: number | null | undefined, digits = 0) =>
  Number.isFinite(Number(value)) ? Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '-';

const normalizeGroupName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const calculateWeeklyCapacity = (
  productivityValue: number | null | undefined,
  productivityUnit: string | null | undefined,
  workingDaysPerWeek: number | null | undefined,
  teamCount: number | null | undefined,
) => {
  const value = Number(productivityValue);
  const days = Math.max(Number(workingDaysPerWeek) || 0, 0);
  const teams = Math.max(Number(teamCount) || 0, 0);
  if (!Number.isFinite(value) || value <= 0 || days <= 0 || teams <= 0) return null;

  const unit = normalizeUnitText(productivityUnit);
  if (unit.includes('semana')) return value * teams;
  if (unit.includes('mes')) return (value / 22) * days * teams;
  return value * days * teams;
};

const sizingStatusLabel = (status: SizingStatus) => {
  const labels: Record<SizingStatus, string> = {
    ok: 'OK',
    attention: 'Atencao',
    overloaded: 'Sobrecarregado',
    missing_productivity: 'Sem produtividade',
    no_demand: 'Sem demanda',
  };
  return labels[status];
};

const sizingStatusVariant = (status: SizingStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'overloaded') return 'destructive';
  if (status === 'attention') return 'secondary';
  if (status === 'ok') return 'default';
  return 'outline';
};

interface Props {
  projectId: string | undefined;
  allServices: ServiceRef[];
  suggestions?: { id: string; title: string; services: ServiceRef[] }[];
  openGroupId?: string | null;
  onOpenGroupHandled?: () => void;
}

export function TeamWorkGroupsPanel({
  projectId,
  allServices,
  suggestions = [],
  openGroupId,
  onOpenGroupHandled,
}: Props) {
  const capacityModel = usePlanningCapacityModel(projectId);
  const {
    groups,
    groupServices,
    groupComposition,
    isLoading,
    canEdit,
    createGroup,
    updateGroup,
    toggleActive,
    deleteGroup,
    addServiceToGroup,
    removeServiceFromGroup,
  } = useTeamWorkGroups(projectId);
  const { productivities } = useServiceProductivity(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<Partial<TeamWorkGroupDialogValues> | undefined>(undefined);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const [addServiceFor, setAddServiceFor] = useState<string | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<TeamWorkGroup | null>(null);

  const servicesByGroup = useMemo(() => {
    const map = new Map<string, ServiceRef[]>();
    groupServices.forEach((s) => {
      const ref = allServices.find((x) => x.scopeId === s.scope_id);
      const fallback: ServiceRef = ref ?? {
        macroId: s.macro_id ?? '',
        scopeId: s.scope_id ?? s.id,
        macroName: '',
        scopeName: s.service_name ?? 'Servico',
      };
      const arr = map.get(s.group_id) ?? [];
      arr.push(fallback);
      map.set(s.group_id, arr);
    });
    return map;
  }, [groupServices, allServices]);

  const compositionByGroup = useMemo(() => {
    const map = new Map<string, typeof groupComposition>();
    groupComposition.forEach((row) => {
      if (!row.group_id) return;
      const arr = map.get(row.group_id) ?? [];
      arr.push(row);
      map.set(row.group_id, arr);
    });
    return map;
  }, [groupComposition]);

  const recommendedSizingRows = useMemo(() => {
    return groups.map((group) => {
      const linkedServices = servicesByGroup.get(group.id) ?? [];
      const modelGroup = capacityModel.workGroups.find((item) => item.id === group.id);
      const groupCapacity = capacityModel.serviceCapacityMap.find((entry) => entry.groupId === group.id);
      const peakDemand = capacityModel.overloadDiagnostics
        .filter((item) => item.groupId === group.id)
        .reduce((max, item) => Math.max(max, item.plannedQuantity), 0);
      const currentTeams = Math.max(Number(group.simultaneous_team_count ?? modelGroup?.simultaneousTeamCount ?? 1) || 0, 0);
      const professionalsPerTeam = Math.max(Number(group.professional_count ?? modelGroup?.professionalCount ?? 0) || 0, 0);
      const auxiliariesPerTeam = Math.max(Number(group.auxiliary_count ?? modelGroup?.auxiliaryCount ?? 0) || 0, 0);
      const peoplePerTeam = professionalsPerTeam + auxiliariesPerTeam;
      const currentPeople = peoplePerTeam * currentTeams;
      const weeklyCapacity = groupCapacity?.weeklyCapacity ?? calculateWeeklyCapacity(
        group.productivity_value,
        group.productivity_unit,
        group.working_days_per_week,
        currentTeams,
      );
      const capacityPerTeam = weeklyCapacity !== null && currentTeams > 0 ? weeklyCapacity / currentTeams : null;
      const hasProductivity = weeklyCapacity !== null && weeklyCapacity > 0 && capacityPerTeam !== null && capacityPerTeam > 0;
      const recommendedTeams = hasProductivity && peakDemand > 0
        ? Math.max(Math.ceil(peakDemand / capacityPerTeam), currentTeams)
        : currentTeams;
      const recommendedPeople = peoplePerTeam * recommendedTeams;
      const additionalTeams = Math.max(recommendedTeams - currentTeams, 0);
      const additionalPeople = Math.max(recommendedPeople - currentPeople, 0);
      const overload = weeklyCapacity === null ? 0 : Math.max(peakDemand - weeklyCapacity, 0);
      const surplus = weeklyCapacity === null ? 0 : Math.max(weeklyCapacity - peakDemand, 0);
      const overloadPercent = weeklyCapacity && weeklyCapacity > 0 ? (overload / weeklyCapacity) * 100 : 0;
      const status: SizingStatus =
        !hasProductivity
          ? 'missing_productivity'
          : peakDemand <= 0
            ? 'no_demand'
            : peakDemand <= weeklyCapacity
              ? 'ok'
              : overloadPercent <= 20
                ? 'attention'
                : 'overloaded';
      const recommendation =
        status === 'missing_productivity'
          ? 'Cadastrar produtividade da frente.'
          : status === 'no_demand'
            ? 'Sem demanda planejada suficiente para recomendar equipe.'
            : status === 'ok'
              ? 'Manter equipe atual.'
              : additionalTeams > 0
                ? `Adicionar ${additionalTeams} equipe(s) ou redistribuir metas.`
                : 'Revisar produtividade cadastrada.';

      return {
        group,
        linkedServices,
        weeklyCapacity,
        peakDemand,
        currentTeams,
        currentPeople,
        recommendedTeams,
        recommendedPeople,
        additionalTeams,
        additionalPeople,
        surplus,
        overload,
        status,
        recommendation,
      };
    });
  }, [capacityModel.overloadDiagnostics, capacityModel.serviceCapacityMap, capacityModel.workGroups, groups, servicesByGroup]);

  const recommendedSizingSummary = useMemo(() => ({
    activeGroups: groups.filter((group) => group.active).length,
    missingProductivity: recommendedSizingRows.filter((row) => row.status === 'missing_productivity').length,
    overloaded: recommendedSizingRows.filter((row) => row.status === 'overloaded').length,
    additionalTeams: recommendedSizingRows.reduce((sum, row) => sum + row.additionalTeams, 0),
    additionalPeople: recommendedSizingRows.reduce((sum, row) => sum + row.additionalPeople, 0),
  }), [groups, recommendedSizingRows]);

  const openCreate = () => {
    setEditingGroupId(null);
    setDialogInitial(undefined);
    setDialogOpen(true);
  };

  const openCreateFromSuggestion = (sug: { title: string; services: ServiceRef[] }) => {
    const existing = groups.find((group) => group.active && normalizeGroupName(group.name) === normalizeGroupName(sug.title));
    if (existing) {
      toast.info('Esta frente já existe. Abrimos a frente existente para revisão.');
      openEdit(existing, sug.services);
      return;
    }
    setEditingGroupId(null);
    setDialogInitial({ name: sug.title, services: sug.services });
    setDialogOpen(true);
  };

  const openEdit = (g: TeamWorkGroup, suggestedServices?: ServiceRef[]) => {
    const currentServices = servicesByGroup.get(g.id) ?? [];
    const mergedServices = [...currentServices];
    (suggestedServices ?? []).forEach((service) => {
      const exists = mergedServices.some((item) => item.scopeId === service.scopeId || (
        item.macroId === service.macroId && item.scopeName === service.scopeName
      ));
      if (!exists) mergedServices.push(service);
    });
    setEditingGroupId(g.id);
    setDialogInitial({
      name: g.name,
      description: g.description ?? '',
      base_unit: g.base_unit ?? '',
      productivity_value: g.productivity_value,
      productivity_unit: g.productivity_unit ?? '',
      working_days_per_week: g.working_days_per_week ?? 5,
      simultaneous_team_count: g.simultaneous_team_count ?? 1,
      professional_count: g.professional_count ?? 0,
      auxiliary_count: g.auxiliary_count ?? 0,
      composition: compositionByGroup.get(g.id) ?? [],
      services: mergedServices,
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    if (!openGroupId) return;
    const group = groups.find((item) => item.id === openGroupId);
    if (!group) return;
    setEditingGroupId(group.id);
    setDialogInitial({
      name: group.name,
      description: group.description ?? '',
      base_unit: group.base_unit ?? '',
      productivity_value: group.productivity_value,
      productivity_unit: group.productivity_unit ?? '',
      working_days_per_week: group.working_days_per_week ?? 5,
      simultaneous_team_count: group.simultaneous_team_count ?? 1,
      professional_count: group.professional_count ?? 0,
      auxiliary_count: group.auxiliary_count ?? 0,
      composition: compositionByGroup.get(group.id) ?? [],
      services: servicesByGroup.get(group.id) ?? [],
    });
    setDialogOpen(true);
    onOpenGroupHandled?.();
  }, [compositionByGroup, groups, onOpenGroupHandled, openGroupId, servicesByGroup]);

  const syncGroupServices = async (groupId: string, nextServices: ServiceRef[]) => {
    const currentLinks = groupServices.filter((link) => link.group_id === groupId);
    const nextKeys = new Set(nextServices.map((service) => service.scopeId || `${service.macroId}:${service.scopeName}`));
    const currentKeys = new Set(currentLinks.map((link) => link.scope_id || `${link.macro_id}:${link.service_name}`));

    for (const link of currentLinks) {
      const key = link.scope_id || `${link.macro_id}:${link.service_name}`;
      if (!nextKeys.has(key)) {
        await removeServiceFromGroup(link.id);
      }
    }

    for (const [index, service] of nextServices.entries()) {
      const key = service.scopeId || `${service.macroId}:${service.scopeName}`;
      if (!currentKeys.has(key)) {
        await addServiceToGroup(groupId, {
          macro_id: service.macroId || null,
          scope_id: service.scopeId || null,
          service_name: service.scopeName,
          sequence_order: index,
        });
      }
    }
  };

  const handleSubmit = async (values: TeamWorkGroupDialogValues) => {
    if (editingGroupId) {
      const updated = await updateGroup(editingGroupId, {
        name: values.name,
        description: values.description ?? null,
        base_unit: values.base_unit ?? null,
        productivity_value: values.productivity_value ?? null,
        productivity_unit: values.productivity_unit ?? null,
        working_days_per_week: values.working_days_per_week,
        simultaneous_team_count: values.simultaneous_team_count,
        professional_count: values.professional_count,
        auxiliary_count: values.auxiliary_count,
        composition: values.composition,
      });
      if (updated) {
        await syncGroupServices(editingGroupId, values.services);
      }
    } else {
      const existing = groups.find((group) => group.active && normalizeGroupName(group.name) === normalizeGroupName(values.name));
      if (existing) {
        toast.info('Esta frente já existe. Abrimos a frente existente para revisão.');
        setDialogOpen(false);
        openEdit(existing, values.services);
        return;
      }
      const createdId = await createGroup(
        {
          name: values.name,
          description: values.description ?? null,
          base_unit: values.base_unit ?? null,
          productivity_value: values.productivity_value ?? null,
          productivity_unit: values.productivity_unit ?? null,
          working_days_per_week: values.working_days_per_week,
          simultaneous_team_count: values.simultaneous_team_count,
          professional_count: values.professional_count,
          auxiliary_count: values.auxiliary_count,
          composition: values.composition,
        },
        values.services.map((s, idx) => ({
          macro_id: s.macroId || null,
          scope_id: s.scopeId || null,
          service_name: s.scopeName,
          sequence_order: idx,
        })),
      );
      if (createdId && !groups.some((group) => group.id === createdId)) {
        setEditingGroupId(createdId);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <GitBranch className="h-4 w-4 text-primary" />
            Frentes compartilhadas
          </h3>
          <p className="text-xs text-muted-foreground">
            Agrupa capacidade de equipe. Nao une lancamentos de producao, diario, saldo, Mapa 3D ou medicao.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!canEdit || !projectId}>
          <Plus className="h-4 w-4" />
          Nova frente
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Sugestoes a partir do diagnostico</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((sug) => (
              <Button
                key={sug.id}
                size="sm"
                variant="outline"
                onClick={() => openCreateFromSuggestion(sug)}
                disabled={!canEdit}
              >
                Criar frente: {sug.title}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Dimensionamento recomendado
          </CardTitle>
          <CardDescription>
            Recomendacao de capacidade por frente. Nao altera producao, diario, medicao, Gantt, Linha,
            Semanal ou Previsao oficial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma frente compartilhada cadastrada. Cadastre frentes para obter dimensionamento recomendado.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-5">
                {[
                  ['Frentes ativas', recommendedSizingSummary.activeGroups],
                  ['Sem produtividade', recommendedSizingSummary.missingProductivity],
                  ['Sobrecarregadas', recommendedSizingSummary.overloaded],
                  ['Equipes adicionais', recommendedSizingSummary.additionalTeams],
                  ['Pessoas adicionais', recommendedSizingSummary.additionalPeople],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>

              {capacityModel.diagnostics.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  Algumas fontes de planejamento/capacidade nao puderam ser lidas agora. A recomendacao segue com fallback seguro.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead className="border-b text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2">Frente</th>
                      <th className="p-2">Servicos</th>
                      <th className="p-2">Produtividade</th>
                      <th className="p-2">Dias/sem</th>
                      <th className="p-2">Capacidade</th>
                      <th className="p-2">Demanda pico</th>
                      <th className="p-2">Equipes</th>
                      <th className="p-2">Pessoas</th>
                      <th className="p-2">Sobra/sobrecarga</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Recomendacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendedSizingRows.map((row) => (
                      <tr key={row.group.id} className="border-b last:border-0">
                        <td className="p-2">
                          <div className="font-medium">{row.group.name}</div>
                          {!row.group.active && (
                            <Badge variant="outline" className="mt-1 text-xs">Inativa</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {row.linkedServices.length === 0 ? (
                            <span className="text-muted-foreground">Frente sem servicos vinculados.</span>
                          ) : (
                            <>
                              {row.linkedServices.slice(0, 3).map((service) => service.scopeName).join(', ')}
                              {row.linkedServices.length > 3 ? ` +${row.linkedServices.length - 3}` : ''}
                            </>
                          )}
                        </td>
                        <td className="p-2">
                          {row.group.productivity_value
                            ? `${formatNumber(row.group.productivity_value, 2)} ${row.group.productivity_unit ?? ''}`
                            : 'Sem produtividade'}
                        </td>
                        <td className="p-2">{row.group.working_days_per_week ?? 5}</td>
                        <td className="p-2">
                          {row.weeklyCapacity === null
                            ? 'Sem capacidade'
                            : `${formatNumber(row.weeklyCapacity, 1)}/semana`}
                        </td>
                        <td className="p-2">{row.peakDemand > 0 ? formatNumber(row.peakDemand, 1) : 'Sem demanda'}</td>
                        <td className="p-2">
                          <div>{row.currentTeams} atual</div>
                          <div className="text-xs text-muted-foreground">{row.recommendedTeams} recomendado</div>
                          {row.additionalTeams > 0 && (
                            <div className="text-xs text-destructive">+{row.additionalTeams}</div>
                          )}
                        </td>
                        <td className="p-2">
                          <div>{formatNumber(row.currentPeople)} atual</div>
                          <div className="text-xs text-muted-foreground">{formatNumber(row.recommendedPeople)} recomendado</div>
                          {row.additionalPeople > 0 && (
                            <div className="text-xs text-destructive">+{formatNumber(row.additionalPeople)}</div>
                          )}
                        </td>
                        <td className="p-2">
                          {row.status === 'missing_productivity' ? (
                            'Cadastre produtividade'
                          ) : row.status === 'no_demand' ? (
                            'Sem demanda planejada'
                          ) : row.overload > 0 ? (
                            <span className="text-destructive">{formatNumber(row.overload, 1)} sobrecarga</span>
                          ) : (
                            <span className="text-emerald-600">{formatNumber(row.surplus, 1)} sobra</span>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge variant={sizingStatusVariant(row.status)}>
                            {sizingStatusLabel(row.status)}
                          </Badge>
                        </td>
                        <td className="p-2">{row.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                Este dimensionamento e apenas uma recomendacao de capacidade. A frente compartilhada nao junta
                lancamentos de producao, diario, medicao, saldo, Mapa 3D ou planejamento oficial.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma frente cadastrada. Clique em "Nova frente" ou use uma sugestao acima.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const svcs = servicesByGroup.get(g.id) ?? [];
            const composition = compositionByGroup.get(g.id) ?? [];
            const total = (Number(g.professional_count) || 0) + (Number(g.auxiliary_count) || 0);
            return (
              <Card key={g.id} className={!g.active ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="truncate">{g.name}</span>
                        {!g.active && <Badge variant="outline" className="text-xs">Inativa</Badge>}
                      </CardTitle>
                      {g.description && (
                        <CardDescription className="line-clamp-2">{g.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(g)} disabled={!canEdit}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleActive(g.id, !g.active)}
                        disabled={!canEdit}
                        title={g.active ? 'Desativar' : 'Ativar'}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setGroupToDelete(g)}
                        disabled={!canEdit}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Produtiv.</p>
                      <p className="font-medium">
                        {g.productivity_value ?? '-'} {g.productivity_unit ?? ''}
                      </p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Jornada</p>
                      <p className="font-medium">{g.working_days_per_week ?? 5} dias/sem</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-muted-foreground">Equipes</p>
                      <p className="font-medium">{g.simultaneous_team_count ?? 1}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" /> Total
                      </p>
                      <p className="font-medium">
                        {total} ({g.professional_count ?? 0}P + {g.auxiliary_count ?? 0}A)
                      </p>
                    </div>
                  </div>

                  <div>
                    {composition.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Composicao da frente</p>
                        <div className="flex flex-wrap gap-1.5">
                          {composition.slice(0, 4).map((row) => (
                            <Badge key={row.id ?? `${row.profession_name}-${row.role}`} variant="outline" className="font-normal">
                              {row.profession_name}: {row.quantity} {row.role === 'professional' ? 'prof.' : 'aux.'}
                            </Badge>
                          ))}
                          {composition.length > 4 && (
                            <Badge variant="outline" className="font-normal">+{composition.length - 4}</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">Servicos vinculados ({svcs.length})</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAddServiceFor(g.id)}
                        disabled={!canEdit}
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </Button>
                    </div>
                    {svcs.length === 0 ? (
                      <p className="rounded border border-dashed p-2 text-center text-xs text-muted-foreground">
                        Nenhum servico vinculado.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {groupServices
                          .filter((s) => s.group_id === g.id)
                          .map((link) => {
                            const ref = allServices.find((x) => x.scopeId === link.scope_id);
                            const label = ref?.scopeName ?? link.service_name ?? 'Servico';
                            return (
                              <Badge key={link.id} variant="secondary" className="gap-1 font-normal">
                                {label}
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeServiceFromGroup(link.id)}
                                    className="ml-1 rounded hover:bg-background/60"
                                  >
                                    ×
                                  </button>
                                )}
                              </Badge>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TeamWorkGroupDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialValues={dialogInitial}
        serviceProductivities={productivities}
        onSubmit={handleSubmit}
      />

      {addServiceFor && (
        <AddServiceToGroupDialog
          open
          onClose={() => setAddServiceFor(null)}
          available={allServices}
          alreadyLinkedScopeIds={(servicesByGroup.get(addServiceFor) ?? []).map((s) => s.scopeId)}
          onConfirm={async (list) => {
            for (let i = 0; i < list.length; i++) {
              await addServiceToGroup(addServiceFor, {
                macro_id: list[i].macroId || null,
                scope_id: list[i].scopeId || null,
                service_name: list[i].scopeName,
                sequence_order: i,
              });
            }
          }}
        />
      )}

      <AlertDialog open={!!groupToDelete} onOpenChange={(o) => !o && setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir frente?</AlertDialogTitle>
            <AlertDialogDescription>
              A frente "{groupToDelete?.name}" e seus vinculos de servicos serao removidos. Os lancamentos de producao,
              diario, medicao e Mapa 3D nao sao afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (groupToDelete) {
                  await deleteGroup(groupToDelete.id);
                  setGroupToDelete(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
