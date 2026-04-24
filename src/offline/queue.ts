// API pública para enfileirar lançamentos do Diário quando offline.
// Usada pela UI ao invés do INSERT direto no Supabase.

import {
  offlineDB,
  generateClientUuid,
  type PendingDiaryEntry,
  type PendingDiaryItem,
  type PendingProduction,
  type PendingMedia,
} from "./db";
import { compressPhoto, validateVideo } from "./media";
import { scheduleSync } from "./sync";

export interface QueueDiaryEntryArgs {
  project_id: string;
  company_id: string | null;
  user_id: string;
  data: string; // YYYY-MM-DD
  payload: Record<string, any>;
}

export async function queueDiaryEntry(args: QueueDiaryEntryArgs): Promise<string> {
  const client_uuid = generateClientUuid();
  const entry: PendingDiaryEntry = {
    client_uuid,
    project_id: args.project_id,
    company_id: args.company_id,
    user_id: args.user_id,
    data: args.data,
    payload: args.payload,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.diary_entries.add(entry);
  void scheduleSync();
  return client_uuid;
}

export async function queueDiaryItem(
  diary_entry_client_uuid: string,
  payload: Record<string, any>
): Promise<string> {
  const client_uuid = generateClientUuid();
  const item: PendingDiaryItem = {
    client_uuid,
    diary_entry_client_uuid,
    payload,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.diary_items.add(item);
  void scheduleSync();
  return client_uuid;
}

export async function queueProduction(
  diary_entry_client_uuid: string,
  table: "productions" | "weekly_productions",
  payload: Record<string, any>
): Promise<string> {
  const client_uuid = generateClientUuid();
  const prod: PendingProduction = {
    client_uuid,
    diary_entry_client_uuid,
    table,
    payload,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.productions.add(prod);
  void scheduleSync();
  return client_uuid;
}

export interface QueuePhotoArgs {
  diary_entry_client_uuid: string;
  company_id: string | null;
  file: File;
}

export async function queuePhoto(args: QueuePhotoArgs): Promise<string> {
  const compressed = await compressPhoto(args.file);
  const client_uuid = generateClientUuid();
  const media: PendingMedia = {
    client_uuid,
    diary_entry_client_uuid: args.diary_entry_client_uuid,
    company_id: args.company_id,
    tipo: "foto",
    nome_original: args.file.name.replace(/\.[^.]+$/, "") + ".jpg",
    content_type: "image/jpeg",
    tamanho_bytes: compressed.blob.size,
    blob: compressed.blob,
    thumbnail_blob: compressed.thumbnail,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.media.add(media);
  void scheduleSync();
  return client_uuid;
}

export interface QueueVideoArgs {
  diary_entry_client_uuid: string;
  company_id: string | null;
  file: File;
}

export async function queueVideo(args: QueueVideoArgs): Promise<string> {
  await validateVideo(args.file);
  const client_uuid = generateClientUuid();
  const media: PendingMedia = {
    client_uuid,
    diary_entry_client_uuid: args.diary_entry_client_uuid,
    company_id: args.company_id,
    tipo: "video",
    nome_original: args.file.name,
    content_type: args.file.type || "video/mp4",
    tamanho_bytes: args.file.size,
    blob: args.file,
    thumbnail_blob: null,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.media.add(media);
  void scheduleSync();
  return client_uuid;
}

export interface QueueAttachmentArgs {
  diary_entry_client_uuid: string;
  company_id: string | null;
  file: File;
}

export async function queueAttachment(args: QueueAttachmentArgs): Promise<string> {
  const client_uuid = generateClientUuid();
  const media: PendingMedia = {
    client_uuid,
    diary_entry_client_uuid: args.diary_entry_client_uuid,
    company_id: args.company_id,
    tipo: "anexo",
    nome_original: args.file.name,
    content_type: args.file.type || "application/octet-stream",
    tamanho_bytes: args.file.size,
    blob: args.file,
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  await offlineDB.media.add(media);
  void scheduleSync();
  return client_uuid;
}
