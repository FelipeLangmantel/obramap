// Adapter offline-aware para os inserts do Diário de Obra.
//
// Princípio: não quebrar o fluxo online. Se estiver online, faz INSERT
// normal no Supabase e retorna o id gerado pelo servidor. Se estiver
// offline, enfileira no IndexedDB e retorna o client_uuid.
//
// O DiarioObraView só precisa saber se a operação foi "para a rede" ou
// "para a fila" — o resto da UI atualiza igual.

import { supabase } from "@/integrations/supabase/client";
import {
  queueDiaryEntry,
  queueDiaryItem,
  queueProduction,
} from "@/offline/queue";
import { generateClientUuid } from "@/offline/db";

export type WriteMode = "online" | "queued";

export interface WriteResult<T = string> {
  id: T;                  // remote_id (online) ou client_uuid (queued)
  client_uuid: string;
  mode: WriteMode;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// ───────────────────────────── diary_entries
export interface CreateDiaryEntryInput {
  project_id: string;
  company_id: string;
  user_id: string;
  data: string;             // YYYY-MM-DD
  payload: Record<string, any>;  // demais colunas
}

export async function createDiaryEntryAware(
  input: CreateDiaryEntryInput
): Promise<WriteResult & { num_relatorio?: number | null }> {
  const client_uuid = generateClientUuid();

  if (isOnline()) {
    // NOTA: a tabela `diary_entries` não tem coluna `user_id` — quem identifica
    // o autor é `engineer_id` (já incluído em `input.payload`). O `user_id` é
    // mantido apenas no input para uso pela fila offline (rastreio local).
    const { data, error } = await supabase
      .from("diary_entries")
      .insert({
        ...input.payload,
        client_uuid,
        company_id: input.company_id,
        project_id: input.project_id,
      } as any)
      .select("id, num_relatorio")
      .single();
    if (error) throw error;
    return {
      id: data.id,
      client_uuid,
      mode: "online",
      num_relatorio: (data as any).num_relatorio ?? null,
    };
  }

  // Offline → enfileira
  const queued_uuid = await queueDiaryEntry({
    project_id: input.project_id,
    company_id: input.company_id,
    user_id: input.user_id,
    data: input.data,
    payload: input.payload,
  });
  return { id: queued_uuid, client_uuid: queued_uuid, mode: "queued" };
}

// ───────────────────────────── productions
export async function createProductionAware(
  diaryEntryRef: string,           // remote_id se online, client_uuid se offline
  payload: Record<string, any>
): Promise<WriteResult> {
  const client_uuid = generateClientUuid();

  if (isOnline()) {
    const { data, error } = await supabase
      .from("productions")
      .insert({ ...payload, client_uuid } as any)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, client_uuid, mode: "online" };
  }

  await queueProduction(diaryEntryRef, "productions", payload);
  return { id: client_uuid, client_uuid, mode: "queued" };
}

// ───────────────────────────── weekly_productions
export async function createWeeklyProductionAware(
  diaryEntryRef: string,
  payload: Record<string, any>
): Promise<WriteResult> {
  const client_uuid = generateClientUuid();

  if (isOnline()) {
    const { data, error } = await supabase
      .from("weekly_productions")
      .insert({ ...payload, client_uuid } as any)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, client_uuid, mode: "online" };
  }

  await queueProduction(diaryEntryRef, "weekly_productions", payload);
  return { id: client_uuid, client_uuid, mode: "queued" };
}

// ───────────────────────────── diary_items
export async function createDiaryItemAware(
  diaryEntryRef: string,
  productionId: string,
  payload: Record<string, any>
): Promise<WriteResult> {
  const client_uuid = generateClientUuid();
  const fullPayload = { ...payload, production_id: productionId, diary_entry_id: diaryEntryRef };

  if (isOnline()) {
    const { data, error } = await supabase
      .from("diary_items")
      .insert({ ...fullPayload, client_uuid } as any)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id, client_uuid, mode: "online" };
  }

  // Offline: o diary_entry_id ainda não existe no servidor. Salvamos com referência ao client_uuid
  // e o sync worker resolve para o remote_id na hora de enviar.
  await queueDiaryItem(diaryEntryRef, payload);
  return { id: client_uuid, client_uuid, mode: "queued" };
}
