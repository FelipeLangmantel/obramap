import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { PenLine } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SignatureCanvasDialog } from "./SignatureCanvasDialog";

export type StatusAprovacao = "preenchendo" | "revisando" | "aprovado" | "solicitando_edicao";

interface SignatureRow {
  id: string;
  slot: number;
  signature_data: string;
  assinado_por_nome: string | null;
  created_at: string;
  url?: string;
}

interface Props {
  entryId: string | null;
  companyId: string | null;
  status: StatusAprovacao;
  onStatusChange: (s: StatusAprovacao) => void;
  canApprove: boolean;
  signerId: string | null;
  signerName: string | null;
  isLocked: boolean;
}

export function RdoApprovalSection({
  entryId, companyId, status, signerId, signerName, isLocked,
}: Props) {
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [openSlot, setOpenSlot] = useState<1 | 2 | null>(null);

  const loadSignatures = async () => {
    if (!entryId) { setSignatures([]); return; }
    const { data } = await supabase
      .from("diary_signatures" as any)
      .select("id, slot, signature_data, assinado_por_nome, created_at")
      .eq("diary_entry_id", entryId)
      .order("slot");
    if (!data) { setSignatures([]); return; }
    const withUrls = await Promise.all(
      (data as any[]).map(async (s) => {
        const { data: signed } = await supabase.storage
          .from("diary-signatures")
          .createSignedUrl(s.signature_data, 60 * 60);
        return { ...s, url: signed?.signedUrl || "" } as SignatureRow;
      })
    );
    setSignatures(withUrls);
  };

  useEffect(() => { loadSignatures(); }, [entryId]);

  const slot1 = signatures.find(s => s.slot === 1);
  const slot2 = signatures.find(s => s.slot === 2);

  const statusBadge = () => {
    if (status === "aprovado") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">✅ Aprovado</Badge>;
    if (status === "revisando") return <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">🔍 Em revisão</Badge>;
    if (status === "solicitando_edicao") return <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">⏳ Edição solicitada</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">📝 Preenchendo</Badge>;
  };

  return (
    <section id="aprovacao" className="scroll-mt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 flex items-center justify-between">
            <span>Aprovação e assinaturas</span>
            {statusBadge()}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            O fluxo de aprovação é controlado pelos botões do cabeçalho (Enviar p/ aprovação) e pelo fechamento da semana no painel do coordenador.
          </p>

          {/* Assinaturas */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Assinatura manual</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([1, 2] as const).map(slot => {
                const sig = slot === 1 ? slot1 : slot2;
                const titulo = slot === 1 ? "Engenheiro Responsável" : "Fiscal / Contratante";
                return (
                  <div key={slot} className="border rounded-lg p-3 bg-card">
                    <div className="h-24 border-b mb-2 flex items-center justify-center bg-white rounded">
                      {sig?.url ? (
                        <img src={sig.url} alt="Assinatura" className="max-h-full object-contain" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem assinatura</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs min-w-0 flex-1">
                        <p className="font-semibold truncate">{titulo}</p>
                        {sig && (
                          <p className="text-muted-foreground truncate">
                            {sig.assinado_por_nome || "—"} · {format(new Date(sig.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                      {!isLocked && entryId && companyId && (
                        <Button size="sm" variant="outline" onClick={() => setOpenSlot(slot)}>
                          <PenLine className="h-3.5 w-3.5 mr-1" />
                          {sig ? "Refazer" : "Assinar"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {openSlot && entryId && companyId && (
        <SignatureCanvasDialog
          open={openSlot !== null}
          onOpenChange={(o) => { if (!o) setOpenSlot(null); }}
          entryId={entryId}
          companyId={companyId}
          slot={openSlot}
          signerId={signerId}
          signerName={signerName}
          onSaved={loadSignatures}
        />
      )}
    </section>
  );
}
