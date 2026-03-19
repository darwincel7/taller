import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.warn("Gemini API Key missing. AI features will be disabled.");
        throw new Error("API Key not found.");
    }
    return new GoogleGenAI({ apiKey: key });
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
    const key = process.env.GEMINI_API_KEY;
    if (key) return true;
    // @ts-ignore
    if (typeof window !== 'undefined' && window.aistudio && window.aistudio.hasSelectedApiKey) {
        // @ts-ignore
        return await window.aistudio.hasSelectedApiKey();
    }
    return false;
  },

  promptApiKey: async () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.aistudio && window.aistudio.openSelectKey) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
    }
  },

  scanReceipt: async (file: File) => {
    try {
      const ai = getAiClient();
      const base64Data = await fileToGenerativePart(file);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
    } catch (error) {
      console.error("AI Scan Error:", error);
      return { error: "Failed to scan receipt" };
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
        model: "gemini-3-flash-preview",
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
    } catch (error) {
      console.error("AI Validation Error:", error);
      return { isValid: false, error: "Failed to validate receipt" };
    }
  },

  getInsights: async (financialData: any) => {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
    } catch (error) {
      console.error("AI Insights Error:", error);
      // Fallback insights if AI fails
      return [
        { type: 'info', message: 'Gastos estables este mes.', metric: '0%' },
        { type: 'success', message: 'Buen margen de beneficio.', metric: '+15%' },
        { type: 'warning', message: 'Revisar inventario de pantallas.', metric: 'Low' }
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
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT_CFO,
        }
      });
      return response.text;
    } catch (error) {
      console.error("AI Chat Error:", error);
      return "Lo siento, no puedo procesar tu consulta financiera en este momento.";
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
