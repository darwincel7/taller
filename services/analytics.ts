
import { supabase } from './supabase';
import { DashboardStats, PaymentMethod, OrderStatus } from '../types';

// Extended interface for flattened payments from RPC
export interface FlatPayment {
    payment_id: string;
    id?: string; // Optional, from RPC
    amount: number;
    method: PaymentMethod;
    date: number;
    created_at?: number; // From RPC
    cashier_id: string;
    cashier_name: string;
    is_refund: boolean;
    notes: string;
    order_id: string;
    order_readable_id: number;
    order_model: string;
    order_customer: string;
    order_branch: string;
    closing_id?: string | null; // Added closing_id
    invoice_number?: string | null;
}

/**
 * Fetch payments for a specific date range using a Server-Side RPC.
 * This bypasses the pagination limit of the main OrderContext.
 */
export const fetchGlobalPayments = async (
    startTs: number | null, 
    endTs: number | null, 
    cashierId: string | null = null, 
    branch: string | null = null
): Promise<FlatPayment[]> => {
    if (!supabase) return [];

    try {
        let allPayments: FlatPayment[] = [];

        // 1. Fetch from order_payments
        let opQuery = supabase
            .from('order_payments')
            .select(`
                id,
                order_id,
                amount,
                method,
                cashier_id,
                cashier_name,
                is_refund,
                created_at,
                closing_id,
                orders (
                    currentBranch,
                    readable_id,
                    deviceModel
                )
            `);

        if (startTs) opQuery = opQuery.gte('created_at', startTs);
        if (endTs) opQuery = opQuery.lte('created_at', endTs);
        if (cashierId) opQuery = opQuery.eq('cashier_id', cashierId);

        const { data: opData, error: opError } = await opQuery;

        if (opError) {
            console.error("Error fetching order_payments:", opError);
        } else if (opData) {
            const mappedOp = opData.map((p: any) => {
                const orderBranch = p.orders?.currentBranch || 'T4';
                return {
                    payment_id: p.id,
                    id: p.id,
                    order_id: p.order_id,
                    amount: p.amount,
                    method: p.method as PaymentMethod,
                    cashier_id: p.cashier_id,
                    cashier_name: p.cashier_name,
                    is_refund: p.is_refund,
                    created_at: p.created_at,
                    date: p.created_at,
                    closing_id: p.closing_id,
                    order_branch: orderBranch,
                    branch: orderBranch,
                    order_readable_id: p.orders?.readable_id || 0,
                    order_model: p.orders?.deviceModel || '',
                    order_customer: '',
                    notes: ''
                };
            });
            
            // Filter by branch if provided
            const filteredOp = branch ? mappedOp.filter(p => p.order_branch === branch) : mappedOp;
            allPayments = [...allPayments, ...filteredOp];
        }

        // 2. Fetch from accounting_transactions (Try with new columns first, fallback to old)
        try {
            let atQuery = supabase
                .from('accounting_transactions')
                .select(`
                    id,
                    amount,
                    method,
                    created_by,
                    created_at,
                    closing_id,
                    branch,
                    readable_id,
                    source,
                    status,
                    approval_status,
                    order_id,
                    description
                `)
                .in('source', ['STORE', 'ORDER', 'FLOATING', 'MANUAL']);

            if (cashierId) atQuery = atQuery.eq('created_by', cashierId);
            if (branch) atQuery = atQuery.eq('branch', branch);

            let atData: any[] | null = null;
            let atError: any = null;
            
            const atResult = await atQuery;
            atData = atResult.data;
            atError = atResult.error;

            // Fallback if columns don't exist
            if (atError && atError.message.includes('does not exist')) {
                let fallbackQuery = supabase
                    .from('accounting_transactions')
                    .select(`
                        id,
                        amount,
                        created_by,
                        created_at,
                        source,
                        status,
                        approval_status,
                        order_id,
                        description
                    `)
                    .in('source', ['STORE', 'ORDER', 'FLOATING', 'MANUAL']);
                
                if (cashierId) fallbackQuery = fallbackQuery.eq('created_by', cashierId);
                // Cannot filter by branch in fallback
                
                const fallbackResult = await fallbackQuery;
                atData = fallbackResult.data;
                atError = fallbackResult.error;
            }

            if (!atError && atData) {
                // Filter out STORE transactions that are related to an order (they are already fetched from order_payments)
                // Also filter out REJECTED expenses
                const validAtData = atData.filter((at: any) => {
                    if (at.approval_status === 'REJECTED') return false;
                    
                    if (at.source === 'STORE') {
                        // If it has an order_id, it's an order payment
                        if (at.order_id) return false;
                        // Legacy check: if description indicates it's an order payment or refund
                        if (at.description && (
                            at.description.startsWith('Pago Orden #') || 
                            at.description.startsWith('Devolución de Saldo - Orden #')
                        )) {
                            return false;
                        }
                    }
                    return true;
                });

                const mappedAt = validAtData.map((at: any) => {
                    const ts = new Date(at.created_at).getTime();
                    let orderId = 'GASTO_LOCAL';
                    let orderModel = 'Gasto Local';
                    if (at.source === 'STORE' && at.amount > 0) {
                        orderId = 'PRODUCT_SALE';
                        orderModel = 'Venta Directa';
                    } else if (at.source === 'MANUAL') {
                        orderId = 'MANUAL_TX';
                        orderModel = 'Transacción Manual';
                    }

                    return {
                        payment_id: at.id,
                        id: at.id,
                        order_id: orderId,
                        amount: at.amount,
                        method: (at.method || 'CASH') as PaymentMethod,
                        cashier_id: at.created_by || '',
                        cashier_name: 'Cajero',
                        is_refund: at.amount < 0,
                        created_at: ts,
                        date: ts,
                        closing_id: at.closing_id || null,
                        order_branch: at.branch || 'T4',
                        branch: at.branch || 'T4',
                        order_readable_id: at.readable_id || 0,
                        order_model: orderModel,
                        order_customer: '',
                        notes: ''
                    };
                });

                // Filter by date (since created_at is a string in DB, we filter in JS)
                let filteredAt = mappedAt.filter(p => {
                    if (startTs && p.date < startTs) return false;
                    if (endTs && p.date > endTs) return false;
                    return true;
                });
                
                // If we used fallback, we need to filter by branch here if requested (defaulting to T4)
                if (branch && atError && atError.message?.includes('does not exist')) {
                    filteredAt = filteredAt.filter(p => p.order_branch === branch);
                }

                allPayments = [...allPayments, ...filteredAt];
            }
        } catch (e) {
            console.error("Error fetching accounting_transactions:", e);
        }

        // 3. Fetch from floating_expenses (Try with new columns first, fallback to old)
        try {
            let feQuery = supabase
                .from('floating_expenses')
                .select(`
                    id,
                    amount,
                    created_by,
                    created_at,
                    closing_id,
                    readable_id,
                    approval_status
                `);

            if (cashierId) feQuery = feQuery.eq('created_by', cashierId);

            let feData: any[] | null = null;
            let feError: any = null;
            
            const feResult = await feQuery;
            feData = feResult.data;
            feError = feResult.error;
            
            // Fallback if columns don't exist
            if (feError && feError.message.includes('does not exist')) {
                let fallbackQuery = supabase
                    .from('floating_expenses')
                    .select(`
                        id,
                        amount,
                        created_by,
                        created_at,
                        approval_status
                    `);
                
                if (cashierId) fallbackQuery = fallbackQuery.eq('created_by', cashierId);
                
                const fallbackResult = await fallbackQuery;
                feData = fallbackResult.data;
                feError = fallbackResult.error;
            }

            if (!feError && feData) {
                const validFeData = feData.filter((fe: any) => fe.approval_status !== 'REJECTED');
                const mappedFe = validFeData.map((fe: any) => {
                    const ts = new Date(fe.created_at).getTime();
                    return {
                        payment_id: fe.id,
                        id: fe.id,
                        order_id: 'GASTO_FLOTANTE',
                        amount: -Math.abs(fe.amount),
                        method: 'CASH' as PaymentMethod,
                        cashier_id: fe.created_by || '',
                        cashier_name: 'Gasto Flotante',
                        is_refund: true,
                        created_at: ts,
                        date: ts,
                        closing_id: fe.closing_id,
                        order_branch: 'T4', // Default branch for floating expenses
                        branch: 'T4',
                        order_readable_id: fe.readable_id || 0,
                        order_model: 'Gasto Flotante',
                        order_customer: '',
                        notes: ''
                    };
                });

                // Filter by date and branch
                const filteredFe = mappedFe.filter(p => {
                    if (startTs && p.date < startTs) return false;
                    if (endTs && p.date > endTs) return false;
                    if (branch && p.order_branch !== branch) return false;
                    return true;
                });

                allPayments = [...allPayments, ...filteredFe];
            }
        } catch (e) {
            console.error("Error fetching floating_expenses:", e);
        }

        // Sort all payments by date descending
        allPayments.sort((a, b) => b.date - a.date);

        return allPayments;
    } catch (e) {
        console.error("Exception fetching payments:", e);
        return [];
    }
};

