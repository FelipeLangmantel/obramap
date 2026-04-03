import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen } from "lucide-react";

const ONBOARDING_CONTENT: Record<string, { title: string; steps: string[] }> = {
  cadastro_obra: {
    title: "Como funciona o Cadastro de Obra",
    steps: [
      "Preencha todos os campos obrigatórios marcados com *",
      "Se a obra já possui medições anteriores ao sistema, informe o valor já faturado",
      "Após salvar, confirme os dados pois somente o Admin poderá editar depois",
      "Configure os documentos obrigatórios da obra após o cadastro",
    ],
  },
  lancamento_medicao: {
    title: "Como funciona o Lançamento de Medição",
    steps: [
      "Toda medição começa como Prevista — informe o número, mês/ano, data prevista e valor previsto",
      "Quando enviar ao fiscal, registre a Data de Envio e o Valor Realizado",
      "Após análise do fiscal, registre a Data de Aprovação e o Valor Acatado",
      "Somente após o acatamento, informe o número de NF e a data de pagamento",
    ],
  },
  lancamento_despesa: {
    title: "Como funciona o Lançamento de Despesa",
    steps: [
      "Informe o mês e ano de referência da despesa",
      "Classifique o tipo de despesa corretamente",
      "O status indica se a despesa está prevista, em andamento ou fechada",
    ],
  },
};

interface OnboardingDialogProps {
  actionKey: string;
  open: boolean;
  onComplete: () => void;
}

export function OnboardingDialog({ actionKey, open, onComplete }: OnboardingDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const content = ONBOARDING_CONTENT[actionKey];

  if (!content) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && understood) onComplete(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {content.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {content.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                {i + 1}
              </span>
              <p className="text-sm text-foreground leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Checkbox
            id="onboarding-check"
            checked={understood}
            onCheckedChange={(v) => setUnderstood(!!v)}
          />
          <label htmlFor="onboarding-check" className="text-sm text-muted-foreground cursor-pointer">
            Entendi como funciona
          </label>
        </div>
        <DialogFooter>
          <Button onClick={onComplete} disabled={!understood}>
            Prosseguir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
