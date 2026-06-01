import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Box, RefreshCw, Search, Loader2, ShieldAlert, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
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

const REQUIRED_CONFIRMATION = "EXCLUIR MODELOS 3D";
const REQUIRED_RECENT_CONFIRMATION = "EXCLUIR MODELOS 3D RECENTES";

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
  deleted: { label: "Excluído", variant: "secondary" },
};

export function Models3DPanel({ projectId }: Models3DPanelProps) {
  const { canEdit, isCompanyAdmin } = useAuth();
  const [models, setModels] = useState<ModelFile[]>([]);
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [preservingId, setPreservingId] = useState<string | null>(null);
  const [allowRecentSelection, setAllowRecentSelection] = useState(false);

  // Seleção/exclusão
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_3d_model_files", { _project_id: projectId });
    if (error) toast.error("Erro ao carregar modelos 3D: " + error.message);
    else setModels((data ?? []) as ModelFile[]);
    setLoading(false);
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const runDryRun = async () => {
    setAuditing(true);
    setSelected(new Set());
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
    if (!canEdit) return toast.error("Sem permissão para preservar modelo 3D.");
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
    } catch (e) {
      console.error("[Models3DPanel] preserve model error", e);
      toast.error("Erro ao marcar modelo como preservado.");
    } finally {
      setPreservingId(null);
    }
  };

  const resetModelLinks = async () => {
    if (!isCompanyAdmin) return toast.error("Apenas administrador da empresa pode resetar vínculos 3D.");
    setResetting(true);
    try {
      const { error } = await (supabase as any).rpc("reset_3d_model_links_for_project", {
        _project_id: projectId,
      });
      if (error) throw error;
      toast.success("Vínculos do modelo 3D resetados. O GLB não foi apagado.");
      setResetOpen(false);
    } catch (e) {
      console.error("[Models3DPanel] reset links error", e);
      toast.error("Erro ao resetar vínculos do modelo 3D.");
    } finally {
      setResetting(false);
    }
  };

  // --- seleção controlada (would_delete=true; recentes apenas com admin + toggle) ---
  const isRecentBlocked = (row: OrphanRow) =>
    row.reason === "too_recent(<7d)" || row.reason === "too_recent_lt_7d";

  const isOutOfScopePath = (row: OrphanRow) =>
    /\/ifc\//.test(row.storage_path) ||
    (!/\/gltf\//.test(row.storage_path) && !/\/gltf-parts\//.test(row.storage_path));

  const canSelectRow = (row: OrphanRow) => {
    if (!canEdit) return false;
    if (isOutOfScopePath(row)) return false; // /ifc/ e outros fora de escopo nunca selecionáveis
    if (row.would_delete) return true;
    return isCompanyAdmin && allowRecentSelection && isRecentBlocked(row);
  };

  const selectableSet = useMemo(
    () => new Set((orphans ?? []).filter(canSelectRow).map((o) => o.storage_path)),
    [orphans, canEdit, isCompanyAdmin, allowRecentSelection],
  );

  const toggleOne = (path: string) => {
    if (!selectableSet.has(path)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const selectedRows = useMemo(
    () => (orphans ?? []).filter((o) => selected.has(o.storage_path)),
    [orphans, selected],
  );
  const selectedRecentRows = useMemo(
    () => selectedRows.filter(isRecentBlocked),
    [selectedRows],
  );
  const selectedBytes = selectedRows.reduce((s, r) => s + (r.file_size ?? 0), 0);
  const requiredConfirmation = selectedRecentRows.length > 0
    ? REQUIRED_RECENT_CONFIRMATION
    : REQUIRED_CONFIRMATION;

  const setRecentSelectionEnabled = (enabled: boolean) => {
    if (!isCompanyAdmin) return;
    setAllowRecentSelection(enabled);
    if (!enabled) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const row of orphans ?? []) {
          if (isRecentBlocked(row)) next.delete(row.storage_path);
        }
        return next;
      });
    }
  };

  const openConfirm = () => {
    if (!canEdit) return;
    if (selected.size === 0) return toast.error("Selecione ao menos 1 arquivo.");
    if (selectedRecentRows.length > 0 && !isCompanyAdmin) {
      return toast.error("Apenas administrador da empresa pode excluir arquivos recentes.");
    }
    setConfirmText("");
    setDeleteReason("");
    setConfirmOpen(true);
  };

  const confirmDisabled = confirmText !== requiredConfirmation || deleting;

  const executeDelete = async () => {
    if (confirmText !== requiredConfirmation) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-3d-model-files", {
        body: {
          project_id: projectId,
          paths: Array.from(selected),
          delete_reason: deleteReason || "Exclusão manual via aba Modelos 3D",
          confirmation_text: confirmText,
          allow_recent_delete: selectedRecentRows.length > 0,
        },
      });
      if (error) {
        // Tenta extrair JSON de erro da Edge Function
        let serverError: string | null = null;
        const ctx: any = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            serverError = body?.error || body?.detail || null;
          } catch { /* ignore */ }
        }
        const status: number | undefined = ctx?.status;
        const rawMsg = (error as any)?.message ?? "";
        const isNetworkFailure =
          /Failed to send a request/i.test(rawMsg) ||
          /Failed to fetch/i.test(rawMsg) ||
          /NetworkError/i.test(rawMsg);

        let friendly = serverError || rawMsg || "erro desconhecido";
        if (isNetworkFailure && !serverError) {
          friendly = "Edge Function não respondeu (verifique se 'delete-3d-model-files' está publicada e se há conexão).";
        } else if (status === 401) friendly = "Sessão expirada — faça login novamente.";
        else if (status === 403) friendly = serverError || "Sem permissão para esta exclusão.";
        else if (status === 404) friendly = "Função 'delete-3d-model-files' não encontrada (não publicada).";
        else if (serverError === "confirmation_mismatch") friendly = "Texto de confirmação incorreto.";
        else if (serverError === "no_paths_selected") friendly = "Nenhum arquivo selecionado.";
        else if (serverError === "too_many_paths_max_200") friendly = "Selecione no máximo 200 arquivos por vez.";
        else if (serverError === "validation_failed") friendly = "Erro de validação no backend antes de remover do Storage.";
        else if (serverError === "storage_remove_failed") friendly = "Erro ao remover arquivos do Storage.";
        else if (serverError === "project_not_found_or_no_company") friendly = "Projeto não encontrado ou sem empresa.";

        throw new Error(friendly);
      }
      const result = data as { deleted: any[]; blocked: any[]; total_bytes_removed: number };
      toast.success(
        `Exclusão concluída — ${result.deleted?.length ?? 0} removido(s), ${
          result.blocked?.length ?? 0
        } bloqueado(s). ${formatSize(result.total_bytes_removed ?? 0)} recuperado(s).`,
      );
      setConfirmOpen(false);
      setSelected(new Set());
      await Promise.all([load(), runDryRun()]);
    } catch (e: any) {
      console.error("[Models3DPanel] delete error", e);
      toast.error("Falha ao excluir: " + (e?.message ?? "erro desconhecido"));
    } finally {
      setDeleting(false);
    }
  };

  const totalCandidates = orphans?.filter((o) => o.would_delete) ?? [];
  const totalCandidateBytes = totalCandidates.reduce((s, o) => s + (o.file_size ?? 0), 0);
  const recentBlockedRows = orphans?.filter(isRecentBlocked) ?? [];

  return (
    <div className="min-h-0 space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          Esta aba lista os modelos 3D do projeto. A exclusão só é permitida para arquivos
          marcados como candidatos pelo dry-run e exige confirmação digitada.
          <strong> Modelos ativos, preservados e partes complementares nunca podem ser excluídos.</strong>
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

      {isCompanyAdmin && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100">
          <RotateCcw className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>
              Para refazer vínculos após substituir o GLB, use a ação separada abaixo. Ela limpa
              inventário e vínculos do projeto, mas não apaga arquivos do Storage.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-2 border-amber-500 bg-amber-100 text-amber-950 shadow-sm hover:bg-amber-200 focus-visible:ring-amber-500 disabled:opacity-60 dark:border-amber-300 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
              Resetar vínculos do modelo
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
              <TableHead className="w-48 text-right">Ações</TableHead>
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
                    {m.preserved && <Badge variant="outline" className="ml-1">preservado</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{m.model_type}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatSize(m.file_size)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(m.imported_at)}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && !m.preserved && m.status !== "deleted" ? (
                      <Button
                        size="sm" variant="outline" className="h-8 gap-1 whitespace-nowrap"
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
              <Search className="h-4 w-4" /> Auditoria de órfãos
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Lista arquivos do bucket deste projeto. O dry-run não apaga nada. A exclusão real
              exige seleção manual + confirmação digitada e é validada novamente no backend.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={runDryRun} disabled={auditing} className="gap-2">
              {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Executar dry-run
            </Button>
            {canEdit && (
              <Button
                size="sm" variant="destructive" className="gap-2"
                disabled={selected.size === 0 || deleting}
                onClick={openConfirm}
              >
                <Trash2 className="h-4 w-4" />
                Excluir selecionados ({selected.size})
              </Button>
            )}
          </div>
        </div>

        {isCompanyAdmin && orphans && recentBlockedRows.length > 0 && (
          <Alert className="border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/60 dark:bg-destructive/15">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="space-y-3">
              <label className="flex items-start gap-3 text-sm font-medium">
                <Checkbox
                  checked={allowRecentSelection}
                  onCheckedChange={(checked) => setRecentSelectionEnabled(checked === true)}
                  aria-label="Permitir selecionar arquivos recentes"
                />
                <span>
                  Permitir selecionar arquivos recentes
                  <span className="block text-xs font-normal opacity-90">
                    Use somente depois de validar que eles não são modelo ativo, não são partes complementares
                    e não serão mais usados.
                  </span>
                </span>
              </label>
            </AlertDescription>
          </Alert>
        )}

        {orphans && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {orphans.length} arquivo(s) no bucket • {totalCandidates.length} candidato(s) a remoção •{" "}
              {formatSize(totalCandidateBytes)} a recuperar • Selecionados:{" "}
              <strong>{selected.size}</strong> ({formatSize(selectedBytes)})
              {selectedRecentRows.length > 0 ? <> • Recentes: <strong>{selectedRecentRows.length}</strong></> : null}
            </div>
            <div className="max-h-[42vh] overflow-auto rounded border bg-background">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="min-w-[520px]">Caminho</TableHead>
                    <TableHead className="w-28">Tamanho</TableHead>
                    <TableHead className="w-20">Idade</TableHead>
                    <TableHead className="min-w-[220px]">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphans.map((o) => {
                    const canSelect = selectableSet.has(o.storage_path);
                    return (
                      <TableRow key={o.storage_path} className={o.would_delete ? "bg-destructive/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(o.storage_path)}
                            disabled={!canSelect}
                            onCheckedChange={() => toggleOne(o.storage_path)}
                            aria-label={`Selecionar ${o.storage_path}`}
                          />
                        </TableCell>
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Reset vínculos */}
      <AlertDialog open={resetOpen} onOpenChange={(open) => !resetting && setResetOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar vínculos do modelo 3D?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai limpar o inventário e os vínculos do modelo 3D desta obra para permitir
              refazer os vínculos no novo modelo. O arquivo GLB não será apagado. Dados de Produção,
              Diário, Planejamento e Relatórios não serão alterados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={resetting} onClick={resetModelLinks}>
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar reset dos vínculos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de exclusão real */}
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Excluir modelos 3D do Storage?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove arquivos do Storage de forma irreversível. Modelos ativos,
              preservados e partes complementares serão bloqueados automaticamente. Arquivos recentes
              exigem autorização extra de administrador da empresa. Confirme apenas se você já validou
              que os arquivos selecionados são realmente órfãos.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 text-sm">
            {selectedRecentRows.length > 0 && (
              <Alert className="border-destructive/50 bg-destructive/10 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  Você selecionou arquivos criados há menos de 7 dias. Esta ação só é permitida para
                  Administrador da empresa. Confirme apenas se já validou que eles não são o modelo
                  ativo, não são partes complementares e não serão mais usados.
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded border bg-muted/40 p-2 max-h-48 overflow-auto">
              <ul className="space-y-1 font-mono text-[10px]">
                {selectedRows.map((r) => (
                  <li key={r.storage_path} className="truncate" title={r.storage_path}>
                    {r.storage_path} <span className="text-muted-foreground">({formatSize(r.file_size)})</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="text-xs">
              Total: <strong>{selectedRows.length}</strong> arquivo(s) • <strong>{formatSize(selectedBytes)}</strong>
            </div>

            <div className="space-y-1">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason" value={deleteReason} maxLength={500} rows={2}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ex.: limpeza de versões antigas após substituir GLB"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="confirm">
                Digite <code className="px-1 bg-muted rounded">{requiredConfirmation}</code> para liberar a ação
              </Label>
              <Input
                id="confirm" value={confirmText} autoComplete="off"
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={requiredConfirmation}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmDisabled}
              onClick={(e) => { e.preventDefault(); executeDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir {selected.size} arquivo(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
