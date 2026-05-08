
import { supabase } from './supabase';
import { RepairOrder, NotificationResponse, OrderStatus, OrderType } from '../types';
import { toast } from 'sonner';
import React from 'react';
import { generateInvoiceImage } from './invoiceService';

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
  </svg>
);

/**
 * Servicio de Notificaciones Automático
 * Envía notificaciones de WhatsApp de manera silenciosa y autónoma.
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
    const orderNum = order.readable_id || order.id.slice(-4);
    const device = order.deviceModel;
    const customer = order.customer.name;
    const total = order.totalAmount ?? (order.finalPrice || order.estimatedCost || 0);
    
    // Check if it's an approved return
    if (status === OrderStatus.REPAIRED && order.returnRequest?.status === 'APPROVED') {
        const reason = order.returnRequest.reason || 'No se pudo completar la reparación';
        return `Hola ${customer}, te informamos que tu ${device} no ha podido ser reparado y está listo para ser devuelto. Motivo: ${reason}. El costo por revisión/diagnóstico es de $${total}. Por favor, pasa a retirarlo cuando gustes. (Orden #${orderNum})`;
    }

    switch (status) {
        case OrderStatus.PENDING:
            return `¡Hola ${customer}! 👋 Hemos recibido tu ${device} en Darwin's Taller. Ya está en nuestra lista para revisión. Te avisaremos en cuanto tengamos noticias. ¡Gracias por tu confianza! (Orden #${orderNum})`;
        case OrderStatus.DIAGNOSIS:
            return `Hola ${customer}, te informamos que tu ${device} ya está en manos de nuestros técnicos para su diagnóstico detallado. Te mantendremos al tanto. (Orden #${orderNum})`;
        case OrderStatus.WAITING_APPROVAL:
            return `¡Buenas noticias, ${customer}! Ya tenemos listo el diagnóstico de tu ${device}. Por favor, comunícate con nosotros para explicarte los detalles y aprobar la reparación. (Orden #${orderNum})`;
        case OrderStatus.IN_REPAIR:
            return `Te cuento que ya hemos comenzado con la reparación de tu ${device}. Estamos trabajando para dejártelo como nuevo lo antes posible. 🛠️ (Orden #${orderNum})`;
        case OrderStatus.REPAIRED:
            return `¡Excelente noticia, ${customer}! 🎉 Tu ${device} ya está listo y esperándote en el taller. El total a pagar es de $${total}. ¡Puedes pasar por él cuando gustes! (Orden #${orderNum})`;
        case OrderStatus.RETURNED:
            return `¡Hola ${customer}! Muchas gracias por elegir a Darwin's Taller. Esperamos que estés muy conforme con la reparación de tu ${device}. Aquí tienes un resumen de tu servicio:\n\n--- DETALLE DE SERVICIO ---\nOrden: #${orderNum}\nEquipo: ${device}\nServicio: ${order.deviceIssue}\nTotal: $${total}\n---------------------------\n\n¡Cualquier cosa que necesites, aquí estamos! 👋`;
        default:
            return `Hola ${customer}, te informamos que tu equipo ${device} ha cambiado al estado: ${status}. (Orden #${orderNum})`;
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

    // Generate invoice image for PENDING and RETURNED statuses
    let invoiceImage: string | null = null;
    if (status === OrderStatus.PENDING || status === OrderStatus.RETURNED) {
        try {
            invoiceImage = await generateInvoiceImage(order);
        } catch (err) {
            console.warn("Failed to generate invoice image:", err);
        }
    }

    if (phone.length < 10) {
        toast.error('Número de teléfono inválido', {
            icon: React.createElement(WhatsAppIcon, { className: 'w-5 h-5 text-red-500' }),
            description: `No se pudo enviar WhatsApp a ${order.customer.name}`
        });
        return { success: false, method: 'API', error: "Número de teléfono inválido" };
    }

    try {
        // 1. INTENTO AUTOMÁTICO (Backend API)
        const response = await fetch('/api/notifications/whatsapp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone,
                message,
                orderId: order.id,
                image: invoiceImage
            })
        });

        if (!response.ok) {
            const text = await response.text();
            let errorMsg = `Error del servidor: ${response.status}`;
            try {
                const errorData = JSON.parse(text);
                if (errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (e) {
                console.warn("HTTP Error:", response.status, text);
            }
            throw new Error(errorMsg);
        }

        const result = await response.json();

        if (result.success) {
            toast.success('Mensaje de WhatsApp enviado', {
                icon: React.createElement(WhatsAppIcon, { className: 'w-5 h-5 text-green-500' }),
                description: `Notificación enviada a ${order.customer.name}`
            });
            return { success: true, method: 'API' };
        }
        
        console.warn("Backend API Error:", result.error);
        throw new Error(result.error || "Error al enviar mensaje");

    } catch (error: any) {
        console.warn("Fallo envío automático vía Backend:", error);
        
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

        toast.error('Error al enviar WhatsApp automático', {
            icon: React.createElement(WhatsAppIcon, { className: 'w-5 h-5 text-red-500' }),
            duration: 10000,
            description: (
                <div className="mt-2">
                    <p className="text-xs mb-2">
                        {error.message?.includes('WhatsApp not connected') 
                            ? 'WhatsApp no está conectado. Por favor, ve a Configuración > WhatsApp y vuelve a escanear el código QR para reconectar.' 
                            : error.message || 'Hubo un problema técnico al enviar el mensaje.'}
                    </p>
                </div>
            )
        });

        return { success: false, method: 'API', error: error.message };
    }
};
