import { useConstruction } from "@/contexts/ConstructionContext";
import { QuadraCard } from "./QuadraCard";
import { forwardRef } from "react";

export const QuadrasGrid = forwardRef<HTMLDivElement>(function QuadrasGrid(_, ref) {
  const { currentProject, filterQuadra } = useConstruction();
  
  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma obra para visualizar o mapa
      </div>
    );
  }

  const quadras = currentProject.quadras;
  
  if (quadras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <p>Nenhuma quadra cadastrada.</p>
        <p className="text-sm">Configure as quadras nas configurações da obra.</p>
      </div>
    );
  }
  
  const filteredQuadras = filterQuadra === "all" 
    ? quadras 
    : quadras.filter(q => q.id === filterQuadra);

  return (
    <div ref={ref} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredQuadras.map(quadra => (
        <QuadraCard key={quadra.id} quadraId={quadra.id} />
      ))}
    </div>
  );
});
