import { useState, useRef, useMemo, useCallback } from "react";
import { Upload, FileImage, FileText, Loader2, Check, X, Edit2, Trash2, AlertTriangle, Plus, Search, Link2, LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
}

interface ExistingInput {
  id: string;
  name: string;
  unit: string;
  category: 'material' | 'labor' | 'equipment';
  material_family_id: string | null;
  material_family_name?: string;
  unit_value?: number;
}

interface ExtractedItem {
  name: string;
  category: 'material' | 'labor' | 'equipment';
  /** Family name as extracted by AI (raw, may be new) */
  extractedFamily?: string;
  quantity: number;
  unit: string;
  unitValue: number;
  totalValue: number;
  selected: boolean;
  // Matching info
  matchedInputId?: string;
  matchedInputName?: string;
  matchedInputUnit?: string;
  matchedInputValue?: number;
  matchedInputFamily?: string;
  matchConfidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
  // For creating new input — user-selected family for the new cadastro
  createAsNewInput?: boolean;
  newInputFamily?: string;
  /** True when newInputFamily does not exist in families list (will be created on import) */
  isNewFamily?: boolean;
}

interface ImportBudgetItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  scopeId: string;
  macroId: string;
  existingInputs: ExistingInput[];
  families: MaterialFamily[];
  onImport: (items: {
    name: string;
    category: 'material' | 'labor' | 'equipment';
    quantity: number;
    unit: string;
    unitValue: number;
    materialFamily: string;
    inputId?: string;
  }[]) => void;
}

