import { useState, useRef } from "react";
import { Upload, FileImage, FileText, Loader2, Check, X, Edit2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MaterialFamily {
  id: string;
  name: string;
  color: string;
}

interface ExtractedInput {
  name: string;
  family: string;
  unit: string;
  unit_value: number;
  selected: boolean;
  familyId?: string;
}

interface ImportInputsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  families: MaterialFamily[];
  units: { abbreviation: string }[];
  onSuccess: () => void;
}

export function ImportInputsDialog({
  open,
  onOpenChange,
  projectId,
  families,
  units,
  onSuccess
}: ImportInputsDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedInputs, setExtractedInputs] = useState<ExtractedInput[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Match families and prepare for preview
      const inputsWithFamilies = data.inputs.map((input: any) => {
        const matchedFamily = families.find(f => 
          f.name.toLowerCase() === input.family?.toLowerCase()
        );
        return {
          ...input,
          selected: true,
          familyId: matchedFamily?.id || ''
        };
      });

      setExtractedInputs(inputsWithFamilies);
      setStep('preview');
      toast.success(`${inputsWithFamilies.length} insumos extraídos!`);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Erro ao processar arquivo. Tente novamente.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSelect = (index: number) => {
    setExtractedInputs(prev => prev.map((item, i) => 
      i === index ? { ...item, selected: !item.selected } : item
    ));
  };

  const toggleSelectAll = () => {
    const allSelected = extractedInputs.every(i => i.selected);
    setExtractedInputs(prev => prev.map(item => ({ ...item, selected: !allSelected })));
  };

  const updateInput = (index: number, field: keyof ExtractedInput, value: any) => {
    setExtractedInputs(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeInput = (index: number) => {
    setExtractedInputs(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const selectedInputs = extractedInputs.filter(i => i.selected);
    if (selectedInputs.length === 0) {
      toast.error('Selecione pelo menos um insumo para importar');
      return;
    }

    setIsImporting(true);

    try {
      // Create any new families that don't exist
      const newFamilyNames = [...new Set(
        selectedInputs
          .filter(i => !i.familyId && i.family)
          .map(i => i.family)
      )];

      const familyMap: Record<string, string> = {};
      families.forEach(f => { familyMap[f.name.toLowerCase()] = f.id; });

      for (const familyName of newFamilyNames) {
        const { data: newFamily, error } = await supabase
          .from('material_families')
          .insert({ project_id: projectId, name: familyName })
          .select()
          .single();
        
        if (!error && newFamily) {
          familyMap[familyName.toLowerCase()] = newFamily.id;
        }
      }

      // Insert all inputs
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

      toast.success(`${selectedInputs.length} insumos importados com sucesso!`);
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
    onOpenChange(false);
  };

  const selectedCount = extractedInputs.filter(i => i.selected).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' ? 'Importar Insumos' : 'Revisar e Importar'}
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
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={extractedInputs.length > 0 && extractedInputs.every(i => i.selected)}
                  onChange={toggleSelectAll}
                  className="h-4 w-4"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedCount} de {extractedInputs.length} selecionados
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
                    <TableRow key={index} className={!input.selected ? 'opacity-50' : ''}>
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
                          <span className="font-medium">{input.name}</span>
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
                            style={{ 
                              borderColor: input.familyId 
                                ? families.find(f => f.id === input.familyId)?.color 
                                : '#9ca3af'
                            }}
                          >
                            {input.familyId 
                              ? families.find(f => f.id === input.familyId)?.name 
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
                            </SelectContent>
                          </Select>
                        ) : (
                          input.unit
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
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
