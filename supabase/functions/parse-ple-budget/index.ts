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

    const prompt = `Você é um especialista em leitura de planilhas de orçamento de obras de construção civil brasileira (PLS/PLE/SINAPI).

TAREFA: Extraia TODOS os dados visíveis nesta imagem de planilha, respeitando rigorosamente a hierarquia de 3 NÍVEIS:

## HIERARQUIA OBRIGATÓRIA

**NÍVEL 1 — ETAPA** (linhas com código tipo "X.0" ou apenas um número inteiro como "1", "2", "3")
Exemplos: "1.0 INSTALAÇÃO E MOBILIZAÇÃO", "2.0 INFRAESTRUTURA"
→ São títulos de seções principais, geralmente em NEGRITO ou destaque
→ NÃO possuem valores unitários, quantidades ou totais

**NÍVEL 2 — SUBETAPA** (linhas com código tipo "X.Y" — dois números separados por ponto, SEM terceiro nível)
Exemplos: "1.1 Canteiro de obras e Administração", "1.2 Serviços Preliminares", "2.1 Movimentação de terra"
→ São subdivisões dentro de uma etapa
→ NÃO possuem valores unitários, quantidades ou totais
→ O campo stage_code deve apontar para a ETAPA pai (ex: subetapa "1.1" → stage_code "1.0")

**NÍVEL 3 — SERVIÇO** (linhas com código tipo "X.Y.Z" — três números separados por ponto)
Exemplos: "1.1.1", "1.1.2", "1.2.1", "2.1.1", "2.1.2"
→ São os itens de serviço com dados completos
→ POSSUEM: discriminação, código SINAPI, descrição, unidade, quantidade, preço unitário, preço total

## COLUNAS DA PLANILHA (da esquerda para a direita)

| Coluna | Campo no JSON | Descrição |
|--------|--------------|-----------|
| ITEM | item_code | Código hierárquico (ex: "1.1.1") |
| DISCRIMINAÇÃO | discrimination | Tipo: "SINAPI", "Composição", etc. |
| CÓDIGO SINAPI | sinapi_code | Código numérico do SINAPI (ex: "93358", "99059") ou código interno (ex: "1-001") |
| DESCRIÇÃO | description | Texto descritivo completo do serviço |
| UNID | unit | Unidade de medida: UN, M, M2, M3, KG, etc. |
| QTDE | quantity | Quantidade numérica |
| MAT UNIT. (PREÇO UNITÁRIO MATERIAL) | mat_unit_value | Valor unitário SOMENTE de MATERIAL em reais (a planilha SINAPI/PLE tem composição: MAT + MO = TOTAL) |
| MO UNIT. (PREÇO UNITÁRIO MÃO DE OBRA) | mo_unit_value | Valor unitário SOMENTE de MÃO DE OBRA em reais |
| PREÇO UNITÁRIO TOTAL | unit_value | Valor unitário TOTAL = mat_unit_value + mo_unit_value (converter "R$ 2.975,86" → 2975.86) |
| PREÇO TOTAL | total_value | Valor total = qtde × unit_value (TOTAL) |

## ATENÇÃO ESPECIAL — COLUNAS DE PREÇO UNITÁRIO

A planilha PLE/SINAPI tipicamente tem **3 colunas de preço unitário lado a lado**, antes do TOTAL:
1. **MAT** (Material) — pode estar vazio ou ter valor (ex: "R$ -" ou "R$ 1.347,19")
2. **MO** (Mão de Obra) — pode estar vazio ou ter valor (ex: "R$ 2.975,86" ou "R$ 577,38")
3. **TOTAL UNITÁRIO** (= MAT + MO) — sempre presente (ex: "R$ 2.975,86" ou "R$ 1.924,57")

→ Você DEVE extrair os 3 valores separadamente quando aparecerem.
→ Se só houver 1 coluna unitária, considere que é apenas o `unit_value` e mat=0, mo=0.
→ Se MAT for vazio/traço, use 0. Se MO for vazio/traço, use 0.
→ Sempre garanta: `unit_value ≈ mat_unit_value + mo_unit_value` (tolerância de centavos).

## REGRAS DE EXTRAÇÃO

1. Extraia ABSOLUTAMENTE TODOS os itens visíveis na imagem, sem pular nenhum
2. Para SERVIÇOS: preencha TODOS os campos (item_code, discrimination, sinapi_code, description, unit, quantity, unit_value, total_value)
3. Para cada SERVIÇO identifique:
   - group_code = código da SUBETAPA pai (ex: serviço "1.1.1" → group_code "1.1")
   - group_name = nome da SUBETAPA pai
   - stage_code = código da ETAPA pai (ex: serviço "1.1.1" → stage_code "1.0")
   - stage_name = nome da ETAPA pai
4. Converta valores monetários brasileiros: "R$ 1.000,00" → 1000.00, "2.975,86" → 2975.86
5. Mantenha os textos EXATAMENTE como aparecem na planilha
6. Se a coluna DISCRIMINAÇÃO mostrar "Composição", "SINAPI", etc., copie exatamente
7. Se houver texto longo quebrado em múltiplas linhas na mesma célula, junte tudo em uma string

## GRUPOS EXISTENTES NO SISTEMA
${groupNames.length > 0 ? groupNames.join('\n') : 'Nenhum cadastrado'}

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido (sem markdown, sem \`\`\`):
{
  "stages": [
    {"code": "1.0", "name": "INSTALAÇÃO E MOBILIZAÇÃO"},
    {"code": "2.0", "name": "INFRAESTRUTURA"}
  ],
  "substages": [
    {"code": "1.1", "name": "Canteiro de obras e Administração", "stage_code": "1.0"},
    {"code": "1.2", "name": "Serviços Preliminares", "stage_code": "1.0"},
    {"code": "2.1", "name": "Movimentação de terra", "stage_code": "2.0"}
  ],
  "items": [
    {
      "item_code": "1.1.1",
      "discrimination": "Composição",
      "sinapi_code": "1-001",
      "description": "ADMINISTRAÇÃO DE OBRA – ENGENHEIRO HORISTA E MESTRE DE OBRAS MENSALISTA",
      "unit": "UN",
      "quantity": 4.00,
      "mat_unit_value": 0,
      "mo_unit_value": 2975.86,
      "unit_value": 2975.86,
      "total_value": 11903.43,
      "group_code": "1.1",
      "group_name": "Canteiro de obras e Administração",
      "stage_code": "1.0",
      "stage_name": "INSTALAÇÃO E MOBILIZAÇÃO"
    }
  ],
  "success": true,
  "message": "X serviços extraídos com Y etapas e Z subetapas"
}`;

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
    console.log("AI response preview:", content.substring(0, 500));

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

    const stages = (parsed.stages || []).map((s: any) => ({
      code: (s.code || "").trim(),
      name: (s.name || "").trim(),
    }));

    const substages = (parsed.substages || []).map((s: any) => ({
      code: (s.code || "").trim(),
      name: (s.name || "").trim(),
      stage_code: (s.stage_code || "").trim(),
    }));

    const validItems = (parsed.items || []).filter((it: any) => it.description || it.group_name).map((it: any) => ({
      item_code: (it.item_code || "").trim(),
      discrimination: (it.discrimination || "").trim(),
      sinapi_code: (it.sinapi_code || "").trim(),
      description: (it.description || "").trim(),
      unit: (it.unit || "UN").trim(),
      quantity: typeof it.quantity === "number" ? it.quantity : parseFloat(String(it.quantity || 0)) || 0,
      mat_unit_value: typeof it.mat_unit_value === "number" ? it.mat_unit_value : parseFloat(String(it.mat_unit_value || 0)) || 0,
      mo_unit_value: typeof it.mo_unit_value === "number" ? it.mo_unit_value : parseFloat(String(it.mo_unit_value || 0)) || 0,
      unit_value: typeof it.unit_value === "number" ? it.unit_value : parseFloat(String(it.unit_value || 0)) || 0,
      total_value: typeof it.total_value === "number" ? it.total_value : parseFloat(String(it.total_value || 0)) || 0,
      group_code: (it.group_code || "").trim(),
      group_name: (it.group_name || "").trim(),
      stage_code: (it.stage_code || "").trim(),
      stage_name: (it.stage_name || "").trim(),
    })).map((it: any) => {
      // Garantir consistência: unit_value = mat + mo quando possível
      const sum = (it.mat_unit_value || 0) + (it.mo_unit_value || 0);
      if (!it.unit_value && sum > 0) it.unit_value = sum;
      // Se temos unit_value mas não temos mat/mo, deixar como está (não inferir)
      return it;
    });

    console.log(`Extracted ${stages.length} stages, ${substages.length} substages, ${validItems.length} items`);
    console.log("Stages:", JSON.stringify(stages));
    console.log("Substages:", JSON.stringify(substages));

    return new Response(JSON.stringify({ 
      stages, substages, items: validItems, success: true, 
      message: `${validItems.length} serviços, ${stages.length} etapas e ${substages.length} subetapas extraídos` 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ stages: [], substages: [], items: [], success: false, message: error instanceof Error ? error.message : "Erro ao processar" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
