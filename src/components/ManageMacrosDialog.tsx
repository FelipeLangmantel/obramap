import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical, AlertTriangle } from "lucide-react";
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
  const { currentProject, addMacro, updateMacro, deleteMacro, addScope, updateScope, deleteScope, resetProjectData } = useConstruction();
  
  const [editingMacro, setEditingMacro] = useState<{ id: string; name: string; color: string } | null>(null);
  const [newMacroName, setNewMacroName] = useState("");
  const [showAddMacro, setShowAddMacro] = useState(false);
  
  const [editingScope, setEditingScope] = useState<{ macroId: string; scope: Scope } | null>(null);
  const [newScope, setNewScope] = useState<{ macroId: string; name: string; weight: string } | null>(null);

  const [showResetWarning, setShowResetWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

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
          
          <div className="space-y-4 py-4">
            {/* Add Macro Button */}
            {!showAddMacro ? (
              <Button 
                variant="outline" 
                className="w-full border-dashed"
                onClick={() => setShowAddMacro(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Nova Etapa
              </Button>
            ) : (
              <div className="flex gap-2 p-3 bg-secondary/50 rounded-lg">
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

            {/* Macros List */}
            <Accordion type="multiple" className="space-y-2">
              {macrosTemplate.map(macro => (
                <AccordionItem 
                  key={macro.id} 
                  value={macro.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
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
                      {macro.scopes.map(scope => (
                        <div 
                          key={scope.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
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
                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm">{scope.name}</span>
                                <span className="text-xs text-muted-foreground">(Peso: {scope.weight}%)</span>
                              </div>
                              <div className="flex gap-1">
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
              ))}
            </Accordion>
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
    </>
  );
}