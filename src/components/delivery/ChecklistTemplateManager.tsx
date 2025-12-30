import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  Trash2, 
  Save,
  AlertTriangle 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ChecklistTemplateManagerProps {
  projectId: string;
  templates: any[];
  onUpdate: () => void;
  isAdmin: boolean;
}

export const ChecklistTemplateManager: React.FC<ChecklistTemplateManagerProps> = ({
  projectId,
  templates,
  onUpdate,
  isAdmin
}) => {
  const [newItem, setNewItem] = useState({
    category: '',
    item_name: '',
    is_critical: false
  });
  const [saving, setSaving] = useState(false);

  const categories = [
    'Estrutura',
    'Acabamentos',
    'Hidrossanitário',
    'Elétrica',
    'Esquadrias',
    'Limpeza Final',
    'Documentação',
    'Medidores'
  ];

  const handleAddItem = async () => {
    if (!newItem.category || !newItem.item_name) {
      toast.error('Preencha categoria e nome do item');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('delivery_checklist_templates')
        .insert({
          project_id: projectId,
          category: newItem.category,
          item_name: newItem.item_name,
          is_critical: newItem.is_critical,
          display_order: templates.filter(t => t.category === newItem.category).length
        });

      if (error) throw error;

      toast.success('Item adicionado ao checklist!');
      setNewItem({ category: '', item_name: '', is_critical: false });
      onUpdate();
    } catch (error: any) {
      toast.error('Erro ao adicionar item: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('delivery_checklist_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Item removido!');
      onUpdate();
    } catch (error: any) {
      toast.error('Erro ao remover item: ' + error.message);
    }
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, any[]>);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Template de Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Apenas administradores podem editar o template de checklist.
          </p>
          
          <div className="mt-4 space-y-4">
            {Object.entries(groupedTemplates).map(([category, items]) => (
              <div key={category}>
                <h4 className="font-medium mb-2">{category}</h4>
                <div className="space-y-1">
                  {(items as any[]).map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <span>{item.item_name}</span>
                      {item.is_critical && (
                        <Badge variant="destructive" className="text-xs">Crítico</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Gerenciar Template de Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new item */}
        <div className="p-4 border rounded-lg space-y-4">
          <h4 className="font-medium">Adicionar Item</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select 
              value={newItem.category} 
              onValueChange={(v) => setNewItem(prev => ({ ...prev, category: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Nome do item"
              value={newItem.item_name}
              onChange={(e) => setNewItem(prev => ({ ...prev, item_name: e.target.value }))}
              className="md:col-span-2"
            />

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={newItem.is_critical}
                  onCheckedChange={(checked) => 
                    setNewItem(prev => ({ ...prev, is_critical: !!checked }))
                  }
                />
                <label className="text-sm">Crítico</label>
              </div>

              <Button onClick={handleAddItem} disabled={saving}>
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>
        </div>

        {/* Existing items */}
        {Object.entries(groupedTemplates).map(([category, items]) => (
          <div key={category}>
            <h4 className="font-medium mb-2">{category}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[100px]">Crítico</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(items as any[]).map(item => (
                  <TableRow key={item.id}>
                    <TableCell>{item.item_name}</TableCell>
                    <TableCell>
                      {item.is_critical && (
                        <Badge variant="destructive">Sim</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}

        {templates.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Nenhum item no template. Adicione itens acima.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
