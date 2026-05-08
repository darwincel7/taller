
import { GoogleGenAI, Type } from "@google/genai";
import { RepairOrder, ChatMessage } from "../types";
import { supabase } from "./supabase";

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
                    // Throw as simple string instead of object to prevent stack traces showing in AI Studio
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

    // Only log non-quota errors to avoid console spam when quota is exceeded
    if (e?.status === 429 || e?.error?.code === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota")) {
        return "Has excedido tu cuota de uso de la API de Gemini. Por favor, verifica tu plan y detalles de facturación en https://ai.google.dev/gemini-api/docs/rate-limits.";
    }
    // Changed to console.warn so it doesn't trigger AI Studio strict error catchers
    console.warn("Gemini API Error Details:", e);
    return `Error comunicándose con la IA: ${errorMsg}`;
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
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] }
        });
        return response.text || "No se pudo generar consejo.";
    } catch (e) {
        return handleGeminiError(e);
    }
};

// --- NEW: VOICE NOTES ---
export const transcribeAudio = async (base64Audio: string): Promise<string> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }, // Gemini supports standard audio containers
                    { text: "Transcribe this technical audio note to Spanish text exactly as spoken. Ignore background noise." }
                ]
            }
        });
        return response.text?.trim() || "";
    } catch (e) {
        return handleGeminiError(e);
    }
};

export interface ExtractedArticle {
  description: string;
  amount: number;
}

export interface ExtractedInvoice {
  invoiceNumber: string | null;
  vendor: string | null;
  articles: ExtractedArticle[];
}

