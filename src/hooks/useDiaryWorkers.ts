import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DiaryWorker {
  id: string;
  diary_entry_id: string;
  worker_name: string;
  profession: string;
  worker_type: "professional" | "helper";
  hours_worked: number;
  cost_per_hour: number | null;
  contractor_contract_id: string | null;
  notes: string | null;
}

export interface DiaryItemWorkerLink {
  id: string;
  diary_item_id: string;
  diary_worker_id: string;
  hours_allocated: number | null;
}

/**
 * Trabalhadores presentes no dia (com horas individuais) e seus
 * vínculos com lançamentos de produção.
 */
export function useDiaryWorkers(entryId: string | null) {
  const [workers, setWorkers] = useState<DiaryWorker[]>([]);
  const [links, setLinks] = useState<DiaryItemWorkerLink[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async (eId: string | null) => {
    if (!eId) {
      setWorkers([]);
      setLinks([]);
      return;
    }
    setLoading(true);
    try {
      const { data: w } = await (supabase as any)
        .from("diary_workers")
        .select("id, diary_entry_id, worker_name, profession, worker_type, hours_worked, cost_per_hour, contractor_contract_id, notes")
        .eq("diary_entry_id", eId)
        .order("created_at");
      const list = (w || []) as DiaryWorker[];
      setWorkers(list);

      if (list.length === 0) {
        setLinks([]);
      } else {
        const { data: l } = await (supabase as any)
          .from("diary_item_workers")
          .select("id, diary_item_id, diary_worker_id, hours_allocated")
          .in("diary_worker_id", list.map((x) => x.id));
        setLinks((l || []) as DiaryItemWorkerLink[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload(entryId);
  }, [entryId, reload]);

  return { workers, links, loading, reload };
}
