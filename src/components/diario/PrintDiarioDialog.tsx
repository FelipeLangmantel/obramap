import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Printer } from "lucide-react";
import { generateDiarioPDF, DEFAULT_PDF_CONFIG, type DiarioPDFConfig, type DiarioPDFData } from "./generateDiarioPDF";
import { toast } from "sonner";

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
      await generateDiarioPDF(data, config);
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

        <div className="space-y-3 max-h-[55vh] overflow-y-auto py-2">
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
