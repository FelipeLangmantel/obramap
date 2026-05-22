import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, addWeeks, differenceInDays, endOfMonth, format, isWeekend, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  GripVertical,
  Link2,
  MousePointer2,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { useConstruction } from '@/contexts/ConstructionContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { GanttService } from './hooks/useStrategicGanttData';

interface LineOfBalanceProps {
  ganttServices: GanttService[];
  projectStartDate: string;
  onUpdatePredecessor?: (serviceId: string, predecessorStageId: string | null) => Promise<void>;
}

type FlowScale = 'day' | 'week' | 'month';

type TimelineColumn = {
  key: string;
  label: string;
  subLabel: string;
  start: Date;
  end: Date;
  width: number;
  x: number;
  isWeekendColumn: boolean;
};

type UnitRow = {
  id: number;
  houseNumber: number;
  label: string;
  groupId: string;
  groupName: string;
};

type UnitGroup = {
  id: string;
  name: string;
  rows: UnitRow[];
};

type WorkPackage = {
  key: string;
  service: GanttService;
  unit: UnitRow;
  start: Date;
  end: Date;
  durationDays: number;
  teams: number;
  x: number;
  width: number;
  y: number;
  color: string;
  isExecuted: boolean;
  isSimulated: boolean;
};

type PackageOverride = {
  offsetDays?: number;
  durationDays?: number;
  teams?: number;
};

type DragState = {
  packageKey: string;
  mode: 'move' | 'resize-right';
  startClientX: number;
  originalStart: Date;
  originalEnd: Date;
  originalDuration: number;
  previewOffsetDays: number;
  previewDurationDays: number;
};

const COLORS = [
  '#475569', '#ef4444', '#f97316', '#ca8a04', '#16a34a',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#0f766e',
  '#65a30d', '#e11d48', '#9333ea', '#0284c7', '#4f46e5',
];

const SCALE_LABELS: Record<FlowScale, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mes',
};

const BASE_COLUMN_WIDTH: Record<FlowScale, number> = {
  day: 42,
  week: 118,
  month: 170,
};

const ROW_HEIGHT = 38;
const GROUP_HEIGHT = 34;
const LEFT_PANEL_WIDTH = 260;
const HEADER_HEIGHT = 72;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const monthDiff = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();

const formatShortDate = (date: Date) => format(date, 'dd/MM/yyyy', { locale: ptBR });

const getMacroflowPresets = (services: GanttService[]) => {
  const match = (patterns: string[]) => {
    const found = services.filter((svc) => {
      const text = normalize(`${svc.macro_name} ${svc.scope_name} ${svc.name}`);
      return patterns.some((pattern) => text.includes(pattern));
    });
    return found.length ? found : services;
  };

  return [
    {
      id: 'housing',
      label: 'Unidades Habitacionais',
      description: 'Casas, apartamentos ou unidades repetitivas',
      services,
    },
    {
      id: 'initial',
      label: 'Servicos Iniciais',
      description: 'Preparacao, canteiro e mobilizacao',
      services: match(['topografia', 'limpeza', 'canteiro', 'mobilizacao', 'locacao']),
    },
    {
      id: 'water-sewer',
      label: 'Redes Agua e Esgoto',
      description: 'Redes, caixas, ligacoes e testes',
      services: match(['agua', 'esgoto', 'rede', 'caixa', 'ligacao', 'teste']),
    },
    {
      id: 'infrastructure',
      label: 'Infraestrutura',
      description: 'Ruas, drenagem, pavimentacao e urbanizacao',
      services: match(['infra', 'rua', 'drenagem', 'paviment', 'urbanizacao', 'terraplenagem']),
    },
  ];
};

