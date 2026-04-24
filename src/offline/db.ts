// Camada de persistência offline para o Diário de Obra (PWA)
// Tudo aqui roda no browser via IndexedDB. A fila é processada pelo
// sync worker quando a internet volta.

import Dexie, { type Table } from "dexie";

// ───────────────────────────────────────────── Tipos da fila

export type SyncStatus = "pending" | "syncing" | "synced" | "error";

export interface PendingDiaryEntry {
  client_uuid: string;             // PK gerado no celular (idempotência)
  project_id: string;
  company_id: string | null;
  user_id: string;
  data: string;                     // YYYY-MM-DD
  payload: Record<string, any>;     // colunas da tabela diary_entries
  created_at: string;
  status: SyncStatus;
  attempts: number;
  last_error?: string;
  remote_id?: string;               // preenchido após sincronizar
}

export interface PendingDiaryItem {
  client_uuid: string;
  diary_entry_client_uuid: string;  // referência local à entry pai
  payload: Record<string, any>;
  created_at: string;
  status: SyncStatus;
  attempts: number;
  last_error?: string;
}

export interface PendingProduction {
  client_uuid: string;
  diary_entry_client_uuid: string;
  table: "productions" | "weekly_productions";
  payload: Record<string, any>;
  created_at: string;
  status: SyncStatus;
  attempts: number;
  last_error?: string;
}

export interface PendingMedia {
  client_uuid: string;
  diary_entry_client_uuid: string;
  company_id: string | null;
  tipo: "video" | "anexo" | "foto";
  nome_original: string;
  content_type: string;
  tamanho_bytes: number;
  blob: Blob;                       // arquivo já comprimido
  thumbnail_blob?: Blob | null;     // thumbnail JPEG ~300px (apenas fotos)
  created_at: string;
  status: SyncStatus;
  attempts: number;
  last_error?: string;
}

// ───────────────────────────────────────────── Cache de leitura

export interface CachedProject {
  id: string;
  data: any;
  updated_at: string;
}

export interface CachedHouse {
  id: string;
  project_id: string;
  data: any;
  updated_at: string;
}

// ───────────────────────────────────────────── DB

class ObraMapOfflineDB extends Dexie {
  diary_entries!: Table<PendingDiaryEntry, string>;
  diary_items!: Table<PendingDiaryItem, string>;
  productions!: Table<PendingProduction, string>;
  media!: Table<PendingMedia, string>;
  cached_projects!: Table<CachedProject, string>;
  cached_houses!: Table<CachedHouse, string>;

  constructor() {
    super("obramap_offline");
    this.version(1).stores({
      diary_entries: "client_uuid, project_id, status, created_at",
      diary_items: "client_uuid, diary_entry_client_uuid, status",
      productions: "client_uuid, diary_entry_client_uuid, status",
      media: "client_uuid, diary_entry_client_uuid, status, tipo",
      cached_projects: "id, updated_at",
      cached_houses: "id, project_id",
    });
  }
}

export const offlineDB = new ObraMapOfflineDB();

// ───────────────────────────────────────────── Helpers

export function generateClientUuid(): string {
  // crypto.randomUUID está disponível em todos os browsers modernos (>2022)
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback simples
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function countPending(): Promise<number> {
  const [e, i, p, m] = await Promise.all([
    offlineDB.diary_entries.where("status").anyOf("pending", "error").count(),
    offlineDB.diary_items.where("status").anyOf("pending", "error").count(),
    offlineDB.productions.where("status").anyOf("pending", "error").count(),
    offlineDB.media.where("status").anyOf("pending", "error").count(),
  ]);
  return e + i + p + m;
}

export async function clearSyncedItems(): Promise<void> {
  await Promise.all([
    offlineDB.diary_entries.where("status").equals("synced").delete(),
    offlineDB.diary_items.where("status").equals("synced").delete(),
    offlineDB.productions.where("status").equals("synced").delete(),
    offlineDB.media.where("status").equals("synced").delete(),
  ]);
}

// Estimativa de uso de storage (em bytes)
export async function estimateStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return { usage: est.usage || 0, quota: est.quota || 0 };
}

// Pede ao browser para tornar o storage persistente (não evictável)
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  return await navigator.storage.persist();
}

// Identificador único do dispositivo (persistido em localStorage)
export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "obramap_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = generateClientUuid();
    localStorage.setItem(KEY, id);
  }
  return id;
}