/**
 * Fetch accurate Dashboard Stats directly from DB
 */
export const fetchRealDashboardStats = async (): Promise<DashboardStats> => {
    const empty: DashboardStats = { 
        total: 0, priorities: 0, pending: 0, inRepair: 0, repaired: 0, returned: 0, storeStock: 0, 
        totalRevenue: 0, totalExpenses: 0, totalProfit: 0, revenueByBranch: { t1: 0, t4: 0 } 
    };

    if (!supabase) return empty;

    try {
        // Try V2 RPC first
        const { data, error } = await supabase.rpc('get_dashboard_stats_v2');
        
        if (!error && data) {
            return {
                ...empty,
                total: data.total,
                pending: data.pending,
                inRepair: data.inRepair,
                storeStock: data.storeStock,
                totalRevenue: data.revenue, // Historic Total
                // Add ephemeral fields if needed by UI
            };
        }
        
        // Fallback to V1 or empty
        return empty;
    } catch (e) {
        console.error("Stats fetch error:", e);
        return empty;
    }
};

/**
 * Get daily revenue for charts (Last 7 days)
 * Uses direct efficient querying instead of loading all orders
 */
export const fetchRevenueChartData = async () => {
    if (!supabase) return [];
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startTs = sevenDaysAgo.getTime();

    const { data } = await supabase
        .from('orders')
        .select('finalPrice, completedAt')
        .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
        .gte('completedAt', startTs);

    if (!data) return [];

    // Group locally
    const grouped: Record<string, number> = {};
    data.forEach((o: any) => {
        if (!o.completedAt) return;
        const dateKey = new Date(o.completedAt).toLocaleDateString('es-ES', { weekday: 'short' });
        grouped[dateKey] = (grouped[dateKey] || 0) + (o.finalPrice || 0);
    });

    return Object.entries(grouped).map(([name, total]) => ({ name, total }));
};

