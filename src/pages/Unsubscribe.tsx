import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid"; message: string }
  | { kind: "submitting" }
  | { kind: "done" };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid", message: "Link inválido (token ausente)." });
      return;
    }
    (async () => {
      try {
        const resp = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setState({ kind: "invalid", message: json?.error || "Token inválido ou expirado." });
        } else if (json?.valid === false && json?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
        } else if (json?.valid) {
          setState({ kind: "valid" });
        } else {
          setState({ kind: "invalid", message: "Não foi possível validar o link." });
        }
      } catch {
        setState({ kind: "invalid", message: "Falha de conexão. Tente novamente." });
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState({ kind: "submitting" });
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", {
      body: { token },
    });
    if (error || (data as any)?.error) {
      setState({ kind: "invalid", message: (data as any)?.error || error?.message || "Erro ao processar." });
      return;
    }
    setState({ kind: "done" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MailX className="h-5 w-5 text-primary" />
            <CardTitle>Cancelar avisos por email</CardTitle>
          </div>
          <CardDescription>
            ObraMap — preferências de comunicação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando link...
            </div>
          )}

          {state.kind === "valid" && (
            <>
              <p className="text-sm">
                Confirme abaixo para parar de receber avisos por email do ObraMap.
                Você ainda continuará vendo as notificações dentro do aplicativo.
              </p>
              <Button className="w-full" onClick={confirm}>
                Confirmar cancelamento
              </Button>
            </>
          )}

          {state.kind === "submitting" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </div>
          )}

          {state.kind === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Avisos por email cancelados</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Você não receberá mais emails de notificação. Para reativar, fale com o administrador da sua empresa.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Voltar ao aplicativo</Link>
              </Button>
            </div>
          )}

          {state.kind === "already" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Você já havia cancelado</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Este email já está cancelado para avisos do ObraMap.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Voltar ao aplicativo</Link>
              </Button>
            </div>
          )}

          {state.kind === "invalid" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Link inválido</span>
              </div>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Voltar ao aplicativo</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
