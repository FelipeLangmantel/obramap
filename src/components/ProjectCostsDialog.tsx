import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, DollarSign, Package, Hammer, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConstruction } from "@/contexts/ConstructionContext";
import { toast } from "sonner";

interface CostItem {
  id: string;
  name: string;
  value: number;
  quantity: number;
  unit: string;
}

interface ProjectCostsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COSTS_STORAGE_KEY = "obramap_project_costs";

export function ProjectCostsDialog({ open, onOpenChange }: ProjectCostsDialogProps) {
  const { currentProject } = useConstruction();
  const [materialCosts, setMaterialCosts] = useState<CostItem[]>([]);
  const [laborCosts, setLaborCosts] = useState<CostItem[]>([]);
  const [editingItem, setEditingItem] = useState<{ type: "material" | "labor"; item: CostItem } | null>(null);
  const [newItem, setNewItem] = useState<{ type: "material" | "labor"; name: string; value: string; quantity: string; unit: string } | null>(null);

  // Load saved costs
  useEffect(() => {
    if (currentProject?.id) {
      const savedData = localStorage.getItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`);
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setMaterialCosts(parsed.materials || []);
        setLaborCosts(parsed.labor || []);
      } else {
        setMaterialCosts([]);
        setLaborCosts([]);
      }
    }
  }, [currentProject?.id]);

  // Save costs
  const saveCosts = (materials: CostItem[], labor: CostItem[]) => {
    if (currentProject?.id) {
      localStorage.setItem(`${COSTS_STORAGE_KEY}_${currentProject.id}`, JSON.stringify({
        materials,
        labor,
      }));
    }
  };

  const handleAddItem = () => {
    if (!newItem || !newItem.name.trim() || !newItem.value) return;

    const item: CostItem = {
      id: `${Date.now()}`,
      name: newItem.name.trim(),
      value: parseFloat(newItem.value) || 0,
      quantity: parseFloat(newItem.quantity) || 1,
      unit: newItem.unit || "un",
    };

    if (newItem.type === "material") {
      const updated = [...materialCosts, item];
      setMaterialCosts(updated);
      saveCosts(updated, laborCosts);
    } else {
      const updated = [...laborCosts, item];
      setLaborCosts(updated);
      saveCosts(materialCosts, updated);
    }

    setNewItem(null);
    toast.success("Item adicionado!");
  };

  const handleUpdateItem = () => {
    if (!editingItem) return;

    if (editingItem.type === "material") {
      const updated = materialCosts.map(c => c.id === editingItem.item.id ? editingItem.item : c);
      setMaterialCosts(updated);
      saveCosts(updated, laborCosts);
    } else {
      const updated = laborCosts.map(c => c.id === editingItem.item.id ? editingItem.item : c);
      setLaborCosts(updated);
      saveCosts(materialCosts, updated);
    }

    setEditingItem(null);
    toast.success("Item atualizado!");
  };

  const handleDeleteItem = (type: "material" | "labor", id: string) => {
    if (type === "material") {
      const updated = materialCosts.filter(c => c.id !== id);
      setMaterialCosts(updated);
      saveCosts(updated, laborCosts);
    } else {
      const updated = laborCosts.filter(c => c.id !== id);
      setLaborCosts(updated);
      saveCosts(materialCosts, updated);
    }
    toast.success("Item removido!");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const calculateTotal = (items: CostItem[]) => {
    return items.reduce((sum, item) => sum + (item.value * item.quantity), 0);
  };

  const totalMaterial = calculateTotal(materialCosts);
  const totalLabor = calculateTotal(laborCosts);
  const totalGeral = totalMaterial + totalLabor;

  if (!currentProject) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custos da Obra</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center text-muted-foreground">
            Selecione uma obra para gerenciar os custos.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const renderCostList = (type: "material" | "labor", items: CostItem[]) => (
    <div className="space-y-2">
      {items.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          Nenhum item cadastrado.
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            {editingItem?.item.id === item.id ? (
              <div className="flex gap-2 items-center flex-1">
                <Input
                  value={editingItem.item.name}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, name: e.target.value }
                  })}
                  className="h-8 flex-1"
                  placeholder="Nome"
                />
                <Input
                  type="number"
                  value={editingItem.item.value}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, value: parseFloat(e.target.value) || 0 }
                  })}
                  className="h-8 w-24"
                  placeholder="Valor"
                />
                <Input
                  type="number"
                  value={editingItem.item.quantity}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, quantity: parseFloat(e.target.value) || 1 }
                  })}
                  className="h-8 w-20"
                  placeholder="Qtd"
                />
                <Input
                  value={editingItem.item.unit}
                  onChange={(e) => setEditingItem({
                    ...editingItem,
                    item: { ...editingItem.item, unit: e.target.value }
                  })}
                  className="h-8 w-16"
                  placeholder="Un"
                />
                <Button size="sm" variant="ghost" onClick={handleUpdateItem}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>X</Button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.value)} x {item.quantity} {item.unit} = {formatCurrency(item.value * item.quantity)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingItem({ type, item: { ...item } })}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteItem(type, item.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))
      )}

      {/* Add new item */}
      {newItem?.type === type ? (
        <div className="flex gap-2 items-center p-3 bg-secondary/50 rounded-lg">
          <Input
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            className="h-8 flex-1"
            placeholder="Nome do item"
          />
          <Input
            type="number"
            value={newItem.value}
            onChange={(e) => setNewItem({ ...newItem, value: e.target.value })}
            className="h-8 w-24"
            placeholder="Valor R$"
          />
          <Input
            type="number"
            value={newItem.quantity}
            onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
            className="h-8 w-20"
            placeholder="Qtd"
          />
          <Input
            value={newItem.unit}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            className="h-8 w-16"
            placeholder="Un"
          />
          <Button size="sm" onClick={handleAddItem}>Adicionar</Button>
          <Button size="sm" variant="ghost" onClick={() => setNewItem(null)}>X</Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed"
          onClick={() => setNewItem({ type, name: "", value: "", quantity: "1", unit: "un" })}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Adicionar {type === "material" ? "Material" : "Mão de Obra"}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Custos da Obra - {currentProject.name}
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Material</span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(totalMaterial)}</p>
          </div>
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Hammer className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Mão de Obra</span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(totalLabor)}</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Total Geral</span>
            </div>
            <p className="text-lg font-bold">{formatCurrency(totalGeral)}</p>
          </div>
        </div>

        <Tabs defaultValue="material" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="material" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Material
            </TabsTrigger>
            <TabsTrigger value="labor" className="flex items-center gap-2">
              <Hammer className="w-4 h-4" />
              Mão de Obra
            </TabsTrigger>
          </TabsList>
          <TabsContent value="material" className="mt-4">
            {renderCostList("material", materialCosts)}
          </TabsContent>
          <TabsContent value="labor" className="mt-4">
            {renderCostList("labor", laborCosts)}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
