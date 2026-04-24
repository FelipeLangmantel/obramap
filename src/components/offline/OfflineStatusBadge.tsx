import { Wifi, WifiOff, CloudUpload, AlertCircle, Loader2 } from "lucide-react";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  className?: string;
  compact?: boolean;
}

// Badge fixo que mostra o status da conexão e da fila de sincronização.
// Aparece em todas as telas — o usuário sabe a qualquer momento se há
// lançamentos esperando para subir ao servidor.
export function OfflineStatusBadge({ className, compact }: Props) {
  const { online, syncing, pending, progress, triggerSync } = useOfflineStatus();

  let icon = <Wifi className="h-3.5 w-3.5" />;
  let label = "Online";
  let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
  let tooltipText = "Conectado. Lançamentos vão direto para o servidor.";

  if (!online) {
    icon = <WifiOff className="h-3.5 w-3.5" />;
    label = pending > 0 ? `Offline · ${pending} pendente${pending > 1 ? "s" : ""}` : "Offline";
    variant = "destructive";
    tooltipText = "Sem internet. Lançamentos ficam salvos no celular e sobem automaticamente quando voltar.";
  } else if (syncing) {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    label = progress ? `Enviando ${progress.done}/${progress.total}` : "Sincronizando...";
    variant = "default";
    tooltipText = "Sincronizando lançamentos pendentes.";
  } else if (pending > 0) {
    icon = <CloudUpload className="h-3.5 w-3.5" />;
    label = `${pending} pendente${pending > 1 ? "s" : ""}`;
    variant = "secondary";
    tooltipText = "Há lançamentos aguardando sincronização. Toque para enviar agora.";
  }

  const content = (
    <Badge
      variant={variant}
      className={cn("gap-1 cursor-pointer select-none", className)}
      onClick={() => online && pending > 0 && !syncing && triggerSync()}
    >
      {icon}
      {!compact && <span className="text-xs">{label}</span>}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        {tooltipText}
        {pending > 0 && (
          <div className="mt-1">
            <Link to="/diario-fila-offline" className="underline">
              Ver fila de envios
            </Link>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Banner fullwidth para a parte superior do Diário quando offline
export function OfflineBanner() {
  const { online, pending, syncing, triggerSync } = useOfflineStatus();
  if (online && pending === 0 && !syncing) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-sm border-b",
        !online && "bg-destructive/10 border-destructive/30 text-destructive",
        online && pending > 0 && !syncing && "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
        syncing && "bg-primary/10 border-primary/30 text-primary"
      )}
    >
      {!online && <WifiOff className="h-4 w-4" />}
      {online && pending > 0 && !syncing && <CloudUpload className="h-4 w-4" />}
      {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
      <span className="flex-1">
        {!online && `Sem conexão · ${pending} lançamento(s) salvo(s) no celular`}
        {online && pending > 0 && !syncing && `${pending} lançamento(s) aguardando envio`}
        {syncing && "Enviando ao servidor..."}
      </span>
      {online && pending > 0 && !syncing && (
        <Button size="sm" variant="ghost" onClick={triggerSync} className="h-7">
          Enviar agora
        </Button>
      )}
    </div>
  );
}
