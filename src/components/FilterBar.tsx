import { Grid3X3, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConstruction } from "@/contexts/ConstructionContext";

export function FilterBar() {
  const { currentProject, filterQuadra, setFilterQuadra, filterStatus, setFilterStatus } = useConstruction();

  if (!currentProject) return null;

  const quadras = currentProject.quadras;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Grid3X3 className="w-4 h-4 text-muted-foreground" />
        <Select value={filterQuadra} onValueChange={setFilterQuadra}>
          <SelectTrigger className="w-40 bg-card">
            <SelectValue placeholder="Todas Quadras" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Quadras</SelectItem>
            {quadras.map(q => (
              <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-card">
            <SelectValue placeholder="Todos Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="not-started">Não Iniciado</SelectItem>
            <SelectItem value="foundation">Fundação</SelectItem>
            <SelectItem value="structure">Estrutura</SelectItem>
            <SelectItem value="finishing">Acabamento</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
