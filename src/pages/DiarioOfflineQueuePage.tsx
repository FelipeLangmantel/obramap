import { useLiveQuery } from "dexie-react-hooks";
import { offlineDB, estimateStorageUsage, requestPersistentStorage } from "@/offline/db";
import { runSync } from "@/offline/sync";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/offline/media";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, FileImage, FileVideo, FileText, Trash2, RefreshCcw, HardDrive, Database } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DiarioOfflineQueueView() {
  const { online, syncing, triggerSync } = useOfflineStatus();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const entries = useLiveQuery(() =>
    offlineDB.diary_entries.orderBy("created_at").reverse().toArray(), [], []);
  const items = useLiveQuery(() => offlineDB.diary_items.toArray(), [], []);
  const productions = useLiveQuery(() => offlineDB.productions.toArray(), [], []);
  const medias = useLiveQuery(() => offlineDB.media.toArray(), [], []);

  useEffect(() => {
    void estimateStorageUsage().then(setStorage);
    if (navigator.storage?.persisted) navigator.storage.persisted().then(setPersisted);
  }, [entries?.length, medias?.length]);

  const totalPending =
    (entries?.filter(e => e.status !== "synced").length || 0) +
    (items?.filter(i => i.status !== "synced").length || 0) +
    (productions?.filter(p => p.status !== "synced").length || 0) +
    (medias?.filter(m => m.status !== "synced").length || 0);

  const totalSynced =
    (entries?.filter(e => e.status === "synced").length || 0) +
    (items?.filter(i => i.status === "synced").length || 0) +
    (productions?.filter(p => p.status === "synced").length || 0) +
    (medias?.filter(m => m.status === "synced").length || 0);

  const usagePct = storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;

  const handleClearSynced = async () => {
    await Promise.all([
      offlineDB.diary_entries.where("status").equals("synced").delete(),
      offlineDB.diary_items.where("status").equals("synced").delete(),
      offlineDB.productions.where("status").equals("synced").delete(),
      offlineDB.media.where("status").equals("synced").delete(),
    ]);
    toast.success("Lançamentos já enviados foram limpos do celular.");
  };

  const handleRequestPersist = async () => {
    const ok = await requestPersistentStorage();
    setPersisted(ok);
    toast[ok ? "success" : "error"](
      ok ? "Storage protegido contra limpeza automática." : "Browser não permitiu storage persistente."
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fila Offline</h1>
        <p className="text-sm text-muted-foreground">
          Lançamentos do Diário feitos sem internet ficam aqui até serem enviados.
        </p>
      </div>

      {/* Status geral */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${online ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
              {online ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Conexão</div>
              <div className="font-semibold">{online ? "Online" : "Offline"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pendentes</div>
              <div className="font-semibold">{totalPending}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Já enviados</div>
              <div className="font-semibold">{totalSynced}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HardDrive className="h-4 w-4" />Armazenamento do dispositivo
          </CardTitle>
          <CardDescription>
            Quanto do espaço do navegador o ObraMap está usando.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {storage ? (
            <>
              <Progress value={usagePct} className="h-2" />
              <div className="text-sm text-muted-foreground flex justify-between">
                <span>{formatBytes(storage.usage)} usados</span>
                <span>{formatBytes(storage.quota)} totais</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Browser não expõe métricas de storage.</p>
          )}
          {persisted === false && (
            <Button size="sm" variant="outline" onClick={handleRequestPersist}>
              Proteger contra limpeza automática
            </Button>
          )}
          {persisted === true && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />Storage persistente ativo
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Ações */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={triggerSync} disabled={!online || syncing || totalPending === 0}>
          {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
          Enviar agora
        </Button>
        <Button variant="outline" onClick={handleClearSynced} disabled={totalSynced === 0}>
          <Trash2 className="h-4 w-4 mr-2" />
          Limpar enviados ({totalSynced})
        </Button>
      </div>

      {/* Lista de entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lançamentos do Diário</CardTitle>
        </CardHeader>
        <CardContent>
          {(entries || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum lançamento pendente. Tudo sincronizado.
            </p>
          ) : (
            <div className="space-y-2">
              {entries!.map((e) => {
                const itemsOfEntry = (items || []).filter(i => i.diary_entry_client_uuid === e.client_uuid);
                const prodsOfEntry = (productions || []).filter(p => p.diary_entry_client_uuid === e.client_uuid);
                const mediaOfEntry = (medias || []).filter(m => m.diary_entry_client_uuid === e.client_uuid);
                const photos = mediaOfEntry.filter(m => m.tipo === "foto").length;
                const vids = mediaOfEntry.filter(m => m.tipo === "video").length;
                const atts = mediaOfEntry.filter(m => m.tipo === "anexo").length;
                return (
                  <div key={e.client_uuid} className="border rounded-lg p-3 flex items-start gap-3">
                    <StatusIcon status={e.status} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        Diário de {format(new Date(e.data + "T12:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Criado {format(new Date(e.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs">
                        {itemsOfEntry.length > 0 && <Badge variant="outline">{itemsOfEntry.length} item(s)</Badge>}
                        {prodsOfEntry.length > 0 && <Badge variant="outline">{prodsOfEntry.length} produção(ões)</Badge>}
                        {photos > 0 && <Badge variant="outline" className="gap-1"><FileImage className="h-3 w-3" />{photos}</Badge>}
                        {vids > 0 && <Badge variant="outline" className="gap-1"><FileVideo className="h-3 w-3" />{vids}</Badge>}
                        {atts > 0 && <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" />{atts}</Badge>}
                      </div>
                      {e.last_error && (
                        <div className="text-xs text-destructive mt-2">
                          Erro: {e.last_error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "synced") return <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />;
  if (status === "syncing") return <Loader2 className="h-5 w-5 text-primary mt-0.5 animate-spin" />;
  if (status === "error") return <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />;
  return <Database className="h-5 w-5 text-muted-foreground mt-0.5" />;
}
