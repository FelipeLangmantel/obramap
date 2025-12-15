import { useState, DragEvent, useMemo } from "react";
import { Plus, Pencil, Trash2, GripVertical, AlertTriangle, ArrowUp, ArrowDown, Copy, Eye, Scale, Upload, FileUp, Download, Printer, Calculator } from "lucide-react";
import { CopyMacrosDialog } from "./CopyMacrosDialog";
import { ImportMacrosDialog } from "./ImportMacrosDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Scope } from "@/data/constructionData";
import { DEFAULT_MACRO_COLORS } from "@/data/constructionData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ManageMacrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExtractedMacro {
  name: string;
  color: string;
  scopes: {
    name: string;
    weight: number;
  }[];
}

export function ManageMacrosDialog({ open, onOpenChange }: ManageMacrosDialogProps) {
  const { currentProject, addMacro, updateMacro, deleteMacro, addScope, updateScope, deleteScope, resetProjectData, reorderMacros, reorderScopes } = useConstruction();
  const { canEdit } = useAuth();
  
  const [editingMacro, setEditingMacro] = useState<{ id: string; name: string; color: string } | null>(null);
  const [newMacroName, setNewMacroName] = useState("");
  const [showAddMacro, setShowAddMacro] = useState(false);
  
  const [editingScope, setEditingScope] = useState<{ macroId: string; scope: Scope } | null>(null);
  const [newScope, setNewScope] = useState<{ macroId: string; name: string; weight: string } | null>(null);

  const [showResetWarning, setShowResetWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImportWeightsDialog, setShowImportWeightsDialog] = useState(false);
  const [showCriticalDeleteAlert, setShowCriticalDeleteAlert] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'macro' | 'scope'; macroId: string; scopeId?: string; name: string } | null>(null);
  
  // Drag state for macros
  const [draggedMacroId, setDraggedMacroId] = useState<string | null>(null);
  // Drag state for scopes
  const [draggedScope, setDraggedScope] = useState<{ macroId: string; scopeId: string } | null>(null);

  if (!currentProject) return null;

  const macrosTemplate = currentProject.macrosTemplate;
  const hasData = currentProject.setupComplete && currentProject.houses.some(h => 
    h.macros.some(m => m.scopes.some(s => s.progress > 0))
  );

  // Calculate total weight per macro and overall
  const weightAnalysis = useMemo(() => {
    const macroWeights = macrosTemplate.map(macro => ({
      id: macro.id,
      name: macro.name,
      totalWeight: macro.scopes.reduce((sum, scope) => sum + scope.weight, 0)
    }));
    const overallTotalWeight = macroWeights.reduce((sum, m) => sum + m.totalWeight, 0);
    return { macroWeights, overallTotalWeight };
  }, [macrosTemplate]);

  const needsWeightAdjustment = weightAnalysis.overallTotalWeight !== 100;


  const confirmOrExecute = (action: () => void) => {
    if (hasData) {
      setPendingAction(() => action);
      setShowResetWarning(true);
    } else {
      action();
    }
  };

  const handleConfirmReset = () => {
    if (pendingAction) {
      pendingAction();
      resetProjectData();
    }
    setShowResetWarning(false);
    setPendingAction(null);
  };

  const handleAddMacro = () => {
    if (newMacroName.trim()) {
      confirmOrExecute(() => {
        addMacro(newMacroName.trim());
        setNewMacroName("");
        setShowAddMacro(false);
      });
    }
  };

  const handleUpdateMacro = () => {
    if (editingMacro && editingMacro.name.trim()) {
      updateMacro(editingMacro.id, editingMacro.name.trim(), editingMacro.color);
      setEditingMacro(null);
    }
  };

  const handleDeleteMacro = (macroId: string) => {
    const macro = macrosTemplate.find(m => m.id === macroId);
    setDeleteTarget({ type: 'macro', macroId, name: macro?.name || 'Etapa' });
    setShowCriticalDeleteAlert(true);
  };

  const handleDeleteScope = (macroId: string, scopeId: string) => {
    const macro = macrosTemplate.find(m => m.id === macroId);
    const scope = macro?.scopes.find(s => s.id === scopeId);
    setDeleteTarget({ type: 'scope', macroId, scopeId, name: scope?.name || 'Serviço' });
    setShowCriticalDeleteAlert(true);
  };

  const confirmCriticalDelete = () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'macro') {
      confirmOrExecute(() => {
        deleteMacro(deleteTarget.macroId);
      });
    } else if (deleteTarget.type === 'scope' && deleteTarget.scopeId) {
      confirmOrExecute(() => {
        deleteScope(deleteTarget.macroId, deleteTarget.scopeId!);
      });
    }
    
    setShowCriticalDeleteAlert(false);
    setDeleteTarget(null);
  };

  // Import handlers
  const handleImportMacros = async (macros: ExtractedMacro[]) => {
    if (!currentProject) return;
    
    confirmOrExecute(async () => {
      for (const macro of macros) {
        await addMacro(macro.name);
        // Get the newly added macro from the updated template
        const updatedProject = currentProject;
        const newMacro = updatedProject.macrosTemplate[updatedProject.macrosTemplate.length - 1];
        if (newMacro) {
          await updateMacro(newMacro.id, macro.name, macro.color);
          for (const scope of macro.scopes) {
            await addScope(newMacro.id, scope.name, scope.weight);
          }
        }
      }
    });
  };

  const handleImportWeights = (macros: ExtractedMacro[]) => {
    if (!currentProject) return;
    
    // Match imported macros/scopes with existing ones and update weights
    for (const importedMacro of macros) {
      const existingMacro = macrosTemplate.find(m => 
        m.name.toLowerCase().includes(importedMacro.name.toLowerCase()) ||
        importedMacro.name.toLowerCase().includes(m.name.toLowerCase())
      );
      
      if (existingMacro) {
        for (const importedScope of importedMacro.scopes) {
          const existingScope = existingMacro.scopes.find(s =>
            s.name.toLowerCase().includes(importedScope.name.toLowerCase()) ||
            importedScope.name.toLowerCase().includes(s.name.toLowerCase())
          );
          
          if (existingScope) {
            updateScope(existingMacro.id, existingScope.id, { weight: importedScope.weight });
          }
        }
      }
    }
  };

  // Pull weights automatically from the project's budget
  const handlePullWeightsFromBudget = async () => {
    if (!currentProject) return;

    try {
      // Load all scope items for the project
      const { data: itemsData, error: itemsError } = await supabase
        .from('scope_items')
        .select('scope_id, unit_value, quantity')
        .eq('project_id', currentProject.id);

      if (itemsError) throw itemsError;
      if (!itemsData || itemsData.length === 0) {
        toast.error('Nenhum item de orçamento encontrado. Adicione itens ao orçamento primeiro.');
        return;
      }

      // Load scope_costs to get scope_name mappings (for legacy scope_ids)
      const { data: costsData, error: costsError } = await supabase
        .from('scope_costs')
        .select('scope_id, scope_name, macro_name')
        .eq('project_id', currentProject.id);

      if (costsError) throw costsError;

      const normalizeKeyPart = (value: string) => value.toLowerCase().trim();
      const makeKey = (macroName: string, scopeName: string) => `${normalizeKeyPart(macroName)}|${normalizeKeyPart(scopeName)}`;

      // Legacy scope_id -> { macroName, scopeName }
      const legacyScopeIdToNames: Record<string, { macroName: string; scopeName: string }> = {};
      (costsData || []).forEach((cost) => {
        legacyScopeIdToNames[cost.scope_id] = {
          macroName: cost.macro_name,
          scopeName: cost.scope_name,
        };
      });

      // Current template indexes
      const currentScopeIds = new Set<string>();
      const currentNameToScopeId: Record<string, string> = {};
      macrosTemplate.forEach((macro) => {
        macro.scopes.forEach((scope) => {
          currentScopeIds.add(scope.id);
          currentNameToScopeId[makeKey(macro.name, scope.name)] = scope.id;
        });
      });

      const findScopeIdByNames = (macroName: string, scopeName: string) => {
        const exact = currentNameToScopeId[makeKey(macroName, scopeName)];
        if (exact) return exact;

        const macroN = normalizeKeyPart(macroName);
        const scopeN = normalizeKeyPart(scopeName);

        // Partial match fallback (kept small): contains/contained-by
        for (const [key, scopeId] of Object.entries(currentNameToScopeId)) {
          const [kMacro, kScope] = key.split('|');
          const macroOk = macroN.includes(kMacro) || kMacro.includes(macroN);
          const scopeOk = scopeN.includes(kScope) || kScope.includes(scopeN);
          if (macroOk && scopeOk) return scopeId;
        }

        return null;
      };

      // Aggregate ONLY items that can be mapped to the current macrosTemplate (matches ProjectCostsView behavior)
      const totalsByScopeId: Record<string, number> = {};
      let ignoredCount = 0;
      let ignoredTotal = 0;

      for (const item of itemsData) {
        const total = Number(item.unit_value) * Number(item.quantity);
        if (!Number.isFinite(total) || total === 0) continue;

        let targetScopeId: string | null = null;

        if (currentScopeIds.has(item.scope_id)) {
          targetScopeId = item.scope_id;
        } else {
          const legacy = legacyScopeIdToNames[item.scope_id];
          if (legacy) {
            targetScopeId = findScopeIdByNames(legacy.macroName, legacy.scopeName);
          }
        }

        if (targetScopeId) {
          totalsByScopeId[targetScopeId] = (totalsByScopeId[targetScopeId] || 0) + total;
        } else {
          ignoredCount++;
          ignoredTotal += total;
        }
      }

      const grandTotal = Object.values(totalsByScopeId).reduce((sum, val) => sum + val, 0);

      if (grandTotal === 0) {
        toast.error('Não foi possível calcular os pesos: itens não estão vinculados aos serviços atuais.');
        return;
      }

      // Compute rounded weights (1 decimal) and fix rounding drift to total exactly 100%
      const computedWeights: Record<string, number> = {};
      let sumRounded = 0;
      let maxScopeId: string | null = null;
      let maxScopeTotal = -Infinity;

      for (const macro of macrosTemplate) {
        for (const scope of macro.scopes) {
          const scopeTotal = totalsByScopeId[scope.id] || 0;
          const w = (scopeTotal / grandTotal) * 100;
          const rounded = Math.round(w * 10) / 10;
          computedWeights[scope.id] = rounded;
          sumRounded += rounded;

          if (scopeTotal > maxScopeTotal) {
            maxScopeTotal = scopeTotal;
            maxScopeId = scope.id;
          }
        }
      }

      const drift = Math.round((100 - sumRounded) * 10) / 10;
      if (maxScopeId && drift !== 0) {
        computedWeights[maxScopeId] = Math.max(0, Math.round((computedWeights[maxScopeId] + drift) * 10) / 10);
      }

      // Update weights
      let updated = 0;
      for (const macro of macrosTemplate) {
        for (const scope of macro.scopes) {
          const newWeight = computedWeights[scope.id] ?? 0;
          await updateScope(macro.id, scope.id, { weight: newWeight });
          updated++;
        }
      }

      toast.success(`Pesos atualizados para ${updated} serviços com base no orçamento.`);

      if (ignoredCount > 0) {
        console.warn('Budget items ignored (unmapped to current scopes):', { ignoredCount, ignoredTotal });
      }
    } catch (error) {
      console.error('Error pulling weights from budget:', error);
      toast.error('Erro ao calcular pesos do orçamento');
    }
  };

  const handleAddScope = () => {
    if (newScope && newScope.name.trim() && newScope.weight) {
      confirmOrExecute(() => {
        addScope(newScope.macroId, newScope.name.trim(), parseFloat(newScope.weight) || 1);
        setNewScope(null);
      });
    }
  };

  const handleUpdateScope = () => {
    if (editingScope) {
      updateScope(editingScope.macroId, editingScope.scope.id, {
        name: editingScope.scope.name,
        weight: editingScope.scope.weight,
      });
      setEditingScope(null);
    }
  };

  // Note: handleDeleteScope moved to above with critical alert

  // Macro reordering
  const handleMacroDragStart = (e: DragEvent<HTMLDivElement>, macroId: string) => {
    e.stopPropagation();
    setDraggedMacroId(macroId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleMacroDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleMacroDrop = (e: DragEvent<HTMLDivElement>, targetMacroId: string) => {
    e.preventDefault();
    if (!draggedMacroId || draggedMacroId === targetMacroId) {
      setDraggedMacroId(null);
      return;
    }

    const currentOrder = macrosTemplate.map(m => m.id);
    const draggedIndex = currentOrder.indexOf(draggedMacroId);
    const targetIndex = currentOrder.indexOf(targetMacroId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedMacroId(null);
      return;
    }

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedMacroId);

    reorderMacros(newOrder);
    setDraggedMacroId(null);
  };

  const moveMacro = (macroId: string, direction: "up" | "down") => {
    const currentOrder = macrosTemplate.map(m => m.id);
    const currentIndex = currentOrder.indexOf(macroId);
    
    if (currentIndex === -1) return;
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === currentOrder.length - 1) return;

    const newOrder = [...currentOrder];
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];

    reorderMacros(newOrder);
  };

  // Scope reordering
  const handleScopeDragStart = (e: DragEvent<HTMLDivElement>, macroId: string, scopeId: string) => {
    e.stopPropagation();
    setDraggedScope({ macroId, scopeId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleScopeDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleScopeDrop = (e: DragEvent<HTMLDivElement>, macroId: string, targetScopeId: string) => {
    e.preventDefault();
    if (!draggedScope || draggedScope.macroId !== macroId || draggedScope.scopeId === targetScopeId) {
      setDraggedScope(null);
      return;
    }

    const macro = macrosTemplate.find(m => m.id === macroId);
    if (!macro) {
      setDraggedScope(null);
      return;
    }

    const currentOrder = macro.scopes.map(s => s.id);
    const draggedIndex = currentOrder.indexOf(draggedScope.scopeId);
    const targetIndex = currentOrder.indexOf(targetScopeId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedScope(null);
      return;
    }

    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedScope.scopeId);

    reorderScopes(macroId, newOrder);
    setDraggedScope(null);
  };

  const moveScope = (macroId: string, scopeId: string, direction: "up" | "down") => {
    const macro = macrosTemplate.find(m => m.id === macroId);
    if (!macro) return;

    const currentOrder = macro.scopes.map(s => s.id);
    const currentIndex = currentOrder.indexOf(scopeId);
    
    if (currentIndex === -1) return;
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === currentOrder.length - 1) return;

    const newOrder = [...currentOrder];
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];

    reorderScopes(macroId, newOrder);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-3 sm:p-6">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-base sm:text-lg">Gerenciar Etapas e Serviços</DialogTitle>
          </DialogHeader>
          
          {!canEdit && (
            <Alert>
              <Eye className="h-4 w-4" />
              <AlertDescription>
                Modo visualização - você pode ver as etapas e serviços mas não pode fazer alterações
              </AlertDescription>
            </Alert>
          )}

          {hasData && canEdit && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800 dark:text-amber-200">
                Adicionar, remover ou modificar etapas irá resetar todo o progresso das casas.
              </span>
            </div>
          )}

          {/* Weight Analysis Alert */}
          <div className={`p-3 rounded-lg border ${needsWeightAdjustment ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Scale className={`w-4 h-4 ${needsWeightAdjustment ? 'text-orange-600' : 'text-green-600'}`} />
                <div>
                  <span className={`text-sm font-medium ${needsWeightAdjustment ? 'text-orange-800 dark:text-orange-200' : 'text-green-800 dark:text-green-200'}`}>
                    Peso Total: {weightAnalysis.overallTotalWeight.toFixed(1)}%
                  </span>
                  {needsWeightAdjustment && (
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                      A soma dos pesos deve ser 100% para cálculos precisos. Diferença: {(100 - weightAnalysis.overallTotalWeight).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            </div>
            <Progress 
              value={Math.min(weightAnalysis.overallTotalWeight, 100)} 
              className="mt-2 h-2"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Arraste os itens ou use as setas para reorganizar a ordem das etapas e serviços.
          </p>
          
          <div className="flex-1 overflow-y-auto space-y-4 py-2 sm:py-4 min-h-0">
            {/* Action Buttons - Only show if can edit */}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {!showAddMacro ? (
                  <Button 
                    variant="outline" 
                    className="flex-1 min-w-[150px] border-dashed text-xs sm:text-sm"
                    onClick={() => setShowAddMacro(true)}
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Adicionar Nova Etapa</span>
                    <span className="sm:hidden">Nova Etapa</span>
                  </Button>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 p-2 sm:p-3 bg-secondary/50 rounded-lg flex-1">
                    <Input
                      placeholder="Nome da etapa..."
                      value={newMacroName}
                      onChange={(e) => setNewMacroName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddMacro()}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddMacro} className="text-xs">Adicionar</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddMacro(false); setNewMacroName(""); }} className="text-xs">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
                {!showAddMacro && (
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <Button 
                      variant="outline"
                      onClick={() => setShowCopyDialog(true)}
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      <Copy className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Copiar de Outra Obra</span>
                      <span className="sm:hidden">Copiar</span>
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowImportDialog(true)}
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Importar Etapas</span>
                      <span className="sm:hidden">Importar</span>
                    </Button>
                    <Button 
                      variant="default"
                      onClick={handlePullWeightsFromBudget}
                      title="Puxar pesos automaticamente do orçamento da obra"
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      <Calculator className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Autoajuste de Pesos</span>
                      <span className="sm:hidden">Autoajuste</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Macros List */}
            <div className="space-y-2">
              {macrosTemplate.map((macro, macroIndex) => (
                <div 
                  key={macro.id}
                  draggable={!editingMacro && !editingScope && !newScope}
                  onDragStart={(e) => !editingMacro && !editingScope && !newScope && handleMacroDragStart(e, macro.id)}
                  onDragOver={handleMacroDragOver}
                  onDrop={(e) => handleMacroDrop(e, macro.id)}
                  className={`border border-border rounded-lg overflow-hidden transition-all ${
                    draggedMacroId === macro.id ? "opacity-50" : ""
                  }`}
                >
                  <Accordion type="multiple">
                    <AccordionItem value={macro.id} className="border-0">
                      <AccordionTrigger className="px-3 py-2 hover:no-underline hover:bg-secondary/50">
                        <div className="flex items-center justify-between w-full pr-2">
                          {editingMacro?.id === macro.id ? (
                            <div className="flex gap-2 items-center flex-1" onClick={(e) => e.stopPropagation()}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-8 h-8 rounded-md border border-border flex-shrink-0"
                                    style={{ backgroundColor: editingMacro.color }}
                                  />
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-3" align="start">
                                  <div className="grid grid-cols-6 gap-2">
                                    {DEFAULT_MACRO_COLORS.map((color) => (
                                      <button
                                        key={color}
                                        className="w-7 h-7 rounded-md border-2 transition-transform hover:scale-110"
                                        style={{ 
                                          backgroundColor: color,
                                          borderColor: editingMacro.color === color ? 'hsl(var(--foreground))' : 'transparent'
                                        }}
                                        onClick={() => setEditingMacro({ ...editingMacro, color })}
                                      />
                                    ))}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-2 text-center">24 cores disponíveis</p>
                                </PopoverContent>
                              </Popover>
                              <Input
                                value={editingMacro.name}
                                onChange={(e) => setEditingMacro({ ...editingMacro, name: e.target.value })}
                                className="h-8"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdateMacro();
                                  if (e.key === "Escape") setEditingMacro(null);
                                }}
                              />
                              <Button size="sm" variant="ghost" onClick={handleUpdateMacro}>Salvar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingMacro(null)}>Cancelar</Button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                <div 
                                  className="w-4 h-4 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: macro.color }}
                                />
                                <span className="text-sm font-medium">{macro.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {weightAnalysis.macroWeights.find(m => m.id === macro.id)?.totalWeight.toFixed(1)}%
                                </Badge>
                              </div>
                              {canEdit && (
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7"
                                    onClick={() => moveMacro(macro.id, "up")}
                                    disabled={macroIndex === 0}
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7"
                                    onClick={() => moveMacro(macro.id, "down")}
                                    disabled={macroIndex === macrosTemplate.length - 1}
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7"
                                    onClick={() => setEditingMacro({ id: macro.id, name: macro.name, color: macro.color })}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteMacro(macro.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3">
                        <div className="space-y-2">
                          {/* Scopes List */}
                          {macro.scopes.map((scope, scopeIndex) => (
                            <div 
                              key={scope.id}
                              draggable={!editingMacro && !editingScope && !newScope}
                              onDragStart={(e) => !editingMacro && !editingScope && !newScope && handleScopeDragStart(e, macro.id, scope.id)}
                              onDragOver={handleScopeDragOver}
                              onDrop={(e) => handleScopeDrop(e, macro.id, scope.id)}
                              className={`flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors ${
                                draggedScope?.scopeId === scope.id ? "opacity-50" : ""
                              }`}
                            >
                              {editingScope?.scope.id === scope.id ? (
                                <div className="flex gap-2 items-center flex-1">
                                  <Input
                                    value={editingScope.scope.name}
                                    onChange={(e) => setEditingScope({ 
                                      ...editingScope, 
                                      scope: { ...editingScope.scope, name: e.target.value } 
                                    })}
                                    className="h-8 flex-1"
                                    placeholder="Nome do serviço"
                                  />
                                  <Input
                                    type="number"
                                    value={editingScope.scope.weight}
                                    onChange={(e) => setEditingScope({ 
                                      ...editingScope, 
                                      scope: { ...editingScope.scope, weight: parseFloat(e.target.value) || 0 } 
                                    })}
                                    onFocus={(e) => e.target.select()}
                                    className="h-8 w-20"
                                    placeholder="Peso"
                                  />
                                  <Button size="sm" variant="ghost" onClick={handleUpdateScope}>Salvar</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingScope(null)}>X</Button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                    <span className="text-sm">{scope.name}</span>
                                    <span className="text-xs text-muted-foreground">(Peso: {scope.weight}%)</span>
                                  </div>
                                  {canEdit && (
                                    <div className="flex gap-1">
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7"
                                        onClick={() => moveScope(macro.id, scope.id, "up")}
                                        disabled={scopeIndex === 0}
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7"
                                        onClick={() => moveScope(macro.id, scope.id, "down")}
                                        disabled={scopeIndex === macro.scopes.length - 1}
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7"
                                        onClick={() => setEditingScope({ macroId: macro.id, scope: { ...scope } })}
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => handleDeleteScope(macro.id, scope.id)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                          
                          {/* Add Scope */}
                          {newScope?.macroId === macro.id ? (
                            <div className="flex gap-2 items-center p-2 bg-secondary/50 rounded-lg">
                              <Input
                                value={newScope.name}
                                onChange={(e) => setNewScope({ ...newScope, name: e.target.value })}
                                className="h-8 flex-1"
                                placeholder="Nome do serviço"
                              />
                              <Input
                                type="number"
                                value={newScope.weight}
                                onChange={(e) => setNewScope({ ...newScope, weight: e.target.value })}
                                onFocus={(e) => e.target.select()}
                                className="h-8 w-20"
                                placeholder="Peso %"
                              />
                              <Button size="sm" onClick={handleAddScope}>Adicionar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setNewScope(null)}>X</Button>
                            </div>
                          ) : canEdit ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="w-full border border-dashed mt-2"
                              onClick={() => setNewScope({ macroId: macro.id, name: "", weight: "" })}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Adicionar Serviço
                            </Button>
                          ) : null}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showResetWarning} onOpenChange={setShowResetWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atenção: Dados serão perdidos</AlertDialogTitle>
            <AlertDialogDescription>
              Alterar a estrutura de etapas irá resetar todo o progresso de todas as casas do projeto. 
              Esta ação não pode ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Confirmar e Resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CopyMacrosDialog 
        open={showCopyDialog} 
        onOpenChange={setShowCopyDialog} 
      />

      <ImportMacrosDialog 
        open={showImportDialog} 
        onOpenChange={setShowImportDialog}
        onImport={handleImportMacros}
        mode="structure"
      />

      <ImportMacrosDialog 
        open={showImportWeightsDialog} 
        onOpenChange={setShowImportWeightsDialog}
        onImport={handleImportWeights}
        mode="weights"
      />

      {/* Critical Delete Alert */}
      <AlertDialog open={showCriticalDeleteAlert} onOpenChange={setShowCriticalDeleteAlert}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-destructive/10 rounded-full">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-destructive">
                ⚠️ ALERTA CRÍTICO DE EXCLUSÃO
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="font-semibold text-foreground">
                    Você está prestes a excluir: <span className="text-destructive">{deleteTarget?.name}</span>
                  </p>
                  <p className="text-sm mt-1">
                    Obra: <span className="font-medium">{currentProject?.name}</span>
                  </p>
                </div>
                
                <div className="text-sm space-y-2 text-muted-foreground">
                  <p className="font-semibold text-foreground">Esta ação irá:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Remover permanentemente {deleteTarget?.type === 'macro' ? 'esta etapa e todos os seus serviços' : 'este serviço'}</li>
                    <li className="text-destructive font-medium">ZERAR TODO O PROGRESSO de todas as {currentProject?.houses.length || 0} casas da obra</li>
                    <li>Esta ação NÃO pode ser desfeita</li>
                  </ul>
                </div>

                <div className="p-2 bg-amber-100 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 rounded text-sm text-amber-800 dark:text-amber-200">
                  <strong>Recomendação:</strong> Exporte os dados antes de prosseguir.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmCriticalDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}