// One-shot admin utility: copy a file in the 3d-models bucket from a legacy
// path to the company_id-prefixed path expected by current Storage RLS.
// Auth: requires the caller to be a system_admin (verified via JWT claim lookup).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { bucket, from, to } = await req.json();
    if (!bucket || !from || !to) {
      return new Response(JSON.stringify({ error: "missing bucket/from/to" }), { status: 400, headers: cors });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is system_admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    const { data: prof } = await admin
      .from("profiles")
      .select("system_role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (prof?.system_role !== "system_admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: cors });
    }

    const { data, error } = await admin.storage.from(bucket).copy(from, to);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, raw: error }), { status: 500, headers: cors });
    }
    const { data: signed, error: sErr } = await admin.storage.from(bucket).createSignedUrl(to, 60);
    return new Response(
      JSON.stringify({ ok: true, copied: data, signedOk: !sErr, signedUrl: signed?.signedUrl ?? null }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
