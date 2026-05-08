import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
    // Return a mock of GoogleGenAI that intercepts generateContent and routes it through our backend
    return {
        models: {
            generateContent: async (params: any) => {
                const res = await fetch('/api/gemini/generateContent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params)
                });
                const data = await res.json();
                if (!res.ok) {
                    const errMsg = data.fault || data.error || data.details?.message || "Failed to generate content";
                    throw errMsg;
                }
                // data.text will contain the generated text from the server
                return { text: data.text };
            }
        }
    };
};

export const handleGeminiError = (e: any): string => {
    let errorMsg = e?.message || e?.toString() || "";
    
    // Handle nested error object from Gemini API
    if (e?.error) {
        errorMsg = e.error.message || errorMsg;
        if (e.error.status) errorMsg += ` [${e.error.status}]`;
        if (e.error.code) errorMsg += ` (${e.error.code})`;
    }

    if (e?.status === 429 || e?.error?.code === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
        return "Has excedido tu cuota de uso de la API de Gemini. Por favor, verifica tu plan y detalles de facturación en https://ai.google.dev/gemini-api/docs/rate-limits.";
    }
    console.warn("Gemini Accounting API Error:", e);
    return `Error comunicándose con la IA: ${errorMsg}`;
};

const SYSTEM_PROMPT_OCR = `
You are an expert AI Accountant. Analyze this receipt/invoice image and extract the following data in strict JSON format:
- amount (number)
- date (YYYY-MM-DD)
- vendor (string)
- description (string, brief)
- category (string, strictly one of: 'Sueldos', 'Compras', 'Gastos Fijos', 'Gastos Variables')
- invoice_number (string, null if not found. Look for Folio, Ticket, Receipt Number, Invoice #)
- confidence (number, 0-1)

If the image is not a receipt, return { "error": "Not a receipt" }.
Output ONLY raw JSON.
`;

const SYSTEM_PROMPT_INSIGHTS = `
You are a Financial Analyst for a repair shop. Analyze the provided monthly financial summary JSON.
Generate exactly 3 short, actionable insights/tips in JSON format:
[
  { "type": "success" | "warning" | "info", "message": "...", "metric": "+20% vs prev month" }
]
Keep messages under 15 words. Focus on cash flow, expense anomalies, or growth.
IMPORTANT: You MUST generate all responses, analysis, projections, and tips STRICTLY IN SPANISH language.
`;

const SYSTEM_PROMPT_CFO = `
Eres el CFO Virtual (Director Financiero) de un taller de reparación. Tienes acceso al contexto financiero en formato JSON, que incluye KPIs, flujo de caja, distribución de gastos y el historial completo de transacciones (ingresos y gastos).

Tus responsabilidades:
1. Responder cualquier pregunta financiera basándote en los números actuales.
2. Actuar como un líder financiero coherente: dar buenos consejos, realizar proyecciones y estimaciones matemáticas basadas en la tendencia de los datos actuales. No te limites solo a reportar lo que hay, sino también proyecta hacia el futuro de forma inteligente.
3. Si el usuario pide información, análisis o un número específico de un día o varios días en específico, DEBES buscar en el historial de transacciones (transactions) y desglosar cada número en su lugar, exactamente como se te ordene.
4. Formatea tus respuestas utilizando Markdown para que sean fáciles de leer: usa párrafos separados, listas con viñetas, negritas para resaltar números importantes o conceptos clave, y encabezados si es necesario.
5. Sé profesional, analítico y claro.
6. Si la respuesta no está en los datos, dilo. No inventes transacciones que no existen.
7. DEBES generar todas tus respuestas ESTRICTAMENTE EN ESPAÑOL.
8. IMPORTANTE: Diferencia claramente entre "Gastos Operativos" (gastos sin retorno directo como luz, alquiler, nómina) e "Inversión Inventario" o "Compras" (mercancía adquirida para la venta que representa un activo recuperable). El Beneficio Operativo se calcula restando los Gastos Operativos de los Ingresos, sin incluir las Compras de Inventario.
`;


export const aiAccountingService = {
  checkApiKey: async () => {
    return true; // Configured in backend
  },

  promptApiKey: async () => {
    // Replaced by backend config
  },

  scanReceipt: async (file: File) => {
    try {
      const ai = getAiClient();
      const base64Data = await fileToGenerativePart(file);
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { 
              inlineData: { 
                mimeType: file.type, 
                data: base64Data 
              } 
            },
            { text: SYSTEM_PROMPT_OCR }
          ]
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      // Robust JSON extraction
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      
      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      const msg = handleGeminiError(error);
      return { error: msg };
    }
  },

  validateReceiptForExpense: async (file: File, expectedAmount: number) => {
    try {
      const ai = getAiClient();
      const base64Data = await fileToGenerativePart(file);
      
      const prompt = `
        You are an expert AI Accountant. Analyze this receipt/invoice image.
        We are looking for a specific expense of exactly $${Math.abs(expectedAmount)}.
        Does this receipt contain an item, total, or subtotal that matches this amount?
        Return strict JSON:
        {
          "isValid": boolean,
          "foundAmount": number (the matching amount found, or null),
          "reason": "Brief explanation of where it was found or why it wasn't"
        }
        Output ONLY raw JSON.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { 
              inlineData: { 
                mimeType: file.type, 
                data: base64Data 
              } 
            },
            { text: prompt }
          ]
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      
      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      const msg = handleGeminiError(error);
      return { isValid: false, error: msg };
    }
  },

  getInsights: async (financialData: any) => {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: SYSTEM_PROMPT_INSIGHTS },
            { text: `Financial Data: ${JSON.stringify(financialData)}` }
          ]
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      const jsonMatch = text.match(/\[[\s\S]*\]/); // Insights are an array
      if (!jsonMatch) throw new Error("No JSON array found in response");
      
      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      const msg = handleGeminiError(error);
      console.warn("AI Insights Issue:", msg);
      // Fallback insights if AI fails
      return [
        { type: 'info', message: msg, metric: 'Error' },
        { type: 'warning', message: 'No se pudieron cargar los insights.', metric: 'N/A' }
      ];
    }
  },

  chatWithCFO: async (query: string, contextData: any, chatHistory: {role: string, content: string}[] = []) => {
    try {
      const ai = getAiClient();
      
      const contents: any[] = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));

      contents.push({
        role: 'user',
        parts: [
          { text: `[CONTEXTO FINANCIERO ACTUAL (JSON)]\n${JSON.stringify(contextData)}\n\n[CONSULTA DEL USUARIO]\n${query}` }
        ]
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT_CFO,
        }
      });
      return response.text;
    } catch (error: any) {
      return handleGeminiError(error);
    }
  }
};

// Helper to convert File to Base64
async function fileToGenerativePart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
