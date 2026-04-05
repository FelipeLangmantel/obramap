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

export function EditRequestsPanel() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [processing, setProcessing] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["edit-requests", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data: obras } = await supabase
        .from("obras_portfolio")
        .select("id, nome")
        .eq("company_id", company.id);
      if (!obras?.length) return [];

      const obraIds = obras.map(o => o.id);
      const obraMap = new Map(obras.map(o => [o.id, o.nome]));

      const { data } = await supabase
        .from("edit_requests")
        .select("*")
        .in("obra_id", obraIds)
        .order("created_at", { ascending: false })
        .limit(100);

      return (data || []).map((r: any) => ({
        ...r,
        obra_nome: obraMap.get(r.obra_id) || "—",
      }));
    },
    enabled: !!company?.id,
  });

  // Realtime
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`edit-requests-${company.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "edit_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["edit-requests", company.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, queryClient]);

  const handleResolve = async (requestId: string, status: "aprovado" | "rejeitado") => {
    setProcessing(true);
    const { error } = await supabase
      .from("edit_requests")
      .update({
        status,
        admin_response: adminResponse || null,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      } as any)
      .eq("id", requestId);

    setProcessing(false);
    if (error) {
      toast.error("Erro ao processar solicitação.");
      return;
    }
    toast.success(`Solicitação ${status === "aprovado" ? "aprovada" : "rejeitada"}.`);
    setSelectedRequest(null);
    setAdminResponse("");
    queryClient.invalidateQueries({ queryKey: ["edit-requests", company?.id] });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const pendentes = requests.filter((r: any) => r.status === "pendente");
  const resolvidas = requests.filter((r: any) => r.status !== "pendente");

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
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Justificativa</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((r: any) => (
                  <TableRow
                    key={r.id}
                    className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelectedRequest(r); setAdminResponse(""); }}
                  >
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell>{r.obra_nome}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.justificativa}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600" onClick={() => handleResolve(r.id, "aprovado")}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => handleResolve(r.id, "rejeitado")}>
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
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Obra</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvidas.slice(0, 20).map((r: any) => (
                  <TableRow
                    key={r.id}
                    className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => { setSelectedRequest(r); setAdminResponse(r.admin_response || ""); }}
                  >
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
          Nenhuma solicitação de edição encontrada.
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
                      onClick={() => handleResolve(selectedRequest.id, "rejeitado")}
                      disabled={processing}
                      className="gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleResolve(selectedRequest.id, "aprovado")}
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
