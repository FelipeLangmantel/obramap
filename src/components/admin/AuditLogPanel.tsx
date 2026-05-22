import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { AlertTriangle, Copy, Download, Eye, History, Loader2, Search, ShieldAlert } from "lucide-react";

interface AuditUserOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
}

interface AuditSession {
  id: string;
  user_id: string;
  login_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_active_at: string | null;
  city?: string | null;
  region?: string | null;
  browser?: string | null;
  device_type?: string | null;
}

const ACAO_LABELS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: "Criação", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  UPDATE: { label: "Edição", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  DELETE: { label: "Exclusão", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

const TABELA_LABELS: Record<string, string> = {
  service_planning_by_period: "Planejamento de Periodo",
  weekly_plan_services: "Planejamento Semanal",
  weekly_plan_weeks: "Semanas Planejadas",
  weekly_productions: "Producao Semanal",
  productions: "Producao",
  production_deviations: "Desvios de Producao",
  project_model_meshes: "Mapa 3D / Meshes",
  project_model_parts: "Mapa 3D / Partes GLB",
  scope_items: "Custos da Obra",
  indirect_costs: "Custos Indiretos",
  project_contract_services: "Contrato da Obra",
  ple_events: "Medicoes PLE",
  user_permissions: "Permissoes de Usuarios",
  user_profiles: "Usuarios",
  profiles: "Usuarios",
  company_users: "Usuarios da Empresa",
  user_roles: "Funcoes de Usuario",
  projects: "Obras",
  houses: "Casas / Unidades",
  quadras: "Quadras",
  diary_entries: "Diario de Obras",
  diary_items: "Itens do Diario",
  planning_stages: "Planejamento Inteligente",
  planning_periods: "Planejamento de Periodo",
  planning_versions: "Versoes do Planejamento",
  planned_productions: "Producao Planejada",
  obras_portfolio: "Obras",
  medicoes_ple: "Medições",
  despesas_mensais: "Despesas",
  holding_doc_files: "Documentos",
};

const SENSITIVE_TABLES = new Set([
  "profiles",
  "user_profiles",
  "user_permissions",
  "company_users",
  "user_roles",
  "productions",
  "weekly_productions",
  "production_deviations",
  "diary_entries",
  "diary_items",
  "scope_items",
  "indirect_costs",
  "project_contract_services",
  "project_model_meshes",
  "project_model_parts",
  "ple_events",
  "medicoes_ple",
  "despesas_mensais",
  "service_planning_by_period",
]);

const MEDIUM_TABLES = new Set([
  "planning_stages",
  "planning_periods",
  "planning_versions",
  "planned_productions",
  "weekly_plan_services",
  "weekly_plan_weeks",
  "holding_doc_files",
]);

function safeDateLabel(value: string | null | undefined, pattern = "dd/MM/yy HH:mm") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return format(date, pattern);
}

function getAuditModuleLabel(tableName: string | null | undefined) {
  return TABELA_LABELS[tableName || ""] || tableName || "Modulo nao informado";
}

function getActionLabel(action: string | null | undefined) {
  return ACAO_LABELS[action || ""] || { label: action || "Acao nao informada", cls: "" };
}

function getAuditSeverity(log: any): { label: string; value: "critical" | "medium" | "low"; cls: string } {
  const table = log?.tabela || "";
  const action = log?.acao || "";
  if (action === "DELETE" || SENSITIVE_TABLES.has(table)) {
    return { label: "Critico", value: "critical", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" };
  }
  if (action === "UPDATE" || action === "INSERT" || MEDIUM_TABLES.has(table)) {
    return { label: "Medio", value: "medium", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" };
  }
  return { label: "Baixo", value: "low", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
}

function extractRecordId(log: any): string {
  return log?.registro_id || log?.dados_novos?.id || log?.dados_anteriores?.id || "";
}

function getChangedFields(log: any): string[] {
  const oldData = log?.dados_anteriores || {};
  const newData = log?.dados_novos || {};
  if (!oldData || !newData || typeof oldData !== "object" || typeof newData !== "object") return [];
  return Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]))
    .filter((key) => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));
}

/** Extract obra_id from audit log data */
function extractObraId(log: any): string | null {
  return log.dados_novos?.obra_id || log.dados_anteriores?.obra_id || log.project_id || log.dados_novos?.project_id || log.dados_anteriores?.project_id || null;
}

