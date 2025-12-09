import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BudgetItem {
  name: string;
  category: "material" | "labor" | "equipment";
  unitValue: number;
  quantity: number;
  unit: string;
  scopeName?: string;
  macroName?: string;
}

interface ParseResult {
  items: BudgetItem[];
  success: boolean;
  message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, existingMacros } = await req.json();

    if (!pdfBase64) {
      throw new Error("PDF is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Prepare macro/scope information for context
    const macroInfo = existingMacros?.map((m: any) => ({
      name: m.name,
      scopes: m.scopes?.map((s: any) => s.name) || [],
    })) || [];

    console.log("Existing macros for context:", JSON.stringify(macroInfo));
    
    const prompt = `Você é um especialista em análise de orçamentos de construção civil.

Analise este PDF de orçamento de obra e extraia TODOS os itens/insumos encontrados.

Para cada item, identifique:
1. Nome do item/insumo
2. Categoria: "material" (materiais de construção), "labor" (mão de obra), ou "equipment" (equipamentos)
3. Valor unitário (se houver)
4. Quantidade (se houver)
5. Unidade de medida (un, m², m³, kg, etc.)
6. Qual serviço/escopo o item pertence (se identificável)
7. Qual etapa macro pertence (se identificável)

Etapas (macros) e serviços existentes no projeto:
${JSON.stringify(macroInfo, null, 2)}

IMPORTANTE:
- Extraia TODOS os itens do orçamento
- Se não conseguir identificar o escopo, deixe em branco
- Se não houver valor, coloque 0
- Se não houver quantidade, coloque 1
- Tente associar os itens aos serviços existentes no projeto

Responda APENAS com um JSON válido (sem markdown, sem explicações) no seguinte formato:
{
  "items": [
    {
      "name": "Cimento CP II",
      "category": "material",
      "unitValue": 35.50,
      "quantity": 100,
      "unit": "saco",
      "scopeName": "Fundação",
      "macroName": "RADIER"
    },
    {
      "name": "Pedreiro",
      "category": "labor",
      "unitValue": 150.00,
      "quantity": 8,
      "unit": "diária",
      "scopeName": "Alvenaria",
      "macroName": "PAREDES"
    }
  ],
  "success": true,
  "message": "Extraídos 25 itens do orçamento"
}

Se não conseguir extrair itens, retorne:
{
  "items": [],
  "success": false,
  "message": "Motivo do erro"
}`;

    console.log("Calling Lovable AI to parse budget PDF...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: pdfBase64,
                },
              },
            ],
          },
        ],
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI raw response:", content);

    // Parse the JSON response
    let parseResult: ParseResult;
    try {
      let cleanedContent = content.trim();
      // Remove markdown code blocks if present
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      cleanedContent = cleanedContent.trim();
      
      parseResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      parseResult = {
        items: [],
        success: false,
        message: "Não foi possível processar a resposta da IA"
      };
    }

    // Validate the result
    if (!parseResult.items || !Array.isArray(parseResult.items)) {
      parseResult = {
        items: [],
        success: false,
        message: "Formato de resposta inválido"
      };
    }

    // Clean up and validate items
    parseResult.items = parseResult.items.map(item => ({
      name: item.name || "Item sem nome",
      category: ["material", "labor", "equipment"].includes(item.category) ? item.category : "material",
      unitValue: typeof item.unitValue === "number" ? item.unitValue : 0,
      quantity: typeof item.quantity === "number" ? item.quantity : 1,
      unit: item.unit || "un",
      scopeName: item.scopeName || undefined,
      macroName: item.macroName || undefined,
    }));

    if (parseResult.items.length > 0) {
      parseResult.success = true;
      parseResult.message = `Extraídos ${parseResult.items.length} itens do orçamento`;
    }

    console.log("Final parse result:", JSON.stringify(parseResult, null, 2));

    return new Response(JSON.stringify(parseResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in parse-budget-pdf:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ 
        items: [], 
        success: false, 
        message: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
