import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HousePhotoEntry {
  photo_id: string;
  storage_path: string;
  legenda: string | null;
  photo_created_at: string;
  diary_item_id: string;
  macro_id: string;
  macro_name: string;
  macro_color: string;
  scope_id: string;
  scope_name: string;
  percentual_executado: number;
  observacao: string | null;
  diary_entry_id: string;
  entry_date: string;
  engineer_name: string;
  // resolved client-side
  url: string;
}

/**
 * Carrega o histórico fotográfico (apenas fotos vinculadas a serviços)
 * de uma casa específica dentro de um projeto. Resolve URLs assinadas
 * do bucket privado `diary-photos`.
 */
export function useHousePhotoHistory(houseId: number | null, projectId: string | null) {
  const [photos, setPhotos] = useState<HousePhotoEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (houseId == null || !projectId) { setPhotos([]); return; }
    setLoading(true); setError(null);
    try {
      const { data, error: rpcErr } = await (supabase as any).rpc("get_house_photo_history", {
        p_house_id: houseId,
        p_project_id: projectId,
      });
      if (rpcErr) throw rpcErr;
      const rows = (data || []) as Omit<HousePhotoEntry, "url">[];
      const withUrls = await Promise.all(rows.map(async (r) => {
        const { data: signed } = await supabase.storage
          .from("diary-photos").createSignedUrl(r.storage_path, 60 * 60);
        return { ...r, url: signed?.signedUrl || "" } as HousePhotoEntry;
      }));
      setPhotos(withUrls);
    } catch (e: any) {
      setError(e.message || "Falha ao carregar histórico");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [houseId, projectId]);

  useEffect(() => { reload(); }, [reload]);

  return { photos, loading, error, reload };
}
