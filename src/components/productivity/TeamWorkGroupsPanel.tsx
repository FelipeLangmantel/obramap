import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Power, Trash2, GitBranch, Users } from 'lucide-react';
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
import { TeamWorkGroupDialog, type ServiceRef, type TeamWorkGroupDialogValues } from './TeamWorkGroupDialog';
import { AddServiceToGroupDialog } from './AddServiceToGroupDialog';

interface Props {
  projectId: string | undefined;
  allServices: ServiceRef[];
  suggestions?: { id: string; title: string; services: ServiceRef[] }[];
}

export function TeamWorkGroupsPanel({ projectId, allServices, suggestions = [] }: Props) {
  const {
    groups,
    groupServices,
    isLoading,
    canEdit,
    createGroup,
    updateGroup,
    toggleActive,
    deleteGroup,
    addServiceToGroup,
    removeServiceFromGroup,
  } = useTeamWorkGroups(projectId);

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

  const openCreate = () => {
    setEditingGroupId(null);
    setDialogInitial(undefined);
    setDialogOpen(true);
  };

  const openCreateFromSuggestion = (sug: { title: string; services: ServiceRef[] }) => {
    setEditingGroupId(null);
    setDialogInitial({ name: sug.title, services: sug.services });
    setDialogOpen(true);
  };

  const openEdit = (g: TeamWorkGroup) => {
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
      services: servicesByGroup.get(g.id) ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (values: TeamWorkGroupDialogValues) => {
    if (editingGroupId) {
      await updateGroup(editingGroupId, {
        name: values.name,
        description: values.description ?? null,
        base_unit: values.base_unit ?? null,
        productivity_value: values.productivity_value ?? null,
        productivity_unit: values.productivity_unit ?? null,
        working_days_per_week: values.working_days_per_week,
        simultaneous_team_count: values.simultaneous_team_count,
        professional_count: values.professional_count,
        auxiliary_count: values.auxiliary_count,
      });
    } else {
      await createGroup(
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
        },
        values.services.map((s, idx) => ({
          macro_id: s.macroId || null,
          scope_id: s.scopeId || null,
          service_name: s.scopeName,
          sequence_order: idx,
        })),
      );
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
