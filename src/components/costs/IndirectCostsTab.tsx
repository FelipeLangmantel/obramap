import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Building2, Settings2, X, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useConstruction } from "@/contexts/ConstructionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface IndirectCostItem {
  id: string;
  name: string;
  subcategory: string;
  value: number;
  quantity: number;
  unit: string;
}

const DEFAULT_CATEGORIES = [
  "Água",
  "Luz / Energia",
  "Telefone / Internet",
  "Impostos sobre NF",
  "Rateio Administrativo",
  "Engenheiro",
  "Mestre de Obras",
  "Locação de Veículo",
  "Locação de Alojamento",
  "Alimentação",
  "EPI / Segurança",
  "Licenças e Alvarás",
  "Seguros",
  "Outras Despesas",
];

const CATEGORIES_STORAGE_KEY = "obramap_indirect_categories";

export function IndirectCostsTab() {
  const { currentProject } = useConstruction();
  const { profile } = useAuth();
  const [items, setItems] = useState<IndirectCostItem[]>([]);
  const [editingItem, setEditingItem] = useState<IndirectCostItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newItemDraft, setNewItemDraft] = useState({ name: "", value: "", quantity: "1", unit: "mês" });

  // Category management
  const [categories, setCategories] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
    return DEFAULT_CATEGORIES;
  });
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ old: string; new: string } | null>(null);

  const saveCategories = (cats: string[]) => {
    setCategories(cats);
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(cats));
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name || categories.includes(name)) return;
    saveCategories([...categories, name]);
    setNewCategoryName("");
    toast.success("Categoria adicionada!");
  };

  const handleRenameCategory = async () => {
    if (!editingCategory || !editingCategory.new.trim()) return;
    const oldName = editingCategory.old;
    const newName = editingCategory.new.trim();
    if (oldName === newName) { setEditingCategory(null); return; }

    // Update all items with old category name
    const itemsToUpdate = items.filter(i => i.subcategory === oldName);
    if (itemsToUpdate.length > 0) {
      const { error } = await supabase
        .from("indirect_costs")
        .update({ subcategory: newName, updated_at: new Date().toISOString() })
        .eq("project_id", currentProject!.id)
        .eq("subcategory", oldName);
      if (error) { toast.error("Erro ao renomear categoria"); return; }
    }

    const updated = categories.map(c => c === oldName ? newName : c);
    saveCategories(updated);
    setEditingCategory(null);
    toast.success("Categoria renomeada!");
  };

  const handleDeleteCategory = async (cat: string) => {
    const hasItems = items.some(i => i.subcategory === cat);
    if (hasItems) {
      toast.error("Remova todos os itens desta categoria antes de excluí-la.");
      return;
    }
    saveCategories(categories.filter(c => c !== cat));
    toast.success("Categoria removida!");
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const loadItems = useCallback(async () => {
    if (!currentProject?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("indirect_costs")
        .select("*")
        .eq("project_id", currentProject.id)
        .order("subcategory", { ascending: true });

      if (error) throw error;
      setItems(
        (data || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          subcategory: d.subcategory,
          value: Number(d.value),
          quantity: Number(d.quantity),
          unit: d.unit,
        }))
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar custos indiretos");
    } finally {
      setIsLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (!currentProject?.id) return;
    const channel = supabase
      .channel("indirect-costs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "indirect_costs", filter: `project_id=eq.${currentProject.id}` }, () => loadItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id, loadItems]);

  const handleAddItem = async (subcategory: string) => {
    if (!newItemDraft.name.trim() || !newItemDraft.value) return;
    if (!currentProject?.id || !profile?.company_id) return;

    try {
      const { error } = await supabase.from("indirect_costs").insert({
        project_id: currentProject.id,
        company_id: profile.company_id,
        name: newItemDraft.name.trim(),
        subcategory,
        value: parseFloat(newItemDraft.value) || 0,
        quantity: parseFloat(newItemDraft.quantity) || 1,
        unit: newItemDraft.unit || "mês",
      });
      if (error) throw error;
      setNewItemDraft({ name: "", value: "", quantity: "1", unit: "mês" });
      // Keep the add form open for rapid entry
      toast.success("Item adicionado!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao adicionar item");
    }
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    try {
      const { error } = await supabase
        .from("indirect_costs")
        .update({
          name: editingItem.name,
          subcategory: editingItem.subcategory,
          value: editingItem.value,
          quantity: editingItem.quantity,
          unit: editingItem.unit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingItem.id);
      if (error) throw error;
      setEditingItem(null);
      toast.success("Item atualizado!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar item");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("indirect_costs").delete().eq("id", id);
      if (error) throw error;
      toast.success("Item removido!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover item");
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const totalIndirect = items.reduce((sum, i) => sum + i.value * i.quantity, 0);

  const grouped = items.reduce<Record<string, IndirectCostItem[]>>((acc, item) => {
    if (!acc[item.subcategory]) acc[item.subcategory] = [];
    acc[item.subcategory].push(item);
    return acc;
  }, {});

  // Merge: show all categories (even empty ones) + any used categories not in the list
  const allCategories = [...new Set([...categories, ...Object.keys(grouped)])];

  if (!currentProject) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Selecione uma obra para gerenciar custos indiretos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="border-2 border-amber-400/50 bg-gradient-to-br from-amber-50/50 to-amber-100/30 dark:from-amber-900/20 dark:to-amber-800/10">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-600" />
              <span className="font-semibold">Total Custos Indiretos</span>
            </div>
            <span className="text-2xl font-bold text-amber-800 dark:text-amber-300">
              {formatCurrency(totalIndirect)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "itens"} em{" "}
              {Object.keys(grouped).length} {Object.keys(grouped).length === 1 ? "categoria" : "categorias"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowCategoryManager(true)}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Categorias
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Categories List */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
          ) : (
            allCategories.map((cat) => {
              const catItems = grouped[cat] || [];
              const catTotal = catItems.reduce((s, i) => s + i.value * i.quantity, 0);
              const isExpanded = expandedCategories.has(cat);
              const isAdding = addingToCategory === cat;

              return (
                <Card key={cat} className="overflow-hidden">
                  <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(cat)}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <span className="text-sm font-semibold">{cat}</span>
                          {catItems.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {catItems.length} {catItems.length === 1 ? "item" : "itens"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {catTotal > 0 && (
                            <span className="text-sm font-medium text-muted-foreground">
                              {formatCurrency(catTotal)}
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isExpanded) toggleCategory(cat);
                              setAddingToCategory(isAdding ? null : cat);
                              setNewItemDraft({ name: "", value: "", quantity: "1", unit: "mês" });
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 pb-3 px-3 space-y-1.5">
                        {catItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            {editingItem?.id === item.id ? (
                              <div className="flex gap-2 items-center flex-1 flex-wrap">
                                <Select
                                  value={editingItem.subcategory}
                                  onValueChange={(v) => setEditingItem({ ...editingItem, subcategory: v })}
                                >
                                  <SelectTrigger className="h-8 w-40">
                                    <SelectValue placeholder="Categoria" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allCategories.map((s) => (
                                      <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={editingItem.name}
                                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                  className="h-8 flex-1 min-w-[100px]"
                                  placeholder="Nome"
                                />
                                <Input
                                  type="number"
                                  value={editingItem.value}
                                  onChange={(e) => setEditingItem({ ...editingItem, value: parseFloat(e.target.value) || 0 })}
                                  className="h-8 w-24"
                                  placeholder="Valor"
                                />
                                <Input
                                  type="number"
                                  value={editingItem.quantity}
                                  onChange={(e) => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || 1 })}
                                  className="h-8 w-20"
                                  placeholder="Qtd"
                                />
                                <Input
                                  value={editingItem.unit}
                                  onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                                  className="h-8 w-16"
                                  placeholder="Un"
                                />
                                <Button size="sm" variant="ghost" onClick={handleUpdate}>
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatCurrency(item.value)} × {item.quantity} {item.unit} ={" "}
                                    {formatCurrency(item.value * item.quantity)}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingItem({ ...item })}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(item.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}

                        {/* Inline add form */}
                        {isAdding && (
                          <div className="flex gap-2 items-center p-2 rounded-lg bg-primary/5 border border-dashed border-primary/30 flex-wrap">
                            <Input
                              autoFocus
                              value={newItemDraft.name}
                              onChange={(e) => setNewItemDraft({ ...newItemDraft, name: e.target.value })}
                              className="h-8 flex-1 min-w-[120px]"
                              placeholder="Descrição do custo"
                              onKeyDown={(e) => e.key === "Enter" && handleAddItem(cat)}
                            />
                            <Input
                              type="number"
                              value={newItemDraft.value}
                              onChange={(e) => setNewItemDraft({ ...newItemDraft, value: e.target.value })}
                              className="h-8 w-24"
                              placeholder="R$ Valor"
                              onKeyDown={(e) => e.key === "Enter" && handleAddItem(cat)}
                            />
                            <Input
                              type="number"
                              value={newItemDraft.quantity}
                              onChange={(e) => setNewItemDraft({ ...newItemDraft, quantity: e.target.value })}
                              className="h-8 w-16"
                              placeholder="Qtd"
                            />
                            <Input
                              value={newItemDraft.unit}
                              onChange={(e) => setNewItemDraft({ ...newItemDraft, unit: e.target.value })}
                              className="h-8 w-16"
                              placeholder="Un"
                            />
                            <Button size="sm" onClick={() => handleAddItem(cat)}>
                              <Plus className="w-3.5 h-3.5 mr-1" />
                              Salvar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAddingToCategory(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}

                        {catItems.length === 0 && !isAdding && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Nenhum item. Clique no <Plus className="w-3 h-3 inline" /> para adicionar.
                          </p>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Category Manager Dialog */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Gerenciar Categorias
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {categories.map((cat) => {
              const hasItems = items.some(i => i.subcategory === cat);
              const isEditing = editingCategory?.old === cat;

              return (
                <div key={cat} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                  {isEditing ? (
                    <>
                      <Input
                        autoFocus
                        value={editingCategory.new}
                        onChange={(e) => setEditingCategory({ ...editingCategory, new: e.target.value })}
                        className="h-8 flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleRenameCategory()}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRenameCategory}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCategory(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{cat}</span>
                      {hasItems && (
                        <Badge variant="secondary" className="text-xs">
                          {items.filter(i => i.subcategory === cat).length}
                        </Badge>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCategory({ old: cat, new: cat })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteCategory(cat)}
                        disabled={hasItems}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-9 flex-1"
              placeholder="Nova categoria..."
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            />
            <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Adicionar
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryManager(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
