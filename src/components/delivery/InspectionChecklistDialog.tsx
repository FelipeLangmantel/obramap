import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Camera,
  Save
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface ChecklistItem {
  id: string;
  template_id: string | null;
  category: string;
  item_name: string;
  is_critical: boolean;
  is_conforming: boolean | null;
  photo_url: string;
  observation: string;
}

interface InspectionChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspection: any;
  templates: any[];
  onSave: () => void;
}

export const InspectionChecklistDialog: React.FC<InspectionChecklistDialogProps> = ({
  open,
  onOpenChange,
  inspection,
  templates,
  onSave
}) => {
  const { canEdit, requireEdit } = useAuth();
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("");

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

  useEffect(() => {
    if (open && inspection) {
      loadOrCreateChecklist();
    }
  }, [open, inspection]);

  const loadOrCreateChecklist = async () => {
    // First try to load existing checklist items
    const { data: existingItems } = await supabase
      .from('delivery_checklist_items')
      .select('*')
      .eq('inspection_id', inspection.id);

    if (existingItems && existingItems.length > 0) {
      setChecklistItems(existingItems.map(item => ({
        id: item.id,
        template_id: item.template_id,
        category: item.category,
        item_name: item.item_name,
        is_critical: item.is_critical,
        is_conforming: item.is_conforming,
        photo_url: item.photo_url || '',
        observation: item.observation || ''
      })));
    } else {
      // Create checklist from templates or default categories
      const projectTemplates = templates.filter(t => t.project_id === inspection.project_id);
      
      if (projectTemplates.length > 0) {
        setChecklistItems(projectTemplates.map(t => ({
          id: crypto.randomUUID(),
          template_id: t.id,
          category: t.category,
          item_name: t.item_name,
          is_critical: t.is_critical,
          is_conforming: null,
          photo_url: '',
          observation: ''
        })));
      } else {
        // Default items per category
        const defaultItems: ChecklistItem[] = [];
        categories.forEach(category => {
          defaultItems.push({
            id: crypto.randomUUID(),
            template_id: null,
            category,
            item_name: `Verificação geral - ${category}`,
            is_critical: category === 'Estrutura' || category === 'Elétrica',
            is_conforming: null,
            photo_url: '',
            observation: ''
          });
        });
        setChecklistItems(defaultItems);
      }
    }
    
    setActiveCategory(categories[0]);
  };

  const updateItem = (itemId: string, field: keyof ChecklistItem, value: any) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const hasNonConformingCritical = checklistItems.some(
    item => item.is_critical && item.is_conforming === false
  );

  const allItemsChecked = checklistItems.every(item => item.is_conforming !== null);

  const handleSave = async () => {
    if (!requireEdit()) return;
    // Validate: non-conforming items must have photo
    const invalidItems = checklistItems.filter(
      item => item.is_conforming === false && !item.photo_url
    );

    if (invalidItems.length > 0) {
      toast.error(`Itens não conformes precisam de foto: ${invalidItems.map(i => i.item_name).join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      // Delete existing items
      await supabase
        .from('delivery_checklist_items')
        .delete()
        .eq('inspection_id', inspection.id);

      // Insert new items
      const { error: insertError } = await supabase
        .from('delivery_checklist_items')
        .insert(checklistItems.map(item => ({
          inspection_id: inspection.id,
          template_id: item.template_id,
          category: item.category,
          item_name: item.item_name,
          is_critical: item.is_critical,
          is_conforming: item.is_conforming,
          photo_url: item.photo_url || null,
          observation: item.observation || null,
          checked_at: item.is_conforming !== null ? new Date().toISOString() : null
        })));

      if (insertError) throw insertError;

      // Create issues for non-conforming items
      const nonConformingItems = checklistItems.filter(item => item.is_conforming === false);
      
      if (nonConformingItems.length > 0) {
        const { error: issuesError } = await supabase
          .from('delivery_issues')
          .insert(nonConformingItems.map(item => ({
            inspection_id: inspection.id,
            project_id: inspection.project_id,
            house_id: inspection.house_id,
            house_number: inspection.house_number,
            category: item.category,
            description: `${item.item_name} - Não conforme`,
            severity: (item.is_critical ? 'critica' : 'media') as 'critica' | 'media' | 'leve',
            status: 'aberta' as const,
            sla_days: item.is_critical ? 3 : 7,
            due_date: new Date(Date.now() + (item.is_critical ? 3 : 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            photo_before_url: item.photo_url || null
          })));

        if (issuesError) throw issuesError;
      }

      // Update inspection status
      const newStatus = nonConformingItems.length > 0 
        ? 'entregue_com_pendencias' 
        : 'entregue_sem_pendencias';

      await supabase
        .from('delivery_inspections')
        .update({ 
          status: newStatus,
          inspection_date: new Date().toISOString()
        })
        .eq('id', inspection.id);

      toast.success('Vistoria salva com sucesso!');
      onSave();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao salvar vistoria: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const categoryItems = checklistItems.filter(item => item.category === activeCategory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Checklist de Vistoria - Casa {inspection?.house_number}
            {hasNonConformingCritical && (
              <Badge variant="destructive" className="ml-2">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Item Crítico Não Conforme
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            {categories.map(category => {
              const catItems = checklistItems.filter(i => i.category === category);
              const hasNonConforming = catItems.some(i => i.is_conforming === false);
              const allChecked = catItems.every(i => i.is_conforming !== null);
              
              return (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="relative"
                >
                  {category}
                  {hasNonConforming && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                  {!hasNonConforming && allChecked && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map(category => (
            <TabsContent key={category} value={category}>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {categoryItems.map(item => (
                    <div 
                      key={item.id} 
                      className={`p-4 rounded-lg border ${
                        item.is_conforming === false 
                          ? 'border-red-500/50 bg-red-500/5' 
                          : item.is_conforming === true 
                            ? 'border-green-500/50 bg-green-500/5'
                            : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.item_name}</span>
                            {item.is_critical && (
                              <Badge variant="destructive" className="text-xs">
                                Crítico
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={item.is_conforming === true ? "default" : "outline"}
                            className={item.is_conforming === true ? "bg-green-600 hover:bg-green-700" : ""}
                            onClick={() => updateItem(item.id, 'is_conforming', true)}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Conforme
                          </Button>
                          <Button
                            size="sm"
                            variant={item.is_conforming === false ? "destructive" : "outline"}
                            onClick={() => updateItem(item.id, 'is_conforming', false)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Não Conforme
                          </Button>
                        </div>
                      </div>

                      {item.is_conforming === false && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-sm font-medium flex items-center gap-1">
                              <Camera className="w-4 h-4" />
                              URL da Foto (obrigatório)
                            </label>
                            <Input
                              placeholder="https://..."
                              value={item.photo_url}
                              onChange={(e) => updateItem(item.id, 'photo_url', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Observação</label>
                            <Textarea
                              placeholder="Descreva o problema encontrado..."
                              value={item.observation}
                              onChange={(e) => updateItem(item.id, 'observation', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter>
          <div className="flex items-center gap-4 w-full justify-between">
            <div className="text-sm text-muted-foreground">
              {checklistItems.filter(i => i.is_conforming !== null).length} / {checklistItems.length} itens verificados
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={saving || !allItemsChecked || !canEdit}
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Finalizar Vistoria'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
