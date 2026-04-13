import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Check, X, Clock, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type UnifiedRequest = {
  id: string;
  source: "edit_requests" | "medicao_correction";
  user_name: string;
  obra_id: string;
  obra_nome: string;
  justificativa: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  // medicao-specific
  medicao_id?: string;
  section?: string;
};

export function EditRequestsPanel() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<UnifiedRequest | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [processing, setProcessing] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["edit-requests-unified", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data: obras } = await supabase
        .from("obras_portfolio")
        .select("id, nome")
        .eq("company_id", company.id);
      if (!obras?.length) return [];

      const obraIds = obras.map(o => o.id);
      const obraMap = new Map(obras.map(o => [o.id, o.nome]));

      // Fetch both tables in parallel
      const [editRes, correctionRes] = await Promise.all([
        supabase
          .from("edit_requests")
          .select("*")
          .in("obra_id", obraIds)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("medicao_correction_requests")
          .select("*")
          .in("obra_id", obraIds)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const unified: UnifiedRequest[] = [];

      // Map edit_requests
      (editRes.data || []).forEach((r: any) => {
        unified.push({
          id: r.id,
          source: "edit_requests",
          user_name: r.user_name,
          obra_id: r.obra_id,
          obra_nome: obraMap.get(r.obra_id) || "—",
          justificativa: r.justificativa,
          status: r.status,
          admin_response: r.admin_response,
          created_at: r.created_at,
          resolved_at: r.resolved_at,
          resolved_by: r.resolved_by,
        });
      });

      // Map medicao_correction_requests
      (correctionRes.data || []).forEach((r: any) => {
        unified.push({
          id: r.id,
          source: "medicao_correction",
          user_name: r.requested_by_name,
          obra_id: r.obra_id,
          obra_nome: obraMap.get(r.obra_id) || "—",
          justificativa: r.reason,
          status: r.status === "pending" ? "pendente" : r.status === "approved" ? "aprovado" : "rejeitado",
          admin_response: r.review_notes,
          created_at: r.created_at,
          resolved_at: r.reviewed_at,
          resolved_by: r.reviewed_by,
          medicao_id: r.medicao_id,
          section: r.section,
        });
      });

      // Sort by date desc
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return unified;
    },
    enabled: !!company?.id,
  });

  // Realtime for both tables
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`edit-requests-unified-${company.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "edit_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["edit-requests-unified", company.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "medicao_correction_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["edit-requests-unified", company.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, queryClient]);

  const handleResolve = async (request: UnifiedRequest, status: "aprovado" | "rejeitado") => {
    setProcessing(true);

    if (request.source === "edit_requests") {
      const { error } = await supabase
        .from("edit_requests")
        .update({
          status,
          admin_response: adminResponse || null,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
        } as any)
        .eq("id", request.id);

      if (error) {
        toast.error("Erro ao processar solicitação.");
        setProcessing(false);
        return;
      }
    } else {
      // medicao_correction_requests
      const mappedStatus = status === "aprovado" ? "approved" : "rejected";

      // If approving, unlock the measurement for 24h
      if (status === "aprovado" && request.medicao_id) {
        const unlockUntil = new Date();
        unlockUntil.setHours(unlockUntil.getHours() + 24);
        await supabase.from("medicoes_ple").update({
          unlocked_until: unlockUntil.toISOString(),
          unlocked_by: user?.id,
          unlocked_section: request.section,
        } as any).eq("id", request.medicao_id);
      }

      const { error } = await supabase
        .from("medicao_correction_requests")
        .update({
          status: mappedStatus,
          reviewed_by: user?.id,
          reviewed_by_name: user?.email?.split("@")[0] || "Admin",
          reviewed_at: new Date().toISOString(),
          review_notes: adminResponse || null,
        } as any)
        .eq("id", request.id);

      if (error) {
        toast.error("Erro ao processar solicitação.");
        setProcessing(false);
        return;
      }
    }

    setProcessing(false);
    toast.success(`Solicitação ${status === "aprovado" ? "aprovada" : "rejeitada"}.`);
    setSelectedRequest(null);
    setAdminResponse("");
    queryClient.invalidateQueries({ queryKey: ["edit-requests-unified", company?.id] });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const pendentes = requests.filter(r => r.status === "pendente");
  const resolvidas = requests.filter(r => r.status !== "pendente");

  const getSourceLabel = (source: string) =>
    source === "medicao_correction" ? "Medição" : "Edição";

  return (
    <div className="space-y-4">
      {pendentes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Pendentes ({pendentes.length})
          </h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Justificativa</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map(r => (
                  <TableRow
                    key={r.id}
                    className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelectedRequest(r); setAdminResponse(""); }}
                  >
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {getSourceLabel(r.source)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell>{r.obra_nome}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.justificativa}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => handleResolve(r, "aprovado")}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleResolve(r, "rejeitado")}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {resolvidas.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Histórico</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvidas.slice(0, 20).map(r => (
                  <TableRow
                    key={r.id}
                    className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelectedRequest(r); setAdminResponse(r.admin_response || ""); }}
                  >
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {getSourceLabel(r.source)}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.user_name}</TableCell>
                    <TableCell>{r.obra_nome}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${r.status === "aprovado" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"}`}>
                        {r.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(r.resolved_at || r.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhuma solicitação encontrada.
        </p>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes da Solicitação</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {getSourceLabel(selectedRequest.source)}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Usuário:</span>{" "}
                  <span className="font-medium">{selectedRequest.user_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Obra:</span>{" "}
                  <span className="font-medium">{selectedRequest.obra_nome}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Data:</span>{" "}
                  {format(new Date(selectedRequest.created_at), "dd/MM/yyyy HH:mm")}
                </div>
                {selectedRequest.section && (
                  <div>
                    <span className="text-muted-foreground">Seção:</span>{" "}
                    <Badge variant="secondary" className="text-[10px] capitalize">{selectedRequest.section}</Badge>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <Badge variant="secondary" className={`text-[10px] ${
                    selectedRequest.status === "pendente"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : selectedRequest.status === "aprovado"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }`}>
                    {selectedRequest.status === "pendente" ? "Pendente" : selectedRequest.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Justificativa:</p>
                <p className="text-xs bg-muted/50 rounded p-2">{selectedRequest.justificativa}</p>
              </div>

              {selectedRequest.status === "pendente" ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Resposta do administrador (opcional):</p>
                    <Textarea
                      value={adminResponse}
                      onChange={(e) => setAdminResponse(e.target.value)}
                      className="text-xs min-h-[60px]"
                      placeholder="Adicione uma observação..."
                    />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleResolve(selectedRequest, "rejeitado")}
                      disabled={processing}
                      className="gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleResolve(selectedRequest, "aprovado")}
                      disabled={processing}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                selectedRequest.admin_response && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Resposta do administrador:</p>
                    <p className="text-xs bg-muted/50 rounded p-2">{selectedRequest.admin_response}</p>
                  </div>
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
