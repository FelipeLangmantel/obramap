import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CloudRain } from "lucide-react";
import { fetchClimaHoje } from "@/lib/geocode";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lat: number | null;
  lng: number | null;
  currentMm: number | null;
  onConfirm: (mm: number) => Promise<void> | void;
}

/**
 * Confirmação de pluviometria antes de enviar o RDO para aprovação.
 *
 * Engenharia de planejamento exige fechamento do índice pluviométrico do dia
 * para análise futura de produtividade x clima. O sistema oferece o valor
 * automático da API Open-Meteo (referência oficial gratuita) e permite que o
 * residente substitua pelo medido no canteiro (pluviômetro físico).
 */
export function ConfirmRainDialog({
  open, onOpenChange, lat, lng, currentMm, onConfirm,
}: Props) {
  const [apiMm, setApiMm] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<number>(currentMm ?? 0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(currentMm ?? 0);
    if (lat == null || lng == null) return;
    setLoading(true);
    fetchClimaHoje(lat, lng)
      .then(c => {
        if (c) {
          setApiMm(Number(c.mm_chuva ?? 0));
          // Se o usuário ainda não preencheu manualmente, pré-seleciona API
          if (currentMm == null) setChosen(Number(c.mm_chuva ?? 0));
        }
      })
      .finally(() => setLoading(false));
  }, [open, lat, lng, currentMm]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(chosen);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-blue-600" />
            Confirmar índice pluviométrico
          </AlertDialogTitle>
          <AlertDialogDescription>
            Antes de enviar o diário para aprovação, confirme o volume de chuva
            registrado para a obra hoje. Esse dado é usado nos relatórios de
            dias praticáveis e produtividade x clima.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Open-Meteo (API oficial):</span>
              <span className="font-semibold">
                {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> :
                  apiMm == null ? "indisponível" : `${apiMm.toFixed(1)} mm`}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mm-confirm" className="text-sm">
              Valor a registrar (mm)
            </Label>
            <Input
              id="mm-confirm"
              type="number"
              min={0}
              step={0.1}
              value={chosen}
              onChange={e => setChosen(Number(e.target.value || 0))}
            />
            <p className="text-xs text-muted-foreground">
              Edite caso a leitura do pluviômetro do canteiro seja diferente.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar e enviar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
