import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Scope } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";

interface EditScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: number;
  macroId: string;
  scope: Scope;
}

export function EditScopeDialog({ open, onOpenChange, houseId, macroId, scope }: EditScopeDialogProps) {
  const { updateScopeProgress, currentProject } = useConstruction();
  const [progress, setProgress] = useState(scope.progress);
  const [startDate, setStartDate] = useState(scope.startDate || "");
  const [endDate, setEndDate] = useState(scope.endDate || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setProgress(scope.progress);
    setStartDate(scope.startDate || "");
    setEndDate(scope.endDate || "");
  }, [scope, open]);

  // Check if dates are required (when changing progress to 100%)
  const needsDates = progress === 100 && (!startDate || !endDate);
  const isProgressChange = progress !== scope.progress;
  const isCompletingScope = progress === 100 && scope.progress !== 100;

  const handleSave = async () => {
    // Validate dates are required when completing a scope
    if (isCompletingScope && (!startDate || !endDate)) {
      toast.error("Preencha o período de execução para concluir o serviço");
      return;
    }

    if (!currentProject) return;

    setIsSaving(true);
    try {
      // Update the scope progress on the map
      await updateScopeProgress(houseId, macroId, scope.id, progress, startDate || null, endDate || null);

      // If completing a scope (100%), auto-create weekly production record
      if (isCompletingScope && startDate && endDate) {
        const macro = currentProject.macrosTemplate.find(m => m.id === macroId);
        
        if (macro) {
          // Check if a production record already exists for this scope and house
          const { data: existingProd } = await supabase
            .from('weekly_productions')
            .select('id, house_ids')
            .eq('project_id', currentProject.id)
            .eq('scope_id', scope.id)
            .gte('week_start', startDate)
            .lte('week_end', endDate)
            .maybeSingle();

          if (existingProd) {
            // Update existing record to include this house
            if (!existingProd.house_ids.includes(houseId)) {
              await supabase
                .from('weekly_productions')
                .update({
                  house_ids: [...existingProd.house_ids, houseId],
                  houses_count: existingProd.house_ids.length + 1,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingProd.id);
            }
          } else {
            // Create new production record
            const weekStart = format(startOfWeek(new Date(startDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
            const weekEnd = format(endOfWeek(new Date(endDate), { weekStartsOn: 1 }), "yyyy-MM-dd");

            await supabase
              .from('weekly_productions')
              .insert({
                project_id: currentProject.id,
                week_start: startDate,
                week_end: endDate,
                scope_id: scope.id,
                scope_name: scope.name,
                macro_id: macro.id,
                macro_name: macro.name,
                macro_color: macro.color,
                house_ids: [houseId],
                houses_count: 1,
                notes: `Lançamento automático via mapa - Casa ${houseId}`
              });
          }
          
          toast.success("Progresso atualizado e registrado na produção semanal!");
        }
      } else {
        toast.success("Progresso atualizado!");
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving scope progress:', error);
      toast.error("Erro ao salvar progresso");
    }
    setIsSaving(false);
  };

  const getProgressColor = () => {
    if (progress === 0) return "text-muted-foreground";
    if (progress < 30) return "text-progress-low";
    if (progress < 60) return "text-progress-medium";
    if (progress < 100) return "text-progress-high";
    return "text-progress-complete";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Progresso - {scope.name}</DialogTitle>
          <DialogDescription>Casa {houseId}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Progresso</Label>
              <span className={`text-2xl font-bold ${getProgressColor()}`}>
                {progress}%
              </span>
            </div>
            
            <Slider
              value={[progress]}
              onValueChange={(value) => setProgress(value[0])}
              max={100}
              step={5}
              className="w-full"
            />
            
            <div className="flex gap-2">
              {[0, 25, 50, 75, 100].map(val => (
                <Button
                  key={val}
                  variant={progress === val ? "default" : "outline"}
                  size="sm"
                  onClick={() => setProgress(val)}
                  className="flex-1"
                >
                  {val}%
                </Button>
              ))}
            </div>
          </div>
          
          {isCompletingScope && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                Para concluir este serviço (100%), é necessário informar o período de execução. 
                O registro será adicionado automaticamente à produção semanal.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Data de Início
                {isCompletingScope && <span className="text-destructive">*</span>}
              </Label>
              <Input 
                type="date"
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className={isCompletingScope && !startDate ? "border-destructive" : ""}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Data de Término
                {isCompletingScope && <span className="text-destructive">*</span>}
              </Label>
              <Input 
                type="date"
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className={isCompletingScope && !endDate ? "border-destructive" : ""}
              />
            </div>
          </div>
          
          <div className="p-3 bg-secondary rounded-lg">
            <Label className="text-muted-foreground text-xs">Peso no cálculo</Label>
            <p className="text-lg font-semibold text-foreground">{scope.weight}%</p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || (isCompletingScope && (!startDate || !endDate))}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
