
import { GoogleGenAI, Type } from "@google/genai";
import { RepairOrder, ChatMessage } from "../types";

// Lazy initialization wrapper
const getAiClient = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("API Key not found.");
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

export interface ExtractedArticle {
  description: string;
  amount: number;
}

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  articles: ExtractedArticle[];
}

export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeInvoiceImage = async (base64Image: string): Promise<ExtractedInvoice | null> => {
    try {
        const ai = getAiClient();
        const prompt = `
        Analiza esta imagen de una factura o recibo de forma detallada.
        Extrae la siguiente información:
        1. Número de factura (invoiceNumber): Busca un número de factura, recibo o código de facturación. Si no hay, retorna null.
        2. Artículos (articles): Una lista completa de TODOS los artículos o servicios comprados que aparecen en la factura.
           - Para cada artículo, extrae la descripción exacta (description) y el monto/precio total de ese artículo (amount).
           - ¡IMPORTANTE! Debes desglosar la factura. Si hay 5 artículos, debes devolver 5 objetos en la lista de artículos.
           - ¡IMPORTANTE! Pon especial énfasis en identificar costos de "combustible", "delivery", "envío", "mensajería" o "transporte".
           - Si encuentras un costo de combustible/delivery/envío, DEBES SUMAR ese monto al precio del PRIMER artículo de la lista, y NO crear un artículo separado para el envío.
           - Si solo hay un artículo de envío y nada más, entonces sí déjalo como un artículo.
           - Si hay múltiples artículos, suma el costo de envío al primer artículo.
        
        Retorna un JSON exacto que refleje fielmente cada ítem de la factura para que el cajero solo tenga que revisar y aceptar.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        invoiceNumber: { type: Type.STRING, description: "Número de factura o recibo. Null si no se encuentra." },
                        articles: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    amount: { type: Type.NUMBER }
                                },
                                required: ["description", "amount"]
                            }
                        }
                    },
                    required: ["articles"]
                }
            }
        });

        const jsonStr = response.text?.trim();
        if (!jsonStr) return null;
        
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Error analyzing invoice:", e);
        return null;
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

export const analyzeProfitability = async (profitabilityData: any[]): Promise<string> => {
    try {
        const ai = getAiClient();
        const prompt = `Actúa como un consultor de negocios experto para un taller de reparación de celulares.
    Analiza los siguientes datos de rentabilidad por modelo de este mes:
    ${JSON.stringify(profitabilityData)}
    
    Provee un reporte breve (máximo 3 párrafos) en español que:
    1. Identifique los modelos con menor margen de ganancia.
    2. Sugiera ajustes de precios específicos (ej. "Sube un 10% en iPhone 13").
    3. Mencione si algún costo está siendo inusualmente alto.
    
    Usa un tono profesional y accionable.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] }
        });
        return response.text || "No se pudo generar el análisis.";
    } catch (e) {
        console.error(e);
        return "Error generando análisis de rentabilidad.";
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
