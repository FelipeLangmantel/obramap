// Worker de sincronização do Diário de Obra offline.
//
// Ordem obrigatória de sincronização (por causa de FKs):
//   1) diary_entries  — cria a entry no banco e captura o remote_id
//   2) diary_items    — usa o remote_id da entry pai
//   3) productions / weekly_productions — idem
//   4) media          — upload para Storage + insert em diary_attachments
//
// Idempotência: cada item carrega um client_uuid. Se o servidor já tem
// um registro com aquele client_uuid (índice único), o INSERT falha e
// nós tratamos como "já sincronizado".

import { supabase } from "@/integrations/supabase/client";
import {
  offlineDB,
  countPending,
  getDeviceId,
  type PendingDiaryEntry,
  type PendingDiaryItem,
  type PendingProduction,
  type PendingMedia,
} from "./db";

type SyncEvent =
  | { type: "start" }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; synced: number; failed: number; recomputed_projects: string[] }
  | { type: "error"; message: string };

type Listener = (e: SyncEvent) => void;
const listeners = new Set<Listener>();
export function subscribeSync(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function emit(e: SyncEvent) { listeners.forEach((l) => { try { l(e); } catch {} }); }

let isSyncing = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;

export function isSyncRunning() { return isSyncing; }

export async function scheduleSync(delayMs = 500): Promise<void> {
  if (scheduled) clearTimeout(scheduled);
  scheduled = setTimeout(() => { scheduled = null; void runSync(); }, delayMs);
}

async function logDeviceSync(args: {
  pending: number; status: "ok" | "error"; error?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    const usage = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    await supabase.from("device_sync_log").upsert({
      user_id: user.id,
      company_id: profile?.company_id ?? null,
      device_id: getDeviceId(),
      device_label: navigator.userAgent.slice(0, 200),
      last_sync_at: new Date().toISOString(),
      pending_count: args.pending,
      last_status: args.status,
      last_error: args.error ?? null,
      storage_estimate_bytes: usage?.usage ?? null,
    }, { onConflict: "user_id,device_id" });
  } catch {/* não crítico */}
}

// ───────────────────────────── Sync de uma entry pai
async function syncEntry(entry: PendingDiaryEntry): Promise<string | null> {
  await offlineDB.diary_entries.update(entry.client_uuid, { status: "syncing" });

  // 1) Verifica se já existe (idempotência)
  const { data: existing } = await supabase
    .from("diary_entries")
    .select("id")
    .eq("client_uuid", entry.client_uuid)
    .maybeSingle();

  if (existing?.id) {
    await offlineDB.diary_entries.update(entry.client_uuid, {
      status: "synced", remote_id: existing.id,
    });
    return existing.id;
  }

  const insertPayload = {
    ...entry.payload,
    client_uuid: entry.client_uuid,
    project_id: entry.project_id,
    company_id: entry.company_id,
    user_id: entry.user_id,
    data: entry.data,
  };

  const { data, error } = await supabase
    .from("diary_entries")
    .insert(insertPayload as any)
    .select("id")
    .single();

  if (error) {
    await offlineDB.diary_entries.update(entry.client_uuid, {
      status: "error",
      attempts: entry.attempts + 1,
      last_error: error.message,
    });
    return null;
  }

  await offlineDB.diary_entries.update(entry.client_uuid, {
    status: "synced", remote_id: data.id,
  });
  return data.id;
}

// Sync genérico de um filho do diário. Aceita overrides de payload
// (ex: para resolver production_id local → production_id remoto).
async function syncChild<T extends PendingDiaryItem | PendingProduction>(
  table: "diary_items" | "productions" | "weekly_productions",
  store: any,
  child: T,
  payloadOverrides: Record<string, any>
): Promise<boolean> {
  await store.update(child.client_uuid, { status: "syncing" });
  const payload = {
    ...child.payload,
    ...payloadOverrides,
    client_uuid: child.client_uuid,
  };
  const { error } = await supabase.from(table as any).insert(payload);
  if (error && !/duplicate key|unique/i.test(error.message)) {
    await store.update(child.client_uuid, {
      status: "error",
      attempts: child.attempts + 1,
      last_error: error.message,
    });
    return false;
  }
  await store.update(child.client_uuid, { status: "synced" });
  return true;
}

// ───────────────────────────── Sync de mídia
async function syncMedia(media: PendingMedia, remoteEntryId: string): Promise<boolean> {
  await offlineDB.media.update(media.client_uuid, { status: "syncing" });
  try {
    const safeName = media.nome_original.replace(/[^a-zA-Z0-9.]/g, "_");
    const folder = media.tipo === "video" ? "videos" : media.tipo === "anexo" ? "anexos" : "fotos";
    const path = `${media.company_id}/${remoteEntryId}/${folder}/${media.client_uuid}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("diary-attachments")
      .upload(path, media.blob, { contentType: media.content_type, upsert: false });

    // Se já existe (retry), seguimos
    if (upErr && !/already exists|duplicate/i.test(upErr.message)) throw upErr;

    const { error: dbErr } = await supabase.from("diary_attachments").insert({
      client_uuid: media.client_uuid,
      company_id: media.company_id,
      diary_entry_id: remoteEntryId,
      tipo: media.tipo === "foto" ? "anexo" : media.tipo, // schema atual aceita "anexo"|"video"
      storage_path: path,
      nome_original: media.nome_original,
      tamanho_bytes: media.tamanho_bytes,
    });

    if (dbErr && !/duplicate key|unique/i.test(dbErr.message)) {
      await supabase.storage.from("diary-attachments").remove([path]);
      throw dbErr;
    }

    await offlineDB.media.update(media.client_uuid, { status: "synced" });
    return true;
  } catch (e: any) {
    await offlineDB.media.update(media.client_uuid, {
      status: "error",
      attempts: media.attempts + 1,
      last_error: e?.message || String(e),
    });
    return false;
  }
}

// ───────────────────────────── Loop principal
export async function runSync(): Promise<void> {
  if (isSyncing) return;
  if (!navigator.onLine) return;

  // Verifica que há sessão
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  isSyncing = true;
  emit({ type: "start" });
  let synced = 0;
  let failed = 0;

  try {
    const entries = await offlineDB.diary_entries
      .where("status").anyOf("pending", "error").toArray();

    const total = await countPending();
    let done = 0;

    for (const entry of entries) {
      const remoteId = entry.remote_id ?? await syncEntry(entry);
      if (!remoteId) { failed++; continue; }
      synced++; done++;
      emit({ type: "progress", done, total });

      // 1) Produções (productions + weekly_productions) — precisam vir antes dos diary_items
      const productionRemoteIdMap = new Map<string, string>(); // client_uuid → remote_id
      const prods = await offlineDB.productions
        .where({ diary_entry_client_uuid: entry.client_uuid })
        .and((p) => p.status === "pending" || p.status === "error")
        .toArray();
      for (const p of prods) {
        const ok = await syncChild(p.table, offlineDB.productions, p, {
          // productions não tem diary_entry_id; o vínculo é via diary_items
        });
        if (ok) {
          // Buscar o remote_id que o servidor atribuiu (via client_uuid)
          const { data: remote } = await supabase
            .from(p.table as any)
            .select("id")
            .eq("client_uuid", p.client_uuid)
            .maybeSingle();
          if (remote && (remote as any).id) {
            productionRemoteIdMap.set(p.client_uuid, (remote as any).id);
          }
        }
        ok ? synced++ : failed++; done++;
        emit({ type: "progress", done, total });
      }

      // 2) diary_items — resolve production_id local → remote
      const items = await offlineDB.diary_items
        .where({ diary_entry_client_uuid: entry.client_uuid })
        .and((i) => i.status === "pending" || i.status === "error")
        .toArray();
      for (const item of items) {
        const localProdRef = item.payload?.production_id as string | undefined;
        const resolvedProdId = localProdRef && productionRemoteIdMap.get(localProdRef);
        const ok = await syncChild("diary_items", offlineDB.diary_items, item, {
          diary_entry_id: remoteId,
          ...(resolvedProdId ? { production_id: resolvedProdId } : {}),
        });
        ok ? synced++ : failed++; done++;
        emit({ type: "progress", done, total });
      }

      const medias = await offlineDB.media
        .where({ diary_entry_client_uuid: entry.client_uuid })
        .and((m) => m.status === "pending" || m.status === "error")
        .toArray();
      for (const m of medias) {
        const ok = await syncMedia(m, remoteId);
        ok ? synced++ : failed++; done++;
        emit({ type: "progress", done, total });
      }
    }

    await logDeviceSync({
      pending: await countPending(),
      status: failed === 0 ? "ok" : "error",
      error: failed > 0 ? `${failed} item(ns) com erro` : undefined,
    });
    emit({ type: "done", synced, failed });
  } catch (e: any) {
    emit({ type: "error", message: e?.message || String(e) });
  } finally {
    isSyncing = false;
  }
}

// ───────────────────────────── Bootstrap (instalado uma vez no App)
let bootstrapped = false;
export function bootstrapSyncWorker(): void {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;

  // Sincroniza ao voltar online
  window.addEventListener("online", () => { void scheduleSync(800); });

  // Sincroniza quando a aba volta a ficar visível
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      void scheduleSync(1500);
    }
  });

  // Tenta a cada 60s (idle catch-up). Só faz algo se houver pendentes e online.
  setInterval(() => {
    if (navigator.onLine) void scheduleSync(0);
  }, 60_000);

  // Disparo inicial logo após o boot
  if (navigator.onLine) void scheduleSync(2000);
}
