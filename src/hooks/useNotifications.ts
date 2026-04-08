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

export function useNotifications() {
  const { company } = useAuth();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const loadCount = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase.rpc("get_unread_notifications_count", {
      p_company_id: company.id,
    });
    setCount(data || 0);
  }, [company?.id]);

  const loadNotifications = useCallback(async () => {
    if (!company?.id) return;
    // Use direct query to join obra name
    const { data } = await supabase
      .from("system_notifications")
      .select("*, obras_portfolio!system_notifications_obra_id_fkey(nome)")
      .eq("company_id", company.id)
      .eq("resolvida", false)   // só pendentes — resolvidas não devem aparecer no painel
      .order("lida", { ascending: true })   // não lidas primeiro
      .order("created_at", { ascending: false })
      .limit(30);

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
  }, [company?.id]);

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
    if (!company?.id) return;
    await supabase
      .from("system_notifications")
      .update({ lida: true, lida_em: new Date().toISOString() } as any)
      .eq("company_id", company.id)
      .eq("lida", false);
    loadCount();
    loadNotifications();
  }, [company?.id, loadCount, loadNotifications]);

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
