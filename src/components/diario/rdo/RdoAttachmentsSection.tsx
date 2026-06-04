import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Download, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { RdoAttachment } from "./types";
import { RdoSectionShell } from "./RdoSectionShell";

interface Props {
  entryId: string | null;
  companyId: string | null;
  attachments: RdoAttachment[];
  disabled?: boolean;
  onChanged: () => void;
  onRequestCreateEntry?: () => Promise<string | null>;
}

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png";

function getIcon(name: string | null) {
  const ext = (name || "").toLowerCase().split(".").pop() || "";
  if (["jpg", "jpeg", "png"].includes(ext)) return ImageIcon;
  return FileText;
}

export function RdoAttachmentsSection({ entryId, companyId, attachments, disabled, onChanged, onRequestCreateEntry }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [ensuredEntryId, setEnsuredEntryId] = useState<string | null>(null);

  const activeEntryId = entryId || ensuredEntryId;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!companyId) { toast.error("Empresa não identificada."); e.target.value = ""; return; }
    const resolvedEntryId = activeEntryId || await onRequestCreateEntry?.();
    if (!resolvedEntryId) { e.target.value = ""; return; }
    setEnsuredEntryId(resolvedEntryId);
    e.target.value = "";

    if (file.size > MAX_BYTES) { toast.error("Arquivo excede 20 MB."); return; }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const path = `${companyId}/${resolvedEntryId}/anexos/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("diary-attachments")
        .upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("diary_attachments").insert({
        company_id: companyId,
        diary_entry_id: resolvedEntryId,
        tipo: "anexo",
        storage_path: path,
        nome_original: file.name,
        tamanho_bytes: file.size,
      });
      if (dbErr) {
        await supabase.storage.from("diary-attachments").remove([path]);
        throw dbErr;
      }
      toast.success("Anexo enviado.");
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (a: RdoAttachment) => {
    try {
      await supabase.storage.from("diary-attachments").remove([a.storage_path]);
      await supabase.from("diary_attachments").delete().eq("id", a.id);
      toast.success("Anexo removido.");
      onChanged();
    } catch (err: any) {
      toast.error("Erro: " + (err.message || ""));
    }
  };

  return (
    <RdoSectionShell
      id="anexos"
      title="Anexos"
      count={attachments.length}
      addAsLabel={!disabled ? { htmlFor: "rdo-attachment-input" } : undefined}
      disabled={disabled || uploading}
      emptyText="PDF, DOC, XLS, JPG ou PNG (até 20 MB)"
      alwaysShowChildren
    >
      <input id="rdo-attachment-input" ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFile} />
      {uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Loader2 className="h-3 w-3 animate-spin" />Enviando...
        </div>
      )}
      {attachments.length === 0 && !uploading && (
        <p className="text-sm text-muted-foreground text-center py-2">
          PDF, DOC, XLS, JPG ou PNG (até 20 MB)
        </p>
      )}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map(a => {
            const Icon = getIcon(a.nome_original);
            return (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded border bg-card">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">{a.nome_original}</span>
                <span className="text-xs text-muted-foreground">
                  {a.tamanho_bytes ? `${(a.tamanho_bytes / 1024).toFixed(0)} KB` : ""}
                </span>
                <a href={a.url} target="_blank" rel="noreferrer" download={a.nome_original || true}>
                  <Button size="icon" variant="ghost" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                </a>
                {!disabled && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRemove(a)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </RdoSectionShell>
  );
}