export const urlToBase64 = async (url: string): Promise<{ base64: string, mimeType: string }> => {
  let blob: Blob;

  if (url.includes('supabase.co/storage/v1/object/public/')) {
    const parts = url.split('/');
    const fileName = parts.pop();
    const bucket = parts.pop();
    
    if (bucket && fileName) {
      const { data, error } = await supabase.storage.from(bucket).download(fileName);
      if (error) {
        throw new Error(`Error al descargar la imagen de Supabase: ${error.message}`);
      }
      blob = data;
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Error al descargar la imagen: ${response.statusText}`);
      blob = await response.blob();
    }
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error al descargar imagen: ${response.statusText}`);
    blob = await response.blob();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const resultStr = reader.result as string;
      const mimeType = resultStr.split(';')[0].split(':')[1] || 'image/jpeg';
      const base64 = resultStr.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeInvoiceImage = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedInvoice | null> => {
    try {
        const ai = getAiClient();
        const prompt = `
        Analiza esta imagen de una factura o recibo de punto de venta (POS) de forma detallada.
        Extrae la siguiente información:
        1. Número de factura (invoiceNumber): Busca el número de factura, recibo, ticket o código de transacción. Si no hay, retorna null.
        2. Proveedor (vendor): El nombre del comercio, tienda, empresa o proveedor que emite la factura. Si no se encuentra, retorna null.
        3. Artículos (articles): EXTRACCIÓN Y DESGLOSE OBLIGATORIO DE CADA ARTÍCULO FÍSICO COMPRADO.
           - Tienes que crear un elemento en el array por CADA UNA de las líneas o artículos visibles (repuestos, piezas, herramientas, comida, etc).
           - Para cada uno, extrae su descripción textual exacta (description) y el precio total cobrado por dicho artículo (amount).
           - ⚡ REGLA DURA SOBRE GASTOS EXTRAS: NO registres conceptos de "Delivery", "Envío", "Propina", "Transporte", "Service Fee" o similares como artículos separados.
           - En caso de que exista un cobro por envío/delivery, toma su valor numérico y SÚMALO directamente al 'amount' del **PRIMER ARTÍCULO** de tu lista extraída.
           - Ejemplo de regla: Si ves [Pantalla a $100], [Batería a $50] y [Envío a $20]. El JSON resultante debe tener SOLO dos artículos: [Pantalla a $120] y [Batería a $50].
           - Matemáticamente, la suma estricta de todos los 'amount' extraídos en el array (ya fusionado el envío) DEBE SER IGUAL al "Monto Total Pagado" o "Total de la Factura".
           - Ignora por completo pagos de clientes como "Su Efectivo", "Su Vuelto", "Su Cambio", etc. Céntrate en mercancía consumada.
           - OBLIGATORIO: Si no encuentras artículos o la foto es borrosa, crea al menos 1 artículo genérico llamado "Gasto/Consumo" con el valor de 0 o el valor total que deduzcas. NUNCA DEVES RETORNAR UN ARRAY VACÍO [].
        
        Actúa como un OCR contable preciso. Debes obligatoriamente devolver un JSON con esta estructura exacta.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType, data: base64Image } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        invoiceNumber: { type: Type.STRING, description: "Número de factura o recibo. Null si no se encuentra.", nullable: true },
                        vendor: { type: Type.STRING, description: "Nombre del proveedor o comercio. Null si no se encuentra.", nullable: true },
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

        let jsonStr = response.text?.trim();
        if (!jsonStr) return null;
        
        // Find JSON block if it exists (robust extraction)
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) {
            jsonStr = match[0];
        } else {
            jsonStr = jsonStr.replace(/```json\n?|\n?```/g, '');
            jsonStr = jsonStr.replace(/```\n?|\n?```/g, '');
        }
        
        return JSON.parse(jsonStr);
    } catch (e) {
        const msg = handleGeminiError(e);
        throw new Error(msg);
    }
};

export const analyzeImageForOrder = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "Extract the Order ID (Number/Code) from this image. If found, return ONLY the ID string. If not found, return 'NOT_FOUND'." }
        ]
      }
    });
    const text = response.text?.trim();
    return text === 'NOT_FOUND' ? null : text || null;
  } catch (error: any) {
    const msg = handleGeminiError(error);
    throw new Error(msg);
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
        const model = 'gemini-2.5-flash'; 

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
        const msg = handleGeminiError(e);
        throw new Error(msg);
    }
};

export const analyzeProfitability = async (profitabilityData: any[]): Promise<string> => {
    try {
        const ai = getAiClient();
        const prompt = `Actúa como un consultor financiero y estratega de negocios experto para un taller de reparación de celulares ("Darwin's Taller").
    
    A continuación, te presento los datos de rentabilidad por modelo de este mes. 
    IMPORTANTE: Estos datos YA EXCLUYEN los equipos "Recibidos" (de otras tiendas) y las "Garantías", por lo que reflejan ÚNICAMENTE las reparaciones reales y ventas directas del taller que generan ingresos.
    
    Datos de rentabilidad:
    ${JSON.stringify(profitabilityData)}
    
    Por favor, redacta un análisis ejecutivo, directo y altamente accionable (máximo 3 párrafos) en español que incluya:
    1. **Diagnóstico de Márgenes:** Identifica claramente qué modelos están generando pérdidas (márgenes negativos) o ganancias muy bajas, y cuáles son los más rentables.
    2. **Estrategia de Precios:** Sugiere ajustes de precios específicos y realistas basados en los datos (ej. "Aumentar el precio de reparación de pantalla del iPhone 13 en un 15% para recuperar margen").
    3. **Control de Costos:** Señala si detectas costos de repuestos o gastos operativos inusualmente altos en modelos específicos que estén mermando la ganancia, y sugiere cómo optimizarlos.
    
    Tu tono debe ser profesional, analítico y enfocado en maximizar la rentabilidad del negocio. Evita saludos genéricos, ve directo al análisis.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview', // Upgrade to pro for better analysis
            contents: { parts: [{ text: prompt }] }
        });
        return response.text || "No se pudo generar el análisis.";
    } catch (e) {
        return handleGeminiError(e);
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
      cost: o.totalAmount ?? (o.finalPrice || o.estimatedCost),
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
      model: 'gemini-2.5-flash',
      contents: contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 }
    });

    return response.text;
  } catch (error) {
    return handleGeminiError(error);
  }
};
