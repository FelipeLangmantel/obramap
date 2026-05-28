import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SystemNotification {
  id: string;
  company_id: string;
  obra_id: string | null;
  tipo: string;
  titulo: string;
  mensagem: string;
  medicao_id: string | null;
  lida: boolean;
  lida_em: string | null;
  resolvida: boolean;
  resolvida_em: string | null;
  created_at: string;
  // joined
  obra_nome?: string;
}

type NotificationAccess = {
  adminLike: boolean;
  allowedObraIds: string[] | null;
};

export function useNotifications(modulo?: string) {
  const { company, user, isCompanyAdmin, isSystemAdmin, permissions } = useAuth();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadNotificationAccess = useCallback(async (): Promise<NotificationAccess | null> => {
    if (!company?.id || !user?.id) return null;

    if (isCompanyAdmin || isSystemAdmin) {
      return { adminLike: true, allowedObraIds: null };
    }

    const allowedProjectIds = permissions?.allowed_project_ids;
    if (!permissions || !allowedProjectIds || allowedProjectIds.length === 0) {
      return { adminLike: false, allowedObraIds: [] };
    }

    const { data, error } = await supabase
      .from("obras_portfolio")
      .select("id")
      .eq("company_id", company.id)
      .in("obramap_project_id", allowedProjectIds);

    if (error) {
      console.error("Error loading accessible works for notifications:", error);
      return { adminLike: false, allowedObraIds: [] };
    }

    return {
      adminLike: false,
      allowedObraIds: (data || []).map((obra) => obra.id),
    };
  }, [company?.id, user?.id, isCompanyAdmin, isSystemAdmin, permissions]);

  const applyNotificationAccessFilter = useCallback((query: any, access: NotificationAccess) => {
    if (access.adminLike) return query;

    if (access.allowedObraIds === null) {
      return query.or(`user_id.eq.${user!.id},user_id.is.null`);
    }

    const allowedBroadcasts = ["and(user_id.is.null,obra_id.is.null)"];
    if (access.allowedObraIds.length > 0) {
      allowedBroadcasts.push(`and(user_id.is.null,obra_id.in.(${access.allowedObraIds.join(",")}))`);
    }

    return query.or([`user_id.eq.${user!.id}`, ...allowedBroadcasts].join(","));
  }, [user?.id]);

  const loadCount = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    const access = await loadNotificationAccess();
    if (!access) return;

    let q = supabase.from("system_notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("lida", false)
      .eq("resolvida", false);
    q = applyNotificationAccessFilter(q, access);
    if (modulo) q = q.eq("modulo", modulo);
    const { count: c } = await q;
    setCount(c || 0);
  }, [company?.id, user?.id, modulo, loadNotificationAccess, applyNotificationAccessFilter]);

  const loadNotifications = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    const access = await loadNotificationAccess();
    if (!access) return;

    // Use direct query to join obra name
    let q = supabase
      .from("system_notifications")
      .select("*, obras_portfolio!system_notifications_obra_id_fkey(nome, obramap_project_id)")
      .eq("company_id", company.id)
      .eq("resolvida", false)
      .not("tipo", "like", "%documento%")
      .order("lida", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(30);
    q = applyNotificationAccessFilter(q, access);
    if (modulo) q = q.eq("modulo", modulo);

    const { data } = await q;
    const mapped: SystemNotification[] = (data || []).map((n: any) => ({
      id: n.id,
      company_id: n.company_id,
      obra_id: n.obra_id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      medicao_id: n.medicao_id,
      lida: n.lida,
      lida_em: n.lida_em,
      resolvida: n.resolvida,
      resolvida_em: n.resolvida_em,
      created_at: n.created_at,
      obra_nome: n.obras_portfolio?.nome || "",
    }));
    setNotifications(mapped);
  }, [company?.id, user?.id, modulo, loadNotificationAccess, applyNotificationAccessFilter]);

  useEffect(() => {
    loadCount();
    if (!company?.id) return;
    const channel = supabase
      .channel(`notif-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_notifications", filter: `company_id=eq.${company.id}` },
        () => {
          loadCount();
          if (isOpen) loadNotifications();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [company?.id, loadCount, loadNotifications, isOpen]);

  // Polling fallback: sincroniza o contador a cada 60s
  // Cobre eventos que não tocam system_notifications diretamente (ex: upload de documento)
  useEffect(() => {
    if (!company?.id) return;
    const timer = setInterval(loadCount, 60_000);
    return () => clearInterval(timer);
  }, [company?.id, loadCount]);

  const markAsRead = useCallback(
    async (notifId: string) => {
      await supabase
        .from("system_notifications")
        .update({ lida: true, lida_em: new Date().toISOString() } as any)
        .eq("id", notifId);
      loadCount();
      loadNotifications();
    },
    [loadCount, loadNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    const access = await loadNotificationAccess();
    if (!access) return;

    let q = supabase
      .from("system_notifications")
      .update({ lida: true, lida_em: new Date().toISOString() } as any)
      .eq("company_id", company.id)
      .eq("lida", false);
    q = applyNotificationAccessFilter(q, access);
    if (modulo) q = (q as any).eq("modulo", modulo);
    await q;
    loadCount();
    loadNotifications();
  }, [company?.id, user?.id, modulo, loadCount, loadNotifications, loadNotificationAccess, applyNotificationAccessFilter]);

  return {
    count,
    notifications,
    isOpen,
    setIsOpen,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    loadCount,
  };
}
