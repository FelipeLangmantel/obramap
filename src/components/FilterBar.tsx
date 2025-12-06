import { Grid3X3, Filter, Layers, Wrench } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useMemo } from "react";

export function FilterBar() {
  const { 
    currentProject, 
    filterQuadra, 
    setFilterQuadra, 
    filterStatus, 
    setFilterStatus,
    filterMode,
    setFilterMode,
    filterMacro,
    setFilterMacro,
    filterScope,
    setFilterScope
  } = useConstruction();

  if (!currentProject) return null;

  const quadras = currentProject.quadras;
  const macros = currentProject.macrosTemplate || [];
  
  // Get all scopes from all macros
  const allScopes = useMemo(() => {
    const scopes: { id: string; name: string; macroId: string; macroName: string; color: string }[] = [];
    macros.forEach(macro => {
      macro.scopes.forEach(scope => {
        scopes.push({
          id: scope.id,
          name: scope.name,
          macroId: macro.id,
          macroName: macro.name,
          color: macro.color
        });
      });
    });
    return scopes;
  }, [macros]);

  // Reset specific filters when changing mode
  const handleModeChange = (mode: string) => {
    setFilterMode(mode as "status" | "macro" | "scope");
    setFilterStatus("all");
    setFilterMacro("all");
    setFilterScope("all");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Quadra filter - always visible */}
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
      
      {/* Filter mode tabs */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Tabs value={filterMode} onValueChange={handleModeChange} className="w-auto">
          <TabsList className="h-9">
            <TabsTrigger value="status" className="text-xs px-3">
              Status
            </TabsTrigger>
            <TabsTrigger value="macro" className="text-xs px-3">
              <Layers className="w-3 h-3 mr-1" />
              Etapas
            </TabsTrigger>
            <TabsTrigger value="scope" className="text-xs px-3">
              <Wrench className="w-3 h-3 mr-1" />
              Serviços
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Dynamic filter based on mode */}
      {filterMode === "status" && (
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
      )}

      {filterMode === "macro" && (
        <Select value={filterMacro} onValueChange={setFilterMacro}>
          <SelectTrigger className="w-56 bg-card">
            <SelectValue placeholder="Todas Etapas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Etapas</SelectItem>
            {macros.map(macro => (
              <SelectItem key={macro.id} value={macro.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: macro.color }}
                  />
                  {macro.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {filterMode === "scope" && (
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="w-64 bg-card">
            <SelectValue placeholder="Todos Serviços" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Serviços</SelectItem>
            {allScopes.map(scope => (
              <SelectItem key={scope.id} value={scope.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: scope.color }}
                  />
                  <span className="text-xs text-muted-foreground">{scope.macroName}:</span>
                  {scope.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
