import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useProjectSetupFlow } from "@/hooks/useProjectSetupFlow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Grid3X3,
  Home,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ManageQuadrasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Detect naming pattern type
type NamingPattern = "letter" | "number" | "custom";

function detectNamingPattern(names: string[]): NamingPattern {
  if (names.length === 0) return "letter";
  
  const allLetters = names.every(name => /^[A-Za-z]$/.test(name.trim()));
  const allNumbers = names.every(name => /^\d+$/.test(name.trim()));
  
  if (allLetters) return "letter";
  if (allNumbers) return "number";
  return "custom";
}

function getNextInSequence(names: string[], pattern: NamingPattern): string {
  if (names.length === 0) {
    return pattern === "number" ? "1" : "A";
  }

  if (pattern === "letter") {
    const letters = names.map(n => n.trim().toUpperCase()).filter(n => /^[A-Z]$/.test(n)).sort();
    if (letters.length === 0) return "A";
    
    // Find the next available letter
    const usedSet = new Set(letters);
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedSet.has(letter)) return letter;
    }
    return "AA"; // fallback if all letters used
  }
  
  if (pattern === "number") {
    const numbers = names.map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (numbers.length === 0) return "1";
    
    const maxNum = Math.max(...numbers);
    return String(maxNum + 1);
  }
  
  return `Quadra ${names.length + 1}`;
}

