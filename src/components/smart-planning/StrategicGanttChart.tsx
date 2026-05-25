import React, { useCallback, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  format,
  differenceInDays,
  addDays,
  startOfWeek,
  startOfMonth,
  eachWeekOfInterval,
  eachDayOfInterval,
  eachMonthOfInterval,
  isWeekend,
} from 'date-fns';
import { toast } from 'sonner';
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
import { Switch } from '@/components/ui/switch';
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
  Clock,
  Settings2,
  Link2,
  Home,
  CalendarDays,
  Plus,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
} from 'lucide-react';
import type { ActiveMacroflowSummary, GanttService } from './hooks/useStrategicGanttData';
import { usePlanningCapacityModel } from './hooks/usePlanningCapacityModel';
import { MacroflowDialog } from './MacroflowDialog';

interface StrategicGanttChartProps {
  projectId?: string;
  services: GanttService[];
  macroflowPackages?: GanttService[];
  projectStartDate: string;
  projectedEndDate: Date | null;
  onUpdateProductivity: (
    macroId: string,
    scopeId: string,
    productivity: number,
    teams: number
  ) => void;
  onUpdatePredecessor: (serviceId: string, predecessorStageId: string | null) => void;
  onMacroflowChanged?: () => Promise<void> | void;
  hasConfiguredMacroflow?: boolean;
  activeMacroflowSummary?: ActiveMacroflowSummary | null;
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

const normalizeGanttText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const getGanttSettingKey = (macroId?: string | null, scopeId?: string | null, serviceName?: string | null) => {
  const macro = String(macroId ?? '').trim();
  const scope = String(scopeId ?? '').trim();
  if (macro || scope) return `${macro || 'sem_macro'}::${scope || 'sem_servico'}`;
  return `name::${normalizeGanttText(serviceName) || 'sem_nome'}`;
};

const getPlannedPercent = (svc: GanttService) => {
  const today = new Date();
  if (today < svc.planned_start) return 0;
  if (today > svc.planned_end) return 100;

  const elapsed = differenceInDays(today, svc.planned_start) + 1;
  return Math.min(100, Math.max(0, (elapsed / Math.max(svc.duration_days, 1)) * 100));
};

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string; text?: string }> = {
  planned:     { color: 'bg-slate-300 dark:bg-slate-600', dot: 'bg-slate-400',   label: 'Planejado',    text: 'text-slate-800 dark:text-slate-100' },
  in_progress: { color: 'bg-blue-500',                    dot: 'bg-blue-500',    label: 'Em Andamento', text: 'text-white' },
  at_risk:     { color: 'bg-amber-400',                   dot: 'bg-amber-400',   label: 'Em Risco',     text: 'text-amber-950' },
  delayed:     { color: 'bg-red-500',                     dot: 'bg-red-500',     label: 'Atrasado',     text: 'text-white' },
  completed:   { color: 'bg-emerald-500',                 dot: 'bg-emerald-500', label: 'Concluído',    text: 'text-white' },
};

