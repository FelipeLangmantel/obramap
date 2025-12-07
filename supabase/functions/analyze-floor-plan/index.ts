import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuadraPosition {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  houseCount: number;
}

interface AnalysisResult {
  quadras: QuadraPosition[];
  mapWidth: number;
  mapHeight: number;
  layout: "horizontal" | "vertical" | "grid";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

    // Prepare the prompt for AI analysis
    const quadraNames = existingQuadras?.map((q: any) => q.name).join(", ") || "Quadras não informadas";
    
    const prompt = `Analise esta imagem de uma planta de loteamento/condomínio.

Quadras existentes no sistema: ${quadraNames}

Sua tarefa:
1. Identifique as quadras/blocos visíveis na planta
2. Determine a posição relativa de cada quadra (percentual da largura e altura total, de 0 a 100)
3. Estime o tamanho relativo de cada quadra
4. Identifique o layout geral (horizontal, vertical ou grid)

Responda APENAS com um JSON válido no seguinte formato (sem markdown, sem explicações):
{
  "quadras": [
    {
      "name": "Quadra A",
      "x": 10,
      "y": 15,
      "width": 25,
      "height": 20,
      "houseCount": 10
    }
  ],
  "mapWidth": 800,
  "mapHeight": 600,
  "layout": "grid"
}

Regras importantes:
- x, y, width, height são percentuais (0-100)
- Tente associar as quadras identificadas com os nomes existentes no sistema
- Se não conseguir identificar claramente, use nomes como "Quadra 1", "Quadra 2", etc.
- O layout pode ser: "horizontal" (quadras lado a lado), "vertical" (quadras empilhadas) ou "grid" (grade mista)
- Posicione as quadras de forma que não se sobreponham
- Mantenha margens de pelo menos 5% entre as quadras`;

    console.log("Calling Lovable AI to analyze floor plan...");

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
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI response:", content);

    // Parse the JSON response
    let analysisResult: AnalysisResult;
    try {
      // Remove markdown code blocks if present
      let cleanedContent = content.trim();
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
      throw new Error("Failed to parse AI analysis result");
    }

    // Validate and normalize the result
    if (!analysisResult.quadras || !Array.isArray(analysisResult.quadras)) {
      analysisResult.quadras = [];
    }

    // Ensure all values are within valid ranges
    analysisResult.quadras = analysisResult.quadras.map((q, index) => ({
      name: q.name || `Quadra ${index + 1}`,
      x: Math.max(0, Math.min(100, q.x || 0)),
      y: Math.max(0, Math.min(100, q.y || 0)),
      width: Math.max(5, Math.min(50, q.width || 20)),
      height: Math.max(5, Math.min(50, q.height || 20)),
      houseCount: q.houseCount || 0,
    }));

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in analyze-floor-plan:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
