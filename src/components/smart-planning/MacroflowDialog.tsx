import { MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Focus,
  GitBranch,
  Grip,
  Layers3,
  Link2,
  Maximize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { GanttService } from './hooks/useStrategicGanttData';
import {
  MacroflowDependencyInput,
  MacroflowPackageOption,
  MacroflowRelationType,
  PlanningMacroflowDependency,
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

type NodePosition = { x: number; y: number };
type PackageFilter = 'all' | 'work_group' | 'service' | 'missing';
type PackagePanelTab = 'included' | 'add';
type Selection =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | { type: 'pending' }
  | null;

const NODE_WIDTH = 260;
const NODE_HEIGHT = 132;
const GRID_X = 340;
const GRID_Y = 180;
const CANVAS_WIDTH = 3600;
const CANVAS_HEIGHT = 2200;

const packageTypeLabel = (type: string) => (type === 'work_group' ? 'Frente' : 'Serviço');

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
  const relation = dependency.relationType === 'SS' ? 'começa junto ao início' : 'começa depois do término';
  return `${dependency.successorLabel} ${relation} de ${dependency.predecessorLabel}, ${describeLag(dependency.lagDays)}.`;
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatNumber = (value: number | null | undefined, digits = 1) => {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return 'Sem dado';
  return safeValue.toLocaleString('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: safeValue % 1 === 0 ? 0 : digits,
  });
};

const getPackageLabel = (pkg: GanttService) => pkg.scope_name || pkg.name || 'Pacote sem nome';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createGridLayout = (items: GanttService[]) => {
  const next: Record<string, NodePosition> = {};
  items.forEach((item, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    next[item.id] = { x: 120 + col * GRID_X, y: 120 + row * GRID_Y };
  });
  return next;
};

const createAutoLayout = (items: GanttService[], dependencies: PlanningMacroflowDependency[]) => {
  if (!dependencies.length) return createGridLayout(items);

  const packageKeys = new Set(items.map((item) => item.id));
  const validDependencies = dependencies.filter((dependency) =>
    packageKeys.has(dependency.predecessorKey) && packageKeys.has(dependency.successorKey)
  );
  if (!validDependencies.length) return createGridLayout(items);

  const levels = new Map<string, number>();
  items.forEach((item) => levels.set(item.id, 0));

  for (let pass = 0; pass < items.length; pass += 1) {
    validDependencies.forEach((dependency) => {
      const nextLevel = Math.max(levels.get(dependency.successorKey) || 0, (levels.get(dependency.predecessorKey) || 0) + 1);
      levels.set(dependency.successorKey, nextLevel);
    });
  }

  const grouped = new Map<number, GanttService[]>();
  items.forEach((item) => {
    const level = levels.get(item.id) || 0;
    grouped.set(level, [...(grouped.get(level) || []), item]);
  });

  const next: Record<string, NodePosition> = {};
  Array.from(grouped.entries()).forEach(([level, levelItems]) => {
    levelItems
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .forEach((item, index) => {
        next[item.id] = { x: 120 + level * GRID_X, y: 100 + index * GRID_Y };
      });
  });

  return next;
};

export function MacroflowDialog({
  open,
  onOpenChange,
  projectId,
  packages,
  canEdit,
  onChanged,
}: MacroflowDialogProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const draggedNodeRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const panningRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const packageOptions = useMemo<MacroflowPackageOption[]>(() => packages.map((pkg) => ({
    key: pkg.id,
    type: pkg.package_type === 'work_group' ? 'work_group' : 'service',
    label: getPackageLabel(pkg),
    hasProductivity: pkg.has_productivity,
  })), [packages]);

  const packageMap = useMemo(() => new Map(packages.map((pkg) => [pkg.id, pkg])), [packages]);
  const {
    macroflows,
    macroflow,
    selectedMacroflowId,
    dependencies,
    includedPackages,
    packageUsageByKey,
    loading,
    hasCycle,
    createMacroflow,
    selectMacroflow,
    renameMacroflow,
    activateMacroflow,
    removePackageFromMacroflow,
    setPackagesForMacroflow,
    addDependency,
    updateDependency,
    removeDependency,
  } = usePlanningMacroflow(projectId, packageOptions);

  const [positions, setPositions] = useState<Record<string, NodePosition>>({});
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: 40, y: 36 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PackageFilter>('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [temporaryConnectionPoint, setTemporaryConnectionPoint] = useState<NodePosition | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{ predecessorKey: string; successorKey: string } | null>(null);
  const [relationDraft, setRelationDraft] = useState<MacroflowRelationType>('FS');
  const [lagDraft, setLagDraft] = useState(0);
  const [newMacroflowName, setNewMacroflowName] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [showCreateMacroflow, setShowCreateMacroflow] = useState(false);
  const [showRenameMacroflow, setShowRenameMacroflow] = useState(false);
  const [packagePanelTab, setPackagePanelTab] = useState<PackagePanelTab>('included');
  const [selectedPackageKeys, setSelectedPackageKeys] = useState<Set<string>>(() => new Set());
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const storageKey = projectId
    ? `obramap_macroflow_positions_${projectId}_${selectedMacroflowId || 'draft'}`
    : null;

  useEffect(() => {
    if (!storageKey || !open || !Object.keys(positions).length) return;
    localStorage.setItem(storageKey, JSON.stringify(positions));
  }, [open, positions, storageKey]);

  useEffect(() => {
    setRenameDraft(macroflow?.name || '');
    setShowRenameMacroflow(false);
  }, [macroflow?.name]);

  const stageFilterOptions = useMemo(() => {
    const names = Array.from(new Set(packages.map((pkg) => pkg.macro_name).filter(Boolean) as string[]));
    return names.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [packages]);

  const includedPackageIds = useMemo(() => new Set(includedPackages.map((item) => item.packageKey)), [includedPackages]);
  const usedElsewherePackageIds = useMemo(() => new Set(
    Object.entries(packageUsageByKey)
      .filter(([, usage]) => usage.macroflowId !== selectedMacroflowId)
      .map(([packageKey]) => packageKey)
  ), [packageUsageByKey, selectedMacroflowId]);
  const includedCanvasPackages = useMemo(
    () => includedPackages
      .map((item) => packageMap.get(item.packageKey))
      .filter((pkg): pkg is GanttService => Boolean(pkg)),
    [includedPackages, packageMap],
  );

  useEffect(() => {
    if (!open) return;
    const layout = createAutoLayout(includedCanvasPackages, dependencies);
    const saved = storageKey ? localStorage.getItem(storageKey) : null;
    const parsed = saved ? JSON.parse(saved) as Record<string, NodePosition> : {};
    const merged = Object.fromEntries(includedCanvasPackages.map((pkg) => [pkg.id, parsed[pkg.id] || layout[pkg.id] || { x: 120, y: 120 }]));
    setPositions(merged);
    setSelection(null);
    setPendingConnection(null);
    setConnectingFrom(null);
  }, [dependencies, includedCanvasPackages, open, storageKey]);

  const filteredPackages = useMemo(() => {
    const term = normalizeText(search);
    return packages.filter((pkg) => {
      if (filter === 'work_group' && pkg.package_type !== 'work_group') return false;
      if (filter === 'service' && pkg.package_type === 'work_group') return false;
      if (filter === 'missing' && pkg.has_productivity) return false;
      if (stageFilter !== 'all' && pkg.macro_name !== stageFilter) return false;
      if (!term) return true;
      return normalizeText(`${getPackageLabel(pkg)} ${pkg.macro_name} ${pkg.name}`).includes(term);
    });
  }, [filter, packages, search, stageFilter]);

  const availablePackages = useMemo(
    () => filteredPackages.filter((pkg) => !includedPackageIds.has(pkg.id) && !usedElsewherePackageIds.has(pkg.id)),
    [filteredPackages, includedPackageIds, usedElsewherePackageIds],
  );
  const usedElsewhereCount = useMemo(
    () => filteredPackages.filter((pkg) => usedElsewherePackageIds.has(pkg.id)).length,
    [filteredPackages, usedElsewherePackageIds],
  );
  const selectedAvailableCount = selectedPackageKeys.size;

  const visibleCanvasPackages = useMemo(() => {
    const allowed = new Set(filteredPackages.map((pkg) => pkg.id));
    return includedCanvasPackages.filter((pkg) => allowed.has(pkg.id));
  }, [filteredPackages, includedCanvasPackages]);

  const visiblePackageIds = useMemo(() => new Set(visibleCanvasPackages.map((pkg) => pkg.id)), [visibleCanvasPackages]);
  const visibleDependencies = useMemo(
    () => dependencies.filter((dependency) => visiblePackageIds.has(dependency.predecessorKey) && visiblePackageIds.has(dependency.successorKey)),
    [dependencies, visiblePackageIds],
  );

  const selectedNode = selection?.type === 'node' ? packageMap.get(selection.id) || null : null;
  const selectedEdge = selection?.type === 'edge'
    ? dependencies.find((dependency) => dependency.id === selection.id) || null
    : null;

  useEffect(() => {
    if (!selectedEdge) return;
    setRelationDraft(selectedEdge.relationType);
    setLagDraft(selectedEdge.lagDays);
  }, [selectedEdge]);

  useEffect(() => {
    if (!pendingConnection) return;
    setRelationDraft('FS');
    setLagDraft(0);
  }, [pendingConnection]);

  useEffect(() => {
    const availableIds = new Set(availablePackages.map((pkg) => pkg.id));
    setSelectedPackageKeys((current) => {
      const next = new Set(Array.from(current).filter((key) => availableIds.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [availablePackages]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setConnectingFrom(null);
      setTemporaryConnectionPoint(null);
      setPendingConnection(null);
      setSelection(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const getCanvasPoint = (event: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    };
  };

  const zoomAtCursor = (event: MouseEvent | WheelEvent, nextZoom: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setZoom(nextZoom);
      return;
    }

    const currentPoint = {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    };
    setZoom(nextZoom);
    setPan({
      x: event.clientX - rect.left - currentPoint.x * nextZoom,
      y: event.clientY - rect.top - currentPoint.y * nextZoom,
    });
  };

  const handleNodeMouseDown = (event: MouseEvent, nodeId: string) => {
    if (!canEdit) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = getCanvasPoint(event);
    const position = positions[nodeId] || { x: 0, y: 0 };
    draggedNodeRef.current = {
      id: nodeId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
    };
    setSelection({ type: 'node', id: nodeId });
  };

  const handleCanvasMouseMove = (event: MouseEvent) => {
    if (connectingFrom) {
      setTemporaryConnectionPoint(getCanvasPoint(event));
    }

    if (draggedNodeRef.current) {
      const point = getCanvasPoint(event);
      const drag = draggedNodeRef.current;
      setPositions((current) => ({
        ...current,
        [drag.id]: {
          x: Math.max(20, Math.min(CANVAS_WIDTH - NODE_WIDTH - 20, point.x - drag.offsetX)),
          y: Math.max(20, Math.min(CANVAS_HEIGHT - NODE_HEIGHT - 20, point.y - drag.offsetY)),
        },
      }));
      return;
    }

    if (panningRef.current) {
      const next = panningRef.current;
      setPan({
        x: next.x + event.clientX - next.startX,
        y: next.y + event.clientY - next.startY,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    draggedNodeRef.current = null;
    panningRef.current = null;
    setConnectingFrom(null);
    setTemporaryConnectionPoint(null);
  };

  const handleCanvasMouseDown = (event: MouseEvent) => {
    if (event.button === 2 || event.button === 1) {
      event.preventDefault();
    }
    if (![0, 1, 2].includes(event.button)) return;
    setSelection(null);
    panningRef.current = { x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY };
  };

  const handleConnectStart = (event: MouseEvent, nodeId: string) => {
    if (!canEdit) return;
    event.stopPropagation();
    event.preventDefault();
    setConnectingFrom(nodeId);
    setTemporaryConnectionPoint(getCanvasPoint(event));
    setSelection({ type: 'node', id: nodeId });
  };

  const handleConnectEnd = (event: MouseEvent, nodeId: string) => {
    if (!canEdit || !connectingFrom || connectingFrom === nodeId) return;
    event.stopPropagation();
    setPendingConnection({ predecessorKey: connectingFrom, successorKey: nodeId });
    setSelection({ type: 'pending' });
    setConnectingFrom(null);
    setTemporaryConnectionPoint(null);
  };

  const handleCanvasWheel = (event: WheelEvent) => {
    event.preventDefault();
    const nextZoom = clamp(zoom + (event.deltaY < 0 ? 0.08 : -0.08), 0.35, 1.8);
    zoomAtCursor(event, nextZoom);
  };

  const buildPayload = (predecessorKey: string, successorKey: string): MacroflowDependencyInput | null => {
    const predecessor = packageOptions.find((option) => option.key === predecessorKey);
    const successor = packageOptions.find((option) => option.key === successorKey);
    if (!predecessor || !successor) return null;
    return {
      predecessorType: predecessor.type,
      predecessorKey: predecessor.key,
      predecessorLabel: predecessor.label,
      successorType: successor.type,
      successorKey: successor.key,
      successorLabel: successor.label,
      relationType: relationDraft,
      lagDays: Number.isFinite(Number(lagDraft)) ? Number(lagDraft) : 0,
    };
  };

  const savePendingConnection = async () => {
    if (!pendingConnection) return;
    const payload = buildPayload(pendingConnection.predecessorKey, pendingConnection.successorKey);
    if (!payload) return;
    const saved = await addDependency(payload);
    if (saved) {
      setPendingConnection(null);
      setSelection(null);
      await onChanged?.();
    }
  };

  const saveSelectedEdge = async () => {
    if (!selectedEdge) return;
    const payload = buildPayload(selectedEdge.predecessorKey, selectedEdge.successorKey);
    if (!payload) return;
    const saved = await updateDependency(selectedEdge.id, payload);
    if (saved) await onChanged?.();
  };

  const removeSelectedEdge = async () => {
    if (!selectedEdge) return;
    if (!window.confirm('Remover esta ligação do macrofluxo?')) return;
    const removed = await removeDependency(selectedEdge.id);
    if (removed) {
      setSelection(null);
      await onChanged?.();
    }
  };

  const togglePackageSelection = (packageKey: string) => {
    setSelectedPackageKeys((current) => {
      const next = new Set(current);
      if (next.has(packageKey)) {
        next.delete(packageKey);
      } else {
        next.add(packageKey);
      }
      return next;
    });
  };

  const addSelectedPackages = async () => {
    if (!selectedPackageKeys.size) return;
    const keys = Array.from(new Set([
      ...includedPackages.map((item) => item.packageKey),
      ...Array.from(selectedPackageKeys).filter((key) => !usedElsewherePackageIds.has(key)),
    ]));
    const saved = await setPackagesForMacroflow(keys);
    if (saved) {
      setSelectedPackageKeys(new Set());
      setPackagePanelTab('included');
      await onChanged?.();
    }
  };

  const addVisiblePackages = async () => {
    const keys = Array.from(new Set([
      ...includedPackages.map((item) => item.packageKey),
      ...availablePackages.map((item) => item.id),
    ]));
    const saved = await setPackagesForMacroflow(keys);
    if (saved) {
      setSelectedPackageKeys(new Set());
      setPackagePanelTab('included');
      await onChanged?.();
    }
  };

  const removePackage = async (packageKey: string) => {
    const hasLinks = dependencies.some((dependency) =>
      dependency.predecessorKey === packageKey || dependency.successorKey === packageKey
    );
    if (hasLinks && !window.confirm('Remover este pacote tambem removera ligacoes relacionadas. Continuar?')) return;
    if (!hasLinks && !window.confirm('Remover este pacote do macrofluxo?')) return;
    const removed = await removePackageFromMacroflow(packageKey);
    if (removed) {
      setSelection(null);
      await onChanged?.();
    }
  };

  const handleCreateMacroflow = async () => {
    const created = await createMacroflow(newMacroflowName || 'Novo macrofluxo');
    if (created) {
      setNewMacroflowName('');
      setShowCreateMacroflow(false);
      await onChanged?.();
    }
  };

  const handleRenameMacroflow = async () => {
    const saved = await renameMacroflow(renameDraft);
    if (saved) {
      setShowRenameMacroflow(false);
      await onChanged?.();
    }
  };

  const handleActivateMacroflow = async () => {
    if (!macroflow) return;
    const saved = await activateMacroflow(macroflow.id);
    if (saved) await onChanged?.();
  };

  const autoOrganize = () => {
    setPositions(createAutoLayout(visibleCanvasPackages, visibleDependencies));
  };

  const centerFlow = () => {
    setPan({ x: 44, y: 42 });
    setZoom(0.82);
  };

  const fitView = () => {
    if (!visibleCanvasPackages.length) return;
    const used = visibleCanvasPackages.map((pkg) => positions[pkg.id]).filter(Boolean);
    if (!used.length) return centerFlow();
    const minX = Math.min(...used.map((position) => position.x));
    const minY = Math.min(...used.map((position) => position.y));
    setZoom(0.74);
    setPan({ x: 80 - minX * 0.74, y: 80 - minY * 0.74 });
  };

  const predecessors = selectedNode
    ? dependencies.filter((dependency) => dependency.successorKey === selectedNode.id)
    : [];
  const successors = selectedNode
    ? dependencies.filter((dependency) => dependency.predecessorKey === selectedNode.id)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b bg-background/95 px-4 py-2">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <GitBranch className="h-5 w-5 text-primary" />
                  Macrofluxo do Planejamento
                </DialogTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Principal é o padrão inicial. Gantt e Linha também exibem todos ou um macrofluxo específico.
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs">Macrofluxo</Label>
              <Select value={selectedMacroflowId || 'none'} onValueChange={(value) => value !== 'none' && selectMacroflow(value)}>
                <SelectTrigger className="h-8 w-[260px] bg-background text-left">
                  <SelectValue placeholder="Selecione um macrofluxo" />
                </SelectTrigger>
                <SelectContent>
                  {macroflows.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhum macrofluxo salvo</SelectItem>
                  ) : macroflows.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}{item.active ? ' - Principal' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {macroflow?.active && (
                <Badge className="h-8 gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                  <Star className="h-3 w-3" />
                  Principal
                </Badge>
              )}
              <Button variant={macroflow?.active ? 'secondary' : 'outline'} size="sm" disabled={!macroflow || macroflow.active || !canEdit} onClick={handleActivateMacroflow}>
                <Star className="mr-1 h-3.5 w-3.5" />
                Tornar Principal
              </Button>
              {showRenameMacroflow ? (
                <div className="flex min-w-[280px] flex-1 items-center gap-2">
                  <Input
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleRenameMacroflow();
                      if (event.key === 'Escape') setShowRenameMacroflow(false);
                    }}
                    placeholder="Nome do macrofluxo"
                    className="h-8 bg-background"
                    disabled={!macroflow || !canEdit}
                  />
                  <Button size="sm" disabled={!macroflow || !canEdit || renameDraft.trim() === macroflow.name} onClick={handleRenameMacroflow}>
                    OK
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowRenameMacroflow(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" disabled={!macroflow || !canEdit} onClick={() => setShowRenameMacroflow(true)}>
                  Renomear
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setShowCreateMacroflow(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo
              </Button>
              {showCreateMacroflow && (
                <div className="flex min-w-[300px] flex-1 items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
                  <Input
                    value={newMacroflowName}
                    onChange={(event) => setNewMacroflowName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleCreateMacroflow();
                      if (event.key === 'Escape') setShowCreateMacroflow(false);
                    }}
                    placeholder="Novo macrofluxo"
                    className="h-8 bg-background"
                    disabled={!canEdit}
                  />
                  <Button size="sm" disabled={!canEdit} onClick={handleCreateMacroflow}>
                    Criar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateMacroflow(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-7 px-2.5">
                  {includedCanvasPackages.length} pacotes
                </Badge>
                <Badge variant="outline" className="h-7 px-2.5">
                  {dependencies.length} ligações
                </Badge>
                {macroflow && (
                  <span className={cn('text-xs', macroflow.active ? 'text-emerald-700' : 'text-amber-700')}>
                    {macroflow.active
                      ? 'Visualização padrão inicial.'
                      : 'Salvo, mas não é o padrão inicial.'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={autoOrganize}>
                  <RotateCcw className="h-4 w-4" />
                  Auto-organizar
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={centerFlow}>
                  <Focus className="h-4 w-4" />
                  Centralizar
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={fitView}>
                  <Maximize2 className="h-4 w-4" />
                  Ajustar
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setSelection(null)}>
                  <X className="h-4 w-4" />
                  Limpar seleção
                </Button>
                <Button size="sm" className="gap-2" onClick={() => onOpenChange(false)}>
                  <Save className="h-4 w-4" />
                  Salvar e fechar
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_300px] bg-muted/20">
          <aside className="min-h-0 border-r bg-background">
            <div className="border-b p-3">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={packagePanelTab === 'included' ? 'default' : 'ghost'}
                  className="h-8"
                  onClick={() => setPackagePanelTab('included')}
                >
                  No macrofluxo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={packagePanelTab === 'add' ? 'default' : 'ghost'}
                  className="h-8"
                  onClick={() => setPackagePanelTab('add')}
                >
                  Adicionar
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{includedCanvasPackages.length} pacote(s) incluído(s)</span>
                <span>{availablePackages.length} disponível(is)</span>
              </div>
            </div>

            {packagePanelTab === 'included' ? (
              <ScrollArea className="h-[calc(92vh-178px)]">
                <div className="space-y-2 p-3">
                  {includedCanvasPackages.length === 0 && (
                    <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                      Macrofluxo vazio. Use a aba Adicionar para escolher serviços e frentes.
                    </div>
                  )}
                  {includedCanvasPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'w-full rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-primary/5',
                        selection?.type === 'node' && selection.id === pkg.id && 'border-primary bg-primary/5'
                      )}
                      onClick={() => setSelection({ type: 'node', id: pkg.id })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelection({ type: 'node', id: pkg.id });
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium">{getPackageLabel(pkg)}</p>
                        <Badge variant={pkg.package_type === 'work_group' ? 'default' : 'outline'}>{packageTypeLabel(pkg.package_type)}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <span>{pkg.duration_days} dias</span>
                        <span>-</span>
                        <span>{formatNumber(pkg.productivity)} {pkg.productivity_unit}</span>
                      </div>
                      {!pkg.has_productivity && (
                        <Badge variant="secondary" className="mt-2 gap-1 text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          Sem produtividade
                        </Badge>
                      )}
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={!canEdit}
                          onClick={(event) => {
                            event.stopPropagation();
                            void removePackage(pkg.id);
                          }}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex h-[calc(92vh-178px)] min-h-0 flex-col">
                <div className="space-y-2 border-b p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canEdit || selectedAvailableCount === 0}
                      onClick={addSelectedPackages}
                    >
                      Adicionar selecionados
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canEdit || availablePackages.length === 0}
                      onClick={addVisiblePackages}
                    >
                      Todos visíveis
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pacote" className="h-9 pl-8" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full justify-start gap-2 px-1 text-xs text-muted-foreground"
                    onClick={() => setShowAdvancedFilters((value) => !value)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filtros avançados {showAdvancedFilters ? 'abertos' : 'fechados'}
                  </Button>
                  {showAdvancedFilters && (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Etapa do contrato</Label>
                        <Select value={stageFilter} onValueChange={setStageFilter}>
                          <SelectTrigger className="h-8 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as etapas</SelectItem>
                            {stageFilterOptions.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Filtro de contrato, não macrofluxo.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          ['all', 'Todos'],
                          ['work_group', 'Frentes'],
                          ['service', 'Serviços'],
                          ['missing', 'Sem prod.'],
                        ].map(([value, label]) => (
                          <Button
                            key={value}
                            variant={filter === value ? 'default' : 'outline'}
                            size="sm"
                            className="h-7"
                            onClick={() => setFilter(value as PackageFilter)}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {usedElsewhereCount > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      {usedElsewhereCount} pacote(s) oculto(s) por já pertencerem a outro macrofluxo.
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {selectedAvailableCount} selecionado(s) de {availablePackages.length} disponível(is).
                  </p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-2 p-3">
                    {availablePackages.length === 0 && (
                      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        Nenhum pacote disponível com os filtros atuais.
                      </div>
                    )}
                    {availablePackages.map((pkg) => {
                      const checked = selectedPackageKeys.has(pkg.id);
                      return (
                        <div
                          key={pkg.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'w-full rounded-lg border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-primary/5',
                            checked && 'border-primary bg-primary/5'
                          )}
                          onClick={() => togglePackageSelection(pkg.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') togglePackageSelection(pkg.id);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={checked}
                              className="mt-0.5"
                              onCheckedChange={() => togglePackageSelection(pkg.id)}
                              onClick={(event) => event.stopPropagation()}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-2 text-sm font-medium">{getPackageLabel(pkg)}</p>
                                <Badge variant={pkg.package_type === 'work_group' ? 'default' : 'outline'}>{packageTypeLabel(pkg.package_type)}</Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                <span>{pkg.duration_days} dias</span>
                                <span>-</span>
                                <span>{formatNumber(pkg.productivity)} {pkg.productivity_unit}</span>
                              </div>
                              {!pkg.has_productivity && (
                                <Badge variant="secondary" className="mt-2 gap-1 text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  Sem produtividade
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </aside>

          <main className="relative min-w-0 overflow-hidden">
            <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border bg-background/90 p-1 shadow-sm">
              <Button variant="ghost" size="icon" onClick={() => setZoom((current) => Math.min(current + 0.1, 1.8))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={() => setZoom((current) => Math.max(current - 0.1, 0.35))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </div>

            {hasCycle && (
              <div className="absolute right-4 top-4 z-20 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm">
                Macrofluxo possui ciclo. Revise predecessoras.
              </div>
            )}

            {includedCanvasPackages.length === 0 ? (
              <div className="absolute left-1/2 top-1/2 z-20 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background/95 p-5 text-center shadow-lg">
                <Layers3 className="mx-auto mb-3 h-8 w-8 text-primary" />
                <p className="text-sm font-semibold">Adicione pacotes para montar este macrofluxo.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adicione pacotes na lateral esquerda para iniciar o canvas.
                </p>
                <Button className="mt-4 gap-2" size="sm" onClick={() => setPackagePanelTab('add')}>
                  <Layers3 className="h-4 w-4" />
                  Ir para Adicionar
                </Button>
              </div>
            ) : !dependencies.length && (
              <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
                Arraste uma conexão entre dois pacotes para criar a primeira predecessora.
              </div>
            )}

            <div
              ref={canvasRef}
              className="h-full w-full cursor-grab overflow-hidden bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:32px_32px] active:cursor-grabbing"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div
                className="relative"
                style={{
                  width: CANVAS_WIDTH,
                  height: CANVAS_HEIGHT,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
              >
                <svg className="absolute inset-0 h-full w-full overflow-visible">
                  <defs>
                    <marker id="macroflow-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,6 L9,3 z" fill="hsl(var(--primary))" />
                    </marker>
                  </defs>
                  {visibleDependencies.map((dependency) => {
                    const source = positions[dependency.predecessorKey];
                    const target = positions[dependency.successorKey];
                    if (!source || !target) return null;
                    const x1 = source.x + NODE_WIDTH;
                    const y1 = source.y + NODE_HEIGHT / 2;
                    const x2 = target.x;
                    const y2 = target.y + NODE_HEIGHT / 2;
                    const curve = Math.max(80, Math.abs(x2 - x1) / 2);
                    const selected = selection?.type === 'edge' && selection.id === dependency.id;
                    return (
                      <g key={dependency.id} className="cursor-pointer" onClick={(event) => { event.stopPropagation(); setSelection({ type: 'edge', id: dependency.id }); }}>
                        <path
                          d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                          strokeWidth={selected ? 4 : 2.5}
                          strokeDasharray={dependency.relationType === 'SS' ? '8 6' : undefined}
                          markerEnd="url(#macroflow-arrow)"
                        />
                        <foreignObject x={(x1 + x2) / 2 - 42} y={(y1 + y2) / 2 - 16} width="84" height="32">
                          <div className="rounded-full border bg-background px-2 py-1 text-center text-[11px] font-semibold shadow-sm">
                            {dependency.relationType}
                            {dependency.lagDays !== 0 && ` ${dependency.lagDays > 0 ? '+' : ''}${dependency.lagDays}d`}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                  {connectingFrom && temporaryConnectionPoint && positions[connectingFrom] && (
                    <path
                      d={`M ${positions[connectingFrom].x + NODE_WIDTH} ${positions[connectingFrom].y + NODE_HEIGHT / 2} C ${positions[connectingFrom].x + NODE_WIDTH + 120} ${positions[connectingFrom].y + NODE_HEIGHT / 2}, ${temporaryConnectionPoint.x - 120} ${temporaryConnectionPoint.y}, ${temporaryConnectionPoint.x} ${temporaryConnectionPoint.y}`}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeDasharray="10 8"
                      strokeWidth={3}
                      markerEnd="url(#macroflow-arrow)"
                    />
                  )}
                </svg>

                {visibleCanvasPackages.map((pkg) => {
                  const position = positions[pkg.id] || { x: 100, y: 100 };
                  const selected = selection?.type === 'node' && selection.id === pkg.id;
                  return (
                    <div
                      key={pkg.id}
                      className={cn(
                        'absolute rounded-xl border bg-card p-3 shadow-lg transition-shadow',
                        selected && 'border-primary ring-2 ring-primary/20',
                        connectingFrom && connectingFrom !== pkg.id && 'ring-2 ring-emerald-400/40',
                        connectingFrom === pkg.id && 'ring-2 ring-primary/40',
                        !pkg.has_productivity && 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                      )}
                      style={{ left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                      onMouseDown={(event) => handleNodeMouseDown(event, pkg.id)}
                      onMouseUp={(event) => handleConnectEnd(event, pkg.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-tight">{getPackageLabel(pkg)}</p>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Grip className="h-3 w-3" />
                            arraste para organizar
                          </div>
                        </div>
                        <Badge variant={pkg.package_type === 'work_group' ? 'default' : 'outline'}>{packageTypeLabel(pkg.package_type)}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md bg-muted/60 p-2">
                          <p className="text-muted-foreground">Duração</p>
                          <p className="font-semibold">{pkg.duration_days} dias</p>
                        </div>
                        <div className="rounded-md bg-muted/60 p-2">
                          <p className="text-muted-foreground">Produtividade</p>
                          <p className="truncate font-semibold">{formatNumber(pkg.productivity)} {pkg.productivity_unit}</p>
                        </div>
                      </div>
                      {!pkg.has_productivity && (
                        <Badge variant="secondary" className="mt-2 gap-1 text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          Sem produtividade
                        </Badge>
                      )}
                      <button
                        type="button"
                        className="absolute -right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-md"
                        onMouseDown={(event) => handleConnectStart(event, pkg.id)}
                        title="Arraste daqui para outro pacote"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background" />
                    </div>
                  );
                })}
              </div>
            </div>
          </main>

          <aside className="min-h-0 border-l bg-background">
            <div className="border-b p-4">
              <p className="text-sm font-semibold">Propriedades</p>
              <p className="text-xs text-muted-foreground">Selecione um nó ou ligação para editar.</p>
            </div>
            <ScrollArea className="h-[calc(92vh-154px)]">
              <div className="space-y-4 p-4">
                {selection?.type === 'pending' && pendingConnection && (
                  <div className="space-y-4 rounded-lg border bg-primary/5 p-4">
                    <div>
                      <p className="text-sm font-semibold">Nova ligação</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {packageMap.get(pendingConnection.successorKey) ? getPackageLabel(packageMap.get(pendingConnection.successorKey)!) : 'Sucessor'} depois de {packageMap.get(pendingConnection.predecessorKey) ? getPackageLabel(packageMap.get(pendingConnection.predecessorKey)!) : 'predecessor'}.
                      </p>
                    </div>
                    <RelationEditor
                      relationDraft={relationDraft}
                      lagDraft={lagDraft}
                      setRelationDraft={setRelationDraft}
                      setLagDraft={setLagDraft}
                      disabled={!canEdit}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" disabled={!canEdit || loading} onClick={savePendingConnection}>
                        Salvar ligação
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setPendingConnection(null); setSelection(null); }}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {selectedEdge && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div>
                      <p className="text-sm font-semibold">Ligação selecionada</p>
                      <p className="mt-1 text-xs text-muted-foreground">{describeDependency(selectedEdge)}</p>
                    </div>
                    <RelationEditor
                      relationDraft={relationDraft}
                      lagDraft={lagDraft}
                      setRelationDraft={setRelationDraft}
                      setLagDraft={setLagDraft}
                      disabled={!canEdit}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" disabled={!canEdit || loading} onClick={saveSelectedEdge}>
                        Atualizar
                      </Button>
                      <Button size="sm" variant="destructive" disabled={!canEdit || loading} onClick={removeSelectedEdge}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                )}

                {selectedNode && (
                  <div className="space-y-4">
                    <div className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{getPackageLabel(selectedNode)}</p>
                          <p className="text-xs text-muted-foreground">{selectedNode.macro_name}</p>
                        </div>
                        <Badge variant={selectedNode.package_type === 'work_group' ? 'default' : 'outline'}>
                          {packageTypeLabel(selectedNode.package_type)}
                        </Badge>
                      </div>
                      <Separator className="my-3" />
                      <div className="space-y-2 text-sm">
                        <InfoRow label="Duração" value={`${selectedNode.duration_days} dias`} />
                        <InfoRow label="Produtividade" value={`${formatNumber(selectedNode.productivity)} ${selectedNode.productivity_unit}`} />
                        <InfoRow label="Demanda" value={`${formatNumber(selectedNode.remaining_houses, 0)} unidades`} />
                        <InfoRow label="Equipes" value={`${selectedNode.teams}`} />
                      </div>
                      {!selectedNode.has_productivity && (
                        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                          Pacote sem produtividade. O cronograma pode ficar preliminar até configurar Produtividade e Equipes.
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        disabled={!canEdit}
                        onClick={() => void removePackage(selectedNode.id)}
                      >
                        Remover do macrofluxo
                      </Button>
                    </div>

                    <DependencyList title="Predecessoras" items={predecessors} empty="Sem predecessoras." />
                    <DependencyList title="Sucessoras" items={successors} empty="Sem sucessoras." />
                  </div>
                )}

                {!selection && (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    <Layers3 className="mx-auto mb-3 h-8 w-8 opacity-50" />
                    Clique em um pacote ou ligação. Para criar predecessora, arraste o conector de um nó até outro.
                  </div>
                )}

                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Resumo</p>
                  <p className="mt-1">{includedCanvasPackages.length} pacote(s) incluídos, {dependencies.length} ligação(ões).</p>
                  <p className="mt-1">Macrofluxo selecionado: {macroflow?.name || 'será criado ao salvar a primeira ligação'}.</p>
                  <p className="mt-1">Status: {macroflow?.active ? 'Principal' : 'não principal'}.</p>
                  {usedElsewhereCount > 0 && (
                    <p className="mt-1">{usedElsewhereCount} pacote(s) ocultos por já pertencerem a outro macrofluxo.</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RelationEditor({
  relationDraft,
  lagDraft,
  setRelationDraft,
  setLagDraft,
  disabled,
}: {
  relationDraft: MacroflowRelationType;
  lagDraft: number;
  setRelationDraft: (value: MacroflowRelationType) => void;
  setLagDraft: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <div className="space-y-1.5">
        <Label>Tipo de relação</Label>
        <Select value={relationDraft} onValueChange={(value) => setRelationDraft(value as MacroflowRelationType)} disabled={disabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FS">Termina para iniciar (FS)</SelectItem>
            <SelectItem value="SS">Inicia para iniciar (SS)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Defasagem em dias</Label>
        <Input type="number" value={lagDraft} onChange={(event) => setLagDraft(Number(event.target.value))} disabled={disabled} />
        <p className="text-xs text-muted-foreground">Use positivo para depois e negativo para antes.</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DependencyList({ title, items, empty }: { title: string; items: PlanningMacroflowDependency[]; empty: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-md bg-muted/50 p-2 text-xs">
              <p className="font-medium">{describeDependency(item)}</p>
              <p className="mt-1 text-muted-foreground">{relationLabel(item.relationType)} - {describeLag(item.lagDays)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