export const fetchAdvancedDashboardData = async () => {
    if (!supabase) return null;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekTs = startOfWeek.getTime();
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    // Fetch last 6 months for comparison
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();

    try {
        // 1. Fetch Sales (Actual Payments)
        const { data: paymentsData } = await supabase.rpc('get_payments_flat', {
            p_start: sixMonthsAgo,
            p_end: now.getTime(),
            p_cashier_id: null,
            p_branch: null
        });

        const sales = paymentsData || [];
        
        // 2. Fetch Flow (All Orders created or completed in the last 6 months)
        const { data: flowData } = await supabase
            .from('orders')
            .select('createdAt, completedAt, status')
            .or(`createdAt.gte.${sixMonthsAgo},completedAt.gte.${sixMonthsAgo}`);

        const flow = flowData || [];

        // --- SALES CALCULATIONS (From Payments) ---
        const daySales = sales.filter((s: any) => s.created_at >= startOfToday && !s.is_refund).reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
        const daySalesT1 = sales.filter((s: any) => s.created_at >= startOfToday && !s.is_refund && s.branch === 'T1').reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
        const daySalesT4 = sales.filter((s: any) => s.created_at >= startOfToday && !s.is_refund && s.branch === 'T4').reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
        
        const weekSales = sales.filter((s: any) => s.created_at >= startOfWeekTs && !s.is_refund).reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
        const monthSales = sales.filter((s: any) => s.created_at >= startOfMonth && !s.is_refund).reduce((acc: number, s: any) => acc + (s.amount || 0), 0);

        // Historical Sales (Previous months)
        const historicalSales = [];
        for (let i = 1; i <= 5; i++) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            const mSales = sales.filter((s: any) => s.created_at >= mStart && s.created_at < mEnd && !s.is_refund).reduce((acc: number, s: any) => acc + (s.amount || 0), 0);
            historicalSales.push({ 
                month: new Date(mStart).toLocaleDateString('es-ES', { month: 'short' }), 
                total: mSales 
            });
        }

        // --- FLOW CALCULATIONS (IN vs OUT) ---
        const getFlow = (start: number) => ({
            in: flow.filter(f => f.createdAt >= start).length,
            out: flow.filter(f => f.completedAt && f.completedAt >= start && [OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(f.status as OrderStatus)).length
        });

        const dayFlow = getFlow(startOfToday);
        const weekFlow = getFlow(startOfWeekTs);
        const monthFlow = getFlow(startOfMonth);

        // Historical Flow
        const historicalFlow = [];
        for (let i = 1; i <= 5; i++) {
            const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            historicalFlow.push({
                month: new Date(mStart).toLocaleDateString('es-ES', { month: 'short' }),
                in: flow.filter(f => f.createdAt >= mStart && f.createdAt < mEnd).length,
                out: flow.filter(f => f.completedAt && f.completedAt >= mStart && f.completedAt < mEnd && [OrderStatus.REPAIRED, OrderStatus.RETURNED].includes(f.status as OrderStatus)).length
            });
        }

        // --- PROJECTION LOGIC ---
        const hoursInDay = 24;
        const currentHour = now.getHours() + (now.getMinutes() / 60);
        const dayFactor = currentHour > 0 ? hoursInDay / currentHour : 1;
        
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDayOfMonth = (now.getDate() - 1) + (currentHour / 24);
        const monthFactor = currentDayOfMonth > 0 ? daysInMonth / currentDayOfMonth : 1;
        
        let currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
        let daysPassedInWeek = currentDayOfWeek === 0 ? 7 : currentDayOfWeek; // 1 to 7
        daysPassedInWeek = (daysPassedInWeek - 1) + (currentHour / 24);
        const weekFactor = daysPassedInWeek > 0 ? 7 / daysPassedInWeek : 1;

        return {
            sales: {
                day: { current: daySales, projected: daySales * dayFactor, t1: daySalesT1, t4: daySalesT4 } as { current: number, projected: number, t1: number, t4: number },
                week: { current: weekSales, projected: weekSales * weekFactor },
                month: { current: monthSales, projected: monthSales * monthFactor },
                history: historicalSales.reverse()
            },
            flow: {
                day: { in: dayFlow.in, out: dayFlow.out, inProjected: dayFlow.in * dayFactor, outProjected: dayFlow.out * dayFactor },
                week: { in: weekFlow.in, out: weekFlow.out, inProjected: weekFlow.in * weekFactor, outProjected: weekFlow.out * weekFactor },
                month: { in: monthFlow.in, out: monthFlow.out, inProjected: monthFlow.in * monthFactor, outProjected: monthFlow.out * monthFactor },
                history: historicalFlow.reverse()
            }
        };
    } catch (e) {
        console.error("Error fetching advanced dashboard data:", e);
        return null;
    }
};

