import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { House } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";
import { Tag, Home, User, Calendar, Info } from "lucide-react";

interface EditHouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  house: House;
}

export function EditHouseDialog({ open, onOpenChange, house }: EditHouseDialogProps) {
  const { currentProject } = useConstruction();

  // Data comes directly from project registration - read only
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes Casa {house.id}</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <Info className="w-3 h-3" />
            Dados herdados do cadastro da obra
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Tag className="w-4 h-4" />
                <Label className="text-xs">Área</Label>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {currentProject?.unitSize || house.area} m²
              </p>
            </div>
            
            <div className="p-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Home className="w-4 h-4" />
                <Label className="text-xs">Tipo</Label>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {currentProject?.projectType || house.type}
              </p>
            </div>
            
            <div className="p-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <User className="w-4 h-4" />
                <Label className="text-xs">Construtora</Label>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {currentProject?.contractor || house.constructorName}
              </p>
            </div>
            
            <div className="p-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <Label className="text-xs">Previsão</Label>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {currentProject?.expectedEndDate || house.expectedDate}
              </p>
            </div>
          </div>
          
          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            Para alterar estes dados, edite as informações do empreendimento em "Cadastro da Obra".
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