export function ImportBudgetItemsDialog({
  open,
  onOpenChange,
  projectId,
  scopeId,
  macroId,
  existingInputs,
  families,
  onImport
}: ImportBudgetItemsDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [searchInputTerm, setSearchInputTerm] = useState("");
  const [activeMatchPopover, setActiveMatchPopover] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { company, canEdit } = useAuth();
  const companyId = company?.id;

  // Normalize text for comparison
  const normalize = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s0-9]/g, '')
      .trim();
  };

  // Find matching input from database
  const findMatchingInput = useCallback((itemName: string, itemCategory: string): {
    input?: ExistingInput;
    confidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
  } => {
    const normalizedName = normalize(itemName);
    const words = normalizedName.split(' ').filter(w => w.length > 2);
    
    // Exact match
    const exactMatch = existingInputs.find(i => 
      normalize(i.name) === normalizedName && i.category === itemCategory
    );
    if (exactMatch) {
      return { input: exactMatch, confidence: 'exact' };
    }

    // High confidence - same category and most words match
    const categoryInputs = existingInputs.filter(i => i.category === itemCategory);
    
    for (const input of categoryInputs) {
      const inputWords = normalize(input.name).split(' ').filter(w => w.length > 2);
      const matchingWords = words.filter(w => inputWords.some(iw => iw === w || iw.includes(w) || w.includes(iw)));
      const matchRatio = matchingWords.length / Math.max(words.length, inputWords.length);
      
      if (matchRatio >= 0.8) {
        return { input, confidence: 'high' };
      }
    }

    // Medium confidence - partial match
    for (const input of categoryInputs) {
      const inputWords = normalize(input.name).split(' ').filter(w => w.length > 2);
      const matchingWords = words.filter(w => inputWords.some(iw => iw === w || iw.includes(w) || w.includes(iw)));
      const matchRatio = matchingWords.length / Math.max(words.length, inputWords.length);
      
      if (matchRatio >= 0.5) {
        return { input, confidence: 'medium' };
      }
    }

    // Low confidence - any word match
    for (const input of existingInputs) {
      const inputWords = normalize(input.name).split(' ').filter(w => w.length > 2);
      const hasAnyMatch = words.some(w => inputWords.some(iw => iw === w));
      
      if (hasAnyMatch) {
        return { input, confidence: 'low' };
      }
    }

    return { confidence: 'none' };
  }, [existingInputs]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG, WEBP ou PDF.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 15MB.');
      return;
    }

    setIsProcessing(true);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const fileBase64 = await base64Promise;

      // Call edge function
      const { data, error } = await supabase.functions.invoke('parse-budget-items', {
        body: {
          fileBase64,
          existingInputs: existingInputs.slice(0, 100).map(i => ({ name: i.name, category: i.category }))
        }
      });

      if (error) throw error;

      if (!data.success || !data.items?.length) {
        toast.error(data.message || 'Nenhum item encontrado no arquivo');
        return;
      }

      // Process items and find matches
      const itemsWithMatching: ExtractedItem[] = data.items.map((item: any) => {
        const match = findMatchingInput(item.name, item.category);
        
        return {
          ...item,
          selected: true,
          matchedInputId: match.input?.id,
          matchedInputName: match.input?.name,
          matchedInputUnit: match.input?.unit,
          matchedInputValue: match.input?.unit_value,
          matchedInputFamily: match.input?.material_family_name,
          matchConfidence: match.confidence,
          createAsNewInput: match.confidence === 'none',
          newInputFamily: families[0]?.name || 'Geral'
        };
      });

      setExtractedItems(itemsWithMatching);
      setStep('preview');

      const matchedCount = itemsWithMatching.filter(i => i.matchConfidence !== 'none').length;
      const unmatchedCount = itemsWithMatching.length - matchedCount;
      
      toast.success(`${data.items.length} itens extraídos! ${matchedCount} reconhecidos, ${unmatchedCount} novos.`);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Erro ao processar arquivo. Tente novamente.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (index: number) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, selected: !item.selected } : item
    ));
  };

  const toggleSelectAll = () => {
    const allSelected = extractedItems.every(i => i.selected);
    setExtractedItems(prev => prev.map(item => ({ ...item, selected: !allSelected })));
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (index: number) => {
    setExtractedItems(prev => prev.filter((_, i) => i !== index));
  };

  // Link item to existing input
  const linkToInput = (index: number, input: ExistingInput) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        matchedInputId: input.id,
        matchedInputName: input.name,
        matchedInputUnit: input.unit,
        matchedInputValue: input.unit_value,
        matchedInputFamily: input.material_family_name,
        matchConfidence: 'exact',
        createAsNewInput: false
      } : item
    ));
    setActiveMatchPopover(null);
    toast.success(`Vinculado a "${input.name}"`);
  };

  // Unlink from input
  const unlinkInput = (index: number) => {
    setExtractedItems(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        matchedInputId: undefined,
        matchedInputName: undefined,
        matchedInputUnit: undefined,
        matchedInputValue: undefined,
        matchedInputFamily: undefined,
        matchConfidence: 'none',
        createAsNewInput: true
      } : item
    ));
  };

  // Filter inputs for search
  const filteredInputs = useMemo(() => {
    if (!searchInputTerm) return existingInputs.slice(0, 50);
    const term = normalize(searchInputTerm);
    return existingInputs.filter(i => normalize(i.name).includes(term)).slice(0, 50);
  }, [existingInputs, searchInputTerm]);

  const handleImport = async () => {
    if (!canEdit) return;
    const selectedItems = extractedItems.filter(i => i.selected);
    if (selectedItems.length === 0) {
      toast.error('Selecione pelo menos um item para importar');
      return;
    }

    setIsImporting(true);

    try {
      // Create new inputs for items marked as createAsNewInput
      const newInputsToCreate = selectedItems.filter(i => i.createAsNewInput && !i.matchedInputId);
      
      const createdInputsMap: Record<string, string> = {};
      
      for (const item of newInputsToCreate) {
        const familyId = families.find(f => f.name === item.newInputFamily)?.id || null;
        
        const { data: newInput, error } = await supabase
          .from('inputs')
          .insert({
            project_id: projectId,
            company_id: companyId!,
            name: item.name,
            unit: item.unit,
            category: item.category,
            material_family_id: familyId,
            unit_value: item.unitValue,
            stock_quantity: 0
          })
          .select()
          .single();
        
        if (!error && newInput) {
          createdInputsMap[item.name] = newInput.id;
        }
      }

      // Prepare items for import
      const itemsToImport = selectedItems.map(item => ({
        name: item.matchedInputName || item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.matchedInputUnit || item.unit,
        unitValue: item.matchedInputValue ?? item.unitValue,
        materialFamily: item.matchedInputFamily || item.newInputFamily || 'Geral',
        inputId: item.matchedInputId || createdInputsMap[item.name]
      }));

      onImport(itemsToImport);

      const newInputsCount = Object.keys(createdInputsMap).length;
      let message = `${selectedItems.length} itens importados!`;
      if (newInputsCount > 0) {
        message += ` ${newInputsCount} novo(s) insumo(s) cadastrado(s).`;
      }
      toast.success(message);
      handleClose();
    } catch (error) {
      console.error('Error importing items:', error);
      toast.error('Erro ao importar itens');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setExtractedItems([]);
    setEditingIndex(null);
    setSearchInputTerm("");
    setActiveMatchPopover(null);
    onOpenChange(false);
  };

  const selectedCount = extractedItems.filter(i => i.selected).length;
  const matchedCount = extractedItems.filter(i => i.matchConfidence !== 'none').length;
  const newItemsCount = extractedItems.filter(i => i.selected && i.createAsNewInput).length;

  const getConfidenceBadge = (confidence: ExtractedItem['matchConfidence']) => {
    switch (confidence) {
      case 'exact':
        return <Badge className="bg-green-500 text-white text-[10px]">Exato</Badge>;
      case 'high':
        return <Badge className="bg-blue-500 text-white text-[10px]">Alta</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 text-white text-[10px]">Média</Badge>;
      case 'low':
        return <Badge className="bg-orange-500 text-white text-[10px]">Baixa</Badge>;
      case 'none':
        return <Badge variant="outline" className="text-[10px]">Novo</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {step === 'upload' ? 'Importar Orçamento (Imagem/PDF)' : 'Revisar e Importar Itens'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' ? (
          <div className="py-8">
            <div 
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">Processando arquivo com IA...</p>
                  <p className="text-xs text-muted-foreground">Extraindo itens, quantidades e valores...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center gap-4 mb-4">
                    <FileImage className="h-10 w-10 text-muted-foreground" />
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium mb-2">Arraste ou clique para enviar</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Orçamentos, planilhas, composições ou listas de materiais
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WEBP ou PDF (máx. 15MB)</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O sistema irá extrair automaticamente: nomes dos insumos/serviços, quantidades, unidades e valores.
                Itens reconhecidos serão vinculados ao cadastro de Suprimentos. Novos itens podem ser cadastrados automaticamente.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Summary */}
            <div className="flex items-center gap-4 mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={extractedItems.length > 0 && extractedItems.every(i => i.selected)}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} de {extractedItems.length} selecionados
                </span>
              </div>
              <Badge variant="secondary">{matchedCount} reconhecidos</Badge>
              {newItemsCount > 0 && (
                <Badge variant="outline" className="text-orange-600 border-orange-300">
                  {newItemsCount} novos serão cadastrados
                </Badge>
              )}
            </div>

            {/* Items table */}
            <ScrollArea className="flex-1 border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-[280px]">Item Extraído</TableHead>
                    <TableHead className="w-[200px]">Vinculação</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead className="w-16">Un</TableHead>
                    <TableHead className="w-24">V. Unit</TableHead>
                    <TableHead className="w-24">Total</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractedItems.map((item, index) => (
                    <TableRow key={index} className={!item.selected ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleSelect(index)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium truncate max-w-[260px]" title={item.name}>
                            {item.name}
                          </p>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {item.category === 'material' ? 'Material' : item.category === 'labor' ? 'M.O.' : 'Equip.'}
                            </Badge>
                            {getConfidenceBadge(item.matchConfidence)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.matchedInputId ? (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-green-600 truncate max-w-[180px]" title={item.matchedInputName}>
                              ✓ {item.matchedInputName}
                            </p>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[9px]">{item.matchedInputFamily || 'Geral'}</Badge>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-5 w-5"
                                onClick={() => unlinkInput(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Popover open={activeMatchPopover === index} onOpenChange={(open) => setActiveMatchPopover(open ? index : null)}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                <LinkIcon className="h-3 w-3" />
                                Vincular
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-2" align="start">
                              <div className="space-y-2">
                                <Input
                                  placeholder="Buscar insumo..."
                                  value={searchInputTerm}
                                  onChange={(e) => setSearchInputTerm(e.target.value)}
                                  className="h-8"
                                />
                                <ScrollArea className="h-48">
                                  {filteredInputs.map(input => (
                                    <div
                                      key={input.id}
                                      className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                                      onClick={() => linkToInput(index, input)}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm truncate">{input.name}</p>
                                        <p className="text-xs text-muted-foreground">{input.unit} - {input.material_family_name || 'Geral'}</p>
                                      </div>
                                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                                    </div>
                                  ))}
                                  {filteredInputs.length === 0 && (
                                    <p className="text-sm text-muted-foreground p-2">Nenhum insumo encontrado</p>
                                  )}
                                </ScrollArea>
                                <div className="pt-2 border-t">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={item.createAsNewInput}
                                      onCheckedChange={(checked) => updateItem(index, 'createAsNewInput', checked)}
                                    />
                                    <span className="text-xs">Cadastrar como novo insumo</span>
                                  </div>
                                  {item.createAsNewInput && (
                                    <Select
                                      value={item.newInputFamily}
                                      onValueChange={(val) => updateItem(index, 'newInputFamily', val)}
                                    >
                                      <SelectTrigger className="h-7 mt-2">
                                        <SelectValue placeholder="Família" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {families.map(f => (
                                          <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingIndex === index ? (
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="h-7 w-16 text-xs"
                            min="0"
                            step="0.01"
                          />
                        ) : (
                          <span className="text-sm">{item.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{item.matchedInputUnit || item.unit}</span>
                      </TableCell>
                      <TableCell>
                        {editingIndex === index ? (
                          <Input
                            type="number"
                            value={item.unitValue}
                            onChange={(e) => updateItem(index, 'unitValue', parseFloat(e.target.value) || 0)}
                            className="h-7 w-20 text-xs"
                            min="0"
                            step="0.01"
                          />
                        ) : (
                          <span className="text-sm">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.matchedInputValue ?? item.unitValue)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.quantity * (item.matchedInputValue ?? item.unitValue))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editingIndex === index ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => setEditingIndex(null)}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingIndex(index)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Total summary */}
            <div className="mt-3 p-3 bg-muted/50 rounded-lg flex items-center justify-between flex-shrink-0">
              <div className="text-sm text-muted-foreground">
                {selectedCount} itens selecionados
                {newItemsCount > 0 && <span className="text-orange-600 ml-2">({newItemsCount} novos serão cadastrados)</span>}
              </div>
              <div className="text-lg font-bold">
                Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  extractedItems.filter(i => i.selected).reduce((sum, item) => sum + (item.quantity * (item.matchedInputValue ?? item.unitValue)), 0)
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          {step === 'preview' && (
            <Button onClick={handleImport} disabled={isImporting || selectedCount === 0}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Importar {selectedCount} Itens
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
