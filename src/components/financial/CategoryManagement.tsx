import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface CategoryManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onCategoriesChange: (categories: string[]) => void;
}

export function CategoryManagement({ 
  open, 
  onOpenChange, 
  categories, 
  onCategoriesChange 
}: CategoryManagementProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const handleAddCategory = () => {
    if (!newCategory.trim()) {
      toast.error("Digite o nome da categoria");
      return;
    }
    
    if (categories.includes(newCategory.trim().toUpperCase())) {
      toast.error("Esta categoria já existe");
      return;
    }
    
    onCategoriesChange([...categories, newCategory.trim().toUpperCase()]);
    setNewCategory("");
    toast.success("Categoria adicionada");
  };

  const handleEditCategory = (index: number) => {
    setEditingIndex(index);
    setEditValue(categories[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    
    if (!editValue.trim()) {
      toast.error("Digite o nome da categoria");
      return;
    }
    
    const updatedCategories = [...categories];
    updatedCategories[editingIndex] = editValue.trim().toUpperCase();
    onCategoriesChange(updatedCategories);
    setEditingIndex(null);
    setEditValue("");
    toast.success("Categoria atualizada");
  };

  const handleDeleteCategory = () => {
    if (deleteIndex === null) return;
    
    const updatedCategories = categories.filter((_, i) => i !== deleteIndex);
    onCategoriesChange(updatedCategories);
    setDeleteIndex(null);
    toast.success("Categoria removida");
  };

  const moveCategory = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= categories.length) return;
    
    const updated = [...categories];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    onCategoriesChange(updated);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
            <DialogDescription>
              Adicione, edite ou remova categorias do fluxo financeiro
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Add new category */}
            <div className="flex gap-2">
              <Input
                placeholder="Nova categoria..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <Button onClick={handleAddCategory} size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Categories list */}
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {categories.map((cat, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                        onClick={() => moveCategory(index, index - 1)}
                        disabled={index === 0}
                      >
                        <span className="text-[10px]">▲</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 opacity-50 hover:opacity-100"
                        onClick={() => moveCategory(index, index + 1)}
                        disabled={index === categories.length - 1}
                      >
                        <span className="text-[10px]">▼</span>
                      </Button>
                    </div>
                    
                    {editingIndex === index ? (
                      <div className="flex-1 flex gap-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') {
                              setEditingIndex(null);
                              setEditValue("");
                            }
                          }}
                          autoFocus
                          className="h-8"
                        />
                        <Button size="sm" onClick={handleSaveEdit}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingIndex(null);
                          setEditValue("");
                        }}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{cat}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditCategory(index)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteIndex(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={() => setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a categoria "{deleteIndex !== null ? categories[deleteIndex] : ''}"? 
              Os lançamentos existentes desta categoria permanecerão, mas não poderão ser filtrados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
