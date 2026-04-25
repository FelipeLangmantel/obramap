import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

export type DiaryDayStatus = "aprovado" | "revisando" | "preenchendo";

export interface DiaryDayEntry {
  id: string;
  entry_date: string; // YYYY-MM-DD
  status_aprovacao: DiaryDayStatus;
  num_relatorio: number | null;
  engineer_name: string | null;
  // contadores
  has_labor: boolean;
  has_items: boolean;
  has_photos: boolean;
}

/**
 * Carrega os RDOs do mês para uma obra. Usado pelo calendário visual.
 */
export function useDiaryMonthEntries(projectId: string | null | undefined, monthDate: Date) {
  const [entries, setEntries] = useState<DiaryDayEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) { setEntries([]); return; }
    setLoading(true);
    try {
      const fromDate = format(startOfMonth(monthDate), "yyyy-MM-dd");
      const toDate = format(endOfMonth(monthDate), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id, entry_date, status_aprovacao, num_relatorio, engineer_name, status")
        .eq("project_id", projectId)
        .gte("entry_date", fromDate)
        .lte("entry_date", toDate)
        .is("deleted_at", null)
        .order("entry_date", { ascending: true });

      if (error) throw error;
      const rows = (data || []) as any[];

      // Determina status normalizado
      const mapped: DiaryDayEntry[] = rows.map(r => {
        let st: DiaryDayStatus = "preenchendo";
        if (r.status === "finalizado" || r.status_aprovacao === "aprovado") st = "aprovado";
        else if (r.status_aprovacao === "revisando") st = "revisando";
        return {
          id: r.id,
          entry_date: r.entry_date,
          status_aprovacao: st,
          num_relatorio: r.num_relatorio ?? null,
          engineer_name: r.engineer_name ?? null,
          has_labor: false,
          has_items: false,
          has_photos: false,
        };
      });
      setEntries(mapped);
    } catch (err) {
      console.error("[useDiaryMonthEntries]", err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, monthDate]);

  useEffect(() => { reload(); }, [reload]);

  return { entries, loading, reload };
}
