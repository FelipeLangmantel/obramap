import { useState, useRef } from "react";
import { Upload, FileImage, FileText, Loader2, Check, X, AlertTriangle, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DEFAULT_MACRO_COLORS } from "@/data/constructionData";

interface ExtractedMacro {
  name: string;
  color: string;
  scopes: {
    name: string;
    weight: number;
  }[];
}

interface ImportMacrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (macros: ExtractedMacro[]) => void;
  mode: 'structure' | 'weights';
}

export function ImportMacrosDialog({
  open,
  onOpenChange,
  onImport,
  mode = 'structure'
}: ImportMacrosDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedMacros, setExtractedMacros] = useState<ExtractedMacro[]>([]);
  const [editingMacroIndex, setEditingMacroIndex] = useState<number | null>(null);
  const [editingScopeIndex, setEditingScopeIndex] = useState<{ macroIndex: number; scopeIndex: number } | null>(null);
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

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 15MB.');
      return;
    }

    setIsProcessing(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const fileBase64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke('parse-macros-import', {
        body: { fileBase64, mode }
      });

      if (error) throw error;

      if (!data.success || !data.macros?.length) {
        toast.error(data.message || 'Nenhuma etapa encontrada no arquivo');
        return;
      }

      setExtractedMacros(data.macros);
      setStep('preview');

      const totalScopes = data.macros.reduce((sum: number, m: ExtractedMacro) => sum + m.scopes.length, 0);
      toast.success(`${data.macros.length} etapas com ${totalScopes} serviços extraídos!`);
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Erro ao processar arquivo. Tente novamente.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const updateMacro = (index: number, field: keyof ExtractedMacro, value: any) => {
    setExtractedMacros(prev => prev.map((macro, i) => 
      i === index ? { ...macro, [field]: value } : macro
    ));
  };

  const updateScope = (macroIndex: number, scopeIndex: number, field: 'name' | 'weight', value: any) => {
    setExtractedMacros(prev => prev.map((macro, mi) => 
      mi === macroIndex ? {
        ...macro,
        scopes: macro.scopes.map((scope, si) => 
          si === scopeIndex ? { ...scope, [field]: value } : scope
        )
      } : macro
    ));
  };

  const removeMacro = (index: number) => {
    setExtractedMacros(prev => prev.filter((_, i) => i !== index));
  };

  const removeScope = (macroIndex: number, scopeIndex: number) => {
    setExtractedMacros(prev => prev.map((macro, mi) => 
      mi === macroIndex ? {
        ...macro,
        scopes: macro.scopes.filter((_, si) => si !== scopeIndex)
      } : macro
    ).filter(macro => macro.scopes.length > 0));
  };

  const handleImport = () => {
    if (extractedMacros.length === 0) {
      toast.error('Nenhuma etapa para importar');
      return;
    }

    setIsImporting(true);
    try {
      onImport(extractedMacros);
      toast.success(`${extractedMacros.length} etapas importadas!`);
      handleClose();
    } catch (error) {
      console.error('Error importing macros:', error);
      toast.error('Erro ao importar etapas');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setExtractedMacros([]);
    setEditingMacroIndex(null);
    setEditingScopeIndex(null);
    onOpenChange(false);
  };

  const totalWeight = extractedMacros.reduce(
    (sum, m) => sum + m.scopes.reduce((s, scope) => s + scope.weight, 0),
    0
  );

  const normalizeWeights = () => {
    if (totalWeight === 0) return;
    const factor = 100 / totalWeight;
    setExtractedMacros(prev => prev.map(macro => ({
      ...macro,
      scopes: macro.scopes.map(scope => ({
        ...scope,
        weight: Math.round(scope.weight * factor * 10) / 10
      }))
    })));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] max-w-4xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-3 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg">
            {mode === 'weights' 
              ? 'Importar Pesos do Orçamento' 
              : 'Importar Etapas e Serviços'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' ? (
          <div className="py-4 sm:py-8 flex-1 overflow-y-auto">
            <div 
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 sm:p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">Processando arquivo com IA...</p>
                  <p className="text-xs text-muted-foreground">Extraindo etapas, serviços e pesos...</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center gap-4 mb-4">
                    <FileImage className="h-10 w-10 text-muted-foreground" />
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium mb-2">Arraste ou clique para enviar</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {mode === 'weights' 
                      ? 'Orçamento, planilha de custos ou composição de preços'
                      : 'Cronograma, EAP, estrutura de etapas ou planilha de serviços'}
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
                {mode === 'weights' 
                  ? 'O sistema irá extrair os percentuais de peso de cada serviço com base nos valores do orçamento.'
                  : 'O sistema irá identificar as ETAPAS (ex: Fundação, Estrutura) e seus SERVIÇOS (ex: Escavação, Forma) automaticamente.'}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Summary */}
            <div className="flex items-center gap-4 mb-3 flex-shrink-0">
              <Badge variant="secondary">
                {extractedMacros.length} etapas
              </Badge>
              <Badge variant="secondary">
                {extractedMacros.reduce((s, m) => s + m.scopes.length, 0)} serviços
              </Badge>
              <div className={`flex items-center gap-2 ${Math.abs(totalWeight - 100) > 0.5 ? 'text-orange-600' : 'text-green-600'}`}>
                <span className="text-sm font-medium">Peso Total: {totalWeight.toFixed(1)}%</span>
                {Math.abs(totalWeight - 100) > 0.5 && (
                  <Button size="sm" variant="outline" onClick={normalizeWeights}>
                    Normalizar para 100%
                  </Button>
                )}
              </div>
            </div>

            {/* Macros list */}
            <ScrollArea className="flex-1 border rounded-lg p-1 sm:p-2 min-h-0">
              <Accordion type="multiple" defaultValue={extractedMacros.map((_, i) => `macro-${i}`)}>
                {extractedMacros.map((macro, macroIndex) => (
                  <AccordionItem key={macroIndex} value={`macro-${macroIndex}`}>
                    <AccordionTrigger className="px-2 hover:no-underline">
                      <div className="flex items-center gap-2 flex-1">
                        <Popover>
                          <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              className="w-6 h-6 rounded border border-border flex-shrink-0"
                              style={{ backgroundColor: macro.color }}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3" align="start">
                            <div className="grid grid-cols-6 gap-2">
                              {DEFAULT_MACRO_COLORS.map((color) => (
                                <button
                                  key={color}
                                  className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                                  style={{ 
                                    backgroundColor: color,
                                    borderColor: macro.color === color ? 'hsl(var(--foreground))' : 'transparent'
                                  }}
                                  onClick={() => updateMacro(macroIndex, 'color', color)}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {editingMacroIndex === macroIndex ? (
                          <Input
                            value={macro.name}
                            onChange={(e) => updateMacro(macroIndex, 'name', e.target.value)}
                            onBlur={() => setEditingMacroIndex(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingMacroIndex(null)}
                            className="h-7 w-48"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="font-medium">{macro.name}</span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {macro.scopes.reduce((s, sc) => s + sc.weight, 0).toFixed(1)}%
                        </Badge>
                        <div className="flex gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setEditingMacroIndex(macroIndex)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeMacro(macroIndex)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Serviço</TableHead>
                            <TableHead className="w-24">Peso %</TableHead>
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {macro.scopes.map((scope, scopeIndex) => (
                            <TableRow key={scopeIndex}>
                              <TableCell>
                                {editingScopeIndex?.macroIndex === macroIndex && editingScopeIndex?.scopeIndex === scopeIndex ? (
                                  <Input
                                    value={scope.name}
                                    onChange={(e) => updateScope(macroIndex, scopeIndex, 'name', e.target.value)}
                                    onBlur={() => setEditingScopeIndex(null)}
                                    onKeyDown={(e) => e.key === 'Enter' && setEditingScopeIndex(null)}
                                    className="h-7"
                                    autoFocus
                                  />
                                ) : (
                                  <span 
                                    className="cursor-pointer hover:text-primary"
                                    onClick={() => setEditingScopeIndex({ macroIndex, scopeIndex })}
                                  >
                                    {scope.name}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={scope.weight}
                                  onChange={(e) => updateScope(macroIndex, scopeIndex, 'weight', parseFloat(e.target.value) || 0)}
                                  className="h-7 w-20"
                                  step="0.1"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => removeScope(macroIndex, scopeIndex)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex-shrink-0 mt-4">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Voltar
              </Button>
              <Button onClick={handleImport} disabled={isImporting || extractedMacros.length === 0}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" />
                {mode === 'weights' ? 'Aplicar Pesos' : 'Importar Etapas'}
              </Button>
            </>
          )}
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