export const fetchTechnicianLeaderboard = async () => {
    if (!supabase) return [];

    const now = new Date();
    const day = now.getDate();
    let startTs: number;
    let endTs: number;

    // Determine current fortnight (1-15 or 16-End)
    if (day <= 15) {
        startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        endTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime() - 1;
    } else {
        startTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime();
        // End of month
        endTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
    }

    try {
        // Fetch orders completed in this range with points
        const { data } = await supabase
            .from('orders')
            .select('pointsAwarded, pointsSplit, assignedTo, completedAt')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startTs)
            .lte('completedAt', endTs);

        if (!data) return [];

        const techPoints: Record<string, number> = {};

        data.forEach((order: any) => {
            // Handle Split Points
            if (order.pointsSplit) {
                const split = typeof order.pointsSplit === 'string' ? JSON.parse(order.pointsSplit) : order.pointsSplit;
                
                if (split.primaryTechId) {
                    techPoints[split.primaryTechId] = (techPoints[split.primaryTechId] || 0) + (Number(split.primaryPoints) || 0);
                }
                if (split.secondaryTechId) {
                    techPoints[split.secondaryTechId] = (techPoints[split.secondaryTechId] || 0) + (Number(split.secondaryPoints) || 0);
                }
            } 
            // Handle Single Tech Points
            else if (order.assignedTo && order.pointsAwarded) {
                techPoints[order.assignedTo] = (techPoints[order.assignedTo] || 0) + Number(order.pointsAwarded);
            }
        });

        // Convert to array and sort
        return Object.entries(techPoints)
            .map(([techId, points]) => ({ techId, points }))
            .sort((a, b) => b.points - a.points);
            
    } catch (e) {
        console.error("Error fetching technician leaderboard:", e);
        return [];
    }
};