const buildTimelineColumns = (
  scale: FlowScale,
  startDate: Date,
  endDate: Date,
  zoom: number
): TimelineColumn[] => {
  const width = BASE_COLUMN_WIDTH[scale] * zoom;
  const columns: TimelineColumn[] = [];
  let cursor =
    scale === 'month'
      ? startOfMonth(startDate)
      : scale === 'week'
        ? startOfWeek(startDate, { weekStartsOn: 1 })
        : startOfDay(startDate);
  let x = 0;

  while (cursor <= endDate) {
    const columnStart = cursor;
    const columnEnd =
      scale === 'month'
        ? endOfMonth(cursor)
        : scale === 'week'
          ? addDays(cursor, 6)
          : cursor;

    columns.push({
      key: `${scale}-${columnStart.toISOString()}`,
      label:
        scale === 'month'
          ? format(columnStart, 'MMM yyyy', { locale: ptBR })
          : scale === 'week'
            ? `Sem ${format(columnStart, 'dd/MM', { locale: ptBR })}`
            : format(columnStart, 'dd', { locale: ptBR }),
      subLabel:
        scale === 'month'
          ? format(columnStart, 'yyyy', { locale: ptBR })
          : scale === 'week'
            ? `${format(columnStart, 'dd', { locale: ptBR })}-${format(columnEnd, 'dd/MM', { locale: ptBR })}`
            : format(columnStart, 'EEE', { locale: ptBR }),
      start: columnStart,
      end: columnEnd,
      width,
      x,
      isWeekendColumn: scale === 'day' && isWeekend(columnStart),
    });

    x += width;
    cursor = scale === 'month' ? addMonths(cursor, 1) : scale === 'week' ? addWeeks(cursor, 1) : addDays(cursor, 1);
  }

  return columns;
};

const getXForDate = (date: Date, columns: TimelineColumn[], scale: FlowScale) => {
  if (!columns.length) return 0;
  const target = startOfDay(date);
  const first = columns[0];
  const last = columns[columns.length - 1];

  if (target <= first.start) return 0;
  if (target >= last.end) return last.x + last.width;

  if (scale === 'day') {
    const days = differenceInDays(target, first.start);
    return days * first.width;
  }

  if (scale === 'week') {
    const days = differenceInDays(target, first.start);
    return (days / 7) * first.width;
  }

  const months = monthDiff(first.start, target);
  const column = columns[Math.max(0, Math.min(months, columns.length - 1))];
  const daysInMonth = Math.max(1, differenceInDays(column.end, column.start) + 1);
  const offset = differenceInDays(target, column.start);
  return column.x + (offset / daysInMonth) * column.width;
};

const getDaysFromPixels = (pixels: number, columns: TimelineColumn[], scale: FlowScale) => {
  if (!columns.length) return 0;
  const width = columns[0].width;
  if (scale === 'month') return Math.round((pixels / width) * 30);
  if (scale === 'week') return Math.round((pixels / width) * 7);
  return Math.round(pixels / width);
};

