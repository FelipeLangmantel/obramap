import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

export interface Profession {
  id: string;
  company_id: string;
  name: string;
  category: string;
  worker_type: "professional" | "helper";
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Catálogo central de profissões da empresa, usado em Diário de Obras
 * (RDO) e em Produtividade & Equipes. Substitui o catálogo hardcoded.
 */
export function useProfessions(opts: { onlyActive?: boolean } = {}) {
  const { company, canEdit } = useAuth();
  const companyId = company?.id;
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!companyId) return;
    let q = (supabase as any)
      .from("professions")
      .select("*")
      .eq("company_id", companyId)
      .order("category")
      .order("name");
    if (opts.onlyActive) q = q.eq("active", true);
    const { data, error } = await q;
    if (!error && data) setProfessions(data as any);
    setIsLoading(false);
  }, [companyId, opts.onlyActive]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`professions-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "professions", filter: `company_id=eq.${companyId}` },
        () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [companyId, fetch]);

  const create = async (p: Partial<Profession>) => {
    if (!canEdit || !companyId) return null;
    const { data, error } = await (supabase as any)
      .from("professions")
      .insert({
        company_id: companyId,
        name: p.name?.trim(),
        category: p.category?.trim() || "Outros",
        worker_type: p.worker_type || "professional",
        active: p.active ?? true,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Erro ao criar profissão", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Profissão criada" });
    await fetch();
    return data;
  };

  const update = async (id: string, patch: Partial<Profession>) => {
    if (!canEdit) return false;
    const { error } = await (supabase as any).from("professions").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return false;
    }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    if (!canEdit) return false;
    const { error } = await (supabase as any).from("professions").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Profissão removida" });
    await fetch();
    return true;
  };

  const groupedByCategory = (): [string, Profession[]][] => {
    const map = new Map<string, Profession[]>();
    professions.filter(p => p.active).forEach(p => {
      const arr = map.get(p.category) || [];
      arr.push(p);
      map.set(p.category, arr);
    });
    return Array.from(map.entries());
  };

  return { professions, isLoading, create, update, remove, refetch: fetch, groupedByCategory };
}
