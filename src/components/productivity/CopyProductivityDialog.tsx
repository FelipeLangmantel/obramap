import { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Project } from '@/contexts/ConstructionContext';
import type { ServiceProductivity, TeamMemberRow, TeamRoleType } from '@/hooks/useServiceProductivity';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ServiceInfo {
  macroId: string;
  scopeId: string;
  macroName: string;
  scopeName: string;
}

interface PreviewRow {
  source: ServiceInfo;
  target: ServiceInfo | null;
  productivity: ServiceProductivity;
  existing: ServiceProductivity | null;
  status: 'copy' | 'existing' | 'conflict' | 'not_found';
}

interface Props {
  open: boolean;
  currentProject: Project;
  projects: Project[];
  destinationProductivities: ServiceProductivity[];
  onClose: () => void;
  onCopied: () => Promise<void> | void;
}

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const serviceKey = (service: Pick<ServiceInfo, 'macroId' | 'scopeId'>) =>
  `${service.macroId}::${service.scopeId}`;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error || 'erro desconhecido');

const readProjectServices = (project: Project | null | undefined): ServiceInfo[] => {
  if (!project?.macrosTemplate?.length) return [];
  return project.macrosTemplate.flatMap((macro) =>
    (macro.scopes || []).map((scope) => ({
      macroId: macro.id,
      scopeId: scope.id,
      macroName: macro.name,
      scopeName: scope.name,
    })),
  );
};

const aggregateCounts = (rows: TeamMemberRow[] | undefined) => ({
  professionals: (rows || [])
    .filter((row) => row.role_type === 'professional')
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
  helpers: (rows || [])
    .filter((row) => row.role_type === 'helper')
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
});

const statusLabel: Record<PreviewRow['status'], string> = {
  copy: 'sera copiado',
  existing: 'ja existe no destino',
  conflict: 'conflito',
  not_found: 'nao encontrado',
};

const statusVariant: Record<PreviewRow['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  copy: 'default',
  existing: 'secondary',
  conflict: 'destructive',
  not_found: 'outline',
};

