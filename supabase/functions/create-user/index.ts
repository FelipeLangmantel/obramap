import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["viewer", "editor", "admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: currentUser }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !currentUser) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's profile to check role and company
    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("system_role, company_id")
      .eq("user_id", currentUser.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Could not fetch caller profile" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerRole } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    const isSystemAdmin = callerProfile.system_role === "system_admin";
    const isCompanyAdmin =
      callerProfile.system_role === "admin" || callerRole?.role === "admin";

    if (!isSystemAdmin && !isCompanyAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, display_name, role, company_id } = await req.json();
    const requestedRole = role || "viewer";

    if (!email || !password || !display_name) {
      return new Response(
        JSON.stringify({ error: "email, password and display_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!allowedRoles.has(requestedRole)) {
      return new Response(
        JSON.stringify({ error: "Invalid role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSystemAdmin && requestedRole === "admin") {
      return new Response(
        JSON.stringify({ error: "Unauthorized - only system admins can create admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSystemAdmin && !callerProfile.company_id) {
      return new Response(
        JSON.stringify({ error: "Caller company is required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSystemAdmin && company_id && company_id !== callerProfile.company_id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - cannot create users in another company" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Company admin can only create users for their own company
    const targetCompanyId = isSystemAdmin ? (company_id || null) : callerProfile.company_id;

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create user via admin API (does NOT affect caller's session)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ error: "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = newUser.user.id;

    // Update profile with company_id and must_change_password
    // Wait briefly for the trigger to create the profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        company_id: targetCompanyId,
        must_change_password: true,
        system_role: 'user',
      })
      .eq("user_id", newUserId);

    if (profileUpdateError) {
      console.error("Error updating profile:", profileUpdateError);
    }

    // Update role if not default
    if (requestedRole !== "viewer") {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .update({ role: requestedRole })
        .eq("user_id", newUserId);

      if (roleError) {
        console.error("Error updating role:", roleError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: newUserId,
        message: "User created successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
