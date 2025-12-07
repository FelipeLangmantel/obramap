import { useState } from "react";
import { Pencil, Trash2, MoreHorizontal, Calendar, MapPin, Building, Users, GripVertical } from "lucide-react";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

interface SortableProjectItemProps {
  project: Project;
  currentProjectId: string | undefined;
  editingProject: Project | null;
  setEditingProject: (project: Project | null) => void;
  onStartEdit: (project: Project) => void;
  onSaveEdit: () => void;
  onDeleteClick: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  formatDate: (dateStr: string) => string;
}

function SortableProjectItem({
  project,
  currentProjectId,
  editingProject,
  setEditingProject,
  onStartEdit,
  onSaveEdit,
  onDeleteClick,
  onSelectProject,
  formatDate,
}: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 rounded-lg border transition-colors ${
        currentProjectId === project.id 
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
            <Button onClick={onSaveEdit}>
              Salvar Alterações
            </Button>
          </div>
        </div>
      ) : (
        // View Mode
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <div 
              className="flex-1 cursor-pointer"
              onClick={() => onSelectProject(project.id)}
            >
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-foreground">{project.name}</h3>
                {currentProjectId === project.id && (
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
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onStartEdit(project)}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDeleteClick(project.id)}
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
  );
}

export function ProjectsListDialog({ open, onOpenChange }: ProjectsListDialogProps) {
  const { projects, currentProject, setCurrentProject, updateProject, deleteProject, reorderProjects } = useConstruction();
  
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = projects.findIndex((p) => p.id === active.id);
      const newIndex = projects.findIndex((p) => p.id === over.id);
      const newOrder = arrayMove(projects, oldIndex, newIndex);
      reorderProjects(newOrder.map(p => p.id));
      toast.success("Ordem das obras atualizada!");
    }
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
            <p className="text-sm text-muted-foreground">
              Arraste para reordenar. A primeira obra será selecionada automaticamente ao abrir o app.
            </p>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            {projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma obra cadastrada ainda.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={projects.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {projects.map((project) => (
                    <SortableProjectItem
                      key={project.id}
                      project={project}
                      currentProjectId={currentProject?.id}
                      editingProject={editingProject}
                      setEditingProject={setEditingProject}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onDeleteClick={handleDeleteClick}
                      onSelectProject={handleSelectProject}
                      formatDate={formatDate}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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