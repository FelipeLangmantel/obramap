import { useConstruction } from "@/contexts/ConstructionContext";
import { FileText, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContractHeaderProps {
  isEditing: boolean;
  onEdit: () => void;
  hasContract: boolean;
}

export function ContractHeader({ isEditing, onEdit, hasContract }: ContractHeaderProps) {
  const { currentProject } = useConstruction();

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-primary/10">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contrato da Obra</h1>
          <p className="text-sm text-muted-foreground">
            {currentProject?.name || "Selecione um projeto"} — Base de Orçamento
          </p>
        </div>
      </div>

      {hasContract && !isEditing && (
        <Button onClick={onEdit} variant="outline" className="gap-2">
          <Edit className="h-4 w-4" />
          Editar Contrato
        </Button>
      )}
    </div>
  );
}
