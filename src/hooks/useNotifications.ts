import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SystemNotification {
  id: string;
  company_id: string;
  obra_id: string;
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

export function useNotifications(modulo?: string) {
  const { company, user } = useAuth();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadCount = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    let q = supabase.from("system_notifications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .eq("lida", false)
      .eq("resolvida", false);
    if (modulo) q = q.eq("modulo", modulo);
    const { count: c } = await q;
    setCount(c || 0);
  }, [company?.id, user?.id, modulo]);

  const loadNotifications = useCallback(async () => {
    if (!company?.id || !user?.id) return;
    // Use direct query to join obra name
    let q = supabase
      .from("system_notifications")
      .select("*, obras_portfolio!system_notifications_obra_id_fkey(nome)")
      .eq("company_id", company.id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .eq("resolvida", false)
      .not("tipo", "like", "%documento%")
      .order("lida", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(30);
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
  }, [company?.id, user?.id, modulo]);

  useEffect(() => {
    loadCount();
    if (!company?.id) return;
    const channel = supabase
      .channel(`notif-${company.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_notifications" },
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
    let q = supabase
      .from("system_notifications")
      .update({ lida: true, lida_em: new Date().toISOString() } as any)
      .eq("company_id", company.id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .eq("lida", false);
    if (modulo) q = (q as any).eq("modulo", modulo);
    await q;
    loadCount();
    loadNotifications();
  }, [company?.id, user?.id, modulo, loadCount, loadNotifications]);

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
