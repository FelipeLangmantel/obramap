// Edge Function: delete-3d-model-files
// Exclusão real CONTROLADA de modelos 3D antigos/órfãos.
// Validações no backend (RPC validate_3d_model_files_for_delete).
// Nunca apaga modelo ativo, preservado, parte complementar,
// arquivo de outra company/project, ou path fora do bucket 3d-models.
// Arquivos recentes exigem allow_recent_delete=true + administrador da empresa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUIRED_CONFIRMATION = "EXCLUIR MODELOS 3D";
const REQUIRED_RECENT_CONFIRMATION = "EXCLUIR MODELOS 3D RECENTES";
const BUCKET = "3d-models";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente do usuário (valida JWT + chama RPC com a identidade dele)
  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: "unauthorized" }, 401);
  }
  const userId = claimsData.claims.sub as string;

  // Body
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const projectId = typeof body?.project_id === "string" ? body.project_id : null;
  const paths: string[] = Array.isArray(body?.paths)
    ? body.paths.filter((p: unknown) => typeof p === "string" && p.length > 0)
    : [];
  const deleteReason = typeof body?.delete_reason === "string" ? body.delete_reason.slice(0, 500) : "";
  const confirmationText = typeof body?.confirmation_text === "string" ? body.confirmation_text : "";
  const allowRecentDelete = body?.allow_recent_delete === true;

  if (!projectId) return json({ error: "project_id_required" }, 400);
  if (paths.length === 0) return json({ error: "no_paths_selected" }, 400);
  if (paths.length > 200) return json({ error: "too_many_paths_max_200" }, 400);
  const requiredConfirmation = allowRecentDelete ? REQUIRED_RECENT_CONFIRMATION : REQUIRED_CONFIRMATION;
  if (confirmationText !== requiredConfirmation) {
    return json({ error: "confirmation_mismatch", required: requiredConfirmation }, 400);
  }

  if (allowRecentDelete) {
    const { data: projectRow, error: projectError } = await userClient
      .from("projects")
      .select("company_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || !projectRow?.company_id) {
      return json({ error: "project_not_found_or_no_company" }, 400);
    }

    const { data: isCompanyAdmin, error: adminError } = await userClient.rpc(
      "is_company_admin",
      { _user_id: userId, _company_id: projectRow.company_id },
    );
    if (adminError || isCompanyAdmin !== true) {
      return json({ error: "not_company_admin_for_recent" }, 403);
    }
  }

  // Validação final no backend via RPC (roda como o usuário; respeita company)
  const { data: validation, error: validationError } = await userClient.rpc(
    "validate_3d_model_files_for_delete",
    { _project_id: projectId, _paths: paths, _allow_recent_delete: allowRecentDelete },
  );
  if (validationError) {
    const msg = validationError.message || "";
    // Assinatura/migration desatualizada no Cloud
    const sigError = /function .* does not exist/i.test(msg) || /PGRST202/i.test(msg);
    return json({
      error: sigError ? "rpc_signature_error" : "validation_failed",
      detail: msg,
    }, 400);
  }

  const rows = (validation ?? []) as Array<{
    storage_path: string;
    can_delete: boolean;
    blocked_reason: string;
    size_bytes: number | null;
    current_status: string;
  }>;

  const allowed = rows.filter((r) => r.can_delete === true);
  const blocked = rows.filter((r) => r.can_delete !== true);

  if (allowed.length === 0) {
    return json({
      error: "no_deletable_files",
      deleted: [],
      blocked,
      errors: [],
      total_bytes_removed: 0,
    }, 400);
  }

  // Service client SOMENTE dentro da Edge Function (nunca exposto ao client)
  const admin = createClient(SUPABASE_URL, SERVICE);

  // Remove no Storage
  const allowedPaths = allowed.map((r) => r.storage_path);
  const { data: removed, error: removeError } = await admin.storage
    .from(BUCKET)
    .remove(allowedPaths);

  if (removeError) {
    return json({
      error: "storage_remove_failed",
      detail: removeError.message,
      blocked,
    }, 500);
  }

  const removedPaths = new Set((removed ?? []).map((o: any) => o.name as string));
  const actuallyDeleted = allowed.filter((r) => removedPaths.has(r.storage_path));
  const removeErrors = allowed.filter((r) => !removedPaths.has(r.storage_path));
  const totalBytes = actuallyDeleted.reduce((s, r) => s + (r.size_bytes ?? 0), 0);

  // Atualiza map_3d_model_files (soft mark) e registra auditoria
  if (actuallyDeleted.length > 0) {
    const pathsOk = actuallyDeleted.map((r) => r.storage_path);

    await admin
      .from("map_3d_model_files")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        delete_reason: deleteReason || "Exclusão manual via aba Modelos 3D",
      })
      .in("storage_path", pathsOk);

    // company_id por path para a auditoria (lookup do registro, se existir)
    const { data: regRows } = await admin
      .from("map_3d_model_files")
      .select("storage_path, company_id, project_id")
      .in("storage_path", pathsOk);
    const regMap = new Map<string, { company_id: string; project_id: string }>();
    for (const r of regRows ?? []) regMap.set((r as any).storage_path, r as any);

    // Fallback: extrai company/project do próprio path {company}/{project}/...
    const auditRows = actuallyDeleted.map((r) => {
      const reg = regMap.get(r.storage_path);
      const seg = r.storage_path.split("/");
      return {
        project_id: reg?.project_id ?? (seg[1] || projectId),
        company_id: reg?.company_id ?? seg[0],
        storage_bucket: BUCKET,
        storage_path: r.storage_path,
        size_bytes: r.size_bytes,
        source_status: r.current_status,
        deleted_by: userId,
        delete_reason: deleteReason || "Exclusão manual via aba Modelos 3D",
      };
    });

    await admin.from("map_3d_model_file_deletions").insert(auditRows);
  }

  return json({
    deleted: actuallyDeleted,
    blocked,
    errors: removeErrors,
    total_bytes_removed: totalBytes,
  });
});