export const fetchTechnicianPerformance = async () => {
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from('orders')
            .select('id, assignedTo, createdAt, completedAt, status, history')
            .not('assignedTo', 'is', null);

        if (!data) return [];

        const techStats: Record<string, { total: number, success: number, totalTime: number, countWithTime: number }> = {};

        data.forEach((order: any) => {
            const techId = order.assignedTo;
            if (!techStats[techId]) {
                techStats[techId] = { total: 0, success: 0, totalTime: 0, countWithTime: 0 };
            }

            techStats[techId].total++;
            if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.REPAIRED) {
                techStats[techId].success++;
            }

            if (order.createdAt && order.completedAt) {
                const timeDiff = order.completedAt - order.createdAt;
                techStats[techId].totalTime += timeDiff;
                techStats[techId].countWithTime++;
            }
        });

        return Object.entries(techStats).map(([techId, stats]) => ({
            techId,
            successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
            avgResponseTime: stats.countWithTime > 0 ? stats.totalTime / stats.countWithTime : 0,
            totalOrders: stats.total
        })).sort((a, b) => b.successRate - a.successRate);
    } catch (e) {
        console.error("Error fetching technician performance:", e);
        return [];
    }
};

export const fetchWarrantyReport = async () => {
    if (!supabase) return [];

    try {
        const { data } = await supabase
            .from('orders')
            .select('id, assignedTo, orderType, relatedOrderId')
            .or(`orderType.eq.Garantía Externa,relatedOrderId.not.is.null`);

        if (!data) return [];

        const techWarranties: Record<string, { total: number, warranties: number }> = {};

        // We also need total orders per tech to calculate percentage
        const { data: allOrders } = await supabase
            .from('orders')
            .select('assignedTo')
            .not('assignedTo', 'is', null);

        (allOrders || []).forEach((o: any) => {
            if (!techWarranties[o.assignedTo]) techWarranties[o.assignedTo] = { total: 0, warranties: 0 };
            techWarranties[o.assignedTo].total++;
        });

        data.forEach((order: any) => {
            if (order.assignedTo) {
                if (!techWarranties[order.assignedTo]) techWarranties[order.assignedTo] = { total: 0, warranties: 0 };
                techWarranties[order.assignedTo].warranties++;
            }
        });

        return Object.entries(techWarranties).map(([techId, stats]) => ({
            techId,
            warrantyRate: stats.total > 0 ? (stats.warranties / stats.total) * 100 : 0,
            totalWarranties: stats.warranties,
            totalOrders: stats.total
        })).sort((a, b) => b.warrantyRate - a.warrantyRate);
    } catch (e) {
        console.error("Error fetching warranty report:", e);
        return [];
    }
};

