import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // SECURITY: require valid JWT
  {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    try {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    const { type, portfolioSummary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "insights") {
      systemPrompt = "Você é um consultor especialista em gestão de obras habitacionais e holdings construtoras. Responda APENAS com JSON válido, sem markdown. IMPORTANTE: Todos os valores monetários nos dados estão em Reais brasileiros (BRL). Ao mencionar valores, use sempre o formato 'R$ X.XXX.XXX,XX' com o símbolo R$ — nunca use £, $, € ou qualquer outro símbolo.";
      userPrompt = `Analise os dados abaixo e forneça 5 insights executivos objetivos em português, incluindo riscos, oportunidades e ações recomendadas.

Os valores numéricos de totalContratos, totalReceitas e totalDespesas estão em Reais (BRL). Ao citá-los, formate como R$ X.XXX.XXX,XX.

Dados do portfólio: ${JSON.stringify(portfolioSummary)}

Responda EXATAMENTE neste formato JSON (sem markdown, sem code blocks):
{"insights":[{"tipo":"risco|oportunidade|alerta|acao","titulo":"string","descricao":"string","impacto":"alto|medio|baixo","obra":"string ou null"}]}`;
    } else if (type === "relatorio") {
      systemPrompt = "Você é um consultor especialista em gestão de obras habitacionais. Escreva relatórios executivos profissionais em português. IMPORTANTE: Todos os valores monetários nos dados estão em Reais brasileiros (BRL). Use sempre o formato 'R$ X.XXX.XXX,XX' — nunca use £, $, € ou outro símbolo.";
      userPrompt = `Escreva um relatório executivo conciso (máximo 400 palavras) em português para a diretoria de uma holding construtora, baseado nestes dados:

Os valores numéricos de totalContratos, totalReceitas e totalDespesas estão em Reais (BRL). Formate-os como R$ X.XXX.XXX,XX.

${JSON.stringify(portfolioSummary)}

Tom: profissional, direto, orientado a decisões.
Inclua: situação geral, principais riscos, destaques positivos, próximas ações.
Use formatação markdown com títulos ## e listas.`;
    } else {
      throw new Error("Invalid type. Use 'insights' or 'relatorio'.");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("holding-insights error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
