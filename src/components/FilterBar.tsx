import { Grid3X3 } from "lucide-react";
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
    <div className="flex items-center gap-2 flex-nowrap">
      {/* Quadra filter */}
      <Select value={filterQuadra} onValueChange={setFilterQuadra}>
        <SelectTrigger className="w-auto min-w-[90px] max-w-[130px] bg-card h-8 text-xs px-2.5">
          <Grid3X3 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
          <SelectValue placeholder="Quadras" />
        </SelectTrigger>
        <SelectContent className="z-50">
          <SelectItem value="all">Todas</SelectItem>
          {quadras.map(q => (
            <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {/* Filter mode tabs */}
      <Tabs value={filterMode} onValueChange={handleModeChange} className="w-auto">
        <TabsList className="h-8 p-0.5 gap-0">
          <TabsTrigger value="status" className="text-xs px-2.5 h-7">
            Status
          </TabsTrigger>
          <TabsTrigger value="macro" className="text-xs px-2.5 h-7">
            Etapas
          </TabsTrigger>
          <TabsTrigger value="scope" className="text-xs px-2.5 h-7">
            Serviços
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Dynamic filter based on mode */}
      {filterMode === "status" && (
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-auto min-w-[90px] max-w-[130px] bg-card h-8 text-xs px-2.5">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="all">Todos</SelectItem>
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
          <SelectTrigger className="w-auto min-w-[90px] max-w-[140px] bg-card h-8 text-xs px-2.5">
            <SelectValue placeholder="Etapas" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="all">Todas</SelectItem>
            {macros.map(macro => (
              <SelectItem key={macro.id} value={macro.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: macro.color }}
                  />
                  <span className="truncate text-xs">{macro.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {filterMode === "scope" && (
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="w-auto min-w-[90px] max-w-[150px] bg-card h-8 text-xs px-2.5">
            <SelectValue placeholder="Serviços" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="all">Todos</SelectItem>
            {allScopes.map(scope => (
              <SelectItem key={scope.id} value={scope.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: scope.color }}
                  />
                  <span className="truncate text-xs">{scope.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
