import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConstruction } from "@/contexts/ConstructionContext";
import { ArrowRight, Building2 } from "lucide-react";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROJECT_TYPES = [
  "Residencial Popular",
  "Residencial Médio Padrão",
  "Residencial Alto Padrão",
  "Comercial",
  "Misto",
  "Loteamento",
];

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const { addProject } = useConstruction();
  
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [contractor, setContractor] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");
  const [totalHouses, setTotalHouses] = useState("");
  const [unitSize, setUnitSize] = useState("");
  const [projectType, setProjectType] = useState("");

  const handleSubmit = () => {
    if (!name || !totalHouses) return;
    
    addProject({
      name,
      location,
      contractor,
      startDate,
      expectedEndDate,
      totalHouses: parseInt(totalHouses) || 0,
      unitSize: parseFloat(unitSize) || 45,
      projectType: projectType || "Residencial Popular",
    });
    
    // Reset form
    setName("");
    setLocation("");
    setContractor("");
    setStartDate("");
    setExpectedEndDate("");
    setTotalHouses("");
    setUnitSize("");
    setProjectType("");
    
    onOpenChange(false);
  };

  const isValid = name.trim() && totalHouses;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Cadastrar Nova Obra
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome do Empreendimento *</Label>
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Loteamento Primavera"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Localização</Label>
              <Input 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Cidade - UF"
              />
            </div>
            <div className="space-y-2">
              <Label>Construtora</Label>
              <Input 
                value={contractor}
                onChange={(e) => setContractor(e.target.value)}
                placeholder="Ex: Construtora ABC"
              />
            </div>
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
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Total de Casas *</Label>
              <Input 
                type="number"
                value={totalHouses}
                onChange={(e) => setTotalHouses(e.target.value)}
                placeholder="Ex: 100"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Tamanho da Unidade (m²)</Label>
              <Input 
                type="number"
                value={unitSize}
                onChange={(e) => setUnitSize(e.target.value)}
                placeholder="Ex: 45"
                min="1"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Tipo de Empreendimento</Label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-4 bg-secondary/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Após cadastrar, você poderá configurar as quadras e distribuir as casas no mapa visual.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid} className="gap-2">
            Criar Obra
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