export function CopyProductivityDialog({
  open,
  currentProject,
  projects,
  destinationProductivities,
  onClose,
  onCopied,
}: Props) {
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [sourceProductivities, setSourceProductivities] = useState<ServiceProductivity[]>([]);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [search, setSearch] = useState('');
  const [copyProductivity, setCopyProductivity] = useState(true);
  const [copyTeamComposition, setCopyTeamComposition] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  const sourceProject = useMemo(
    () => projects.find((project) => project.id === sourceProjectId) ?? null,
    [projects, sourceProjectId],
  );

  const availableSourceProjects = useMemo(
    () => projects.filter((project) => project.id !== currentProject.id),
    [currentProject.id, projects],
  );

  useEffect(() => {
    if (!open) return;
    setSourceProjectId((current) => current || availableSourceProjects[0]?.id || '');
  }, [availableSourceProjects, open]);

  useEffect(() => {
    let alive = true;

    async function loadSourceProductivities() {
      if (!sourceProjectId) {
        setSourceProductivities([]);
        return;
      }

      setIsLoadingSource(true);
      try {
        const { data, error } = await supabase
          .from('project_service_productivity')
          .select('*')
          .eq('project_id', sourceProjectId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (error) throw error;

        const rows = (data || []) as ServiceProductivity[];
        const ids = rows.map((row) => row.id);
        const compositionByProductivity: Record<string, TeamMemberRow[]> = {};

        if (ids.length) {
          const { data: composition, error: compositionError } = await supabase
            .from('project_service_team_composition')
            .select('id, productivity_id, role_name, role_type, quantity')
            .in('productivity_id', ids);
          if (compositionError) throw compositionError;

          (composition || []).forEach((row) => {
            const items = compositionByProductivity[row.productivity_id] || [];
            items.push({
              id: row.id,
              role_name: row.role_name,
              role_type: (row.role_type as TeamRoleType) || 'professional',
              quantity: Number(row.quantity) || 0,
            });
            compositionByProductivity[row.productivity_id] = items;
          });
        }

        if (!alive) return;
        setSourceProductivities(
          rows.map((row) => ({
            ...row,
            team_composition: compositionByProductivity[row.id] || [],
          })),
        );
      } catch (error) {
        console.error('[CopyProductivityDialog] load source', error);
        if (alive) {
          setSourceProductivities([]);
          toast.error('Nao foi possivel carregar a produtividade da obra origem.');
        }
      } finally {
        if (alive) setIsLoadingSource(false);
      }
    }

    loadSourceProductivities();

    return () => {
      alive = false;
    };
  }, [sourceProjectId]);

  const previewRows = useMemo<PreviewRow[]>(() => {
    const sourceServices = readProjectServices(sourceProject);
    const targetServices = readProjectServices(currentProject);

    const sourceByExact = new Map(sourceServices.map((service) => [serviceKey(service), service]));
    const targetByExact = new Map(targetServices.map((service) => [serviceKey(service), service]));
    const targetByMacroAndScopeName = new Map<string, ServiceInfo>();
    const targetByScopeName = new Map<string, ServiceInfo[]>();

    targetServices.forEach((service) => {
      targetByMacroAndScopeName.set(
        `${normalizeText(service.macroName)}::${normalizeText(service.scopeName)}`,
        service,
      );
      const current = targetByScopeName.get(normalizeText(service.scopeName)) || [];
      current.push(service);
      targetByScopeName.set(normalizeText(service.scopeName), current);
    });

    const existingByExact = new Map(
      destinationProductivities.map((productivity) => [
        `${productivity.macro_id}::${productivity.scope_id}`,
        productivity,
      ]),
    );
    const existingByScope = new Map(destinationProductivities.map((productivity) => [productivity.scope_id, productivity]));

    return sourceProductivities.map((productivity) => {
      const source =
        sourceByExact.get(`${productivity.macro_id}::${productivity.scope_id}`) || {
          macroId: productivity.macro_id,
          scopeId: productivity.scope_id,
          macroName: 'Etapa origem',
          scopeName: productivity.scope_id,
        };

      const exactTarget = targetByExact.get(`${productivity.macro_id}::${productivity.scope_id}`) || null;
      const nameTarget = targetByMacroAndScopeName.get(
        `${normalizeText(source.macroName)}::${normalizeText(source.scopeName)}`,
      ) || null;
      const serviceNameCandidates = targetByScopeName.get(normalizeText(source.scopeName)) || [];
      const uniqueServiceNameTarget = serviceNameCandidates.length === 1 ? serviceNameCandidates[0] : null;
      const target = exactTarget || nameTarget || uniqueServiceNameTarget;
      const hasConflict = !target && serviceNameCandidates.length > 1;
      const existing = target
        ? existingByExact.get(serviceKey(target)) || existingByScope.get(target.scopeId) || null
        : null;

      const status: PreviewRow['status'] =
        hasConflict
          ? 'conflict'
          : !target
            ? 'not_found'
            : existing
              ? 'existing'
              : 'copy';

      return {
        source,
        target,
        productivity,
        existing,
        status,
      };
    });
  }, [currentProject, destinationProductivities, sourceProductivities, sourceProject]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) return previewRows;
    return previewRows.filter((row) =>
      normalizeText(`${row.source.macroName} ${row.source.scopeName} ${row.target?.macroName} ${row.target?.scopeName}`)
        .includes(normalizedSearch),
    );
  }, [previewRows, search]);

  const counters = useMemo(() => ({
    copy: previewRows.filter((row) => row.status === 'copy').length,
    existing: previewRows.filter((row) => row.status === 'existing').length,
    conflict: previewRows.filter((row) => row.status === 'conflict').length,
    notFound: previewRows.filter((row) => row.status === 'not_found').length,
    willApply: previewRows.filter((row) =>
      row.target && (row.status === 'copy' || (overwriteExisting && row.status === 'existing')),
    ).length,
  }), [overwriteExisting, previewRows]);

  const handleApply = async () => {
    if (!sourceProjectId || !currentProject.id) return;
    if (!copyProductivity && !copyTeamComposition) {
      toast.info('Selecione ao menos uma opcao para copiar.');
      return;
    }

    const rowsToApply = previewRows.filter((row) =>
      row.target && (row.status === 'copy' || (overwriteExisting && row.status === 'existing')),
    );

    if (!rowsToApply.length) {
      toast.info('Nenhum servico compativel encontrado para copiar.');
      return;
    }

    const companyId = currentProject.companyId || rowsToApply[0]?.productivity.company_id;
    if (!companyId) {
      toast.error('Nao foi possivel identificar a empresa da obra destino.');
      return;
    }

    setIsApplying(true);
    try {
      let copied = 0;

      for (const row of rowsToApply) {
        if (!row.target) continue;
        const teamRows = copyTeamComposition ? (row.productivity.team_composition || []) : undefined;
        const aggregate = aggregateCounts(teamRows);
        const payload = {
          productivity_value: copyProductivity
            ? row.productivity.productivity_value
            : row.existing?.productivity_value ?? row.productivity.productivity_value,
          productivity_unit: copyProductivity
            ? row.productivity.productivity_unit
            : row.existing?.productivity_unit ?? row.productivity.productivity_unit,
          working_days_per_week: row.productivity.working_days_per_week || 5,
          default_team_count: row.productivity.default_team_count || 1,
          professionals_per_team: copyTeamComposition
            ? aggregate.professionals
            : row.existing?.professionals_per_team ?? row.productivity.professionals_per_team ?? 0,
          helpers_per_team: copyTeamComposition
            ? aggregate.helpers
            : row.existing?.helpers_per_team ?? row.productivity.helpers_per_team ?? 0,
          notes: row.productivity.notes,
        };

        let savedId = row.existing?.id || null;

        if (row.existing) {
          const { data, error } = await supabase
            .from('project_service_productivity')
            .update(payload)
            .eq('id', row.existing.id)
            .select('id')
            .single();
          if (error) throw error;
          savedId = data?.id || savedId;
        } else {
          const { data, error } = await supabase
            .from('project_service_productivity')
            .insert({
              company_id: companyId,
              project_id: currentProject.id,
              macro_id: row.target.macroId,
              scope_id: row.target.scopeId,
              ...payload,
            })
            .select('id')
            .single();
          if (error) throw error;
          savedId = data?.id || null;
        }

        if (savedId && copyTeamComposition) {
          const { error: deleteError } = await supabase
            .from('project_service_team_composition')
            .delete()
            .eq('productivity_id', savedId);
          if (deleteError) throw deleteError;

          const compositionPayload = (teamRows || [])
            .filter((member) => member.role_name?.trim() && Number(member.quantity) > 0)
            .map((member) => ({
              productivity_id: savedId,
              role_name: member.role_name.trim(),
              role_type: member.role_type,
              quantity: Number(member.quantity) || 0,
            }));

          if (compositionPayload.length) {
            const { error: insertError } = await supabase
              .from('project_service_team_composition')
              .insert(compositionPayload);
            if (insertError) throw insertError;
          }
        }

        copied += 1;
      }

      toast.success(`${copied} configuracao(oes) copiada(s) com sucesso.`);
      await onCopied();
      onClose();
    } catch (error) {
      console.error('[CopyProductivityDialog] apply', error);
      toast.error('Nao foi possivel copiar as configuracoes: ' + getErrorMessage(error));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" />
            Copiar produtividade de outra obra
          </DialogTitle>
          <DialogDescription>
            Reaproveite configuracoes planejadas de produtividade e equipes em obras com a mesma EAP ou servicos equivalentes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="space-y-2">
              <Label>Obra origem</Label>
              <Select value={sourceProjectId} onValueChange={setSourceProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma obra" />
                </SelectTrigger>
                <SelectContent>
                  {availableSourceProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border bg-background p-3 text-sm">
              <p className="text-xs text-muted-foreground">Obra destino</p>
              <p className="font-medium">{currentProject.name}</p>
            </div>

            <div className="space-y-3">
              <Label>O que copiar</Label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={copyProductivity}
                  onCheckedChange={(value) => setCopyProductivity(Boolean(value))}
                />
                <span>Produtividade planejada e unidade</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={copyTeamComposition}
                  onCheckedChange={(value) => setCopyTeamComposition(Boolean(value))}
                />
                <span>Equipe padrao, profissionais e ajudantes</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={overwriteExisting}
                  onCheckedChange={(value) => setOverwriteExisting(Boolean(value))}
                />
                <span>Sobrescrever configuracoes existentes no destino</span>
              </label>
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5" />
                Copia segura
              </div>
              Nao copia producao realizada, diarios, medicoes, progresso das casas, fotos ou historico executado.
              Frentes compartilhadas nao sao copiadas automaticamente nesta etapa.
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Encontrados</p>
                <p className="text-lg font-semibold">{counters.copy}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Ja configurados</p>
                <p className="text-lg font-semibold">{counters.existing}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Sem correspondente</p>
                <p className="text-lg font-semibold">{counters.notFound}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Conflitos</p>
                <p className="text-lg font-semibold">{counters.conflict}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Serao aplicados</p>
                <p className="text-lg font-semibold">{counters.willApply}</p>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar etapa ou servico na previa"
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[52vh] rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Produtividade</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSource ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Carregando produtividade da obra origem...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length ? (
                    filteredRows.map((row) => (
                      <TableRow key={`${row.productivity.id}-${row.source.scopeId}`}>
                        <TableCell className="min-w-52">
                          <p className="font-medium">{row.source.scopeName}</p>
                          <p className="text-xs text-muted-foreground">{row.source.macroName}</p>
                        </TableCell>
                        <TableCell className="min-w-52">
                          {row.target ? (
                            <>
                              <p className="font-medium">{row.target.scopeName}</p>
                              <p className="text-xs text-muted-foreground">{row.target.macroName}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sem destino seguro</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.productivity.productivity_value} {row.productivity.productivity_unit}
                        </TableCell>
                        <TableCell>
                          {row.productivity.professionals_per_team ?? 0} prof. +{' '}
                          {row.productivity.helpers_per_team ?? 0} aux. /{' '}
                          {row.productivity.default_team_count ?? 1} equipe(s)
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[row.status]}>{statusLabel[row.status]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        Nenhuma configuracao encontrada para os filtros atuais.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isApplying}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleApply} disabled={isApplying || isLoadingSource || !sourceProjectId}>
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Copiar configuracoes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
