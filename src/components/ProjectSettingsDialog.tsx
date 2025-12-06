import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConstruction } from "@/contexts/ConstructionContext";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsDialog({ open, onOpenChange }: ProjectSettingsDialogProps) {
  const { projectInfo, updateProjectInfo } = useConstruction();
  
  const [name, setName] = useState(projectInfo.name);
  const [location, setLocation] = useState(projectInfo.location);
  const [contractor, setContractor] = useState(projectInfo.contractor);
  const [startDate, setStartDate] = useState(projectInfo.startDate);
  const [expectedEndDate, setExpectedEndDate] = useState(projectInfo.expectedEndDate);

  useEffect(() => {
    setName(projectInfo.name);
    setLocation(projectInfo.location);
    setContractor(projectInfo.contractor);
    setStartDate(projectInfo.startDate);
    setExpectedEndDate(projectInfo.expectedEndDate);
  }, [projectInfo, open]);

  const handleSave = () => {
    updateProjectInfo({ name, location, contractor, startDate, expectedEndDate });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastro da Obra</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome do Empreendimento</Label>
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Loteamento Tapejara"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Localização</Label>
            <Input 
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ex: Rua das Flores, 123"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Construtora Responsável</Label>
            <Input 
              value={contractor}
              onChange={(e) => setContractor(e.target.value)}
              placeholder="Ex: Construtora Alpha"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Previsão de Término</Label>
              <Input 
                type="date"
                value={expectedEndDate}
                onChange={(e) => setExpectedEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="p-4 bg-secondary rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total de Casas no Empreendimento</span>
              <span className="text-2xl font-bold text-foreground">123</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Para adicionar ou remover casas, gerencie as quadras no mapa.
            </p>
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
