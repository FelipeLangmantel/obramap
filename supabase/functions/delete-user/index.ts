import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return "Unknown error";
}

function isAuthUserNotFound(error: { status?: number; message?: string } | null | undefined) {
  const message = (error?.message || "").toLowerCase();
  return error?.status === 404 || message.includes("not found") || message.includes("user not found");
}

function isAuthDatabaseLoadError(error: { message?: string } | null | undefined) {
  return (error?.message || "").toLowerCase().includes("database error loading user");
}

async function deleteAuthUserSafely(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  context: Record<string, unknown>,
) {
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (!deleteError) {
    return { authRemoved: true, fallbackUsed: false };
  }

  if (isAuthUserNotFound(deleteError)) {
    console.warn("Auth user already absent during delete-user", {
      ...context,
      authError: deleteError.message,
    });
    return { authRemoved: false, fallbackUsed: false };
  }

  if (!isAuthDatabaseLoadError(deleteError)) {
    console.error("Auth admin deleteUser failed", {
      ...context,
      status: deleteError.status,
      authError: deleteError.message,
    });
    throw deleteError;
  }

  console.warn("Auth admin deleteUser failed loading user; trying direct auth.users fallback", {
    ...context,
    status: deleteError.status,
    authError: deleteError.message,
  });

  const { error: directDeleteError } = await supabaseAdmin
    .schema("auth")
    .from("users")
    .delete()
    .eq("id", userId);

  if (directDeleteError) {
    console.error("Direct auth.users fallback delete failed", {
      ...context,
      authError: deleteError.message,
      fallbackError: directDeleteError.message,
      fallbackCode: directDeleteError.code,
    });
    throw deleteError;
  }

  console.warn("Direct auth.users fallback delete succeeded", context);
  return { authRemoved: true, fallbackUsed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Sessao ausente. Faca login novamente." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("delete-user configuration error", {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasAnonKey: Boolean(anonKey),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return jsonResponse({ error: "Configuracao do servidor indisponivel." }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: currentUser },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return jsonResponse({ error: "Sessao invalida. Faca login novamente." }, 401);
    }

    const { data: callerProfile, error: callerError } = await supabaseClient
      .from("profiles")
      .select("system_role, company_id")
      .eq("user_id", currentUser.id)
      .single();

    if (callerError || !callerProfile) {
      return jsonResponse({ error: "Nao foi possivel validar suas permissoes." }, 403);
    }

    const isSystemAdmin = callerProfile.system_role === "system_admin";
    const hasCompanyAdminProfile = callerProfile.system_role === "admin";

    let callerIsCompanyAdmin = hasCompanyAdminProfile;
    if (!isSystemAdmin) {
      const { data: roleRow } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .eq("role", "admin")
        .maybeSingle();
      callerIsCompanyAdmin = callerIsCompanyAdmin || !!roleRow;
    }

    if (!isSystemAdmin && !callerIsCompanyAdmin) {
      return jsonResponse({ error: "Sem permissao. Apenas Administradores podem excluir usuarios." }, 403);
    }

    let payload: { user_id?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Payload invalido." }, 400);
    }

    const { user_id } = payload;
    if (!user_id) {
      return jsonResponse({ error: "Parametro obrigatorio ausente: user_id." }, 400);
    }

    if (user_id === currentUser.id) {
      return jsonResponse({ error: "Voce nao pode excluir a propria conta." }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, system_role, email, company_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetError) {
      console.error("Error fetching target profile:", {
        requested_user_id: user_id,
        error: targetError.message,
      });
      return jsonResponse({ error: "Erro ao verificar o usuario selecionado." }, 500);
    }

    if (!targetProfile && !isSystemAdmin) {
      return jsonResponse({ error: "Usuario nao encontrado nesta empresa." }, 404);
    }

    if (targetProfile?.system_role === "system_admin") {
      return jsonResponse({ error: "Nao e possivel excluir usuarios System Admin." }, 400);
    }

    if (!isSystemAdmin) {
      if (!callerProfile.company_id || targetProfile?.company_id !== callerProfile.company_id) {
        return jsonResponse({ error: "Voce so pode excluir usuarios da sua empresa." }, 403);
      }
    }

    const logContext = {
      requested_user_id: user_id,
      target_email: targetProfile?.email ?? null,
      target_company_id: targetProfile?.company_id ?? null,
      caller_user_id: currentUser.id,
      caller_company_id: callerProfile.company_id ?? null,
      caller_is_system_admin: isSystemAdmin,
    };

    let authRemoved = false;
    let fallbackUsed = false;
    try {
      const result = await deleteAuthUserSafely(supabaseAdmin, user_id, logContext);
      authRemoved = result.authRemoved;
      fallbackUsed = result.fallbackUsed;
    } catch (deleteError) {
      const message = getErrorMessage(deleteError);
      return jsonResponse({
        error: `Falha ao excluir do Auth: ${message}. Nenhuma alteracao realizada.`,
      }, 500);
    }

    const cleanupErrors: string[] = [];

    const { error: permCleanupError } = await supabaseAdmin
      .from("user_permissions")
      .delete()
      .eq("user_id", user_id);
    if (permCleanupError) cleanupErrors.push(`user_permissions: ${permCleanupError.message}`);

    const { error: roleCleanupError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user_id);
    if (roleCleanupError) cleanupErrors.push(`user_roles: ${roleCleanupError.message}`);

    const { error: profileCleanupError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("user_id", user_id);
    if (profileCleanupError) cleanupErrors.push(`profiles: ${profileCleanupError.message}`);

    if (cleanupErrors.length > 0) {
      console.error("delete-user public cleanup failed after auth delete", {
        ...logContext,
        authRemoved,
        fallbackUsed,
        cleanupErrors,
      });
      return jsonResponse({
        error: "Usuario removido do Auth, mas houve falha ao limpar registros do painel. Acione o suporte.",
      }, 500);
    }

    return jsonResponse({
      success: true,
      auth_removed: authRemoved,
      fallback_used: fallbackUsed,
      message: authRemoved
        ? "Usuario excluido definitivamente (painel + Auth)."
        : "Usuario ja nao existia no Auth; registros do painel foram limpos.",
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = getErrorMessage(error);
    return jsonResponse({ error: message }, 500);
  }
});
