import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { House } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";

interface EditHouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  house: House;
}

const CONSTRUCTORS = [
  "Construtora Alpha",
  "Engenharia Beta",
  "Construções Delta",
  "Edificações Gama",
];

export function EditHouseDialog({ open, onOpenChange, house }: EditHouseDialogProps) {
  const { updateHouseInfo } = useConstruction();
  const [area, setArea] = useState(house.area.toString());
  const [constructorName, setConstructorName] = useState(house.constructorName);
  const [type, setType] = useState(house.type);
  const [expectedDate, setExpectedDate] = useState(house.expectedDate);

  const handleSave = () => {
    updateHouseInfo(house.id, {
      area: parseInt(area) || house.area,
      constructorName,
      type,
      expectedDate,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Casa {house.id}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Área (m²)</Label>
            <Input 
              type="number"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Residencial">Residencial</SelectItem>
                <SelectItem value="Comercial">Comercial</SelectItem>
                <SelectItem value="Misto">Misto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Construtora</Label>
            <Select value={constructorName} onValueChange={setConstructorName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSTRUCTORS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Previsão de Entrega</Label>
            <Input 
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              placeholder="DD/MM/AAAA"
            />
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
