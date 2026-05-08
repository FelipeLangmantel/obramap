import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BudgetItem {
  code: string;
  name: string;
  category: "material" | "labor" | "equipment";
  unitValue: number;
  quantity: number;
  unit: string;
  totalValue: number;
  scopeName?: string;
  macroName?: string;
  level: "macro" | "scope" | "item";
}

interface BudgetMacro {
  code: string;
  name: string;
  totalValue: number;
  scopes: BudgetScope[];
}

interface BudgetScope {
  code: string;
  name: string;
  totalValue: number;
  items: BudgetItem[];
}

interface ParseResult {
  macros: BudgetMacro[];
  items: BudgetItem[];
  success: boolean;
  message?: string;
  totalValue?: number;
}

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
    const { pdfBase64, existingMacros, fileType } = await req.json();

    if (!pdfBase64) {
      throw new Error("Arquivo é obrigatório");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const macroInfo = existingMacros?.map((m: any) => ({
      name: m.name,
      scopes: m.scopes?.map((s: any) => s.name) || [],
    })) || [];

    const detectedFileType = fileType || "pdf";
    console.log("File type:", detectedFileType);
    console.log("Existing macros for context:", JSON.stringify(macroInfo));
    
    const prompt = `Você é um especialista em análise de orçamentos de construção civil brasileira.

Analise este documento de orçamento e extraia TODA a estrutura hierárquica:
- ETAPAS (macros): são os itens principais como "1 - RADIER", "2 - PAREDES E LAJES", etc.
- SERVIÇOS (scopes): são sub-itens das etapas como "1.1 - RADIER", "1.2 - ESPERAS DE ESGOTO"
- ITENS/INSUMOS: são os materiais, mão de obra e equipamentos detalhados

ESTRUTURA DO ORÇAMENTO:
- Itens com código de 1 dígito (ex: "1", "2", "3") são ETAPAS (macros)
- Itens com código de 2 partes (ex: "1.1", "2.1") são SERVIÇOS (scopes)
- Itens com código de 3+ partes (ex: "1.1.1", "2.1.3") são ITENS/INSUMOS

Para cada item, extraia:
1. Código (N ou ITEM da tabela: "1", "1.1", "1.1.1", etc.)
2. Nome/Descrição
3. Unidade de medida (UNID.)
4. Quantidade (QTD)
5. Valor Unitário (UNIT ou CUSTO UNIT.)
6. Valor Total (se houver)
7. Categoria: "material", "labor" (mão de obra, tarefa, serviço), ou "equipment" (equipamento, aluguel)

IMPORTANTE:
- Extraia ABSOLUTAMENTE TODOS os itens do orçamento, linha por linha
- Mantenha a estrutura hierárquica (etapa -> serviço -> item)
- Se um item tiver "mão de obra", "MO", "tarefa", "serviço" no nome, classifique como "labor"
- Se tiver "aluguel", "locação" no nome, classifique como "equipment"
- Demais itens são "material"
- Converta valores em R$ para números (ex: "R$ 1.000,00" -> 1000.00)
- Se não houver quantidade, coloque 1
- Se não houver valor, coloque 0

Responda APENAS com JSON válido, SEM markdown, SEM \`\`\`json, SEM explicações.
O formato deve ser exatamente assim:

{"macros":[{"code":"1","name":"RADIER","totalValue":9482.99,"scopes":[{"code":"1.1","name":"RADIER","totalValue":8589.97,"items":[{"code":"1.1.1","name":"Concreto Usinado","category":"material","unitValue":622.15,"quantity":7,"unit":"m³","totalValue":4482.59,"level":"item"}]}]}],"items":[],"success":true,"message":"Extraído com sucesso","totalValue":90071.08}`;

    console.log("Calling Lovable AI to parse budget document...");

    // For PDF files, send as image_url (data URL)
    // For other files, we need to handle differently - but Gemini only supports PDF as document
    let messageContent: any[];
    
    if (detectedFileType === "pdf") {
      messageContent = [
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
      ];
    } else {
      // For Excel/CSV files, we can't send as image - extract the base64 and try as text
      // But Gemini doesn't support Excel directly, so we'll return an error with helpful message
      return new Response(
        JSON.stringify({
          macros: [],
          items: [],
          success: false,
          message: "Arquivos Excel não são suportados diretamente. Por favor, exporte como PDF ou copie os dados para um arquivo de texto."
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
            content: messageContent,
          },
        ],
        max_tokens: 32000,
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
      
      // Remove markdown code blocks - handle various formats
      cleanedContent = cleanedContent.replace(/^```json\s*/i, '');
      cleanedContent = cleanedContent.replace(/^```\s*/i, '');
      cleanedContent = cleanedContent.replace(/\s*```$/i, '');
      cleanedContent = cleanedContent.trim();
      
      // Try to find the JSON object if there's extra text
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
      }
      
      console.log("Cleaned content preview:", cleanedContent.substring(0, 200));
      
      parseResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response, trying regex:", parseError);
      
      // Try to extract JSON using regex
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parseResult = JSON.parse(jsonMatch[0]);
        } catch (regexError) {
          console.error("Regex parse also failed:", regexError);
          parseResult = {
            macros: [],
            items: [],
            success: false,
            message: "Não foi possível processar a resposta da IA. Tente novamente."
          };
        }
      } else {
        parseResult = {
          macros: [],
          items: [],
          success: false,
          message: "Resposta da IA não contém JSON válido"
        };
      }
    }

    // Flatten items for backward compatibility
    const flatItems: BudgetItem[] = [];
    
    if (parseResult.macros && Array.isArray(parseResult.macros)) {
      for (const macro of parseResult.macros) {
        if (macro.scopes && Array.isArray(macro.scopes)) {
          for (const scope of macro.scopes) {
            if (scope.items && Array.isArray(scope.items)) {
              for (const item of scope.items) {
                flatItems.push({
                  ...item,
                  macroName: macro.name,
                  scopeName: scope.name,
                  code: item.code || "",
                  name: item.name || "Item sem nome",
                  category: ["material", "labor", "equipment"].includes(item.category) ? item.category : "material",
                  unitValue: typeof item.unitValue === "number" ? item.unitValue : 0,
                  quantity: typeof item.quantity === "number" ? item.quantity : 1,
                  unit: item.unit || "un",
                  totalValue: typeof item.totalValue === "number" ? item.totalValue : 0,
                  level: "item"
                });
              }
            }
          }
        }
      }
    }

    // Also include any items in the flat items array
    if (parseResult.items && Array.isArray(parseResult.items)) {
      for (const item of parseResult.items) {
        flatItems.push({
          code: item.code || "",
          name: item.name || "Item sem nome",
          category: ["material", "labor", "equipment"].includes(item.category) ? item.category : "material",
          unitValue: typeof item.unitValue === "number" ? item.unitValue : 0,
          quantity: typeof item.quantity === "number" ? item.quantity : 1,
          unit: item.unit || "un",
          totalValue: typeof item.totalValue === "number" ? item.totalValue : 0,
          scopeName: item.scopeName,
          macroName: item.macroName,
          level: item.level || "item"
        });
      }
    }

    parseResult.items = flatItems;

    // Count totals
    const macroCount = parseResult.macros?.length || 0;
    let scopeCount = 0;
    const itemCount = flatItems.length;

    if (parseResult.macros) {
      for (const macro of parseResult.macros) {
        scopeCount += macro.scopes?.length || 0;
      }
    }

    if (macroCount > 0 || itemCount > 0) {
      parseResult.success = true;
      parseResult.message = `Extraídas ${macroCount} etapas, ${scopeCount} serviços e ${itemCount} itens do orçamento`;
    } else {
      parseResult.success = false;
      parseResult.message = "Não foi possível extrair itens do orçamento. Verifique se o arquivo está legível.";
    }

    console.log("Final parse result:", JSON.stringify({
      macros: macroCount,
      scopes: scopeCount,
      items: itemCount,
      success: parseResult.success,
      message: parseResult.message
    }));

    return new Response(JSON.stringify(parseResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in parse-budget-pdf:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ 
        macros: [],
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
