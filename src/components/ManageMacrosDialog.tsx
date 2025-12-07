import { useState, DragEvent } from "react";
import { Plus, Pencil, Trash2, GripVertical, AlertTriangle, ArrowUp, ArrowDown, Copy } from "lucide-react";
import { CopyMacrosDialog } from "./CopyMacrosDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Scope } from "@/data/constructionData";
import { DEFAULT_MACRO_COLORS } from "@/data/constructionData";

interface ManageMacrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageMacrosDialog({ open, onOpenChange }: ManageMacrosDialogProps) {
  const { currentProject, addMacro, updateMacro, deleteMacro, addScope, updateScope, deleteScope, resetProjectData, reorderMacros, reorderScopes } = useConstruction();
  
  const [editingMacro, setEditingMacro] = useState<{ id: string; name: string; color: string } | null>(null);
  const [newMacroName, setNewMacroName] = useState("");
  const [showAddMacro, setShowAddMacro] = useState(false);
  
  const [editingScope, setEditingScope] = useState<{ macroId: string; scope: Scope } | null>(null);
  const [newScope, setNewScope] = useState<{ macroId: string; name: string; weight: string } | null>(null);

  const [showResetWarning, setShowResetWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  
  // Drag state for macros
  const [draggedMacroId, setDraggedMacroId] = useState<string | null>(null);
  // Drag state for scopes
  const [draggedScope, setDraggedScope] = useState<{ macroId: string; scopeId: string } | null>(null);

  if (!currentProject) return null;

  const macrosTemplate = currentProject.macrosTemplate;
  const hasData = currentProject.setupComplete && currentProject.houses.some(h => 
    h.macros.some(m => m.scopes.some(s => s.progress > 0))
  );

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
    confirmOrExecute(() => {
      deleteMacro(macroId);
    });
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

  const handleDeleteScope = (macroId: string, scopeId: string) => {
    confirmOrExecute(() => {
      deleteScope(macroId, scopeId);
    });
  };

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
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Etapas e Serviços</DialogTitle>
          </DialogHeader>
          
          {hasData && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800 dark:text-amber-200">
                Adicionar, remover ou modificar etapas irá resetar todo o progresso das casas.
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Arraste os itens ou use as setas para reorganizar a ordem das etapas e serviços.
          </p>
          
          <div className="space-y-4 py-4">
            {/* Action Buttons */}
            <div className="flex gap-2">
              {!showAddMacro ? (
                <Button 
                  variant="outline" 
                  className="flex-1 border-dashed"
                  onClick={() => setShowAddMacro(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Nova Etapa
                </Button>
              ) : (
                <div className="flex gap-2 p-3 bg-secondary/50 rounded-lg flex-1">
                  <Input
                    placeholder="Nome da etapa..."
                    value={newMacroName}
                    onChange={(e) => setNewMacroName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddMacro()}
                  />
                  <Button size="sm" onClick={handleAddMacro}>Adicionar</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddMacro(false); setNewMacroName(""); }}>
                    Cancelar
                  </Button>
                </div>
              )}
              {!showAddMacro && (
                <Button 
                  variant="outline"
                  onClick={() => setShowCopyDialog(true)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar de Outra Obra
                </Button>
              )}
            </div>

            {/* Macros List */}
            <div className="space-y-2">
              {macrosTemplate.map((macro, macroIndex) => (
                <div 
                  key={macro.id}
                  draggable
                  onDragStart={(e) => handleMacroDragStart(e, macro.id)}
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
                                <PopoverContent className="w-auto p-2" align="start">
                                  <div className="grid grid-cols-4 gap-2">
                                    {DEFAULT_MACRO_COLORS.map((color) => (
                                      <button
                                        key={color}
                                        className="w-8 h-8 rounded-md border-2 transition-transform hover:scale-110"
                                        style={{ 
                                          backgroundColor: color,
                                          borderColor: editingMacro.color === color ? 'hsl(var(--foreground))' : 'transparent'
                                        }}
                                        onClick={() => setEditingMacro({ ...editingMacro, color })}
                                      />
                                    ))}
                                  </div>
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
                              </div>
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
                              draggable
                              onDragStart={(e) => handleScopeDragStart(e, macro.id, scope.id)}
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
                                className="h-8 w-20"
                                placeholder="Peso %"
                              />
                              <Button size="sm" onClick={handleAddScope}>Adicionar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setNewScope(null)}>X</Button>
                            </div>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="w-full border border-dashed mt-2"
                              onClick={() => setNewScope({ macroId: macro.id, name: "", weight: "" })}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Adicionar Serviço
                            </Button>
                          )}
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
    </>
  );
}