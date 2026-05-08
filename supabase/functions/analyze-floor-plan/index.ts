import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HousePosition {
  id: number;
  x: number;
  y: number;
}

interface QuadraLayout {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  houses: HousePosition[];
  rows: number;
  cols: number;
  orientation: "horizontal" | "vertical" | "grid";
}

interface AnalysisResult {
  quadras: QuadraLayout[];
  mapWidth: number;
  mapHeight: number;
  layout: "horizontal" | "vertical" | "grid";
  success: boolean;
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
    const { imageBase64, existingQuadras } = await req.json();

    if (!imageBase64) {
      throw new Error("Image is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Prepare quadra information for the AI
    const quadraInfo = existingQuadras?.map((q: any) => ({
      name: q.name,
      houseCount: q.houses?.length || 0,
      houseIds: q.houses || [],
    })) || [];

    console.log("Quadra info for analysis:", JSON.stringify(quadraInfo));
    
    const prompt = `Você é um especialista em análise de plantas de loteamentos e condomínios.

Analise esta imagem de planta baixa de um loteamento/condomínio e identifique:
1. A disposição geométrica das quadras/blocos
2. A posição relativa de cada quadra na imagem
3. A orientação das casas dentro de cada quadra (horizontal, vertical ou grade)
4. O número de linhas e colunas de lotes em cada quadra

Quadras existentes no sistema:
${JSON.stringify(quadraInfo, null, 2)}

IMPORTANTE: 
- Analise a ESTRUTURA VISUAL da planta
- Identifique onde cada quadra está posicionada na imagem (percentual de 0 a 100)
- Determine como as casas estão organizadas dentro de cada quadra
- Associe os nomes das quadras existentes com as áreas identificadas na imagem

Responda APENAS com um JSON válido (sem markdown, sem explicações) no seguinte formato:
{
  "quadras": [
    {
      "name": "Quadra A",
      "x": 5,
      "y": 10,
      "width": 30,
      "height": 25,
      "rows": 2,
      "cols": 5,
      "orientation": "horizontal",
      "houses": [
        {"id": 1, "x": 0, "y": 0},
        {"id": 2, "x": 20, "y": 0}
      ]
    }
  ],
  "mapWidth": 100,
  "mapHeight": 100,
  "layout": "grid",
  "success": true
}

Regras:
- x, y, width, height são percentuais (0-100) da área total da imagem
- Para "houses", x e y são percentuais DENTRO da quadra (0-100)
- "rows" e "cols" indicam quantas linhas e colunas de lotes existem na quadra
- "orientation": como os lotes estão dispostos - "horizontal" (lado a lado), "vertical" (empilhados), "grid" (grade)
- Mantenha a mesma quantidade de casas que existe em cada quadra
- Se uma quadra tem 10 casas e está organizada em 2 linhas, seriam 5 colunas
- Distribua as posições das casas uniformemente baseado em rows e cols`;

    console.log("Calling Lovable AI to analyze floor plan with detailed house positions...");

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
                  url: imageBase64,
                },
              },
            ],
          },
        ],
        max_tokens: 4000,
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
    let analysisResult: AnalysisResult;
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
      
      analysisResult = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return a fallback auto-layout
      analysisResult = generateFallbackLayout(quadraInfo);
    }

    // Validate and enhance the result
    if (!analysisResult.quadras || !Array.isArray(analysisResult.quadras)) {
      analysisResult = generateFallbackLayout(quadraInfo);
    }

    // Match detected quadras with existing ones and ensure house positions
    analysisResult.quadras = analysisResult.quadras.map((detectedQuadra, index) => {
      // Find matching quadra from existing data
      let matchingQuadra = quadraInfo.find((q: any) => 
        q.name.toLowerCase().includes(detectedQuadra.name.toLowerCase()) ||
        detectedQuadra.name.toLowerCase().includes(q.name.toLowerCase())
      );
      
      if (!matchingQuadra && index < quadraInfo.length) {
        matchingQuadra = quadraInfo[index];
      }

      const houseIds = matchingQuadra?.houseIds || [];
      const houseCount = houseIds.length;

      // Calculate house positions based on rows/cols or generate them
      let houses: HousePosition[] = [];
      
      if (detectedQuadra.houses && detectedQuadra.houses.length === houseCount) {
        houses = detectedQuadra.houses;
      } else {
        // Generate positions based on detected layout
        const rows = detectedQuadra.rows || Math.ceil(Math.sqrt(houseCount));
        const cols = detectedQuadra.cols || Math.ceil(houseCount / rows);
        
        houses = houseIds.map((id: number, idx: number) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          
          // Calculate position as percentage within quadra
          const xPercent = cols > 1 ? (col / (cols - 1)) * 80 + 10 : 50;
          const yPercent = rows > 1 ? (row / (rows - 1)) * 80 + 10 : 50;
          
          return {
            id,
            x: Math.round(xPercent),
            y: Math.round(yPercent),
          };
        });
      }

      return {
        name: matchingQuadra?.name || detectedQuadra.name,
        x: Math.max(0, Math.min(95, detectedQuadra.x || 0)),
        y: Math.max(0, Math.min(95, detectedQuadra.y || 0)),
        width: Math.max(10, Math.min(50, detectedQuadra.width || 25)),
        height: Math.max(10, Math.min(50, detectedQuadra.height || 25)),
        rows: detectedQuadra.rows || Math.ceil(Math.sqrt(houseCount)),
        cols: detectedQuadra.cols || Math.ceil(houseCount / (detectedQuadra.rows || Math.ceil(Math.sqrt(houseCount)))),
        orientation: detectedQuadra.orientation || "grid",
        houses,
      };
    });

    // Add any missing quadras
    const processedQuadraNames = new Set(analysisResult.quadras.map(q => q.name.toLowerCase()));
    quadraInfo.forEach((q: any, index: number) => {
      if (!processedQuadraNames.has(q.name.toLowerCase())) {
        const row = Math.floor(analysisResult.quadras.length / 3);
        const col = analysisResult.quadras.length % 3;
        
        const houseCount = q.houseIds.length;
        const rows = Math.ceil(Math.sqrt(houseCount));
        const cols = Math.ceil(houseCount / rows);
        
        analysisResult.quadras.push({
          name: q.name,
          x: 5 + col * 32,
          y: 5 + row * 30,
          width: 28,
          height: 25,
          rows,
          cols,
          orientation: "grid",
          houses: q.houseIds.map((id: number, idx: number) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            return {
              id,
              x: cols > 1 ? Math.round((c / (cols - 1)) * 80 + 10) : 50,
              y: rows > 1 ? Math.round((r / (rows - 1)) * 80 + 10) : 50,
            };
          }),
        });
      }
    });

    analysisResult.success = true;
    console.log("Final analysis result:", JSON.stringify(analysisResult, null, 2));

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in analyze-floor-plan:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateFallbackLayout(quadraInfo: any[]): AnalysisResult {
  const quadras: QuadraLayout[] = quadraInfo.map((q, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const houseCount = q.houseIds?.length || 0;
    const rows = Math.ceil(Math.sqrt(houseCount));
    const cols = Math.ceil(houseCount / rows);

    return {
      name: q.name,
      x: 5 + col * 32,
      y: 5 + row * 30,
      width: 28,
      height: 25,
      rows,
      cols,
      orientation: "grid" as const,
      houses: (q.houseIds || []).map((id: number, idx: number) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        return {
          id,
          x: cols > 1 ? Math.round((c / (cols - 1)) * 80 + 10) : 50,
          y: rows > 1 ? Math.round((r / (rows - 1)) * 80 + 10) : 50,
        };
      }),
    };
  });

  return {
    quadras,
    mapWidth: 100,
    mapHeight: 100,
    layout: "grid",
    success: true,
  };
}