/** Extract a human-readable description from audit data */
function extractDescription(log: any): string {
  const d = log.dados_novos || log.dados_anteriores || {};
  // For obras_portfolio, the record itself IS the obra
  if (log.tabela === "obras_portfolio") return d.nome || log.registro_id?.slice(0, 8) || "—";
  // For medicoes_ple
  if (log.tabela === "medicoes_ple") {
    const num = d.num_medicao || "";
    const val = d.valor_medicao ? `R$ ${Number(d.valor_medicao).toLocaleString("pt-BR")}` : "";
    const status = d.status_medicao || "";
    return [num && `Med. ${num}`, status, val].filter(Boolean).join(" · ") || log.registro_id?.slice(0, 8) || "—";
  }
  // For despesas_mensais
  if (log.tabela === "despesas_mensais") {
    const mes = d.mes_referencia || "";
    const ano = d.ano_referencia || "";
    const val = d.valor ? `R$ ${Number(d.valor).toLocaleString("pt-BR")}` : "";
    const status = d.status || "";
    return [mes && ano ? `${mes}/${ano}` : "", status, val].filter(Boolean).join(" · ") || log.registro_id?.slice(0, 8) || "—";
  }
  // For documents
  if (log.tabela === "holding_doc_files") {
    return d.file_name || d.nome || log.registro_id?.slice(0, 8) || "—";
  }
  return d.nome || log.registro_id?.slice(0, 8) || "—";
}

function getAuditDescription(log: any, userName = "Usuario"): string {
  const moduleLabel = getAuditModuleLabel(log?.tabela);
  const actor = userName || log?.user_name || "Usuario";
  const action = log?.acao;
  const data = log?.dados_novos || log?.dados_anteriores || {};

  if (log?.tabela === "project_model_meshes") {
    if (action === "INSERT") return `${actor} vinculou ou cadastrou uma mesh no Mapa 3D.`;
    if (action === "UPDATE") return `${actor} alterou um vinculo ou status de mesh no Mapa 3D.`;
    if (action === "DELETE") return `${actor} removeu um vinculo de mesh no Mapa 3D.`;
  }

  if (log?.tabela === "user_permissions") return `${actor} alterou permissoes de um usuario.`;
  if (log?.tabela === "profiles" || log?.tabela === "user_profiles" || log?.tabela === "company_users") {
    if (action === "INSERT") return `${actor} criou ou adicionou um usuario.`;
    if (action === "UPDATE") return `${actor} editou dados de um usuario.`;
    if (action === "DELETE") return `${actor} removeu um usuario.`;
  }

  if (action === "INSERT") return `${actor} criou um registro em ${moduleLabel}.`;
  if (action === "UPDATE") return `${actor} alterou um registro em ${moduleLabel}.`;
  if (action === "DELETE") return `${actor} excluiu um registro em ${moduleLabel}.`;

  return data?.nome
    ? `${actor} registrou atividade em ${moduleLabel}: ${data.nome}.`
    : `Atividade registrada em ${moduleLabel}.`;
}

function stringifyForSearch(value: any) {
  try {
    return JSON.stringify(value || {});
  } catch {
    return "";
  }
}

function escapeCsv(value: any) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function getRoleLabel(role: string | null | undefined) {
  if (role === "admin") return "Administrador";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Visualizador";
  return "Sem perfil";
}

function getUserDisplayName(user?: AuditUserOption) {
  if (!user) return "Usuario";
  return user.display_name || user.email || "Usuario";
}

function getSessionReferenceDate(session: AuditSession) {
  return session.last_active_at || session.logout_at || session.login_at;
}

