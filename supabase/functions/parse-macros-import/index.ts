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

Analise este documento (imagem de planilha, cronograma, lista de etapas ou estrutura de obra) e extraia a ESTRUTURA DE ETAPAS E SERVIÇOS.

OBJETIVO: Identificar as ETAPAS PRINCIPAIS (macros) e seus SERVIÇOS (scopes) dentro de cada etapa.

ESTRUTURA ESPERADA:
- ETAPA (Macro): Grupo principal de atividades (ex: Fundação, Estrutura, Alvenaria, Instalações, Acabamento)
- SERVIÇO (Scope): Atividades específicas dentro de cada etapa (ex: dentro de "Fundação": Escavação, Forma, Concretagem)

${mode === 'weights' ? `
IMPORTANTE - MODO PESOS:
- Extraia os PERCENTUAIS/PESOS de cada serviço se disponíveis
- Os pesos devem somar aproximadamente 100% considerando todos os serviços de todas as etapas
- Se não houver pesos explícitos, distribua proporcionalmente
` : `
IMPORTANTE - MODO ESTRUTURA:
- Distribua os pesos de forma proporcional se não estiverem explícitos
- Cada serviço deve ter um peso que some 100% no total de todos os serviços
`}

REGRAS:
1. Identifique claramente a hierarquia: Etapa > Serviços
2. Mantenha os nomes exatamente como aparecem no documento
3. Atribua pesos percentuais que somem aproximadamente 100%
4. Se o documento tiver valores monetários, use para calcular proporção dos pesos
5. Ordene as etapas na sequência lógica de execução da obra

Responda APENAS com JSON válido, SEM markdown, SEM \`\`\`json, SEM explicações.
O formato deve ser exatamente:
{"macros":[{"name":"Nome da Etapa","color":"#ef4444","scopes":[{"name":"Nome do Serviço","weight":5.5}]}],"success":true,"message":"X etapas com Y serviços extraídos"}`;

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
