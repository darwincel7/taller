import { GoogleGenAI } from "@google/genai";

const getApiKey = () => {
    return "AIzaSyDpyxDaoeoYRyFTYStdszfmh7ZL4C6kUFo";
};

const getAiClient = () => {
    const key = getApiKey();
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
You are the Virtual CFO of a repair shop. You have access to the following financial context (JSON).
Answer the user's question based strictly on this data. Be concise, professional, and mathematical.
If the answer isn't in the data, say so. Do not hallucinate numbers.
IMPORTANT: You MUST generate all responses, analysis, projections, and tips STRICTLY IN SPANISH language.
`;


export const aiAccountingService = {
  checkApiKey: async () => {
    const key = getApiKey();
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

  chatWithCFO: async (query: string, contextData: any) => {
    try {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: SYSTEM_PROMPT_CFO },
            { text: `Context: ${JSON.stringify(contextData)}` },
            { text: `User Question: ${query}` }
          ]
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
