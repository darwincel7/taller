import { supabase } from './supabase';
import { RepairOrder, Payment, User, OrderStatus, LogType } from '../types';

// ! CRITICAL DELIVERY MODULE - DO NOT MODIFY WITHOUT REVIEW

export const finalizeDelivery = async (
    order: RepairOrder,
    payments: Payment[],
    currentUser: User,
    addPayments: (orderId: string, payments: Payment[]) => Promise<void>,
    recordOrderLog: (id: string, actionType: string, message: string, metadata?: any, logType?: LogType, userName?: string) => Promise<void>
): Promise<RepairOrder> => {
    console.log("--- INICIO FINALIZAR ENTREGA (RPC TRANSACTION) ---");

    // 1. Preparar Logs de Pagos (Replicando lógica de addPayments para el historial)
    const paymentLogs = payments.map(p => {
        let logNote = "";
        let logType: LogType = 'SUCCESS';
        let actionType = 'PAYMENT_ADDED';
        
        if (p.method === 'CREDIT') { 
            logNote = `📝 CRÉDITO: $${Math.abs(p.amount)}`; 
            logType = 'WARNING'; 
            actionType = 'CREDIT_ADDED';
        } 
        else if (p.amount < 0 || p.isRefund) { 
            logNote = `💸 REEMBOLSO: -$${Math.abs(p.amount)}`; 
            logType = 'DANGER'; 
            actionType = 'REFUND_PROCESSED';
        } 
        else { 
            logNote = `💰 PAGO ${p.method}: $${Math.abs(p.amount)}`; 
        }
        
        return { 
            date: new Date().toISOString(), 
            status: order.status, 
            note: logNote, 
            technician: p.cashierName, 
            logType,
            action_type: actionType,
            metadata: { amount: p.amount, method: p.method, paymentId: p.id }
        };
    });

    // 2. Preparar Log de Entrega
    const paymentDetails = payments.map(p => `${p.method}: $${p.amount}`).join(', ');
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

    const deliveryLog = {
        date: new Date().toISOString(),
        status: OrderStatus.RETURNED,
        note: `Orden entregada por ${currentUser.name}. Pago: ${paymentDetails} (Total: $${totalPaid})`,
        technician: currentUser.name,
        logType: 'SUCCESS' as LogType,
        action_type: 'ORDER_DELIVERED',
        metadata: { totalPaid, deliveredBy: currentUser.id }
    };

    const allNewLogs = [...paymentLogs, deliveryLog];

    // 3. Llamar a RPC Transaccional
    const { data, error } = await supabase.rpc('finalize_delivery_transaction', {
        p_order_id: order.id,
        p_new_payments: payments,
        p_history_logs: allNewLogs,
        p_completed_at: Date.now()
    });

    if (error) {
        console.error("RPC Error in finalizeDelivery:", error);
        throw new Error(`Error en transacción de entrega: ${error.message}`);
    }

    if (!data || data.length === 0) {
        throw new Error("Error: La transacción no devolvió la orden actualizada.");
    }

    console.log("--- ENTREGA FINALIZADA EXITOSAMENTE (RPC) ---");
    return data[0] as RepairOrder;
};
