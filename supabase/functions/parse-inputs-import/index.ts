import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedInput {
  name: string;
  family: string;
  unit: string;
  unit_value: number;
}

interface ParseResult {
  inputs: ExtractedInput[];
  success: boolean;
  message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, existingFamilies } = await req.json();

    if (!fileBase64) {
      throw new Error("Arquivo é obrigatório");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const familyNames = existingFamilies?.map((f: any) => f.name) || [];
    console.log("Existing families for context:", JSON.stringify(familyNames));

    const prompt = `Você é um especialista em análise de listas de insumos/materiais de construção civil brasileira.

Analise este documento (imagem ou PDF) que contém uma TABELA de insumos/materiais e extraia TODOS os itens.

A tabela SEMPRE terá estas colunas (podem estar em ordem diferente):
- Nome do insumo/material
- Família ou categoria
- Unidade de medida (un, m², m³, kg, etc.)
- Preço/valor unitário

FAMÍLIAS EXISTENTES NO SISTEMA (priorize usar estas):
${familyNames.length > 0 ? familyNames.join(', ') : 'Nenhuma cadastrada ainda'}

REGRAS IMPORTANTES:
1. Extraia ABSOLUTAMENTE TODOS os itens da tabela, linha por linha
2. Se a família do item não existir na lista acima, use o nome exato como está na tabela
3. Converta valores monetários para números (ex: "R$ 1.000,00" -> 1000.00, "15,50" -> 15.50)
4. Normalize as unidades: "unidade" -> "un", "metro quadrado" -> "m²", "metro cúbico" -> "m³"
5. Se não houver valor unitário, coloque 0
6. Mantenha os nomes dos insumos EXATAMENTE como aparecem na tabela

Responda APENAS com JSON válido, SEM markdown, SEM \`\`\`json, SEM explicações.
O formato deve ser exatamente assim:

{"inputs":[{"name":"Cimento CP-II 50kg","family":"Cimento","unit":"saco","unit_value":35.90},{"name":"Areia média","family":"Agregados","unit":"m³","unit_value":120.00}],"success":true,"message":"Extraído com sucesso"}`;

    console.log("Calling Lovable AI to parse inputs from document...");

    const messageContent = [
      {
        type: "text",
        text: prompt,
      },
      {
        type: "image_url",
        image_url: {
          url: fileBase64,
        },
      },
    ];

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
            content: messageContent,
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

    // Parse the JSON response with robust cleaning
    let parseResult: ParseResult;
    try {
      let cleanedContent = content.trim();
      
      // Remove markdown code blocks
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '');
      cleanedContent = cleanedContent.replace(/^```\s*/i, '');
      cleanedContent = cleanedContent.replace(/\s*```$/i, '');
      cleanedContent = cleanedContent.trim();
      
      // Try to find the JSON object
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
      }
      
      parseResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Content that failed to parse:", content);
      
      // Try regex extraction as fallback
      const inputsMatch = content.match(/"inputs"\s*:\s*\[([\s\S]*?)\]/);
      if (inputsMatch) {
        try {
          const inputsArray = JSON.parse(`[${inputsMatch[1]}]`);
          parseResult = {
            inputs: inputsArray,
            success: true,
            message: "Extraído com fallback"
          };
        } catch {
          throw new Error("Não foi possível interpretar a resposta da IA");
        }
      } else {
        throw new Error("Não foi possível interpretar a resposta da IA");
      }
    }

    // Validate and clean the inputs
    const validInputs = (parseResult.inputs || []).filter(input => 
      input.name && typeof input.name === 'string' && input.name.trim().length > 0
    ).map(input => ({
      name: input.name.trim(),
      family: input.family?.trim() || 'Sem família',
      unit: input.unit?.trim() || 'un',
      unit_value: typeof input.unit_value === 'number' ? input.unit_value : parseFloat(String(input.unit_value || 0)) || 0
    }));

    console.log(`Successfully extracted ${validInputs.length} inputs`);

    return new Response(
      JSON.stringify({
        inputs: validInputs,
        success: true,
        message: `${validInputs.length} insumos extraídos com sucesso`
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error parsing inputs:", error);
    return new Response(
      JSON.stringify({
        inputs: [],
        success: false,
        message: error instanceof Error ? error.message : "Erro ao processar arquivo"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
