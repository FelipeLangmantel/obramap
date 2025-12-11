import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface SupplierTypesManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: string[];
  onTypesChange: (types: string[]) => void;
}

export function SupplierTypesManagement({
  open,
  onOpenChange,
  types,
  onTypesChange
}: SupplierTypesManagementProps) {
  const [newType, setNewType] = useState("");

  const handleAddType = () => {
    if (!newType.trim()) {
      toast.error("Digite um nome para o tipo");
      return;
    }
    if (types.includes(newType.trim())) {
      toast.error("Este tipo já existe");
      return;
    }
    onTypesChange([...types, newType.trim()]);
    setNewType("");
    toast.success("Tipo adicionado");
  };

  const handleRemoveType = (type: string) => {
    onTypesChange(types.filter(t => t !== type));
    toast.success("Tipo removido");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tipos de Fornecedores</DialogTitle>
          <DialogDescription>Gerencie os tipos disponíveis para classificar fornecedores</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="sr-only">Novo tipo</Label>
              <Input 
                placeholder="Ex: Assessoria, Serviços..."
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddType()}
              />
            </div>
            <Button onClick={handleAddType} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex flex-wrap gap-2 min-h-[100px] p-3 border rounded-lg bg-muted/50">
            {types.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado</p>
            ) : (
              types.map((type) => (
                <Badge 
                  key={type} 
                  variant="secondary" 
                  className="flex items-center gap-1 py-1 px-2 text-sm"
                >
                  {type}
                  <button
                    onClick={() => handleRemoveType(type)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
