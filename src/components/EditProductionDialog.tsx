import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Trash2, CalendarDays, AlertCircle } from "lucide-react";
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
  const [weekStart, setWeekStart] = useState("");
  const [weekEnd, setWeekEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (production) {
      setWeekStart(production.week_start);
      setWeekEnd(production.week_end);
      setNotes(production.notes || "");
    }
  }, [production]);

  const handleSave = async () => {
    if (!production) return;
    
    if (!weekStart || !weekEnd) {
      toast.error("Preencha as datas do período");
      return;
    }

    if (new Date(weekEnd) < new Date(weekStart)) {
      toast.error("A data final deve ser maior que a inicial");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('weekly_productions')
        .update({
          week_start: weekStart,
          week_end: weekEnd,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', production.id);

      if (error) throw error;

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
    if (!production) return;

    try {
      const { error } = await supabase
        .from('weekly_productions')
        .delete()
        .eq('id', production.id);

      if (error) throw error;

      toast.success("Registro excluído com sucesso");
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Editar Registro de Produção
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
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
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {production.houses_count} casas
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Casas: {production.house_ids.slice(0, 6).join(", ")}
                  {production.house_ids.length > 6 && ` +${production.house_ids.length - 6}`}
                </span>
              </div>
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
                  Média: {(production.houses_count / periodDays).toFixed(2)} casas/dia
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-sm">Observações</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas sobre esta medição..."
                rows={3}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between gap-2 pt-2">
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
                  disabled={isSaving}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Salvando..." : "Salvar"}
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
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro de produção?
              <br />
              <strong>{production.scope_name}</strong> - {production.houses_count} casas
              <br />
              <span className="text-xs">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
