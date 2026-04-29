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
 * Carrega o histórico fotográfico (apenas fotos vinculadas a serviços) de uma
 * casa específica dentro de um projeto. Resolve URLs assinadas do bucket
 * privado `diary-photos`.
 *
 * Otimização (escala 50 obras × 70 casas): por padrão carrega apenas as
 * `initialLimit` fotos mais recentes para evitar centenas de requisições
 * simultâneas ao abrir o painel da casa. Use `loadAll()` para carregar
 * todas sob demanda (botão "Ver todas").
 */
export function useHousePhotoHistory(
  houseId: number | null,
  projectId: string | null,
  options?: { initialLimit?: number | null }
) {
  const initialLimit = options?.initialLimit ?? 5;
  const [photos, setPhotos] = useState<HousePhotoEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPhotos = useCallback(async (limit: number | null) => {
    if (houseId == null || !projectId) return [];
    const { data, error: rpcErr } = await (supabase as any).rpc("get_house_photo_history", {
      p_house_id: houseId,
      p_project_id: projectId,
    });
    if (rpcErr) throw rpcErr;
    const allRows = (data || []) as Omit<HousePhotoEntry, "url">[];
    setTotalCount(allRows.length);
    const rows = limit == null ? allRows : allRows.slice(0, limit);
    setHasMore(limit != null && allRows.length > rows.length);
    const withUrls = await Promise.all(rows.map(async (r) => {
      const { data: signed } = await (supabase.storage
        .from("diary-photos") as any).createSignedUrl(r.storage_path, 60 * 60, {
          transform: { width: 900, resize: "contain", quality: 70 },
        });
      return { ...r, url: signed?.signedUrl || "" } as HousePhotoEntry;
    }));
    return withUrls;
  }, [houseId, projectId]);

  const reload = useCallback(async () => {
    if (houseId == null || !projectId) {
      setPhotos([]);
      setTotalCount(0);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPhotos(initialLimit);
      setPhotos(result);
    } catch (e: any) {
      setError(e.message || "Falha ao carregar histórico");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [houseId, projectId, fetchPhotos, initialLimit]);

  const loadAll = useCallback(async () => {
    if (houseId == null || !projectId) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await fetchPhotos(null);
      setPhotos(result);
    } catch (e: any) {
      setError(e.message || "Falha ao carregar histórico completo");
    } finally {
      setLoadingMore(false);
    }
  }, [houseId, projectId, fetchPhotos]);

  useEffect(() => { reload(); }, [reload]);

  return { photos, totalCount, hasMore, loading, loadingMore, error, reload, loadAll };
}
