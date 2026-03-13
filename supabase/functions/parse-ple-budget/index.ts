import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, existingGroups } = await req.json();
    if (!fileBase64) throw new Error("Arquivo é obrigatório");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const groupNames = existingGroups?.map((g: any) => `${g.code} - ${g.name}`) || [];

    const prompt = `Você é um especialista em análise de planilhas de orçamento de obras de construção civil brasileira (modelo PLS/PLE).

Analise RIGOROSAMENTE esta imagem de planilha de orçamento e extraia TODOS os itens, linha por linha, exatamente como aparecem.

A planilha tipicamente tem estas colunas:
- ITEM (código do item, ex: 1.0, 1.1, 1.1.1, 2.1.1)
- DISCRIMINAÇÃO (tipo: SINAPI, Composição, etc.)
- CÓDIGO SINAPI (código numérico)
- DESCRIÇÃO SINAPI (texto descritivo do serviço)
- UNID (unidade: UN, M, M2, M3, KG, etc.)
- QTDE (quantidade)
- PREÇO UNITÁRIO (valor unitário em reais)
- PREÇO TOTAL (valor total = qtde x unitário)

REGRAS CRÍTICAS:
1. Extraia ABSOLUTAMENTE TODOS os itens visíveis, incluindo cabeçalhos de grupo/macro
2. Itens como "1.0 INSTALAÇÃO E MOBILIZAÇÃO" ou "2.0 INFRAESTRUTURA" são GRUPOS/MACROS - extraia-os com group_code e group_name
3. Sub-itens como "1.1.1", "2.1.1" são SERVIÇOS - associe-os ao grupo pai mais próximo
4. Converta valores monetários: "R$ 1.000,00" → 1000.00, "15,50" → 15.50
5. Mantenha os textos EXATAMENTE como aparecem
6. Se um item é apenas um cabeçalho de grupo (sem valores), coloque quantity=0 e unit_value=0
7. Identifique corretamente a discriminação (SINAPI, Composição, etc.)

GRUPOS EXISTENTES NO SISTEMA (use se reconhecer):
${groupNames.length > 0 ? groupNames.join('\n') : 'Nenhum cadastrado'}

Responda APENAS com JSON válido, SEM markdown, SEM \`\`\`json:
{"items":[{"item_code":"1.1.1","discrimination":"SINAPI","sinapi_code":"93059","description":"LOCACAO CONVENCIONAL...","unit":"M","quantity":30.30,"unit_value":64.29,"total_value":1948.06,"group_code":"1.2","group_name":"Serviços Preliminares"}],"success":true,"message":"X itens extraídos"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: fileBase64 } }] }],
        max_tokens: 16000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      if (response.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em alguns minutos.");
      if (response.status === 402) throw new Error("Créditos insuficientes. Adicione créditos na sua conta Lovable.");
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Sem resposta da IA");

    console.log("AI response length:", content.length);

    let parsed: any;
    try {
      let cleaned = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first !== -1 && last > first) cleaned = cleaned.substring(first, last + 1);
      parsed = JSON.parse(cleaned);
    } catch {
      const match = content.match(/"items"\s*:\s*\[([\s\S]*?)\]/);
      if (match) {
        parsed = { items: JSON.parse(`[${match[1]}]`), success: true };
      } else {
        throw new Error("Não foi possível interpretar a resposta da IA");
      }
    }

    const validItems = (parsed.items || []).filter((it: any) => it.description || it.group_name).map((it: any) => ({
      item_code: (it.item_code || "").trim(),
      discrimination: (it.discrimination || "").trim(),
      sinapi_code: (it.sinapi_code || "").trim(),
      description: (it.description || it.group_name || "").trim(),
      unit: (it.unit || "UN").trim(),
      quantity: typeof it.quantity === "number" ? it.quantity : parseFloat(String(it.quantity || 0)) || 0,
      unit_value: typeof it.unit_value === "number" ? it.unit_value : parseFloat(String(it.unit_value || 0)) || 0,
      total_value: typeof it.total_value === "number" ? it.total_value : parseFloat(String(it.total_value || 0)) || 0,
      group_code: (it.group_code || "").trim(),
      group_name: (it.group_name || "").trim(),
    }));

    console.log(`Extracted ${validItems.length} items`);

    return new Response(JSON.stringify({ items: validItems, success: true, message: `${validItems.length} itens extraídos` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ items: [], success: false, message: error instanceof Error ? error.message : "Erro ao processar" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