export function ManageQuadrasDialog({ open, onOpenChange }: ManageQuadrasDialogProps) {
  const { currentProject, addQuadra, updateQuadra, deleteQuadra, reorderQuadras, renameHouse } = useConstruction();
  const { advanceToStep, currentStep } = useProjectSetupFlow();
  
  const [newQuadraName, setNewQuadraName] = useState("");
  const [selectedHouseIds, setSelectedHouseIds] = useState<number[]>([]);
  const [editingQuadraId, setEditingQuadraId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingHouseIds, setEditingHouseIds] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [editingHouseNumber, setEditingHouseNumber] = useState<number | null>(null);
  const [newHouseNumber, setNewHouseNumber] = useState("");
  
  // Drag selection state for house selection
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'select' | 'deselect'>('select');
  const dragStartRef = useRef<number | null>(null);
  const isEditingRef = useRef<boolean>(false);

  // Avançar etapa de setup ao fechar se tiver quadras configuradas
  const handleOpenChange = useCallback(async (isOpen: boolean) => {
    if (!isOpen && currentProject && currentProject.quadras.length > 0) {
      if (currentStep === "project_created") {
        await advanceToStep("blocks_configured");
        toast.success("Etapa 'Quadras e Casas' concluída!");
      }
    }
    onOpenChange(isOpen);
  }, [currentProject, currentStep, advanceToStep, onOpenChange]);

  // Detect current naming pattern
  const namingPattern = useMemo(() => {
    if (!currentProject) return "letter" as NamingPattern;
    return detectNamingPattern(currentProject.quadras.map(q => q.name));
  }, [currentProject?.quadras]);

  // Auto-suggest next name
  const suggestedName = useMemo(() => {
    if (!currentProject) return "A";
    return getNextInSequence(currentProject.quadras.map(q => q.name), namingPattern);
  }, [currentProject?.quadras, namingPattern]);

  // Auto-fill suggested name when opening add form
  useEffect(() => {
    if (isAdding && !newQuadraName) {
      setNewQuadraName(suggestedName);
    }
  }, [isAdding, suggestedName]);

  // Get all houses that are not assigned to any quadra
  const getUnassignedHouses = () => {
    if (!currentProject) return [];
    const assignedHouseIds = new Set(
      currentProject.quadras.flatMap(q => q.houses)
    );
    return currentProject.houses
      .filter(h => !assignedHouseIds.has(h.id))
      .map(h => h.id);
  };

  const handleAddQuadra = () => {
    if (!newQuadraName.trim()) {
      toast.error("Digite o nome da quadra");
      return;
    }
    if (selectedHouseIds.length === 0) {
      toast.error("Selecione pelo menos uma casa");
      return;
    }
    
    addQuadra(newQuadraName.trim(), selectedHouseIds);
    setNewQuadraName("");
    setSelectedHouseIds([]);
    setIsAdding(false);
    toast.success("Quadra adicionada com sucesso!");
  };

  const handleStartEdit = (quadraId: string) => {
    const quadra = currentProject?.quadras.find(q => q.id === quadraId);
    if (quadra) {
      setEditingQuadraId(quadraId);
      setEditingName(quadra.name);
      setEditingHouseIds([...quadra.houses]);
    }
  };

  const handleSaveEdit = () => {
    if (!editingQuadraId) return;
    if (!editingName.trim()) {
      toast.error("Digite o nome da quadra");
      return;
    }
    
    updateQuadra(editingQuadraId, editingName.trim(), editingHouseIds);
    setEditingQuadraId(null);
    setEditingName("");
    setEditingHouseIds([]);
    toast.success("Quadra atualizada!");
  };

  const handleCancelEdit = () => {
    setEditingQuadraId(null);
    setEditingName("");
    setEditingHouseIds([]);
  };

  const handleDeleteQuadra = (quadraId: string) => {
    if (confirm("Tem certeza que deseja excluir esta quadra?")) {
      deleteQuadra(quadraId);
      toast.success("Quadra excluída!");
    }
  };

  const toggleHouseSelection = (houseId: number, isEditing: boolean) => {
    if (isEditing) {
      setEditingHouseIds(prev => 
        prev.includes(houseId) 
          ? prev.filter(id => id !== houseId)
          : [...prev, houseId]
      );
    } else {
      setSelectedHouseIds(prev => 
        prev.includes(houseId) 
          ? prev.filter(id => id !== houseId)
          : [...prev, houseId]
      );
    }
  };

  const selectAllUnassigned = () => {
    setSelectedHouseIds(getUnassignedHouses());
  };

  // Drag selection handlers for house selection (left-click drag)
  const handleHouseMouseDown = (houseId: number, isEditing: boolean, event: React.MouseEvent) => {
    // Start drag on left mouse button
    if (event.button === 0) {
      event.preventDefault();
      setIsDragging(true);
      dragStartRef.current = houseId;
      isEditingRef.current = isEditing;
      
      // Determine drag mode based on current selection state
      const currentSelection = isEditing ? editingHouseIds : selectedHouseIds;
      const isCurrentlySelected = currentSelection.includes(houseId);
      setDragMode(isCurrentlySelected ? 'deselect' : 'select');
      
      // Toggle the initial house
      toggleHouseSelection(houseId, isEditing);
    }
  };

  const handleHouseMouseEnter = (houseId: number, isEditing: boolean) => {
    if (!isDragging || isEditingRef.current !== isEditing) return;
    
    const currentSelection = isEditing ? editingHouseIds : selectedHouseIds;
    
    if (dragMode === 'select') {
      if (!currentSelection.includes(houseId)) {
        toggleHouseSelection(houseId, isEditing);
      }
    } else {
      if (currentSelection.includes(houseId)) {
        toggleHouseSelection(houseId, isEditing);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Add global mouse up listener to handle mouse up outside grid
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || !currentProject) return;

    const newQuadras = [...currentProject.quadras];
    const [draggedItem] = newQuadras.splice(draggedIndex, 1);
    newQuadras.splice(index, 0, draggedItem);
    
    reorderQuadras(newQuadras.map(q => q.id));
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    toast.success("Ordem das quadras atualizada!");
  };

  // Move quadra up/down
  const moveQuadra = (index: number, direction: "up" | "down") => {
    if (!currentProject) return;
    
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentProject.quadras.length) return;

    const newQuadras = [...currentProject.quadras];
    [newQuadras[index], newQuadras[newIndex]] = [newQuadras[newIndex], newQuadras[index]];
    
    reorderQuadras(newQuadras.map(q => q.id));
    toast.success("Ordem atualizada!");
  };

  if (!currentProject) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastro de Quadras</DialogTitle>
          </DialogHeader>
          <div className="text-center text-muted-foreground py-8">
            Selecione uma obra para gerenciar as quadras
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const unassignedHouses = getUnassignedHouses();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Grid3X3 className="h-5 w-5" />
            Cadastro de Quadras - {currentProject.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 pr-2 pb-4">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="gap-1">
                <Home className="h-3 w-3" />
                Total: {currentProject.houses.length} casas
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Grid3X3 className="h-3 w-3" />
                {currentProject.quadras.length} quadras
              </Badge>
              <Badge variant="secondary" className="gap-1">
                {unassignedHouses.length} casas sem quadra
              </Badge>
              <Badge variant="outline" className="gap-1 ml-auto">
                <Sparkles className="h-3 w-3" />
                Padrão: {namingPattern === "letter" ? "Letras (A, B, C...)" : namingPattern === "number" ? "Números (1, 2, 3...)" : "Personalizado"}
              </Badge>
            </div>

            {/* Add New Quadra Button */}
            {!isAdding && (
              <Button onClick={() => setIsAdding(true)} className="w-fit gap-2">
                <Plus className="h-4 w-4" />
                Nova Quadra
              </Button>
            )}

            {/* Add New Quadra Form */}
            {isAdding && (
              <Card className="border-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    Nova Quadra
                    <Badge variant="secondary" className="text-xs">
                      Sugerido: {suggestedName}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome da Quadra</Label>
                    <Input
                      value={newQuadraName}
                      onChange={(e) => setNewQuadraName(e.target.value)}
                      placeholder={`Ex: ${suggestedName}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      O sistema detectou padrão de {namingPattern === "letter" ? "letras" : namingPattern === "number" ? "números" : "nomes personalizados"}. 
                      A próxima sugestão é "{suggestedName}".
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Casas ({selectedHouseIds.length} selecionadas)</Label>
                      {unassignedHouses.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={selectAllUnassigned}
                        >
                          Selecionar todas
                        </Button>
                      )}
                    </div>
                    
                    {unassignedHouses.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md">
                        Todas as casas já estão atribuídas a quadras
                      </div>
                    ) : (
                      <ScrollArea className="h-40 border rounded-md p-3">
                        <div 
                          className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1 select-none"
                          onMouseUp={handleMouseUp}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {unassignedHouses.map(houseId => (
                            <button
                              key={houseId}
                              onMouseDown={(e) => handleHouseMouseDown(houseId, false, e)}
                              onMouseEnter={() => handleHouseMouseEnter(houseId, false)}
                              onContextMenu={(e) => e.preventDefault()}
                              className={`
                                h-8 w-8 text-xs rounded border transition-colors cursor-pointer
                                ${selectedHouseIds.includes(houseId)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-card hover:bg-accent border-border'
                                }
                              `}
                            >
                              {houseId}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          💡 Segure o botão esquerdo e arraste para selecionar várias casas
                        </p>
                      </ScrollArea>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleAddQuadra} className="gap-2">
                      <Save className="h-4 w-4" />
                      Salvar
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsAdding(false);
                        setNewQuadraName("");
                        setSelectedHouseIds([]);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Existing Quadras with Drag & Drop */}
            <div className="space-y-2">
              {currentProject.quadras.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Nenhuma quadra cadastrada
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <GripVertical className="h-3 w-3" />
                    Arraste para reordenar ou use as setas • Duplo clique no número da casa para editar
                  </p>
                  {currentProject.quadras.map((quadra, index) => (
                    <Card 
                      key={quadra.id} 
                      className={`
                        ${editingQuadraId === quadra.id ? "border-primary" : ""}
                        ${draggedIndex === index ? "opacity-50 border-dashed" : ""}
                        transition-all
                      `}
                      draggable={editingQuadraId !== quadra.id}
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                    >
                      <CardContent className="p-4">
                        {editingQuadraId === quadra.id ? (
                          // Editing mode
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Nome da Quadra</Label>
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Casas ({editingHouseIds.length} selecionadas)</Label>
                              <ScrollArea className="h-40 border rounded-md p-3">
                                <div 
                                  className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1 select-none"
                                  onMouseUp={handleMouseUp}
                                  onContextMenu={(e) => e.preventDefault()}
                                >
                                  {/* Show current houses + unassigned houses */}
                                  {[...quadra.houses, ...unassignedHouses]
                                    .sort((a, b) => a - b)
                                    .map(houseId => (
                                      <button
                                        key={houseId}
                                        onMouseDown={(e) => handleHouseMouseDown(houseId, true, e)}
                                        onMouseEnter={() => handleHouseMouseEnter(houseId, true)}
                                        onContextMenu={(e) => e.preventDefault()}
                                        className={`
                                          h-8 w-8 text-xs rounded border transition-colors cursor-pointer
                                          ${editingHouseIds.includes(houseId)
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-card hover:bg-accent border-border'
                                          }
                                        `}
                                      >
                                        {houseId}
                                      </button>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2 text-center">
                                  💡 Segure o botão esquerdo e arraste para selecionar várias casas
                                </p>
                              </ScrollArea>
                            </div>

                            <div className="flex gap-2">
                              <Button size="sm" onClick={handleSaveEdit} className="gap-2">
                                <Save className="h-4 w-4" />
                                Salvar
                              </Button>
                              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                <X className="h-4 w-4 mr-2" />
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium">{quadra.name}</h4>
                                  <Badge variant="secondary" className="text-xs">
                                    {quadra.houses.length} casas
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {quadra.houses.slice(0, 20).map(houseId => (
                                    editingHouseNumber === houseId ? (
                                      <input
                                        key={houseId}
                                        type="number"
                                        className="h-7 w-12 text-xs rounded border border-primary bg-background text-center focus:outline-none focus:ring-1 focus:ring-primary"
                                        value={newHouseNumber}
                                        onChange={(e) => setNewHouseNumber(e.target.value)}
                                        onBlur={async () => {
                                          const num = parseInt(newHouseNumber);
                                          if (num && num !== houseId) {
                                            const success = await renameHouse(houseId, num);
                                            if (success) toast.success(`Casa ${houseId} → ${num}`);
                                          }
                                          setEditingHouseNumber(null);
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            const num = parseInt(newHouseNumber);
                                            if (num && num !== houseId) {
                                              const success = await renameHouse(houseId, num);
                                              if (success) toast.success(`Casa ${houseId} → ${num}`);
                                            }
                                            setEditingHouseNumber(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingHouseNumber(null);
                                          }
                                        }}
                                        autoFocus
                                      />
                                    ) : (
                                      <span 
                                        key={houseId}
                                        className="inline-flex items-center justify-center h-6 min-w-[1.5rem] px-1 text-xs bg-muted rounded cursor-pointer hover:bg-primary/20 transition-colors"
                                        onDoubleClick={() => {
                                          setEditingHouseNumber(houseId);
                                          setNewHouseNumber(String(houseId));
                                        }}
                                        title="Duplo clique para editar número"
                                      >
                                        {houseId}
                                      </span>
                                    )
                                  ))}
                                  {quadra.houses.length > 20 && (
                                    <span className="text-xs text-muted-foreground ml-1 flex items-center">
                                      +{quadra.houses.length - 20} mais
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-1 items-center">
                              <div className="flex flex-col">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => moveQuadra(index, "up")}
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => moveQuadra(index, "down")}
                                  disabled={index === currentProject.quadras.length - 1}
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleStartEdit(quadra.id)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteQuadra(quadra.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
