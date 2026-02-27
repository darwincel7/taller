
import { supabase } from './supabase';
import { RepairOrder, NotificationResponse, OrderStatus, OrderType } from '../types';

/**
 * Servicio de Notificaciones Híbrido
 * Intenta enviar vía API (Automático) primero.
 * Si falla o no está configurado, hace fallback a WhatsApp Web (Manual).
 */

const formatPhoneNumber = (phone: string): string => {
    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');
    
    // Validar longitud básica (ej. RD es 10 dígitos)
    // Si no tiene código de país, asumir RD (1) + 809/829/849
    if (cleaned.length === 10) {
        return `1${cleaned}`;
    }
    
    return cleaned;
};

const getStatusMessage = (order: RepairOrder, status: OrderStatus): string => {
    const base = `Hola ${order.customer.name}, actualización sobre tu equipo ${order.deviceModel} (Orden #${order.id}):\n\n`;
    
    switch (status) {
        case OrderStatus.PENDING:
            return `${base}Hemos recibido tu equipo. Está pendiente de revisión. Te avisaremos pronto.`;
        case OrderStatus.DIAGNOSIS:
            return `${base}Tu equipo está en proceso de diagnóstico técnico.`;
        case OrderStatus.WAITING_APPROVAL:
            return `${base}Ya tenemos el diagnóstico. Por favor contáctanos para aprobar la reparación.`;
        case OrderStatus.IN_REPAIR:
            return `${base}La reparación ha comenzado. Estamos trabajando en ello.`;
        case OrderStatus.REPAIRED:
            return `${base}¡Buenas noticias! Tu equipo está REPARADO y listo. Total a pagar: $${order.finalPrice || order.estimatedCost}.`;
        case OrderStatus.RETURNED:
            return `${base}Gracias por confiar en Darwin's Taller. Tu equipo ha sido entregado.`;
        default:
            return `${base}Estado actualizado a: ${status}.`;
    }
};

export const sendWhatsAppNotification = async (
    order: RepairOrder, 
    status: OrderStatus,
    customMessage?: string
): Promise<NotificationResponse> => {
    
    // GUARD CLAUSE: Do NOT send notifications for Store Stock (Recibidos)
    // These are internal items owned by the shop, no client to notify.
    if (order.orderType === OrderType.STORE) {
        return { success: true, method: 'API' }; // Return success to avoid errors in UI
    }

    const phone = formatPhoneNumber(order.customer.phone);
    const message = customMessage || getStatusMessage(order, status);

    if (phone.length < 10) {
        return { success: false, method: 'MANUAL', error: "Número de teléfono inválido" };
    }

    try {
        // 1. INTENTO AUTOMÁTICO (Supabase Edge Function)
        // Solo intentar si Supabase está configurado
        if (supabase) {
            const { data, error } = await supabase.functions.invoke('send-whatsapp', {
                body: { phone, message }
            });

            if (error || !data?.success) {
                // Falla silenciosa para pasar al fallback
                console.warn("API Error (or function not deployed):", error);
            } else {
                return { success: true, method: 'API' };
            }
        }

    } catch (error) {
        console.warn("Fallo envío automático, usando método manual:", error);
    }

    // 2. FALLBACK MANUAL (WhatsApp Web)
    // Si el servidor falla o no existe, abrimos la ventana
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    
    const newWindow = window.open(url, '_blank');
    
    if (newWindow) {
        return { success: true, method: 'MANUAL' };
    } else {
        return { success: false, method: 'MANUAL', error: "Ventana emergente bloqueada" };
    }
};
