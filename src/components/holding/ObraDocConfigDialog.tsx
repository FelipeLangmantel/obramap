import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DOC_TYPES = [
  { key: "ata", label: "ATA" },
  { key: "ois", label: "OIS" },
  { key: "art", label: "ART" },
  { key: "cno", label: "CNO" },
  { key: "impl", label: "Implantação" },
  { key: "scp", label: "SCP" },
  { key: "sondagem_spt", label: "Sondagem SPT" },
  { key: "planta_localizacao", label: "Planta de Localização" },
  { key: "plano_altimetrico", label: "Plano Altimétrico" },
  { key: "painel_bordo", label: "Painel de Bordo" },
  { key: "checklist_seguranca", label: "Checklist de Segurança" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  obraId: string;
  obraNome: string;
}

export function ObraDocConfigDialog({ open, onOpenChange, obraId, obraNome }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !obraId) return;
    setLoading(true);
    supabase
      .from("obra_doc_config")
      .select("tipo_doc, obrigatorio")
      .eq("obra_id", obraId)
      .then(({ data, error }) => {
        if (error) {
          toast.error("Erro ao carregar configuração de documentos.");
          setLoading(false);
          return;
        }
        const map: Record<string, boolean> = {};
        DOC_TYPES.forEach(d => { map[d.key] = false; });
        (data || []).forEach((d: any) => { map[d.tipo_doc] = !!d.obrigatorio; });
        setSelected(map);
        setLoading(false);
      });
  }, [open, obraId]);

  const handleSave = async () => {
    setSaving(true);
    // Delete existing configs for this obra
    await supabase.from("obra_doc_config").delete().eq("obra_id", obraId);
    
    // Insert selected ones
    const rows = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([key]) => ({ obra_id: obraId, tipo_doc: key, obrigatorio: true }));
    
    if (rows.length > 0) {
      const { error } = await supabase.from("obra_doc_config").insert(rows as any);
      if (error) {
        toast.error("Erro ao salvar configuração de documentos.");
        setSaving(false);
        return;
      }
    }
    
    toast.success("Configuração de documentos salva!");
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Configure os documentos desta obra
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Selecione os documentos exigidos para <strong>{obraNome}</strong>.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 py-2">
            {DOC_TYPES.map(doc => (
              <div key={doc.key} className="flex items-center gap-2">
                <Checkbox
                  id={`doc-${doc.key}`}
                  checked={!!selected[doc.key]}
                  onCheckedChange={(v) => setSelected(p => ({ ...p, [doc.key]: !!v }))}
                />
                <label htmlFor={`doc-${doc.key}`} className="text-sm cursor-pointer">{doc.label}</label>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2">
          Você está ciente de que estes são os documentos exigidos para esta obra.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar configuração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
