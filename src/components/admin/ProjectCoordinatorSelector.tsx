import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCog, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ProjectCoordinatorSelectorProps {
  projectId: string;
}

interface UserOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
  system_role?: string | null;
}

const NONE_VALUE = "__none__";

/**
 * Permite ao admin da empresa designar um coordenador específico para a obra.
 * Esse usuário ganha automaticamente poder de aprovação de RDOs e correção
 * de percentuais (modelo híbrido: papel global OU vínculo por obra).
 */
export function ProjectCoordinatorSelector({ projectId }: ProjectCoordinatorSelectorProps) {
  const { profile, company } = useAuth();
  const isAdmin =
    profile?.system_role === "system_admin" ||
    profile?.system_role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentCoordId, setCurrentCoordId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(NONE_VALUE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectId || !company?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [{ data: project }, { data: profs }] = await Promise.all([
          (supabase as any)
            .from("projects")
            .select("coordenador_user_id")
            .eq("id", projectId)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("user_id, display_name, email, system_role")
            .eq("company_id", company.id)
            .order("display_name", { ascending: true }),
        ]);
        if (cancelled) return;
        const coordId = (project as any)?.coordenador_user_id ?? null;
        setCurrentCoordId(coordId);
        setSelected(coordId ?? NONE_VALUE);
        setUsers((profs as any[]) ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, company?.id]);

  const handleSave = async () => {
    if (!isAdmin) {
      toast.error("Apenas administradores podem designar o coordenador.");
      return;
    }
    setSaving(true);
    try {
      const newId = selected === NONE_VALUE ? null : selected;
      const { error } = await (supabase as any)
        .from("projects")
        .update({ coordenador_user_id: newId })
        .eq("id", projectId);
      if (error) throw error;
      setCurrentCoordId(newId);
      toast.success(
        newId
          ? "Coordenador da obra designado com sucesso."
          : "Vínculo de coordenador removido. Permanece valendo o papel global."
      );
    } catch (e: any) {
      toast.error("Erro ao salvar coordenador: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const dirty = (currentCoordId ?? NONE_VALUE) !== selected;

  return (
    <div className="p-4 border rounded-lg space-y-3">
      <div className="flex items-center gap-2">
        <UserCog className="h-5 w-5 text-muted-foreground" />
        <Label className="font-medium">Coordenador da obra</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Designe um usuário responsável pela coordenação desta obra. Ele poderá
        aprovar RDOs, revisar produção e corrigir percentuais sem precisar do
        papel global de "coordenador" — vale apenas para esta obra.
      </p>

      {!isAdmin && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertDescription>
            Apenas administradores podem alterar o coordenador da obra.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários...
        </div>
      ) : (
        <div className="space-y-3">
          <Select value={selected} onValueChange={setSelected} disabled={!isAdmin || saving}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um usuário..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>
                Sem coordenador específico (usar papel global)
              </SelectItem>
              {users.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.display_name || u.email || u.user_id}
                  {u.system_role ? ` · ${u.system_role}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {currentCoordId && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Coordenador atual
              </Badge>
              <span className="text-muted-foreground">
                {users.find((u) => u.user_id === currentCoordId)?.display_name ||
                  users.find((u) => u.user_id === currentCoordId)?.email ||
                  currentCoordId}
              </span>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!isAdmin || saving || !dirty} size="sm">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar coordenador
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectCoordinatorSelector;