const CAPACITY_CONFIG: Record<GanttService['capacity_status'], { label: string; className: string }> = {
  ok:                    { label: 'Capacidade suficiente',        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900' },
  attention:             { label: 'Capacidade apertada',          className: 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900' },
  insufficient:          { label: 'Capacidade insuficiente',      className: 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900' },
  missing_productivity:  { label: 'Sem produtividade cadastrada', className: 'border-slate-200 bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-800' },
};

const PRODUCTIVITY_SOURCE_LABEL: Record<GanttService['productivity_source'], string> = {
  project: 'Produtividade e Equipes',
  default: 'Padrao',
  manual: 'Manual',
  missing: 'Sem produtividade',
};

type GanttScale = 'day' | 'week' | 'month';

const SCALE_CONFIG: Record<GanttScale, { label: string; minZoom: number; maxZoom: number; defaultZoom: number }> = {
  day: { label: 'Dia', minZoom: 32, maxZoom: 96, defaultZoom: 48 },
  week: { label: 'Semana', minZoom: 80, maxZoom: 180, defaultZoom: 120 },
  month: { label: 'Mes', minZoom: 120, maxZoom: 260, defaultZoom: 180 },
};

export function StrategicGanttChart({
  projectId,
  services,
  macroflowPackages,
  projectStartDate,
  projectedEndDate,
  onUpdateProductivity,
  onMacroflowChanged,
  hasConfiguredMacroflow = false,
  activeMacroflowSummary,
}: StrategicGanttChartProps) {
  const { canEdit } = useAuth();
  const capacityModel = usePlanningCapacityModel(projectId);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [editingService, setEditingService] = useState<GanttService | null>(null);
  const [editProductivity, setEditProductivity] = useState(1);
  const [editTeams, setEditTeams] = useState(1);
  const [ganttScale, setGanttScale] = useState<GanttScale>('week');
  const [zoomByScale, setZoomByScale] = useState<Record<GanttScale, number>>({
    day: SCALE_CONFIG.day.defaultZoom,
    week: SCALE_CONFIG.week.defaultZoom,
    month: SCALE_CONFIG.month.defaultZoom,
  });
  const [dragPreview, setDragPreview] = useState<{
    serviceId: string;
    offsetDays: number;
    start: Date;
    end: Date;
  } | null>(null);
  const [stageFilter, setStageFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [capacityFilter, setCapacityFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showHiddenServices, setShowHiddenServices] = useState(false);
  const [showMacroflowDialog, setShowMacroflowDialog] = useState(false);

  const zoom = zoomByScale[ganttScale];
  const dayWidth = ganttScale === 'day' ? zoom : ganttScale === 'week' ? zoom / 7 : zoom / 30;

  const ganttSettingsByKey = useMemo(() => {
    const exact = new Map<string, boolean>();
    const byName = new Map<string, boolean>();
    capacityModel.planningServiceSettings.forEach((setting) => {
      const key = getGanttSettingKey(setting.macroId, setting.scopeId, setting.serviceName);
      exact.set(key, setting.includeInGantt);
      if (setting.serviceName) {
        byName.set(getGanttSettingKey(null, null, setting.serviceName), setting.includeInGantt);
      }
    });
    return { exact, byName };
  }, [capacityModel.planningServiceSettings]);

  const getIncludeInGantt = useCallback((svc: GanttService) => {
    if (capacityModel.loading) return true;
    const exact = ganttSettingsByKey.exact.get(getGanttSettingKey(svc.macro_id, svc.scope_id, svc.scope_name));
    if (exact !== undefined) return exact;
    const byName = ganttSettingsByKey.byName.get(getGanttSettingKey(null, null, svc.scope_name));
    if (byName !== undefined) return byName;
    return true;
  }, [capacityModel.loading, ganttSettingsByKey]);

  const hiddenServiceIds = useMemo(() => {
    const hidden = new Set<string>();
    services.forEach((svc) => {
      if (!getIncludeInGantt(svc)) hidden.add(svc.id);
    });
    return hidden;
  }, [getIncludeInGantt, services]);

  const servicesForGantt = useMemo(
    () => (showHiddenServices ? services : services.filter((svc) => !hiddenServiceIds.has(svc.id))),
    [hiddenServiceIds, services, showHiddenServices]
  );

  const visibleGanttCount = services.length - hiddenServiceIds.size;
  const hiddenGanttCount = hiddenServiceIds.size;

  const stageOptions = useMemo(() => {
    const map = new Map<string, string>();
    servicesForGantt.forEach((svc) => map.set(svc.macro_id, svc.macro_name));
    return Array.from(map.entries());
  }, [servicesForGantt]);

  const serviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    servicesForGantt.forEach((svc) => map.set(svc.scope_id, svc.scope_name));
    return Array.from(map.entries());
  }, [servicesForGantt]);

  const teamOptions = useMemo(
    () => Array.from(new Set(servicesForGantt.map((svc) => String(svc.teams)))).sort((a, b) => Number(a) - Number(b)),
    [servicesForGantt]
  );

  const filteredServices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return servicesForGantt.filter((svc) => {
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
  }, [servicesForGantt, stageFilter, serviceFilter, statusFilter, teamFilter, capacityFilter, searchTerm]);

  const { minDate, maxDate, ticks, totalWidth } = useMemo(() => {
    if (filteredServices.length === 0) {
      return { minDate: new Date(), maxDate: new Date(), ticks: [], totalWidth: 0 };
    }
    const allDates = filteredServices.flatMap((s) => [s.planned_start, s.planned_end]);
    if (projectedEndDate) allDates.push(projectedEndDate);
    allDates.push(new Date());

    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));

    const paddedMin = addDays(startOfWeek(min, { locale: ptBR }), -7);
    const paddedMax = addDays(max, 14);
    const totalDays = Math.max(1, differenceInDays(paddedMax, paddedMin) + 1);
    const interval = { start: paddedMin, end: paddedMax };
    const tickDates = ganttScale === 'day'
      ? eachDayOfInterval(interval)
      : ganttScale === 'week'
        ? eachWeekOfInterval(interval, { locale: ptBR })
        : eachMonthOfInterval({ start: startOfMonth(paddedMin), end: paddedMax });

    return { minDate: paddedMin, maxDate: paddedMax, ticks: tickDates, totalWidth: totalDays * dayWidth };
  }, [filteredServices, projectedEndDate, ganttScale, dayWidth]);

  const getBarPosition = (svc: GanttService) => {
    const left = differenceInDays(svc.planned_start, minDate) * dayWidth;
    const width = Math.max((differenceInDays(svc.planned_end, svc.planned_start) + 1) * dayWidth, 20);
    return { left, width };
  };

  const getTickPosition = (date: Date) => differenceInDays(date, minDate) * dayWidth;

  const getTickWidth = (date: Date) => {
    if (ganttScale === 'day') return dayWidth;
    if (ganttScale === 'week') return dayWidth * 7;
    const nextMonth = startOfMonth(addDays(startOfMonth(date), 32));
    const end = nextMonth > maxDate ? maxDate : nextMonth;
    return Math.max(dayWidth, differenceInDays(end, date) * dayWidth);
  };

  const today = new Date();
  const todayOffset = differenceInDays(today, minDate) * dayWidth;

  const handleScaleChange = (scale: GanttScale) => {
    setGanttScale(scale);
  };

  const handleZoom = (direction: 'in' | 'out' | 'fit') => {
    if (direction === 'fit') {
      setZoomByScale((prev) => ({ ...prev, [ganttScale]: SCALE_CONFIG[ganttScale].defaultZoom }));
      return;
    }

    setZoomByScale((prev) => {
      const config = SCALE_CONFIG[ganttScale];
      const delta = ganttScale === 'day' ? 8 : ganttScale === 'week' ? 20 : 30;
      const next = direction === 'in' ? prev[ganttScale] + delta : prev[ganttScale] - delta;
      return { ...prev, [ganttScale]: Math.min(config.maxZoom, Math.max(config.minZoom, next)) };
    });
  };

  const scrollToToday = () => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;
    viewport.scrollTo({
      left: Math.max(0, todayOffset - viewport.clientWidth / 2),
      behavior: 'smooth',
    });
  };

  const handleBarPointerDown = (event: React.PointerEvent<HTMLDivElement>, svc: GanttService) => {
    if (!canEdit) {
      toast.info('Somente usuarios com permissao de edicao podem alterar datas do Gantt.');
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;

    const handleMove = (moveEvent: PointerEvent) => {
      const rawDays = (moveEvent.clientX - startX) / Math.max(dayWidth, 1);
      const snap = ganttScale === 'month' ? 30 : ganttScale === 'week' ? 7 : 1;
      const offsetDays = Math.round(rawDays / snap) * snap;
      setDragPreview({
        serviceId: svc.id,
        offsetDays,
        start: addDays(svc.planned_start, offsetDays),
        end: addDays(svc.planned_end, offsetDays),
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragPreview((preview) => {
        if (preview && preview.serviceId === svc.id && preview.offsetDays !== 0) {
          toast.info('Alteracao de data simulada no Gantt. Nao foi salva porque nao ha campo persistente claro de inicio/fim por servico nesta fase.');
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleEditOpen = (svc: GanttService) => {
    if (svc.package_type === 'work_group') {
      toast.info('Esta frente é controlada em Produtividade e Equipes.');
      return;
    }
    setEditingService(svc);
    setEditProductivity(svc.productivity);
    setEditTeams(svc.teams);
  };

  const handleEditSave = () => {
    if (!editingService) return;
    if (editingService.package_type === 'work_group') {
      toast.info('Configure frentes compartilhadas em Produtividade e Equipes.');
      setEditingService(null);
      return;
    }
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
      <div className="bg-slate-50 dark:bg-transparent rounded-2xl p-6">
        <Card className="rounded-2xl border-slate-200 dark:border-border shadow-sm">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Home className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Configure os serviços no Planejamento Estratégico para visualizar o Gantt</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasConfiguredMacroflow) {
    return (
      <>
        <div className="bg-slate-50 dark:bg-transparent rounded-2xl p-6">
          <Card className="rounded-2xl border-slate-200 dark:border-border shadow-sm">
            <CardContent className="py-16 text-center">
              <Link2 className="h-12 w-12 mx-auto mb-4 text-primary/70" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                Configure um Macrofluxo para gerar o Gantt.
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                O Gantt usa o Macrofluxo para definir predecessoras, FS/SS e defasagens.
                Sem macrofluxo, o sistema não assume uma sequência automática.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-xs text-muted-foreground">
                Filtros por etapa do contrato ajudam a encontrar serviços, mas não substituem a sequência oficial.
              </p>
              <Button
                className="mt-6 gap-2"
                onClick={() => setShowMacroflowDialog(true)}
                disabled={!canEdit}
              >
                <Plus className="h-4 w-4" />
                Criar/Editar Macrofluxo
              </Button>
            </CardContent>
          </Card>
        </div>
        <MacroflowDialog
          open={showMacroflowDialog}
          onOpenChange={setShowMacroflowDialog}
          projectId={projectId}
          packages={macroflowPackages ?? services}
          canEdit={canEdit}
          onChanged={onMacroflowChanged}
        />
      </>
    );
  }

  return (
    <>
      <div className="bg-slate-50 dark:bg-transparent rounded-2xl p-4 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-foreground">
              Gráfico de Gantt
            </h2>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5">
              Visão estratégica de etapas, serviços e capacidade
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-white dark:bg-card">
                Macrofluxo: {activeMacroflowSummary?.name || 'Principal'} - Principal
              </Badge>
              <span className="text-xs text-muted-foreground">
                O Gantt usa os pacotes e dependências do macrofluxo Principal.
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-full bg-white dark:bg-card"
              onClick={() => setShowMacroflowDialog(true)}
              disabled={!canEdit}
            >
              <Plus className="h-4 w-4" />
              Editar Macrofluxo
            </Button>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-card border border-slate-200 dark:border-border px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-muted-foreground shadow-sm"
              >
                <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                {config.label}
              </div>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: 'Serviços exibidos', value: `${filteredServices.length}/${services.length}`, accent: 'text-slate-900 dark:text-foreground' },
            {
              label: 'Planejado médio',
              value: filteredServices.length
                ? `${(filteredServices.reduce((sum, svc) => sum + getPlannedPercent(svc), 0) / filteredServices.length).toFixed(0)}%`
                : '—',
              accent: 'text-blue-600',
            },
            {
              label: 'Realizado médio',
              value: filteredServices.length
                ? `${(filteredServices.reduce((sum, svc) => sum + svc.completion_percent, 0) / filteredServices.length).toFixed(0)}%`
                : '—',
              accent: 'text-emerald-600',
            },
            {
              label: 'Atrasados / risco',
              value: filteredServices.filter((svc) => ['delayed', 'at_risk'].includes(getServiceStatus(svc))).length,
              accent: 'text-red-600',
            },
            {
              label: 'Ocultos no Gantt',
              value: `${hiddenGanttCount} de ${services.length}`,
              accent: 'text-slate-600',
            },
            {
              label: 'Capacidade insuf.',
              value: filteredServices.filter((svc) => svc.capacity_status === 'insufficient').length,
              accent: 'text-amber-600',
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-muted-foreground font-medium">
                {kpi.label}
              </p>
              <p className={`text-2xl font-semibold mt-1 ${kpi.accent}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card p-3 md:p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-900 dark:text-foreground">
                  {visibleGanttCount} visiveis
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="font-medium text-slate-600 dark:text-muted-foreground">
                  {hiddenGanttCount} ocultos
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="font-medium text-slate-600 dark:text-muted-foreground">
                  {services.length} total
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Servicos marcados como fora do Gantt sao ocultados apenas da visualizacao do cronograma fisico.
                Producao, diario, medicao e Mapa 3D continuam separados por servico.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-2 dark:bg-background">
              <Switch
                id="show-hidden-gantt-services"
                checked={showHiddenServices}
                onCheckedChange={setShowHiddenServices}
              />
              <Label htmlFor="show-hidden-gantt-services" className="cursor-pointer text-xs font-medium">
                Mostrar ocultos
              </Label>
            </div>
          </div>
        </div>

        {/* Filters toolbar */}
        <div className="rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card p-3 md:p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['day', 'week', 'month'] as GanttScale[]).map((scale) => (
                <Button
                  key={scale}
                  size="sm"
                  variant={ganttScale === scale ? 'default' : 'outline'}
                  className="h-8 rounded-full text-xs"
                  onClick={() => handleScaleChange(scale)}
                >
                  {SCALE_CONFIG[scale].label}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs gap-1" onClick={scrollToToday}>
                <CalendarDays className="h-3.5 w-3.5" />
                Hoje
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => handleZoom('fit')}>
                Ajustar
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => handleZoom('out')}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-16 text-center text-[11px] text-muted-foreground">
                Zoom {Math.round((zoom / SCALE_CONFIG[ganttScale].defaultZoom) * 100)}%
              </span>
              <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => handleZoom('in')}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-7">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar etapa, serviço ou pacote"
              className="h-9 text-xs md:col-span-2 rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border focus-visible:ring-blue-500/30"
            />
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border">
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
              <SelectTrigger className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border">
                <SelectValue placeholder="Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os serviços</SelectItem>
                {serviceOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border">
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
              <SelectTrigger className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border">
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
              <SelectTrigger className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-background border-slate-200 dark:border-border">
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
        </div>

        {/* Gantt body */}
        <Card className="rounded-2xl border-slate-200 dark:border-border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {filteredServices.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum serviço encontrado com os filtros atuais.
              </div>
            ) : (
            <ScrollArea className="w-full" ref={scrollAreaRef}>
              <div className="min-w-max">
                {/* Header */}
                <div className="flex border-b border-slate-200 dark:border-border bg-slate-50/80 dark:bg-muted/30 sticky top-0 z-20">
                  <div className="w-96 shrink-0 border-r border-slate-200 dark:border-border px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wide text-slate-600 dark:text-muted-foreground">
                    Etapa / serviço
                  </div>
                  <div className="relative h-[52px]" style={{ width: totalWidth }}>
                    {ticks.map((tick, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-r border-slate-200 dark:border-border text-center text-[11px] py-1.5"
                        style={{ left: getTickPosition(tick), width: getTickWidth(tick) }}
                      >
                        <div className="font-medium text-slate-700 dark:text-foreground">
                          {ganttScale === 'day'
                            ? format(tick, 'dd')
                            : ganttScale === 'week'
                              ? format(tick, "'Sem' w", { locale: ptBR })
                              : format(tick, 'MMM/yyyy', { locale: ptBR })}
                        </div>
                        <div className="text-slate-400 dark:text-muted-foreground">
                          {ganttScale === 'day'
                            ? format(tick, 'EEE', { locale: ptBR })
                            : ganttScale === 'week'
                              ? format(tick, 'dd/MM')
                              : format(tick, 'MMMM', { locale: ptBR })}
                        </div>
                      </div>
                    ))}
                    {todayOffset >= 0 && todayOffset <= totalWidth && (
                      <div className="absolute top-0 bottom-0 z-30 w-0.5 bg-red-500" style={{ left: todayOffset }}>
                        <span className="absolute -top-0.5 left-1 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow">
                          Hoje
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              {filteredServices.map((svc) => {
                const pos = getBarPosition(svc);
                const activeDragPreview = dragPreview?.serviceId === svc.id ? dragPreview : null;
                const dragLeft = activeDragPreview ? pos.left + activeDragPreview.offsetDays * dayWidth : pos.left;
                const status = getServiceStatus(svc);
                const statusConfig = STATUS_CONFIG[status];
                const plannedPercent = getPlannedPercent(svc);
                const variance = svc.completion_percent - plannedPercent;
                const delayDays = status === 'delayed' ? differenceInDays(new Date(), svc.planned_end) : 0;
                const predecessor = svc.depends_on
                  ? services.find((s) => s.stage_id === svc.depends_on)
                  : null;
                const capacityConfig = CAPACITY_CONFIG[svc.capacity_status];
                const isHiddenFromGantt = hiddenServiceIds.has(svc.id);

                return (
                  <div
                    key={svc.id}
                    className={`flex border-b border-slate-100 dark:border-border hover:bg-blue-50/40 dark:hover:bg-muted/20 transition-colors group ${
                      isHiddenFromGantt ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Service label */}
                    <div className="w-96 shrink-0 border-r border-slate-100 dark:border-border px-4 py-3 flex items-start gap-2.5">

                      <div
                        className="mt-1 w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: svc.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate block">
                            {svc.scope_name}
                          </span>
                          {svc.package_type === 'work_group' && (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              Frente
                            </Badge>
                          )}
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {statusConfig.label}
                          </Badge>
                          <Badge variant="outline" className={`h-5 text-[10px] ${capacityConfig.className}`}>
                            {capacityConfig.label}
                          </Badge>
                          {isHiddenFromGantt && (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              Oculto no Gantt
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {svc.macro_name}
                        </div>
                        {svc.package_type === 'work_group' && Boolean(svc.internal_services?.length) && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            {svc.internal_services?.length} serviços internos: {svc.internal_services?.slice(0, 3).map((item) => item.scope_name).join(', ')}
                            {(svc.internal_services?.length || 0) > 3 ? ` +${(svc.internal_services?.length || 0) - 3}` : ''}
                          </div>
                        )}
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

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="p-1 rounded hover:bg-accent"
                                onClick={() => setShowMacroflowDialog(true)}
                              >
                                <Link2 className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Editar sequência no Macrofluxo</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>}
                    </div>

                    {/* Bar area */}
                    <div className="relative py-2" style={{ width: totalWidth }}>
                      <div className="pointer-events-none absolute inset-0">
                        {ticks.map((tick, index) => (
                          <div
                            key={`${tick.toISOString()}-${index}`}
                            className={`absolute top-0 bottom-0 border-r border-slate-100 dark:border-border/60 ${
                              ganttScale === 'day' && isWeekend(tick)
                                ? 'bg-slate-100/70 dark:bg-slate-800/30'
                                : ''
                            }`}
                            style={{ left: getTickPosition(tick), width: getTickWidth(tick) }}
                          />
                        ))}
                      </div>
                      {/* Today marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30"
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
                              className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-full cursor-grab active:cursor-grabbing transition-all hover:h-7 hover:shadow-md ring-1 ring-black/5 overflow-hidden ${statusConfig.color} ${activeDragPreview ? 'ring-2 ring-red-400 shadow-lg' : ''} ${isHiddenFromGantt ? 'grayscale' : ''}`}
                              style={{ left: dragLeft, width: pos.width }}
                              onClick={() => handleEditOpen(svc)}
                              onPointerDown={(event) => handleBarPointerDown(event, svc)}
                            >
                              {/* Progress */}
                              {svc.completion_percent > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-black/20"
                                  style={{ width: `${svc.completion_percent}%` }}
                                />
                              )}
                              <div className={`relative z-10 px-2.5 flex items-center gap-1 h-full text-[11px] font-medium whitespace-nowrap ${statusConfig.text || 'text-white'}`}>
                                <Clock className="h-3 w-3 shrink-0 opacity-80" />
                                {svc.completion_percent > 0
                                  ? `${svc.completion_percent.toFixed(0)}%`
                                  : `${svc.duration_days}d`}
                              </div>
                              <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-white/25" />
                              <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-white/25" />
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
                              {activeDragPreview && (
                                <>
                                  <div className="font-medium text-red-600">Preview de arraste</div>
                                  <div>Novo inicio: {format(activeDragPreview.start, 'dd/MM/yyyy')}</div>
                                  <div>Novo fim: {format(activeDragPreview.end, 'dd/MM/yyyy')}</div>
                                  <div>Deslocamento: {activeDragPreview.offsetDays >= 0 ? '+' : ''}{activeDragPreview.offsetDays} dias</div>
                                </>
                              )}
                              <div>Duracao planejada: {svc.duration_days} dias</div>
                              <div>Duracao sugerida: {svc.suggested_duration_days ? `${svc.suggested_duration_days} dias` : 'sem produtividade cadastrada'}</div>
                              {svc.duration_delta_days !== null && (
                                <div>Diferenca de prazo: {svc.duration_delta_days >= 0 ? '+' : ''}{svc.duration_delta_days} dias</div>
                              )}
                              <div>Capacidade: {capacityConfig.label}</div>
                              {isHiddenFromGantt && (
                                <div>Configuracao: oculto da visualizacao principal do Gantt.</div>
                              )}
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
              <div className="flex border-t bg-slate-50/80 dark:bg-muted/20">
                <div className="w-96 shrink-0 border-r px-3 py-2 text-xs text-muted-foreground">
                  Linha de hoje
                </div>
                <div className="relative h-8" style={{ width: totalWidth }}>
                  {todayOffset >= 0 && todayOffset <= totalWidth && (
                    <div className="absolute top-0 bottom-0 z-30 w-0.5 bg-red-500" style={{ left: todayOffset }} />
                  )}
                </div>
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          )}
          </CardContent>
        </Card>
      </div>



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

      <MacroflowDialog
        open={showMacroflowDialog}
        onOpenChange={setShowMacroflowDialog}
        projectId={projectId}
        packages={macroflowPackages ?? services}
        canEdit={canEdit}
        onChanged={onMacroflowChanged}
      />
    </>
  );
}
