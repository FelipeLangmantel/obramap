import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useConstruction } from "@/contexts/ConstructionContext";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Loader2, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ProjectModulesSelector } from "./ProjectModulesSelector";
import { useProjectModules } from "@/hooks/useProjectModules";

interface PortfolioObra {
  id: string;
  nome: string;
  empresa: string | null;
  municipio: string | null;
  estado: string | null;
  uh: number | null;
  obramap_project_id: string | null;
}

interface LinkPortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked?: () => void;
}

/**
 * Permite ao admin (empresa/sistema) vincular obras já cadastradas no
 * Painel de Obras (obras_portfolio) a projetos do ObraMap (projects).
 *
 * Cenário típico: empresa migrando de painel antigo onde já havia obras
 * cadastradas — esta tela faz o casamento manual sem perda de dados.
 */
export function LinkPortfolioDialog({ open, onOpenChange, onLinked }: LinkPortfolioDialogProps) {
  const { company, isCompanyAdmin, isSystemAdmin } = useAuth();
  const { projects } = useConstruction();
  const allowed = isCompanyAdmin || isSystemAdmin;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [obras, setObras] = useState<PortfolioObra[]>([]);
  const [linkedProjectIds, setLinkedProjectIds] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Record<string, string>>({}); // obraId -> projectId
  const [search, setSearch] = useState("");

  // Sub-dialog de seleção de módulos: abre depois de clicar em Vincular
  const [moduleDialog, setModuleDialog] = useState<{
    obraId: string;
    projectId: string;
    obraNome: string;
  } | null>(null);
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({});
  const { setModulesForProject } = useProjectModules(moduleDialog?.projectId);

  const reload = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("obras_portfolio")
        .select("id, nome, empresa, municipio, estado, uh, obramap_project_id")
        .eq("company_id", company.id)
        .order("nome");
      if (error) throw error;
      const list = (data || []) as PortfolioObra[];
      setObras(list);
      setLinkedProjectIds(
        new Set(list.map((o) => o.obramap_project_id).filter(Boolean) as string[])
      );
    } catch (e: any) {
      toast.error("Erro ao carregar obras: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) reload();
  }, [open, company?.id]);

  // Projetos ainda não vinculados a nenhuma obra do portfolio
  const availableProjects = useMemo(
    () => projects.filter((p) => !linkedProjectIds.has(p.id)),
    [projects, linkedProjectIds]
  );

  const filteredObras = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return obras;
    return obras.filter(
      (o) =>
        o.nome.toLowerCase().includes(q) ||
        (o.municipio || "").toLowerCase().includes(q) ||
        (o.empresa || "").toLowerCase().includes(q)
    );
  }, [obras, search]);

  const handleLink = async (obraId: string) => {
    const projectId = selection[obraId];
    if (!projectId) {
      toast.error("Selecione um projeto do ObraMap.");
      return;
    }
    setSaving(obraId);
    try {
      const { error } = await supabase
        .from("obras_portfolio")
        .update({ obramap_project_id: projectId } as any)
        .eq("id", obraId);
      if (error) throw error;
      toast.success("Obra vinculada com sucesso!");
      setSelection((s) => {
        const c = { ...s };
        delete c[obraId];
        return c;
      });
      await reload();
      onLinked?.();
    } catch (e: any) {
      toast.error("Erro ao vincular: " + e.message);
    } finally {
      setSaving(null);
    }
  };

  const handleUnlink = async (obraId: string) => {
    setSaving(obraId);
    try {
      const { error } = await supabase
        .from("obras_portfolio")
        .update({ obramap_project_id: null } as any)
        .eq("id", obraId);
      if (error) throw error;
      toast.success("Vínculo removido.");
      await reload();
      onLinked?.();
    } catch (e: any) {
      toast.error("Erro ao remover vínculo: " + e.message);
    } finally {
      setSaving(null);
    }
  };

  const naoVinculadas = filteredObras.filter((o) => !o.obramap_project_id);
  const vinculadas = filteredObras.filter((o) => !!o.obramap_project_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Obras do Painel ao ObraMap
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Conecte obras já cadastradas no Painel de Obras (Holding) a projetos
            operacionais do ObraMap. Após vincular, a obra ganha acesso aos módulos
            de mapa, diários e produção.
          </p>
        </DialogHeader>

        {!allowed ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Apenas administradores podem gerenciar vínculos.
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, município ou empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <ScrollArea className="flex-1 -mx-1 px-1">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Não vinculadas */}
                  <section>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      Pendentes de vínculo
                      <Badge variant="secondary">{naoVinculadas.length}</Badge>
                    </h3>
                    {naoVinculadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">
                        Todas as obras do painel já estão vinculadas.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {naoVinculadas.map((obra) => (
                          <div
                            key={obra.id}
                            className="flex flex-col md:flex-row md:items-center gap-3 p-3 border rounded-lg bg-card"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{obra.nome}</div>
                              <div className="text-xs text-muted-foreground">
                                {obra.empresa} • {obra.municipio}/{obra.estado}
                                {obra.uh ? ` • ${obra.uh} UH` : ""}
                              </div>
                            </div>
                            <Select
                              value={selection[obra.id] || ""}
                              onValueChange={(v) => setSelection((s) => ({ ...s, [obra.id]: v }))}
                            >
                              <SelectTrigger className="w-full md:w-[260px]">
                                <SelectValue placeholder="Escolha o projeto ObraMap..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableProjects.length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-muted-foreground">
                                    Nenhum projeto disponível
                                  </div>
                                ) : (
                                  availableProjects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={() => handleLink(obra.id)}
                              disabled={!selection[obra.id] || saving === obra.id}
                              className="gap-2"
                            >
                              {saving === obra.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Link2 className="h-4 w-4" />
                              )}
                              Vincular
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Vinculadas */}
                  <section>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      Já vinculadas
                      <Badge variant="default">{vinculadas.length}</Badge>
                    </h3>
                    {vinculadas.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4">
                        Nenhuma obra vinculada ainda.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {vinculadas.map((obra) => {
                          const project = projects.find((p) => p.id === obra.obramap_project_id);
                          return (
                            <div
                              key={obra.id}
                              className="flex flex-col md:flex-row md:items-center gap-3 p-3 border rounded-lg bg-muted/30"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                  {obra.nome}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ObraMap: <span className="font-medium">{project?.name || "(projeto removido)"}</span>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUnlink(obra.id)}
                                disabled={saving === obra.id}
                              >
                                {saving === obra.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Desvincular"
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LinkPortfolioDialog;
