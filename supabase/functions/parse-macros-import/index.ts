import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedMacro {
  name: string;
  color: string;
  scopes: {
    name: string;
    weight: number;
  }[];
}

interface ParseResult {
  macros: ExtractedMacro[];
  success: boolean;
  message?: string;
}

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#78716c", "#0891b2", "#059669",
  "#7c3aed", "#c026d3", "#e11d48", "#dc2626"
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const { fileBase64, mode } = await req.json();

    if (!fileBase64) {
      throw new Error("Arquivo é obrigatório");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }
    
    const prompt = `Você é um especialista em análise de cronogramas e estruturas de obras de construção civil brasileira.

TAREFA: Extraia EXATAMENTE o texto e valores do documento, sem modificar, corrigir ou interpretar.

REGRAS CRÍTICAS DE FIDELIDADE:
1. NÃO CORRIJA erros de ortografia ou gramática
2. NÃO ALTERE a formatação ou capitalização dos nomes
3. NÃO INTERPRETE ou traduza termos técnicos
4. COPIE o texto EXATAMENTE como aparece no documento
5. Use os valores EXATAMENTE como aparecem (não arredonde, não recalcule)
6. Se houver valores monetários, calcule os percentuais a partir deles
7. Mantenha abreviações e siglas como estão no documento

ESTRUTURA A IDENTIFICAR:
- ETAPA (Macro): Grupo principal (ex: FUNDAÇÃO, ESTRUTURA, ALVENARIA)
- SERVIÇO (Scope): Atividades específicas dentro de cada etapa

${mode === 'weights' ? `
MODO PESOS - PRIORIDADE MÁXIMA:
- Se houver valores monetários no documento, calcule o peso de cada serviço como: (valor_serviço / valor_total) * 100
- Os pesos devem somar exatamente 100% considerando todos os serviços
- USE APENAS OS VALORES UNITÁRIOS que aparecem no documento original
- NÃO RECALCULE, NÃO NORMALIZE os valores do documento
` : `
MODO ESTRUTURA:
- Extraia os nomes exatamente como aparecem
- Se não houver pesos, distribua uniformemente
`}

RESPOSTA OBRIGATÓRIA EM JSON PURO (sem markdown, sem \`\`\`):
{"macros":[{"name":"NOME EXATO DA ETAPA","color":"#ef4444","scopes":[{"name":"Nome exato do serviço","weight":5.5}]}],"success":true,"message":"X etapas com Y serviços extraídos"}`;

    console.log("Calling Lovable AI to parse macros/scopes...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: fileBase64 } },
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Limite de requisições atingido. Tente novamente em alguns minutos.");
      }
      if (response.status === 402) {
        throw new Error("Créditos insuficientes. Adicione créditos na sua conta Lovable.");
      }
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Sem resposta da IA");
    }

    console.log("AI raw response length:", content.length);
    console.log("AI raw response preview:", content.substring(0, 500));

    // Parse the JSON response
    let parseResult: ParseResult;
    try {
      let cleanedContent = content.trim();
      
      // Remove markdown code blocks
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '');
      cleanedContent = cleanedContent.replace(/^```\s*/i, '');
      cleanedContent = cleanedContent.replace(/\s*```$/i, '');
      cleanedContent = cleanedContent.trim();
      
      // Find JSON object
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
      }
      
      parseResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      
      // Try regex extraction
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parseResult = JSON.parse(jsonMatch[0]);
        } catch {
          parseResult = { macros: [], success: false, message: "Não foi possível processar a resposta da IA" };
        }
      } else {
        parseResult = { macros: [], success: false, message: "Resposta da IA não contém JSON válido" };
      }
    }

    // Validate and clean macros
    const validatedMacros: ExtractedMacro[] = [];
    let colorIndex = 0;
    
    if (parseResult.macros && Array.isArray(parseResult.macros)) {
      for (const macro of parseResult.macros) {
        if (macro.name && typeof macro.name === 'string' && macro.name.trim()) {
          const validatedScopes = [];
          
          if (macro.scopes && Array.isArray(macro.scopes)) {
            for (const scope of macro.scopes) {
              if (scope.name && typeof scope.name === 'string' && scope.name.trim()) {
                validatedScopes.push({
                  name: scope.name.trim(),
                  weight: typeof scope.weight === "number" ? scope.weight : parseFloat(scope.weight) || 1,
                });
              }
            }
          }
          
          if (validatedScopes.length > 0) {
            validatedMacros.push({
              name: macro.name.trim(),
              color: macro.color || COLORS[colorIndex % COLORS.length],
              scopes: validatedScopes,
            });
            colorIndex++;
          }
        }
      }
    }

    const totalScopes = validatedMacros.reduce((sum, m) => sum + m.scopes.length, 0);
    
    const result: ParseResult = {
      macros: validatedMacros,
      success: validatedMacros.length > 0,
      message: validatedMacros.length > 0 
        ? `${validatedMacros.length} etapas com ${totalScopes} serviços extraídos`
        : "Não foi possível extrair etapas do documento. Verifique se está legível."
    };

    console.log("Final result:", JSON.stringify({ macrosCount: validatedMacros.length, totalScopes, success: result.success }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in parse-macros-import:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ macros: [], success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