export const fetchTopModels = async () => {
    if (!supabase) return [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    try {
        const { data } = await supabase
            .from('orders')
            .select('deviceModel')
            .gte('createdAt', startOfMonth);

        if (!data) return [];

        const modelCounts: Record<string, number> = {};
        data.forEach((o: any) => {
            const model = o.deviceModel || 'Desconocido';
            modelCounts[model] = (modelCounts[model] || 0) + 1;
        });

        return Object.entries(modelCounts)
            .map(([model, count]) => ({ model, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
    } catch (e) {
        console.error("Error fetching top models:", e);
        return [];
    }
};

export const fetchProfitabilityData = async () => {
    if (!supabase) return [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    try {
        const { data } = await supabase
            .from('orders')
            .select('deviceModel, finalPrice, expenses, partsCost')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startOfMonth);

        if (!data) return [];

        const modelProfit: Record<string, { revenue: number, costs: number, count: number }> = {};

        data.forEach((o: any) => {
            const model = o.deviceModel || 'Desconocido';
            if (!modelProfit[model]) modelProfit[model] = { revenue: 0, costs: 0, count: 0 };
            
            const expenses = typeof o.expenses === 'string' ? JSON.parse(o.expenses) : (o.expenses || []);
            const expensesTotal = Array.isArray(expenses) ? expenses.reduce((acc: number, e: any) => acc + (e.amount || 0), 0) : 0;
            const totalCosts = (o.partsCost || 0) + expensesTotal;

            modelProfit[model].revenue += (o.finalPrice || 0);
            modelProfit[model].costs += totalCosts;
            modelProfit[model].count++;
        });

        return Object.entries(modelProfit).map(([model, stats]) => ({
            model,
            avgRevenue: stats.revenue / stats.count,
            avgCost: stats.costs / stats.count,
            margin: stats.revenue > 0 ? ((stats.revenue - stats.costs) / stats.revenue) * 100 : 0,
            count: stats.count
        })).sort((a, b) => a.margin - b.margin); // Sort by lowest margin first for analysis
    } catch (e) {
        console.error("Error fetching profitability data:", e);
        return [];
    }
};

export const fetchTechnicianPointsDetails = async (techId: string) => {
    if (!supabase) return [];

    const now = new Date();
    const day = now.getDate();
    let startTs: number;
    let endTs: number;

    // Determine current fortnight (1-15 or 16-End)
    if (day <= 15) {
        startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        endTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime() - 1;
    } else {
        startTs = new Date(now.getFullYear(), now.getMonth(), 16).getTime();
        // End of month
        endTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
    }

    try {
        const { data } = await supabase
            .from('orders')
            .select('*')
            .in('status', [OrderStatus.REPAIRED, OrderStatus.RETURNED])
            .gte('completedAt', startTs)
            .lte('completedAt', endTs);

        if (!data) return [];

        const techOrders: any[] = [];

        data.forEach((order: any) => {
            let pointsForTech = 0;
            if (order.pointsSplit) {
                const split = typeof order.pointsSplit === 'string' ? JSON.parse(order.pointsSplit) : order.pointsSplit;
                if (split.primaryTechId === techId) {
                    pointsForTech = Number(split.primaryPoints) || 0;
                }
                if (split.secondaryTechId === techId) {
                    pointsForTech += Number(split.secondaryPoints) || 0;
                }
            } else if (order.assignedTo === techId && order.pointsAwarded) {
                pointsForTech = Number(order.pointsAwarded);
            }

            if (pointsForTech > 0) {
                techOrders.push({
                    ...order,
                    earnedPoints: pointsForTech
                });
            }
        });

        return techOrders.sort((a: any, b: any) => b.completedAt - a.completedAt);
    } catch (e) {
        console.error("Error fetching technician points details:", e);
        return [];
    }
};
