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
        let logType: LogType = LogType.SUCCESS;
        let actionType = 'PAYMENT_ADDED';
        
        if (p.method === 'CREDIT') { 
            logNote = `📝 CRÉDITO: $${Math.abs(p.amount)}`; 
            logType = LogType.WARNING; 
            actionType = 'CREDIT_ADDED';
        } 
        else if (p.amount < 0 || p.isRefund) { 
            logNote = `💸 REEMBOLSO: -$${Math.abs(p.amount)}`; 
            logType = LogType.DANGER; 
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
    const paymentDetails = payments.length > 0 ? payments.map(p => `${p.method}: $${p.amount}`).join(', ') : 'N/A';
    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

    const deliveryLog = {
        date: new Date().toISOString(),
        status: OrderStatus.RETURNED,
        note: payments.length > 0 
            ? `Orden entregada por ${currentUser.name}. Pago: ${paymentDetails} (Total: $${totalPaid})`
            : `Equipo entregado a tienda por ${currentUser.name}.`,
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

    // 4. Sync JSONB array in orders table (since RPC doesn't do it)
    const updatedOrder = data[0] as RepairOrder;
    const allPayments = [...(order.payments || []), ...payments];
    const { error: syncError } = await supabase.from('orders').update({ payments: allPayments }).eq('id', order.id);
    if (syncError) {
        console.error("Error syncing JSONB payments after delivery:", syncError);
    }
    
    // 5. Update closing_id for the newly inserted payments (since the old RPC doesn't do it)
    if (payments.length > 0) {
        for (const p of payments) {
            if (p.closingId) {
                await supabase.from('order_payments')
                    .update({ closing_id: p.closingId })
                    .eq('id', p.id);
            }
        }
    }

    updatedOrder.payments = allPayments;

    console.log("--- ENTREGA FINALIZADA EXITOSAMENTE (RPC) ---");
    return updatedOrder;
};