export function LineOfBalance({ ganttServices, projectStartDate, onUpdatePredecessor }: LineOfBalanceProps) {
  const { canEdit } = useAuth();
  const { currentProject } = useConstruction();
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);
  const [selectedMacroflowId, setSelectedMacroflowId] = useState('housing');
  const [scale, setScale] = useState<FlowScale>('week');
  const [zoom, setZoom] = useState(1);
  const [simulationMode, setSimulationMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, PackageOverride>>({});
  const [selectedPackage, setSelectedPackage] = useState<WorkPackage | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const sortedServices = useMemo(() => {
    return [...ganttServices].sort((a, b) => a.sequence_order - b.sequence_order);
  }, [ganttServices]);

  const macroflows = useMemo(() => getMacroflowPresets(sortedServices), [sortedServices]);
  const selectedMacroflow = macroflows.find((flow) => flow.id === selectedMacroflowId) || macroflows[0];
  const flowServices = selectedMacroflow?.services || sortedServices;

  const maxUnits = useMemo(() => {
    const fromServices = ganttServices.length ? Math.max(...ganttServices.map((s) => s.total_houses)) : 0;
    const fromProject = currentProject?.houses?.length || currentProject?.totalHouses || 0;
    return Math.max(fromServices, fromProject);
  }, [currentProject?.houses?.length, currentProject?.totalHouses, ganttServices]);

  const unitGroups = useMemo<UnitGroup[]>(() => {
    const houses = currentProject?.houses || [];
    const quadras = currentProject?.quadras || [];

    if (houses.length > 0) {
      const rows = houses
        .map((house: any) => {
          const houseNumber = Number(house.house_number || house.id);
          const quadra = quadras.find((q: any) => q.houses?.includes(houseNumber) || q.id === house.quadra_id);
          const groupName = quadra?.name || quadra?.label || quadra?.numero || `Quadra ${Math.ceil(houseNumber / 15)}`;
          return {
            id: houseNumber,
            houseNumber,
            label: `${groupName} - Casa ${String(houseNumber).padStart(2, '0')}`,
            groupId: String(quadra?.id || groupName),
            groupName,
          };
        })
        .sort((a, b) => a.houseNumber - b.houseNumber);

      const grouped = new Map<string, UnitGroup>();
      rows.forEach((row) => {
        if (!grouped.has(row.groupId)) {
          grouped.set(row.groupId, { id: row.groupId, name: row.groupName, rows: [] });
        }
        grouped.get(row.groupId)!.rows.push(row);
      });
      return Array.from(grouped.values());
    }

    const rows = Array.from({ length: maxUnits }, (_, index) => {
      const houseNumber = index + 1;
      const groupIndex = Math.floor(index / 15);
      const groupName = `Quadra ${String.fromCharCode(65 + groupIndex)}`;
      return {
        id: houseNumber,
        houseNumber,
        label: `${groupName} - Casa ${String(houseNumber).padStart(2, '0')}`,
        groupId: `quadra-${groupIndex}`,
        groupName,
      };
    });

    const grouped = new Map<string, UnitGroup>();
    rows.forEach((row) => {
      if (!grouped.has(row.groupId)) {
        grouped.set(row.groupId, { id: row.groupId, name: row.groupName, rows: [] });
      }
      grouped.get(row.groupId)!.rows.push(row);
    });
    return Array.from(grouped.values());
  }, [currentProject?.houses, currentProject?.quadras, maxUnits]);

  const visibleRows = useMemo(() => {
    const rows: Array<{ type: 'group'; group: UnitGroup } | { type: 'unit'; unit: UnitRow; group: UnitGroup }> = [];
    unitGroups.forEach((group) => {
      rows.push({ type: 'group', group });
      if (!collapsedGroups.has(group.id)) {
        group.rows.forEach((unit) => rows.push({ type: 'unit', unit, group }));
      }
    });
    return rows;
  }, [collapsedGroups, unitGroups]);

  const timelineBounds = useMemo(() => {
    if (!projectStartDate || !flowServices.length) {
      const start = startOfDay(new Date());
      return { start, end: addDays(start, 60) };
    }

    const projectStart = startOfDay(new Date(projectStartDate));
    const minStart = new Date(Math.min(...flowServices.map((svc) => svc.planned_start.getTime()), projectStart.getTime()));
    const maxEnd = new Date(Math.max(...flowServices.map((svc) => svc.planned_end.getTime()), projectStart.getTime()));
    return {
      start: addDays(startOfDay(minStart), -7),
      end: addDays(startOfDay(maxEnd), 21),
    };
  }, [flowServices, projectStartDate]);

  const columns = useMemo(
    () => buildTimelineColumns(scale, timelineBounds.start, timelineBounds.end, zoom),
    [scale, timelineBounds.end, timelineBounds.start, zoom]
  );

  const chartWidth = columns.length ? columns[columns.length - 1].x + columns[columns.length - 1].width : 0;
  const chartHeight = visibleRows.reduce((height, row) => height + (row.type === 'group' ? GROUP_HEIGHT : ROW_HEIGHT), 0);
  const todayX = getXForDate(new Date(), columns, scale);
  const todayVisible = todayX >= 0 && todayX <= chartWidth;

  const rowTopByUnit = useMemo(() => {
    let top = 0;
    const map = new Map<number, number>();
    visibleRows.forEach((row) => {
      if (row.type === 'unit') {
        map.set(row.unit.houseNumber, top);
        top += ROW_HEIGHT;
      } else {
        top += GROUP_HEIGHT;
      }
    });
    return map;
  }, [visibleRows]);

  const packages = useMemo<WorkPackage[]>(() => {
    const rows = unitGroups.flatMap((group) => group.rows);
    return flowServices.flatMap((svc, svcIdx) => {
      const color = COLORS[svcIdx % COLORS.length];
      const serviceDuration = Math.max(1, differenceInDays(svc.planned_end, svc.planned_start) + 1);
      const total = Math.max(svc.total_houses, 1);
      const daysPerUnit = serviceDuration / total;
      const shownUnits = rows.slice(0, total);

      return shownUnits.map((unit, unitIndex) => {
        const packageKey = `${svc.id}::${unit.houseNumber}`;
        const override = overrides[packageKey];
        const baseStart = addDays(svc.planned_start, Math.round(unitIndex * daysPerUnit));
        const baseDuration = Math.max(1, Math.ceil(daysPerUnit));
        const durationDays = Math.max(1, override?.durationDays || baseDuration);
        const teams = Math.max(1, override?.teams || svc.teams || 1);
        const start = addDays(baseStart, override?.offsetDays || 0);
        const end = addDays(start, durationDays - 1);
        const x = getXForDate(start, columns, scale);
        const endX = getXForDate(addDays(end, 1), columns, scale);
        const top = rowTopByUnit.get(unit.houseNumber);

        if (top === undefined) return null;

        return {
          key: packageKey,
          service: svc,
          unit,
          start,
          end,
          durationDays,
          teams,
          x,
          width: Math.max(24, endX - x),
          y: top + 5,
          color,
          isExecuted: unitIndex < svc.executed_houses,
          isSimulated: Boolean(override),
        };
      }).filter(Boolean) as WorkPackage[];
    });
  }, [columns, flowServices, overrides, rowTopByUnit, scale, unitGroups]);

  const totalActivities = flowServices.reduce((sum, svc) => sum + svc.total_houses, 0);
  const totalExecuted = flowServices.reduce((sum, svc) => sum + svc.executed_houses, 0);
  const plannedAvg = flowServices.length
    ? flowServices.reduce((sum, svc) => {
        const total = Math.max(1, differenceInDays(svc.planned_end, svc.planned_start) + 1);
        const elapsed = differenceInDays(new Date(), svc.planned_start);
        return sum + clamp((elapsed / total) * 100, 0, 100);
      }, 0) / flowServices.length
    : 0;
  const realAvg = flowServices.length
    ? flowServices.reduce((sum, svc) => sum + svc.completion_percent, 0) / flowServices.length
    : 0;
  const deviation = realAvg - plannedAvg;
  const simulatedEndDate = useMemo(() => {
    if (!packages.length) return null;
    return new Date(Math.max(...packages.map((pkg) => pkg.end.getTime())));
  }, [packages]);
  const originalEndDate = flowServices.length
    ? new Date(Math.max(...flowServices.map((svc) => svc.planned_end.getTime())))
    : null;
  const simulatedImpactDays = simulatedEndDate && originalEndDate
    ? differenceInDays(simulatedEndDate, originalEndDate)
    : 0;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      const deltaPx = event.clientX - dragState.startClientX;
      const deltaDays = getDaysFromPixels(deltaPx, columns, scale);
      if (dragState.mode === 'move') {
        setDragState((current) => current ? { ...current, previewOffsetDays: deltaDays } : current);
      } else {
        setDragState((current) =>
          current
            ? { ...current, previewDurationDays: Math.max(1, dragState.originalDuration + deltaDays) }
            : current
        );
      }
    };

    const handlePointerUp = () => {
      if (!dragState) return;
      if (!simulationMode) {
        toast.info('Ative Simular para mover pacotes sem alterar o planejamento oficial.');
        setDragState(null);
        return;
      }

      setOverrides((current) => {
        const previous = current[dragState.packageKey] || {};
        const originalOffset = previous.offsetDays || 0;
        return {
          ...current,
          [dragState.packageKey]: {
            ...previous,
            offsetDays: dragState.mode === 'move' ? originalOffset + dragState.previewOffsetDays : previous.offsetDays,
            durationDays: dragState.mode === 'resize-right' ? dragState.previewDurationDays : previous.durationDays,
          },
        };
      });
      toast.success('Pacote atualizado na simulacao local');
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [columns, dragState, scale, simulationMode]);

  const syncScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
    if (leftPanelRef.current) leftPanelRef.current.scrollTop = event.currentTarget.scrollTop;
  };

  const scrollToToday = () => {
    if (!chartScrollRef.current) return;
    chartScrollRef.current.scrollTo({ left: Math.max(0, todayX - chartScrollRef.current.clientWidth / 2), behavior: 'smooth' });
  };

  const clearSimulation = () => {
    setOverrides({});
    setDragState(null);
    toast.success('Simulacao descartada');
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const applyPackageEdit = (packageKey: string, nextDuration: number, nextTeams: number) => {
    if (!simulationMode) {
      toast.info('A edicao de pacote nesta fase e aplicada somente em modo Simular.');
      return;
    }
    setOverrides((current) => ({
      ...current,
      [packageKey]: {
        ...current[packageKey],
        durationDays: Math.max(1, nextDuration),
        teams: Math.max(1, nextTeams),
      },
    }));
    setSelectedPackage(null);
    toast.success('Pacote atualizado na simulacao local');
  };

  if (ganttServices.length === 0 || !projectStartDate) {
    return (
      <div className="rounded-2xl bg-slate-50 p-6 dark:bg-transparent">
        <Card className="rounded-2xl border-slate-200 shadow-sm dark:border-border">
          <CardContent className="py-16 text-center text-muted-foreground">
            Configure o planejamento estrategico para visualizar a Linha de Balanco.
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedDragPackage = dragState ? packages.find((pkg) => pkg.key === dragState.packageKey) : null;
  const dragStart = selectedDragPackage && dragState
    ? addDays(dragState.originalStart, dragState.mode === 'move' ? dragState.previewOffsetDays : 0)
    : null;
  const dragEnd = selectedDragPackage && dragState
    ? dragState.mode === 'move'
      ? addDays(dragState.originalEnd, dragState.previewOffsetDays)
      : addDays(dragState.originalStart, dragState.previewDurationDays - 1)
    : null;

  return (
    <div className="space-y-5 rounded-2xl bg-slate-50 p-4 dark:bg-transparent md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-foreground">
              Linha de Balanco
            </h2>
            {simulationMode && (
              <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                <FlaskConical className="h-3 w-3" />
                Simulacao local
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-muted-foreground">
            Planejamento por fluxo, unidades e servicos. Alteracoes nesta fase ficam em simulacao local.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedMacroflowId} onValueChange={setSelectedMacroflowId}>
            <SelectTrigger className="h-9 w-[245px] rounded-lg bg-white text-xs dark:bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {macroflows.map((flow) => (
                <SelectItem key={flow.id} value={flow.id}>
                  {flow.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => toast.info('Macrofluxos persistentes exigem estrutura de dados futura. Nesta fase use os presets locais.')}
            disabled={!canEdit}
          >
            <Plus className="h-4 w-4" />
            Criar Macrofluxo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => toast.info('Edicao persistente de macrofluxo ainda nao foi gravada nesta fase.')}
            disabled={!canEdit}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button
            variant={simulationMode ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-2"
            onClick={() => setSimulationMode((value) => !value)}
          >
            <FlaskConical className="h-4 w-4" />
            {simulationMode ? 'Simulando' : 'Simular'}
          </Button>
          {simulationMode && (
            <>
              <Button variant="outline" size="sm" className="h-9 gap-2" onClick={clearSimulation}>
                <RotateCcw className="h-4 w-4" />
                Descartar
              </Button>
              <Button
                size="sm"
                className="h-9"
                disabled={!canEdit}
                onClick={() => toast.info('Publicacao oficial precisa de confirmacao e mapeamento seguro de persistencia em fase futura.')}
              >
                Publicar Planejamento
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        {[
          { label: 'Macrofluxo', value: selectedMacroflow?.label || '-', sub: `${flowServices.length} servicos`, accent: 'text-slate-900 dark:text-foreground' },
          { label: 'Unidades', value: maxUnits, sub: `${unitGroups.length} grupos`, accent: 'text-slate-900 dark:text-foreground' },
          { label: 'Pacotes', value: totalActivities, sub: 'servico x unidade', accent: 'text-slate-900 dark:text-foreground' },
          { label: 'Concluidas', value: totalExecuted, sub: '', accent: 'text-emerald-600' },
          { label: 'Planejado', value: `${plannedAvg.toFixed(0)}%`, sub: '', accent: 'text-blue-600' },
          { label: 'Realizado', value: `${realAvg.toFixed(0)}%`, sub: '', accent: 'text-emerald-600' },
          { label: 'Impacto sim.', value: `${simulatedImpactDays >= 0 ? '+' : ''}${simulatedImpactDays}d`, sub: overrides && Object.keys(overrides).length ? `${Object.keys(overrides).length} ajustes` : 'sem ajustes', accent: simulatedImpactDays > 0 ? 'text-red-600' : 'text-emerald-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-muted-foreground">{kpi.label}</p>
            <p className={`mt-1 truncate text-2xl font-semibold ${kpi.accent}`}>{kpi.value}</p>
            {kpi.sub && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-muted-foreground">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm dark:border-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-3 dark:bg-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 rounded-full px-3">
              {selectedMacroflow?.description}
            </Badge>
            <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => setShowSequenceDialog(true)}>
              <Settings2 className="h-4 w-4" />
              Dependencias
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-background p-0.5">
              {(['day', 'week', 'month'] as FlowScale[]).map((item) => (
                <Button
                  key={item}
                  variant={scale === item ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setScale(item)}
                >
                  {SCALE_LABELS[item]}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setZoom((value) => clamp(value - 0.15, 0.65, 1.8))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setZoom((value) => clamp(value + 0.15, 0.65, 1.8))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-2" onClick={scrollToToday}>
              <CalendarDays className="h-4 w-4" />
              Hoje
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => setZoom(1)}>
              Ajustar
            </Button>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="flex border-t" style={{ height: Math.min(chartHeight + HEADER_HEIGHT + 2, 720) }}>
            <div className="shrink-0 border-r bg-white dark:bg-card" style={{ width: LEFT_PANEL_WIDTH }}>
              <div className="flex flex-col justify-end border-b bg-muted/40 px-3 pb-2" style={{ height: HEADER_HEIGHT }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macrofluxo</span>
                <span className="truncate text-sm font-semibold">{selectedMacroflow?.label}</span>
                <span className="text-[10px] text-muted-foreground">Unidades / pacotes</span>
              </div>
              <div ref={leftPanelRef} className="overflow-hidden" style={{ height: Math.min(chartHeight, 720 - HEADER_HEIGHT) }}>
                <div style={{ height: chartHeight }}>
                  {visibleRows.map((row) => {
                    if (row.type === 'group') {
                      const collapsed = collapsedGroups.has(row.group.id);
                      return (
                        <button
                          key={row.group.id}
                          type="button"
                          className="flex w-full items-center gap-2 border-b border-border/40 bg-slate-100 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-muted/40 dark:text-foreground"
                          style={{ height: GROUP_HEIGHT }}
                          onClick={() => toggleGroup(row.group.id)}
                        >
                          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <span className="truncate">{row.group.name}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">{row.group.rows.length}</Badge>
                        </button>
                      );
                    }
                    return (
                      <div
                        key={`${row.group.id}-${row.unit.houseNumber}`}
                        className="flex items-center border-b border-border/20 px-4 text-xs"
                        style={{ height: ROW_HEIGHT }}
                      >
                        <span className="truncate">{row.unit.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div ref={headerScrollRef} className="shrink-0 overflow-hidden border-b bg-muted/40" style={{ height: HEADER_HEIGHT }}>
                <div style={{ width: chartWidth, height: HEADER_HEIGHT }}>
                  <div className="flex border-b border-border/40" style={{ height: 34 }}>
                    {columns.map((column) => (
                      <div
                        key={`${column.key}-top`}
                        className="flex items-center justify-center border-r border-border/40 text-xs font-semibold capitalize"
                        style={{ width: column.width }}
                      >
                        {column.label}
                      </div>
                    ))}
                  </div>
                  <div className="flex" style={{ height: 38 }}>
                    {columns.map((column) => (
                      <div
                        key={`${column.key}-sub`}
                        className={`flex items-center justify-center border-r border-border/25 text-[10px] text-muted-foreground ${column.isWeekendColumn ? 'bg-slate-200/60 dark:bg-muted/60' : ''}`}
                        style={{ width: column.width }}
                      >
                        {column.subLabel}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div ref={chartScrollRef} className="flex-1 overflow-auto" onScroll={syncScroll}>
                <div className="relative" style={{ width: chartWidth, height: chartHeight }}>
                  {visibleRows.map((row, index) => {
                    const top = visibleRows.slice(0, index).reduce((sum, item) => sum + (item.type === 'group' ? GROUP_HEIGHT : ROW_HEIGHT), 0);
                    return (
                      <div
                        key={`h-${index}`}
                        className={`absolute left-0 w-full border-b ${row.type === 'group' ? 'border-border/50 bg-slate-100/70 dark:bg-muted/30' : 'border-border/15'}`}
                        style={{ top, height: row.type === 'group' ? GROUP_HEIGHT : ROW_HEIGHT }}
                      />
                    );
                  })}

                  {columns.map((column) => (
                    <div
                      key={`bg-${column.key}`}
                      className={`absolute top-0 border-r border-border/20 ${column.isWeekendColumn ? 'bg-slate-200/50 dark:bg-muted/40' : ''}`}
                      style={{ left: column.x, width: column.width, height: chartHeight }}
                    />
                  ))}

                  {todayVisible && (
                    <div className="absolute top-0 z-40 pointer-events-none" style={{ left: todayX, height: chartHeight }}>
                      <div className="absolute -top-6 -translate-x-1/2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                        Hoje
                      </div>
                      <div className="h-full w-0.5 bg-red-600 shadow-[0_0_0_1px_rgba(255,255,255,0.45)]" />
                    </div>
                  )}

                  {packages.map((pkg) => {
                    const isDragging = dragState?.packageKey === pkg.key;
                    const left = isDragging && dragState?.mode === 'move'
                      ? getXForDate(addDays(dragState.originalStart, dragState.previewOffsetDays), columns, scale)
                      : pkg.x;
                    const width = isDragging && dragState?.mode === 'resize-right'
                      ? Math.max(24, getXForDate(addDays(pkg.start, dragState.previewDurationDays), columns, scale) - pkg.x)
                      : pkg.width;

                    return (
                      <div
                        key={pkg.key}
                        className={`absolute z-20 flex cursor-grab items-center overflow-hidden rounded-md border border-white/50 px-2 text-[10px] font-semibold text-white shadow-sm transition-shadow hover:shadow-lg ${isDragging ? 'cursor-grabbing ring-2 ring-primary' : ''} ${pkg.isSimulated ? 'ring-2 ring-amber-300' : ''}`}
                        style={{
                          left,
                          top: pkg.y,
                          width,
                          height: ROW_HEIGHT - 10,
                          backgroundColor: pkg.color,
                          opacity: pkg.isExecuted ? 1 : 0.78,
                        }}
                        title={`${pkg.service.name}\n${pkg.unit.label}\n${formatShortDate(pkg.start)} - ${formatShortDate(pkg.end)}\n${pkg.durationDays} dias • ${pkg.teams} equipe(s)`}
                        onPointerDown={(event) => {
                          if ((event.target as HTMLElement).dataset.resizeHandle === 'true') return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragState({
                            packageKey: pkg.key,
                            mode: 'move',
                            startClientX: event.clientX,
                            originalStart: pkg.start,
                            originalEnd: pkg.end,
                            originalDuration: pkg.durationDays,
                            previewOffsetDays: 0,
                            previewDurationDays: pkg.durationDays,
                          });
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!dragState) setSelectedPackage(pkg);
                        }}
                      >
                        <span className="truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.45)' }}>
                          {pkg.service.scope_name || pkg.service.name}
                        </span>
                        <span
                          data-resize-handle="true"
                          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/25 hover:bg-white/45"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setDragState({
                              packageKey: pkg.key,
                              mode: 'resize-right',
                              startClientX: event.clientX,
                              originalStart: pkg.start,
                              originalEnd: pkg.end,
                              originalDuration: pkg.durationDays,
                              previewOffsetDays: 0,
                              previewDurationDays: pkg.durationDays,
                            });
                          }}
                        />
                      </div>
                    );
                  })}

                  {dragState && selectedDragPackage && dragStart && dragEnd && (
                    <div
                      className="absolute z-50 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl"
                      style={{
                        left: Math.max(8, getXForDate(dragStart, columns, scale) + 12),
                        top: Math.max(8, selectedDragPackage.y - 78),
                      }}
                    >
                      <p className="font-semibold">{dragState.mode === 'move' ? 'Mover pacote' : 'Ajustar duracao'}</p>
                      <p>Novo inicio: {formatShortDate(dragStart)}</p>
                      <p>Novo fim: {formatShortDate(dragEnd)}</p>
                      <p>
                        {dragState.mode === 'move'
                          ? `Deslocamento: ${dragState.previewOffsetDays >= 0 ? '+' : ''}${dragState.previewOffsetDays} dias`
                          : `Duracao: ${dragState.previewDurationDays} dias`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5"><MousePointer2 className="h-3.5 w-3.5" />Arraste blocos em modo Simular</span>
              <span>Use a borda direita para ajustar duracao local</span>
              <span>{simulationMode ? 'Nada foi salvo oficialmente.' : 'Ative Simular para testar cenarios.'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-4 w-0.5 bg-red-500" />
              <span>Hoje</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <SequenceDialog
        open={showSequenceDialog}
        onOpenChange={setShowSequenceDialog}
        services={flowServices}
        allServices={ganttServices}
        onUpdatePredecessor={onUpdatePredecessor}
        canEdit={canEdit}
      />
      <PackageDialog
        workPackage={selectedPackage}
        open={Boolean(selectedPackage)}
        onOpenChange={(open) => !open && setSelectedPackage(null)}
        simulationMode={simulationMode}
        onApply={applyPackageEdit}
      />
    </div>
  );
}

interface PackageDialogProps {
  open: boolean;
  workPackage: WorkPackage | null;
  simulationMode: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (packageKey: string, durationDays: number, teams: number) => void;
}

function PackageDialog({ open, workPackage, simulationMode, onOpenChange, onApply }: PackageDialogProps) {
  const [duration, setDuration] = useState(1);
  const [teams, setTeams] = useState(1);

  useEffect(() => {
    if (!workPackage) return;
    setDuration(workPackage.durationDays);
    setTeams(workPackage.teams);
  }, [workPackage]);

  if (!workPackage) return null;

  const productivity = Math.max(workPackage.service.productivity || 0, 0);
  const suggestedDuration = productivity > 0
    ? Math.max(1, Math.ceil(1 / Math.max(productivity * Math.max(teams, 1), 0.01)))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar pacote de trabalho</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{workPackage.service.name}</p>
            <p className="text-muted-foreground">{workPackage.unit.label}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatShortDate(workPackage.start)} ate {formatShortDate(workPackage.end)} • {workPackage.durationDays} dias
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lob-duration">Duracao simulada (dias)</Label>
              <Input
                id="lob-duration"
                type="number"
                min={1}
                value={duration}
                onChange={(event) => setDuration(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lob-teams">Quantidade de equipes</Label>
              <Input
                id="lob-teams"
                type="number"
                min={1}
                value={teams}
                onChange={(event) => setTeams(Math.max(1, Number(event.target.value) || 1))}
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {workPackage.service.has_productivity ? (
              <p>
                Produtividade usada: {workPackage.service.productivity} {workPackage.service.productivity_unit}.
                Duracao sugerida para esta unidade: {suggestedDuration || 1} dia(s).
              </p>
            ) : (
              <p>Sem produtividade cadastrada. A duracao deve ser definida manualmente.</p>
            )}
            {!simulationMode && (
              <p className="mt-1 font-medium">Ative Simular para aplicar ajustes locais sem alterar o planejamento oficial.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!simulationMode} onClick={() => onApply(workPackage.key, duration, teams)}>
              Aplicar na simulacao
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SequenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: GanttService[];
  allServices: GanttService[];
  canEdit: boolean;
  onUpdatePredecessor?: (serviceId: string, predecessorStageId: string | null) => Promise<void>;
}

function SequenceDialog({ open, onOpenChange, services, allServices, canEdit, onUpdatePredecessor }: SequenceDialogProps) {
  const [updating, setUpdating] = useState<string | null>(null);

  const handlePredecessorChange = async (serviceId: string, predecessorStageId: string | null) => {
    if (!canEdit) {
      toast.error('Voce nao tem permissao para alterar dependencias do planejamento.');
      return;
    }
    if (!onUpdatePredecessor) return;
    setUpdating(serviceId);
    try {
      await onUpdatePredecessor(serviceId, predecessorStageId);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Organizar Fluxograma - Sequencia de Servicos
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Defina a ordem e predecessoras dos servicos. Visualizadores podem consultar, mas nao salvar alteracoes.
        </p>
        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-3 pr-2">
            {services.map((svc, idx) => {
              const color = COLORS[idx % COLORS.length];
              return (
                <div key={svc.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="w-5 font-mono text-sm">{idx + 1}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="h-4 w-4 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {svc.remaining_houses} un restantes • {svc.duration_days}d
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Select
                    value={svc.depends_on || 'none'}
                    onValueChange={(value) => handlePredecessorChange(svc.id, value === 'none' ? null : value)}
                    disabled={!canEdit || updating === svc.id}
                  >
                    <SelectTrigger className="w-[200px] text-xs">
                      <SelectValue placeholder="Sem predecessora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem predecessora</SelectItem>
                      {allServices
                        .filter((item) => item.id !== svc.id)
                        .map((item) => (
                          <SelectItem key={item.stage_id || item.id} value={item.stage_id || item.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: COLORS[allServices.indexOf(item) % COLORS.length] }}
                              />
                              {item.name.length > 30 ? `${item.name.substring(0, 30)}...` : item.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