function getRelativeTime(value: string | null | undefined) {
  if (!value) return "sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data invalida";
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `ha ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `ha ${diffHours} h`;
  return `ha ${Math.round(diffHours / 24)} d`;
}

function getSessionStatus(session: AuditSession) {
  const date = new Date(getSessionReferenceDate(session) || "");
  const minutes = Number.isNaN(date.getTime()) ? Infinity : (Date.now() - date.getTime()) / 60000;
  if (session.is_active && minutes <= 5) {
    return { label: "Online", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" };
  }
  if (session.is_active && minutes <= 30) {
    return { label: "Ativo recente", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" };
  }
  return { label: "Offline", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" };
}

export function AuditLogPanel() {
  const { company, isSystemAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filterTabela, setFilterTabela] = useState("all");
  const [filterAcao, setFilterAcao] = useState("all");
  const [filterUsuario, setFilterUsuario] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [filterModulo, setFilterModulo] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [searchUser, setSearchUser] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // Fetch all company users for the audit filter, not only users that already have audit_log rows.
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["audit-company-users", company?.id],
    queryFn: async () => {
      const profilesResult = await supabase
        .from("profiles")
        .select("user_id, display_name, email, company_id")
        .eq("company_id", company!.id)
        .order("display_name", { ascending: true });

      const profileRows = (profilesResult.data || []) as any[];
      const userIds = profileRows.map((profile) => profile.user_id).filter(Boolean);
      const rolesResult = userIds.length
        ? await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
        : { data: [] };

      const rolesByUser = new Map<string, string>();
      (rolesResult.data || []).forEach((role: any) => {
        rolesByUser.set(role.user_id, role.role);
      });

      return profileRows.map((profile) => ({
        user_id: profile.user_id,
        display_name: profile.display_name,
        email: profile.email,
        role: rolesByUser.get(profile.user_id) || "viewer",
      })) as AuditUserOption[];
    },
    enabled: !!company?.id,
  });

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    companyUsers.forEach((user) => {
      map.set(user.user_id, getUserDisplayName(user));
    });
    return map;
  }, [companyUsers]);

  const userById = useMemo(() => {
    return new Map(companyUsers.map((user) => [user.user_id, user]));
  }, [companyUsers]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["audit-user-sessions", company?.id, companyUsers.map((user) => user.user_id).join("|")],
    queryFn: async () => {
      const userIds = companyUsers.map((user) => user.user_id);
      if (!userIds.length) return [] as AuditSession[];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("user_sessions")
        .select("id, user_id, login_at, logout_at, ip_address, user_agent, is_active, last_active_at, city, region, browser, device_type")
        .in("user_id", userIds)
        .gte("login_at", thirtyDaysAgo)
        .order("login_at", { ascending: false })
        .limit(200);
      return (data || []) as AuditSession[];
    },
    enabled: !!company?.id && companyUsers.length > 0,
  });

  const latestSessions = useMemo(() => {
    const byUser = new Map<string, AuditSession>();
    sessions.forEach((session) => {
      const current = byUser.get(session.user_id);
      const sessionTime = new Date(getSessionReferenceDate(session)).getTime();
      const currentTime = current ? new Date(getSessionReferenceDate(current)).getTime() : -Infinity;
      if (!current || sessionTime > currentTime) {
        byUser.set(session.user_id, session);
      }
    });
    return Array.from(byUser.values()).sort((a, b) => {
      return new Date(getSessionReferenceDate(b)).getTime() - new Date(getSessionReferenceDate(a)).getTime();
    });
  }, [sessions]);

  const activeSummary = useMemo(() => {
    const activeRecent = latestSessions.filter((session) => {
      const status = getSessionStatus(session).label;
      return status === "Online" || status === "Ativo recente";
    });
    return {
      recentViewers: activeRecent.filter((session) => userById.get(session.user_id)?.role === "viewer").length,
      recentEditorsAdmins: activeRecent.filter((session) => {
        const role = userById.get(session.user_id)?.role;
        return role === "admin" || role === "editor";
      }).length,
    };
  }, [latestSessions, userById]);

  // Fetch obra names for enrichment
  const { data: obraMap = new Map() } = useQuery({
    queryKey: ["obras-names-map", company?.id],
    queryFn: async () => {
      const [portfolioResult, projectsResult] = await Promise.all([
        supabase
        .from("obras_portfolio")
        .select("id, nome")
          .eq("company_id", company!.id),
        supabase
          .from("projects")
          .select("id, name")
          .eq("company_id", company!.id),
      ]);
      const map = new Map<string, string>();
      (portfolioResult.data || []).forEach((o: any) => map.set(o.id, o.nome));
      (projectsResult.data || []).forEach((p: any) => map.set(p.id, p.name));
      return map;
    },
    enabled: !!company?.id,
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-log", company?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      return (data || []) as any[];
    },
    enabled: !!company?.id,
  });

  // Realtime for audit_log
  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`audit-log-${company.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => {
        queryClient.invalidateQueries({ queryKey: ["audit-log", company.id], exact: false });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, queryClient]);

  const resolveUserName = (log: any) => {
    if (log.user_name) return log.user_name;
    if (log.user_id && userMap.get(log.user_id)) return userMap.get(log.user_id);
    const fromNew = log.dados_novos?.created_by_name || log.dados_novos?.updated_by_name;
    if (fromNew) return fromNew;
    return "Sistema";
  };

  const resolveObraName = (log: any): string | null => {
    if (log.tabela === "obras_portfolio") {
      return log.dados_novos?.nome || log.dados_anteriores?.nome || null;
    }
    const obraId = extractObraId(log);
    if (obraId) return obraMap.get(obraId) || null;
    return null;
  };

  const filteredLogs = useMemo(() => {
    const term = searchUser.trim().toLowerCase();
    return logs.filter((log: any) => {
      const userName = resolveUserName(log) || "";
      const moduleLabel = getAuditModuleLabel(log.tabela);
      const obraName = resolveObraName(log) || "";
      const severity = getAuditSeverity(log);
      const description = getAuditDescription(log, userName);
      const created = log.created_at ? new Date(log.created_at) : null;

      if (filterTabela !== "all" && log.tabela !== filterTabela) return false;
      if (filterAcao !== "all" && log.acao !== filterAcao) return false;
      if (filterUsuario !== "all" && log.user_id !== filterUsuario) return false;
      if (filterObra !== "all" && extractObraId(log) !== filterObra) return false;
      if (filterModulo !== "all" && moduleLabel !== filterModulo) return false;
      if (filterSeverity !== "all" && severity.value !== filterSeverity) return false;
      if (onlyCritical && severity.value !== "critical") return false;
      if (startDate && created && created < new Date(`${startDate}T00:00:00`)) return false;
      if (endDate && created && created > new Date(`${endDate}T23:59:59`)) return false;
      if (term) {
        const haystack = [
          userName,
          moduleLabel,
          obraName,
          log.tabela,
          log.acao,
          description,
          extractDescription(log),
          stringifyForSearch(log.dados_novos),
          stringifyForSearch(log.dados_anteriores),
        ].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [logs, searchUser, userMap, obraMap, filterTabela, filterAcao, filterUsuario, filterObra, filterModulo, filterSeverity, onlyCritical, startDate, endDate]);

  const filterOptions = useMemo(() => {
    const tables = Array.from(new Set(logs.map((log: any) => log.tabela).filter(Boolean))).sort();
    const modules = Array.from(new Set(logs.map((log: any) => getAuditModuleLabel(log.tabela)).filter(Boolean))).sort();
    const actions = Array.from(new Set(logs.map((log: any) => log.acao).filter(Boolean))).sort();
    const users = companyUsers
      .map((user) => [
        user.user_id,
        `${getUserDisplayName(user)} - ${getRoleLabel(user.role)}${user.email && user.display_name ? ` (${user.email})` : ""}`,
      ] as [string, string])
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const obras = Array.from(
      new Map(logs.map((log: any) => [extractObraId(log), resolveObraName(log)]).filter(([id, name]) => id && name) as [string, string][]).entries()
    ).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    return { tables, modules, actions, users, obras };
  }, [logs, companyUsers, obraMap]);

  const severityCounts = useMemo(() => {
    return filteredLogs.reduce(
      (acc: Record<string, number>, log: any) => {
        acc[getAuditSeverity(log).value] += 1;
        return acc;
      },
      { critical: 0, medium: 0, low: 0 }
    );
  }, [filteredLogs]);

  const loggedUsersInPeriod = useMemo(() => {
    return new Set(filteredLogs.map((log: any) => log.user_id).filter(Boolean)).size;
  }, [filteredLogs]);

  const renderKeyValue = (label: string, data: any) => {
    if (!data || typeof data !== "object") return null;
    const entries = Object.entries(data).filter(([k]) => !k.startsWith("_"));
    if (!entries.length) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="bg-muted/50 rounded p-2 space-y-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-[11px]">
              <span className="text-muted-foreground font-mono shrink-0">{k}:</span>
              <span className="break-all">{v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const exportCsv = () => {
    const headers = [
      "data_hora",
      "usuario",
      "empresa",
      "obra",
      "modulo",
      "tabela",
      "acao",
      "severidade",
      "descricao",
      "registro_id",
      "detalhes_json",
    ];
    const rows = filteredLogs.map((log: any) => {
      const userName = resolveUserName(log);
      const moduleLabel = getAuditModuleLabel(log.tabela);
      const severity = getAuditSeverity(log);
      return [
        safeDateLabel(log.created_at, "yyyy-MM-dd HH:mm:ss"),
        userName,
        company?.name || "",
        resolveObraName(log) || "",
        moduleLabel,
        log.tabela || "",
        getActionLabel(log.acao).label,
        severity.label,
        getAuditDescription(log, userName),
        extractRecordId(log),
        stringifyForSearch({ before: log.dados_anteriores, after: log.dados_novos }),
      ].map(escapeCsv).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyLogDetails = async (log: any) => {
    const userName = resolveUserName(log);
    const details = {
      data_hora: safeDateLabel(log.created_at, "yyyy-MM-dd HH:mm:ss"),
      usuario: userName,
      empresa: company?.name || null,
      obra: resolveObraName(log),
      modulo: getAuditModuleLabel(log.tabela),
      tabela: log.tabela,
      acao: getActionLabel(log.acao).label,
      severidade: getAuditSeverity(log).label,
      descricao: getAuditDescription(log, userName),
      registro_id: extractRecordId(log),
      campos_alterados: getChangedFields(log),
      dados_anteriores: log.dados_anteriores,
      dados_novos: log.dados_novos,
    };
    await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Registros filtrados</p>
          <p className="text-xl font-semibold">{filteredLogs.length}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
          <p className="text-xs text-muted-foreground">Criticos</p>
          <p className="text-xl font-semibold text-red-700 dark:text-red-300">{severityCounts.critical}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs text-muted-foreground">Medios</p>
          <p className="text-xl font-semibold text-amber-700 dark:text-amber-300">{severityCounts.medium}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Escopo</p>
          <p className="text-sm font-medium">{isSystemAdmin ? "System admin" : "Empresa atual por RLS"}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Usuarios da empresa</p>
          <p className="text-xl font-semibold">{companyUsers.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sem logs no filtro</p>
          <p className="text-xl font-semibold">{Math.max(companyUsers.length - loggedUsersInPeriod, 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Usuarios com logs</p>
          <p className="text-xl font-semibold">{loggedUsersInPeriod}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sessoes recentes</p>
          <p className="text-xl font-semibold">{latestSessions.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Visualizadores ativos</p>
          <p className="text-xl font-semibold">{activeSummary.recentViewers}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Admins/Editores ativos</p>
          <p className="text-xl font-semibold">{activeSummary.recentEditorsAdmins}</p>
        </div>
      </div>

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

      <div className="flex items-center gap-2 flex-wrap rounded-lg border p-3">
        <Select value={filterUsuario} onValueChange={setFilterUsuario}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Usuario" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos usuarios</SelectItem>
            {filterOptions.users.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterObra} onValueChange={setFilterObra}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Obra" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas obras</SelectItem>
            {filterOptions.obras.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterModulo} onValueChange={setFilterModulo}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Modulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos modulos</SelectItem>
            {filterOptions.modules.map((module) => (
              <SelectItem key={module} value={module}>{module}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Critico</SelectItem>
            <SelectItem value="medium">Medio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-36 text-xs" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-36 text-xs" />
        <Button
          type="button"
          variant={onlyCritical ? "destructive" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setOnlyCritical((prev) => !prev)}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Somente criticos
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-32">Data/Hora</TableHead>
              <TableHead className="text-xs">Módulo</TableHead>
              <TableHead className="text-xs">Ação</TableHead>
              <TableHead className="text-xs">Usuário</TableHead>
              <TableHead className="text-xs">Obra</TableHead>
              <TableHead className="text-xs">Detalhes</TableHead>
              <TableHead className="text-xs w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  {filterUsuario !== "all"
                    ? "Nenhuma atividade auditada encontrada para este usuario no periodo selecionado."
                    : "Nenhum log encontrado para este filtro."}
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log: any) => {
                const acaoCfg = getActionLabel(log.acao);
                const tabelaLabel = getAuditModuleLabel(log.tabela);
                const obraName = resolveObraName(log);
                const userName = resolveUserName(log);
                const severity = getAuditSeverity(log);
                const description = getAuditDescription(log, userName);
                return (
                  <TableRow
                    key={log.id}
                    className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {safeDateLabel(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-[10px]">{tabelaLabel}</Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">{log.tabela}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="secondary" className={`w-fit text-[10px] ${acaoCfg.cls}`}>{acaoCfg.label}</Badge>
                        <Badge variant="secondary" className={`w-fit text-[10px] ${severity.cls}`}>{severity.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{userName}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">
                      {obraName || "—"}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-muted-foreground">{description}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        ID {extractRecordId(log)?.slice(0, 8) || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Atividade Atual / Sessoes</h3>
            <p className="text-xs text-muted-foreground">
              Visualizadores podem nao aparecer em registros de auditoria quando apenas navegam.
              Esta area usa sessoes para mostrar presenca recente quando esses dados existem.
            </p>
          </div>
          <Badge variant="outline">{latestSessions.length} usuario(s)</Badge>
        </div>

        {latestSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Atividade atual indisponivel: nao ha sessoes recentes ou dados de last_seen suficientes para os usuarios da empresa.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Usuario</TableHead>
                  <TableHead className="text-xs">Perfil</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Ultima atividade</TableHead>
                  <TableHead className="text-xs">IP / dispositivo</TableHead>
                  <TableHead className="text-xs">Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestSessions.slice(0, 20).map((session) => {
                  const user = userById.get(session.user_id);
                  const status = getSessionStatus(session);
                  const device = [session.browser, session.device_type].filter(Boolean).join(" / ");
                  return (
                    <TableRow key={session.id} className="text-xs">
                      <TableCell>
                        <div className="font-medium">{getUserDisplayName(user)}</div>
                        <div className="text-[10px] text-muted-foreground">{user?.email || "Email nao informado"}</div>
                      </TableCell>
                      <TableCell>{getRoleLabel(user?.role)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={`text-[10px] ${status.cls}`}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>{getRelativeTime(getSessionReferenceDate(session))}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {safeDateLabel(getSessionReferenceDate(session), "dd/MM/yyyy HH:mm")}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <div className="truncate">{session.ip_address || "IP nao informado"}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{device || session.user_agent || "Dispositivo nao informado"}</div>
                      </TableCell>
                      <TableCell>{safeDateLabel(session.login_at, "dd/MM/yyyy HH:mm")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Limite atual: sessoes mostram presenca, IP e dispositivo quando disponiveis, mas nao registram rota atual,
          modulo aberto ou obra acessada. Para auditoria de navegacao sera necessaria uma estrutura futura de eventos de atividade.
        </p>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm">Detalhes da Auditoria</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <ScrollArea className="max-h-[75vh]">
              <div className="space-y-3 pr-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{getAuditDescription(selectedLog, resolveUserName(selectedLog))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getChangedFields(selectedLog).length
                      ? `Campos alterados: ${getChangedFields(selectedLog).join(", ")}`
                      : "Este registro pode conter apenas dados tecnicos de auditoria."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Data:</span>{" "}
                    {safeDateLabel(selectedLog.created_at, "dd/MM/yyyy HH:mm:ss")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Módulo:</span>{" "}
                    <Badge variant="outline" className="text-[10px]">
                      {getAuditModuleLabel(selectedLog.tabela)}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ação:</span>{" "}
                    <Badge variant="secondary" className={`text-[10px] ${(ACAO_LABELS[selectedLog.acao] || {}).cls || ""}`}>
                      {(ACAO_LABELS[selectedLog.acao] || {}).label || selectedLog.acao}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Usuário:</span>{" "}
                    <span className="font-medium">{resolveUserName(selectedLog)}</span>
                  </div>
                  {resolveObraName(selectedLog) && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Obra:</span>{" "}
                      <span className="font-medium">{resolveObraName(selectedLog)}</span>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Registro ID:</span>{" "}
                    <span className="font-mono text-[10px]">{selectedLog.registro_id || "—"}</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => copyLogDetails(selectedLog)}>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar detalhes
                  </Button>
                </div>
                {!selectedLog.dados_anteriores && !selectedLog.dados_novos && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                    Este registro possui apenas detalhes tecnicos. Auditoria detalhada antes/depois exige melhoria futura.
                  </div>
                )}
                {renderKeyValue("Dados Anteriores", selectedLog.dados_anteriores)}
                {renderKeyValue("Dados Novos", selectedLog.dados_novos)}
                {renderKeyValue("JSON bruto", selectedLog)}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
