import { supabase } from './supabase';
import { RepairOrder, Payment, User, OrderStatus, LogType, OrderType } from '../types';

// ! CRITICAL DELIVERY MODULE - DO NOT MODIFY WITHOUT REVIEW

export const finalizeDelivery = async (
    order: RepairOrder,
    payments: Payment[],
    currentUser: User,
    addPayments: (orderId: string, payments: Payment[]) => Promise<void>,
    recordOrderLog: (id: string, actionType: string, message: string, metadata?: any, logType?: LogType, userName?: string) => Promise<void>
): Promise<RepairOrder> => {
    console.log("--- INICIO FINALIZAR ENTREGA (RPC TRANSACTION) ---");

    // 1. Si es orden de STORE, mover a inventario antes de finalizar (o durante)
    if (order.orderType === OrderType.STORE) {
        try {
            console.log("Transfiriendo Orden STORE a inventario automáticamente...");
            // Traer inventario actual para revisar si ya existe
            const { data: invData } = await supabase.from('inventory_parts').select('*');
            const inventory = invData || [];
            
            // Revisa si ya fue transferido
            const alreadyExists = inventory.some(i => {
                try {
                    const c = JSON.parse(i.category || '{}');
                    return c.workshopOrderId === order.id;
                } catch(e) { return false; }
            });

            if (alreadyExists) {
                console.log("El equipo STORE ya existe en inventario. Saltando transferencia...");
            } else {
                let product = inventory.find(p => p.name.toLowerCase() === order.deviceModel.toLowerCase() && p.category?.includes('STORE_PRODUCT'));
                
                if (!product) {
                const attributes = inventory.filter(i => {
                    try { return JSON.parse(i.category || '{}').type === 'STORE_ATTRIBUTE'; } catch(e) { return false; }
                });
                const categoryCelularesId = attributes.find(a => JSON.parse(a.category || '{}').subType === 'CATEGORY' && a.name.toLowerCase().includes('celular'))?.id || 'OTHER';
                const providerRecibidoId = attributes.find(a => JSON.parse(a.category || '{}').subType === 'PROVIDER' && a.name.toLowerCase().includes('recibido'))?.id || 'OTHER';
                const brandPendienteId = attributes.find(a => JSON.parse(a.category || '{}').subType === 'BRAND' && a.name.toLowerCase().includes('pendiente'))?.id || 'OTHER';
                
                const newProductCategory = JSON.stringify({
                    type: 'STORE_PRODUCT',
                    description: order.deviceModel,
                    legacyCategory: order.deviceModel,
                    brandId: brandPendienteId,
                    categoryId: categoryCelularesId,
                    providerId: providerRecibidoId
                });
                
                // Get next readable item
                let maxId = 999;
                for (const row of inventory) {
                    try {
                        const c = JSON.parse(row.category || '{}');
                        if (c.readable_id && c.readable_id > maxId) maxId = c.readable_id;
                    } catch(e) {}
                }
                
                const prodPayload = {
                    name: order.deviceModel,
                    stock: 0,
                    min_stock: 0,
                    cost: order.purchaseCost || order.estimatedCost || 0,
                    price: order.targetPrice || order.purchaseCost || 0,
                    category: JSON.stringify({...JSON.parse(newProductCategory), readable_id: maxId + 1})
                };
                
                const { data: insertedProd } = await supabase.from('inventory_parts').insert([prodPayload]).select().single();
                if (insertedProd) {
                    product = insertedProd;
                } else {
                    product = prodPayload as any;
                }
            }

            const costSpentInExpenses = order.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
            const totalCost = (order.purchaseCost || order.estimatedCost || 0) + costSpentInExpenses;
            
            const newItemCategoryObj = {
                type: 'STORE_ITEM',
                parentId: product!.id,
                imei: order.imei || '',
                status: 'PENDING_ACCEPTANCE',
                branch: currentUser.branch || 'T4',
                workshopOrderId: order.id,
                oldImageUrl: order.devicePhoto,
                imageUrl: order.devicePhoto,
                history: [
                    {
                        action: 'TRANSFERENCIA DESDE TALLER',
                        date: new Date().toISOString(),
                        user: currentUser.name,
                        details: `Equipo finalizado en taller (Orden #${order.readable_id || order.id.slice(-4)}). Se transfiere a inventario para revisión física y alta definitiva.`
                    }
                ]
            };
            
            // Get Readable ID for item
            let itemMaxId = 999;
            const { data: invUpdateData } = await supabase.from('inventory_parts').select('category');
            for (const row of invUpdateData || []) {
                try {
                    const c = JSON.parse(row.category || '{}');
                    if (c.readable_id && c.readable_id > itemMaxId) itemMaxId = c.readable_id;
                } catch(e) {}
            }
            (newItemCategoryObj as any).readable_id = itemMaxId + 1;

            const finalItem = {
                name: order.deviceModel || 'Equipo Transferido',
                stock: 1,
                min_stock: 0,
                cost: totalCost,
                price: order.targetPrice || totalCost || 0,
                category: JSON.stringify(newItemCategoryObj)
            };

            const { error: insertError } = await supabase.from('inventory_parts').insert([finalItem]);
            if (insertError) {
               console.warn("No se pudo transferir equipo de STORE a inventario:", insertError);
            } else {
               console.log("Equipo de STORE transferido exitosamente al inventario.");
            }
         } // <-- Close the else block here
        } catch (err) {
            console.error("Error catched during STORE inventory transfer logic:", err);
        }
    }

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

    // Ensure all payments explicitly use numeric dates for the RPC postgres bigint cast!
    const rpcPayments = payments.map(p => ({
        ...p,
        date: typeof p.date === 'string' ? new Date(p.date).getTime() : (p.date || Date.now())
    }));

    // 3. Llamar a RPC Transaccional
    const { data, error } = await supabase.rpc('finalize_delivery_transaction', {
        p_order_id: order.id,
        p_new_payments: rpcPayments,
        p_history_logs: allNewLogs,
        p_completed_at: Date.now()
    });

    if (error) {
        console.warn("RPC Error in finalizeDelivery:", error);
        throw new Error(`Error en transacción de entrega: ${error.message}`);
    }

    if (!data || data.length === 0) {
        throw new Error("Error: La transacción no devolvió la orden actualizada.");
    }

    // 4. Sync JSONB array and status in orders table (to ensure status updates immediately)
    const updatedOrder = data[0] as RepairOrder;
    const allPayments = [...(order.payments || []), ...payments];
    const { error: syncError } = await supabase.from('orders').update({ 
        payments: allPayments,
        status: OrderStatus.RETURNED,
        returnDate: new Date().toISOString()
    }).eq('id', order.id);
    
    if (syncError) {
        console.warn("Error syncing JSONB payments and status after delivery:", syncError);
    }
    
    updatedOrder.status = OrderStatus.RETURNED;
    updatedOrder.returnDate = new Date().toISOString();
    
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
