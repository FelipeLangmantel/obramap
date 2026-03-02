import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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

const INDIRECT_SUBCATEGORIES = [
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

export function IndirectCostsTab() {
  const { currentProject } = useConstruction();
  const { profile } = useAuth();
  const [items, setItems] = useState<IndirectCostItem[]>([]);
  const [editingItem, setEditingItem] = useState<IndirectCostItem | null>(null);
  const [newItem, setNewItem] = useState<{
    name: string; value: string; quantity: string; unit: string; subcategory: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Realtime
  useEffect(() => {
    if (!currentProject?.id) return;
    const channel = supabase
      .channel("indirect-costs-changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "indirect_costs",
        filter: `project_id=eq.${currentProject.id}`,
      }, () => loadItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentProject?.id, loadItems]);

  const handleAdd = async () => {
    if (!newItem || !newItem.name.trim() || !newItem.value || !newItem.subcategory) return;
    if (!currentProject?.id || !profile?.company_id) return;

    try {
      const { error } = await supabase.from("indirect_costs").insert({
        project_id: currentProject.id,
        company_id: profile.company_id,
        name: newItem.name.trim(),
        subcategory: newItem.subcategory,
        value: parseFloat(newItem.value) || 0,
        quantity: parseFloat(newItem.quantity) || 1,
        unit: newItem.unit || "mês",
      });
      if (error) throw error;
      setNewItem(null);
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

  // Group by subcategory
  const grouped = items.reduce<Record<string, IndirectCostItem[]>>((acc, item) => {
    if (!acc[item.subcategory]) acc[item.subcategory] = [];
    acc[item.subcategory].push(item);
    return acc;
  }, {});

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
          <p className="text-xs text-muted-foreground mt-1">
            {items.length} {items.length === 1 ? "item" : "itens"} cadastrados em{" "}
            {Object.keys(grouped).length} {Object.keys(grouped).length === 1 ? "categoria" : "categorias"}
          </p>
        </CardContent>
      </Card>

      {/* Items List */}
      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
          ) : items.length === 0 && !newItem ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum custo indireto cadastrado.
            </div>
          ) : (
            Object.entries(grouped).map(([subcat, catItems]) => (
              <Card key={subcat} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider">
                      {subcat}
                    </Badge>
                    <span className="text-sm font-medium text-muted-foreground">
                      {formatCurrency(catItems.reduce((s, i) => s + i.value * i.quantity, 0))}
                    </span>
                  </div>
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
                              {INDIRECT_SUBCATEGORIES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={editingItem.name}
                            onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                            className="h-8 flex-1 min-w-[120px]"
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
                          <Button size="sm" variant="ghost" onClick={handleUpdate}>Salvar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>X</Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.value)} x {item.quantity} {item.unit} ={" "}
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
                </CardContent>
              </Card>
            ))
          )}

          {/* Add new item form */}
          {newItem ? (
            <Card>
              <CardContent className="p-3">
                <div className="flex gap-2 items-center flex-wrap">
                  <Select value={newItem.subcategory} onValueChange={(v) => setNewItem({ ...newItem, subcategory: v })}>
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIRECT_SUBCATEGORIES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="h-8 flex-1 min-w-[120px]"
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
                  <Button size="sm" onClick={handleAdd}>Adicionar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewItem(null)}>X</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => setNewItem({ name: "", value: "", quantity: "1", unit: "mês", subcategory: "" })}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Adicionar Custo Indireto
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
