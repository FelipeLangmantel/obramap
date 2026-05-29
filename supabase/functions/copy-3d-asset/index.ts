// One-shot admin utility. Internal use only; will be deleted after the copy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const { bucket, from, to } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin.storage.from(bucket).copy(from, to);
    if (error) {
      return new Response(JSON.stringify({ error: error.message, raw: error }), { status: 500 });
    }
    const { data: signed, error: sErr } = await admin.storage.from(bucket).createSignedUrl(to, 60);
    return new Response(
      JSON.stringify({ ok: true, copied: data, signedOk: !sErr, signedUrl: signed?.signedUrl ?? null }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
