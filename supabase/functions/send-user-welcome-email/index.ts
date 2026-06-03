import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WelcomePayload = {
  user_id?: string;
  email?: string;
  display_name?: string;
  temporary_password?: string;
  company_id?: string | null;
  company_name?: string | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function enqueueWelcomeEmail(payload: {
  email: string;
  displayName: string;
  temporaryPassword?: string;
  companyName?: string | null;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const appUrl = Deno.env.get("OBRA_MAP_APP_URL") || "https://obramap.app.br";
  const logoUrl = `${appUrl.replace(/\/$/, "")}/obramap_icon_dark.png`;

  const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      templateName: "user-welcome",
      recipientEmail: payload.email,
      idempotencyKey: `user-welcome:${payload.email}:${Date.now()}`,
      templateData: {
        userName: payload.displayName,
        companyName: payload.companyName ?? null,
        loginEmail: payload.email,
        temporaryPassword: payload.temporaryPassword,
        appUrl,
        logoUrl,
      },
    }),
  });

  if (!response.ok) {
    let message = "Failed to enqueue welcome email";
    try {
      const body = await response.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // Keep generic message; never include password in logs or errors.
    }
    throw new Error(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("system_role, company_id")
      .eq("user_id", currentUser.id)
      .single();

    if (profileError || !callerProfile) {
      return jsonResponse({ error: "Could not fetch caller profile" }, 403);
    }

    const { data: callerRole } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    const isSystemAdmin = callerProfile.system_role === "system_admin";
    const isCompanyAdmin = callerProfile.system_role === "admin" || callerRole?.role === "admin";

    if (!isSystemAdmin && !isCompanyAdmin) {
      return jsonResponse({ error: "Unauthorized - only admins can send welcome emails" }, 403);
    }

    const body = await req.json() as WelcomePayload;
    const targetUserId = body.user_id;
    const expectedEmail = body.email?.trim().toLowerCase();
    const expectedCompanyId = body.company_id ?? null;

    if (!targetUserId || !expectedEmail) {
      return jsonResponse({ error: "user_id and email are required" }, 400);
    }

    if (!isSystemAdmin && expectedCompanyId && expectedCompanyId !== callerProfile.company_id) {
      return jsonResponse({ error: "Unauthorized - cannot send welcome email for another company" }, 403);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, display_name, company_id, system_role, status, must_change_password, created_at")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      return jsonResponse({ error: "Target user profile not found" }, 404);
    }

    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const targetEmail = String(targetProfile.email ?? "").trim().toLowerCase();
    if (!targetEmail || targetEmail !== expectedEmail) {
      return jsonResponse({ error: "Target user does not match requested email" }, 403);
    }

    if (!isSystemAdmin && targetProfile.company_id !== callerProfile.company_id) {
      return jsonResponse({ error: "Unauthorized - target user belongs to another company" }, 403);
    }

    if (expectedCompanyId && targetProfile.company_id !== expectedCompanyId) {
      return jsonResponse({ error: "Target user does not match requested company" }, 403);
    }

    if (targetProfile.system_role === "system_admin" && !isSystemAdmin) {
      return jsonResponse({ error: "Unauthorized - cannot send welcome email to a system admin" }, 403);
    }

    if (!["viewer", "editor", "admin"].includes(targetRole?.role ?? "viewer")) {
      return jsonResponse({ error: "Invalid target user role" }, 403);
    }

    const createdAt = targetProfile.created_at ? new Date(targetProfile.created_at).getTime() : 0;
    const isRecentlyCreated = Number.isFinite(createdAt) && Date.now() - createdAt <= 15 * 60 * 1000;
    if (targetProfile.must_change_password !== true || !isRecentlyCreated) {
      return jsonResponse({ error: "Welcome email can only be sent for a newly created temporary-password user" }, 403);
    }

    let companyName: string | null = null;
    if (targetProfile.company_id) {
      const { data: company } = await supabaseAdmin
        .from("companies")
        .select("name")
        .eq("id", targetProfile.company_id)
        .maybeSingle();
      companyName = company?.name ?? null;
    }

    await enqueueWelcomeEmail({
      email: targetEmail,
      displayName: targetProfile.display_name || targetEmail,
      temporaryPassword: body.temporary_password,
      companyName,
    });

    return jsonResponse({ success: true, queued: true });
  } catch (error: unknown) {
    console.error("Welcome email error:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Failed to send welcome email" }, 500);
  }
});
