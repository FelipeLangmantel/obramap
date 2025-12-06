import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Scope } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";

interface EditScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: number;
  macroId: string;
  scope: Scope;
}

export function EditScopeDialog({ open, onOpenChange, houseId, macroId, scope }: EditScopeDialogProps) {
  const { updateScopeProgress } = useConstruction();
  const [progress, setProgress] = useState(scope.progress);

  const handleSave = () => {
    updateScopeProgress(houseId, macroId, scope.id, progress);
    onOpenChange(false);
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
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Data de Início</Label>
              <Input 
                value={scope.startDate || "—"} 
                disabled 
                className="bg-secondary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Data de Término</Label>
              <Input 
                value={scope.endDate || "—"} 
                disabled 
                className="bg-secondary"
              />
            </div>
          </div>
          
          <div className="p-3 bg-secondary rounded-lg">
            <Label className="text-muted-foreground text-xs">Peso no cálculo</Label>
            <p className="text-lg font-semibold text-foreground">{scope.weight}%</p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
