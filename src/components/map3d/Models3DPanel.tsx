import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Box, RefreshCw, Search, Loader2, ShieldAlert, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Models3DPanelProps {
  projectId: string;
}

interface ModelFile {
  id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  model_type: string;
  status: string;
  preserved: boolean;
  imported_at: string;
  replaced_at: string | null;
  notes: string | null;
}

interface OrphanRow {
  storage_path: string;
  file_size: number | null;
  created_at: string;
  age_days: number;
  reason: string;
  would_delete: boolean;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  replaced: { label: "Substituído", variant: "secondary" },
  preserved: { label: "Preservado", variant: "outline" },
  orphan_pending_delete: { label: "Órfão", variant: "destructive" },
  upload_failed: { label: "Falha upload", variant: "destructive" },
};

export function Models3DPanel({ projectId }: Models3DPanelProps) {
  const { canEdit } = useAuth();
  const [models, setModels] = useState<ModelFile[]>([]);
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preservingId, setPreservingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_3d_model_files", { _project_id: projectId });
    if (error) {
      toast.error("Erro ao carregar modelos 3D: " + error.message);
    } else {
      setModels((data ?? []) as ModelFile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const runDryRun = async () => {
    setAuditing(true);
    const { data, error } = await supabase.rpc("audit_3d_orphans_dry_run", { _project_id: projectId });
    if (error) {
      toast.error("Erro na auditoria: " + error.message);
    } else {
      setOrphans((data ?? []) as OrphanRow[]);
      const wouldDelete = (data ?? []).filter((r: OrphanRow) => r.would_delete).length;
      toast.success(`Auditoria concluída — ${wouldDelete} candidato(s) a remoção (nada foi apagado)`);
    }
    setAuditing(false);
  };

  const markAsPreserved = async (model: ModelFile) => {
    if (!canEdit) {
      toast.error("Sem permissao para preservar modelo 3D.");
      return;
    }
    setPreservingId(model.id);
    try {
      const payload = model.status === "active"
        ? { preserved: true, notes: model.notes ?? "Modelo ativo marcado como preservado." }
        : { preserved: true, status: "preserved", notes: model.notes ?? "Modelo antigo marcado como preservado." };
      const { error } = await supabase
        .from("map_3d_model_files" as any)
        .update(payload)
        .eq("id", model.id)
        .eq("project_id", projectId);
      if (error) throw error;
      toast.success("Modelo 3D marcado como preservado.");
      await load();
    } catch (error) {
      console.error("[Models3DPanel] preserve model error", error);
      toast.error("Erro ao marcar modelo como preservado.");
    } finally {
      setPreservingId(null);
    }
  };

  const resetModelLinks = async () => {
    if (!canEdit) {
      toast.error("Sem permissao para resetar vinculos 3D.");
      return;
    }
    setResetting(true);
    try {
      const assignments = await supabase
        .from("map_mesh_house_assignments" as any)
        .delete()
        .eq("project_id", projectId);
      if (assignments.error) throw assignments.error;

      const layerLinks = await supabase
        .from("map_layer_stage_links" as any)
        .delete()
        .eq("project_id", projectId);
      if (layerLinks.error) throw layerLinks.error;

      const meshes = await supabase
        .from("project_model_meshes" as any)
        .delete()
        .eq("project_id", projectId);
      if (meshes.error) throw meshes.error;

      toast.success("Vinculos do modelo 3D resetados. O GLB nao foi apagado.");
      setResetOpen(false);
    } catch (error) {
      console.error("[Models3DPanel] reset links error", error);
      toast.error("Erro ao resetar vinculos do modelo 3D.");
    } finally {
      setResetting(false);
    }
  };

  const totalCandidates = orphans?.filter((o) => o.would_delete) ?? [];
  const totalCandidateBytes = totalCandidates.reduce((s, o) => s + (o.file_size ?? 0), 0);

  return (
    <div className="min-h-0 space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          Modo somente leitura. Esta aba lista os modelos 3D do projeto e permite uma auditoria
          em modo simulação. <strong>Nenhum arquivo é apagado nesta fase.</strong>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Modelos 3D do projeto</h3>
          <Badge variant="outline">{models.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {canEdit && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <RotateCcw className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>
              Para refazer vinculos apos substituir o GLB, use a acao separada abaixo.
              Ela limpa inventario e vinculos do projeto, mas nao apaga arquivos do Storage.
            </span>
            <Button size="sm" variant="outline" className="shrink-0 gap-2" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-4 w-4" />
              Resetar vinculos do modelo
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[320px]">Arquivo</TableHead>
              <TableHead className="min-w-[150px]">Status</TableHead>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead className="w-28">Tamanho</TableHead>
              <TableHead className="w-36">Importado em</TableHead>
              <TableHead className="w-48 text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum modelo 3D registrado para este projeto.
                </TableCell>
              </TableRow>
            )}
            {models.map((m) => {
              const s = STATUS_LABEL[m.status] ?? { label: m.status, variant: "outline" as const };
              return (
                <TableRow key={m.id}>
                  <TableCell className="max-w-[360px]" title={m.file_name}>
                    <span className="block truncate font-mono text-xs">{m.file_name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {m.preserved && (
                      <Badge variant="outline" className="ml-1">
                        preservado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{m.model_type}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatSize(m.file_size)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(m.imported_at)}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && !m.preserved ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 whitespace-nowrap"
                        disabled={preservingId === m.id}
                        onClick={() => markAsPreserved(m)}
                      >
                        {preservingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        Preservar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Search className="h-4 w-4" /> Auditoria de órfãos (simulação)
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Lista arquivos do armazenamento deste projeto que seriam candidatos a remoção.
              Não apaga nada.
            </p>
          </div>
          <Button size="sm" onClick={runDryRun} disabled={auditing} className="gap-2">
            {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Executar dry-run
          </Button>
        </div>

        {orphans && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {orphans.length} arquivo(s) no bucket • {totalCandidates.length} candidato(s) a remoção •{" "}
              {formatSize(totalCandidateBytes)} a recuperar
            </div>
            <div className="max-h-[42vh] overflow-auto rounded border bg-background">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[560px]">Caminho</TableHead>
                    <TableHead className="w-28">Tamanho</TableHead>
                    <TableHead className="w-20">Idade</TableHead>
                    <TableHead className="min-w-[220px]">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphans.map((o) => (
                    <TableRow key={o.storage_path} className={o.would_delete ? "bg-destructive/5" : ""}>
                      <TableCell className="max-w-[640px]" title={o.storage_path}>
                        <span className="block truncate font-mono text-[10px] leading-5">{o.storage_path}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{formatSize(o.file_size)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{o.age_days}d</TableCell>
                      <TableCell className="max-w-[260px]">
                        <Badge variant={o.would_delete ? "destructive" : "secondary"} className="max-w-full truncate text-[10px]" title={o.reason}>
                          {o.reason}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar vinculos do modelo 3D?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao vai limpar o inventario e os vinculos do modelo 3D desta obra para permitir
              refazer os vinculos no novo modelo. O arquivo GLB nao sera apagado. Dados de Producao,
              Diario, Planejamento e Relatorios nao serao alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={resetting} onClick={resetModelLinks}>
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar reset dos vinculos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
