import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Save, Trash2, CalendarDays, AlertCircle, Home } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WeeklyProduction {
  id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  scope_id: string;
  scope_name: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  house_ids: number[];
  houses_count: number;
  created_at: string;
  notes: string | null;
}

interface EditProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: WeeklyProduction | null;
  onSave: () => void;
}

export function EditProductionDialog({ open, onOpenChange, production, onSave }: EditProductionDialogProps) {
  const { currentProject, updateScopeProgress } = useConstruction();
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const houses = currentProject?.houses || [];

  useEffect(() => {
    if (production) {
      setWeekStart(production.week_start);
      setWeekEnd(production.week_end);
      setNotes(production.notes || "");
      setSelectedHouses(production.house_ids || []);
    }
  }, [production]);

  // Toggle house selection
  const toggleHouse = (houseId: number) => {
    setSelectedHouses(prev => 
      prev.includes(houseId) 
        ? prev.filter(id => id !== houseId)
        : [...prev, houseId].sort((a, b) => a - b)
    );
  };

  // Get houses that were removed
  const getRemovedHouses = () => {
    if (!production) return [];
    return production.house_ids.filter(id => !selectedHouses.includes(id));
  };

  // Get houses that were added
  const getAddedHouses = () => {
    if (!production) return [];
    return selectedHouses.filter(id => !production.house_ids.includes(id));
  };

  const handleSave = async () => {
    if (!production || !currentProject) return;
    
    if (!weekStart || !weekEnd) {
      toast.error("Preencha as datas do período");
      return;
    }

    if (new Date(weekEnd) < new Date(weekStart)) {
      toast.error("A data final deve ser maior que a inicial");
      return;
    }

    if (selectedHouses.length === 0) {
      toast.error("Selecione pelo menos uma casa");
      return;
    }

    setIsSaving(true);
    try {
      // Update production record
      const { error } = await supabase
        .from('weekly_productions')
        .update({
          week_start: weekStart,
          week_end: weekEnd,
          house_ids: selectedHouses,
          houses_count: selectedHouses.length,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', production.id);

      if (error) throw error;

      // Update map: Remove progress from removed houses
      const removedHouses = getRemovedHouses();
      for (const houseId of removedHouses) {
        await updateScopeProgress(houseId, production.macro_id, production.scope_id, 0);
      }

      // Update map: Add progress to added houses
      const addedHouses = getAddedHouses();
      for (const houseId of addedHouses) {
        await updateScopeProgress(houseId, production.macro_id, production.scope_id, 100);
      }

      toast.success("Registro atualizado com sucesso");
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating production:', error);
      toast.error("Erro ao atualizar registro");
    }
    setIsSaving(false);
  };

  const handleDelete = async () => {
    if (!production || !currentProject) return;

    try {
      // Delete production record
      const { error } = await supabase
        .from('weekly_productions')
        .delete()
        .eq('id', production.id);

      if (error) throw error;

      // Revert progress: Set all houses back to 0%
      for (const houseId of production.house_ids) {
        await updateScopeProgress(houseId, production.macro_id, production.scope_id, 0);
      }

      toast.success("Registro excluído e mapa atualizado");
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting production:', error);
      toast.error("Erro ao excluir registro");
    }
    setShowDeleteConfirm(false);
  };

  if (!production) return null;

  const periodDays = weekStart && weekEnd 
    ? differenceInDays(parseISO(weekEnd), parseISO(weekStart)) + 1 
    : 0;

  const removedCount = getRemovedHouses().length;
  const addedCount = getAddedHouses().length;
  const hasChanges = removedCount > 0 || addedCount > 0 || 
    weekStart !== production.week_start || 
    weekEnd !== production.week_end || 
    notes !== (production.notes || "");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Editar Registro de Produção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1">
            {/* Production Info */}
            <div className="p-3 bg-secondary/30 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: production.macro_color }}
                />
                <span className="font-medium text-sm">{production.macro_name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{production.scope_name}</p>
            </div>

            {/* Period */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Período de Medição
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Início</Label>
                  <Input 
                    type="date" 
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data Fim</Label>
                  <Input 
                    type="date" 
                    value={weekEnd}
                    onChange={(e) => setWeekEnd(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              {periodDays > 0 && (
                <p className="text-xs text-muted-foreground">
                  Período: {periodDays} dia{periodDays > 1 ? 's' : ''} • 
                  Média: {(selectedHouses.length / periodDays).toFixed(2)} casas/dia
                </p>
              )}
            </div>

            {/* Houses Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Home className="w-4 h-4" />
                Casas Incluídas
                <Badge variant="secondary" className="ml-2">
                  {selectedHouses.length} selecionadas
                </Badge>
                {hasChanges && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    {addedCount > 0 && <span className="text-green-600">+{addedCount}</span>}
                    {addedCount > 0 && removedCount > 0 && " / "}
                    {removedCount > 0 && <span className="text-red-600">-{removedCount}</span>}
                  </Badge>
                )}
              </Label>
              
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-2">
                  {houses.map(house => {
                    const isSelected = selectedHouses.includes(house.id);
                    const wasOriginal = production.house_ids.includes(house.id);
                    const isAdded = isSelected && !wasOriginal;
                    const isRemoved = !isSelected && wasOriginal;
                    
                    return (
                      <button
                        key={house.id}
                        onClick={() => toggleHouse(house.id)}
                        className={`
                          relative w-9 h-9 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-all
                          ${isSelected 
                            ? isAdded
                              ? 'bg-green-100 border-green-500 text-green-700'
                              : 'bg-primary/10 border-primary text-primary'
                            : isRemoved
                              ? 'bg-red-100 border-red-500 text-red-700 line-through'
                              : 'bg-background border-border text-foreground hover:border-primary/50'
                          }
                        `}
                      >
                        {house.id}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              
              {(addedCount > 0 || removedCount > 0) && (
                <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">Alterações no mapa de obras:</p>
                  {addedCount > 0 && (
                    <p className="text-green-600">• {addedCount} casa(s) terão progresso definido para 100%</p>
                  )}
                  {removedCount > 0 && (
                    <p className="text-red-600">• {removedCount} casa(s) terão progresso revertido para 0%</p>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm">Observações</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre esta medição..."
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isSaving || selectedHouses.length === 0}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Tem certeza que deseja excluir este registro de produção?</p>
              <p><strong>{production.scope_name}</strong> - {production.houses_count} casas</p>
              <p className="text-destructive text-sm font-medium">
                ⚠️ O mapa de obras será atualizado: todas as {production.houses_count} casas terão o progresso do serviço "{production.scope_name}" revertido para 0%.
              </p>
              <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir e Reverter Mapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
