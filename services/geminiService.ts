
import { GoogleGenAI, Type } from "@google/genai";
import { RepairOrder, ChatMessage } from "../types";

/* Fix: The API key must be obtained exclusively from the environment variable process.env.API_KEY. */
const getApiKey = () => {
    try {
        // @ts-ignore
        if (typeof process !== 'undefined' && process.env && process.env.API_KEY) return process.env.API_KEY;
        // @ts-ignore
        if (import.meta && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
    } catch (e) {}
    return '';
};

// Lazy initialization wrapper
const getAiClient = () => {
    const key = getApiKey();
    if (!key) throw new Error("API Key not found. Please configure VITE_GEMINI_API_KEY.");
    return new GoogleGenAI({ apiKey: key });
};

const SYSTEM_INSTRUCTION = `
ROLE & PERSONA:
You are "Darwin", the warm, empathetic, and highly helpful virtual assistant for "Darwin's Taller".
LANGUAGE: Spanish.
Your goal is to help technicians and clients understand the status of repairs.
Always refer to orders by their numeric ID (readableId) if available.
`;

// --- NEW: TECH COPILOT ---
export const getTechnicalAdvice = async (model: string, issue: string): Promise<string> => {
    try {
        const ai = getAiClient();
        const prompt = `Actúa como un técnico experto en reparación de celulares.
    Modelo: ${model}
    Falla Reportada: ${issue}
    
    Provee una lista breve y numerada de:
    1. Causas probables (del más común al menos).
    2. Pasos de diagnóstico recomendados.
    3. Piezas que probablemente necesiten reemplazo.
    
    Mantén el tono técnico pero directo.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] }
        });
        return response.text || "No se pudo generar consejo.";
    } catch (e) {
        console.error(e);
        return "Error consultando al copiloto (Verifique API Key).";
    }
};

// --- NEW: VOICE NOTES ---
export const transcribeAudio = async (base64Audio: string): Promise<string> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }, // Gemini supports standard audio containers
                    { text: "Transcribe this technical audio note to Spanish text exactly as spoken. Ignore background noise." }
                ]
            }
        });
        return response.text?.trim() || "";
    } catch (e) {
        console.error(e);
        return "Error en transcripción";
    }
};

export const analyzeImageForOrder = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Extract the Order ID (Number/Code) from this image. If found, return ONLY the ID string. If not found, return 'NOT_FOUND'." }
        ]
      }
    });
    const text = response.text?.trim();
    return text === 'NOT_FOUND' ? null : text || null;
  } catch (error) {
    console.error("Error analyzing image:", error);
    return null;
  }
};

/**
 * ANALISIS DE VIDEO POR FOTOGRAMAS
 * Recibe un array de imágenes (frames) en base64 en lugar de un video pesado.
 */
export const analyzeVideoForIntake = async (frameImages: string[]): Promise<any> => {
    try {
        const ai = getAiClient();
        // Usamos el modelo Flash Preview que soporta múltiples imágenes rápidamente y es muy preciso con texto (IMEI)
        const model = 'gemini-3-flash-preview'; 

        const prompt = `
        Analiza estas imágenes capturadas de un video de un dispositivo en recepción.
        Extrae la siguiente información con ALTA PRECISIÓN.

        PRIORIDAD CRÍTICA:
        1. IMEI: Busca un número de EXACTAMENTE 15 DÍGITOS numéricos.
        2. ALMACENAMIENTO (GB): Busca la capacidad (ej. 64GB, 128GB).
        3. COLOR: El color visible del chasis.
        4. DETALLES VISUALES: Describe rayones, golpes, estado de la pantalla.
        5. FOTO EVIDENCIA: Indica el índice (0 al ${frameImages.length - 1}) de la imagen que muestre CLARAMENTE LA PARTE TRASERA DEL DISPOSITIVO (Tapa trasera y módulo de cámaras). ESTO ES CRITICO. Queremos la foto de atrás del teléfono.

        OTROS DATOS:
        6. MODELO: Marca y modelo exacto.
        7. FALLA: Si hay mensaje de error en pantalla, descríbelo.
        8. ACCESORIOS: Funda, cargador, etc.

        Retorna un JSON exacto.
        `;

        // Convertir cada frame en una parte para la API
        const parts: any[] = frameImages.map(img => ({
            inlineData: { mimeType: 'image/jpeg', data: img }
        }));
        
        // Agregar el prompt al final
        parts.push({ text: prompt });

        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        deviceModel: { type: Type.STRING },
                        deviceCondition: { type: Type.STRING, description: "Observaciones visuales detalladas" },
                        deviceIssue: { type: Type.STRING },
                        accessories: { type: Type.STRING },
                        imei: { type: Type.STRING, description: "15 digit numeric IMEI" },
                        color: { type: Type.STRING },
                        storage: { type: Type.STRING, description: "Capacity in GB" },
                        bestFrameIndex: { type: Type.INTEGER, description: "Index of the image showing the BACK of the device (Cameras/Rear Case) best (0-based)" }
                    },
                    required: ["deviceModel", "deviceCondition", "deviceIssue", "imei", "storage", "color", "bestFrameIndex"]
                }
            }
        });
        
        const jsonStr = response.text?.trim();
        if (!jsonStr) return null;
        
        return JSON.parse(jsonStr);

    } catch (e: any) {
        console.error("Error en Gemini Video Analysis:", e);
        throw new Error("Error analizando las imágenes. Intenta enfocar mejor el equipo.");
    }
};

export const chatWithDarwin = async (
  currentMessage: string, 
  orders: RepairOrder[], 
  imageContext?: string,
  history: ChatMessage[] = []
) => {
  try {
    const ai = getAiClient();
    // Use the provided orders directly. The caller (UI) is responsible for filtering relevant items.
    // This allows searching by readable_id which might not match UUID logic.
    const relevantOrders = orders;

    const ordersContext = JSON.stringify(relevantOrders.map(o => ({
      id: o.id,
      readableId: o.readable_id || o.id.replace('INV-', ''), // Explicit readable ID for context
      customer: o.customer.name,
      device: o.deviceModel,
      issue: o.deviceIssue,
      status: o.status,
      cost: o.finalPrice || o.estimatedCost,
      notes: o.technicianNotes,
      condition: o.deviceCondition,
      deadline: o.deadline ? new Date(o.deadline).toLocaleString('es-ES') : 'Sin fecha',
      paid: (o.payments || []).reduce((sum, p) => sum + p.amount, 0)
    })));

    const databaseContextMsg = `
    [FECHA ACTUAL]: ${new Date().toLocaleString('es-ES')}
    [DATOS DEL SISTEMA]: ${relevantOrders.length > 0 ? ordersContext : "No se encontraron órdenes específicas en el contexto actual."} 
    [FIN DATOS]
    `;

    const contents: any[] = [];
    contents.push({ role: 'user', parts: [{ text: databaseContextMsg }] });
    contents.push({ role: 'model', parts: [{ text: "Entendido. Tengo los datos." }] });

    const recentHistory = history.slice(0, -1).slice(-6); 
    recentHistory.forEach(msg => {
        if (msg.id === 'welcome') return;
        contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] });
    });

    const currentParts: any[] = [{ text: currentMessage }];
    if (imageContext) {
      currentParts.unshift({ inlineData: { mimeType: 'image/jpeg', data: imageContext } });
    }
    
    contents.push({ role: 'user', parts: currentParts });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 }
    });

    return response.text;
  } catch (error) {
    console.error("Error chatting with Darwin:", error);
    return "Lo siento, tengo problemas conectando con el servidor.";
  }
};
