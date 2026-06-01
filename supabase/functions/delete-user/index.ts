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

    // Create client with user's token to verify they are system_admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return jsonResponse({ error: "Sessão inválida. Faça login novamente." }, 401);
    }

    // Check if current user is system_admin
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("system_role")
      .eq("user_id", currentUser.id)
      .single();

    if (profileError || profile?.system_role !== "system_admin") {
      return jsonResponse({ error: "Sem permissão. Apenas System Admin pode excluir usuários." }, 403);
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

    // Prevent self-deletion
    if (user_id === currentUser.id) {
      return jsonResponse({ error: "Você não pode excluir a própria conta." }, 400);
    }

    // Check if target user is system_admin (cannot delete system admins)
    const { data: targetProfile, error: targetError } = await supabaseClient
      .from("profiles")
      .select("system_role, email")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetError) {
      console.error("Error fetching target profile:", targetError);
      return jsonResponse({ error: "Erro ao verificar o usuário selecionado." }, 500);
    }

    if (!targetProfile) {
      return jsonResponse({ error: "Usuário não encontrado no ObraMap." }, 404);
    }

    if (targetProfile?.system_role === "system_admin") {
      return jsonResponse({ error: "Não é possível excluir usuários System Admin." }, 400);
    }

    // Create admin client to delete from auth.users
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Delete user from auth.users (this will cascade to profiles due to FK)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (deleteError) {
      // If user is already gone, treat as success
      if (deleteError.status === 404 || deleteError.message?.includes('not found')) {
        console.log("User already deleted from auth, cleaning up profile if needed");
        // Ensure profile is also removed
        await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      } else {
        console.error("Error deleting user:", deleteError);
        return jsonResponse({ error: `Erro ao remover usuário do Auth: ${deleteError.message}` }, 500);
      }
    }

    return jsonResponse({ success: true, message: "Usuário excluído com sucesso." });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
