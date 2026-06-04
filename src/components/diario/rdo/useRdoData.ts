import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCachedPhotoSignedUrl } from "@/lib/photoSignedUrlCache";
import type {
  RdoLabor, RdoEquipment, RdoActivity, RdoOccurrence,
  RdoChecklistItem, RdoComment, RdoAttachment,
} from "./types";

export function useRdoData(entryId: string | null) {
  const [labor, setLabor] = useState<RdoLabor[]>([]);
  const [equipment, setEquipment] = useState<RdoEquipment[]>([]);
  const [activities, setActivities] = useState<RdoActivity[]>([]);
  const [occurrences, setOccurrences] = useState<RdoOccurrence[]>([]);
  const [checklist, setChecklist] = useState<RdoChecklistItem[]>([]);
  const [comments, setComments] = useState<RdoComment[]>([]);
  const [videos, setVideos] = useState<RdoAttachment[]>([]);
  const [attachments, setAttachments] = useState<RdoAttachment[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAttachments = useCallback(async (eId: string) => {
    const { data } = await supabase
      .from("diary_attachments")
      .select("id, tipo, storage_path, nome_original, tamanho_bytes")
      .eq("diary_entry_id", eId)
      .order("created_at", { ascending: true });

    if (!data) {
      setVideos([]); setAttachments([]); return;
    }

    const withUrls = await Promise.all(
      data.map(async (a) => {
        const signedUrl = await getCachedPhotoSignedUrl({
          bucket: "diary-attachments",
          path: a.storage_path,
        });
        return { ...a, url: signedUrl || "" } as RdoAttachment;
      })
    );

    setVideos(withUrls.filter(a => a.tipo === "video"));
    setAttachments(withUrls.filter(a => a.tipo === "anexo"));
  }, []);

  const reload = useCallback(async (eId: string | null) => {
    if (!eId) {
      setLabor([]); setEquipment([]); setActivities([]);
      setOccurrences([]); setChecklist([]); setComments([]);
      setVideos([]); setAttachments([]);
      return;
    }
    setLoading(true);
    try {
      const [l, eq, a, oc, ck, cm] = await Promise.all([
        supabase.from("diary_labor").select("id, nome, categoria, quantidade").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
        supabase.from("diary_equipment").select("id, nome, quantidade").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
        supabase.from("diary_activities").select("id, descricao, localizacao").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
        supabase.from("diary_occurrences").select("id, descricao, tags").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
        supabase.from("diary_checklist").select("id, item, concluido").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
        supabase.from("diary_comments").select("id, texto, autor_nome, created_at").eq("diary_entry_id", eId).is("deleted_at", null).order("created_at"),
      ]);
      setLabor((l.data as any) || []);
      setEquipment((eq.data as any) || []);
      setActivities((a.data as any) || []);
      setOccurrences((oc.data as any) || []);
      setChecklist((ck.data as any) || []);
      setComments((cm.data as any) || []);
      await loadAttachments(eId);
    } finally {
      setLoading(false);
    }
  }, [loadAttachments]);

  useEffect(() => { reload(entryId); }, [entryId, reload]);

  return {
    labor, equipment, activities, occurrences, checklist, comments,
    videos, attachments, loading, reload, loadAttachments,
  };
}
