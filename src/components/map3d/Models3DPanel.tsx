import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Box, RefreshCw, Search, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

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
  const [models, setModels] = useState<ModelFile[]>([]);
  const [orphans, setOrphans] = useState<OrphanRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);

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

  const totalCandidates = orphans?.filter((o) => o.would_delete) ?? [];
  const totalCandidateBytes = totalCandidates.reduce((s, o) => s + (o.file_size ?? 0), 0);

  return (
    <div className="space-y-4">
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          Modo somente leitura. Esta aba lista os modelos 3D do projeto e permite uma auditoria
          em modo simulação. <strong>Nenhum arquivo é apagado nesta fase.</strong>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
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

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arquivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Importado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum modelo 3D registrado para este projeto.
                </TableCell>
              </TableRow>
            )}
            {models.map((m) => {
              const s = STATUS_LABEL[m.status] ?? { label: m.status, variant: "outline" as const };
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs max-w-[280px] truncate" title={m.file_name}>
                    {m.file_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {m.preserved && (
                      <Badge variant="outline" className="ml-1">
                        preservado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{m.model_type}</TableCell>
                  <TableCell className="text-xs">{formatSize(m.file_size)}</TableCell>
                  <TableCell className="text-xs">{formatDate(m.imported_at)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
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
            <div className="max-h-[260px] overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caminho</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Idade</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphans.map((o) => (
                    <TableRow key={o.storage_path} className={o.would_delete ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-[10px] max-w-[340px] truncate" title={o.storage_path}>
                        {o.storage_path}
                      </TableCell>
                      <TableCell className="text-xs">{formatSize(o.file_size)}</TableCell>
                      <TableCell className="text-xs">{o.age_days}d</TableCell>
                      <TableCell>
                        <Badge variant={o.would_delete ? "destructive" : "secondary"} className="text-[10px]">
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
    </div>
  );
}
