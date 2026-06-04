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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Sessão ausente. Faça login novamente." }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return jsonResponse({ error: "Sessão inválida. Faça login novamente." }, 401);
    }

    // Carrega perfil do solicitante (system_role + company_id)
    const { data: callerProfile, error: callerError } = await supabaseClient
      .from("profiles")
      .select("system_role, company_id")
      .eq("user_id", currentUser.id)
      .single();

    if (callerError || !callerProfile) {
      return jsonResponse({ error: "Não foi possível validar suas permissões." }, 403);
    }

    const isSystemAdmin = callerProfile.system_role === "system_admin";

    // Se não for system_admin, precisa ser admin de empresa (user_roles.role = 'admin')
    let callerIsCompanyAdmin = false;
    if (!isSystemAdmin) {
      const { data: roleRow } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .eq("role", "admin")
        .maybeSingle();
      callerIsCompanyAdmin = !!roleRow;
    }

    if (!isSystemAdmin && !callerIsCompanyAdmin) {
      return jsonResponse({ error: "Sem permissão. Apenas Administradores podem excluir usuários." }, 403);
    }

    let payload: { user_id?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Payload inválido." }, 400);
    }
    const { user_id } = payload;

    if (!user_id) {
      return jsonResponse({ error: "Parâmetro obrigatório ausente: user_id." }, 400);
    }

    if (user_id === currentUser.id) {
      return jsonResponse({ error: "Você não pode excluir a própria conta." }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Busca perfil-alvo (via admin para evitar bloqueio por RLS)
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, system_role, email, company_id")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetError) {
      console.error("Error fetching target profile:", targetError);
      return jsonResponse({ error: "Erro ao verificar o usuário selecionado." }, 500);
    }

    // Mesmo que o profile não exista mais, ainda pode haver registro órfão em auth.users.
    // System admin pode prosseguir; admin de empresa precisa do profile para validar empresa.
    if (!targetProfile && !isSystemAdmin) {
      return jsonResponse({ error: "Usuário não encontrado nesta empresa." }, 404);
    }

    if (targetProfile?.system_role === "system_admin") {
      return jsonResponse({ error: "Não é possível excluir usuários System Admin." }, 400);
    }

    // Admin de empresa só pode excluir usuários da mesma empresa
    if (!isSystemAdmin) {
      if (!callerProfile.company_id || targetProfile?.company_id !== callerProfile.company_id) {
        return jsonResponse({ error: "Você só pode excluir usuários da sua empresa." }, 403);
      }
    }

    // 1) Remove de auth.users (cascata limpa profile/user_roles/user_permissions via FK)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    let authRemoved = true;
    if (deleteError) {
      const notFound = deleteError.status === 404 || (deleteError.message || "").toLowerCase().includes("not found");
      if (!notFound) {
        console.error("Error deleting auth user:", deleteError);
        return jsonResponse({
          error: `Falha ao excluir do Auth: ${deleteError.message}. Nenhuma alteração realizada.`,
        }, 500);
      }
      authRemoved = false; // já não existia em auth.users
    }

    // 2) Garante limpeza no public schema caso a cascata não tenha resolvido tudo
    await supabaseAdmin.from("user_permissions").delete().eq("user_id", user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
    await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);

    return jsonResponse({
      success: true,
      auth_removed: authRemoved,
      message: authRemoved
        ? "Usuário excluído definitivamente (painel + Auth)."
        : "Usuário já não existia no Auth; registros do painel foram limpos.",
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
