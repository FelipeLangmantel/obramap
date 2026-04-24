import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Trash2, CalendarDays, AlertCircle, Home, Eye, Percent, Settings2 } from "lucide-react";
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
  is_initial_database?: boolean;
  // Unidade customizada por serviço (fallback: unidade da obra)
  unit_label?: string | null;
  unit_symbol?: string | null;
  quantity?: number | null;
}

interface EditProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: WeeklyProduction | null;
  onSave: () => void;
}

export function EditProductionDialog({ open, onOpenChange, production, onSave }: EditProductionDialogProps) {
  const { currentProject, updateBatchScopeProgress, refreshHousesFromDB } = useConstruction();
  const { canEdit } = useAuth();
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedHouses, setSelectedHouses] = useState<number[]>([]);
  const [isInitialDatabase, setIsInitialDatabase] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [quantity, setQuantity] = useState<number | "">("");

  // Percentage editing
  const [editPercentageMode, setEditPercentageMode] = useState(false);
  const [housePercentages, setHousePercentages] = useState<Record<number, number>>({});

  const houses = currentProject?.houses || [];

  // Resolve unidade efetiva: serviço → obra → fallback "un"
  const effectiveUnit = {
    label:
      production?.unit_label ||
      (currentProject as any)?.default_unit_label ||
      "Casa",
    symbol:
      production?.unit_symbol ||
      (currentProject as any)?.default_unit_symbol ||
      "un",
  };
  // Quando a unidade for "Casa/un", quantidade = nº de casas selecionadas (compat)
  const isHouseUnit =
    (effectiveUnit.symbol || "").toLowerCase() === "un" &&
    /casa|unidade/i.test(effectiveUnit.label || "");

  // Get current progress for each house in this scope
  const getHouseProgress = (houseId: number): number => {
    if (!production) return 0;
    const house = houses.find(h => h.id === houseId);
    if (!house) return 0;
    
    const houseMacros = (house.macros as any[]) || [];
    const macro = houseMacros.find(m => m.id === production.macro_id);
    const scope = macro?.scopes?.find((s: any) => s.id === production.scope_id);
    return scope?.progress || 0;
  };

  useEffect(() => {
    if (production) {
      setWeekStart(production.week_start);
      setWeekEnd(production.week_end);
      setNotes(production.notes || "");
      setSelectedHouses(production.house_ids || []);
      setIsInitialDatabase(production.is_initial_database || false);
      setEditPercentageMode(false);
      setQuantity(
        production.quantity !== null && production.quantity !== undefined
          ? Number(production.quantity)
          : ""
      );

      // Initialize percentages from current house data
      const percentages: Record<number, number> = {};
      production.house_ids.forEach(houseId => {
        const house = houses.find(h => h.id === houseId);
        if (house) {
          const houseMacros = (house.macros as any[]) || [];
          const macro = houseMacros.find(m => m.id === production.macro_id);
          const scope = macro?.scopes?.find((s: any) => s.id === production.scope_id);
          percentages[houseId] = scope?.progress || 0;
        }
      });
      setHousePercentages(percentages);
    }
  }, [production, houses]);

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

  // Get houses with changed percentages
  const getChangedPercentages = () => {
    if (!production || !editPercentageMode) return {};
    const changed: Record<number, number> = {};
    selectedHouses.forEach(houseId => {
      const currentProgress = getHouseProgress(houseId);
      const newPercentage = housePercentages[houseId];
      if (newPercentage !== undefined && newPercentage !== currentProgress) {
        changed[houseId] = newPercentage;
      }
    });
    return changed;
  };

  const handleSave = async () => {
    if (!production || !currentProject) return;
    
    // Only validate dates if NOT initial database
    if (!isInitialDatabase) {
      if (!weekStart || !weekEnd) {
        toast.error("Preencha as datas do período");
        return;
      }

      if (new Date(weekEnd) < new Date(weekStart)) {
        toast.error("A data final deve ser maior que a inicial");
        return;
      }
    }

    if (selectedHouses.length === 0) {
      toast.error("Selecione pelo menos uma casa");
      return;
    }

    setIsSaving(true);
    try {
      // Quantidade efetiva: número de casas (modo casa) ou input livre
      const effectiveQuantity = isHouseUnit
        ? selectedHouses.length
        : typeof quantity === "number"
        ? quantity
        : 0;

      // Update production record
      const { error } = await supabase
        .from('weekly_productions')
        .update({
          week_start: weekStart,
          week_end: weekEnd,
          house_ids: selectedHouses,
          houses_count: selectedHouses.length,
          notes: notes || null,
          is_initial_database: isInitialDatabase,
          quantity: effectiveQuantity,
          unit_label: effectiveUnit.label,
          unit_symbol: effectiveUnit.symbol,
          updated_at: new Date().toISOString()
        })
        .eq('id', production.id);

      if (error) throw error;

      // Update map: Remove progress from removed houses (correct revert logic)
      const removedHouses = getRemovedHouses();
      if (removedHouses.length > 0) {
        const { data: outros } = await supabase
          .from('weekly_productions')
          .select('house_ids')
          .eq('project_id', currentProject.id)
          .eq('scope_id', production.scope_id)
          .neq('id', production.id)
          .is('deleted_at', null);

        const revertMap: Record<number, number> = {};
        for (const hId of removedHouses) {
          const currentProg = getHouseProgress(hId);
          const outrasCobrindo = (outros || []).filter(r =>
            (r.house_ids as number[]).includes(hId)
          ).length;
          // Se há outros registros cobrindo a casa, mantém o progresso. Se era único, zera.
          revertMap[hId] = outrasCobrindo > 0 ? currentProg : 0;
        }
        await updateBatchScopeProgress(removedHouses, production.macro_id, production.scope_id, 0, revertMap);

        // Sync productions table — remove houses or soft delete records
        const { data: prodsVinculadas } = await supabase
          .from('productions')
          .select('id, house_ids')
          .eq('project_id', currentProject.id)
          .eq('scope_id', production.scope_id)
          .eq('macro_id', production.macro_id)
          .is('deleted_at', null);
        for (const prod of prodsVinculadas || []) {
          const novasCasas = (prod.house_ids as number[]).filter(h => !removedHouses.includes(h));
          if (novasCasas.length === 0) {
            await supabase.from('productions')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', prod.id);
          } else if (novasCasas.length !== (prod.house_ids as number[]).length) {
            await supabase.from('productions').update({ house_ids: novasCasas, houses_count: novasCasas.length }).eq('id', prod.id);
          }
        }
      }

      // Update map: Add progress to added houses (batch)
      const addedHouses = getAddedHouses();
      if (addedHouses.length > 0) {
        await updateBatchScopeProgress(addedHouses, production.macro_id, production.scope_id, 100);
      }

      // Update individual percentages if in edit mode
      if (editPercentageMode) {
        const changedPercentages = getChangedPercentages();
        const changedHouseIds = Object.keys(changedPercentages).map(Number);
        if (changedHouseIds.length > 0) {
          await updateBatchScopeProgress(
            changedHouseIds, 
            production.macro_id, 
            production.scope_id, 
            100, // fallback 
            changedPercentages
          );
        }
      }

      // Force refresh houses from database to ensure UI is synced
      await refreshHousesFromDB();

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
      // Revert progress: check if other records still cover each house
      if (production.house_ids.length > 0) {
        const { data: outros } = await supabase
          .from('weekly_productions')
          .select('house_ids')
          .eq('project_id', currentProject.id)
          .eq('scope_id', production.scope_id)
          .neq('id', production.id)
          .is('deleted_at', null);

        const revertMap: Record<number, number> = {};
        for (const hId of production.house_ids) {
          const currentProg = getHouseProgress(hId);
          const outrasCobrindo = (outros || []).filter(r =>
            (r.house_ids as number[]).includes(hId)
          ).length;
          // Se há outros registros cobrindo a casa, mantém o progresso. Se era único, zera.
          revertMap[hId] = outrasCobrindo > 0 ? currentProg : 0;
        }
        await updateBatchScopeProgress(production.house_ids, production.macro_id, production.scope_id, 0, revertMap);

        // Sync productions table — remove houses or soft delete records
        const { data: prodsVinculadas } = await supabase
          .from('productions')
          .select('id, house_ids')
          .eq('project_id', currentProject.id)
          .eq('scope_id', production.scope_id)
          .eq('macro_id', production.macro_id)
          .is('deleted_at', null);
        for (const prod of prodsVinculadas || []) {
          const novasCasas = (prod.house_ids as number[]).filter(h => !production.house_ids.includes(h));
          if (novasCasas.length === 0) {
            await supabase.from('productions')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', prod.id);
          } else if (novasCasas.length !== (prod.house_ids as number[]).length) {
            await supabase.from('productions').update({ house_ids: novasCasas, houses_count: novasCasas.length }).eq('id', prod.id);
          }
        }
      }

      // Soft delete production record (preserves audit trail)
      const { error } = await supabase
        .from('weekly_productions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', production.id);

      if (error) throw error;

      // Force refresh houses from database to ensure UI is synced
      await refreshHousesFromDB();

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
  const changedPercentages = getChangedPercentages();
  const percentageChangedCount = Object.keys(changedPercentages).length;
  const hasChanges = removedCount > 0 || addedCount > 0 || percentageChangedCount > 0 ||
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
                <span className="font-medium text-sm uppercase">{production.macro_name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{production.scope_name}</p>
            </div>

            {/* Initial Database Toggle */}
            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
              <Checkbox
                id="edit-initial-database"
                checked={isInitialDatabase}
                onCheckedChange={(checked) => setIsInitialDatabase(checked as boolean)}
              />
              <Label 
                htmlFor="edit-initial-database" 
                className="text-sm cursor-pointer"
              >
                Banco de Atividades Iniciais
              </Label>
              {isInitialDatabase && (
                <Badge variant="outline" className="ml-auto text-xs text-amber-600">
                  Não afeta análises
                </Badge>
              )}
            </div>

            {/* Period - Only show when NOT initial database */}
            {!isInitialDatabase && (
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
            )}

            {/* Quantity (apenas quando unidade não é Casa/un) */}
            {!isHouseUnit && (
              <div className="space-y-2 p-3 rounded-lg border bg-primary/5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Quantidade Produzida
                  <Badge variant="outline" className="text-xs">
                    {effectiveUnit.label} ({effectiveUnit.symbol})
                  </Badge>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={quantity}
                  placeholder={`Ex: 120 ${effectiveUnit.symbol}`}
                  onChange={(e) =>
                    setQuantity(e.target.value === "" ? "" : parseFloat(e.target.value))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  As casas selecionadas abaixo continuam sendo registradas para fins
                  de mapa e auditoria, mas o avanço financeiro/físico considera a
                  quantidade em {effectiveUnit.symbol}.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Casas Incluídas
                  <Badge variant="secondary" className="ml-2">
                    {selectedHouses.length} selecionadas
                  </Badge>
                </Label>
                {hasChanges && (
                  <Badge variant="outline" className="text-xs">
                    {addedCount > 0 && <span className="text-green-600">+{addedCount}</span>}
                    {addedCount > 0 && removedCount > 0 && " / "}
                    {removedCount > 0 && <span className="text-red-600">-{removedCount}</span>}
                  </Badge>
                )}
              </div>
              
              {/* Edit Percentage Mode Toggle */}
              <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm">Editar % de cada casa</Label>
                </div>
                <Switch
                  checked={editPercentageMode}
                  onCheckedChange={setEditPercentageMode}
                />
              </div>
              
              <ScrollArea className="h-[200px] border rounded-lg p-2">
                <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-2">
                  {houses.map(house => {
                    const isSelected = selectedHouses.includes(house.id);
                    const wasOriginal = production.house_ids.includes(house.id);
                    const isAdded = isSelected && !wasOriginal;
                    const isRemoved = !isSelected && wasOriginal;
                    const currentProgress = getHouseProgress(house.id);
                    const editedPercentage = housePercentages[house.id];
                    const hasPercentageChange = editPercentageMode && isSelected && editedPercentage !== undefined && editedPercentage !== currentProgress;
                    
                    return (
                      <button
                        key={house.id}
                        onClick={() => toggleHouse(house.id)}
                        className={`
                          relative w-9 h-9 rounded-lg border-2 flex flex-col items-center justify-center text-xs font-medium transition-all
                          ${isSelected 
                            ? isAdded
                              ? 'bg-green-100 border-green-500 text-green-700'
                              : hasPercentageChange
                                ? 'bg-amber-100 border-amber-500 text-amber-700'
                                : 'bg-primary/10 border-primary text-primary'
                            : isRemoved
                              ? 'bg-red-100 border-red-500 text-red-700 line-through'
                              : 'bg-background border-border text-foreground hover:border-primary/50'
                          }
                        `}
                        title={isSelected ? `Casa ${house.id}: ${editedPercentage ?? currentProgress}%` : `Casa ${house.id} — ${currentProgress}%`}
                      >
                        <span className="text-[10px]">{house.id}</span>
                        {isSelected && editPercentageMode && (
                          <span className="text-[7px] leading-none">{editedPercentage ?? currentProgress}%</span>
                        )}
                        {!isSelected && !editPercentageMode && currentProgress > 0 && currentProgress < 100 && (
                          <span className="text-[7px] leading-none text-amber-600">{currentProgress}%</span>
                        )}
                        {!isSelected && !editPercentageMode && currentProgress >= 100 && (
                          <span className="text-[7px] leading-none text-emerald-600">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              
              {/* Individual Percentage Editing */}
              {editPercentageMode && selectedHouses.length > 0 && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Settings2 className="w-3 h-3" />
                      Ajustar % Individual
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        const resetPercentages: Record<number, number> = {};
                        selectedHouses.forEach(id => {
                          resetPercentages[id] = 100;
                        });
                        setHousePercentages(resetPercentages);
                        toast.success("Todas as casas definidas como 100%");
                      }}
                    >
                      Todas 100%
                    </Button>
                  </div>
                  <ScrollArea className="h-[150px]">
                    <div className="space-y-2 pr-3">
                      {selectedHouses.map(houseId => {
                        // Use the percentage from state, fallback to stored value
                        const storedPercentage = housePercentages[houseId];
                        const editedValue = storedPercentage ?? 100;
                        
                        return (
                          <div key={houseId} className="flex items-center gap-3 text-sm">
                            <span className="w-16 font-medium">Casa {houseId}</span>
                            <Slider
                              value={[editedValue]}
                              onValueChange={(v) => {
                                setHousePercentages(prev => ({
                                  ...prev,
                                  [houseId]: v[0]
                                }));
                              }}
                              max={100}
                              min={0}
                              step={5}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={editedValue}
                              onChange={(e) => {
                                const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                setHousePercentages(prev => ({
                                  ...prev,
                                  [houseId]: val
                                }));
                              }}
                              className="w-16 h-7 text-xs text-center"
                              min={0}
                              max={100}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {(addedCount > 0 || removedCount > 0 || percentageChangedCount > 0) && (
                <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-1">Alterações no mapa de obras:</p>
                  {addedCount > 0 && (
                    <p className="text-green-600">• {addedCount} casa(s) terão progresso definido para 100%</p>
                  )}
                  {removedCount > 0 && (
                    <p className="text-red-600">• {removedCount} casa(s) terão progresso revertido para 0%</p>
                  )}
                  {percentageChangedCount > 0 && (
                    <p className="text-amber-600">• {percentageChangedCount} casa(s) terão % atualizada</p>
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

            {/* Viewer Mode Notice */}
            {!canEdit && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <Eye className="w-4 h-4" />
                Modo visualização - você pode interagir mas não salvar alterações
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between gap-2 pt-2 border-t">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="gap-2"
                disabled={!canEdit}
                title={!canEdit ? "Você não tem permissão para excluir" : ""}
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
                  disabled={isSaving || selectedHouses.length === 0 || !canEdit}
                  className="gap-2"
                  title={!canEdit ? "Você pode simular, mas não tem permissão para salvar" : ""}
                >
                  <Save className="w-4 h-4" />
                  {!canEdit ? "Modo Visualização" : isSaving ? "Salvando..." : "Salvar Alterações"}
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
