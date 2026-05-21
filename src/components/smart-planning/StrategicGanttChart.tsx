import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  format,
  differenceInDays,
  addDays,
  startOfWeek,
  eachWeekOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Clock,
  Settings2,
  Link2,
  Home,
} from 'lucide-react';
import type { GanttService } from './hooks/useStrategicGanttData';

interface StrategicGanttChartProps {
  services: GanttService[];
  projectStartDate: string;
  projectedEndDate: Date | null;
  onUpdateProductivity: (
    macroId: string,
    scopeId: string,
    productivity: number,
    teams: number
  ) => void;
  onUpdatePredecessor: (serviceId: string, predecessorStageId: string | null) => void;
}

const getServiceStatus = (svc: GanttService) => {
  if (svc.completion_percent >= 100) return 'completed';
  if (svc.completion_percent > 0) {
    const today = new Date();
    if (today > svc.planned_end) return 'delayed';
    const daysLeft = differenceInDays(svc.planned_end, today);
    if (daysLeft < 3 && svc.completion_percent < 50) return 'at_risk';
    return 'in_progress';
  }
  return 'planned';
};

const getPlannedPercent = (svc: GanttService) => {
  const today = new Date();
  if (today < svc.planned_start) return 0;
  if (today > svc.planned_end) return 100;

  const elapsed = differenceInDays(today, svc.planned_start) + 1;
  return Math.min(100, Math.max(0, (elapsed / Math.max(svc.duration_days, 1)) * 100));
};

const STATUS_CONFIG: Record<string, { color: string; label: string; text?: string }> = {
  planned: { color: 'bg-muted', label: 'Planejado', text: 'text-foreground' },
  in_progress: { color: 'bg-primary', label: 'Em Andamento', text: 'text-primary-foreground' },
  at_risk: { color: 'bg-amber-500', label: 'Em Risco', text: 'text-white' },
  delayed: { color: 'bg-destructive', label: 'Atrasado', text: 'text-destructive-foreground' },
  completed: { color: 'bg-emerald-500', label: 'Concluído' },
};

const CAPACITY_CONFIG: Record<GanttService['capacity_status'], { label: string; className: string }> = {
  ok: { label: 'Capacidade suficiente', className: 'border-emerald-300 text-emerald-700 dark:text-emerald-300' },
  attention: { label: 'Capacidade apertada', className: 'border-amber-300 text-amber-700 dark:text-amber-300' },
  insufficient: { label: 'Capacidade insuficiente', className: 'border-red-300 text-red-700 dark:text-red-300' },
  missing_productivity: { label: 'Sem produtividade cadastrada', className: 'border-slate-300 text-muted-foreground' },
};

const PRODUCTIVITY_SOURCE_LABEL: Record<GanttService['productivity_source'], string> = {
  project: 'Especifica da obra',
  default: 'Padrao',
  manual: 'Manual',
  missing: 'Sem produtividade',
};

