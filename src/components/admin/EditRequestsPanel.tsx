import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check, X, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export function EditRequestsPanel() {
  const { company, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["edit-requests", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      // Get obra IDs for this company
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

  const handleResolve = async (requestId: string, status: "aprovado" | "rejeitado", response?: string) => {
    const { error } = await supabase
      .from("edit_requests")
      .update({
        status,
        admin_response: response || null,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      } as any)
      .eq("id", requestId);

    if (error) {
      toast.error("Erro ao processar solicitação.");
      return;
    }
    toast.success(`Solicitação ${status === "aprovado" ? "aprovada" : "rejeitada"}.`);
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
                  <TableRow key={r.id} className="text-xs">
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell>{r.obra_nome}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.justificativa}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {resolvidas.slice(0, 20).map((r: any) => (
                  <TableRow key={r.id} className="text-xs">
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
    </div>
  );
}
