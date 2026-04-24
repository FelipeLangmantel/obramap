// Cache local de projetos/casas/quadras para abrir Mapa Interativo,
// Mapa de Obras, Gráficos e Mapa 3D INSTANTANEAMENTE — inclusive offline.
//
// Estratégia: stale-while-revalidate.
// - Ao abrir, hidrata UI com cache local (instantâneo).
// - Em paralelo, busca do servidor e atualiza o cache + UI.
// - Sem internet: usa apenas o cache.

import { offlineDB } from "./db";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30min — UI ainda funciona, mas marca como "atualizando"

export interface CachedProjectSnapshot {
  id: string;
  data: any;                  // objeto Project completo (com houses + quadras)
  updated_at: string;
}

export async function saveProjectSnapshot(projectId: string, data: any): Promise<void> {
  try {
    await offlineDB.cached_projects.put({
      id: projectId,
      data,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    // Cache é best-effort — não quebra a UI se falhar (ex.: quota cheia)
    console.warn("[projectCache] save failed", err);
  }
}

export async function getProjectSnapshot(projectId: string): Promise<CachedProjectSnapshot | null> {
  try {
    const row = await offlineDB.cached_projects.get(projectId);
    return row || null;
  } catch (err) {
    console.warn("[projectCache] get failed", err);
    return null;
  }
}

export async function getAllProjectSnapshots(): Promise<CachedProjectSnapshot[]> {
  try {
    return await offlineDB.cached_projects.toArray();
  } catch {
    return [];
  }
}

export function isSnapshotStale(snap: CachedProjectSnapshot): boolean {
  const age = Date.now() - new Date(snap.updated_at).getTime();
  return age > STALE_AFTER_MS;
}

export async function clearProjectSnapshot(projectId: string): Promise<void> {
  try {
    await offlineDB.cached_projects.delete(projectId);
  } catch {
    // ignore
  }
}
