import { useState } from "react";
import { Pencil, Trash2, MoreHorizontal, Calendar, MapPin, Building, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConstruction, Project } from "@/contexts/ConstructionContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface ProjectsListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROJECT_TYPES = [
  "Residencial Popular",
  "Residencial Médio Padrão",
  "Residencial Alto Padrão",
  "Comercial",
  "Industrial",
  "Misto",
];

export function ProjectsListDialog({ open, onOpenChange }: ProjectsListDialogProps) {
  const { projects, currentProject, setCurrentProject, updateProject, deleteProject } = useConstruction();
  
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const handleStartEdit = (project: Project) => {
    setEditingProject({ ...project });
  };

  const handleSaveEdit = () => {
    if (!editingProject) return;
    
    updateProject(editingProject.id, {
      name: editingProject.name,
      location: editingProject.location,
      contractor: editingProject.contractor,
      startDate: editingProject.startDate,
      expectedEndDate: editingProject.expectedEndDate,
      totalHouses: editingProject.totalHouses,
      unitSize: editingProject.unitSize,
      projectType: editingProject.projectType,
    });
    
    toast.success("Obra atualizada com sucesso!");
    setEditingProject(null);
  };

  const handleDeleteClick = (projectId: string) => {
    setProjectToDelete(projectId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete);
      setProjectToDelete(null);
    }
    setDeleteConfirmOpen(false);
  };

  const handleSelectProject = (projectId: string) => {
    setCurrentProject(projectId);
    onOpenChange(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastro de Obras</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma obra cadastrada ainda.
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    currentProject?.id === project.id 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:bg-secondary/30"
                  }`}
                >
                  {editingProject?.id === project.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome da Obra</Label>
                          <Input
                            value={editingProject.name}
                            onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Localização</Label>
                          <Input
                            value={editingProject.location}
                            onChange={(e) => setEditingProject({ ...editingProject, location: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Construtora</Label>
                          <Input
                            value={editingProject.contractor}
                            onChange={(e) => setEditingProject({ ...editingProject, contractor: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tipo de Projeto</Label>
                          <Select
                            value={editingProject.projectType}
                            onValueChange={(value) => setEditingProject({ ...editingProject, projectType: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Data de Início</Label>
                          <Input
                            type="date"
                            value={editingProject.startDate}
                            onChange={(e) => setEditingProject({ ...editingProject, startDate: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Previsão de Término</Label>
                          <Input
                            type="date"
                            value={editingProject.expectedEndDate}
                            onChange={(e) => setEditingProject({ ...editingProject, expectedEndDate: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Total de Unidades</Label>
                          <Input
                            type="number"
                            min={1}
                            value={editingProject.totalHouses}
                            onChange={(e) => setEditingProject({ ...editingProject, totalHouses: parseInt(e.target.value) || 1 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tamanho da Unidade (m²)</Label>
                          <Input
                            type="number"
                            min={1}
                            value={editingProject.unitSize}
                            onChange={(e) => setEditingProject({ ...editingProject, unitSize: parseFloat(e.target.value) || 45 })}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setEditingProject(null)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSaveEdit}>
                          Salvar Alterações
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => handleSelectProject(project.id)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-foreground">{project.name}</h3>
                          {currentProject?.id === project.id && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                              Ativa
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{project.location}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Building className="w-3.5 h-3.5" />
                            <span>{project.contractor}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(project.startDate)} - {formatDate(project.expectedEndDate)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <span>{project.totalHouses} unidades</span>
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleStartEdit(project)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteClick(project.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Obra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta obra? Esta ação não pode ser desfeita e todos os dados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
