import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Printer, FileText, Building2 } from "lucide-react";
import { generateDiarioPDF, DEFAULT_PDF_CONFIG, type DiarioPDFConfig, type DiarioPDFData } from "./generateDiarioPDF";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PdfTemplate = "orgao_publico" | "corporativo_moderno";

interface PrintDiarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildData: () => Promise<DiarioPDFData | null>;
}

const SECTIONS: { key: keyof DiarioPDFConfig; label: string; description: string }[] = [
  { key: "showLogo", label: "Logo da empresa/projeto", description: "Inclui o logo no cabeçalho" },
  { key: "showHeader", label: "Cabeçalho (obra, data, responsável)", description: "Identificação da obra e do dia" },
  { key: "showWeather", label: "Clima", description: "Condição do tempo do dia" },
  { key: "showTeam", label: "Mão de obra presente", description: "Quantidade de colaboradores" },
  { key: "showServices", label: "Serviços lançados", description: "Lista detalhada dos lançamentos" },
  { key: "showObservations", label: "Observações gerais", description: "Texto livre do dia" },
  { key: "showCorrections", label: "Correções aplicadas", description: "Histórico de ajustes do coordenador" },
  { key: "showPhotos", label: "Fotos do dia", description: "Galeria de fotos enviadas" },
  { key: "showSignatures", label: "Linhas de assinatura", description: "Espaço para assinatura no rodapé" },
];

export function PrintDiarioDialog({ open, onOpenChange, buildData }: PrintDiarioDialogProps) {
  const [config, setConfig] = useState<DiarioPDFConfig>(DEFAULT_PDF_CONFIG);
  const [template, setTemplate] = useState<PdfTemplate | null>(null);
  const [generating, setGenerating] = useState(false);

  const toggle = (key: keyof DiarioPDFConfig) =>
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await buildData();
      if (!data) {
        toast.error("Não foi possível carregar os dados do diário.");
        return;
      }
      // Override template if user picked one in this dialog session
      const finalData: DiarioPDFData = template && data.legal
        ? { ...data, legal: { ...data.legal, pdf_template: template } }
        : data;
      await generateDiarioPDF(finalData, config);
      toast.success("PDF gerado com sucesso.");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err?.message || ""));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Imprimir Diário do Dia
          </DialogTitle>
          <DialogDescription>
            Selecione as seções que devem aparecer no PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
          {/* Template selector — sobrescreve a escolha por obra apenas neste PDF */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Template do PDF (opcional — usa o padrão da obra se não escolher)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTemplate(t => t === "orgao_publico" ? null : "orgao_publico")}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center",
                  template === "orgao_publico"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <FileText className="h-6 w-6 text-slate-700" />
                <div className="text-xs font-semibold leading-tight">Órgão Público</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  Formal, jurídico, fonte serifada
                </div>
              </button>
              <button
                type="button"
                onClick={() => setTemplate(t => t === "corporativo_moderno" ? null : "corporativo_moderno")}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center",
                  template === "corporativo_moderno"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <Building2 className="h-6 w-6 text-blue-700" />
                <div className="text-xs font-semibold leading-tight">Corporativo Moderno</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  Limpo, sans-serif, identidade visual
                </div>
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Seções do PDF</div>
          </div>

          {SECTIONS.map(s => (
            <label
              key={s.key}
              className="flex items-start gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={config[s.key]}
                onCheckedChange={() => toggle(s.key)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.description}</div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando...</>
              : <><Printer className="h-4 w-4 mr-2" /> Gerar PDF</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
