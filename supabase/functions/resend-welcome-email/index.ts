import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < 8; i++) pwd += pick(all);
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const appUrl = Deno.env.get("OBRA_MAP_APP_URL") || "https://obramap.app.br";
    const logoUrl = `${appUrl.replace(/\/$/, "")}/obramap_icon_dark.png`;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) return jsonResponse({ error: "Not authenticated" }, 401);

    const { data: callerProfile } = await supabaseClient
      .from("profiles").select("system_role, company_id").eq("user_id", currentUser.id).single();
    if (!callerProfile) return jsonResponse({ error: "Could not fetch caller profile" }, 403);

    const { data: callerRole } = await supabaseClient
      .from("user_roles").select("role").eq("user_id", currentUser.id).maybeSingle();

    const isSystemAdmin = callerProfile.system_role === "system_admin";
    const isCompanyAdmin = callerProfile.system_role === "admin" || callerRole?.role === "admin";
    if (!isSystemAdmin && !isCompanyAdmin) {
      return jsonResponse({ error: "Unauthorized" }, 403);
    }

    const { user_id } = await req.json();
    if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, display_name, company_id, system_role")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetErr || !targetProfile) return jsonResponse({ error: "Target user not found" }, 404);

    if (!isSystemAdmin && targetProfile.company_id !== callerProfile.company_id) {
      return jsonResponse({ error: "Unauthorized - other company" }, 403);
    }
    if (targetProfile.system_role === "system_admin" && !isSystemAdmin) {
      return jsonResponse({ error: "Unauthorized - cannot reset system admin" }, 403);
    }

    const targetEmail = String(targetProfile.email ?? "").trim().toLowerCase();
    if (!targetEmail) return jsonResponse({ error: "Target user has no email" }, 400);

    // Generate new temp password and update auth user
    const tempPassword = generateTempPassword();
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: tempPassword,
    });
    if (updErr) {
      console.error("Failed to update password:", updErr);
      return jsonResponse({ error: updErr.message || "Failed to update password" }, 500);
    }

    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("user_id", user_id);

    // Resolve company name
    let companyName: string | null = null;
    if (targetProfile.company_id) {
      const { data: company } = await supabaseAdmin
        .from("companies").select("name").eq("id", targetProfile.company_id).maybeSingle();
      companyName = company?.name ?? null;
    }

    // Send the welcome email
    const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        templateName: "user-welcome",
        recipientEmail: targetEmail,
        idempotencyKey: `user-welcome-resend:${targetEmail}:${Date.now()}`,
        templateData: {
          userName: targetProfile.display_name || targetEmail,
          companyName,
          loginEmail: targetEmail,
          temporaryPassword: tempPassword,
          appUrl,
          logoUrl,
        },
      }),
    });

    if (!response.ok) {
      let message = "Failed to send welcome email";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") message = body.error;
      } catch { /* ignore */ }
      console.error("Resend welcome email failed:", message);
      return jsonResponse({ error: message, password_reset: true }, 502);
    }

    return jsonResponse({ success: true, email_sent: true });
  } catch (error: unknown) {
    console.error("Resend welcome error:", error instanceof Error ? error.message : "unknown");
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
