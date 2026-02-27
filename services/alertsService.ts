
import { supabase } from './supabase';
import { RepairOrder, OrderStatus, UserRole } from '../types';

export const fetchActionRequiredOrders = async (
    userRole: UserRole, 
    userId: string, 
    branch: string
): Promise<RepairOrder[]> => {
    if (!supabase) return [];

    try {
        // 1. Construir query base (OR conditions)
        // Traemos TODO lo que podría ser una alerta, luego filtramos en memoria
        // para aplicar la lógica fina de roles.
        const conditions = [
            'approvalAckPending.eq.true',             // Cliente aprobó
            'transferStatus.eq.PENDING',              // Traslado
            'pointRequest->>status.eq.PENDING',       // Puntos
            'returnRequest->>status.eq.PENDING',      // Devolución
            'externalRepair->>status.eq.PENDING',     // Salida Externa
            'techMessage->pending.eq.true',           // Mensaje Técnico
            `pending_assignment_to.eq.${userId}`,     // Asignación directa (siempre visible al user)
            'status.eq.Esperando Aprobación',         // Presupuesto
            'isValidated.eq.false'                    // Validación Ingreso
        ];

        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .or(conditions.join(','))
            .neq('status', 'Cancelado')
            .order('createdAt', { ascending: true });

        if (error) throw error;
        
        const allOrders = data as RepairOrder[];

        // 2. Filtrado estricto en memoria según reglas solicitadas
        return allOrders.filter(order => {
            // Regla Global: ADMIN ve todo (excepto techMessage ajenos si se quisiera, pero la regla dice "ADMIN ya NO debe verla")
            // Sin embargo, la regla 1 dice: "QUIÉN NO LO VE: ADMIN ya NO debe verla".
            // Así que aplicaremos reglas específicas por TIPO de alerta, no solo por rol global.

            // --- 1) techMessage (Mensaje al técnico) ---
            if (order.techMessage?.pending) {
                // QUIÉN LO VE: SOLO el técnico asignado.
                // QUIÉN NO LO VE: ADMIN, MONITOR, CASHIER, otros técnicos.
                if (order.assignedTo === userId) return true;
                // Si tiene otra alerta activa (ej. traslado), ¿debería verse? 
                // La lógica actual mezcla alertas. Si una orden tiene mensaje Y traslado, 
                // el técnico ve el mensaje, el admin ve el traslado.
                // Si NO soy el técnico, ignoro la parte de mensaje. 
                // Pero si la orden tiene OTRA alerta que SÍ me toca, debo ver la orden.
                // Por tanto, no retornamos 'false' inmediatamente, sino que chequeamos si hay OTRA razón para verla.
            }

            // Para decidir si MOSTRAR la orden en el panel, debe cumplir AL MENOS UNA condición de visibilidad.
            
            const isMyBranch = order.currentBranch === branch;
            const isAdmin = userRole === UserRole.ADMIN;

            // Chequeo de cada tipo de alerta posible en la orden:

            // A. techMessage
            if (order.techMessage?.pending) {
                if (order.assignedTo === userId) return true; 
                // Si no soy el asignado, esta alerta específica no es para mí.
            }

            // B. WAITING_APPROVAL (Presupuesto Pendiente)
            if (order.status === OrderStatus.WAITING_APPROVAL) {
                // QUIÉN LO VE: ADMIN + MONITOR + CASHIER de la sucursal.
                // QUIÉN NO LO VE: TECHNICIAN.
                if (userRole === UserRole.TECHNICIAN) {
                    // Técnico nunca ve esto.
                } else {
                    // Admin global o Staff de la sucursal
                    if (isAdmin || isMyBranch) return true;
                }
            }

            // C. approvalAckPending (Cliente Aprobó / Confirmar Lectura)
            if (order.approvalAckPending) {
                // QUIÉN LO VE: SOLO el técnico asignado.
                if (order.assignedTo === userId) return true;
            }

            // D. transferStatus (Traslado Entrante)
            if (order.transferStatus === 'PENDING') {
                // QUIÉN LO VE: MONITOR + TECHNICIAN + CASHIER de la sucursal de DESTINO, y ADMIN global.
                // Nota: La query original ya filtra por branch, pero aquí reforzamos.
                if (isAdmin) return true;
                if (order.transferTarget === branch) return true;
            }

            // E. pending_assignment_to (Solicitud de Traspaso)
            if (order.pending_assignment_to === userId) {
                // SIEMPRE visible al usuario destino.
                return true;
            }

            // F. returnRequest (Devolución Pendiente)
            if (order.returnRequest?.status === 'PENDING') {
                // QUIÉN LO VE: ADMIN/MONITOR de la sucursal (asumimos lógica actual para roles admin/monitor)
                // El PDF no especifica roles exactos, dice "ADMIN/MONITOR según reglas actuales".
                // Asumimos que técnicos no aprueban devoluciones.
                if (userRole !== UserRole.TECHNICIAN && (isAdmin || isMyBranch)) return true;
            }

            // G. pointRequest (Solicitud de Puntos) - Lógica existente
            if (order.pointRequest?.status === 'PENDING') {
                // Solo Admin/Monitor
                if ((userRole === UserRole.ADMIN || userRole === UserRole.MONITOR) && (isAdmin || isMyBranch)) return true;
            }

            // H. externalRepair (Salida Externa) - Lógica existente
            if (order.externalRepair?.status === 'PENDING') {
                if (userRole !== UserRole.TECHNICIAN && (isAdmin || isMyBranch)) return true;
            }

            // I. isValidated (Validar Ingreso) - Lógica existente
            if (order.isValidated === false) {
                if (userRole !== UserRole.TECHNICIAN && (isAdmin || isMyBranch)) return true;
            }

            // Si no cumplió ninguna regla de visibilidad personal, no mostrar.
            return false;
        });

    } catch (e) {
        console.error("Error fetching alerts:", e);
        return [];
    }
};

export const fetchOverdueOrders = async (branch: string): Promise<RepairOrder[]> => {
    if (!supabase) return [];

    try {
        const now = Date.now();
        
        // Criterio Vencido: Deadline pasado Y NO finalizado (Entregado/Cancelado/Reparado)
        // NOTA: Excluimos 'Reparado' porque técnicamente el trabajo de taller terminó, aunque falte entregar.
        // Si la regla de negocio cambia, quitar 'Reparado' de la lista.
        
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .lt('deadline', now) // Vencido
            .not('status', 'in', `("${OrderStatus.RETURNED}","Cancelado","Reparado")`) // No finalizado
            .eq('currentBranch', branch) // Solo mi sucursal
            .order('deadline', { ascending: true }) // Los más vencidos primero
            .limit(100);

        if (error) throw error;
        return data as RepairOrder[];

    } catch (e) {
        console.error("Error fetching overdue:", e);
        return [];
    }
};