export function StrategicGanttChart({
  services,
  projectStartDate,
  projectedEndDate,
  onUpdateProductivity,
  onUpdatePredecessor,
}: StrategicGanttChartProps) {
  const { canEdit } = useAuth();
  const [editingService, setEditingService] = useState<GanttService | null>(null);
  const [editProductivity, setEditProductivity] = useState(1);
  const [editTeams, setEditTeams] = useState(1);
  const [stageFilter, setStageFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const stageOptions = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach((svc) => map.set(svc.macro_id, svc.macro_name));
    return Array.from(map.entries());
  }, [services]);

  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach((svc) => map.set(svc.scope_id, svc.scope_name));
    return Array.from(map.entries());
  }, [services]);

  const teamOptions = useMemo(
    () => Array.from(new Set(services.map((svc) => String(svc.teams)))).sort((a, b) => Number(a) - Number(b)),
    [services]
  );

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return services.filter((svc) => {
      const status = getServiceStatus(svc);
      if (stageFilter !== 'all' && svc.macro_id !== stageFilter) return false;
      if (serviceFilter !== 'all' && svc.scope_id !== serviceFilter) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (teamFilter !== 'all' && String(svc.teams) !== teamFilter) return false;
      if (capacityFilter !== 'all' && svc.capacity_status !== capacityFilter) return false;
      if (normalizedSearch) {
        const searchable = [
          svc.name,
          svc.macro_name,
          svc.scope_name,
          String(svc.total_houses),
          String(svc.executed_houses),
          String(svc.remaining_houses),
        ].join(' ').toLowerCase();

        if (!searchable.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [services, stageFilter, serviceFilter, statusFilter, teamFilter, capacityFilter, searchTerm]);

  const { minDate, weeks, dayWidth, totalWidth } = useMemo(() => {
    if (filteredServices.length === 0) {
      return { minDate: new Date(), weeks: [], dayWidth: 30, totalWidth: 0 };
    }
    const allDates = filteredServices.flatMap((s) => [s.planned_start, s.planned_end]);
    if (projectedEndDate) allDates.push(projectedEndDate);

    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));

    const paddedMin = addDays(startOfWeek(min, { locale: ptBR }), -7);
    const paddedMax = addDays(max, 14);
    const totalDays = differenceInDays(paddedMax, paddedMin);
    const dayW = 30;

    const weeksList = eachWeekOfInterval(
      { start: paddedMin, end: paddedMax },
      { locale: ptBR }
    );

    return { minDate: paddedMin, weeks: weeksList, dayWidth: dayW, totalWidth: totalDays * dayW };
  }, [filteredServices, projectedEndDate]);

  const getBarPosition = (svc: GanttService) => {
    const left = differenceInDays(svc.planned_start, minDate) * dayWidth;
    const width = Math.max((differenceInDays(svc.planned_end, svc.planned_start) + 1) * dayWidth, 20);
    return { left, width };
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate) * dayWidth;

  const handleEditOpen = (svc: GanttService) => {
    setEditingService(svc);
    setEditProductivity(svc.productivity);
    setEditTeams(svc.teams);
  };

  const handleEditSave = () => {
    if (!editingService) return;
    onUpdateProductivity(
      editingService.macro_id,
      editingService.scope_id,
      editProductivity,
      editTeams
    );
    setEditingService(null);
  };

  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Home className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Configure os serviços no Planejamento Estratégico para visualizar o Gantt</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg">Gráfico de Gantt</CardTitle>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                <Badge key={key} variant="outline" className="gap-1 text-xs">
                  <div className={`w-2 h-2 rounded-full ${config.color}`} />
                  {config.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-7">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar etapa, servico ou pacote"
              className="h-8 text-xs md:col-span-2"
            />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {stageOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Servico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os servicos</SelectItem>
                {serviceOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {teamOptions.map((team) => (
                  <SelectItem key={team} value={team}>{team} equipe(s)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={capacityFilter} onValueChange={setCapacityFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Capacidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda capacidade</SelectItem>
                {Object.entries(CAPACITY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>{config.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">Servicos exibidos</p>
              <p className="text-lg font-semibold">{filteredServices.length}/{services.length}</p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">Planejado medio</p>
              <p className="text-lg font-semibold">
                {filteredServices.length
                  ? `${(filteredServices.reduce((sum, svc) => sum + getPlannedPercent(svc), 0) / filteredServices.length).toFixed(0)}%`
                  : '-'}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">Realizado medio</p>
              <p className="text-lg font-semibold">
                {filteredServices.length
                  ? `${(filteredServices.reduce((sum, svc) => sum + svc.completion_percent, 0) / filteredServices.length).toFixed(0)}%`
                  : '-'}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">Atrasados / risco</p>
              <p className="text-lg font-semibold">
                {filteredServices.filter((svc) => ['delayed', 'at_risk'].includes(getServiceStatus(svc))).length}
              </p>
            </div>
            <div className="rounded-lg border bg-background p-3">
              <p className="text-muted-foreground">Capacidade insuf.</p>
              <p className="text-lg font-semibold">
                {filteredServices.filter((svc) => svc.capacity_status === 'insufficient').length}
              </p>
            </div>
          </div>

          {filteredServices.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Nenhum servico encontrado com os filtros atuais.
            </div>
          ) : (
          <ScrollArea className="w-full">
            <div className="min-w-max">
              {/* Header */}
              <div className="flex border-b">
                <div className="w-96 shrink-0 border-r px-3 py-2 bg-muted/30 font-medium text-sm">
                  Etapa / servico / leitura
                </div>
                <div className="flex" style={{ width: totalWidth }}>
                  {weeks.map((week, i) => (
                    <div
                      key={i}
                      className="border-r text-center text-xs py-1 bg-muted/30"
                      style={{ width: dayWidth * 7 }}
                    >
                      {format(week, "'Sem' w", { locale: ptBR })}
                      <div className="text-muted-foreground">{format(week, 'dd/MM')}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Services */}
              {filteredServices.map((svc) => {
                const pos = getBarPosition(svc);
                const status = getServiceStatus(svc);
                const statusConfig = STATUS_CONFIG[status];
                const plannedPercent = getPlannedPercent(svc);
                const variance = svc.completion_percent - plannedPercent;
                const delayDays = status === 'delayed' ? differenceInDays(new Date(), svc.planned_end) : 0;
                const predecessor = svc.depends_on
                  ? services.find((s) => s.stage_id === svc.depends_on)
                  : null;
                const capacityConfig = CAPACITY_CONFIG[svc.capacity_status];

                return (
                  <div key={svc.id} className="flex border-b hover:bg-muted/20 group">
                    {/* Service label */}
                    <div className="w-96 shrink-0 border-r px-3 py-2 flex items-start gap-2">
                      <div
                        className="mt-1 w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: svc.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate block">
                            {svc.scope_name}
                          </span>
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {statusConfig.label}
                          </Badge>
                          <Badge variant="outline" className={`h-5 text-[10px] ${capacityConfig.className}`}>
                            {capacityConfig.label}
                          </Badge>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {svc.macro_name}
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>{svc.executed_houses}/{svc.total_houses} casas</span>
                          <span>{svc.duration_days} dias</span>
                          <span>{svc.productivity} un/dia</span>
                          <span>{svc.teams} equipe(s)</span>
                          <span>Sug. {svc.suggested_duration_days ? `${svc.suggested_duration_days}d` : '-'}</span>
                          <span>{PRODUCTIVITY_SOURCE_LABEL[svc.productivity_source]}</span>
                          <span>Plan. {plannedPercent.toFixed(0)}%</span>
                          <span>Real {svc.completion_percent.toFixed(0)}%</span>
                        </div>
                        <div className="hidden">
                          <span>{svc.remaining_houses} restantes</span>
                          <span>•</span>
                          <span>{svc.productivity} un/dia</span>
                          <span>•</span>
                          <span>{svc.duration_days}d</span>
                        </div>
                      </div>
                      {canEdit && <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Edit productivity */}
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="p-1 rounded hover:bg-accent"
                                onClick={() => handleEditOpen(svc)}
                              >
                                <Settings2 className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Editar produtividade</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {/* Edit predecessor */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="p-1 rounded hover:bg-accent">
                              <Link2 className="h-3 w-3 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3" align="start">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium">Predecessora</Label>
                              <Select
                                value={svc.depends_on || 'none'}
                                onValueChange={(v) =>
                                  onUpdatePredecessor(svc.id, v === 'none' ? null : v)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Nenhuma" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhuma</SelectItem>
                                  {services
                                    .filter((s) => s.id !== svc.id && s.stage_id)
                                    .map((s) => (
                                      <SelectItem key={s.stage_id!} value={s.stage_id!}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              {svc.depends_on && (
                                <p className="text-[10px] text-muted-foreground">
                                  Inicia após a predecessora terminar
                                </p>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>}
                    </div>

                    {/* Bar area */}
                    <div className="relative py-2" style={{ width: totalWidth }}>
                      {/* Today marker */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-primary z-10"
                        style={{ left: todayOffset }}
                      />

                      {/* Dependency arrow (simplified) */}
                      {svc.depends_on && (() => {
                        const pred = services.find((s) => s.stage_id === svc.depends_on);
                        if (!pred) return null;
                        const predEnd = differenceInDays(pred.planned_end, minDate) * dayWidth;
                        const svcStart = pos.left;
                        return (
                          <div
                            className="absolute top-1/2 h-px bg-muted-foreground/40"
                            style={{
                              left: predEnd,
                              width: Math.max(svcStart - predEnd, 0),
                            }}
                          />
                        );
                      })()}

                      {/* Task bar */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 h-7 rounded cursor-pointer transition-all hover:h-8 ${statusConfig.color}`}
                              style={{ left: pos.left, width: pos.width }}
                              onClick={() => handleEditOpen(svc)}
                            >
                              {/* Progress */}
                              {svc.completion_percent > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-black/20 rounded-l"
                                  style={{ width: `${svc.completion_percent}%` }}
                                />
                              )}
                              <div className={`relative z-10 px-2 flex items-center gap-1 h-full text-xs font-medium whitespace-nowrap ${statusConfig.text || 'text-white'}`}>
                                <Clock className="h-3 w-3 shrink-0" />
                                {svc.completion_percent > 0
                                  ? `${svc.completion_percent.toFixed(0)}%`
                                  : `${svc.duration_days}d`}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="text-sm space-y-1">
                              <div className="font-medium">{svc.scope_name}</div>
                              <div className="text-muted-foreground">{svc.macro_name}</div>
                              <div>Casas: {svc.executed_houses}/{svc.total_houses} realizadas, {svc.remaining_houses} restantes</div>
                              <div>Equipe: {svc.teams} equipe(s)</div>
                              <div>Produtividade usada: {svc.has_productivity ? `${svc.productivity.toFixed(2)} un/dia` : 'sem cadastro'}</div>
                              <div>Fonte da produtividade: {PRODUCTIVITY_SOURCE_LABEL[svc.productivity_source]}</div>
                              <div>Unidade cadastrada: {svc.productivity_unit}</div>
                              <div>Inicio planejado: {format(svc.planned_start, 'dd/MM/yyyy')}</div>
                              <div>Fim planejado: {format(svc.planned_end, 'dd/MM/yyyy')}</div>
                              <div>Duracao planejada: {svc.duration_days} dias</div>
                              <div>Duracao sugerida: {svc.suggested_duration_days ? `${svc.suggested_duration_days} dias` : 'sem produtividade cadastrada'}</div>
                              {svc.duration_delta_days !== null && (
                                <div>Diferenca de prazo: {svc.duration_delta_days >= 0 ? '+' : ''}{svc.duration_delta_days} dias</div>
                              )}
                              <div>Capacidade: {capacityConfig.label}</div>
                              <div>Status: {statusConfig.label}</div>
                              <div>Planejado x realizado: {plannedPercent.toFixed(0)}% x {svc.completion_percent.toFixed(0)}%</div>
                              <div>Diferenca: {variance >= 0 ? '+' : ''}{variance.toFixed(0)} p.p.</div>
                              {delayDays > 0 && <div>Atraso: {delayDays} dias</div>}
                              <div>Predecessora: {predecessor?.name || 'Nenhuma'}</div>
                            </div>
                            <div className="hidden">
                              <div className="font-medium">{svc.name}</div>
                              <div>Início: {format(svc.planned_start, 'dd/MM/yyyy')}</div>
                              <div>Término: {format(svc.planned_end, 'dd/MM/yyyy')}</div>
                              <div>Duração: {svc.duration_days} dias</div>
                              <div>Restante: {svc.remaining_houses} casas</div>
                              <div>Produtividade: {svc.productivity} un/dia × {svc.teams} equipe(s)</div>
                              <div>Progresso: {svc.completion_percent.toFixed(1)}%</div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                );
              })}

              {/* Projected end */}
              {projectedEndDate && (
                <div className="flex border-b bg-amber-50 dark:bg-amber-950/20">
                  <div className="w-96 shrink-0 border-r px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                    📅 Término Projetado
                  </div>
                  <div className="relative py-2" style={{ width: totalWidth }}>
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                      style={{
                        left: differenceInDays(projectedEndDate, minDate) * dayWidth,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingService} onOpenChange={(o) => !o && setEditingService(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-primary" />
              Editar Serviço
            </DialogTitle>
            <DialogDescription>{editingService?.name}</DialogDescription>
          </DialogHeader>

          {editingService && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <Home className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="font-bold">{editingService.remaining_houses}</p>
                  <p className="text-[10px] text-muted-foreground">Casas restantes</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="font-bold">
                    {editProductivity > 0
                      ? Math.ceil(
                          editingService.remaining_houses / (editProductivity * editTeams)
                        )
                      : '-'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Dias estimados</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Produtividade (casas/dia por equipe)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0.01}
                    value={editProductivity}
                    onChange={(e) => setEditProductivity(parseFloat(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número de Equipes</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editTeams}
                    onChange={(e) => setEditTeams(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacidade total:</span>
                  <span className="font-medium">{(editProductivity * editTeams).toFixed(1)} casas/dia</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duração:</span>
                  <span className="font-medium">
                    {Math.ceil(editingService.remaining_houses / Math.max(editProductivity * editTeams, 0.01))} dias
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingService(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleEditSave}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
