import { useState, useEffect } from "react";
import { useConstruction } from "@/contexts/ConstructionContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Grid3X3,
  Home
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ManageQuadrasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageQuadrasDialog({ open, onOpenChange }: ManageQuadrasDialogProps) {
  const { currentProject, addQuadra, updateQuadra, deleteQuadra } = useConstruction();
  
  const [newQuadraName, setNewQuadraName] = useState("");
  const [selectedHouseIds, setSelectedHouseIds] = useState<number[]>([]);
  const [editingQuadraId, setEditingQuadraId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingHouseIds, setEditingHouseIds] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);

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

  // Get houses assigned to a specific quadra
  const getQuadraHouses = (quadraId: string) => {
    const quadra = currentProject?.quadras.find(q => q.id === quadraId);
    return quadra?.houses || [];
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

  const selectRangeUnassigned = (start: number, end: number) => {
    const unassigned = getUnassignedHouses();
    const range = unassigned.filter(id => id >= start && id <= end);
    setSelectedHouseIds(range);
  };

  if (!currentProject) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Grid3X3 className="h-5 w-5" />
            Cadastro de Quadras - {currentProject.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Summary */}
          <div className="flex gap-4 text-sm">
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
                <CardTitle className="text-base">Nova Quadra</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome da Quadra</Label>
                  <Input
                    value={newQuadraName}
                    onChange={(e) => setNewQuadraName(e.target.value)}
                    placeholder="Ex: Quadra A, Bloco 1..."
                  />
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
                    <ScrollArea className="h-32 border rounded-md p-3">
                      <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1">
                        {unassignedHouses.map(houseId => (
                          <button
                            key={houseId}
                            onClick={() => toggleHouseSelection(houseId, false)}
                            className={`
                              h-8 w-8 text-xs rounded border transition-colors
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

          {/* Existing Quadras */}
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-4">
              {currentProject.quadras.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Nenhuma quadra cadastrada
                </div>
              ) : (
                currentProject.quadras.map(quadra => (
                  <Card key={quadra.id} className={editingQuadraId === quadra.id ? "border-primary" : ""}>
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
                            <ScrollArea className="h-32 border rounded-md p-3">
                              <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1">
                                {/* Show current houses + unassigned houses */}
                                {[...quadra.houses, ...unassignedHouses]
                                  .sort((a, b) => a - b)
                                  .map(houseId => (
                                    <button
                                      key={houseId}
                                      onClick={() => toggleHouseSelection(houseId, true)}
                                      className={`
                                        h-8 w-8 text-xs rounded border transition-colors
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
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium">{quadra.name}</h4>
                              <Badge variant="secondary" className="text-xs">
                                {quadra.houses.length} casas
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {quadra.houses.slice(0, 20).map(houseId => (
                                <span 
                                  key={houseId}
                                  className="inline-flex items-center justify-center h-6 w-6 text-xs bg-muted rounded"
                                >
                                  {houseId}
                                </span>
                              ))}
                              {quadra.houses.length > 20 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  +{quadra.houses.length - 20} mais
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex gap-1">
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
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
