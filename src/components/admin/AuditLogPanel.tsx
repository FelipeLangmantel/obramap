import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Loader2, Search, History } from "lucide-react";

const ACAO_LABELS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: "Criação", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  UPDATE: { label: "Edição", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  DELETE: { label: "Exclusão", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const TABELA_LABELS: Record<string, string> = {
  obras_portfolio: "Obras",
  medicoes_ple: "Medições",
  despesas_mensais: "Despesas",
  holding_doc_files: "Documentos",
};

export function AuditLogPanel() {
  const { company } = useAuth();
  const [filterTabela, setFilterTabela] = useState("all");
  const [filterAcao, setFilterAcao] = useState("all");
  const [searchUser, setSearchUser] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-log", company?.id, filterTabela, filterAcao],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filterTabela !== "all") query = query.eq("tabela", filterTabela);
      if (filterAcao !== "all") query = query.eq("acao", filterAcao);

      const { data } = await query;
      return (data || []) as any[];
    },
    enabled: !!company?.id,
  });

  const filteredLogs = searchUser
    ? logs.filter((l: any) => l.user_name?.toLowerCase().includes(searchUser.toLowerCase()))
    : logs;

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            className="h-8 w-48 text-xs pl-8"
          />
        </div>
        <Select value={filterTabela} onValueChange={setFilterTabela}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Todas tabelas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas tabelas</SelectItem>
            <SelectItem value="obras_portfolio">Obras</SelectItem>
            <SelectItem value="medicoes_ple">Medições</SelectItem>
            <SelectItem value="despesas_mensais">Despesas</SelectItem>
            <SelectItem value="holding_doc_files">Documentos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAcao} onValueChange={setFilterAcao}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Todas ações" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            <SelectItem value="INSERT">Criação</SelectItem>
            <SelectItem value="UPDATE">Edição</SelectItem>
            <SelectItem value="DELETE">Exclusão</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs h-6">{filteredLogs.length} registros</Badge>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-32">Data/Hora</TableHead>
              <TableHead className="text-xs">Tabela</TableHead>
              <TableHead className="text-xs">Ação</TableHead>
              <TableHead className="text-xs">Usuário</TableHead>
              <TableHead className="text-xs">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhum registro de auditoria encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log: any) => {
                const acaoCfg = ACAO_LABELS[log.acao] || { label: log.acao, cls: "" };
                const tabelaLabel = TABELA_LABELS[log.tabela] || log.tabela;
                const nome = log.dados_novos?.nome || log.dados_anteriores?.nome || log.registro_id?.slice(0, 8) || "—";
                return (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell>{tabelaLabel}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${acaoCfg.cls}`}>{acaoCfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.user_name || "Sistema"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{nome}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
