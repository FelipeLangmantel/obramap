import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedItem {
  name: string;
  category: "material" | "labor" | "equipment";
  family: string;
  quantity: number;
  unit: string;
  unitValue: number;
  totalValue: number;
}

interface ParseResult {
  items: ExtractedItem[];
  success: boolean;
  message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, existingInputs, existingFamilies } = await req.json();

    if (!fileBase64) {
      throw new Error("Arquivo é obrigatório");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Build context about existing inputs for better matching
    const inputsContext = existingInputs?.slice(0, 100).map((i: any) => i.name).join(", ") || "";
    const familyNames: string[] = (existingFamilies || []).map((f: any) => f.name).filter(Boolean);
    
    console.log("Existing inputs sample for context:", inputsContext.substring(0, 200));
    console.log("Existing families:", familyNames.join(", "));
    
    const prompt = `Você é um especialista em análise de orçamentos e composições de construção civil brasileira.

Analise este documento (orçamento, planilha, composição ou lista de materiais) e extraia TODOS os itens encontrados.

Para cada item, extraia:
1. Nome/Descrição do insumo ou serviço
2. Categoria (campo "category"): "material", "labor" (mão de obra, tarefa, serviço, empreitada), ou "equipment" (equipamento, aluguel, locação)
3. Família (campo "family"): a SUBCATEGORIA / agrupamento do item dentro da categoria. Ex: "Concreto", "Cimento", "Aço", "Madeira", "Agregados", "Auxiliares", "Locações", "Mão de Obra", "Hidráulica", "Elétrica". Geralmente aparece em uma coluna "FAMÍLIA", "GRUPO", "CATEGORIA" ou similar do orçamento.
4. Quantidade (número decimal)
5. Unidade de medida (m, m², m³, kg, un, pc, l, etc.)
6. Valor Unitário (em R$, converter para número)
7. Valor Total (em R$, converter para número)

REGRAS DE CLASSIFICAÇÃO da CATEGORIA:
- "material": materiais físicos (cimento, areia, tijolo, tubo, fio, etc.)
- "labor": serviços executados por pessoas (mão de obra, tarefa, instalação, montagem, assentamento, empreitada, serviço de pedreiro, etc.)
- "equipment": equipamentos alugados ou próprios (betoneira, andaime, escora, locação de placa vibratória, locação de retro-escavadeira, aluguel de...)

REGRAS PARA FAMÍLIA:
- Se o documento tiver uma coluna explícita de "FAMÍLIA" ou "GRUPO", use exatamente esse valor (com a primeira letra maiúscula).
- Caso contrário, infira pela natureza do material (Concreto, Cimento, Aço, Madeira, Agregados, Hidráulica, Elétrica, Pintura, Esquadrias, Cobertura, Auxiliares, Locações, Mão de Obra...).
${familyNames.length > 0 ? `- PRIORIZE reutilizar estas famílias já cadastradas (combine usando essa grafia exata quando o significado for o mesmo): ${familyNames.join(", ")}` : ''}
- Para itens "labor" use por padrão a família "Mão de Obra" (a menos que o documento informe outra).
- Para itens "equipment" use por padrão a família "Locações" (a menos que o documento informe outra).
- NUNCA deixe family vazio. Se realmente não conseguir classificar, use "Geral".

IMPORTANTE:
- Extraia ABSOLUTAMENTE TODOS os itens linha por linha (incluindo cabeçalhos de seção como "RADIER", "LOCAÇÃO DE OBRA" — esses são apenas seções, não devem virar itens; apenas extraia LINHAS DE INSUMO/SERVIÇO com quantidade e valor).
- Converta valores monetários para número (ex: "R$ 1.000,00" -> 1000.00)
- Se quantidade não estiver clara, use 1
- Se valor não estiver claro, use 0
- Mantenha o nome exato como está no documento
- Identifique corretamente a categoria com base no contexto

${inputsContext ? `\nCONTEXTO: Alguns insumos já cadastrados no sistema para referência:\n${inputsContext}` : ''}

Responda APENAS com JSON válido, SEM markdown, SEM \`\`\`json, SEM explicações.
O formato deve ser exatamente:
{"items":[{"name":"Concreto usinado, Fck 25 MPa","category":"material","family":"Concreto","quantity":7.8,"unit":"m³","unitValue":622.50,"totalValue":4855.50}],"success":true,"message":"X itens extraídos"}`;

    console.log("Calling Lovable AI to parse budget items...");

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
          parseResult = { items: [], success: false, message: "Não foi possível processar a resposta da IA" };
        }
      } else {
        parseResult = { items: [], success: false, message: "Resposta da IA não contém JSON válido" };
      }
    }

    // Validate and clean items
    const validatedItems: ExtractedItem[] = [];
    if (parseResult.items && Array.isArray(parseResult.items)) {
      for (const item of parseResult.items) {
        if (item.name && typeof item.name === 'string' && item.name.trim()) {
          validatedItems.push({
            name: item.name.trim(),
            category: ["material", "labor", "equipment"].includes(item.category) ? item.category : "material",
            quantity: typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity) || 1,
            unit: item.unit || "un",
            unitValue: typeof item.unitValue === "number" ? item.unitValue : parseFloat(item.unitValue) || 0,
            totalValue: typeof item.totalValue === "number" ? item.totalValue : parseFloat(item.totalValue) || 0,
          });
        }
      }
    }

    const result: ParseResult = {
      items: validatedItems,
      success: validatedItems.length > 0,
      message: validatedItems.length > 0 
        ? `${validatedItems.length} itens extraídos com sucesso`
        : "Não foi possível extrair itens do documento. Verifique se está legível."
    };

    console.log("Final result:", JSON.stringify({ itemsCount: validatedItems.length, success: result.success }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in parse-budget-items:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ items: [], success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
