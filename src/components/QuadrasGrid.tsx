import { QUADRAS } from "@/data/constructionData";
import { useConstruction } from "@/contexts/ConstructionContext";
import { QuadraCard } from "./QuadraCard";

export function QuadrasGrid() {
  const { filterQuadra } = useConstruction();
  
  const filteredQuadras = filterQuadra === "all" 
    ? QUADRAS 
    : QUADRAS.filter(q => q.id === filterQuadra);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {filteredQuadras.map(quadra => (
        <QuadraCard key={quadra.id} quadra={quadra} />
      ))}
    </div>
  );
}
