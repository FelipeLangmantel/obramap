import { useConstruction } from "@/contexts/ConstructionContext";
import { QuadraCard } from "./QuadraCard";

export function QuadrasGrid() {
  const { filterQuadra, quadras } = useConstruction();
  
  const filteredQuadras = filterQuadra === "all" 
    ? quadras 
    : quadras.filter(q => q.id === filterQuadra);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredQuadras.map(quadra => (
        <QuadraCard key={quadra.id} quadraId={quadra.id} />
      ))}
    </div>
  );
}
