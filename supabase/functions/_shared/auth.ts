import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/**
 * Validates that the request has a valid JWT and returns the authenticated user.
 * Returns a Response (401) if unauthenticated; otherwise returns { user }.
 */
export async function requireAuthUser(req: Request): Promise<
  | { user: { id: string; email?: string }; error?: undefined }
  | { user?: undefined; error: Response }
> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return {
      error: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { user: { id: data.user.id, email: data.user.email ?? undefined } };
}
