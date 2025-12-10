import { useState, useRef, useMemo } from "react";
import { Upload, FileImage, FileText, Loader2, Check, X, Edit2, Trash2, AlertTriangle, Plus } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
}

interface UnitItem {
  abbreviation: string;
  name?: string;
}

interface ExtractedInput {
  name: string;
  family: string;
  unit: string;
  unit_value: number;
  selected: boolean;
  familyId?: string;
  isDuplicate?: boolean;
  duplicateOf?: string;
  isNewFamily?: boolean;
  isNewUnit?: boolean;
}

interface ImportInputsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  families: MaterialFamily[];
  units: UnitItem[];
  existingInputs?: { name: string }[];
  onSuccess: () => void;
}

export function ImportInputsDialog({
  open,
  onOpenChange,
  projectId,
  families,
  units,
  existingInputs = [],
  onSuccess
}: ImportInputsDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'confirm_new'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedInputs, setExtractedInputs] = useState<ExtractedInput[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New families and units to create
  const [newFamiliesToCreate, setNewFamiliesToCreate] = useState<Set<string>>(new Set());
  const [newUnitsToCreate, setNewUnitsToCreate] = useState<Set<string>>(new Set());

  // Check for similar names (duplicates)
  const checkDuplicate = (name: string, existingNames: string[]): { isDuplicate: boolean; duplicateOf?: string } => {
    const normalizedName = name.trim().toLowerCase();
    
    // Exact match
    const exactMatch = existingNames.find(n => n.toLowerCase() === normalizedName);
    if (exactMatch) {
      return { isDuplicate: true, duplicateOf: exactMatch };
    }
    
    // Similar match (contains or is contained)
    const similarMatch = existingNames.find(n => {
      const normalizedExisting = n.toLowerCase();
      // Check if names are very similar (>80% common words)
      const words1 = normalizedName.split(/\s+/);
      const words2 = normalizedExisting.split(/\s+/);
      const commonWords = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
      return commonWords.length >= Math.min(words1.length, words2.length) * 0.8;
    });
    
    if (similarMatch) {
      return { isDuplicate: true, duplicateOf: similarMatch };
    }
    
    return { isDuplicate: false };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG, WEBP ou PDF.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
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

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke('parse-inputs-import', {
        body: {
          fileBase64,
          existingFamilies: families.map(f => ({ name: f.name }))
        }
      });

      if (error) throw error;

      if (!data.success || !data.inputs?.length) {
        toast.error(data.message || 'Nenhum insumo encontrado no arquivo');
        return;
      }

      // Get existing input names for duplicate check
      const { data: existingInputsData } = await supabase
        .from('inputs')
        .select('name')
        .eq('project_id', projectId);
      
      const existingNames = existingInputsData?.map(i => i.name) || [];
      const existingUnits = units.map(u => u.abbreviation.toLowerCase());
      const existingFamilies = families.map(f => f.name.toLowerCase());

      // Track new families and units found
      const newFamilies = new Set<string>();
      const newUnits = new Set<string>();

      // Match families and check for duplicates
      const inputsWithValidation = data.inputs.map((input: any) => {
        const matchedFamily = families.find(f => 
          f.name.toLowerCase() === input.family?.toLowerCase()
        );
        
        // Check duplicate
        const duplicateCheck = checkDuplicate(input.name, existingNames);
        
        // Check if family is new
        const isNewFamily = input.family && !existingFamilies.includes(input.family.toLowerCase());
        if (isNewFamily) newFamilies.add(input.family);
        
        // Check if unit is new
        const isNewUnit = input.unit && !existingUnits.includes(input.unit.toLowerCase());
        if (isNewUnit) newUnits.add(input.unit);
        
        return {
          ...input,
          selected: !duplicateCheck.isDuplicate, // Auto-deselect duplicates
          familyId: matchedFamily?.id || '',
          isDuplicate: duplicateCheck.isDuplicate,
          duplicateOf: duplicateCheck.duplicateOf,
          isNewFamily,
          isNewUnit
        };
      });

      setExtractedInputs(inputsWithValidation);
      
      // If there are new families or units, go to confirmation step
      if (newFamilies.size > 0 || newUnits.size > 0) {
        setNewFamiliesToCreate(newFamilies);
        setNewUnitsToCreate(newUnits);
        setStep('confirm_new');
      } else {
        setStep('preview');
      }
      
      const duplicateCount = inputsWithValidation.filter((i: ExtractedInput) => i.isDuplicate).length;
      const validCount = inputsWithValidation.length - duplicateCount;
      
      if (duplicateCount > 0) {
        toast.warning(`${duplicateCount} insumo(s) duplicado(s) detectado(s) e desmarcado(s). ${validCount} pronto(s) para importar.`);
      } else {
        toast.success(`${inputsWithValidation.length} insumos extraídos!`);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Erro ao processar arquivo. Tente novamente.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (index: number) => {
    const input = extractedInputs[index];
    if (input.isDuplicate && !input.selected) {
      // Warn when trying to select duplicate
      toast.warning(`"${input.name}" é similar a "${input.duplicateOf}". Selecione apenas se tiver certeza.`);
    }
    setExtractedInputs(prev => prev.map((item, i) => 
      i === index ? { ...item, selected: !item.selected } : item
    ));
  };

  const toggleSelectAll = () => {
    const nonDuplicates = extractedInputs.filter(i => !i.isDuplicate);
    const allSelected = nonDuplicates.every(i => i.selected);
    setExtractedInputs(prev => prev.map(item => ({ 
      ...item, 
      selected: item.isDuplicate ? item.selected : !allSelected 
    })));
  };

  const updateInput = (index: number, field: keyof ExtractedInput, value: any) => {
    setExtractedInputs(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeInput = (index: number) => {
    setExtractedInputs(prev => prev.filter((_, i) => i !== index));
  };

  const toggleNewFamily = (familyName: string) => {
    setNewFamiliesToCreate(prev => {
      const next = new Set(prev);
      if (next.has(familyName)) {
        next.delete(familyName);
      } else {
        next.add(familyName);
      }
      return next;
    });
  };

  const toggleNewUnit = (unitName: string) => {
    setNewUnitsToCreate(prev => {
      const next = new Set(prev);
      if (next.has(unitName)) {
        next.delete(unitName);
      } else {
        next.add(unitName);
      }
      return next;
    });
  };

  const proceedToPreview = () => {
    // Update inputs to reflect which families/units will be created
    setExtractedInputs(prev => prev.map(input => ({
      ...input,
      isNewFamily: input.isNewFamily && newFamiliesToCreate.has(input.family),
      isNewUnit: input.isNewUnit && newUnitsToCreate.has(input.unit)
    })));
    setStep('preview');
  };

  const handleImport = async () => {
    const selectedInputs = extractedInputs.filter(i => i.selected);
    if (selectedInputs.length === 0) {
      toast.error('Selecione pelo menos um insumo para importar');
      return;
    }

    setIsImporting(true);

    try {
      // Create new families
      const familyMap: Record<string, string> = {};
      families.forEach(f => { familyMap[f.name.toLowerCase()] = f.id; });

      for (const familyName of newFamiliesToCreate) {
        const { data: newFamily, error } = await supabase
          .from('material_families')
          .insert({ project_id: projectId, name: familyName })
          .select()
          .single();
        
        if (!error && newFamily) {
          familyMap[familyName.toLowerCase()] = newFamily.id;
        }
      }

      // Create new units
      for (const unitName of newUnitsToCreate) {
        await supabase.from('units').insert({ 
          project_id: projectId, 
          name: unitName, 
          abbreviation: unitName 
        });
      }

      // Filter out duplicates that were manually selected (user override)
      const inputsToInsert = selectedInputs.map(input => ({
        project_id: projectId,
        name: input.name,
        unit: input.unit,
        category: 'material' as const,
        material_family_id: input.familyId || familyMap[input.family?.toLowerCase()] || null,
        unit_value: input.unit_value,
        stock_quantity: 0
      }));

      const { error } = await supabase.from('inputs').insert(inputsToInsert);
      if (error) throw error;

      const duplicatesImported = selectedInputs.filter(i => i.isDuplicate).length;
      const newItemsImported = selectedInputs.length - duplicatesImported;
      
      let message = `${newItemsImported} insumos importados!`;
      if (duplicatesImported > 0) {
        message += ` (${duplicatesImported} potencialmente duplicado(s))`;
      }
      if (newFamiliesToCreate.size > 0) {
        message += ` ${newFamiliesToCreate.size} família(s) criada(s).`;
      }
      if (newUnitsToCreate.size > 0) {
        message += ` ${newUnitsToCreate.size} unidade(s) criada(s).`;
      }
      
      toast.success(message);
      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Error importing inputs:', error);
      toast.error('Erro ao importar insumos');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setExtractedInputs([]);
    setEditingIndex(null);
    setNewFamiliesToCreate(new Set());
    setNewUnitsToCreate(new Set());
    onOpenChange(false);
  };

  const selectedCount = extractedInputs.filter(i => i.selected).length;
  const duplicateCount = extractedInputs.filter(i => i.isDuplicate).length;
  const selectedDuplicates = extractedInputs.filter(i => i.selected && i.isDuplicate).length;

  // Get all unique new families and units from extracted inputs
  const detectedNewFamilies = useMemo(() => {
    return [...new Set(extractedInputs.filter(i => i.isNewFamily).map(i => i.family))];
  }, [extractedInputs]);
  
  const detectedNewUnits = useMemo(() => {
    return [...new Set(extractedInputs.filter(i => i.isNewUnit).map(i => i.unit))];
  }, [extractedInputs]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' ? 'Importar Insumos' : step === 'confirm_new' ? 'Novos Cadastros Detectados' : 'Revisar e Importar'}
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
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-4">
                    <FileImage className="h-12 w-12 text-muted-foreground" />
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">Clique para selecionar arquivo</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      PNG, JPG, WEBP ou PDF com tabela de insumos
                    </p>
                  </div>
                  <Badge variant="outline" className="mt-2">
                    A tabela deve ter: Nome, Família, Unidade e Valor Unitário
                  </Badge>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isProcessing}
            />
          </div>
        ) : step === 'confirm_new' ? (
          <div className="space-y-6 py-4">
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Foram detectados itens com famílias ou unidades não cadastradas. Selecione quais deseja criar automaticamente.
              </AlertDescription>
            </Alert>

            {detectedNewFamilies.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Plus className="w-4 h-4" />
                  Novas Famílias ({detectedNewFamilies.length})
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {detectedNewFamilies.map(family => (
                    <div 
                      key={family}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        newFamiliesToCreate.has(family) 
                          ? 'bg-green-50 border-green-300 dark:bg-green-900/20' 
                          : 'bg-muted/50 border-muted'
                      }`}
                      onClick={() => toggleNewFamily(family)}
                    >
                      <Checkbox checked={newFamiliesToCreate.has(family)} />
                      <span className="font-medium">{family}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detectedNewUnits.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-base font-semibold">
                  <Plus className="w-4 h-4" />
                  Novas Unidades ({detectedNewUnits.length})
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {detectedNewUnits.map(unit => (
                    <div 
                      key={unit}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        newUnitsToCreate.has(unit) 
                          ? 'bg-green-50 border-green-300 dark:bg-green-900/20' 
                          : 'bg-muted/50 border-muted'
                      }`}
                      onClick={() => toggleNewUnit(unit)}
                    >
                      <Checkbox checked={newUnitsToCreate.has(unit)} />
                      <span className="font-medium">{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Itens com famílias ou unidades não selecionadas poderão ser editados manualmente na próxima etapa.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {duplicateCount > 0 && (
              <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>{duplicateCount} insumo(s) com nome similar</strong> a cadastros existentes foram desmarcados automaticamente. 
                  Você pode selecioná-los manualmente se tiver certeza que não são duplicados.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={extractedInputs.filter(i => !i.isDuplicate).length > 0 && extractedInputs.filter(i => !i.isDuplicate).every(i => i.selected)}
                  onChange={toggleSelectAll}
                  className="h-4 w-4"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} de {extractedInputs.length} selecionados
                  {selectedDuplicates > 0 && (
                    <span className="text-amber-600 ml-1">({selectedDuplicates} potencial duplicado)</span>
                  )}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                <Upload className="h-4 w-4 mr-2" />
                Novo arquivo
              </Button>
            </div>

            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Família</TableHead>
                    <TableHead className="w-20">Unidade</TableHead>
                    <TableHead className="w-28 text-right">Valor Unit.</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractedInputs.map((input, index) => (
                    <TableRow 
                      key={index} 
                      className={`${!input.selected ? 'opacity-50' : ''} ${input.isDuplicate ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={input.selected}
                          onChange={() => toggleSelect(index)}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell>
                        {editingIndex === index ? (
                          <Input
                            value={input.name}
                            onChange={(e) => updateInput(index, 'name', e.target.value)}
                            className="h-8"
                          />
                        ) : (
                          <div>
                            <span className="font-medium">{input.name}</span>
                            {input.isDuplicate && (
                              <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                Similar a: {input.duplicateOf}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingIndex === index ? (
                          <Select
                            value={input.familyId || 'new'}
                            onValueChange={(val) => {
                              if (val === 'new') {
                                updateInput(index, 'familyId', '');
                              } else {
                                updateInput(index, 'familyId', val);
                                const family = families.find(f => f.id === val);
                                if (family) updateInput(index, 'family', family.name);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {families.map(f => (
                                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                              ))}
                              <SelectItem value="new">+ Nova: {input.family}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge 
                            variant="outline"
                            className={input.isNewFamily ? 'border-green-500 text-green-700' : ''}
                            style={{ 
                              borderColor: input.familyId 
                                ? families.find(f => f.id === input.familyId)?.color 
                                : input.isNewFamily ? undefined : '#9ca3af'
                            }}
                          >
                            {input.familyId 
                              ? families.find(f => f.id === input.familyId)?.name 
                              : input.isNewFamily 
                                ? `${input.family} (criar)`
                                : `${input.family} (nova)`
                            }
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingIndex === index ? (
                          <Select
                            value={input.unit}
                            onValueChange={(val) => updateInput(index, 'unit', val)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map(u => (
                                <SelectItem key={u.abbreviation} value={u.abbreviation}>
                                  {u.abbreviation}
                                </SelectItem>
                              ))}
                              {input.isNewUnit && (
                                <SelectItem value={input.unit}>{input.unit} (nova)</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={input.isNewUnit ? 'text-green-700 font-medium' : ''}>
                            {input.unit}
                            {input.isNewUnit && ' (criar)'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingIndex === index ? (
                          <Input
                            type="number"
                            value={input.unit_value}
                            onChange={(e) => updateInput(index, 'unit_value', parseFloat(e.target.value) || 0)}
                            className="h-8 text-right"
                            step="0.01"
                          />
                        ) : (
                          `R$ ${input.unit_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editingIndex === index ? (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => setEditingIndex(null)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => setEditingIndex(index)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeInput(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          {step === 'confirm_new' && (
            <Button onClick={proceedToPreview}>
              Continuar para Revisão
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={handleImport} disabled={isImporting || selectedCount === 0}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Importar {selectedCount} insumos
                  {selectedDuplicates > 0 && ` (${selectedDuplicates} dup.)`}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
