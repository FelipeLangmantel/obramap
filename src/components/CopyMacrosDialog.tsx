import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConstruction } from "@/contexts/ConstructionContext";
import { toast } from "sonner";

interface CopyMacrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyMacrosDialog({ open, onOpenChange }: CopyMacrosDialogProps) {
  const { projects, currentProject, updateProject, resetProjectData } = useConstruction();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [isCopying, setIsCopying] = useState(false);

  // Filter out current project from the list
  const availableProjects = useMemo(() => {
    return projects.filter(p => p.id !== currentProject?.id && p.macrosTemplate.length > 0);
  }, [projects, currentProject?.id]);

  const selectedProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  const handleCopy = async () => {
    if (!selectedProject || !currentProject) return;

    setIsCopying(true);
    try {
      // Copy the macros template from the selected project
      await updateProject(currentProject.id, {
        macrosTemplate: selectedProject.macrosTemplate,
      });

      // Reset project data to apply new macros to houses
      await resetProjectData();

      toast.success(`Etapas e serviços copiados de "${selectedProject.name}" com sucesso!`);
      onOpenChange(false);
      setSelectedProjectId("");
    } catch (error) {
      console.error("Error copying macros:", error);
      toast.error("Erro ao copiar etapas e serviços");
    } finally {
      setIsCopying(false);
    }
  };

  if (!currentProject) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Copiar Etapas de Outra Obra
          </DialogTitle>
          <DialogDescription>
            Selecione uma obra para copiar suas etapas e serviços para "{currentProject.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {availableProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Não há outras obras com etapas cadastradas disponíveis para copiar.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Selecione a obra de origem:</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma obra..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project.macrosTemplate.length} etapas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProject && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Etapas que serão copiadas:</label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2 bg-secondary/30">
                    {selectedProject.macrosTemplate.map(macro => (
                      <div key={macro.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: macro.color }}
                          />
                          <span className="text-sm font-medium">{macro.name}</span>
                        </div>
                        {macro.scopes.length > 0 && (
                          <div className="ml-5 text-xs text-muted-foreground">
                            {macro.scopes.map(scope => (
                              <div key={scope.id} className="flex justify-between">
                                <span>• {scope.name}</span>
                                <span className="text-muted-foreground">Peso: {scope.weight}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentProject.macrosTemplate.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                  <p className="text-amber-800 dark:text-amber-200">
                    <strong>Atenção:</strong> As etapas atuais de "{currentProject.name}" serão substituídas e o progresso das casas será resetado.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCopy} 
            disabled={!selectedProjectId || isCopying}
          >
            {isCopying ? (
              <>Copiando...</>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copiar Etapas
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
