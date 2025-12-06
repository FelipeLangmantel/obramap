import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Macro, Scope } from "@/data/constructionData";

interface ManageMacrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageMacrosDialog({ open, onOpenChange }: ManageMacrosDialogProps) {
  const { macrosTemplate, addMacro, updateMacro, deleteMacro, addScope, updateScope, deleteScope } = useConstruction();
  
  const [editingMacro, setEditingMacro] = useState<{ id: string; name: string } | null>(null);
  const [newMacroName, setNewMacroName] = useState("");
  const [showAddMacro, setShowAddMacro] = useState(false);
  
  const [editingScope, setEditingScope] = useState<{ macroId: string; scope: Scope } | null>(null);
  const [newScope, setNewScope] = useState<{ macroId: string; name: string; weight: string } | null>(null);

  const handleAddMacro = () => {
    if (newMacroName.trim()) {
      addMacro(newMacroName.trim());
      setNewMacroName("");
      setShowAddMacro(false);
    }
  };

  const handleUpdateMacro = () => {
    if (editingMacro && editingMacro.name.trim()) {
      updateMacro(editingMacro.id, editingMacro.name.trim());
      setEditingMacro(null);
    }
  };

  const handleDeleteMacro = (macroId: string) => {
    if (confirm("Tem certeza que deseja excluir esta etapa? Todos os serviços serão removidos.")) {
      deleteMacro(macroId);
    }
  };

  const handleAddScope = () => {
    if (newScope && newScope.name.trim() && newScope.weight) {
      addScope(newScope.macroId, newScope.name.trim(), parseFloat(newScope.weight) || 1);
      setNewScope(null);
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
    if (confirm("Tem certeza que deseja excluir este serviço?")) {
      deleteScope(macroId, scopeId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Etapas e Serviços</DialogTitle>
        </DialogHeader>
        
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
                        <span className="text-sm font-medium">{macro.name}</span>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-7 w-7"
                            onClick={() => setEditingMacro({ id: macro.id, name: macro.name })}
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
  );
}
